// Isolated, metadata-only startup acceptance. No provider inference or production state changes.
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { root } from '../src/config.mjs';
const directory=join(root,'.localagent','startup-acceptance-'+Date.now());
mkdirSync(directory,{recursive:true});
// Import configuration after setting state isolation (the initial root import is cached,
// so launch this small fixture as a separate process).
if (!process.env.LOCALAGENT_STARTUP_FIXTURE) {
  const { spawn }=await import('node:child_process');
  const child=spawn(process.execPath,[import.meta.filename],{cwd:root,windowsHide:true,env:{...process.env,LOCALAGENT_STARTUP_FIXTURE:'1',LOCALAGENT_STATE_DIR:directory},stdio:'inherit'});
  process.exitCode=await new Promise(r=>child.once('exit',code=>r(code??1)));
} else {
  const {loadConfig,requestJSON,guardToken,secrets,stateDir}=await import('../src/config.mjs');
  const {startPlatform}=await import('../src/runtime.mjs');
  const {checkRuntimes}=await import('../src/runtime-dependencies.mjs');
  const config=loadConfig();config.gatewayPort=20241;config.guardPort=20242;
  let runtime;
  try {
    runtime=await startPlatform(config);
    const status=await requestJSON(`http://127.0.0.1:${config.guardPort}/api/v1/runtime`,{headers:{Authorization:'Bearer '+guardToken(secrets(),'admin')}});
    if(!status.ready)throw Error('Runtime did not reach ready');
    const audit=join(stateDir,'routing.jsonl');
    const inferenceRequests=existsSync(audit)?readFileSync(audit,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse).filter(e=>e.event==='request').length:0;
    if(inferenceRequests)throw Error('Startup unexpectedly dispatched inference');
    const report={...checkRuntimes(),runtime:status,isolatedState:true,inferenceRequests,routePlan:JSON.parse(readFileSync(join(stateDir,'route-plan.json'),'utf8'))};
    mkdirSync(join(root,'validation'),{recursive:true});
    writeFileSync(join(root,'validation/phase1-startup.json'),JSON.stringify(report,null,2));
  } finally { runtime?.stop(); }
}
