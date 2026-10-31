// Isolated no-key startup: never submit a prompt or download a local model.
import { join } from 'node:path';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
process.env.LOCALAGENT_STATE_DIR=join(root,'.localagent','empty-workspace-'+Date.now());
const { loadConfig,setCredentialOverlay }=await import('../src/config.mjs');
setCredentialOverlay({GEMINI_API_KEY:null,GROQ_API_KEY:null,OPENROUTER_API_KEY:null});
const {startPlatform}=await import('../src/runtime.mjs');
const {startEngine}=await import('../src/workspace/engine.mjs');
const {management}=await import('../src/omniroute.mjs');
const {createWorkspaceServer}=await import('../src/workspace/server.mjs');
const config=loadConfig();config.gatewayPort=20154;config.guardPort=20155;
// Do not contact an unrelated local Ollama service in this empty installation check.
config.providers.ollama.enabled=false;
let platform,engine,server;
const report={inferenceRequests:0,freshState:true,credentialsSupplied:false};
try{
 platform=await startPlatform(config);engine=await startEngine({port:20156});
 server=createWorkspaceServer({config,projects:{list:()=>[]},tasks:{},credentials:{},port:0});
 await new Promise((r,j)=>{server.once('error',j);server.listen(0,'127.0.0.1',r);});
 const base='http://127.0.0.1:'+server.address().port;
 const page=await fetch(base),cookie=page.headers.get('set-cookie').split(';')[0];await page.text();
 const status=await (await fetch(base+'/api/v1/status',{headers:{cookie}})).json();
 if(status.plan.targets.length||status.providers.filter(p=>!p.local).some(p=>p.configured))throw Error('Empty installation admitted a cloud route');
 const keys=await (await management(config))('/api/keys');
 const key=(Array.isArray(keys)?keys:keys.keys).find(k=>k.name==='LocalAgent OpenCode');
 if(key?.isActive!==false)throw Error('Empty installation inference key was not disabled');
 report.inferenceKeyActive=false;
 report.runtimeReady=true;report.engineReady=true;report.codingTargets=status.plan.targets.length;report.passed=true;
}catch(e){report.passed=false;report.error=e.message;process.exitCode=1;}
finally{server?.closeAllConnections();server?.close();engine?.stop();platform?.stop();writeFileSync(join(root,'validation/phase2/empty-workspace.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
