import {createRuntimeSupervisor} from '../apps/desktop/src/runtime-supervisor.mjs';
import {resolve,join} from 'node:path';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
const root=resolve('.'),stateDir=join(root,'.localagent/phase3-runtime-'+Date.now());
mkdirSync('validation/phase3',{recursive:true});
let status;const supervisor=createRuntimeSupervisor({nodePath:join(root,'.localagent/desktop-node/node.exe'),workerPath:join(root,'src/workspace/desktop-worker.mjs'),stateDir,onChange:s=>status=s});
const report={providerInferenceRequested:false};
const wait=async fn=>{const deadline=Date.now()+15000;while(Date.now()<deadline){if(fn())return;await new Promise(r=>setTimeout(r,200));}throw Error('Lifecycle verification timeout');};
try{
 const start=Date.now(),url=await supervisor.start();report.startupMs=Date.now()-start;
 const response=await fetch(url),cookie=response.headers.get('set-cookie').split(';')[0];await response.text();
 const statusResponse=await fetch(url+'/api/v1/status',{headers:{cookie}});const data=await statusResponse.json();if(data.plan.targets.length)throw Error('Fresh desktop unexpectedly configured inference');report.freshStartup=true;
 const first=JSON.parse(readFileSync(join(stateDir,'desktop-state.json')));const engine=first.children.find(c=>c.service==='engine');
 process.kill(engine.pid);await wait(()=>status.state==='failed');report.engineCrashDetected=true;
 await supervisor.stop();const second=await supervisor.start();if(second!==url)throw Error('Runtime restart changed origin');
 if((await fetch(url+'/api/v1/projects',{headers:{cookie}})).status!==200)throw Error('Restart lost desktop session authentication');report.restart=true;
 await supervisor.stop();report.shutdown=true;report.passed=true;
}catch(e){report.passed=false;report.error=e.message;process.exitCode=1;}
finally{await supervisor.stop();writeFileSync('validation/phase3/runtime-lifecycle.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
