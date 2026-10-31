import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ProgressBudget } from '../context.mjs';
import { stateDir } from '../config.mjs';
import { contextSummary } from './context-summary.mjs';
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
export function createTasks(engine,projects,{sessionFile=join(stateDir,'sessions.json')} = {}) {
  const file=sessionFile;let sessions=existsSync(file)?JSON.parse(readFileSync(file)):[];
  const runs=new Map(),observations=new Map(),snapshots=new Map();let polling=false;
  const singleFlight=(map,id,fn)=>{if(map.has(id))return map.get(id);const pending=Promise.resolve().then(fn).finally(()=>map.delete(id));map.set(id,pending);return pending;};
  const releaseRun=run=>{run.seen.clear();run.budget=null;clearTimeout(run.timer);run.timer=null;};
  const save=()=>writeFileSync(file,JSON.stringify(sessions),{mode:0o600});
  const get=id=>{const s=sessions.find(s=>s.id===id);if(!s)throw Error('session_not_found');return s;};
  const client=s=>engine.forProject(projects.get(s.projectId).path);
  const abort=async(id,code)=>{const s=get(id),run=runs.get(id);if(run){run.state=code;releaseRun(run);}await client(s).session.abort({sessionID:id}).catch(()=>{});};
  const observe=s=>singleFlight(observations,s.id,async()=>{
    const c=client(s),response=await c.session.messages({sessionID:s.id,limit:100});const messages=response.data||[];
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
      const statuses=(await c.session.status()).data||{};
      if(run.state==='running'&&statuses[s.id]?.type!=='busy'&&statuses[s.id]?.type!=='retry'&&messages.some(m=>m.info?.role==='assistant'&&m.info.time?.completed>=run.startedAt&&m.info.finish&&m.info.finish!=='tool-calls')){run.state='completed';releaseRun(run);}
    }
    return messages;
  });
  const interval=setInterval(async()=>{if(polling)return;polling=true;try{for(const s of sessions)if(runs.get(s.id)?.state==='running')await observe(s);}catch{}finally{polling=false;}},1000);
  return {
    list:projectId=>sessions.filter(s=>s.projectId===projectId),
    active:projectId=>sessions.some(s=>s.projectId===projectId&&runs.get(s.id)?.state==='running'),
    async create(projectId){const project=projects.get(projectId);const data=(await engine.forProject(project.path).session.create({title:'New task'})).data;if(!data?.id)throw Error('session_creation_failed');const s={id:data.id,projectId,title:'New task'};sessions=[s,...sessions];save();return s;},
    async prompt(id,text){
      if(typeof text!=='string'||!text.trim()||text.length>16000)throw Error('invalid_prompt');
      if([...runs.values()].some(r=>r.state==='running'))throw Error('task_already_running');
      const s=get(id);s.title=text.slice(0,64);save();
      const run={state:'running',startedAt:Date.now(),seen:new Set(),budget:new ProgressBudget()};runs.set(id,run);
      run.timer=setTimeout(()=>void abort(id,'task_deadline_exceeded'),120000);
      try{await client(s).session.promptAsync({sessionID:id,model:{providerID:'omniroute',modelID:'localagent/coding'},parts:[{type:'text',text}]});}catch{await abort(id,'provider_error');throw Error('prompt_failed');}
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
      return {session:s,state:runs.get(id)?.state||recoveredState,messages:projected,permissions,diffs,context:contextSummary(messages),
        // Metadata only: whether OpenCode summarized earlier history and how.
        compaction:{count:markers.length,auto:markers.length>0&&markers.every(m=>m.auto)}};
    }),
    async permission(id,requestID,reply){const s=get(id);if(!['once','reject'].includes(reply))throw Error('invalid_permission_reply');const c=client(s);const pending=(await c.permission.list()).data||[];if(!pending.some(p=>p.id===requestID&&p.sessionID===id))throw Error('permission_not_found');await c.permission.reply({requestID,reply});},
    cancel:id=>abort(id,'cancelled'),
    stop(){clearInterval(interval);for(const run of runs.values())clearTimeout(run.timer);},
  };
}
