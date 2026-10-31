import {_electron} from 'playwright';
import {readFileSync,mkdirSync,writeFileSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
const require=createRequire(import.meta.url),output=resolve(process.env.LOCALAGENT_A11Y_EVIDENCE||'validation/phase52');mkdirSync(output,{recursive:true});
const profile=resolve('.localagent/release-accessibility-'+Date.now()),exe=resolve(process.env.LOCALAGENT_DESKTOP_EXE||'release/desktop-0.5.2/win-unpacked/LocalAgent.exe');
const report={executable:exe,profile,inferenceRequests:0,audits:[],checks:{},manualScreenReader:'not performed; platform accessibility tree is automated evidence only'};
const axe=readFileSync(require.resolve('axe-core/axe.min.js'),'utf8');let app,page;
const check=(condition,message)=>{if(!condition)throw Error(message);};
async function audit(name){await page.evaluate(axe);const result=await page.evaluate(async()=>{const r=await window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa','best-practice']}});return {violations:r.violations.map(v=>({id:v.id,impact:v.impact,description:v.description,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))})),incomplete:r.incomplete.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))})),passes:r.passes.length};});report.audits.push({name,...result});}
try{
 const env={...process.env,LOCALAGENT_USER_DATA_DIR:profile,PATH:process.env.SystemRoot+'\\System32;'+process.env.SystemRoot};for(const k of Object.keys(env))if(/API_KEY|TOKEN|SECRET|PASSWORD/i.test(k)||k.toLowerCase()==='path'&&k!=='PATH')delete env[k];
 const start=Date.now();app=await _electron.launch({executablePath:exe,env,timeout:30000});page=await app.firstWindow();
 await page.getByRole('heading',{name:/A workspace for/}).waitFor({timeout:180000});report.startupMs=Date.now()-start;
 const rootResponse=await fetch(page.url());await rootResponse.text();check(rootResponse.headers.get('set-cookie')===null,'Desktop HTTP response minted an API cookie');check((await fetch(new URL('/api/v1/projects',page.url()))).status===401,'Unauthenticated local HTTP client accessed projects');report.checks.nativeAuthentication=true;
 await audit('welcome');
 await page.getByRole('link',{name:'Skip to workspace'}).focus();await page.keyboard.press('Enter');check(await page.locator('#main').evaluate(e=>e===document.activeElement),'Skip link did not focus main');report.checks.skipLink=true;
 await page.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name:/^Connections/}).focus();await page.keyboard.press('Enter');await page.locator('h1').waitFor();check(await page.locator('h1').evaluate(e=>e===document.activeElement),'Navigation focus lost');
 await audit('connections');
 const opener=page.getByRole('button',{name:'Connect provider'}).first();await opener.focus();await page.keyboard.press('Enter');const key=page.getByLabel('API key',{exact:true});await key.waitFor();await key.evaluate(e=>e.focus());
 check(await page.locator('.sidebar').evaluate(e=>e.inert)&&await page.locator('main').evaluate(e=>e.inert),'Modal background is operable');
 const dialog=page.getByRole('dialog');await audit('provider-dialog');
 const last=dialog.getByRole('button',{name:'Disconnect provider'});await last.focus();await page.keyboard.press('Tab');check(await dialog.getByRole('button',{name:'Close connection settings'}).evaluate(e=>e===document.activeElement),'Forward focus escaped dialog');await page.keyboard.press('Shift+Tab');check(await last.evaluate(e=>e===document.activeElement),'Backward focus escaped dialog');
 const cdp=await page.context().newCDPSession(page);const tree=await cdp.send('Accessibility.getFullAXTree');report.accessibilityTree={dialog:tree.nodes.some(n=>!n.ignored&&n.role?.value==='dialog'&&n.name?.value==='Connect Google Gemini'),keyInput:tree.nodes.some(n=>!n.ignored&&n.role?.value==='textbox'&&n.name?.value==='API key'),backgroundNavigationExcluded:!tree.nodes.some(n=>!n.ignored&&n.role?.value==='navigation'&&n.name?.value==='Main navigation')};
 await cdp.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-transparency',value:'reduce'},{name:'prefers-contrast',value:'more'}]});
 check(await page.locator('.modal-backdrop').evaluate(e=>matchMedia('(prefers-reduced-transparency: reduce)').matches&&getComputedStyle(e).backdropFilter==='none'&&!getComputedStyle(e).backgroundColor.startsWith('rgba')),'Reduced transparency did not produce an opaque modal backdrop');
 await audit('provider-dialog-more-contrast');report.checks.reducedTransparency=true;report.checks.moreContrast=true;
 await cdp.send('Emulation.setEmulatedMedia',{features:[]});
 await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});check(await opener.evaluate(e=>e===document.activeElement),'Dialog did not restore focus');report.checks.dialogKeyboard=true;
 await page.getByRole('button',{name:'Routing',exact:true}).focus();await page.keyboard.press('Enter');await audit('routing');
 await page.getByRole('button',{name:'Workspace',exact:true}).focus();await page.keyboard.press('Enter');
 const fixture=resolve('.workspace-check/release-accessibility-'+Date.now());mkdirSync(fixture,{recursive:true});
 await page.getByLabel('Open a local project',{exact:true}).fill(fixture);await page.getByRole('button',{name:'Open project',exact:true}).click();await page.getByLabel('Describe your coding task').waitFor();await audit('coding-workspace');
 await page.getByRole('button',{name:'Tests',exact:true}).click();await audit('tests-panel');
 await page.getByRole('button',{name:'Preview',exact:true}).click();await page.getByRole('button',{name:'Add starter to empty folder'}).waitFor();await audit('preview-empty');
 await page.getByRole('button',{name:'Add starter to empty folder'}).click();await page.getByRole('button',{name:'Start isolated preview'}).click();await page.frameLocator('iframe[title="Isolated website preview"]').getByRole('heading').first().waitFor();await audit('preview-running');
 const newTask=page.getByRole('button',{name:'New task',exact:true});check(await newTask.evaluate(e=>{const r=e.getBoundingClientRect();return e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}),'New task overlapped in split preview');report.checks.splitPreviewTaskAction=true;
 const previewFrame=page.frames().find(f=>f!==page.mainFrame()&&f.url().startsWith('http://localhost:'));check(previewFrame,'Preview frame missing');await previewFrame.evaluate(axe);const starter=await previewFrame.evaluate(async()=>{const r=await window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa','best-practice']}});return {violations:r.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))})),incomplete:r.incomplete.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))})),passes:r.passes.length};});report.audits.push({name:'owned-static-starter-frame',...starter});

 await page.getByRole('button',{name:'Stop preview'}).click();await page.getByRole('button',{name:'Open another project',exact:true}).click();
 await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});await audit('mobile-reduced-motion');check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Mobile overflow');report.checks.responsive=true;
 check(await page.getByRole('navigation',{name:'Main navigation'}).getByRole('button').first().evaluate(e=>getComputedStyle(e).transitionDuration.split(',').every(v=>parseFloat(v)===0)),'Reduced motion did not disable navigation transitions');report.checks.reducedMotion=true;
 await page.screenshot({path:join(output,'accessibility-mobile.png')});
 await page.setViewportSize({width:1380,height:940});await page.emulateMedia({forcedColors:'active',reducedMotion:'reduce'});await audit('forced-colors');const keyboardTarget=page.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name:'Workspace',exact:true});await keyboardTarget.focus();check(await keyboardTarget.evaluate(e=>e===document.activeElement&&getComputedStyle(e).outlineStyle!=='none'),'Forced-colors keyboard focus missing');await page.screenshot({path:join(output,'accessibility-forced-colors.png')});report.checks.forcedColors=true;
 await page.emulateMedia({forcedColors:'none'});await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().startsWith('http://127.0.0.1:')).webContents.setZoomFactor(2));await page.waitForTimeout(200);check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'200 percent zoom overflow');await audit('200-percent-zoom');await page.screenshot({path:join(output,'accessibility-zoom.png')});report.checks.zoom200=true;await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().startsWith('http://127.0.0.1:')).webContents.setZoomFactor(1));await page.emulateMedia({reducedMotion:'no-preference'});await page.screenshot({path:join(output,'release-workspace.png')});
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().startsWith('http://127.0.0.1:')).webContents.setZoomFactor(4));
 check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'400 percent zoom overflow');await audit('400-percent-zoom');report.checks.zoom400=true;
 await page.screenshot({path:join(output,'accessibility-zoom400.png')});await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().startsWith('http://127.0.0.1:')).webContents.setZoomFactor(1));
 report.electronMetrics=await app.evaluate(({app})=>app.getAppMetrics().map(p=>({type:p.type,cpu:p.cpu.percentCPUUsage,memory:p.memory})));
 const state=JSON.parse(readFileSync(join(profile,'runtime/desktop-state.json')));report.runtimePids=[state.pid,...state.children.map(c=>c.pid)];
 const measured=spawnSync(join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-NonInteractive','-Command',"$ids=$env:LOCALAGENT_MEASURE_PIDS.Split(',') | ForEach-Object {[int]$_}; Get-Process -Id $ids -ErrorAction Stop | Select-Object Id,CPU,WorkingSet64,PrivateMemorySize64 | ConvertTo-Json -Compress"],{env:{...process.env,LOCALAGENT_MEASURE_PIDS:report.runtimePids.join(',')},windowsHide:true,encoding:'utf8',timeout:10000});if(measured.status===0)report.runtimeMetrics=JSON.parse(measured.stdout);
 report.passed=report.audits.every(a=>a.violations.length===0)&&Object.values(report.accessibilityTree).every(Boolean);
 if(!report.passed)process.exitCode=1;
}catch(e){report.passed=false;report.error=e.message;process.exitCode=1;}
finally{if(app)await app.close().catch(()=>{});writeFileSync(join(output,'accessibility.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
