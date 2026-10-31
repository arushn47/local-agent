import {_electron} from 'playwright';
import {mkdirSync,writeFileSync,readFileSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {loadEnvironment} from '../src/config.mjs';
import {clickPreview} from './preview-pointer.mjs';
const packaged=process.argv.includes('--packaged'),coding=process.argv.includes('--coding');
const directory=resolve(process.env.LOCALAGENT_DESKTOP_EVIDENCE||'validation/phase52');mkdirSync(directory,{recursive:true});
const profile=resolve(process.env.LOCALAGENT_BUILDER_PROFILE||'.localagent/builder-acceptance-'+Date.now()),fixture=resolve('.workspace-check/builder-'+Date.now());mkdirSync(fixture,{recursive:true});
const report={packaged,coding,profile,fixture,driverNode:process.versions.node,checks:{},tasks:[],rendererErrors:[]};
const envKeys=loadEnvironment(),redact=text=>Object.entries(envKeys).reduce((s,[k,v])=>/API_KEY|TOKEN|SECRET|PASSWORD/i.test(k)&&v?s.replaceAll(v,'[redacted]'):s,String(text));
const check=(v,m)=>{if(!v)throw Error(m);};
const wait=async(fn,ms=20000)=>{const end=Date.now()+ms;while(Date.now()<end){if(await fn())return;await new Promise(r=>setTimeout(r,200));}throw Error('Builder acceptance timed out');};
let app,page,project,session;
const metadata=()=>JSON.parse(readFileSync(join(profile,'runtime/desktop-state.json')));
const alive=pid=>{try{process.kill(pid,0);return true;}catch{return false;}};
const api=async(path,body)=>page.evaluate(async({path,body})=>{const r=await fetch('/api/v1/'+path,{...(body===undefined?{}:{method:'POST',body:JSON.stringify(body)}),headers:{'Content-Type':'application/json','X-LocalAgent-Request':'1'}});const value=await r.json();if(!r.ok)throw Error(value.error);return value;},{path,body});
const preview=()=>`projects/${project.id}/preview`;
async function capture(name){await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:join(directory,name),timeout:12000});}
async function openProject(path){await page.getByRole('button',{name:'Open another project',exact:true}).click();await page.getByLabel('Open a local project',{exact:true}).fill(path);await page.getByRole('button',{name:'Open project',exact:true}).click();await page.getByRole('heading',{name:new RegExp(path.split(/[\\/]/).at(-1))}).waitFor();project=(await api('projects')).find(p=>p.path.toLowerCase()===path.toLowerCase());check(project,'Project not opened');}
const frame=()=>page.frameLocator('iframe[title="Isolated website preview"]');
async function inspect(device){await page.getByRole('button',{name:device[0].toUpperCase()+device.slice(1),exact:true}).click();await page.getByRole('button',{name:'Inspect with Playwright',exact:true}).click();await page.getByRole('button',{name:'Inspecting…',exact:true}).waitFor({state:'hidden',timeout:30000});const s=await api(preview());check(s.inspection?.device===device,'Inspection result missing');const r=await page.request.get(new URL('/api/v1/'+preview()+'/screenshot',page.url()).href);writeFileSync(join(directory,`${coding?'coding':'fixture'}-${device}.png`),await r.body());return s.inspection;}
async function task(text,label){
 const previousTests=report.tasks.at(-1)?.tools.filter(t=>t.tool==='bash'&&t.command==='node --test').length||0;
 await page.getByLabel('Describe your coding task').fill(text);await page.getByRole('button',{name:'Start task',exact:true}).click();
 let snapshot;const end=Date.now()+125000,approved=new Set();
 while(Date.now()<end){const list=await api(`projects/${project.id}/sessions`);session ||= list[0]?.id;if(session){snapshot=await api('sessions/'+session);for(const p of snapshot.permissions||[]){if(approved.has(p.id))continue;check(p.permission==='edit'||p.permission==='bash'&&p.patterns?.every(s=>s==='node --test'),'Unexpected agent permission: '+p.permission);approved.add(p.id);await api(`sessions/${session}/permission`,{requestID:p.id,reply:'once'});}if(snapshot.state!=='running')break;}await page.waitForTimeout(500);}
 const tools=snapshot?.messages.flatMap(m=>m.parts).filter(p=>p.type==='tool')||[],tests=tools.filter(p=>p.tool==='bash'&&p.command==='node --test');
 report.tasks.push({label,session,state:snapshot?.state,tools:tools.map(t=>({tool:t.tool,status:t.status,command:t.command,exit:t.exit})),diffs:snapshot?.diffs.map(d=>d.file.split(/[\\/]/).at(-1)),testExit:tests.at(-1)?.exit});
 writeFileSync(join(directory,label+'-tests.txt'),tests.at(-1)?.output||'No agent-run test output');
 check(snapshot?.state==='completed'&&tests.length>previousTests&&tests.at(-1)?.exit===0,'Agent task did not complete with new passing tests: '+snapshot?.state);check(snapshot.diffs.length,'No agent changes in inspector');return snapshot;
}
try{
 const env={...process.env,LOCALAGENT_USER_DATA_DIR:profile,LOCALAGENT_NODE_EXE:resolve('.localagent/desktop-node/node.exe'),...(packaged?{PATH:process.env.SystemRoot+'\\System32;'+process.env.SystemRoot}:{})};for(const k of Object.keys(env))if(/API_KEY|TOKEN|SECRET|PASSWORD/i.test(k))delete env[k];
 if(packaged)for(const k of Object.keys(env))if(k.toLowerCase()==='path'&&k!=='PATH')delete env[k];
 report.executablePath=resolve(process.env.LOCALAGENT_DESKTOP_EXE||(packaged?'release/desktop-0.5.2/win-unpacked/LocalAgent.exe':'node_modules/electron/dist/electron.exe'));
 app=await _electron.launch({executablePath:report.executablePath,args:packaged?[]:[resolve('apps/desktop')],env,timeout:30000});page=await app.firstWindow();
 page.on('pageerror',e=>{if(e.message==='phase4 recovery probe'||!coding&&e.message==="Unexpected token ';'"){report.expectedProjectErrors||=[];report.expectedProjectErrors.push(e.message);}else report.rendererErrors.push(e.message);});page.on('console',m=>{if(['error','warning'].includes(m.type())){report.browserDiagnostics||=[];if(report.browserDiagnostics.length<30)report.browserDiagnostics.push(m.text().slice(0,1500));}});
 await wait(()=>{try{return ['ready','failed'].includes(metadata().state);}catch{return false;}},180000);check(metadata().state==='ready','Runtime startup: '+metadata().code);
 await page.waitForURL('http://127.0.0.1:*/',{timeout:20000});await page.getByRole('button',{name:'Workspace',exact:true}).waitFor();
 report.runtime=await app.evaluate(({app})=>({version:app.getVersion(),packaged:app.isPackaged}));check(report.runtime.packaged===packaged,'Wrong application kind');
 check(!(await api('status')).providers.some(p=>!p.local&&p.configured),'Inherited provider keys');
 await openProject(fixture);await page.getByRole('button',{name:'Preview',exact:true}).click();
 if(!coding){
  await page.getByRole('button',{name:'Add starter to empty folder',exact:true}).click();await page.getByRole('button',{name:'Start isolated preview',exact:true}).waitFor({state:'visible'});await wait(async()=>await page.getByRole('button',{name:'Start isolated preview',exact:true}).isEnabled());
 }else{
  check(envKeys.GEMINI_API_KEY&&envKeys.GEMINI_FREE_TIER_CONFIRMED==='true','Confirmed free Gemini key unavailable');
  await page.getByRole('button',{name:/Connections/}).click();await page.getByRole('button',{name:'Connect provider',exact:true}).first().click();await page.getByLabel('API key',{exact:true}).fill(envKeys.GEMINI_API_KEY);await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Save connection',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden',timeout:60000});
  check((await api('status')).plan.targets[0]?.provider==='gemini','Free Gemini route unavailable');await page.getByRole('button',{name:'Workspace',exact:true}).click();
  spawnSync('git',['init',fixture],{windowsHide:true,stdio:'ignore'});
  await task('Build a tiny polished responsive static website called Field Notes in this empty folder. Create index.html, style.css, app.mjs and app.test.mjs only. Use relative CSS/module script URLs, system fonts and no external assets, dependencies or server. Include a heading, three note cards and a button that increments a visible saved count. Export nextCount(n) from app.mjs, guard DOM access with typeof document. Use node:test and node:assert/strict to test nextCount(0) and nextCount(2). Run exactly node --test yourself and finish. Keep all files small.','generation');
 }
 await page.getByRole('button',{name:'Start isolated preview',exact:true}).click();await frame().getByRole('heading').first().waitFor();
 let state=await api(preview());check(state.state==='running','Preview not running');report.checks.start=true;
 const isolation=await frame().locator('body').evaluate(()=>{let parentDenied=false,cookieDenied=false;try{void parent.document.body;}catch{parentDenied=true;}try{void document.cookie;}catch{cookieDenied=true;}return {parentDenied,cookieDenied,node:typeof require,bridge:typeof window.localagentDesktop};});check(isolation.parentDenied&&isolation.cookieDenied&&isolation.node==='undefined'&&isolation.bridge==='undefined','Preview isolation failed');report.checks.isolation=isolation;
 await page.getByRole('button',{name:'Validate static build',exact:true}).click();await page.getByText('Static validation passed',{exact:true}).waitFor();report.checks.syntax=true;
 if(!coding){
  await clickPreview(page,frame().getByRole('button',{name:'Try an interaction'}));await frame().getByText('Ready for what comes next.',{exact:true}).waitFor({timeout:5000});report.checks.interaction='Playwright mouse at rendered iframe coordinates';
  const prior=state.revision;writeFileSync(join(fixture,'app.mjs'),readFileSync(join(fixture,'app.mjs'),'utf8')+'\nconsole.log("live refresh verified");\n');await page.getByText('live refresh verified',{exact:true}).waitFor({timeout:10000});await wait(async()=>(await api(preview())).revision>prior);report.checks.refresh=true;
  const clean=readFileSync(join(fixture,'app.mjs'),'utf8');writeFileSync(join(fixture,'app.mjs'),clean+'\nconst broken = ;\n');await wait(async()=>(await api(preview())).revision>prior+1);await page.getByRole('button',{name:'Validate static build',exact:true}).click();await page.getByText('Static validation found errors',{exact:true}).waitFor();writeFileSync(join(fixture,'app.mjs'),clean);await wait(async()=>(await api(preview())).revision>prior+2);await page.getByRole('button',{name:'Validate static build',exact:true}).click();await page.getByText('Static validation passed',{exact:true}).waitFor();report.checks.syntaxRecovery=true;
  // Deliberate hostile project input: browser CSP must deny both destinations.
  const denied=await frame().locator('body').evaluate(async(_el,ui)=>{const attempt=async u=>{try{await fetch(u);return false;}catch{return true;}};return {platform:await attempt(ui+'/api/v1/status'),external:await attempt('https://example.com/'),popup:window.open('https://example.com/')===null};},new URL(page.url()).origin);check(denied.platform&&denied.external&&denied.popup,'Preview egress denied checks failed');report.checks.egress=denied;
 }
 // A controlled browser-only error proves diagnostics and recovery without
 // invalidating the agent's Node unit test or making provider failures.
 const js=readFileSync(join(fixture,'app.mjs'),'utf8');writeFileSync(join(fixture,'app.mjs'),js+'\nif(typeof document!=="undefined")throw new Error("phase4 recovery probe");\n');
 await page.getByText(/phase4 recovery probe/).first().waitFor({timeout:15000});const broken=await inspect('mobile');check(!broken.passed&&broken.events.some(e=>e.message.includes('phase4 recovery probe')),'Browser error not detected');report.checks.runtimeError=true;await capture(coding?'coding-error.png':'fixture-error.png');
 if(coding){
  await page.getByRole('button',{name:'Refine with these findings ↗',exact:true}).click();check((await page.getByLabel('Describe your coding task').inputValue()).includes('untrusted'),'Findings did not become a reviewable draft');
  await task('Continue the same Field Notes website. Remove the browser-only phase4 recovery probe throw from app.mjs. Change the main heading to Field Notes, made yours. and refine the mobile cards to stack in one column with comfortable spacing. Preserve the counter and all tests. Change only the existing four files, do not install anything or start a server. Run exactly node --test yourself and finish.','refinement');
  check((await api(`projects/${project.id}/sessions`)).length===1,'Refinement created a separate agent session');
  await frame().getByRole('heading',{name:'Field Notes, made yours.',exact:true}).waitFor({timeout:15000});check(!readFileSync(join(fixture,'app.mjs'),'utf8').includes('phase4 recovery probe'),'Injected error not removed');
  const before=await frame().locator('body').innerText();const button=frame().getByRole('button').first();await clickPreview(page,button);check(before!==await frame().locator('body').innerText(),'Counter did not update');report.checks.interaction='Playwright mouse at rendered iframe coordinates';
 }else writeFileSync(join(fixture,'app.mjs'),js);
 await page.waitForTimeout(500);report.viewports={};for(const device of ['desktop','tablet','mobile']){const r=await inspect(device);report.viewports[device]=r;check(r.passed&&!r.stale,device+' browser check failed or stale');}
 report.checks.runtimeRecovery=true;
 await page.getByText('View verified screenshot',{exact:true}).click();await capture(coding?'coding-workspace.png':'fixture-workspace.png');
 const zip=await page.request.get(new URL('/api/v1/'+preview()+'/export',page.url()).href);check(zip.ok()&&(await zip.body()).readUInt32LE(0)===0x04034b50,'Export failed');report.checks.export=true;
 if(coding){spawnSync('git',['-C',fixture,'add','-N','.'],{windowsHide:true,stdio:'ignore'});writeFileSync(join(directory,'source.diff'),spawnSync('git',['-C',fixture,'diff'],{windowsHide:true,encoding:'utf8'}).stdout);const status=await api('status');report.routing=status.events.filter(e=>['request','upstream_headers','completed'].includes(e.event));report.policy=status.policy;await page.getByRole('button',{name:'Tests',exact:true}).click();await capture('coding-tests.png');await page.getByRole('button',{name:/^Changes/}).click();await capture('coding-changes.png');}
 else {await page.getByLabel('Describe your coding task').fill('Preserve this existing draft.');await page.getByRole('button',{name:'Refine with these findings ↗',exact:true}).click();const draft=await page.getByLabel('Describe your coding task').inputValue();check(draft.includes('Refine this website')&&draft.startsWith('Preserve this existing draft.'),'Refinement lost existing draft or findings');report.checks.refineDraft=true;}
 await page.getByRole('button',{name:'Preview',exact:true}).click();state=await api(preview());const old=state.url;
 await page.getByRole('button',{name:'Stop preview',exact:true}).click();await page.getByRole('button',{name:'Start isolated preview',exact:true}).waitFor();check((await page.request.get(old)).status()===403,'Stopped preview still accessible');
 await page.getByRole('button',{name:'Start isolated preview',exact:true}).click();await frame().getByRole('heading').first().waitFor();check((await api(preview())).url!==old,'Preview capability reused');report.checks.restart=true;
 if(!coding){
  const draft=await page.getByLabel('Describe your coding task').inputValue(),previousOrigin=metadata().previewOrigin;
  process.kill(metadata().children.find(c=>c.service==='engine').pid);
  await page.getByRole('button',{name:'Restart local runtime',exact:true}).waitFor({timeout:15000});const recovered=page.waitForEvent('domcontentloaded',{timeout:180000});await page.getByRole('button',{name:'Restart local runtime',exact:true}).click();
  await recovered;await wait(()=>metadata().state==='ready',180000);await page.getByRole('button',{name:'Preview',exact:true}).click();
  await page.getByRole('button',{name:'Start isolated preview',exact:true}).click();await frame().getByRole('heading').first().waitFor();
  check(await page.getByLabel('Describe your coding task').inputValue()===draft,'Recovery lost the saved draft');check(metadata().previewOrigin!==previousOrigin,'Recovery did not exercise a changed preview origin');
  await clickPreview(page,frame().getByRole('button',{name:'Try an interaction'}));await frame().getByText('Ready for what comes next.',{exact:true}).waitFor();report.checks.runtimeCrashRecovery=true;
 }
 if(process.argv.includes('--visibility-probe')){
  const html=readFileSync(join(fixture,'index.html'),'utf8'),before=(await api(preview())).revision;
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().startsWith('http://127.0.0.1:')).hide());
  await page.waitForTimeout(1000);
  const hidden=await page.evaluate(()=>document.hidden);
  writeFileSync(join(fixture,'index.html'),html.replace('</body>','<p id="visibility-probe">Foreground refresh verified</p></body>'));
  await api(preview()+'/build',{});await wait(async()=>(await api(preview())).revision>before);
  const staleWhileHidden=await frame().locator('#visibility-probe').count()===0;
  await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().startsWith('http://127.0.0.1:'));w.show();w.focus();});await page.bringToFront();
  await wait(async()=>await frame().locator('#visibility-probe').textContent({timeout:1000}).then(v=>v==='Foreground refresh verified').catch(()=>false));
  report.visibilityProbe={hidden,serverAdvanced:true,staleWhileHidden,foregroundRefreshed:true};
  report.visibilityProbe.hiddenStateExercised=hidden&&staleWhileHidden;
 }
 if(process.argv.includes('--soak')){
  check((await api('status')).plan.targets.length===0,'Soak profile must have no inference routes');
  report.soak={conditions:'Packaged Electron, fresh profile; OS caches/load uncontrolled; no inference.',samples:[],inferenceRequests:0};
  const original=readFileSync(join(fixture,'index.html'),'utf8'),count=Number(process.env.LOCALAGENT_SOAK_ROUNDS||20);
  check(Number.isInteger(count)&&count>=2&&count<=120,'Invalid soak duration');
  for(let round=0;round<count;round++){
   const wasHidden=await page.evaluate(()=>document.hidden);
   await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().startsWith('http://127.0.0.1:'));w.restore();w.show();w.focus();});await page.bringToFront();
   check(!await page.evaluate(()=>document.hidden),'Soak window remained hidden after activation');
   const start=Date.now();writeFileSync(join(fixture,'index.html'),original.replace('</body>',`<p id="soak-marker">Soak revision ${round}</p></body>`));
   await api(preview()+'/build',{});
   await wait(async()=>await frame().locator('#soak-marker').textContent({timeout:1000}).then(text=>text===`Soak revision ${round}`).catch(()=>false));
   const sessionList=await api(`projects/${project.id}/sessions`);if(sessionList[0])await api('sessions/'+sessionList[0].id);
   if(round%5===0)await inspect(['desktop','tablet','mobile'][Math.floor(round/5)%3]);
   const latencyMs=Date.now()-start,state=metadata(),metrics=await app.evaluate(({app})=>app.getAppMetrics().map(p=>({pid:p.pid,type:p.type,cpu:p.cpu.percentCPUUsage,memory:p.memory})));
   const ids=[...new Set([state.pid,...state.children.map(c=>c.pid),...metrics.map(m=>m.pid)])];
   const os=spawnSync(join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-NonInteractive','-Command',"$ids=$env:LOCALAGENT_METRIC_IDS.Split(',')|ForEach-Object {[int]$_};Get-Process -Id $ids | Select-Object Id,CPU,WorkingSet64,PrivateMemorySize64,HandleCount,@{n='Threads';e={$_.Threads.Count}} | ConvertTo-Json -Compress"],{env:{...process.env,LOCALAGENT_METRIC_IDS:ids.join(',')},windowsHide:true,encoding:'utf8',timeout:15000});
   check(os.status===0,'Soak process metrics failed');
   report.soak.samples.push({round,wasHidden,latencyMs,roles:state.children,electron:metrics,os:JSON.parse(os.stdout)});
   writeFileSync(join(directory,'packaged-soak.progress.json'),JSON.stringify(report));
   console.log(JSON.stringify({soakRound:round,latencyMs}));
   await new Promise(r=>setTimeout(r,60000));
  }
  await capture('packaged-soak.png');
 }
 if(process.argv.includes('--memory-probe')){
  const cdp=await page.context().newCDPSession(page);await cdp.send('Performance.enable');
  const sample=async()=>{await cdp.send('HeapProfiler.collectGarbage');const counters=await cdp.send('Memory.getDOMCounters'),metrics=await cdp.send('Performance.getMetrics');return {...counters,heap:Object.fromEntries(metrics.metrics.filter(m=>['JSHeapUsedSize','JSHeapTotalSize','Documents','Nodes'].includes(m.name)).map(m=>[m.name,m.value]))};};
  report.rendererMemory={scope:'Test-only forced GC and numerical counters, not heap contents; repeated navigation without inference.',before:await sample()};
  for(let n=0;n<20;n++){await page.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name:/^Connections/}).click();await page.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name:'Workspace',exact:true}).click();}
  await page.waitForTimeout(2000);report.rendererMemory.after=await sample();
  for(let n=0;n<20;n++){await page.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name:/^Connections/}).click();await page.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name:'Workspace',exact:true}).click();}
  await page.waitForTimeout(2000);report.rendererMemory.afterSecondBatch=await sample();
 }
 check(!report.rendererErrors.length,'Workspace renderer errors');report.passed=true;
}catch(e){report.passed=false;report.failure=redact(e.message);if(page){report.windowDiagnostics=await page.evaluate(()=>({hidden:document.hidden,visibility:document.visibilityState,caption:document.querySelector('.preview-caption')?.textContent,marker:document.querySelector('iframe')?.isConnected,frameSrc:document.querySelector('iframe[title="Isolated website preview"]')?.src||null})).catch(()=>null);const state=await api(preview()).catch(()=>null);if(state)report.previewDiagnostics={state:state.state,revision:state.revision};report.visibleDiagnostics=await page.locator('.preview-console').innerText().catch(()=>'');const name='acceptance-failure-'+Date.now()+'.png';try{await capture(name);report.failureScreenshot=name;}catch{report.failureScreenshotCaptured=false;}}process.exitCode=1;}
finally{
 const before=existsSync(join(profile,'runtime/desktop-state.json'))?metadata():{};if(app)await app.close().catch(()=>{});
 await wait(()=>![before.pid,...(before.children||[]).map(c=>c.pid)].filter(Boolean).some(alive),12000).then(()=>report.shutdown=true).catch(()=>{report.shutdown=false;report.passed=false;process.exitCode=1;});
 writeFileSync(join(directory,`${packaged?'packaged':'development'}-${coding?'coding':'fixture'}.json`),redact(JSON.stringify(report,null,2)));console.log(redact(JSON.stringify(report)));
}
