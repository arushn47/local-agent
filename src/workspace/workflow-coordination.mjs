import { existsSync, openSync, closeSync, readFileSync, writeFileSync, fsyncSync, unlinkSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { confinedPath, stateDirectory, assertWorkflowId } from './workflow-storage.mjs';

const leasePath=dir=>{stateDirectory(dir,'workflows');return confinedPath(dir,'.localagent/workflows/.execution-owner',{privateState:true});};
export function executionOwner(dir) {
  const file=leasePath(dir);if(!existsSync(file))return null;
  const value=JSON.parse(readFileSync(file,'utf8'));
  if(!Number.isInteger(value.pid)||value.pid<=0||typeof value.token!=='string')throw Error('workflow_invalid_execution_owner');
  return value;
}
export function acquireExecution(dir,workflowId) {
  assertWorkflowId(workflowId);
  const file=leasePath(dir),owner={workflowId,pid:process.pid,token:randomUUID(),createdAt:Date.now()};
  let fd;
  try{fd=openSync(file,'wx',0o600);}catch(error){if(error.code==='EEXIST')throw Error('workflow_project_busy_or_recovery_required');throw error;}
  try{writeFileSync(fd,JSON.stringify(owner));fsyncSync(fd);}finally{closeSync(fd);}
  return ()=>releaseExecution(dir,owner.token);
}
export function releaseExecution(dir,token) {
  const current=executionOwner(dir);
  if(current?.token!==token)throw Error('workflow_execution_owner_changed');
  unlinkSync(leasePath(dir));
}
export function ownerProcessAlive(owner) {
  try{process.kill(owner.pid,0);return true;}catch(error){return error.code!=='ESRCH';}
}

// Shell commands can write undeclared paths. Only native read-only roles may
// share a batch; all mutating/shell-capable workers serialize until isolation.
export function safeParallelBatches(steps,conflicts) {
  return conflicts.scheduleParallelBatches(steps).flatMap(wave=>{
    const readers=wave.filter(s=>['planner','researcher','reviewer'].includes(s.agent));
    const writers=wave.filter(s=>!readers.includes(s));
    return [...(readers.length?[readers]:[]),...writers.map(s=>[s])];
  });
}
