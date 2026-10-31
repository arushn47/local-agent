// Root-cause diagnostics for the failed packaged UI soaks (Phase 6.4).
// No inference, no retries: each mode observes a single bounded scenario and
// records what the main process and renderer actually did.
import {_electron} from 'playwright';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {once} from 'node:events';

const packaged=!process.argv.includes('--dev');
const mode=['--visibility','--renderer-crash','--soak'].find(flag=>process.argv.includes(flag))||'--visibility';
const rounds=Number(process.env.LOCALAGENT_DIAGNOSE_ROUNDS||12);
const intervalMs=Number(process.env.LOCALAGENT_DIAGNOSE_INTERVAL_MS||10000);
const profile=resolve('.localagent/diagnose-soak-'+Date.now());
const fixture=resolve('.workspace-check/diagnose-'+Date.now());
const executablePath=resolve(process.env.LOCALAGENT_DESKTOP_EXE||(packaged?'release/desktop-0.5.2/win-unpacked/LocalAgent.exe':'node_modules/electron/dist/electron.exe'));
const report={mode,packaged,executablePath,profile,fixture,inferenceRequests:0,rounds:[],events:[],checks:{},host:{platform:process.platform,node:process.versions.node}};
mkdirSync(fixture,{recursive:true});
mkdirSync(join(profile,'runtime'),{recursive:true});
writeFileSync(join(fixture,'index.html'),'<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Soak fixture</title><link rel="stylesheet" href="style.css"></head><body><main><h1>Soak fixture</h1><p id="state">initial</p></main><script type="module" src="app.mjs"></script></body></html>');
writeFileSync(join(fixture,'style.css'),'body{font:16px/1.5 system-ui;margin:0}main{margin:16vh auto;max-width:640px;padding:24px}');
writeFileSync(join(fixture,'app.mjs'),"document.querySelector('#state').textContent='ready';\n");

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let app,page;
const marker=round=>`Diagnostic revision ${round}`;
const events=[];
const record=(scope,type,detail)=>events.push({at:new Date().toISOString(),scope,type,detail});
async function wait(fn,ms,label){
  const end=Date.now(),limit=end+ms;
  while(Date.now()<limit){try{if(await fn())return Date.now()-end;}catch{}await sleep(200);}
  throw Error('diagnostic timeout: '+label);
}
const api=async(path,body)=>page.evaluate(async({path,body})=>{
  const r=await fetch('/api/v1/'+path,{...(body===undefined?{}:{method:'POST',body:JSON.stringify(body)}),headers:{'Content-Type':'application/json','X-LocalAgent-Request':'1'}});
  const value=await r.json();if(!r.ok)throw Error(value.error||('http_'+r.status));return value;
},{path,body});

