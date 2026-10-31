// Isolated UI fixture: no engine, credentials or inference.
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {mkdirSync,writeFileSync} from 'node:fs';
import {createWorkspaceServer} from '../src/workspace/server.mjs';
import {loadConfig} from '../src/config.mjs';
import {launchBrowser} from './browser.mjs';
const directory='validation/phase63';mkdirSync(directory,{recursive:true});
const project={id:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',name:'Context fixture',path:'D:\\Fixture'};
let context={source:'opencode-reported',inputTokens:100,inputIncludingCache:123};
const messages=[{id:'msg_answer',role:'assistant',parts:[{type:'text',text:'# Result\n\n**Passed** using `node --test`.\n\n```javascript\nconst value = 42;\n```\n\n<script>window.compromised=true</script>\n\n![tracking](https://tracker.invalid/pixel)\n\n[unsafe](javascript:alert%281%29)'}]},{id:'msg_1',role:'user',failed:false,parts:[{type:'compaction',auto:true},{type:'text',text:'Continue the task.'}]}];
let compaction={count:1,auto:true};
const server=createWorkspaceServer({config:loadConfig(),projects:{list:()=>[project],get:()=>project},tasks:{list:()=>[{id:'ses_context',projectId:project.id,title:'Context fixture task'}],history:async(id,before)=>{assert.equal(before,'msg_answer');return {messages:[{id:'msg_old',role:'user',parts:[{type:'text',text:'Earlier requirement: preserve the API.'}]}],hasMore:false};},snapshot:async()=>({state:'completed',messages,permissions:[],diffs:[],context,compaction})},credentials:{},port:0});
let browser;const errors=[];
try{
 server.listen(0,'127.0.0.1');await once(server,'listening');browser=await launchBrowser();
 const page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>{
   const url=new URL(route.request().url());
   if(url.hostname!=='127.0.0.1')return route.abort();
   if(url.pathname==='/api/v1/status')return route.fulfill({json:{providers:[],plan:{targets:[]},events:[]}});
   return route.continue();
 });
 await page.goto('http://127.0.0.1:'+server.address().port);
 await page.getByRole('button',{name:'Context fixture',exact:true}).click();
 await page.getByRole('button',{name:'Context fixture task',exact:true}).click();
 await page.locator('.markdown h1').filter({hasText:'Result'}).waitFor();
 await page.locator('code.language-javascript span').first().waitFor();
 assert.equal(await page.locator('.markdown script,.markdown img,.markdown a[href^="javascript:"]').count(),0);
 assert.equal(await page.evaluate(()=>window.compromised),undefined);
 await page.getByRole('button',{name:'Load earlier messages'}).focus();await page.keyboard.press('Enter');
 await page.getByText('Earlier requirement: preserve the API.',{exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Load earlier messages'}).count(),0);
 assert.equal(await page.locator('.message').count(),3);
 assert.ok(await page.getByRole('region',{name:'Coding conversation',exact:true}).evaluate(e=>e===document.activeElement));
 await page.getByLabel('Describe your coding task').fill('Keep my draft');
 await page.screenshot({path:directory+'/conversation-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.screenshot({path:directory+'/conversation-mobile.png',fullPage:true});
 assert.deepEqual(errors,[]);
 writeFileSync(directory+'/conversation-ui.json',JSON.stringify({passed:true,fixture:true,inferenceRequests:0,markdown:true,highlighting:true,unsafeContentBlocked:true,history:true,keyboard:true,mobileReflow:true,errors},null,2));
}finally{await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
