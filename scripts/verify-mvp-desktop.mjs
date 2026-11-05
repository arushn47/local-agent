import {_electron} from 'playwright';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,readFileSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {clickPreview} from './preview-pointer.mjs';
const version=JSON.parse(readFileSync('apps/desktop/package.json')).version;
const executablePath=resolve(`release/desktop-${version}/win-unpacked/LocalAgent.exe`);
const profile=resolve('.localagent/mvp-desktop-'+Date.now()),project=resolve('.workspace-check/mvp-desktop-'+Date.now()),evidence=resolve('validation/mvp');
mkdirSync(project,{recursive:true});mkdirSync(evidence,{recursive:true});
const report={version,packaged:true,liveInferenceRequests:0,checks:{},errors:[]};
let app,page,lastMetadata;
const meta=()=>JSON.parse(readFileSync(join(profile,'runtime/desktop-state.json')));
const alive=pid=>{try{process.kill(pid,0);return true;}catch{return false;}};
const wait=async(fn,ms=30000)=>{const end=Date.now()+ms;while(Date.now()<end){if(await fn())return;await new Promise(r=>setTimeout(r,200));}throw Error('Desktop acceptance timeout');};
const api=path=>page.evaluate(async path=>{const r=await fetch('/api/v1/'+path);if(!r.ok)throw Error('API HTTP '+r.status);return r.json();},path);
async function launch(){
  const env={...process.env,LOCALAGENT_USER_DATA_DIR:profile,PATH:process.env.SystemRoot+'\\System32;'+process.env.SystemRoot};
  for(const key of Object.keys(env))if(/API_KEY|TOKEN|SECRET|PASSWORD/i.test(key))delete env[key];
  const started=Date.now();app=await _electron.launch({executablePath,env,timeout:30000});page=await app.firstWindow();page.on('pageerror',e=>report.errors.push(e.message));
  await wait(()=>{try{return ['ready','failed'].includes(meta().state);}catch{return false;}},180000);
  assert.equal(meta().state,'ready');await page.waitForURL('http://127.0.0.1:*/',{timeout:30000});
  report.launches||=[];report.launches.push({elapsedMs:Date.now()-started,cacheState:'uncontrolled'});
}
async function close(){lastMetadata=meta();await app.close();app=null;await wait(()=>![lastMetadata.pid,...lastMetadata.children.map(c=>c.pid)].some(alive),15000);}
try{
  await launch();
  const isolation=await app.evaluate(({app,BrowserWindow})=>({packaged:app.isPackaged,version:app.getVersion(),preferences:((p)=>({sandbox:p.sandbox,nodeIntegration:p.nodeIntegration,contextIsolation:p.contextIsolation}))(BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences())}));
  assert.ok(isolation.packaged&&isolation.preferences.sandbox&&isolation.preferences.contextIsolation&&!isolation.preferences.nodeIntegration);report.checks.rendererIsolation=isolation;
  const fresh=await api('status');assert.ok(!fresh.providers.some(p=>!p.local&&p.configured));assert.equal(fresh.workflowExecutionReady,false);report.checks.freshProfileNoCredentials=true;
  await app.evaluate(({dialog},path)=>{globalThis.mvpPickerCalls=0;dialog.showOpenDialog=async()=>{globalThis.mvpPickerCalls++;return {canceled:false,filePaths:[path]};};},project);
  await page.getByRole('button',{name:/Choose folder/}).first().click();
  await page.getByRole('heading',{name:project.split(/[\\/]/).at(-1),exact:true}).waitFor();
  assert.equal(await app.evaluate(()=>globalThis.mvpPickerCalls),1);report.checks.nativePickerAdapter=true;
  await page.locator('.tab-add').click();await page.locator('.tab-add').click();
  await wait(async()=>{const prj=(await api('projects')).find(p=>p.path===project);return (await api(`projects/${prj.id}/sessions`)).length===2;});
  const tabs=page.getByRole('tablist',{name:'Open tasks'}).getByRole('tab');assert.equal(await tabs.count(),2);await tabs.first().click();await tabs.last().click();report.checks.nativeTaskCreationAndNavigation=true;
  const draft='Preserve this draft across desktop runtime recovery';await page.getByLabel('Describe your coding task').fill(draft);
  assert.ok(await page.getByRole('button',{name:'Start task',exact:true}).isDisabled());report.checks.missingModelGating=true;
  assert.ok((await page.locator('.hint-row').innerText()).includes('no coding model available'));
  assert.equal(await page.locator('.side-foot .bar').count(),0);
  await page.getByRole('button',{name:/Connections/}).first().click();
  await page.locator('.provider-card').filter({has:page.getByRole('heading',{name:'Google Gemini',exact:true})}).getByRole('button',{name:'Connect provider',exact:true}).click();
  const placeholder='localagent-invalid-mvp-placeholder';await page.getByLabel('API key',{exact:true}).fill(placeholder);
  await page.getByRole('button',{name:'Save connection',exact:true}).click();assert.ok(await page.getByRole('dialog').isVisible());
  await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Save connection',exact:true}).click();
  await page.getByRole('dialog').waitFor({state:'hidden',timeout:90000});
  assert.ok((await api('status')).providers.find(p=>p.id==='gemini').configured);
  assert.ok(!readFileSync(join(profile,'runtime/credentials.dpapi')).includes(Buffer.from(placeholder)));report.checks.placeholderOnboardingDPAPI=true;
  await page.getByRole('button',{name:'Manage connection',exact:true}).first().click();
  assert.equal(await page.getByLabel('API key',{exact:true}).inputValue(),'');
  await page.getByRole('button',{name:'Disconnect provider',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden',timeout:60000});
  assert.ok(!(await api('status')).providers.find(p=>p.id==='gemini').configured);report.checks.credentialRemoval=true;
  await page.getByRole('button',{name:'Workspace',exact:true}).click();
  await page.getByRole('tab',{name:'Browser',exact:true}).click();
  await page.getByRole('button',{name:'Add starter to empty folder',exact:true}).click();
  await page.getByRole('button',{name:'Start isolated preview',exact:true}).click();
  const frame=page.frameLocator('iframe[title="Isolated website preview"]');await frame.getByRole('heading').first().waitFor();
  const boundary=await frame.locator('body').evaluate(()=>{let parentDenied=false,cookiesDenied=false;try{void parent.document.body;}catch{parentDenied=true;}try{void document.cookie;}catch{cookiesDenied=true;}return {parentDenied,cookiesDenied,node:typeof require,bridge:typeof window.localagentDesktop};});
  assert.ok(boundary.parentDenied&&boundary.cookiesDenied&&boundary.node==='undefined'&&boundary.bridge==='undefined');report.checks.previewIsolation=true;
  await clickPreview(page,frame.getByRole('button',{name:'Try an interaction',exact:true}));await frame.getByText('Ready for what comes next.',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Validate static build',exact:true}).click();await page.getByText('Static validation passed',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Mobile',exact:true}).click();await page.getByRole('button',{name:'Inspect with Playwright',exact:true}).click();
  await page.getByText('Browser check passed',{exact:true}).waitFor({timeout:45000});report.checks.embeddedBrowserAndSyntax=true;
  // Electron's native DownloadItem is outside Playwright's browser download
  // event. Intercept only this fixture's Save dialog, then observe native done.
  const exportFile=join(evidence,'desktop-source-export.zip');
  await app.evaluate(({session},target)=>{globalThis.mvpDownload=null;session.defaultSession.once('will-download',(_event,item)=>{item.setSavePath(target);item.once('done',(_event,state)=>{globalThis.mvpDownload=state;});});},exportFile);
  await page.getByRole('link',{name:/Export source/}).click();await wait(async()=>await app.evaluate(()=>globalThis.mvpDownload==='completed'));
  assert.equal(readFileSync(exportFile).subarray(0,2).toString(),'PK');report.checks.sourceExport=true;
  await page.getByRole('tab',{name:'Files',exact:true}).click();await page.getByRole('button',{name:'index.html file',exact:true}).click();await page.locator('.viewer .line-num').first().waitFor();report.checks.packagedFileInspection=true;
  await page.getByRole('tab',{name:'Workflows',exact:true}).click();await page.getByRole('button',{name:'+ New Workflow',exact:true}).click();
  await page.getByLabel('Task or Feature Objective').fill('Internal desktop gated plan');await page.getByRole('button',{name:'Create & Plan',exact:true}).click();
  await page.getByRole('button',{name:'Start workflow',exact:true}).waitFor();assert.ok(await page.getByRole('button',{name:'Start workflow',exact:true}).isDisabled());report.checks.packagedWorkflowGate=true;
  await page.screenshot({path:join(evidence,'desktop-workspace.png'),fullPage:true});
  const ownedEngine=meta().children.find(child=>child.service==='engine');assert.ok(ownedEngine);process.kill(ownedEngine.pid);
  await page.getByRole('button',{name:'Restart local runtime',exact:true}).waitFor({timeout:20000});
  await page.getByRole('button',{name:'Restart local runtime',exact:true}).click();
  await wait(()=>meta().state==='ready',180000);await page.waitForTimeout(500);
  assert.equal(await page.getByLabel('Describe your coding task').inputValue(),draft);report.checks.runtimeCrashRecoveryDraft=true;
  await close();report.checks.normalShutdown=true;await launch();
  assert.equal(await page.getByLabel('Describe your coding task').inputValue(),draft);
  assert.ok(!(await api('status')).providers.find(p=>p.id==='gemini').configured);report.checks.restartRetainsDraftAndRemoval=true;
  assert.deepEqual(report.errors,[]);await close();
  const audit=join(profile,'runtime/routing.jsonl');
  const requests=existsSync(audit)?readFileSync(audit,'utf8').split('\n').filter(Boolean).map(JSON.parse).filter(event=>event.event==='request').length:0;
  assert.equal(requests,0);report.guardInferenceRequests=requests;report.passed=true;
}catch(error){report.passed=false;report.failure=String(error.message).slice(0,1800);if(page)await page.screenshot({path:join(evidence,'desktop-failure.png')}).catch(()=>{});process.exitCode=1;}
finally{if(app)await close().catch(()=>{});writeFileSync(join(evidence,'desktop.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
