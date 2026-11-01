import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync,unlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {createServer} from 'node:http';
import {BudgetLedger} from '../src/workspace/budget-ledger.mjs';
import {WorkflowScopes} from '../src/workspace/workflow-scopes.mjs';
import {createGuard} from '../src/guard.mjs';
import {guardToken} from '../src/config.mjs';
import {createWorkflowTransport} from '../src/workspace/workflow-transport.mjs';
const free={id:'example/coder:free',tier:'free',pricing:{prompt:0,completion:0,request:0}};
test('durable reservations survive restart, unknown usage is retained, and reconciliation is idempotent',()=>{
 const dir=mkdtempSync(join(tmpdir(),'localagent-accounting-')),file=join(dir,'ledger.json');
 try{
  const first=new BudgetLedger({storageFile:file});first.configureWorkflow('wf',{maxRequests:2,maxTokens:100,maxSpendUsd:0});
  const r=first.reserve({workflowId:'wf',taskId:'test',model:free,estimatedInputTokens:40,maxOutputTokens:40});assert.equal(r.allowed,true);
  const next=new BudgetLedger({storageFile:file});assert.equal(next.getStatus('wf').workflow.reservedTokens,80);
  assert.equal(next.reserve({workflowId:'wf',taskId:'test',model:free,estimatedInputTokens:40,maxOutputTokens:40}).code,'workflow_token_budget_exceeded');
  assert.equal(next.reconcile({workflowId:'wf',taskId:'test',reservationId:r.reservationId,model:free}).reservationRetained,true);
  const args={workflowId:'wf',taskId:'test',reservationId:r.reservationId,model:free,usage:{prompt_tokens:10,completion_tokens:5}};
  next.reconcile(args);assert.equal(first.reconcile(args).duplicate,true);assert.equal(first.getStatus('wf').workflow.observedTokens,15);
  assert.equal(first.reserve({workflowId:'wf',taskId:'test',model:free,estimatedInputTokens:40,maxOutputTokens:40}).code,'workflow_token_budget_exceeded','settlement must not replenish a cumulative conservative allowance');
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('concurrent ledger instances include pending task reservations; paid policy alone is not authorization',()=>{
 const dir=mkdtempSync(join(tmpdir(),'localagent-budget-')),file=join(dir,'ledger.json');
 try{
  const paid={...free,tier:'paid',pricing:{prompt:.001,completion:.001,request:0}};
  assert.equal(new BudgetLedger({storageFile:null,policy:'paid_allowed'}).reserve({model:paid}).allowed,false);
  const options={storageFile:file,policy:'paid_allowed',paidAuthorized:true,perTaskBudgetUsd:.1,perWorkflowBudgetUsd:1,monthlySpendingLimitUsd:1};
  const one=new BudgetLedger(options),two=new BudgetLedger(options);
  assert.equal(one.reserve({model:paid,estimatedInputTokens:40,maxOutputTokens:40}).allowed,true);
  assert.equal(two.reserve({model:paid,estimatedInputTokens:40,maxOutputTokens:40}).code,'task_budget_exceeded');
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('month rollover retains pending exposure and corrupt or locked accounting cannot authorize dispatch',()=>{
 const dir=mkdtempSync(join(tmpdir(),'localagent-month-')),file=join(dir,'ledger.json');
 let date=new Date('2026-10-31T23:59:00Z');
 try{
  const ledger=new BudgetLedger({storageFile:file,policy:'paid_allowed',paidAuthorized:true,perTaskBudgetUsd:1,perWorkflowBudgetUsd:1,monthlySpendingLimitUsd:.1,now:()=>date});
  const paid={...free,tier:'paid',pricing:{prompt:.001,completion:.001,request:0}};
  assert.equal(ledger.reserve({model:paid,estimatedInputTokens:40,maxOutputTokens:40}).allowed,true);
  date=new Date('2026-11-01T00:01:00Z');
  assert.equal(ledger.reserve({model:paid,estimatedInputTokens:20,maxOutputTokens:20}).code,'monthly_spending_limit_exceeded');
  writeFileSync(file+'.lock','crashed owner');assert.throws(()=>ledger.reserve({model:free}),/locked/);unlinkSync(file+'.lock');
  writeFileSync(file,'{corrupt');assert.throws(()=>ledger.reserve({model:free}));
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('real transport and guard enforce session/model scope and actual-boundary request caps through a loopback gateway fixture',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'localagent-attribution-'));let upstreamCalls=0,limited=false;
 const secret={guard:'fixture-secret'},ledger=new BudgetLedger({storageFile:join(dir,'ledger.json')}),scopes=new WorkflowScopes(join(dir,'scopes.json'));
 const catalog={expiresAt:new Date(Date.now()+60000).toISOString(),providers:{openrouter:{enabled:true,allowed:true,models:[free.id],capabilities:{[free.id]:{contextWindow:32768,tools:true}},modelsDetailed:{[free.id]:free}}}};
 const guard=createGuard({config:{outputTokens:100},secret,env:()=>({OPENROUTER_API_KEY:'fixture-placeholder'}),catalog:()=>catalog,budgetLedger:ledger,scopeStore:scopes,auditPath:join(dir,'audit.jsonl'),fetcher:async()=>{upstreamCalls++;if(limited)return new Response('{"error":{"message":"fixture rate limit"}}',{status:429,headers:{'Retry-After':'15','Content-Type':'application/json'}});return new Response(JSON.stringify({choices:[{message:{content:'fixture'}}],usage:{prompt_tokens:10,completion_tokens:5}}),{headers:{'Content-Type':'application/json'}});}});
 guard.listen(0,'127.0.0.1');await once(guard,'listening');let scopedPath;
 const gateway=createServer(async(req,res)=>{let body='';for await(const c of req)body+=c;const r=await fetch(scopedPath,{method:'POST',headers:{Authorization:`Bearer ${guardToken(secret,'workflow:openrouter')}`,'Content-Type':'application/json'},body:JSON.stringify({...JSON.parse(body),model:free.id})});res.writeHead(r.status,{'Content-Type':'application/json'});res.end(await r.text());});
 gateway.listen(0,'127.0.0.1');await once(gateway,'listening');
 const config={guardPort:guard.address().port,gatewayPort:gateway.address().port};
 const transport=await createWorkflowTransport({config,secret,registerAttempt:async s=>{scopedPath=`http://127.0.0.1:${config.guardPort}/workflow-egress/openrouter/${s.id}/v1/chat/completions`;return {alias:'exact-attempt',key:'fixture'};}});
 t.after(async()=>{await transport.close();for(const s of [gateway,guard]){s.closeAllConnections();await new Promise(r=>s.close(r));}rmSync(dir,{recursive:true,force:true});});
 const post=(session,model='exact-alias')=>fetch(transport.url+'/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${transport.token}`,'x-session-id':session,'Content-Type':'application/json'},body:JSON.stringify({model,messages:[{role:'user',content:'fixture'}],max_tokens:100})});
 assert.equal((await post('unknown')).status,403);
 await transport.bind({sessionID:'ses_fixture',workspaceDir:dir,workflowId:'wf',stepId:'test',attemptId:'attempt_1',qualifiedModel:'openrouter/'+free.id,modelAlias:'exact-alias',limits:{maxRequests:1,maxTokens:5000}});
 assert.equal((await post('ses_fixture','wrong-model')).status,403);
 const accepted=await post('ses_fixture');assert.equal(accepted.status,200);await accepted.text();
 const exhausted=await post('ses_fixture');assert.equal(exhausted.status,402);await exhausted.text();assert.equal(upstreamCalls,1);
 await transport.release('ses_fixture');assert.equal((await post('ses_fixture')).status,403);
 const closed=await fetch(scopedPath,{method:'POST',headers:{Authorization:`Bearer ${guardToken(secret,'workflow:openrouter')}`,'Content-Type':'application/json'},body:JSON.stringify({model:free.id,messages:[{role:'user',content:'late request'}]})});assert.equal(closed.status,403);assert.equal(upstreamCalls,1);
 limited=true;
 await transport.bind({sessionID:'ses_rate',workspaceDir:dir,workflowId:'wf_rate',stepId:'test',attemptId:'attempt_rate',qualifiedModel:'openrouter/'+free.id,modelAlias:'exact-alias',limits:{maxRequests:1,maxTokens:5000}});
 const rate=await post('ses_rate');assert.equal(rate.status,429);await rate.text();
 assert.equal((await post('ses_rate')).status,403);assert.equal(upstreamCalls,2);
});
