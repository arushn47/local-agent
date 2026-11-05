import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createWorkflowInstance,saveWorkflow,loadWorkflow,assignWorkflowModel} from '../src/workspace/workflow-engine.mjs';
import {previewWorkflowReview,approveWorkflowReview} from '../src/workspace/workflow-review.mjs';

test('human review requires a native completed review, explicit approval, unchanged files and a separate resume',()=>{
  const dir=mkdtempSync(join(tmpdir(),'la-review-'));
  try{
    writeFileSync(join(dir,'code.mjs'),'export const value = 2;\n');
    const wf=createWorkflowInstance({workspaceDir:dir,plan:{id:'wf-review',title:'Review',policy:'free_only',stages:[{id:'cycle',type:'repeat',maxIterations:2,steps:[{id:'edit',agent:'implementer',targetFiles:['code.mjs']},{id:'test',agent:'tester',testCommand:'node --test'},{id:'review',agent:'reviewer'}]}]}});
    assert.throws(()=>previewWorkflowReview(wf.id,'review',dir),/review_unavailable/);
    wf.status='paused';wf.loopStates={cycle:{status:'running',iteration:1}};
    Object.assign(wf.stepStates.edit,{status:'completed'});Object.assign(wf.stepStates.test,{status:'completed',testPassed:true});
    Object.assign(wf.stepStates.review,{status:'failed',sessionID:'ses_review',error:'workflow_review_required',evidenceSource:'supervised_opencode_session'});saveWorkflow(wf,dir);
    assert.throws(()=>approveWorkflowReview(wf.id,'review',dir,{}),/approval_required/);
    const old=previewWorkflowReview(wf.id,'review',dir);
    writeFileSync(join(dir,'code.mjs'),'export const value = 3;\n');
    assert.throws(()=>approveWorkflowReview(wf.id,'review',dir,{approved:true,token:old.token}),/conflict/);
    const fresh=previewWorkflowReview(wf.id,'review',dir);
    const approved=approveWorkflowReview(wf.id,'review',dir,{approved:true,token:fresh.token});
    assert.equal(approved.requiresExplicitResume,true);
    const final=loadWorkflow(wf.id,dir);assert.equal(final.status,'paused');assert.equal(final.stepStates.review.reviewerApproved,true);assert.equal(final.loopStates.cycle.status,'succeeded');
    assert.throws(()=>approveWorkflowReview(wf.id,'review',dir,{approved:true,token:fresh.token}),/unavailable/);
  }finally{rmSync(dir,{recursive:true,force:true});}
});

test('preflight model assignment updates plan and durable state and refuses any started attempt',()=>{
  const dir=mkdtempSync(join(tmpdir(),'la-assignment-'));
  try{
    const catalog={providers:{gemini:{enabled:true,allowed:true,modelsDetailed:{fixture:{id:'fixture',provider:'gemini',tier:'free',tools:true}}}}};
    const wf=createWorkflowInstance({workspaceDir:dir,plan:{id:'wf-assign',title:'Assign',policy:'free_only',stages:[{id:'work',agent:'implementer'}]}});
    assert.throws(()=>assignWorkflowModel(wf.id,'work','fixture',dir,catalog),/invalid_workflow_model/);
    assignWorkflowModel(wf.id,'work','gemini/fixture',dir,catalog);
    const saved=loadWorkflow(wf.id,dir);assert.equal(saved.stepStates.work.assignedModel,'gemini/fixture');assert.equal(saved.plan.stages[0].assignedModel,'gemini/fixture');
    saved.stepStates.work.attempts=1;saveWorkflow(saved,dir);
    assert.throws(()=>assignWorkflowModel(wf.id,'work','gemini/fixture',dir,catalog),/assignment_state/);
  }finally{rmSync(dir,{recursive:true,force:true});}
});
