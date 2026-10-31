import {_electron as electron} from 'playwright';
import {mkdirSync,writeFileSync,readFileSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {loadEnvironment} from '../src/config.mjs';
const executablePath=resolve(process.env.LOCALAGENT_DESKTOP_EXE||'release/win-unpacked/LocalAgent.exe');
const directory=resolve(process.env.LOCALAGENT_DESKTOP_EVIDENCE||'validation/phase3');mkdirSync(directory,{recursive:true});
const profile=resolve(process.env.LOCALAGENT_DESKTOP_TEST_PROFILE||'.localagent/desktop-acceptance-'+Date.now());
const fixture=resolve('.workspace-check/desktop-'+Date.now());mkdirSync(fixture,{recursive:true});
writeFileSync(join(fixture,'sum.mjs'),'export function add(a, b) { return a - b; }\n');
spawnSync('git',['init',fixture],{windowsHide:true,stdio:'ignore'});spawnSync('git',['-C',fixture,'add','sum.mjs'],{windowsHide:true,stdio:'ignore'});
const report={executablePath,profile,fixture,inferenceRequested:false,errors:[]};
const secrets=loadEnvironment();
const redact=text=>Object.entries(secrets).reduce((value,[key,secret])=>/API_KEY|TOKEN|SECRET|PASSWORD/i.test(key)&&secret?value.replaceAll(secret,'[redacted]'):value,String(text));
const check=(value,message)=>{if(!value)throw Error(message);};
const alive=pid=>{try{process.kill(pid,0);return true;}catch{return false;}};
const wait=async(fn,ms=15000)=>{const end=Date.now()+ms;while(Date.now()<end){if(await fn())return;await new Promise(r=>setTimeout(r,200));}throw Error('Timed out waiting for lifecycle state');};
let app,page;
const capture=async name=>{
 if(process.argv.includes('--skip-screenshots')){report.visualCapture='skipped';return;}
 await page.screenshot({path:join(directory,name),fullPage:true});
};
const api=async(path,body)=>page.evaluate(async({path,body})=>{const r=await fetch('/api/v1/'+path,{...(body===undefined?{}:{method:'POST',body:JSON.stringify(body)}),headers:{'Content-Type':'application/json','X-LocalAgent-Request':'1'}});return {status:r.status,data:await r.json()};},{path,body});
async function launch(){
 const env={...process.env,LOCALAGENT_USER_DATA_DIR:profile,PATH:process.env.SystemRoot+'\\System32;'+process.env.SystemRoot};
 for(const key of Object.keys(env))if(/API_KEY|TOKEN|SECRET|PASSWORD/i.test(key))delete env[key];
 app=await electron.launch({executablePath,env,timeout:30000});page=await app.firstWindow();
 page.on('pageerror',e=>report.errors.push(e.message));
 await wait(()=>{try{return ['ready','failed'].includes(metadata().state);}catch{return false;}},180000);
 check(metadata().state==='ready','Packaged runtime startup failed: '+metadata().code);
 await page.waitForURL('http://127.0.0.1:*/',{timeout:30000});
 await page.getByRole('button',{name:'Workspace',exact:true}).waitFor();
}
const metadata=()=>JSON.parse(readFileSync(join(profile,'runtime/desktop-state.json')));
try{
 await launch();
 report.runtime=await app.evaluate(({app,BrowserWindow})=>({packaged:app.isPackaged,version:app.getVersion(),electron:process.versions.electron,node:process.versions.node,preferences:{sandbox:BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences().sandbox,nodeIntegration:BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences().nodeIntegration,contextIsolation:BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences().contextIsolation}}));
 check(report.runtime.packaged,'Test is not exercising a packaged app');
 check(await page.evaluate(()=>typeof require==='undefined'&&typeof process==='undefined'&&!window.localagentDesktop.readCredentials),'Renderer native isolation missing');
 const status=(await api('status')).data;check(!status.providers.filter(p=>!p.local).some(p=>p.configured),'Fresh desktop inherited developer keys');report.freshLaunch=true;
 await capture('desktop-home.png');
 // Selection is a labelled dialog fixture; the production bridge still invokes
 // Electron's real Windows openDirectory picker with no arbitrary IPC methods.
 await app.evaluate(({dialog},path)=>{globalThis.originalOpenDialog=dialog.showOpenDialog;globalThis.pickerCalls=[];dialog.showOpenDialog=async(_window,options)=>{globalThis.pickerCalls.push(options);return {canceled:false,filePaths:[path]};};},fixture);
 await page.getByRole('button',{name:/Choose folder/}).click();await page.getByRole('heading',{name:/desktop-/}).waitFor();
 report.folderPicker=await app.evaluate(({dialog})=>{dialog.showOpenDialog=globalThis.originalOpenDialog;return {fixture:true,calls:globalThis.pickerCalls.length,properties:globalThis.pickerCalls[0].properties};});
 check(report.folderPicker.calls===1&&report.folderPicker.properties.includes('openDirectory'),'Native folder bridge did not request a directory');
 const draft='Keep this draft across runtime and desktop recovery';await page.getByLabel('Describe your coding task').fill(draft);
 let before=metadata();process.kill(before.children.find(c=>c.service==='engine').pid);
 await page.getByRole('button',{name:'Restart local runtime',exact:true}).waitFor({timeout:15000});
 check(await page.getByLabel('Describe your coding task').inputValue()===draft,'Runtime failure lost draft');
 await page.getByRole('button',{name:'Restart local runtime',exact:true}).click();
 await wait(async()=>['ready','failed'].includes((await page.evaluate(()=>window.localagentDesktop.status())).state),180000);
 check((await page.evaluate(()=>window.localagentDesktop.status())).state==='ready','Runtime restart failed');
 await wait(async()=>await page.evaluate(()=>!document.body.innerText.includes('Connection interrupted.')));
 check(await page.getByLabel('Describe your coding task').inputValue()===draft,'Runtime restart lost draft');report.runtimeCrashRecovery=true;
 if(process.argv.includes('--coding')){
   const env=loadEnvironment();check(env.GEMINI_API_KEY&&env.GEMINI_FREE_TIER_CONFIRMED==='true','Confirmed free Gemini key unavailable locally');
   await page.getByRole('button',{name:/Connections/}).click();await page.getByRole('button',{name:'Connect provider',exact:true}).first().click();
   await page.getByLabel('API key',{exact:true}).fill(env.GEMINI_API_KEY);await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Save connection',exact:true}).click();
   await page.getByRole('dialog').waitFor({state:'hidden',timeout:60000});
   const ready=(await api('status')).data;check(ready.plan.targets.some(t=>t.provider==='gemini'),'Gemini not admitted after secure onboarding');
   check(!JSON.stringify(ready).includes(env.GEMINI_API_KEY),'Credential echoed to renderer');
   check(!readFileSync(join(profile,'runtime/credentials.dpapi')).includes(Buffer.from(env.GEMINI_API_KEY)),'Credential stored as plaintext');report.encryptedCredentialSave=true;
   await page.getByRole('button',{name:'Workspace',exact:true}).click();
   await page.getByLabel('Describe your coding task').fill('Read sum.mjs. Fix add(a,b) to return a+b. Write sum.test.mjs using node:test and node:assert/strict verifying add(2,3) is 5 and add(-2,2) is 0. Run exactly node --test. Change only these two files and finish all steps.');
   report.inferenceRequested=true;await page.getByRole('button',{name:'Start task',exact:true}).click();
   let snapshot;const end=Date.now()+130000;
   while(Date.now()<end){
     const projects=(await api('projects')).data,p=projects.find(p=>p.path===fixture);const sessions=(await api('projects/'+p.id+'/sessions')).data;
     if(sessions[0]){snapshot=(await api('sessions/'+sessions[0].id)).data;
       if(snapshot.error)throw Error('Coding snapshot unavailable');
       for(const permission of snapshot.permissions||[]){check(permission.permission==='edit'||permission.permission==='bash'&&permission.patterns?.every(p=>p==='node --test'),'Unexpected coding permission');await page.getByRole('button',{name:'Allow once',exact:true}).first().click();}
       if(['completed','provider_error','task_deadline_exceeded','progress_budget_exhausted'].includes(snapshot.state))break;
     }
     await page.waitForTimeout(700);
   }
   const tools=snapshot?.messages.flatMap(m=>m.parts).filter(p=>p.type==='tool')||[],test=tools.filter(p=>p.tool==='bash'&&p.command==='node --test').at(-1);
   report.coding={state:snapshot?.state,actions:tools.map(t=>({tool:t.tool,status:t.status,exit:t.exit})),testExit:test?.exit};
   writeFileSync(join(directory,'agent-tests.txt'),test?.output||'No agent test output');
   spawnSync('git',['-C',fixture,'add','-N','sum.test.mjs'],{windowsHide:true,stdio:'ignore'});
   writeFileSync(join(directory,'source.diff'),spawnSync('git',['-C',fixture,'diff','--','sum.mjs','sum.test.mjs'],{windowsHide:true,encoding:'utf8'}).stdout||'');
   check(snapshot?.state==='completed'&&test?.exit===0&&/return a\s*\+\s*b/.test(readFileSync(join(fixture,'sum.mjs'),'utf8')),'Packaged coding task did not finish with actual edit and agent-run passing tests');
   check(snapshot.diffs.length>0,'Coding changes not visible');
   await page.getByRole('button',{name:'Tests',exact:true}).click();await capture('desktop-tests.png');
   await page.getByRole('button',{name:/^Changes/}).click();await capture('desktop-changes.png');
   const routeStatus=(await api('status')).data;
   report.coding.admittedProviders=routeStatus.plan.targets.map(t=>t.provider);
   await page.getByRole('button',{name:'Routing',exact:true}).click();await page.getByRole('heading',{name:/Intelligence with/}).waitFor();
   await capture('desktop-routing.png');
   await page.getByRole('button',{name:'Workspace',exact:true}).click();
 }
 await page.getByLabel('Describe your coding task').fill(draft);await page.waitForTimeout(150);
 before=metadata();await app.close();app=null;await wait(()=>![before.pid,...before.children.map(c=>c.pid)].some(alive));report.normalShutdown=true;
 await launch();await page.getByRole('heading',{name:/desktop-/}).waitFor();check(await page.getByLabel('Describe your coding task').inputValue()===draft,'App restart lost saved draft');report.appRestart=true;
 if(report.encryptedCredentialSave){
   check((await api('status')).data.providers.find(p=>p.id==='gemini').configured,'Protected credential not recovered after restart');report.credentialRestart=true;
   await page.getByRole('button',{name:/Connections/}).click();await page.getByRole('button',{name:'Manage connection',exact:true}).first().click();
   await page.getByRole('button',{name:'Disconnect provider',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden',timeout:60000});
   check(!(await api('status')).data.providers.find(p=>p.id==='gemini').configured,'Disconnected key reactivated');report.credentialRemoval=true;
   await page.getByRole('button',{name:'Workspace',exact:true}).click();
 }
 before=metadata();const actualMainPID=await app.evaluate(()=>process.pid);process.kill(actualMainPID,'SIGKILL');await wait(()=>![actualMainPID,before.pid,...before.children.map(c=>c.pid)].some(alive));app=null;report.parentCrashCleanup=true;
 await launch();await page.getByRole('heading',{name:/desktop-/}).waitFor();if(report.credentialRemoval)check(!(await api('status')).data.providers.find(p=>p.id==='gemini').configured,'Removed key recovered after restart');await capture('desktop-restarted.png');report.crashRestart=true;
 check(!report.errors.length,'Renderer errors occurred');report.passed=true;
}catch(e){report.passed=false;report.failure=redact(e.message);process.exitCode=1;}
finally{if(app)await app.close().catch(()=>{});writeFileSync(join(directory,'desktop-app.json'),redact(JSON.stringify(report,null,2)));console.log(redact(JSON.stringify(report)));}
