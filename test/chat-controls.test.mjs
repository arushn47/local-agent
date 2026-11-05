import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,rmSync,mkdirSync,symlinkSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {rankTaskModels,resolveSingleModel,singleModelAlias} from '../src/workspace/model-selection.mjs';
import {readProjectMemory,updateProjectMemory,projectMemoryPart} from '../src/workspace/project-memory.mjs';
import {latestFileActivity} from '../src/workspace/file-activity.mjs';
import {createTasks} from '../src/workspace/tasks.mjs';

test('all discovered free models are ranked by explicit metadata with admission enforced',()=>{
  const entry={enabled:true,allowed:true,models:[],modelsDetailed:{},capabilities:{}},registry={};
  for(let i=0;i<14;i++){
    const id='coder-'+i,qualified='fixture/'+id;entry.models.push(id);
    entry.modelsDetailed[id]={id,provider:'fixture',tier:'free',freeTierVerified:true,pricing:{prompt:0,completion:0,request:0},tools:true,contextWindow:32768*(i+1),supportsReasoning:i===4};
    entry.capabilities[id]={tools:true,codingApproved:true};registry[qualified]={qualified,alias:singleModelAlias(qualified),provider:'fixture',model:id};
  }
  const catalog={expiresAt:new Date(Date.now()+60000).toISOString(),providers:{fixture:entry}};
  assert.equal(rankTaskModels(catalog,registry).length,14);
  assert.equal(rankTaskModels(catalog,registry,'scan')[0].id,'fixture/coder-13');
  assert.equal(rankTaskModels(catalog,registry,'reasoning')[0].id,'fixture/coder-4');
  assert.equal(resolveSingleModel('fixture/coder-1',registry,catalog).modelID,singleModelAlias('fixture/coder-1'));
  entry.modelsDetailed['coder-1'].pricing.request=.001;
  assert.throws(()=>resolveSingleModel('fixture/coder-1',registry,catalog),/unavailable/);
  entry.modelsDetailed['coder-2'].freeTierVerified=false;entry.modelsDetailed['coder-3'].tools=false;entry.modelsDetailed['coder-5'].contextWindow=8000;entry.capabilities['coder-6'].codingApproved=false;delete registry['fixture/coder-7'];
  const available=rankTaskModels(catalog,registry).filter(m=>m.selectable);assert.equal(available.length,8);
  catalog.expiresAt='2000-01-01';assert.equal(rankTaskModels(catalog,registry).some(m=>m.selectable),false);
  registry['fixture/coder-0'].alias='wrong';assert.throws(()=>resolveSingleModel('fixture/coder-0',registry,catalog),/not_registered/);
});

test('project memory is versioned, bounded, isolated and rejects links and stale overwrites',()=>{
  const root=mkdtempSync(join(tmpdir(),'localagent-memory-'));const other=join(root,'other');mkdirSync(other);
  try{
    assert.equal(readProjectMemory(root).revision,0);
    const saved=updateProjectMemory(root,{brief:'Run node --test. Confirm findings.',revision:0});assert.equal(saved.revision,1);
    assert.equal(readProjectMemory(other).brief,'');assert.match(projectMemoryPart(saved).text,/not permission/);
    assert.throws(()=>updateProjectMemory(root,{brief:'stale',revision:0}),/conflict/);
    assert.throws(()=>updateProjectMemory(root,{brief:'界'.repeat(2000),revision:1}),/invalid/);
    const cleared=updateProjectMemory(root,{brief:'',revision:1});assert.match(projectMemoryPart(cleared).text,/superseded/);
    symlinkSync(join(root,'.localagent'),join(other,'.localagent'),process.platform==='win32'?'junction':'dir');
    assert.throws(()=>readProjectMemory(other),/link/);
  }finally{rmSync(root,{recursive:true,force:true});}
});

