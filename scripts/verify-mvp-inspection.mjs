import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {launchBrowser} from './browser.mjs';
process.env.LOCALAGENT_STATE_DIR=mkdtempSync(join(tmpdir(),'la-inspector-ui-'));
const {createWorkspaceServer}=await import('../src/workspace/server.mjs');
const {loadConfig,setCredentialOverlay}=await import('../src/config.mjs');
setCredentialOverlay({GEMINI_API_KEY:null,GROQ_API_KEY:null,OPENROUTER_API_KEY:null});
const profile=process.env.LOCALAGENT_STATE_DIR;
const projects=['A','B'].map((suffix,index)=>({id:'project-'+suffix,name:'Inspection '+suffix,path:join(profile,'project-'+suffix)}));
for(const project of projects){mkdirSync(project.path);writeFileSync(join(project.path,'fast.mjs'),`export const project = '${project.name}';\nexport const fast = 2;\n`);writeFileSync(join(project.path,'slow.mjs'),'export const slow = true;\n');}
const messages=[{id:'msg_status',role:'assistant',parts:[
  {type:'tool',tool:'bash',command:'node --test denied.test.mjs',status:'error',output:'Permission rejected'},
  {type:'tool',tool:'bash',command:'npm test',status:'completed',output:'No exit metadata'},
  {type:'tool',tool:'bash',command:'node --test pending.test.mjs',status:'running',output:'Running fixture'}
]}];
const tasks={list:id=>[{id:'session-'+id,projectId:id,title:'Inspect task '+id}],snapshot:async()=>({state:'idle',messages,permissions:[],diffs:[{file:join(projects[0].path,'fast.mjs'),patch:'+export const fast = 2;'}]})};
const server=createWorkspaceServer({config:loadConfig(),projects:{list:()=>projects,get:id=>projects.find(p=>p.id===id)},tasks,credentials:{},port:0});
let browser,delaySessions=false;const errors=[];
try{
  server.listen(0,'127.0.0.1');await once(server,'listening');browser=await launchBrowser();const page=await browser.newPage({viewport:{width:1440,height:900}});page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{const url=new URL(route.request().url());if(url.hostname!=='127.0.0.1')return route.abort();if(url.pathname.endsWith('/files/content')&&url.searchParams.get('path')==='slow.mjs'||delaySessions&&url.pathname==='/api/v1/projects/project-A/sessions')await new Promise(r=>setTimeout(r,500));return route.continue();});
  await page.goto('http://127.0.0.1:'+server.address().port);
  await page.getByRole('button',{name:'Inspection A',exact:true}).first().click();
  await page.getByRole('tab',{name:'Files',exact:true}).click();
  const fast=page.getByRole('button',{name:'fast.mjs file',exact:true}),slow=page.getByRole('button',{name:'slow.mjs file',exact:true});
  await fast.focus();await page.keyboard.press('Enter');
  await page.waitForFunction(()=>document.querySelector('.viewer .line-text')?.textContent.includes('Inspection A'));
  await page.waitForFunction(()=>document.querySelectorAll('.viewer .line-num').length===3&&document.querySelector('.viewer .line-text span'));
  await slow.click();await fast.focus();await page.keyboard.press('Space');await page.waitForTimeout(700);
  assert.ok((await page.locator('.viewer-code-wrapper').innerText()).includes('Inspection A'));
  await page.getByRole('button',{name:'Switch to light theme',exact:true}).click();await page.waitForTimeout(100);
  assert.equal(await page.locator('.viewer .line-num').count(),3);
  assert.equal(await page.locator('.viewer .line-num').allTextContents().then(n=>n.join(',')),'1,2,3');
  await page.getByRole('button',{name:'CHANGED (1)',exact:true}).click();await page.getByRole('button',{name:'fast.mjs file',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.viewer-filename')?.textContent==='fast.mjs');
  await page.getByRole('button',{name:'EXPLORER',exact:true}).click();await slow.click();
  await page.locator('.project-switch').click();
  await page.getByRole('dialog').getByRole('button',{name:/Inspection B/}).click();
  await page.waitForFunction(()=>document.querySelector('.viewer .line-text')?.textContent.includes('Inspection B'));await page.waitForTimeout(700);
  assert.ok((await page.locator('.viewer-code-wrapper').innerText()).includes('Inspection B'));
  await page.getByRole('tab',{name:'Commands',exact:true}).click();
  assert.equal(await page.locator('.command-card .cmd-badge').allTextContents().then(n=>n.join('|')),'failed|finished · exit unknown|running');
  await page.getByRole('tab',{name:'Tests',exact:true}).click();
  assert.ok((await page.locator('.test-status-pill').innerText()).includes('running'));
  assert.ok(!(await page.locator('.tests-panel').innerText()).includes('exit 1'));
  delaySessions=true;
  await page.locator('.project-switch').click();await page.getByRole('dialog').getByRole('button',{name:/Inspection A/}).click();
  await page.locator('.project-switch').click();await page.getByRole('dialog').getByRole('button',{name:/Inspection B/}).click();await page.waitForTimeout(700);
  assert.ok((await page.getByRole('tablist',{name:'Open tasks'}).innerText()).includes('project-B'));
  assert.ok(!(await page.getByRole('tablist',{name:'Open tasks'}).innerText()).includes('project-A'));
  await page.addInitScript(()=>localStorage.setItem('localagent.workspace',JSON.stringify({project:'project-A',draft:'Saved startup draft',theme:'dark',inspectorTab:'files'})));
  await page.reload();await page.getByLabel('Describe your coding task').waitFor();
  assert.equal(await page.getByLabel('Describe your coding task').inputValue(),'Saved startup draft');
  await page.getByLabel('Describe your coding task').fill('Typed while history restores');await page.waitForTimeout(700);
  assert.equal(await page.getByLabel('Describe your coding task').inputValue(),'Typed while history restores');
  await page.setViewportSize({width:390,height:844});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
  assert.deepEqual(errors,[]);mkdirSync('validation/mvp',{recursive:true});await page.screenshot({path:'validation/mvp/inspector-mobile.png',fullPage:true});
  writeFileSync('validation/mvp/inspection.json',JSON.stringify({passed:true,liveInferenceRequests:0,keyboardFileSelection:true,lateResponsesIsolated:true,lineNumbersAfterHighlightAndTheme:true,changedAbsolutePathNormalized:true,projectSwitchIsolation:true,startupDraftPreserved:true,commandStates:true,testStates:true,mobileReflow:true,errors},null,2));
  console.log('File inspection and command/test state browser checks passed.');
}finally{await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
