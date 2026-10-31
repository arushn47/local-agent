import {createRequire} from 'node:module';
import {_electron} from 'playwright';
import {spawn} from 'node:child_process';
import {mkdirSync,readFileSync,writeFileSync,existsSync,copyFileSync,rmSync,realpathSync} from 'node:fs';
import {resolve,join,sep} from 'node:path';
import {createHash} from 'node:crypto';
import {dpapi} from '../src/workspace/credentials.mjs';
const registry=createRequire(import.meta.url)('../apps/desktop/registration.cjs');
const to=JSON.parse(readFileSync('apps/desktop/package.json')).version;
const from=process.argv.find(x=>x.startsWith('--from='))?.split('=')[1];if(!['0.3.0','0.4.0','0.5.0','0.5.1'].includes(from))throw Error('Choose --from=0.3.0 or --from=0.4.0');
const base=resolve('.localagent/upgrade-'+from+'-'+Date.now()),target=join(base,'app'),profile=join(base,'profile'),project=join(base,'project'),evidence=resolve('validation/phase52');mkdirSync(base,{recursive:true});mkdirSync(project);mkdirSync(join(profile,'runtime'),{recursive:true});mkdirSync(evidence,{recursive:true});
const oldInstaller=resolve(from==='0.3.0'?'release/LocalAgent-Setup-0.3.0-x64.exe':`release/desktop-${from}/LocalAgent-Setup-${from}-x64.exe`),newInstaller=resolve(`release/desktop-${to}/LocalAgent-Setup-${to}-x64.exe`);
const report={from,to,target,profile,project,inferenceRequests:0,checks:{}};
const check=(c,m)=>{if(!c)throw Error(m);},hash=x=>createHash('sha256').update(x).digest('hex');
const run=(exe,args,env=process.env)=>new Promise((r,j)=>{const c=spawn(exe,args,{env,windowsHide:true,stdio:'pipe'});let out='';c.stdout?.on('data',b=>out+=b);c.stderr?.on('data',b=>out+=b);const t=setTimeout(()=>{c.kill();j(Error('installer_timeout'));},300000);c.once('error',j);c.once('exit',code=>{clearTimeout(t);r({code,output:out.slice(-2000)});});});
const powershell=join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe');
async function install(file){const r=await run(powershell,['-NoProfile','-NonInteractive','-Command',"$p=Start-Process -FilePath $env:LOCALAGENT_INSTALLER_FILE -ArgumentList ('/S /D='+$env:LOCALAGENT_INSTALL_TEST_TARGET) -WindowStyle Hidden -PassThru; if(-not $p.WaitForExit(280000)){ & (Join-Path $env:SystemRoot 'System32/taskkill.exe') /PID $p.Id /T /F > $null;exit 124};exit $p.ExitCode"],{...process.env,LOCALAGENT_INSTALLER_FILE:file,LOCALAGENT_INSTALL_TEST_TARGET:target});check(r.code===0,'Installer failed '+r.code);return r.code;}
async function installFailure(file){const r=await run(powershell,['-NoProfile','-NonInteractive','-Command',"$p=Start-Process -FilePath $env:LOCALAGENT_INSTALLER_FILE -ArgumentList ('/S /D='+$env:LOCALAGENT_INSTALL_TEST_TARGET) -WindowStyle Hidden -PassThru;if(-not $p.WaitForExit(280000)){ & (Join-Path $env:SystemRoot 'System32/taskkill.exe') /PID $p.Id /T /F > $null;exit 124};exit $p.ExitCode"],{...process.env,LOCALAGENT_INSTALLER_FILE:file,LOCALAGENT_INSTALL_TEST_TARGET:target});return r.code;}
let app;
const alive=pid=>{try{process.kill(pid,0);return true;}catch{return false;}};
async function closeApp(){const current=app;if(!current)return;const meta=JSON.parse(readFileSync(join(profile,'runtime/desktop-state.json'))),chrome=await current.evaluate(({app})=>app.getAppMetrics().map(p=>p.pid)),pids=[...new Set([current.process().pid,...chrome,meta.pid,...meta.children.map(c=>c.pid)])].filter(Number.isInteger);await current.close();app=undefined;const start=Date.now(),remainingAtClose=pids.filter(alive);while(pids.some(alive)&&Date.now()-start<12000)await new Promise(r=>setTimeout(r,50));(report.shutdownObservations||=[]).push({remainingAtClose,waitMs:Date.now()-start,allExited:!pids.some(alive)});check(!pids.some(alive),'owned_processes_remained_after_shutdown');}

