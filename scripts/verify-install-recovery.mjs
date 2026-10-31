import {mkdirSync,writeFileSync,readFileSync,existsSync,copyFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),registry=require('../apps/desktop/registration.cjs'),recovery=require('../apps/desktop/installer-recovery.cjs'),upgrade=require('../apps/desktop/upgrade.cjs');
const base=resolve('.localagent/install-recovery-native-'+Date.now()),target=join(base,'app'),out=resolve('validation/phase52-install-fix');mkdirSync(target,{recursive:true});mkdirSync(target+'.stage');writeFileSync(target+'.stage/keep.txt','unverified retained material');
const old=resolve('release/desktop-0.5.2/LocalAgent-Setup-0.5.2-x64.exe'),fixed=resolve('release/desktop-0.5.2-recovery2/LocalAgent-Setup-0.5.2-recovery2-x64.exe'),prior=resolve('release/desktop-0.5.1/LocalAgent-Setup-0.5.1-x64.exe');
const report={target,inferenceRequests:0,checks:{}};const check=(v,m)=>{if(!v)throw Error(m);};
async function run(exe,args){return new Promise((r,j)=>{const p=spawn(exe,args,{windowsHide:true,stdio:'ignore'});p.once('exit',r);p.once('error',j);});}
async function install(exe){const env={...process.env,LOCALAGENT_FIX_INSTALLER:exe,LOCALAGENT_FIX_TARGET:target};return new Promise((r,j)=>{const p=spawn(join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-NonInteractive','-Command',"$p=Start-Process -FilePath $env:LOCALAGENT_FIX_INSTALLER -ArgumentList ('/S /D='+$env:LOCALAGENT_FIX_TARGET) -WindowStyle Hidden -PassThru;if(-not $p.WaitForExit(300000)){exit 124};exit $p.ExitCode"],{env,windowsHide:true,stdio:'inherit'});p.once('exit',r);p.once('error',j);});}
try{
 check(registry.capture(target).keys.every(k=>!k.exists),'Existing user registration; do not test');
 check(await install(old)!==0,'Original installer should reject stage');check(readFileSync(target+'.stage/keep.txt','utf8')==='unverified retained material','Original material changed');report.checks.originalFailureReproduced=true;
 check(await install(fixed)!==0,'Silent recovery must default to cancel');check(readFileSync(target+'.stage/keep.txt','utf8')==='unverified retained material','Silent cancellation changed material');report.checks.safeSilentDefault=true;
 const saved=recovery.preserve(target);check(readFileSync(join(saved.directory,'stage/keep.txt'),'utf8')==='unverified retained material','Preserved material lost');report.checks.preserveUnknownMaterial=true;
 check(await install(prior)===0,'Prior install failed');recovery.preserve(target);
 check(await install(fixed)===0,'Recovery installer upgrade failed');check(upgrade.product(target)==='0.5.2','Wrong activated version');report.checks.upgrade=true;
 upgrade.recover(target);check(upgrade.product(target)==='0.5.1','Rollback failed');check(registry.capture(target).keys[1].values.find(v=>v.name==='DisplayVersion').value==='0.5.1','Rollback registration mismatch');report.checks.rollback=true;
 recovery.preserve(target);check(await install(fixed)===0,'Retry after restored transaction failed');report.checks.retryAfterRollback=true;
 const kept=recovery.preserve(target);check(upgrade.product(target)==='0.5.2'&&upgrade.product(join(kept.directory,'rollback'))==='0.5.1','Committed upgrade was rolled back');report.checks.committedVersionNotUndone=true;
 report.passed=true;
}catch(e){report.passed=false;report.error=e.message;process.exitCode=1;}
finally{if(existsSync(join(target,'Uninstall LocalAgent.exe'))){report.uninstallExit=await run(join(target,'Uninstall LocalAgent.exe'),['/S']);const end=Date.now()+120000;while(existsSync(target)&&Date.now()<end)await new Promise(r=>setTimeout(r,250));}report.registrationRemoved=registry.capture(target).keys.every(k=>!k.exists);report.passed=report.passed&&report.uninstallExit===0&&!existsSync(target)&&report.registrationRemoved;if(!report.passed)process.exitCode=1;writeFileSync(join(out,'native.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
