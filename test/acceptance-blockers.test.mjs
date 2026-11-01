import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {BudgetLedger} from '../src/workspace/budget-ledger.mjs';
import {createWorkflowInstance,saveWorkflow,loadWorkflow,cancelWorkflow} from '../src/workspace/workflow-engine.mjs';
import {createTasks} from '../src/workspace/tasks.mjs';
const model={id:'fixture',tier:'free',pricing:{prompt:0,completion:0,request:0}};
test('sequential and concurrent reservations, settlement and cancellation never replenish per-run request/token ceilings',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'la-limits-'));try{
 const a=new BudgetLedger({storageFile:join(dir,'budget.json')}),b=new BudgetLedger({storageFile:join(dir,'budget.json')});a.configureWorkflow('wf',{maxRequests:3,maxTokens:100,maxSpendUsd:0});
 const reserve=ledger=>ledger.reserve({workflowId:'wf',taskId:'step',model,estimatedInputTokens:20,maxOutputTokens:20});
 const [one,two]=await Promise.all([Promise.resolve().then(()=>reserve(a)),Promise.resolve().then(()=>reserve(b))]);assert.ok(one.allowed&&two.allowed);assert.equal(reserve(a).code,'workflow_token_budget_exceeded');
 a.reconcile({workflowId:'wf',taskId:'step',reservationId:one.reservationId,model,usage:{prompt_tokens:1,completion_tokens:1}});b.release({workflowId:'wf',reservationId:two.reservationId});assert.equal(reserve(b).code,'workflow_token_budget_exceeded');
 const last=a.reserve({workflowId:'wf',taskId:'step',model,estimatedInputTokens:10,maxOutputTokens:10});assert.ok(last.allowed);a.release({workflowId:'wf',reservationId:last.reservationId});assert.equal(a.reserve({workflowId:'wf',model,estimatedInputTokens:0,maxOutputTokens:0}).code,'workflow_request_budget_exceeded');
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('completed and failed terminal states survive stale writes and idempotent cleanup cancellation',()=>{
 const dir=mkdtempSync(join(tmpdir(),'la-terminal-'));try{
 for(const status of ['completed','failed']){
 const wf=createWorkflowInstance({workspaceDir:dir,plan:{id:'wf-'+status,title:'Terminal',policy:'free_only',stages:[{id:'step',agent:'implementer'}]}}),stale=structuredClone(wf);
 wf.status=status;saveWorkflow(wf,dir);const file=join(dir,'.localagent/workflows',wf.id+'.json'),bytes=readFileSync(file,'utf8');
 for(let i=0;i<3;i++)assert.equal(cancelWorkflow(wf.id,dir).status,status);assert.equal(readFileSync(file,'utf8'),bytes);
 stale.status='cancelled';saveWorkflow(stale,dir);assert.equal(loadWorkflow(wf.id,dir).status,status);
 }
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('native permission enforcement uncertainty blocks before creating a session or dispatching a prompt',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'la-permission-gate-'));let calls=0;
 const tasks=createTasks({forProject:()=>({v2:{},session:{create:async()=>{calls++;}}}),verifyWorkflowPermissionEnforcement:async()=>{throw Error('workflow_native_permission_bridge_unverified');}},{get:()=>({path:dir})},{sessionFile:join(dir,'sessions.json')});
 try{await assert.rejects(tasks.workflowStart({projectId:'project',workflowId:'wf',stepId:'step',attemptId:'one',agent:'localagent-implementer',model:{providerID:'localagent-workflow',modelID:'fixture'},tools:{edit:true}}),/bridge_unverified/);assert.equal(calls,0);}
 finally{tasks.stop();rmSync(dir,{recursive:true,force:true});}
});
