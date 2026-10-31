// Isolated UI fixture: no engine, credentials or inference.
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {mkdirSync,writeFileSync} from 'node:fs';
import {createWorkspaceServer} from '../src/workspace/server.mjs';
import {loadConfig} from '../src/config.mjs';
import {launchBrowser} from './browser.mjs';
const directory='validation/phase6';mkdirSync(directory,{recursive:true});
const project={id:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',name:'Context fixture',path:'D:\\Fixture'};
let context={source:'opencode-reported',inputTokens:100,inputIncludingCache:123};
const messages=[{id:'msg_1',role:'user',failed:false,parts:[{type:'compaction',auto:true},{type:'text',text:'Continue the task.'}]}];
let compaction={count:1,auto:true};
const server=createWorkspaceServer({config:loadConfig(),projects:{list:()=>[project],get:()=>project},tasks:{list:()=>[{id:'ses_context',projectId:project.id,title:'Context fixture task'}],snapshot:async()=>({state:'completed',messages,permissions:[],diffs:[],context,compaction})},credentials:{},port:0});
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
 const summary=page.locator('.context-usage > summary');
 await page.getByText('123 last input tokens',{exact:false}).waitFor();
 await page.getByText('Earlier history summarized automatically · OpenCode compaction',{exact:true}).waitFor();
 assert.equal(await page.locator('.compaction-marker').count(),1);
 await summary.focus();await page.keyboard.press('Enter');
 assert.equal(await page.locator('.context-usage').getAttribute('open'),'');
 assert.match(await page.locator('.context-usage').innerText(),/not a live measurement/);
 assert.equal(await page.getByText('Manual compaction is unavailable in the pinned coding engine.',{exact:false}).isVisible(),false);
 await page.getByText('Technical details',{exact:true}).click();
 assert.match(await page.locator('.context-technical').innerText(),/Manual compaction is unavailable/);
 await page.screenshot({path:directory+'/context-desktop.png',fullPage:true});  context={source:'unavailable',inputTokens:null};compaction={count:0,auto:false};
 await page.getByRole('button',{name:'Context fixture task',exact:true}).click();
 await page.getByText('Context · usage unavailable',{exact:true}).waitFor();
 await page.setViewportSize({width:390,height:844});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.screenshot({path:directory+'/context-mobile.png',fullPage:true});
 assert.deepEqual(errors,[]);
 writeFileSync(directory+'/context-ui.json',JSON.stringify({passed:true,fixture:true,inferenceRequests:0,keyboard:true,missingUsage:true,mobileReflow:true,compactionMarker:true,errors},null,2));
}finally{await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
