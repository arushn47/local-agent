// Browser behavior fixtures only: no gateway, provider requests or inference.
import { launchBrowser } from './browser.mjs';
import { once } from 'node:events';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createWorkspaceServer } from '../src/workspace/server.mjs';
import { root, loadConfig } from '../src/config.mjs';
const directory=join(root,'validation/phase2');mkdirSync(directory,{recursive:true});
const project={id:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',name:'Behavior fixture',path:'D:\\Fixture'};
let state='running',cancelled=0,offline=false;
const server=createWorkspaceServer({config:loadConfig(),projects:{list:()=>[project],get:()=>project,add:()=>{throw Error('project_directory_unavailable');}},tasks:{list:()=>[{id:'ses_fixture',projectId:project.id,title:'Fixture task'}],snapshot:async()=>({session:{id:'ses_fixture'},state,messages:[],permissions:[],diffs:[]}),cancel:async()=>{state='cancelled';cancelled++;}},credentials:{},port:0});
server.listen(0,'127.0.0.1');await once(server,'listening');
const browser=await launchBrowser();
const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
const check=(v,m)=>{if(!v)throw Error(m);};
const report={fixtures:true,inferenceRequests:0,errors};
try{
 await page.route('**/*',route=>{
   const u=new URL(route.request().url());
   if(u.hostname!=='127.0.0.1')return route.abort();
   if(offline&&u.pathname.startsWith('/api/'))return route.fulfill({status:503,contentType:'application/json',body:'{"error":"runtime_unavailable"}'});
   return route.continue();
 });
 await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'networkidle'});
 await page.getByLabel('Open a local project',{exact:true}).fill('missing-fixture-path');
 await page.getByRole('button',{name:'Open project',exact:true}).click();
 await page.getByRole('alert').filter({hasText:'That folder could not be opened'}).waitFor();report.projectError=true;
 await page.getByRole('button',{name:'Dismiss error'}).click();
 await page.getByRole('button',{name:/Connections/}).click();
 const manage=page.getByRole('button',{name:/Manage connection|Connect provider/}).first();await manage.click();
 await page.getByLabel('API key',{exact:true}).waitFor();await page.waitForTimeout(100);
 await page.keyboard.press('Shift+Tab');await page.keyboard.press('Shift+Tab');
 check(await page.getByRole('button',{name:'Disconnect provider',exact:true}).evaluate(e=>e===document.activeElement),'Dialog focus escaped');
 await page.keyboard.press('Tab');check(await page.getByRole('button',{name:'Close connection settings'}).evaluate(e=>e===document.activeElement),'Forward focus trap failed');
 await page.keyboard.press('Escape');check(await manage.evaluate(e=>e===document.activeElement),'Dialog focus not restored');report.keyboardTrap=true;
 await page.getByRole('button',{name:'Behavior fixture',exact:true}).click();
 await page.getByRole('button',{name:'Fixture task',exact:true}).click();
 const draft=page.getByLabel('Describe your coding task');await draft.fill('Preserve this unsent draft');
 offline=true;await page.getByText('Connection interrupted.',{exact:false}).waitFor();
 check(await draft.inputValue()==='Preserve this unsent draft','Draft lost during disconnect');
 await page.screenshot({path:join(directory,'localagent-reconnect-fixture.png'),fullPage:true});
 offline=false;await page.getByText('Connection interrupted.',{exact:false}).waitFor({state:'hidden'});report.reconnectDraft=true;
 await page.getByRole('button',{name:'Stop task',exact:false}).click();
 await page.getByText('Stopped. Review the result',{exact:false}).waitFor();check(cancelled===1,'Cancellation was not dispatched exactly once');report.cancel=true;
 await page.setViewportSize({width:720,height:950});await page.emulateMedia({reducedMotion:'reduce'});
 check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Reflow overflows');report.reflow=true;
 await page.screenshot({path:join(directory,'localagent-cancel-fixture.png'),fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.getByLabel('Project',{exact:true}).selectOption('');
 await page.getByRole('heading',{name:/A workspace for/}).waitFor();
 await page.getByLabel('Project',{exact:true}).selectOption(project.id);await page.getByRole('heading',{name:/Behavior fixture/}).waitFor();
 check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Mobile workspace overflows');report.mobileProjectSwitch=true;
 check(!errors.length,'Browser errors');report.passed=true;
}catch(e){report.passed=false;report.failure=e.message;process.exitCode=1;}
finally{console.log(JSON.stringify(report));writeFileSync(join(directory,'workspace-flows.json'),JSON.stringify(report,null,2));await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
