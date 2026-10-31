import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,mkdirSync,readFileSync,createReadStream} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
const registry=createRequire(import.meta.url)('../apps/desktop/registration.cjs');
const version=JSON.parse(readFileSync('apps/desktop/package.json')).version;
const installer=resolve(`release/desktop-${version}/LocalAgent-Setup-${version}-x64.exe`),target=resolve('.localagent/installed-'+Date.now());
if(!existsSync(installer))throw Error('Build the Windows installer first');
const report={installer,target};let installed=false;
const run=(exe,args,env=process.env)=>new Promise((r,j)=>{const child=spawn(exe,args,{env,windowsHide:true,stdio:'inherit'});child.once('error',j);child.once('exit',code=>r(code??1));});
const powershell=join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe');
try{
 if(registry.capture(target).keys.some(k=>k.exists))throw Error('existing_registration_do_not_test');report.registrationPreviouslyAbsent=true;
 const code=await run(powershell,['-NoProfile','-NonInteractive','-Command',"$p=Start-Process -FilePath $env:LOCALAGENT_INSTALLER_FILE -ArgumentList ('/S /D='+$env:LOCALAGENT_INSTALL_TEST_TARGET) -WindowStyle Hidden -PassThru; if(-not $p.WaitForExit(300000)){ & (Join-Path $env:SystemRoot 'System32/taskkill.exe') /PID $p.Id /T /F > $null; exit 124 }; exit $p.ExitCode"],{...process.env,LOCALAGENT_INSTALLER_FILE:installer,LOCALAGENT_INSTALL_TEST_TARGET:target});
 report.installExit=code;if(code!==0||!existsSync(join(target,'LocalAgent.exe')))throw Error('Silent installer did not produce its target application');installed=true;
 const builder=process.argv.includes('--builder');
 const e2e=await run(process.execPath,[builder?'scripts/verify-builder.mjs':'scripts/verify-desktop-app.mjs',...(builder?['--packaged','--memory-probe']:[]),...['--coding','--skip-screenshots'].filter(flag=>process.argv.includes(flag))],{...process.env,LOCALAGENT_DESKTOP_EXE:join(target,'LocalAgent.exe'),...(!builder?{LOCALAGENT_DESKTOP_EVIDENCE:'validation/phase4'}:{})});
 report.appTestExit=e2e;if(e2e!==0)throw Error('Installed application acceptance failed');report.installedAppVerified=true;
 if(process.argv.includes('--accessibility')){
   report.accessibilityExit=await run(process.execPath,['scripts/verify-release-ui.mjs'],{...process.env,LOCALAGENT_DESKTOP_EXE:join(target,'LocalAgent.exe')});
   if(report.accessibilityExit!==0)throw Error('Installed accessibility acceptance failed');
 }
}catch(e){report.passed=false;report.error=e.message;process.exitCode=1;}
finally{
 if(installed){
   const uninstaller=join(target,'Uninstall LocalAgent.exe');
   if(existsSync(uninstaller)){
     report.uninstallExit=await run(uninstaller,['/S']);
     const end=Date.now()+180000;while(existsSync(target)&&Date.now()<end)await new Promise(r=>setTimeout(r,300));
     report.applicationRemoved=!existsSync(join(target,'LocalAgent.exe'));
     report.installationDirectoryRemoved=!existsSync(target);report.registrationRemoved=registry.capture(target).keys.every(k=>!k.exists);
   }
 }
 const installerHash=createHash('sha256');for await(const data of createReadStream(installer))installerHash.update(data);report.sha256=installerHash.digest('hex');
 report.passed=!report.error&&report.installedAppVerified===true&&(!process.argv.includes('--accessibility')||report.accessibilityExit===0)&&report.uninstallExit===0&&report.applicationRemoved===true&&report.installationDirectoryRemoved===true&&report.registrationRemoved===true;
 if(!report.passed)process.exitCode=1;
 mkdirSync('validation/phase52',{recursive:true});writeFileSync('validation/phase52/installer.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}
