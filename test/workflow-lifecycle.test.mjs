import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTasks } from '../src/workspace/tasks.mjs';
import { createWorkflowInstance, runWorkflow, loadWorkflow, cancelWorkflow } from '../src/workspace/workflow-engine.mjs';

function fixture(t,scenario='pass') {
  const dir=mkdtempSync(join(tmpdir(),'localagent-lifecycle-')); let prompts=0,aborts=0,replies=0,dispatchTime=0;
  const id='ses_fixture', model='gemini/gemini-2.5-flash';
  const session={
    create:async()=>({data:{id}}),
    promptAsync:async input=>{prompts++;dispatchTime=Date.now();assert.equal(input.agent,'localagent-tester');assert.deepEqual(input.model,{providerID:'omniroute',modelID:model});assert.equal(input.tools.write,false);},
    messages:async()=>{if(scenario==='offline'&&prompts)throw Error('offline');return {data:prompts?[{info:{id:'msg_fixture',role:'assistant',time:{created:dispatchTime+1,completed:dispatchTime+2},finish:scenario==='length'?'length':'stop',...(scenario==='provider'?{error:{name:'RateLimit'}}:{})},parts:[{id:'tool_test',type:'tool',tool:'bash',state:{status:'completed',input:{command:scenario==='wrong-command'?'echo tests_pass':'node --test'},metadata:{exit:scenario==='failed-test'?1:0},output:'fixture-only'}},{type:'text',text:'APPROVED and all tests pass'}]}]:[]};},
    status:async()=>({data:scenario==='busy'?{[id]:{type:'retry'}}:{}}),
    diff:async()=>({data:[]}),abort:async()=>{aborts++;}
  };
  const engine={resolveWorkflowModel:()=>({providerID:'omniroute',modelID:model}),forProject:()=>({session,permission:{list:async()=>({data:[{id:'perm_fixture',sessionID:id,permission:'bash',patterns:['node --test']}]}),reply:async()=>{replies++;}}})};
  const projects={get:()=>({id:'project',path:dir})};
  const sessionFile=join(dir,'sessions.json');
  const tasks=createTasks(engine,projects,{sessionFile,deadlineMs:30,pollMs:2});
  const wf=createWorkflowInstance({workspaceDir:dir,plan:{id:'wf-lifecycle',title:'Lifecycle',policy:'free_only',stages:[{id:'test',agent:'tester',testCommand:'node --test',assignedModel:model}]}});
  t.after(()=>{tasks.stop();rmSync(dir,{recursive:true,force:true});});
  return {dir,tasks,engine,projects,sessionFile,wf,run:()=>runWorkflow({workflowId:wf.id,workspaceDir:dir,projectId:'project',tasks,engine}),counts:()=>({prompts,aborts,replies})};
}

test('workflow dispatch uses shared supervision and a persisted original session; tool exit evidence verifies tests',async t=>{
  const f=fixture(t);const result=await f.run();
  assert.equal(result.status,'completed');const step=loadWorkflow(f.wf.id,f.dir).stepStates.test;
  assert.equal(step.sessionID,'ses_fixture');assert.equal(step.evidenceSource,'supervised_opencode_session');assert.equal(step.testPassed,true);
  assert.equal(f.tasks.list('project').length,0,'workflow sessions do not replace single-agent task navigation');
  await f.tasks.permission(step.sessionID,'perm_fixture','once');assert.equal(f.counts().replies,1);
  await assert.rejects(f.tasks.permission(step.sessionID,'not-owned','once'),/permission_not_found/);
});

for(const scenario of ['provider','offline','busy','length','failed-test','wrong-command']) {
  test(`workflow ${scenario} cannot pass from final prose`,async t=>{
    const f=fixture(t,scenario);assert.equal((await f.run()).status,'failed');
    assert.equal(loadWorkflow(f.wf.id,f.dir).stepStates.test.status,'failed');
    assert.equal(f.counts().prompts,1);
  });
}

test('user cancellation aborts the owned session and late results cannot overwrite cancelled workflow state',async t=>{
  const f=fixture(t,'busy');const pending=f.run();
  while(!f.counts().prompts)await new Promise(r=>setTimeout(r,1));
  cancelWorkflow(f.wf.id,f.dir);const result=await pending;
  assert.equal(result.status,'cancelled');assert.equal(loadWorkflow(f.wf.id,f.dir).status,'cancelled');assert.ok(f.counts().aborts>=1);
});

test('restarted task supervisor identifies the old attempt as recovery-required instead of replaying it',async t=>{
  const f=fixture(t);await f.run();
  const restarted=createTasks(f.engine,f.projects,{sessionFile:f.sessionFile});
  try {
    assert.equal((await restarted.workflowObserve('ses_fixture')).state,'recovery_required');
    await assert.rejects(restarted.workflowStart({projectId:'project',workflowId:f.wf.id,stepId:'test',attemptId:`${f.wf.id}-test-1`}),/already_registered/);
    assert.equal(f.counts().prompts,1);
  }finally{restarted.stop();}
});
