// Actual pinned OmniRoute, real transport/guard, deterministic local upstream.
// Zero live inference; no credentials or external provider endpoints are used.
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync} from 'node:fs';
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
// Diagnostic probe only: explicit bypass below is restricted to this no-key,
// deterministic loopback runtime to reproduce the upstream blocker.
const {startEngine}=await import('../src/workspace/engine.mjs');
const {createTasks}=await import('../src/workspace/tasks.mjs');
const {workflowAlias}=await import('../src/workspace/workflow-models.mjs');
const {createWorkflowInstance,runWorkflow,loadWorkflow,cancelWorkflow}=await import('../src/workspace/workflow-engine.mjs');
let platform,guard,transport,engine,tasks,calls=0;const cases=[];
try{
 platform=await startPlatform(config);
 const model='example/coder:free',detail={id:model,tier:'free',freeTierVerified:true,pricing:{prompt:0,completion:0,request:0}};
 const catalog={expiresAt:new Date(Date.now()+60000).toISOString(),providers:{openrouter:{enabled:true,allowed:true,models:[model],modelsDetailed:{[model]:detail},capabilities:{[model]:{contextWindow:32768,tools:true,codingApproved:true}}}}};
 guard=createGuard({config:{outputTokens:100},secret:secrets(),env:()=>({OPENROUTER_API_KEY:'fixture-only'}),catalog:()=>catalog,budgetLedger:new BudgetLedger({storageFile:null}),scopeStore:new WorkflowScopes(null),auditPath:join(process.env.LOCALAGENT_STATE_DIR,'fixture-audit.jsonl'),fetcher:async(url,options)=>{
  calls++;const body=JSON.parse(options.body),messages=body.messages;console.log(JSON.stringify({providerTools:body.tools?.map(t=>t.function?.name),calls}));
  const text=JSON.stringify(messages),name=text.match(/CASE_([a-z_]+)/)?.[1];assert.ok(name,'scenario identity');
  const directory=join(process.env.LOCALAGENT_STATE_DIR,name),file=join(directory,'target.mjs');
  const n=messages.filter(m=>m.role==='tool').length,isEdit=name.startsWith('edit');
  let tool,args;
  if(isEdit&&n===0){tool='read';args={filePath:file};}
  else if(isEdit&&n===1){tool='edit';args={filePath:file,oldString:'return n + 1',newString:'return n * 2'};}
  else if(!isEdit&&n===0){tool='bash';args={command:'node --test check.test.mjs',description:'Run deterministic local test'};}
  const chunk={id:'fixture',object:'chat.completion.chunk',created:1,model,choices:[{index:0,delta:tool?{role:'assistant',tool_calls:[{index:0,id:'call_'+n,type:'function',function:{name:tool,arguments:JSON.stringify(args)}}]}:{role:'assistant',content:'Fixture session finished.'},finish_reason:tool?'tool_calls':'stop'}]};
  return new Response('data: '+JSON.stringify(chunk)+'\n\ndata: '+JSON.stringify({choices:[],usage:{prompt_tokens:20,completion_tokens:10,total_tokens:30}})+'\n\ndata: [DONE]\n\n',{headers:{'Content-Type':'text/event-stream'}});
 }});
 guard.listen(0,'127.0.0.1');await once(guard,'listening');
 const scopedConfig={...config,guardPort:guard.address().port};
 transport=await createWorkflowTransport({config:scopedConfig,secret:secrets()});
 const qualified='openrouter/'+model,alias=workflowAlias(qualified),profile=process.env.LOCALAGENT_STATE_DIR;
 writeFileSync(join(profile,'catalog.json'),JSON.stringify(catalog));
 writeFileSync(join(profile,'workflow-models.json'),JSON.stringify({[qualified]:{qualified,alias,provider:'openrouter',model}}));
 const generated=JSON.parse(readFileSync(join(profile,'opencode.json'),'utf8'));generated.provider.omniroute.models[alias]={tool_call:true,limit:{context:32768,output:100}};writeFileSync(join(profile,'opencode.json'),JSON.stringify(generated));
 engine=await startEngine({port:await port(),workflowTransport:transport});
 await assert.rejects(engine.verifyWorkflowPermissionEnforcement(),/bridge_unverified/);
 engine.verifyWorkflowPermissionEnforcement=async()=>{};
 for(const name of ['edit_allow','bash_allow','edit_deny','bash_deny','bash_interrupt']){
  const directory=join(profile,name);mkdirSync(directory);writeFileSync(join(directory,'target.mjs'),'export function double(n){ return n + 1; }\n');
  writeFileSync(join(directory,'check.test.mjs'),"import fs from 'node:fs';fs.writeFileSync('command-ran','yes');\n");
  const project={id:name,path:directory};tasks=createTasks(engine,{get:()=>project},{sessionFile:join(directory,'sessions.json'),pollMs:50,deadlineMs:20000});
  const role=name.startsWith('edit')?'implementer':'tester';
  let agents=[];for(let i=0;i<40;i++){const raw=(await engine.forProject(directory).v2.agent.list()).data;agents=Array.isArray(raw)?raw:raw?.data||[];if(agents.some(a=>a.id==='localagent-'+role))break;await new Promise(r=>setTimeout(r,100));}
  const agent=agents.find(a=>a.id==='localagent-'+role);assert.ok(agent);
  console.log(JSON.stringify({scenario:name,roleRules:agent.permissions.filter(r=>r.action==='edit'||r.action==='bash')}));
  const wf=createWorkflowInstance({workspaceDir:directory,plan:{id:'wf-'+name,title:name,policy:'free_only',budget:{maxSpendUsd:0,maxRequests:20,maxTokens:300000},stages:[{id:'work',agent:role,prompt:'CASE_'+name,assignedModel:qualified,...(role==='tester'?{testCommand:'node --test check.test.mjs'}:{targetFiles:['target.mjs']})}]}});
  let ended=false,error,result;const pending=runWorkflow({workflowId:wf.id,workspaceDir:directory,projectId:name,engine,tasks}).then(r=>{result=r;ended=true;},e=>{error=e;ended=true;});
  let permissions=0;const start=Date.now();
  while(!ended&&Date.now()-start<22000){
   const step=loadWorkflow(wf.id,directory).stepStates.work;
   if(step.sessionID&&name.endsWith('interrupt')){cancelWorkflow(wf.id,directory);await tasks.cancel(step.sessionID);}
   if(step.sessionID){const snap=await tasks.snapshot(step.sessionID);
    for(const p of snap.permissions){
     permissions++;assert.equal(readFileSync(join(directory,'target.mjs'),'utf8'),'export function double(n){ return n + 1; }\n');assert.equal(existsSync(join(directory,'command-ran')),false);
     if(name.endsWith('interrupt'))cancelWorkflow(wf.id,directory);
     else await tasks.permission(step.sessionID,p.id,name.endsWith('deny')?'reject':'once');
    }
   }
   await new Promise(r=>setTimeout(r,50));
  }
  if(!ended)cancelWorkflow(wf.id,directory);await pending;if(error)throw error;
  const edited=readFileSync(join(directory,'target.mjs'),'utf8').includes('n * 2'),commandRan=existsSync(join(directory,'command-ran'));
  const passed=name.endsWith('interrupt')?result.status==='cancelled'&&!edited&&!commandRan:permissions>0&&(name.endsWith('allow')?result.status==='completed':result.status!=='completed'&&!edited&&!commandRan);
  cases.push({name,permissions,status:result.status,edited,commandRan,passed});tasks.stop();tasks=null;
 }
 const passed=cases.every(c=>c.passed);mkdirSync('validation/phase8-permission-blocker',{recursive:true});writeFileSync('validation/phase8-permission-blocker/native-result.json',JSON.stringify({passed,cases,calls},null,2));if(!passed)process.exitCode=1;
 console.log(JSON.stringify({passed,nativeEngine:'1.18.31',actualGateway:'3.8.52',liveInferenceRequests:0,cases,calls}));
}finally{
 tasks?.stop();if(engine){const ended=once(engine.child,'exit');engine.stop();await ended;}await transport?.close();if(guard){guard.closeAllConnections();await new Promise(r=>guard.close(r));}
 if(platform){const ended=once(platform.child,'exit');platform.stop();await ended;}
}