try{
  const env={...process.env,LOCALAGENT_USER_DATA_DIR:profile,LOCALAGENT_NODE_EXE:resolve('.localagent/desktop-node/node.exe')};
  if(packaged)env.PATH=process.env.SystemRoot+'\\System32;'+process.env.SystemRoot;
  for(const key of Object.keys(env))if(/API_KEY|TOKEN|SECRET|PASSWORD/i.test(key))delete env[key];
  app=await _electron.launch({executablePath,args:packaged?[]:[resolve('apps/desktop')],env,timeout:30000});
  page=await app.firstWindow();
  page.on('crash',()=>record('renderer','page-crash',{url:page.url()}));
  page.on('close',()=>record('renderer','page-close',{url:page.url()}));
  page.on('pageerror',error=>record('renderer','pageerror',{message:String(error.message).slice(0,300)}));
  await wait(async()=>{try{return (await page.getByRole('button',{name:'Workspace',exact:true}).count())>0;}catch{return false;}},180000,'workspace');
  report.startupMs=Date.now();

  // Main-process instrumentation. Bounded and metadata-only.
  await app.evaluate(({app,BrowserWindow})=>{
    const sink=globalThis.__localagentDiagnostics=globalThis.__localagentDiagnostics||[];
    const push=(type,detail)=>{if(sink.length<400)sink.push({at:new Date().toISOString(),type,detail});};
    for(const win of BrowserWindow.getAllWindows()){
      win.on('closed',()=>push('window-closed',{id:win.id}));
      win.on('unresponsive',()=>push('window-unresponsive',{id:win.id}));
      win.on('responsive',()=>push('window-responsive',{id:win.id}));
      win.webContents.on('render-process-gone',(_event,details)=>push('render-process-gone',details));
      win.webContents.on('child-process-gone',(_event,details)=>push('child-process-gone',details));
      win.webContents.on('did-fail-load',(_event,code,description,url)=>push('did-fail-load',{code,description,url:String(url).slice(0,200)}));
      win.webContents.on('unresponsive',()=>push('webContents-unresponsive',{id:win.id}));
      win.webContents.on('destroyed',()=>push('webContents-destroyed',{id:win.id}));
    }
    app.on('child-process-gone',(_event,details)=>push('app-child-process-gone',details));
    app.on('before-quit',()=>push('before-quit',{}));
    app.on('window-all-closed',()=>push('window-all-closed',{}));
    app.on('session-end',()=>push('session-end',{}));
  });

  // Open the fixture through the product API, then reload into it.
  const project=await api('projects',{path:fixture});
  const session=await api('projects/'+project.id+'/sessions',{});
  await page.evaluate(({project,session})=>localStorage.setItem('localagent.workspace',JSON.stringify({project:project.id,session:session.id,draft:''})),{project,session});
  await page.reload();
  await page.getByLabel('Describe your coding task').waitFor({timeout:60000});
  await page.getByRole('button',{name:'Preview',exact:true}).click();
  const start=page.getByRole('button',{name:'Start isolated preview',exact:true});
  await start.waitFor();
  await start.click();
  const frame=()=>page.frameLocator('iframe[title="Isolated website preview"]');
  await frame().getByRole('heading',{name:'Soak fixture'}).waitFor({timeout:30000});
  report.checks.previewStarted=true;

  const writeMarker=async round=>{
    const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Soak fixture</title><link rel="stylesheet" href="style.css"></head><body><main><h1>Soak fixture</h1><p id="state">initial</p><p id="soak-marker">${marker(round)}</p></main><script type="module" src="app.mjs"></script></body></html>`;
    writeFileSync(join(fixture,'index.html'),html);
    await api('projects/'+project.id+'/preview/build',{});
  };
  const visible=async round=>wait(async()=>await frame().locator('#soak-marker').textContent({timeout:800}).then(text=>text===marker(round)).catch(()=>false),15000,'marker '+round);
  const state=async()=>({hidden:await page.evaluate(()=>document.hidden),visibility:await page.evaluate(()=>document.visibilityState),caption:await page.locator('.preview-caption').innerText().catch(()=>null),src:await page.locator('iframe').getAttribute('src').catch(()=>null)});

  if(mode==='--visibility'){
    await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().startsWith('http://127.0.0.1:'));w.restore();w.show();w.focus();});
    await page.bringToFront();
    await sleep(1500);
    report.visibility={beforeFirst:await state(),revisionBefore:(await api('projects/'+project.id+'/preview')).revision};    try{await writeMarker(0);report.checks.visibleRefreshMs=await visible(0);}
    catch(error){report.visibility.afterFirstFailure={...await state(),revisionAfter:(await api('projects/'+project.id+'/preview')).revision,marker:await frame().locator('#soak-marker').textContent({timeout:800}).catch(()=>null)};throw error;}
    await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().startsWith('http://127.0.0.1:'))?.hide());
    await sleep(1200);
    report.visibility={whileHidden:await state()};
    const before=(await api('projects/'+project.id+'/preview')).revision;
    await writeMarker(1);
    report.visibility.serverAdvancedMs=await wait(async()=>(await api('projects/'+project.id+'/preview')).revision>before,5000,'revision');
    const shownWhileHidden=await frame().locator('#soak-marker').textContent({timeout:800}).catch(()=>null);
    await sleep(4000);
    report.visibility.markerWhileHidden=shownWhileHidden;
    report.visibility.staleWhileHidden=(await frame().locator('#soak-marker').textContent({timeout:800}).catch(()=>null))!==marker(1);
    await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().startsWith('http://127.0.0.1:'));w.show();w.focus();});
    await page.bringToFront();
    report.visibility.foregroundRecoveryMs=await visible(1);
    report.visibility.mainWindow=await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().startsWith('http://127.0.0.1:'));return {hiddenDuringProbe:!w.isVisible(),visible:Boolean(w?.isVisible())};}).catch(()=>null);
    // A hidden window that Chromium still reports as visible cannot exercise
    // background throttling; record that limitation instead of claiming a pass.
    report.checks.hiddenStateExercised=report.visibility.whileHidden.hidden===true;
    report.checks.visibleRefreshMs=report.visibility.foregroundRecoveryMs;
    report.passed=report.checks.visibleRefreshMs<15000;
  }

  if(mode==='--renderer-crash'){
    await writeMarker(0);
    report.checks.visibleRefreshMs=await visible(0);
    await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().startsWith('http://127.0.0.1:'))?.webContents.forcefullyCrashRenderer());
    await sleep(1500);
    report.crash={first:{pageClosed:page.isClosed()}};
    report.crash.first.evaluateError=await page.evaluate(()=>document.title).then(()=>null,error=>String(error.message).slice(0,300));
    const windows=app.windows();
    report.crash.windowsAfterFirst=windows.length;
    await sleep(3000);
    report.crash.first.recoveredURL=await windows[0]?.url().catch(()=>null);
    // The main process only reloads once. A second crash exposes the unhandled path.
    await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0]?.webContents.forcefullyCrashRenderer());
    await sleep(4000);
    report.crash.second={windows:app.windows().length,pageClosed:page.isClosed()};
    report.crash.second.url=await app.windows()[0]?.url().catch(()=>null);
    report.passed=Boolean(report.crash.first.evaluateError);
  }

  if(mode==='--soak'){
    const cdp=await page.context().newCDPSession(page);
    await cdp.send('Performance.enable');
    report.soak={intervalMs,rounds,conditions:'Instrumented packaged soak; window activated each round; no inference.'};
    for(let round=0;round<rounds;round++){
      await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().startsWith('http://127.0.0.1:'));w.restore();w.show();w.focus();});
      await page.bringToFront();
      const sample=await state();
      const previewRevision=(await api('projects/'+project.id+'/preview')).revision;
      const before=Date.now();
      let refreshMs=null,error=null;
      try{await writeMarker(round);refreshMs=await visible(round);}catch(e){error=e.message;}
      const dom=await page.evaluate(()=>{const frame=document.querySelector('iframe');return {nodes:document.querySelectorAll('*').length,frameConnected:!!frame,documents:null};}).catch(()=>null);
      const heap=await cdp.send('Performance.getMetrics').then(metrics=>metrics.metrics.filter(m=>m.name==='JSHeapUsedSize')[0]?.value??null).catch(()=>null);
      const main=await app.evaluate(()=>globalThis.__localagentDiagnostics?.slice(-6)||[]).catch(()=>null);
      report.rounds.push({round,hidden:sample.hidden,visibility:sample.visibility,caption:sample.caption,src:sample.src,previewRevision,refreshMs,totalMs:Date.now()-before,error,dom,heap,main});
      console.log(JSON.stringify({round,hidden:sample.hidden,refreshMs,totalMs:Date.now()-before,error}));
      if(error){report.failureRound=round;break;}
      await sleep(intervalMs);
    }
    report.passed=!report.failureRound;
  }
}catch(error){
  report.passed=false;report.error=String(error.message).slice(0,500);
  report.failureDiagnostics=await app?.evaluate(({BrowserWindow})=>({windows:BrowserWindow.getAllWindows().length,events:globalThis.__localagentDiagnostics?.slice(-10)})).catch(()=>null);
  process.exitCode=1;
}finally{
  report.events=events;
  report.mainDiagnostics=await app?.evaluate(()=>globalThis.__localagentDiagnostics||[]).catch(()=>null);
  if(app)await app.close().catch(()=>{});
  mkdirSync(resolve('validation/phase64'),{recursive:true});
  writeFileSync(resolve('validation/phase64/diagnose-'+mode.replace('--','')+'.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({passed:report.passed,mode,error:report.error,failureRound:report.failureRound,checks:report.checks,visibility:report.visibility,crash:report.crash},null,2));
}