function setup(){
  const directory=mkdtempSync(join(tmpdir(),'localagent-chat-')),file=join(directory,'sessions.json'),calls=[],messages=[];let created=0,busy=false;
  const session={create:async()=>({data:{id:'ses_'+(++created)}}),promptAsync:async value=>{calls.push(value);busy=true;},messages:async()=>({data:messages}),status:async()=>({data:busy?{ses_1:{type:'busy'}}:{}}),diff:async()=>({data:[]}),abort:async()=>{busy=false;}};
  const engine={resolveSingleModel:id=>({providerID:'omniroute',modelID:id}),forProject:()=>({session,permission:{list:async()=>({data:[]})},v2:{session:{prompt:async value=>{calls.push(value);}}}})};
  const projects={get:()=>({path:directory})};
  let tasks=createTasks(engine,projects,{sessionFile:file,pollMs:10});
  return {directory,file,calls,messages,engine,projects,get tasks(){return tasks;},restart(){tasks.stop();tasks=createTasks(engine,projects,{sessionFile:file,pollMs:10});},finish(){busy=false;messages.push({info:{id:'msg_'+Date.now(),role:'assistant',time:{created:Date.now()+1,completed:Date.now()+2},finish:'stop'},parts:[{type:'text',text:'done'}]});},close(){tasks.stop();rmSync(directory,{recursive:true,force:true});}};
}
const until=async condition=>{for(let i=0;i<100;i++){if(await condition())return;await new Promise(r=>setTimeout(r,10));}assert.fail('condition timed out');};

test('switch models with history in the same chat and inject only revised project memory',async()=>{
  const f=setup();try{
    const s=await f.tasks.create('project');updateProjectMemory(f.directory,{brief:'Use fixed tests.',revision:0});
    await f.tasks.prompt(s.id,'first');assert.match(f.calls[0].parts[0].text,/Use fixed tests/);
    await assert.rejects(f.tasks.setModel(s.id,'exact'),/already_running/);
    f.finish();await until(async()=>(await f.tasks.snapshot(s.id)).state==='completed');
    await f.tasks.setModel(s.id,'exact','reasoning');await f.tasks.prompt(s.id,'second');
    assert.equal(f.tasks.list('project').length,1);assert.equal(f.calls[1].sessionID,s.id);assert.equal(f.calls[1].model.modelID,'exact');assert.equal(f.calls[1].parts.length,1);
    f.finish();await until(async()=>(await f.tasks.snapshot(s.id)).state==='completed');
    updateProjectMemory(f.directory,{brief:'New convention.',revision:1});await f.tasks.prompt(s.id,'third');assert.match(f.calls[2].parts[0].text,/New convention/);
  }finally{f.close();}
});

test('queue waits for completion, edits in order and native steering never replays the current prompt',async()=>{
  const f=setup();try{
    const s=await f.tasks.create('project');await f.tasks.prompt(s.id,'first');
    const one=f.tasks.enqueue(s.id,'later'),two=f.tasks.enqueue(s.id,'guidance');
    await f.tasks.queueAction(s.id,{action:'pause'});assert.equal(f.tasks.list('project')[0].queuePaused,true);
    await f.tasks.queueAction(s.id,{action:'resume'});assert.equal(f.tasks.list('project')[0].queuePaused,false);
    await f.tasks.queueAction(s.id,{action:'edit',messageId:one.id,text:'edited later'});
    await new Promise(r=>setTimeout(r,40));assert.equal(f.calls.length,1);
    await f.tasks.queueAction(s.id,{action:'steer',messageId:two.id});assert.equal(f.calls.length,2);assert.equal(f.calls[1].sessionID,s.id);assert.equal(f.calls[1].parts[0].text,'guidance');assert.equal(f.calls[1].tools,undefined);
    f.finish();await until(()=>f.calls.length===3);assert.equal(f.calls[2].parts.at(-1).text,'edited later');
    assert.equal(f.tasks.list('project')[0].queue.length,0);
  }finally{f.close();}
});

