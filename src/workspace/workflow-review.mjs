import {createHash,createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import {relative,isAbsolute} from 'node:path';
import {loadWorkflow,saveWorkflow} from './workflow-engine.mjs';
import {readProjectFile} from './project-files.mjs';
import {acquireExecution,executionOwner} from './workflow-coordination.mjs';
const key=randomBytes(32);
const hash=value=>createHash('sha256').update(value).digest('hex');

export function previewWorkflowReview(workflowId,stepId,workspaceDir){
  const wf=loadWorkflow(workflowId,workspaceDir),step=wf?.stepStates?.[stepId];
  if(wf?.status!=='paused'||step?.agent!=='reviewer'||step.error!=='workflow_review_required'||!step.sessionID||step.evidenceSource!=='supervised_opencode_session'||wf.requiresReplan)throw Error('workflow_review_unavailable');
  if(executionOwner(workspaceDir))throw Error('workflow_runner_still_stopping');
  const paths=[...new Set(Object.values(wf.stepStates).flatMap(s=>[...(s.targetFiles||[]),...(s.modifiedFiles||[])]).map(file=>isAbsolute(file)?relative(workspaceDir,file).replaceAll('\\','/'):file))].sort();
  if(!paths.length||paths.length>100)throw Error('workflow_review_scope_required');
  const files=paths.map(path=>({path,hash:readProjectFile(workspaceDir,path).sha256}));
  const tests=Object.values(wf.stepStates).filter(s=>s.agent==='tester').map(s=>({id:s.id,passed:s.status==='completed'&&s.testPassed===true,sessionID:s.sessionID||null}));
  const stateHash=hash(JSON.stringify(wf));
  const token=createHmac('sha256',key).update(JSON.stringify({workspaceDir,workflowId,stepId,stateHash,files,tests})).digest('hex');
  return {workflowId,stepId,stateHash,files,tests,token,requiresApproval:true};
}

export function approveWorkflowReview(workflowId,stepId,workspaceDir,approval){
  if(approval?.approved!==true||typeof approval.token!=='string'||!/^[a-f0-9]{64}$/.test(approval.token))throw Error('workflow_review_approval_required');
  const preview=previewWorkflowReview(workflowId,stepId,workspaceDir);
  if(!timingSafeEqual(Buffer.from(preview.token,'hex'),Buffer.from(approval.token,'hex')))throw Error('workflow_review_conflict');
  const release=acquireExecution(workspaceDir,workflowId);
  try{
    const wf=loadWorkflow(workflowId,workspaceDir),step=wf.stepStates[stepId];
    if(hash(JSON.stringify(wf))!==preview.stateHash)throw Error('workflow_review_conflict');
    // Compare again under project ownership so a concurrent API action cannot
    // approve different state. No file mutation or agent dispatch occurs here.
    const checkFiles=preview.files.map(file=>({path:file.path,hash:readProjectFile(workspaceDir,file.path).sha256}));
    if(JSON.stringify(checkFiles)!==JSON.stringify(preview.files))throw Error('workflow_review_conflict');
    step.status='completed';step.error=null;step.reviewerApproved=true;
    step.reviewApproval={source:'human',at:new Date().toISOString(),files:preview.files};
    const finishLoops=nodes=>{for(const node of nodes||[]){
      if(node.type==='repeat'&&(node.steps||[]).some(s=>s.id===stepId)){
        if(!(node.steps||[]).every(s=>{const result=wf.stepStates[s.id];return result?.status==='completed'&&(result.agent!=='tester'||result.testPassed===true)&&(result.agent!=='reviewer'||result.reviewerApproved===true);}))throw Error('workflow_review_loop_incomplete');
        wf.loopStates||={};wf.loopStates[node.id]={...wf.loopStates[node.id],status:'succeeded'};
      }
      finishLoops(node.steps);
    }};finishLoops(wf.plan.stages);
    saveWorkflow(wf,workspaceDir);
    return {workflowId,stepId,status:'paused',reviewerApproved:true,requiresExplicitResume:true};
  }finally{release();}
}