async function launch(expected,seed=false){
 const env={...process.env,LOCALAGENT_USER_DATA_DIR:profile,PATH:process.env.SystemRoot+'\\System32;'+process.env.SystemRoot};for(const k of Object.keys(env))if(/API_KEY|TOKEN|SECRET|PASSWORD/i.test(k)||k.toLowerCase()==='path'&&k!=='PATH')delete env[k];
 const start=Date.now();app=await _electron.launch({executablePath:join(target,'LocalAgent.exe'),env,timeout:30000});const page=await app.firstWindow();await page.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name:/^Connections/}).waitFor({timeout:180000});
 const version=await app.evaluate(({app})=>app.getVersion());check(version===expected,'Wrong installed app version');
 if(seed){await page.getByLabel('Open a local project',{exact:true}).fill(project);await page.getByRole('button',{name:'Open project',exact:true}).click();await page.getByLabel('Describe your coding task').fill('Retain my upgrade draft.');await page.evaluate(()=>localStorage.setItem('phase5-setting','preserve'));}
 else{await page.getByLabel('Describe your coding task').waitFor();check(await page.getByLabel('Describe your coding task').inputValue()==='Retain my upgrade draft.','Upgrade lost draft/project');check(await page.evaluate(()=>localStorage.getItem('phase5-setting'))==='preserve','Upgrade lost settings');}
 const status=await page.evaluate(async()=>{const r=await fetch('/api/v1/status');return r.json();});check(status.providers.find(p=>p.id==='gemini')?.configured===true&&status.plan.targets.length===0,'Protected placeholder credential/eligibility not preserved');
 const bytes=readFileSync(join(profile,'runtime/credentials.dpapi'));check(hash(bytes)===report.credentialHash,'Encrypted credential changed');check(JSON.parse((await dpapi(bytes,true)).toString()).GEMINI_API_KEY===placeholder.GEMINI_API_KEY,'Credential no longer decrypts');
 const result={version,startupMs:Date.now()-start,projects:true,draft:true,settings:true,encryptedCredential:true,routingPlanEmpty:true};await closeApp();return result;
}
const placeholder={GEMINI_API_KEY:'phase5-offline-placeholder-no-live-key',GEMINI_FREE_TIER_CONFIRMED:null};
try{
 const encrypted=await dpapi(Buffer.from(JSON.stringify(placeholder)));writeFileSync(join(profile,'runtime/credentials.dpapi'),encrypted);report.credentialHash=hash(encrypted);writeFileSync(join(project,'keep.txt'),'project content preserved');
 if(registry.capture(target).keys.some(k=>k.exists))throw Error('existing_registration_do_not_test');
 report.oldInstall=await install(oldInstaller);report.previousRegistration=registry.capture(target);report.before=await launch(from,true);report.checks.oldLaunch=true;
 if(process.argv.includes('--interrupt-extraction')){
  const previous=registry.capture(target),exeHash=hash(readFileSync(join(target,'LocalAgent.exe')));
  const interruption=await run(powershell,['-NoProfile','-NonInteractive','-Command',"$p=Start-Process -FilePath $env:LOCALAGENT_INSTALLER_FILE -ArgumentList ('/S /D='+$env:LOCALAGENT_INSTALL_TEST_TARGET) -WindowStyle Hidden -PassThru;$end=[DateTime]::UtcNow.AddSeconds(120);while(-not (Test-Path -LiteralPath ($env:LOCALAGENT_INSTALL_TEST_TARGET+'.stage')) -and -not $p.HasExited -and [DateTime]::UtcNow -lt $end){Start-Sleep -Milliseconds 100};if($p.HasExited){exit 21};if(-not(Test-Path -LiteralPath ($env:LOCALAGENT_INSTALL_TEST_TARGET+'.stage'))){exit 22};Start-Sleep -Milliseconds 300;& (Join-Path $env:SystemRoot 'System32/taskkill.exe') /PID $p.Id /T /F > $null;exit $LASTEXITCODE"],{...process.env,LOCALAGENT_INSTALLER_FILE:newInstaller,LOCALAGENT_INSTALL_TEST_TARGET:target});
  check(interruption.code===0,'Installer interruption failed');check(hash(readFileSync(join(target,'LocalAgent.exe')))===exeHash,'Interrupted extraction changed old app');check(JSON.stringify(registry.capture(target))===JSON.stringify(previous),'Interrupted extraction changed registration');
  const interrupted=target+'.stage';if(!realpathSync(interrupted).startsWith(base+sep))throw Error('unsafe_interruption_cleanup');rmSync(interrupted,{recursive:true,force:true,maxRetries:10,retryDelay:300});report.checks.actualInstallerExtractionInterruption=true;
 }

 if(process.argv.includes('--locked-file')){
  const previous=registry.capture(target),exeHash=hash(readFileSync(join(target,'LocalAgent.exe')));
  const locker=spawn(powershell,['-NoProfile','-NonInteractive','-Command',"$f=[IO.File]::Open($env:LOCALAGENT_LOCK_TARGET,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read);try{[Console]::WriteLine('LOCKED');[Console]::In.ReadLine()|Out-Null}finally{$f.Dispose()}"],{env:{...process.env,LOCALAGENT_LOCK_TARGET:join(target,'LocalAgent.exe')},windowsHide:true,stdio:'pipe'});
  await new Promise((r,j)=>{let text='';const timer=setTimeout(()=>{locker.kill();j(Error('lock_fixture_timeout'));},10000);locker.stdout.on('data',b=>{text+=b;if(text.includes('LOCKED')){clearTimeout(timer);r();}});locker.once('error',j);});
  try{const result=await installFailure(newInstaller);check(result!==0&&result!==124,'Locked-file fixture did not reject promptly');check(hash(readFileSync(join(target,'LocalAgent.exe')))===exeHash,'Locked-file failure changed prior payload');check(JSON.stringify(registry.capture(target))===JSON.stringify(previous),'Locked-file failure changed registration');report.checks.actualInstallerLockedFileFailure=true;}
  finally{locker.stdin.end('\n');await new Promise(r=>locker.once('exit',r));}
  const locked=target+'.stage';check(realpathSync(locked).startsWith(base+sep),'unsafe_locked_stage_cleanup');rmSync(locked,{recursive:true,force:true,maxRetries:5,retryDelay:300});
 }
 const failureInstaller=process.argv.find(x=>x.startsWith('--failure-installer='))?.slice('--failure-installer='.length);
 if(failureInstaller){
  const previous=registry.capture(target);const result=await installFailure(resolve(failureInstaller));check(result!==0&&result!==124,'Failure fixture unexpectedly succeeded or timed out');check(readFileSync(target+'.fixture-commit.json','utf8').trim()==='0','Failure fixture did not reach a successful registration commit');check(JSON.parse(readFileSync(target+'.transaction.json')).state==='rolled_back','Installer did not complete automatic rollback');check(JSON.parse(readFileSync(join(target,'resources/runtime/package.json'))).version===from,'Installer callback did not restore old payload');
  const normalize=s=>JSON.stringify(s.keys.map(k=>({path:k.path,exists:k.exists,values:k.values.map(v=>({name:v.name,kind:v.kind,value:v.value})).sort((a,b)=>a.name.localeCompare(b.name))})));check(normalize(registry.capture(target))===normalize(previous),'Installer callback did not restore registration');report.checks.actualInstallerPostRegistrationFailureRecovery=true;report.afterFailedUpgrade=await launch(from);
  const failed=target+'.stage';check(realpathSync(failed).startsWith(base+sep),'unsafe_failed_candidate_cleanup');rmSync(failed,{recursive:true,force:true,maxRetries:5,retryDelay:300});
 }
 // Exercise the real installer helper's validation rejection, not a patched
 // runtime or provider. The incomplete candidate must not move the old app.
 const broken=target+'.stage';mkdirSync(join(broken,'resources/runtime'),{recursive:true});writeFileSync(join(broken,'resources/runtime/package.json'),JSON.stringify({name:'localagent-platform',version:to}));writeFileSync(join(broken,'LocalAgent.exe'),'incomplete candidate');
 const oldHash=hash(readFileSync(join(target,'LocalAgent.exe'))),failure=await run(process.execPath,[resolve('apps/desktop/upgrade.cjs'),'install',target]);check(failure.code!==0,'Incomplete candidate was accepted');check(hash(readFileSync(join(target,'LocalAgent.exe')))===oldHash&&!existsSync(target+'.rollback'),'Failed validation modified the previous app');report.checks.incompleteCandidateRejected=true;
 if(!realpathSync(broken).startsWith(base+sep))throw Error('unsafe_stage_cleanup');rmSync(broken,{recursive:true,force:true});
 report.upgradeInstall=await install(newInstaller);report.after=await launch(to);report.checks.upgrade=true;check(readFileSync(join(project,'keep.txt'),'utf8')==='project content preserved','Project modified');
 check(existsSync(target+'.rollback/LocalAgent.exe'),'Previous app not retained');report.checks.rollbackRetained=true;
 // Run recovery with a temporary copy of Node, outside both payload directories.
 const recoveryNode=join(base,'recovery-node.exe'),helper=join(base,'upgrade.cjs');copyFileSync(join(target,'resources/node/node.exe'),recoveryNode);copyFileSync(join(target,'resources/upgrade.cjs'),helper);copyFileSync(resolve('apps/desktop/registration.cjs'),join(base,'registration.cjs'));
 // Use current recovery helper even when testing legacy installers.
 copyFileSync(resolve('apps/desktop/upgrade.cjs'),helper);
 const recovery=await run(recoveryNode,[helper,'recover',target]);check(recovery.code===0,'Rollback failed '+recovery.output);report.rollback=await launch(from);report.checks.rollback=true;
 const normalize=s=>JSON.stringify(s.keys.map(k=>({path:k.path,exists:k.exists,values:k.values.map(v=>({name:v.name,kind:v.kind,value:v.value})).sort((a,b)=>a.name.localeCompare(b.name))})));check(normalize(registry.capture(target))===normalize(report.previousRegistration),'Rollback lost registration');report.checks.registrationRestored=true;
 report.passed=true;
}catch(e){report.passed=false;report.error=e.message;process.exitCode=1;}
finally{
 if(app)await closeApp().catch(()=>{});
 if(existsSync(join(target,'Uninstall LocalAgent.exe'))){const r=await run(join(target,'Uninstall LocalAgent.exe'),['/S']);report.uninstallExit=r.code;const end=Date.now()+180000;while(existsSync(target)&&Date.now()<end)await new Promise(r=>setTimeout(r,300));report.applicationRemoved=!existsSync(target);}
 // Only disposable owned sibling payloads; profile/project evidence retained.
 const retainFailure=!report.passed&&process.argv.includes('--retain-on-failure');
 if(!retainFailure)for(const name of ['app.stage','app.rollback']){const p=resolve(base,name);if(!p.startsWith(base+sep)||existsSync(p)&&!realpathSync(p).startsWith(base+sep))throw Error('unsafe_test_cleanup');rmSync(p,{recursive:true,force:true,maxRetries:2,retryDelay:150});}
 report.disposablePayloadsRemoved=!retainFailure;report.userDataRetained=existsSync(join(profile,'runtime/credentials.dpapi'))&&hash(readFileSync(join(profile,'runtime/credentials.dpapi')))===report.credentialHash&&readFileSync(join(project,'keep.txt'),'utf8')==='project content preserved';try{report.registrationRemoved=registry.capture(target).keys.every(k=>!k.exists);}catch{report.registrationRemoved=false;}report.passed=report.passed===true&&report.uninstallExit===0&&report.applicationRemoved===true&&report.userDataRetained===true&&report.registrationRemoved===true;if(!report.passed)process.exitCode=1;
 writeFileSync(join(evidence,'upgrade-'+from+'.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}
