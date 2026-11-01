import {randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {stateDir} from '../config.mjs';
import {POLICIES} from './models.mjs';
import {ledgerTransaction} from './atomic-ledger.mjs';

const money=value=>Math.round(value*1e6)/1e6;
const amount=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0;
export function calculateCost(model,tokens={}){
  if(!model)return 0;
  if(model.tier==='free')return 0;
  return money((tokens.prompt_tokens||tokens.input_tokens||0)*(model.pricing?.prompt||0)+(tokens.completion_tokens||tokens.output_tokens||0)*(model.pricing?.completion||0)+((tokens.prompt_tokens||tokens.input_tokens||0)>0?(model.pricing?.request||0):0));
}
export const estimateCost=(model,input=2048,output=1800)=>calculateCost(model,{prompt_tokens:input,completion_tokens:output});

export class BudgetLedger{
  constructor({policy=POLICIES.FREE_ONLY,perTaskBudgetUsd=0,perWorkflowBudgetUsd=0,monthlySpendingLimitUsd=0,storageFile=join(stateDir,'budget-ledger.json'),paidAuthorized=false,now=()=>new Date()}={}){
    if(!Object.values(POLICIES).includes(policy))throw Error('invalid_budget_policy');
    this.policy=policy;this.paidAuthorized=paidAuthorized;this.storageFile=storageFile;this.now=now;
    this.limits={perTaskBudgetUsd,perWorkflowBudgetUsd,monthlySpendingLimitUsd};
    if(Object.values(this.limits).some(v=>!amount(v)))throw Error('invalid_budget_limit');
    this.state={version:2,month:now().toISOString().slice(0,7),monthlyCumulativeSpendUsd:0,workflows:{},tasks:{},reservations:{},settlements:{}};
  }
  transaction(fn){
    return ledgerTransaction(this.storageFile,this.state,state=>{
      if(state.version!==2){
        // Preserve historical aggregate charges; do not invent task attribution.
        const prior=Number(state.monthlyCumulativeSpendUsd)||0;
        Object.assign(state,this.state,{monthlyCumulativeSpendUsd:prior,legacyUnattributed:true});
      }
      const month=this.now().toISOString().slice(0,7);
      if(state.month!==month){state.month=month;state.monthlyCumulativeSpendUsd=0;}
      this.state=state;return fn(state);
    });
  }
  workflow(state,id){
    if(!Object.hasOwn(state.workflows,id))Object.defineProperty(state.workflows,id,{value:{spend:0,tokens:0,calls:0,limit:this.limits.perWorkflowBudgetUsd,paused:false},enumerable:true,writable:true,configurable:true});
    return state.workflows[id];
  }
  configureWorkflow(workflowId,{maxRequests=60,maxTokens=24000,maxSpendUsd=0}={}){
    if(!Number.isSafeInteger(maxRequests)||maxRequests<1||maxRequests>1000||!Number.isSafeInteger(maxTokens)||maxTokens<1||maxTokens>1000000||!amount(maxSpendUsd))throw Error('invalid_budget_limit');
    if(maxSpendUsd!==0&&!this.paidAuthorized)throw Error('paid_authorization_required');
    return this.transaction(s=>{const w=this.workflow(s,workflowId);
      // An attempt cannot silently widen an existing workflow's approval.
      if(w.requestLimit!==undefined&&(w.requestLimit!==maxRequests||w.tokenLimit!==maxTokens||w.limit!==maxSpendUsd))throw Error('workflow_budget_change_requires_approval');
      Object.assign(w,{requestLimit:maxRequests,tokenLimit:maxTokens,limit:maxSpendUsd});return true;});
  }
  reserve({workflowId='default-workflow',taskId='default-task',model,estimatedInputTokens=2048,maxOutputTokens=1800}={}){
    return this.transaction(s=>{
      const deny=code=>({allowed:false,code,reason:code});
      if(!model||!amount(estimatedInputTokens)||!amount(maxOutputTokens)||!['prompt','completion','request'].every(k=>amount(model.pricing?.[k]??(k==='request'?0:undefined))))return deny('unknown_model_price');
      const zero=['prompt','completion','request'].every(k=>(model.pricing[k]||0)===0);
      if((this.policy===POLICIES.FREE_ONLY||!this.paidAuthorized)&&(model.tier!=='free'||!zero))return deny('free_only_policy_violation');
      if(model.tier==='free'&&!zero)return deny('inconsistent_free_price');
      const w=this.workflow(s,workflowId),taskKey=JSON.stringify([workflowId,taskId]);
      const t=s.tasks[taskKey]||{spend:0,tokens:0};
      const all=Object.values(s.reservations),own=all.filter(r=>r.workflowId===workflowId),task=own.filter(r=>r.taskId===taskId);
      const sum=(rs,k)=>rs.reduce((n,r)=>n+r[k],0),cost=estimateCost(model,estimatedInputTokens,maxOutputTokens),tokens=estimatedInputTokens+maxOutputTokens;
      if(w.paused)return deny('workflow_paused_budget');
      if(w.requestLimit!==undefined&&w.calls>=w.requestLimit)return deny('workflow_request_budget_exceeded');
      if(w.tokenLimit!==undefined&&w.tokens+sum(own,'tokens')+tokens>w.tokenLimit)return deny('workflow_token_budget_exceeded');
      if(t.spend+sum(task,'amountUsd')+cost>this.limits.perTaskBudgetUsd)return deny('task_budget_exceeded');
      if(w.spend+sum(own,'amountUsd')+cost>w.limit){w.paused=true;w.pendingApproval={workflowId,taskId,estimatedCostUsd:cost};return deny('workflow_budget_exceeded');}
      if(s.monthlyCumulativeSpendUsd+sum(all,'amountUsd')+cost>this.limits.monthlySpendingLimitUsd)return deny('monthly_spending_limit_exceeded');
      const reservationId='res_'+randomUUID();
      s.reservations[reservationId]={workflowId,taskId,taskKey,modelId:model.id,amountUsd:cost,tokens,month:s.month,createdAt:this.now().toISOString()};
      w.calls++;return {allowed:true,reservationId,amountUsd:cost,estimatedTokens:tokens};
    });
  }
  reconcile({workflowId='default-workflow',taskId='default-task',reservationId,model,usage}={}){
    return this.transaction(s=>{
      if(s.settlements[reservationId]){
        const settled=s.settlements[reservationId];
        if(settled.workflowId!==workflowId||settled.taskId!==taskId||settled.modelId!==model?.id)throw Error('budget_reservation_scope_mismatch');
        return {...settled,duplicate:true};
      }
      const r=s.reservations[reservationId];
      if(!r||r.workflowId!==workflowId||r.taskId!==taskId||r.modelId!==model?.id)throw Error('budget_reservation_scope_mismatch');
      if(!amount(usage?.prompt_tokens)||!amount(usage?.completion_tokens))return {actualCostUsd:null,reservationRetained:true};
      const cost=calculateCost(model,usage),tokens=usage.prompt_tokens+usage.completion_tokens,w=this.workflow(s,workflowId);
      const t=s.tasks[r.taskKey]||{spend:0,tokens:0};
      w.spend=money(w.spend+cost);w.tokens+=tokens;t.spend=money(t.spend+cost);t.tokens+=tokens;s.tasks[r.taskKey]=t;
      s.monthlyCumulativeSpendUsd=money(s.monthlyCumulativeSpendUsd+cost);
      if(cost>r.amountUsd||tokens>r.tokens)w.paused=true;
      delete s.reservations[reservationId];
      const settled={workflowId,taskId,modelId:model.id,actualCostUsd:cost,reservationReleasedUsd:r.amountUsd,deltaUsd:money(r.amountUsd-cost),actualTokens:tokens};
      s.settlements[reservationId]=settled;
      const ids=Object.keys(s.settlements);for(const id of ids.slice(0,Math.max(0,ids.length-10000)))delete s.settlements[id];
      return settled;
    });
  }
  release({workflowId='default-workflow',reservationId}={}){
    return this.transaction(s=>{const r=s.reservations[reservationId];if(!r)return {released:false,amountUsd:0};if(r.workflowId!==workflowId)throw Error('budget_reservation_scope_mismatch');delete s.reservations[reservationId];return {released:true,amountUsd:r.amountUsd};});
  }
  approveBudgetIncrease(workflowId,value){
    if(!amount(value))throw Error('invalid_budget_limit');
    return this.transaction(s=>{const w=this.workflow(s,workflowId);w.limit=money(w.limit+value);w.paused=false;delete w.pendingApproval;return {approved:true,newWorkflowLimitUsd:w.limit,isPaused:false};});
  }
  setPolicy(policy,limits={}){if(!Object.values(POLICIES).includes(policy))throw Error('invalid_budget_policy');if(policy!==POLICIES.FREE_ONLY&&!this.paidAuthorized)throw Error('paid_authorization_required');this.policy=policy;Object.assign(this.limits,limits);if(Object.values(this.limits).some(v=>!amount(v)))throw Error('invalid_budget_limit');}
  getStatus(workflowId='default-workflow'){
    return this.transaction(s=>{const w=this.workflow(s,workflowId),all=Object.values(s.reservations),own=all.filter(r=>r.workflowId===workflowId),global=money(all.reduce((n,r)=>n+r.amountUsd,0)),reserved=money(own.reduce((n,r)=>n+r.amountUsd,0));return {policy:this.policy,limits:{...this.limits},monthlyCumulativeSpendUsd:s.monthlyCumulativeSpendUsd,globalActiveReservationsUsd:global,remainingMonthlyBudgetUsd:money(Math.max(0,this.limits.monthlySpendingLimitUsd-s.monthlyCumulativeSpendUsd-global)),workflow:{id:workflowId,cumulativeSpendUsd:w.spend,activeReservationsUsd:reserved,budgetLimitUsd:w.limit,remainingBudgetUsd:money(Math.max(0,w.limit-w.spend-reserved)),isPaused:w.paused,pendingApproval:w.pendingApproval,requestCount:w.calls,observedTokens:w.tokens,reservedTokens:own.reduce((n,r)=>n+r.tokens,0)}};});
  }
}
let defaultLedger;
export const getBudgetLedger=()=>defaultLedger??=new BudgetLedger();
