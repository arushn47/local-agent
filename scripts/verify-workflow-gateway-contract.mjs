// Actual pinned OmniRoute, real transport/guard, deterministic local upstream.
// Zero live inference; no credentials or external provider endpoints are used.
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:net';
import {once} from 'node:events';
process.env.LOCALAGENT_STATE_DIR=mkdtempSync(join(tmpdir(),'localagent-gateway-contract-'));
const {loadConfig,secrets,setCredentialOverlay}=await import('../src/config.mjs');
const {startPlatform}=await import('../src/runtime.mjs');
const {createGuard}=await import('../src/guard.mjs');
const {createWorkflowTransport}=await import('../src/workspace/workflow-transport.mjs');
const {BudgetLedger}=await import('../src/workspace/budget-ledger.mjs');
const {WorkflowScopes}=await import('../src/workspace/workflow-scopes.mjs');
setCredentialOverlay({GEMINI_API_KEY:null,GROQ_API_KEY:null,OPENROUTER_API_KEY:null});
const port=async()=>{const s=createServer();s.listen(0,'127.0.0.1');await once(s,'listening');const p=s.address().port;await new Promise(r=>s.close(r));return p;};
const config=loadConfig();config.gatewayPort=await port();config.guardPort=await port();for(const p of Object.values(config.providers))p.enabled=false;
let platform,guard,transport,calls=0;
try{
 platform=await startPlatform(config);
 const model='example/coder:free',detail={id:model,tier:'free',pricing:{prompt:0,completion:0,request:0}};
 const catalog={expiresAt:new Date(Date.now()+60000).toISOString(),providers:{openrouter:{enabled:true,allowed:true,models:[model],modelsDetailed:{[model]:detail},capabilities:{[model]:{contextWindow:32768,tools:true}}}}};
 guard=createGuard({config:{outputTokens:100},secret:secrets(),env:()=>({OPENROUTER_API_KEY:'fixture-only'}),catalog:()=>catalog,budgetLedger:new BudgetLedger({storageFile:null}),scopeStore:new WorkflowScopes(null),auditPath:join(process.env.LOCALAGENT_STATE_DIR,'fixture-audit.jsonl'),fetcher:async()=>{calls++;return new Response(JSON.stringify({id:'fixture',object:'chat.completion',created:1,model,choices:[{index:0,message:{role:'assistant',content:'loopback_contract_pass'},finish_reason:'stop'}],usage:{prompt_tokens:10,completion_tokens:5,total_tokens:15}}),{headers:{'Content-Type':'application/json'}});}});
 guard.listen(0,'127.0.0.1');await once(guard,'listening');
 const scopedConfig={...config,guardPort:guard.address().port};
 transport=await createWorkflowTransport({config:scopedConfig,secret:secrets()});
 await transport.bind({sessionID:'ses_fixture',workspaceDir:process.env.LOCALAGENT_STATE_DIR,workflowId:'wf_contract',stepId:'test',attemptId:'one',qualifiedModel:'openrouter/'+model,modelAlias:'fixture-exact',limits:{maxRequests:1,maxTokens:5000}});
 const request=()=>fetch(transport.url+'/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${transport.token}`,'X-Session-Id':'ses_fixture','Content-Type':'application/json'},body:JSON.stringify({model:'fixture-exact',messages:[{role:'user',content:'local contract fixture'}],max_tokens:100}),signal:AbortSignal.timeout(15000)});
 const r=await request();const text=await r.text();assert.equal(r.status,200,`actual gateway status ${r.status}`);assert.ok(text.includes('loopback_contract_pass'));assert.equal(calls,1);
 const exhausted=await request();await exhausted.text();assert.notEqual(exhausted.status,200);assert.equal(calls,1);
 await transport.release('ses_fixture');
 console.log(JSON.stringify({passed:true,actualGateway:'3.8.52',upstream:'local deterministic fixture',liveInferenceRequests:0,guardDispatches:calls}));
}finally{
 await transport?.close();if(guard){guard.closeAllConnections();await new Promise(r=>guard.close(r));}
 if(platform){const ended=once(platform.child,'exit');platform.stop();await ended;}
}
