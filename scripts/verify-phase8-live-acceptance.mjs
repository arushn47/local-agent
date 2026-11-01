// Explicitly approved single attempt. Real product modules; no custom runner.
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createServer} from 'node:net';
import {once} from 'node:events';
import {spawnSync} from 'node:child_process';
if(!process.argv.includes('--approved-2026-11-01'))throw Error('explicit_approval_required');
const evidence=resolve('validation/phase8-live-'+Date.now());mkdirSync(evidence,{recursive:true});
const sandbox=mkdtempSync(join(tmpdir(),'localagent-live-')),projectDir=join(sandbox,'project'),profile=join(sandbox,'runtime');mkdirSync(projectDir);mkdirSync(profile);
process.env.LOCALAGENT_STATE_DIR=profile;
const {loadConfig,loadEnvironment,setCredentialOverlay,secrets}=await import('../src/config.mjs');
const {startPlatform}=await import('../src/runtime.mjs');const {startEngine}=await import('../src/workspace/engine.mjs');
const {createTasks}=await import('../src/workspace/tasks.mjs');const {projectStore}=await import('../src/workspace/projects.mjs');
const {createWorkspaceServer}=await import('../src/workspace/server.mjs');const {createWorkflowTransport}=await import('../src/workspace/workflow-transport.mjs');
const {loadCatalog}=await import('../src/catalog.mjs');const {cancelWorkflow}=await import('../src/workspace/workflow-engine.mjs');
const {launchBrowser}=await import('./browser.mjs');
const before='export function double(n) { return n + 1; }\n',testCode="import {test} from 'node:test'; import assert from 'node:assert/strict'; import {double} from '../double.mjs'; test('double',()=>{assert.equal(double(2),4);assert.equal(double(-3),-6);assert.equal(double(0),0);});\n";
mkdirSync(join(projectDir,'test'));writeFileSync(join(projectDir,'double.mjs'),before);writeFileSync(join(projectDir,'test/double.test.mjs'),testCode);
const independent=()=>spawnSync(process.execPath,['--test','test/double.test.mjs'],{cwd:projectDir,encoding:'utf8',windowsHide:true,timeout:5000});
assert.notEqual(independent().status,0);
const report={passed:false,liveAttempt:true,productionGateChanged:false,limits:{requests:8,reservedTokens:64000,wallMs:120000,spendUsd:0},sandbox,evidence,transitions:[],permissions:[]};
let platform,engine,tasks,server,transport,browser,project,wfId,expired=false;
const controller=new AbortController(),started=Date.now();
const stop=()=>{controller.abort();if(wfId&&project&&!report.workflowCompletedBeforeCleanup)try{cancelWorkflow(wfId,project.path);}catch{}tasks?.stop();engine?.stop();platform?.stop();};
const timer=setTimeout(()=>{expired=true;stop();},120000);
const port=async()=>{const s=createServer();s.listen(0,'127.0.0.1');await once(s,'listening');const p=s.address().port;await new Promise(r=>s.close(r));return p;};
try{
 const env=loadEnvironment();assert.equal(env.GEMINI_FREE_TIER_CONFIRMED,'true','free tier must be explicitly configured');assert.ok(env.GEMINI_API_KEY,'missing configured Gemini key');
 setCredentialOverlay({GROQ_API_KEY:null,OPENROUTER_API_KEY:null});
 const config=loadConfig();config.gatewayPort=await port();config.guardPort=await port();
 for(const [id,p] of Object.entries(config.providers))p.enabled=id==='gemini';
 config.providers.gemini.models=['gemini-3.5-flash-lite'];config.routingOrder=['gemini'];
 process.env.LOCALAGENT_CONFIG=join(profile,'config.json');writeFileSync(process.env.LOCALAGENT_CONFIG,JSON.stringify(config));
 platform=await startPlatform(config,{signal:controller.signal});
 const catalog=loadCatalog(),entry=catalog.providers.gemini,model=entry?.modelsDetailed?.['gemini-3.5-flash-lite'];
 assert.ok(entry?.allowed&&entry.models.includes(model?.id)&&model.freeTierVerified===true&&model.tier==='free'&&['prompt','completion','request'].every(k=>model.pricing[k]===0),'model eligibility missing');report.model={id:model.id,source:model.source,expiresAt:catalog.expiresAt};
 transport=await createWorkflowTransport({config,secret:secrets()});engine=await startEngine({port:await port(),signal:controller.signal,workflowTransport:transport});
 // Capability exists only on this disposable server instance. Product launch
 // never sets workflowReady; production remains gated regardless of outcome.
 const acceptanceEngine={...engine,workflowReady:true};const projects=projectStore();project=projects.add(projectDir);tasks=createTasks(engine,projects,{coordinateProject:true});
 server=createWorkspaceServer({config,projects,tasks,credentials:{},engine:acceptanceEngine,port:0});server.listen(0,'127.0.0.1');await once(server,'listening');
 browser=await launchBrowser();const page=await browser.newPage();const base=`http://127.0.0.1:${server.address().port}`;await page.goto(base,{waitUntil:'networkidle'});
 const api=(path,body)=>page.evaluate(async({path,body})=>{const r=await fetch('/api/v1/'+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json','X-LocalAgent-Request':'1'},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,data:await r.json()};},{path,body});
 const plan={id:'wf-live-double',title:'Approved bounded double fix',policy:'free_only',budget:{maxRequests:8,maxTokens:64000,maxSpendUsd:0},stages:[{id:'implement',agent:'implementer',title:'Fix double(n)',prompt:'Read double.mjs and change it so double(n) returns n * 2. Only edit double.mjs. Do not change tests.',targetFiles:['double.mjs'],assignedModel:'gemini/'+model.id},{id:'test',agent:'tester',title:'Run fixed tests',prompt:'Run exactly node --test test/double.test.mjs. Do not edit files.',testCommand:'node --test test/double.test.mjs',dependsOn:['implement'],assignedModel:'gemini/'+model.id}]};
 const created=await api(`projects/${project.id}/workflows`,{plan});assert.equal(created.status,201);wfId=plan.id;
 const answered=new Set();let final;
 while(!expired){
  const r=await api(`projects/${project.id}/workflows/${wfId}`);assert.equal(r.status,200);final=r.data;
  const states={workflow:final.status,steps:Object.fromEntries(Object.entries(final.stepStates).map(([id,s])=>[id,s.status]))};if(JSON.stringify(report.transitions.at(-1)?.states)!==JSON.stringify(states))report.transitions.push({elapsedMs:Date.now()-started,states});
  for(const step of Object.values(final.stepStates))if(step.sessionID){
   const snapshot=await api(`projects/${project.id}/workflows/${wfId}/session?stepId=${step.id}`);assert.equal(snapshot.status,200);
   for(const permission of snapshot.data.permissions||[])if(!answered.has(permission.id)){
    const patterns=permission.patterns||[];const edit=step.id==='implement'&&['edit','write'].includes(permission.permission)&&patterns.length&&patterns.every(p=>p.replaceAll('\\','/').endsWith('/double.mjs')||p==='double.mjs');
    const command=step.id==='test'&&permission.permission==='bash'&&patterns.length===1&&patterns[0]==='node --test test/double.test.mjs';
    report.permissions.push({step:step.id,permission:permission.permission,patterns,approved:!!(edit||command)});
    if(!edit&&!command)throw Error('unexpected_permission');answered.add(permission.id);assert.equal((await api(`sessions/${step.sessionID}/permission`,{requestID:permission.id,reply:'once'})).status,200);
   }
  }
  if(['completed','failed','cancelled','paused'].includes(final.status))break;
  await new Promise(r=>setTimeout(r,200));
 }
 report.workflow=final;report.workflowCompletedBeforeCleanup=final?.status==='completed';assert.ok(!expired,'wall limit reached');assert.equal(final?.status,'completed','workflow did not complete');
 assert.equal(readFileSync(join(projectDir,'test/double.test.mjs'),'utf8'),testCode);const after=readFileSync(join(projectDir,'double.mjs'),'utf8');assert.notEqual(after,before);
 const verified=independent();writeFileSync(join(evidence,'independent-tests.txt'),verified.stdout+verified.stderr);assert.equal(verified.status,0);report.independentTestsPassed=true;report.changes={before,after};
 report.passed=true;
}catch(error){report.failure={type:error.name,message:String(error.message).slice(0,400)};}
finally{
 clearTimeout(timer);report.elapsedMs=Date.now()-started;report.expired=expired;stop();await browser?.close();if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}await transport?.close();
 report.changes ||= {before,after:readFileSync(join(projectDir,'double.mjs'),'utf8')};
 const finalTests=independent();report.independentFinalExit=finalTests.status;writeFileSync(join(evidence,'final-tests.txt'),finalTests.stdout+finalTests.stderr);
 const wfFile=join(projectDir,'.localagent/workflows/wf-live-double.json');if(existsSync(wfFile))report.workflow=JSON.parse(readFileSync(wfFile,'utf8'));
 for(const file of ['routing.jsonl','budget-ledger.json','workflow-scopes.json'])if(existsSync(join(profile,file)))writeFileSync(join(evidence,file),readFileSync(join(profile,file)));
 const events=existsSync(join(evidence,'routing.jsonl'))?readFileSync(join(evidence,'routing.jsonl'),'utf8').trim().split('\n').filter(Boolean).map(JSON.parse):[];
 report.conservativeReservedTokens=events.filter(e=>e.event==='request').reduce((n,e)=>n+e.budget.estimatedInputTokens+e.budget.reservedOutputTokens,0);
 report.requests=events.filter(e=>e.event==='request').length;report.upstreamResponses=events.filter(e=>e.event==='upstream_headers').map(e=>({model:e.model,status:e.status}));report.usage=events.filter(e=>e.event==='completed').map(e=>({tokens:e.tokens,costUsd:e.costUsd}));
 if(report.requests>8||report.conservativeReservedTokens>64000||report.elapsedMs>120000||report.workflow?.status!=='completed'||!report.permissions.some(p=>p.step==='implement'&&p.approved)||!report.permissions.some(p=>p.step==='test'&&p.approved)||report.usage.some(u=>!u.tokens))report.passed=false;
 writeFileSync(join(evidence,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,failure:report.failure,requests:report.requests,elapsedMs:report.elapsedMs,evidence}));if(!report.passed)process.exitCode=1;
}
