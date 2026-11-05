import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ProgressBudget } from '../context.mjs';
import { stateDir } from '../config.mjs';
import { contextSummary } from './context-summary.mjs';
import { acquireExecution } from './workflow-coordination.mjs';
import {readProjectMemory,projectMemoryPart} from './project-memory.mjs';
import {latestFileActivity} from './file-activity.mjs';
import {randomUUID} from 'node:crypto';
export function safeMessages(messages) {
  return messages.slice(-100).map(m=>({id:m.info?.id,role:m.info?.role,failed:!!m.info?.error,parts:(m.parts||[]).flatMap(p=>{
    if(p.type==='text'&&!p.synthetic)return [{type:'text',text:typeof p.text==='string'?p.text.slice(0,16000):''}];
    if(p.type==='tool')return [{type:'tool',tool:p.tool,status:p.state?.status||'pending',title:p.state?.title||p.tool,output:typeof p.state?.output==='string'?p.state.output.slice(0,12000):'',exit:p.state?.metadata?.exit,command:p.tool==='bash'?p.state?.input?.command:undefined}];
    // Upstream projects compaction as a marker part. Keep the marker and its
    // auto flag only; the summary text stays in OpenCode's history.
    if(p.type==='compaction')return [{type:'compaction',auto:p.auto===true}];
    return [];
  })}));
}
export function toolChanges(messages) {
  // OpenCode's session summary may lag or be absent. Reuse its completed tool
  // patches rather than implementing a second diff engine or retaining prompts.
  return messages.flatMap(m=>(m.parts||[]).flatMap(p=>{
    if(p.type!=='tool'||p.state?.status!=='completed')return [];
    const d=p.state.metadata?.filediff;
    if(d?.file&&typeof d.patch==='string')return [{file:d.file,patch:d.patch.slice(0,60000),additions:d.additions,deletions:d.deletions}];
    if(p.tool==='write'&&typeof p.state.input?.filePath==='string'&&typeof p.state.input?.content==='string')return [{file:p.state.input.filePath,after:p.state.input.content.slice(0,30000),snapshot:true}];
    return [];
  })).filter(d=>!/(^|[\\/])\.env/.test(d.file));
}
export function createTasks(engine,projects,{sessionFile=join(stateDir,'sessions.json'),deadlineMs=120000,pollMs=1000,coordinateProject=false} = {}) {
  const file=sessionFile;let sessions=existsSync(file)?JSON.parse(readFileSync(file)):[];
  // Pending inputs survive restart, but restarting the app never executes them.
  for(const s of sessions)if(s.queue?.length){s.queuePaused=true;for(const item of s.queue)if(item.state==='dispatching')item.state='uncertain';}
  const runs=new Map(),observations=new Map(),snapshots=new Map();let polling=false;
  const singleFlight=(map,id,fn)=>{if(map.has(id))return map.get(id);const pending=Promise.resolve().then(fn).finally(()=>map.delete(id));map.set(id,pending);return pending;};
  const releaseRun=run=>{run.seen.clear();run.budget=null;clearTimeout(run.timer);run.timer=null;run.detach?.();run.release?.();run.release=null;};
  const save=()=>writeFileSync(file,JSON.stringify(sessions),{mode:0o600});
  const get=id=>{const s=sessions.find(s=>s.id===id);if(!s)throw Error('session_not_found');return s;};
  const client=s=>engine.forProject(projects.get(s.projectId).path);
  const validText=text=>{if(typeof text!=='string'||!text.trim()||text.length>16000)throw Error('invalid_prompt');};
  let api;
  const dispatchQueue=async(s,item,steer=false)=>{
    if(item.state!=='queued')throw Error('queue_delivery_uncertain');
    item.state='dispatching';save();
    try{
      if(steer&&runs.get(s.id)?.state==='running'){
        const c=client(s);if(!c.session?.promptAsync)throw Error('steering_unavailable');
        // The pinned legacy runner re-reads native messages at each step. Its
        // prompt path appends guidance and joins the running loop. The V2 inbox
        // is separate and does not deliver into this legacy loop in 1.18.31.
        // No tool flags, abort, replay or second execution loop are introduced.
        const run=runs.get(s.id);run.completionAfter=Date.now();
        const model=s.modelId&&s.modelId!=='auto'?engine.resolveSingleModel(s.modelId):{providerID:'omniroute',modelID:'localagent/coding'};
        const admission=c.session.promptAsync({sessionID:s.id,model,parts:[{type:'text',text:item.text}]});
        run.steering=admission;
        try{await admission;}finally{run.steering=null;}
      }else await api.prompt(s.id,item.text);
      s.queue=s.queue.filter(entry=>entry.id!==item.id);save();
    }catch(error){item.state=error.message==='steering_unavailable'?'queued':'uncertain';s.queuePaused=true;save();throw error;}
  };
  const abort=async(id,code)=>{
    const s=get(id),run=runs.get(id);if(run?.aborting)return run.aborting;
    const pending=(async()=>{
      if(s.queue?.length){s.queuePaused=true;save();}
      const release=run?.release;if(run){run.release=null;run.state=code;releaseRun(run);}
      try{
        if(run?.steering)await run.steering.catch(()=>{});
        if(run?.dispatch)await run.dispatch.catch(()=>{});
        const c=client(s);await c.session.abort({sessionID:id});
        // The pinned engine can retain a pending approval after abort. Revoke
        // those requests explicitly; cancellation never leaves an Allow card
        // capable of reviving a stopped operation.
        if(c.permission){for(const request of (await c.permission.list()).data||[]){if(request.sessionID===id)await c.permission.reply({requestID:request.id,reply:'reject'});}}
        if(s.workflow){const states=(await c.session.status()).data;if(!states||['busy','retry'].includes(states[id]?.type))throw Error('not_quiescent');}
        if(run)run.uncertain=false;
        release?.();
      }catch{if(run)run.uncertain=true;}
    })();
    if(run)run.aborting=pending;await pending;if(run)run.aborting=null;
  };
  const observe=s=>singleFlight(observations,s.id,async()=>{
    const c=client(s),response=await c.session.messages({sessionID:s.id,limit:100});const messages=response.data||[];
    if(s.workflow&&!Array.isArray(response.data))throw Error('workflow_observation_failed');
    const run=runs.get(s.id);
    if(run?.state==='running'){
      for(const m of messages){
        if(run.state!=='running')break;
        if(m.info?.role==='assistant'&&m.info.time?.created>=run.startedAt&&m.info.error){await abort(s.id,'provider_error');break;}
        for(const p of m.parts||[]){
          if(run.seen.has(p.id)||!m.info?.time?.created||m.info.time.created<run.startedAt)continue;
          if(p.type==='step-start'||p.type==='compaction'){
            run.seen.add(p.id);const reason=run.budget.observe({compaction:p.type==='compaction',size:JSON.stringify(messages).length});
            if(reason){await abort(s.id,'progress_budget_exhausted');break;}
          }
        }
      }
      const statusResponse=await c.session.status();
      if(s.workflow&&(!statusResponse.data||typeof statusResponse.data!=='object'))throw Error('workflow_observation_failed');
      const statuses=statusResponse.data||{};
      // A rejected native tool can leave an idle session with no final prose.
      // Treat the observed tool failure as failure instead of waiting for the
      // deadline or allowing a later summary to establish success.
      if(s.workflow && !['busy','retry'].includes(statuses[s.id]?.type) && messages.some(m=>m.info?.role==='assistant'&&m.info.time?.created>=run.startedAt&&(m.parts||[]).some(p=>p.type==='tool'&&p.state?.status==='error'))){
        run.state='tool_error';releaseRun(run);
      }
      const terminal=messages.filter(m=>m.info?.role==='assistant'&&m.info.time?.created>=run.startedAt).at(-1);
      const finished=s.workflow ? terminal?.info?.time?.completed>=run.startedAt&&terminal.info.finish==='stop'&&!terminal.info.error : messages.some(m=>m.info?.role==='assistant'&&m.info.time?.completed>=(run.completionAfter||run.startedAt)&&m.info.finish&&m.info.finish!=='tool-calls');
      if(run.state==='running'&&statuses[s.id]?.type!=='busy'&&statuses[s.id]?.type!=='retry'&&finished){run.state='completed';releaseRun(run);}
    }
    return messages;
  });
  const interval=setInterval(async()=>{if(polling)return;polling=true;try{
    for(const s of sessions)if(runs.get(s.id)?.state==='running')await observe(s);
    if(![...runs.values()].some(run=>run.state==='running')){
      const s=sessions.find(s=>!s.workflow&&!s.queuePaused&&s.queue?.some(item=>item.state==='queued'));
      if(s){const state=runs.get(s.id)?.state;if(state&&state!=='completed'){s.queuePaused=true;save();}else await dispatchQueue(s,s.queue.find(item=>item.state==='queued'));}
    }
  }catch{}finally{polling=false;}},pollMs);
  api = {
    list:projectId=>sessions.filter(s=>s.projectId===projectId&&!s.workflow),
    active:projectId=>sessions.some(s=>s.projectId===projectId&&runs.get(s.id)?.state==='running'),
    async create(projectId){const project=projects.get(projectId);const data=(await engine.forProject(project.path).session.create({title:'New task'})).data;if(!data?.id)throw Error('session_creation_failed');const s={id:data.id,projectId,title:'New task'};sessions=[s,...sessions];save();return s;},
    async setModel(id,modelId,purpose='balanced'){
      const s=get(id);if(s.workflow)throw Error('session_model_workflow_owned');
      if(runs.get(id)?.state==='running')throw Error('task_already_running');
      if(!['balanced','scan','reasoning','coding','quick'].includes(purpose))throw Error('invalid_task_purpose');
      if(modelId==='recommended'){modelId=engine.modelOptions?.(purpose).find(m=>m.selectable)?.id;if(!modelId)throw Error('no_eligible_models');}
      if(modelId!=='auto')engine.resolveSingleModel(modelId);
      s.modelId=modelId;s.purpose=purpose;save();return {...s};
    },
    async workflowStart({projectId,workflowId,stepId,attemptId,model,agent,tools,text,beforeDispatch,signal}) {
      if(signal?.aborted)throw Error('workflow_cancelled');
      const shared=projectMemoryPart(readProjectMemory(projects.get(projectId).path));
      if(sessions.some(s=>s.workflow?.attemptId===attemptId))throw Error('workflow_attempt_already_registered');
      if(sessions.some(s=>!s.workflow&&runs.get(s.id)?.state==='running'))throw Error('task_already_running');
      const c=engine.forProject(projects.get(projectId).path);
      if(c.v2){
        if(!engine.verifyWorkflowPermissionEnforcement)throw Error('workflow_native_permission_bridge_unverified');
        await engine.verifyWorkflowPermissionEnforcement({directory:projects.get(projectId).path,agent});
      }
      const data=(await c.session.create({title:`[${agent}] ${stepId}`,agent,model:{providerID:model.providerID,id:model.modelID},permission:[{permission:'edit',pattern:'*',action:tools.edit?'ask':'deny'},{permission:'bash',pattern:'*',action:tools.bash?'ask':'deny'}]})).data;
      if(!data?.id)throw Error('workflow_session_creation_failed');
      const s={id:data.id,projectId,title:stepId,workflow:{workflowId,stepId,attemptId,model,agent}};
      sessions=[s,...sessions];save();
      // The workflow records the original session before a request can have
      // side effects. A failed/ambiguous dispatch is never retried here.
      await beforeDispatch(s.id);
      if(signal?.aborted)throw Error('workflow_cancelled');
      const run={state:'running',startedAt:Date.now(),seen:new Set(),budget:new ProgressBudget()};runs.set(s.id,run);
      run.timer=setTimeout(()=>void abort(s.id,'task_deadline_exceeded'),Math.min(deadlineMs,120000));
      const onAbort=()=>void abort(s.id,'cancelled');signal?.addEventListener('abort',onAbort,{once:true});
      run.detach=()=>signal?.removeEventListener('abort',onAbort);
      // Legacy per-prompt tools:true replaces session permissions with allow.
      // Installed role rules and session permissions must remain authoritative.
      try { run.dispatch=c.session.promptAsync({sessionID:s.id,agent,model,parts:[...(shared?[shared]:[]),{type:'text',text}]});await run.dispatch;run.dispatch=null; }
      catch { await abort(s.id,'provider_error'); throw Error('workflow_dispatch_ambiguous'); }
      return s.id;
    },
    async workflowObserve(id) {
      const s=get(id);if(!s.workflow)throw Error('invalid_workflow_session');
      let messages;
      try{messages=await observe(s);}catch{await abort(id,'observation_failed');throw Error('workflow_observation_failed');}
      const run=runs.get(id);
      // A restarted supervisor cannot infer success from an old final message.
      if(!run)return {state:'recovery_required',sessionID:id};
      const recent=messages.filter(m=>m.info?.time?.created>=run.startedAt);
      const tools=recent.flatMap(m=>(m.parts||[]).filter(p=>p.type==='tool').map(p=>({id:p.id,tool:p.tool,status:p.state?.status,exit:p.state?.metadata?.exit,command:p.state?.input?.command})));
      return {state:run.state,sessionID:id,tools,messages:safeMessages(recent),modifiedFiles:toolChanges(recent).map(d=>d.file)};
    },
    workflowSession:id=>get(id).workflow,
    workflowQuiescent:workflowId=>sessions.filter(s=>s.workflow?.workflowId===workflowId).every(s=>{const r=runs.get(s.id);return r&&!r.uncertain&&r.state!=='running'&&!r.aborting;}),
    async workflowRecover(id){
      const s=get(id);if(!s.workflow)throw Error('invalid_workflow_session');
      const c=client(s);await c.session.abort({sessionID:id});
      const states=(await c.session.status()).data;
      if(!states||['busy','retry'].includes(states[id]?.type))throw Error('workflow_recovery_not_quiescent');
      return {sessionID:id,state:'interrupted',replayed:false};
    },
    async prompt(id,text){
      validText(text);
      if([...runs.values()].some(r=>r.state==='running'||r.aborting))throw Error('task_already_running');
      const s=get(id);if(s.workflow)throw Error('invalid_workflow_session');s.title=text.slice(0,64);save();
      const model=s.modelId&&s.modelId!=='auto'?engine.resolveSingleModel(s.modelId):{providerID:'omniroute',modelID:'localagent/coding'};
      const memory=readProjectMemory(projects.get(s.projectId).path),shared=memory.revision!==s.projectMemoryRevision?projectMemoryPart(memory):null;
      const parts=[...(shared?[shared]:[]),{type:'text',text}];
      const run={state:'running',startedAt:Date.now(),seen:new Set(),budget:new ProgressBudget()};runs.set(id,run);
      if(coordinateProject){try{run.release=acquireExecution(projects.get(s.projectId).path,'single-agent');}catch(error){runs.delete(id);throw error;}}
      run.timer=setTimeout(()=>void abort(id,'task_deadline_exceeded'),120000);
      try{run.dispatch=client(s).session.promptAsync({sessionID:id,model,parts});await run.dispatch;run.dispatch=null;s.projectMemoryRevision=memory.revision;save();}catch{await abort(id,'provider_error');throw Error('prompt_failed');}
    },
    enqueue(id,text){
      validText(text);const s=get(id);if(s.workflow)throw Error('invalid_workflow_session');
      s.queue||=[];
      if(s.queue.length>=10||s.queue.reduce((n,item)=>n+item.text.length,0)+text.length>64000)throw Error('queue_full');
      const item={id:'msg_'+randomUUID().replaceAll('-',''),text,state:'queued',createdAt:Date.now()};
      s.queue.push(item);if(s.queuePaused===undefined)s.queuePaused=false;save();return {...item};
    },
    async queueAction(id,{messageId,action,text}){
      const s=get(id);if(s.workflow)throw Error('invalid_workflow_session');
      if(action==='pause'){s.queuePaused=true;save();return;}
      if(action==='resume'){
        if(s.queue?.some(item=>item.state!=='queued'))throw Error('queue_delivery_uncertain');
        if(runs.get(id)?.aborting||runs.get(id)?.uncertain)throw Error('queue_delivery_uncertain');
        const states=(await client(s).session.status()).data;
        if(!states||['busy','retry'].includes(states[id]?.type))throw Error('task_already_running');
        const state=runs.get(id)?.state;if(state&&state!=='running'&&state!=='completed')runs.delete(id);
        s.queuePaused=false;save();return;
      }
      const item=s.queue?.find(item=>item.id===messageId);if(!item)throw Error('queued_message_not_found');
      if(item.state==='dispatching')throw Error('queue_delivery_in_progress');
      if(action==='remove'){s.queue=s.queue.filter(entry=>entry.id!==messageId);save();return;}
      if(item.state!=='queued')throw Error('queue_delivery_uncertain');
      if(action==='edit'){validText(text);if(s.queue.reduce((n,entry)=>n+(entry.id===messageId?text.length:entry.text.length),0)>64000)throw Error('queue_full');item.text=text;save();return;}
      if(action==='steer')return dispatchQueue(s,item,true);
      throw Error('invalid_queue_action');
    },
    async history(id,before){
      if(typeof before!=='string'||!/^msg_[A-Za-z0-9_-]{1,120}$/.test(before))throw Error('invalid_history_cursor');
      const s=get(id);const response=await client(s).session.messages({sessionID:id,before,limit:50});
      const messages=response.data||[];
      return {messages:safeMessages(messages),hasMore:messages.length===50};
    },
    snapshot:id=>singleFlight(snapshots,id,async()=>{const s=get(id),c=client(s);const messages=await observe(s).catch(()=>{throw Error('snapshot_messages_unavailable');});const permissionData=await c.permission.list().catch(()=>{throw Error('snapshot_permissions_unavailable');});const permissions=(permissionData.data||[]).filter(p=>p.sessionID===id).map(p=>({id:p.id,permission:p.permission,patterns:p.patterns}));let diffs=[];
      try{diffs=((await c.session.diff({sessionID:id})).data||[]).filter(d=>!/(^|[\\/])\.env/.test(d.file)).map(d=>({file:d.file,before:d.before?.slice(0,30000),after:d.after?.slice(0,30000),additions:d.additions,deletions:d.deletions}));}catch{}
      if(!diffs.length)diffs=toolChanges(messages);
      const last=messages.filter(m=>m.info?.role==='assistant').at(-1)?.info;
      const recoveredState=last?.error?'provider_error':last?.time?.completed&&last.finish&&last.finish!=='tool-calls'?'completed':'idle';
      const projected=safeMessages(messages);
      const markers=projected.flatMap(m=>m.parts).filter(p=>p.type==='compaction');
      return {session:s,state:runs.get(id)?.state||recoveredState,messages:projected,permissions,diffs,context:contextSummary(messages),activity:latestFileActivity(messages,projects.get(s.projectId).path),
        // Metadata only: whether OpenCode summarized earlier history and how.
        compaction:{count:markers.length,auto:markers.length>0&&markers.every(m=>m.auto)}};
    }),
    async permission(id,requestID,reply){const s=get(id);if(!['once','reject'].includes(reply))throw Error('invalid_permission_reply');const c=client(s);const pending=(await c.permission.list()).data||[];if(!pending.some(p=>p.id===requestID&&p.sessionID===id))throw Error('permission_not_found');await c.permission.reply({requestID,reply});},
    cancel:id=>abort(id,'cancelled'),
    stop(){clearInterval(interval);for(const s of sessions)if(s.queue?.length)s.queuePaused=true;save();for(const [id,run] of runs){clearTimeout(run.timer);run.detach?.();if(run.state==='running')void abort(id,'supervisor_stopped');}},
  };
  return api;
}
