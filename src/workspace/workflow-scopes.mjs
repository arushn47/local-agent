import {randomBytes} from 'node:crypto';
import {ledgerTransaction} from './atomic-ledger.mjs';
export class WorkflowScopes{
  constructor(file){this.file=file;this.state={version:1,scopes:{}};}
  transaction(fn){return ledgerTransaction(this.file,this.state,s=>{this.state=s;return fn(s);});}
  create(input){
    for(const key of ['workflowId','taskId','attemptId'])if(typeof input[key]!=='string'||!/^[A-Za-z0-9_-]{1,300}$/.test(input[key]))throw Error('invalid_workflow_scope');
    if(input.policy!=='free_only'||input.maxSpendUsd!==0)throw Error('workflow_paid_authorization_unavailable');
    if(!['gemini','groq','openrouter','ollama'].includes(input.provider)||typeof input.model!=='string'||!input.model||input.model.length>300)throw Error('invalid_workflow_scope');
    return this.transaction(s=>{
      if(Object.values(s.scopes).some(v=>v.attemptId===input.attemptId&&v.workflowId===input.workflowId))throw Error('workflow_scope_attempt_exists');
      const id=randomBytes(32).toString('hex');
      s.scopes[id]={...input,id,active:true,expiresAt:Date.now()+120000};return s.scopes[id];
    });
  }
  get(id){return this.transaction(s=>{const scope=s.scopes[id];return scope?.active&&scope.expiresAt>Date.now()?scope:null;});}
  close(id){return this.transaction(s=>{if(s.scopes[id])s.scopes[id].active=false;return true;});}
  claimRequest(id,fingerprint){return this.transaction(s=>{const scope=s.scopes[id];if(!scope?.active||scope.expiresAt<=Date.now())return false;scope.requests ||= [];if(scope.requests.includes(fingerprint))return false;scope.requests.push(fingerprint);return true;});}
}