test('cancellation and restart hold pending messages; uncertain admissions never auto-retry',async()=>{
  const f=setup();try{
    const s=await f.tasks.create('project');await f.tasks.prompt(s.id,'first');f.tasks.enqueue(s.id,'later');await f.tasks.cancel(s.id);
    await new Promise(r=>setTimeout(r,40));assert.equal(f.calls.length,1);assert.equal(f.tasks.list('project')[0].queuePaused,true);
    f.restart();await new Promise(r=>setTimeout(r,40));assert.equal(f.calls.length,1);
    await f.tasks.queueAction(s.id,{action:'resume'});await until(()=>f.calls.length===2);
    f.tasks.enqueue(s.id,'ambiguous');f.engine.forProject=()=>({session:{abort:async()=>{},promptAsync:async()=>{throw Error('connection_lost');}}});
    await assert.rejects(f.tasks.queueAction(s.id,{action:'steer',messageId:f.tasks.list('project')[0].queue[0].id}),/connection_lost/);
    assert.equal(f.tasks.list('project')[0].queue[0].state,'uncertain');
    await assert.rejects(f.tasks.queueAction(s.id,{action:'resume'}),/uncertain/);
  }finally{f.close();}
});

test('Follow agent projects only confined public file activity without raw arguments',()=>{
  const root=mkdtempSync(join(tmpdir(),'localagent-follow-'));try{
    writeFileSync(join(root,'app.js'),'safe');writeFileSync(join(root,'.env'),'private');
    const tool=(id,path)=>({id,type:'tool',tool:'edit',state:{status:'completed',input:{filePath:path,content:'unprojected content'}}});
    const activity=latestFileActivity([{info:{id:'m'},parts:[tool('one',join(root,'app.js')),tool('two',join(root,'.env')),tool('three',join(root,'../outside'))]}],root);
    assert.deepEqual(activity,{id:'one',path:'app.js',tool:'edit',status:'completed',offset:1});
  }finally{rmSync(root,{recursive:true,force:true});}
});

test('queue limits are per chat and an interrupted delivery is held after restart',async()=>{
  const f=setup();try{
    const s=await f.tasks.create('project');await f.tasks.queueAction(s.id,{action:'pause'});
    const first=f.tasks.enqueue(s.id,'x');for(let i=0;i<9;i++)f.tasks.enqueue(s.id,'x');
    assert.throws(()=>f.tasks.enqueue(s.id,'overflow'),/queue_full/);
    await f.tasks.queueAction(s.id,{action:'remove',messageId:first.id});assert.equal(f.tasks.list('project')[0].queue.length,9);
    f.tasks.stop();const saved=JSON.parse(readFileSync(f.file));saved[0].queue[0].state='dispatching';writeFileSync(f.file,JSON.stringify(saved));
    const recovered=createTasks(f.engine,f.projects,{sessionFile:f.file,pollMs:10});try{
      assert.equal(recovered.list('project')[0].queue[0].state,'uncertain');assert.equal(recovered.list('project')[0].queuePaused,true);
      await assert.rejects(recovered.queueAction(s.id,{action:'resume'}),/uncertain/);assert.equal(f.calls.length,0);
    }finally{recovered.stop();}
  }finally{f.close();}
});

test('Stop waits for in-flight admission before aborting so a late queued dispatch cannot revive the chat',async()=>{
  const f=setup();try{
    const s=await f.tasks.create('project'),c=f.engine.forProject();let admit,aborts=0;
    c.session.promptAsync=()=>new Promise(resolve=>{admit=resolve;});c.session.abort=async()=>{aborts++;};
    const sending=f.tasks.prompt(s.id,'pending admission');f.tasks.enqueue(s.id,'held');
    const stopping=f.tasks.cancel(s.id);await new Promise(r=>setTimeout(r,20));assert.equal(aborts,0);
    admit();await Promise.all([sending,stopping]);assert.equal(aborts,1);assert.equal((await f.tasks.snapshot(s.id)).state,'cancelled');assert.equal(f.tasks.list('project')[0].queuePaused,true);
  }finally{f.close();}
});
