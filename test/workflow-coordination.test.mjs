import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {acquireExecution,executionOwner,safeParallelBatches} from '../src/workspace/workflow-coordination.mjs';
import {createWorkflowInstance,saveWorkflow,recoverWorkflow,loadWorkflow,runWorkflow,retryStep} from '../src/workspace/workflow-engine.mjs';
import {ConflictMatrix} from '../src/workspace/conflict-matrix.mjs';
function fixture(t){const dir=mkdtempSync(join(tmpdir(),'localagent-coordination-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));return dir;}
const plan=id=>({id,title:'Coordination fixture',policy:'free_only',stages:[{id:'edit',agent:'implementer'}]});

test('a different process and its crashed owner cannot be silently replaced; recovery aborts the original session without replay',async t=>{
  const dir=fixture(t),wf=createWorkflowInstance({workspaceDir:dir,plan:plan('wf-crashed')});
  wf.status='running';wf.stepStates.edit.status='running';wf.stepStates.edit.sessionID='ses_original';wf.stepStates.edit.dispatchState='dispatched';saveWorkflow(wf,dir);
  const url=new URL('../src/workspace/workflow-coordination.mjs',import.meta.url).href;
  const code=`import {acquireExecution} from ${JSON.stringify(url)};acquireExecution(process.argv[1],'wf-crashed');process.stdout.write('owned');setInterval(()=>{},1000);`;
  const child=spawn(process.execPath,['--input-type=module','-e',code,dir],{windowsHide:true,stdio:['ignore','pipe','pipe']});
  t.after(()=>{if(child.exitCode===null)child.kill();});
  await once(child.stdout,'data');assert.throws(()=>acquireExecution(dir,'wf-other'),/busy_or_recovery/);
  await assert.rejects(recoverWorkflow({workflowId:wf.id,workspaceDir:dir,tasks:{}}),/owner_active/);
  const exited=once(child,'exit');child.kill();await exited;
  assert.throws(()=>acquireExecution(dir,'wf-other'),/busy_or_recovery/);
  await assert.rejects(recoverWorkflow({workflowId:wf.id,workspaceDir:dir,tasks:{workflowRecover:async()=>{throw Error('engine unavailable');}}}),/engine unavailable/);
  assert.ok(executionOwner(dir),'unconfirmed abort retains the lease');
  let reconciled=0;
  await recoverWorkflow({workflowId:wf.id,workspaceDir:dir,tasks:{workflowRecover:async id=>{assert.equal(id,'ses_original');reconciled++;}}});
  assert.equal(reconciled,1);assert.equal(executionOwner(dir),null);assert.equal(loadWorkflow(wf.id,dir).requiresReplan,true);
  assert.throws(()=>retryStep(wf.id,'edit',{workspaceDir:dir}),/reconciliation/);
});

test('read-only workers share batches; shell/mutation-capable workers are exclusive even with disjoint declared files',()=>{
  const batches=safeParallelBatches([{id:'r1',agent:'researcher'},{id:'r2',agent:'planner'},{id:'w1',agent:'implementer',targetFiles:['a.js']},{id:'w2',agent:'tester',targetFiles:['b.js']}],new ConflictMatrix());
  assert.deepEqual(batches.map(b=>b.map(s=>s.id)),[['r1','r2'],['w1'],['w2']]);
});

test('separate workflow runners coordinate and completed workflows cannot replay tool side effects',async t=>{
  const dir=fixture(t);for(const id of ['wf-first','wf-second'])createWorkflowInstance({workspaceDir:dir,plan:plan(id)});
  let release,entered;const started=new Promise(r=>entered=r),gate=new Promise(r=>release=r);let calls=0;
  const runner=async()=>{calls++;entered();await gate;return {verified:true,output:'fixture'};};
  const first=runWorkflow({workflowId:'wf-first',workspaceDir:dir,runner});await started;
  await assert.rejects(runWorkflow({workflowId:'wf-second',workspaceDir:dir,runner}),/busy_or_recovery/);
  release();await first;await runWorkflow({workflowId:'wf-first',workspaceDir:dir,runner});assert.equal(calls,1);
});
