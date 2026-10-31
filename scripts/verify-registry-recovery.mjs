import {createRequire} from 'node:module';
import {mkdirSync,writeFileSync,readFileSync,renameSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {spawnSync,spawn} from 'node:child_process';
const require=createRequire(import.meta.url),registry=require('../apps/desktop/registration.cjs'),upgrade=require('../apps/desktop/upgrade.cjs');
const base=resolve('.localagent/registry-recovery-'+Date.now()),target=join(base,'app');mkdirSync(base,{recursive:true});
const original=registry.capture(target);if(original.keys.some(k=>k.exists))throw Error('existing_registration_do_not_test');
const report={target,controlledLocalFixture:true,realWindowsRegistry:true,checks:{},inferenceRequests:0};
const assert=(x,m)=>{if(!x)throw Error(m);};
function fixture(dir,version){mkdirSync(join(dir,'resources/runtime'),{recursive:true});writeFileSync(join(dir,'resources/runtime/package.json'),JSON.stringify({name:'localagent-platform',version}));writeFileSync(join(dir,'LocalAgent.exe'),'fixture');}
function snapshot(version){return {format:1,target,keys:registry.keys.map((path,i)=>({path,exists:true,values:[{name:i?'UninstallString':'InstallLocation',kind:'String',value:i?'"'+join(target,'Uninstall LocalAgent.exe')+'"':target},...(i?[{name:'DisplayVersion',kind:'String',value:version}]:[{name:'TestDWord',kind:'DWord',value:17},{name:'TestBinary',kind:'Binary',value:[1,2,255]},{name:'TestExpand',kind:'ExpandString',value:'%LOCALAPPDATA%\\LocalAgent'},{name:'TestMulti',kind:'MultiString',value:['first','second']}])]}))};}
function normalized(s){return JSON.stringify({format:s.format,target:s.target,keys:s.keys.map(k=>({path:k.path,exists:k.exists,values:k.values.map(v=>({name:v.name,kind:v.kind,value:v.value})).sort((a,b)=>a.name.localeCompare(b.name))}))});}
try{
 const old=snapshot('0.5.0');registry.restore(old,target);const captured=registry.capture(target);assert(normalized(captured)===normalized(old),'typed_registry_roundtrip');report.checks.typedValues=true;
 fixture(target,'0.5.0');fixture(target+'.stage','0.5.1');
 // Terminate the real transaction helper immediately after its first rename.
 const source=`const fs=require('node:fs'),u=require(${JSON.stringify(resolve('apps/desktop/upgrade.cjs'))});u.install(process.argv[1],{validate:()=> '0.5.1',rename:(a,b)=>{fs.renameSync(a,b);process.exit(23)}});`;
 const child=spawnSync(process.execPath,['-e',source,target],{windowsHide:true});assert(child.status===23,'interruption_not_triggered');assert(existsSync(target+'.rollback')&&!existsSync(target),'interruption_boundary');
 upgrade.recover(target);assert(upgrade.product(target)==='0.5.0','interrupted_payload_restore');assert(normalized(registry.capture(target))===normalized(old),'interrupted_registry_restore');report.checks.processInterruptionAfterRename=true;
 upgrade.install(target,{validate:()=> '0.5.1'});registry.restore(snapshot('0.5.1'),target);upgrade.recover(target);assert(upgrade.product(target)==='0.5.0','rollback_payload');assert(normalized(registry.capture(target))===normalized(old),'rollback_registry');report.checks.registeredUpgradeRollback=true;
 upgrade.recover(target);assert(normalized(registry.capture(target))===normalized(old),'idempotent_recovery');report.checks.idempotence=true;
 upgrade.install(target,{validate:()=> '0.5.1'});registry.restore(snapshot('0.5.1'),target);
 const locker=spawn(join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-NonInteractive','-Command',"$f=[IO.File]::Open($env:LOCALAGENT_LOCK_TARGET,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read);try{[Console]::WriteLine('LOCKED');Start-Sleep -Milliseconds 700}finally{$f.Dispose()}"],{env:{...process.env,LOCALAGENT_LOCK_TARGET:join(target,'LocalAgent.exe')},windowsHide:true,stdio:'pipe'});
 await new Promise((r,j)=>{let output='';const timer=setTimeout(()=>{locker.kill();j(Error('sharing_fixture_timeout'));},10000);locker.stdout.on('data',b=>{output+=b;if(output.includes('LOCKED')){clearTimeout(timer);r();}});locker.once('error',j);});
 let denied=false;try{renameSync(target,target+'.sharing-probe');renameSync(target+'.sharing-probe',target);}catch(e){denied=['EPERM','EBUSY'].includes(e.code);}assert(denied,'Windows did not deny the controlled locked directory move');
 const retryStart=Date.now();upgrade.recover(target);report.sharingRetryMs=Date.now()-retryStart;if(locker.exitCode===null)await new Promise(r=>locker.once('exit',r));assert(upgrade.product(target)==='0.5.0'&&normalized(registry.capture(target))===normalized(old),'sharing_retry_restore');report.checks.realWindowsSharingRetry=true;
 report.passed=true;
}catch(e){report.passed=false;report.error=e.message;process.exitCode=1;}
finally{registry.restore(original,target);report.registrationCleaned=registry.capture(target).keys.every(k=>!k.exists);mkdirSync('validation/phase52',{recursive:true});writeFileSync('validation/phase52/registry-recovery.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
