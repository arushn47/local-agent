import {createRuntimeSupervisor} from '../apps/desktop/src/runtime-supervisor.mjs';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {spawnSync} from 'node:child_process';
const label=process.argv[2]||'baseline',directory=resolve('validation/phase51');mkdirSync(directory,{recursive:true});
const profile=resolve('.localagent/phase51-profile-'+label+'-'+Date.now()),start=performance.now(),events=[];
const supervisor=createRuntimeSupervisor({nodePath:resolve('.localagent/desktop-node/node.exe'),workerPath:resolve('src/workspace/desktop-worker.mjs'),stateDir:profile,onChange:s=>{if(events.at(-1)?.stage!==s.stage)events.push({stage:s.stage,elapsedMs:Math.round(performance.now()-start)});}});
const report={label,profile,conditions:'Fresh application profile; OS file cache not purged or controlled. No inference.',events,inferenceRequests:0};
function memory(){const meta=JSON.parse(readFileSync(join(profile,'desktop-state.json'))),ids=[meta.pid,...meta.children.map(c=>c.pid)].filter(Number.isInteger);const r=spawnSync(join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-NonInteractive','-Command',"$ids=$env:LOCALAGENT_METRIC_IDS.Split(',')|ForEach-Object {[int]$_};Get-Process -Id $ids | Select-Object Id,CPU,WorkingSet64,PrivateMemorySize64 | ConvertTo-Json -Compress"],{env:{...process.env,LOCALAGENT_METRIC_IDS:ids.join(',')},windowsHide:true,encoding:'utf8',timeout:15000});if(r.status!==0)throw Error('memory_sample_failed');return {roles:meta.children,processes:JSON.parse(r.stdout)};}
let cookie;
try{
 const url=await supervisor.start();report.readyMs=Math.round(performance.now()-start);
 await supervisor.authenticateSession({cookies:{set:async c=>{cookie=`${c.name}=${c.value}`;}}});
 const api=async(path,body)=>{const r=await fetch(url+'/api/v1/'+path,{method:body===undefined?'GET':'POST',headers:{cookie,origin:url,'X-LocalAgent-Request':'1','Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});if(!r.ok)throw Error('profile_api_'+r.status);return r.json();};
 const status=await api('status');if(status.plan.targets.length)throw Error('Unexpected inference route in fresh profile');
 await new Promise(r=>setTimeout(r,5000));report.idle=memory();
 // Exercise real engine/session and static validation IO without a model prompt.
 const projectDir=resolve('.workspace-check/profile-'+label+'-'+Date.now());mkdirSync(projectDir,{recursive:true});writeFileSync(join(projectDir,'index.html'),'<h1>Profile fixture</h1>');writeFileSync(join(projectDir,'app.mjs'),'export const value=42;');
 const project=await api('projects',{path:projectDir}),session=await api(`projects/${project.id}/sessions`,{});
 for(let i=0;i<12;i++)await api('sessions/'+session.id);
 await api(`projects/${project.id}/preview/start`,{});await api(`projects/${project.id}/preview/build`,{});report.active=memory();
 await api(`projects/${project.id}/preview/stop`,{});await new Promise(r=>setTimeout(r,5000));report.after=memory();
 if(process.env.LOCALAGENT_PROFILE_SOAK==='1'){report.soak=[];for(let round=0;round<8;round++){for(let n=0;n<15;n++)await api('sessions/'+session.id);await new Promise(r=>setTimeout(r,15000));report.soak.push({round,elapsedMs:Math.round(performance.now()-start),...memory()});}}
 report.passed=true;
}catch(e){report.passed=false;report.error=e.message;process.exitCode=1;}
finally{await supervisor.stop();report.shutdown=true;writeFileSync(join(directory,'profile-'+label+'.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
