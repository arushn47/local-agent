import { launchBrowser } from './browser.mjs';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { root, loadEnvironment } from '../src/config.mjs';
const directory=join(root,'validation/phase2');mkdirSync(directory,{recursive:true});
const browser=await launchBrowser();
const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
const report={browserErrors:errors,inferenceRequested:false};
const check=(value,message)=>{if(!value)throw Error(message);};
const request=async(path,body)=>page.evaluate(async({path,body})=>{const r=await fetch('/api/v1/'+path,{...(body===undefined?{}:{method:'POST',body:JSON.stringify(body)}),headers:{'Content-Type':'application/json','X-LocalAgent-Request':'1'}});return {status:r.status,data:await r.json()};},{path,body});
try{
 await page.goto('http://127.0.0.1:20140',{waitUntil:'networkidle'});
 await page.getByRole('heading',{name:/A workspace for/}).waitFor();
 await page.screenshot({path:join(directory,'localagent-home.png'),fullPage:true});
 await page.getByRole('button',{name:/Connections/}).click();
 await page.getByRole('heading',{name:'Google Gemini',exact:true}).waitFor();
 await page.screenshot({path:join(directory,'localagent-connections.png'),fullPage:true});
 await page.getByRole('button',{name:'Manage connection'}).first().click();
 await page.getByLabel('API key',{exact:true}).waitFor();
 await page.waitForTimeout(100);
 check(await page.getByLabel('API key',{exact:true}).evaluate(e=>e===document.activeElement),'Dialog focus not placed');
 await page.keyboard.press('Escape');check(await page.getByRole('dialog').count()===0,'Escape did not close dialog');
 report.keyboardDialog=true;
 if(process.argv.includes('--save-key')){
   const env=loadEnvironment();check(env.GEMINI_API_KEY&&env.GEMINI_FREE_TIER_CONFIRMED==='true','Confirmed free Gemini key required');
   await page.getByRole('button',{name:'Manage connection'}).first().click();await page.getByLabel('API key',{exact:true}).fill(env.GEMINI_API_KEY);
   await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Save connection',exact:true}).click();
   await page.getByRole('dialog').waitFor({state:'hidden',timeout:60000});
   const status=(await request('status')).data;check(!JSON.stringify(status).includes(env.GEMINI_API_KEY),'Saved key leaked');report.secureProviderSave=true;
 }
 await page.getByRole('button',{name:'Routing',exact:true}).click();await page.getByRole('heading',{name:/Intelligence with/}).waitFor();
 await page.screenshot({path:join(directory,'localagent-routing.png'),fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});
 await page.getByRole('button',{name:'Workspace',exact:true}).click();
 check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Narrow layout overflows');
 await page.screenshot({path:join(directory,'localagent-mobile.png'),fullPage:true});report.narrowLayout=true;
 await page.setViewportSize({width:1440,height:1000});
 const reviewing=process.argv.includes('--review-session');
 const fixture=reviewing?(await request('projects')).data.find(p=>p.name.startsWith('double-')).path:join(root,'.workspace-check','double-'+Date.now());
 if(!reviewing){mkdirSync(fixture,{recursive:true});writeFileSync(join(fixture,'double.mjs'),'export function double(n) { return n; }\n');}
 if(!reviewing){spawnSync('git',['init',fixture],{windowsHide:true,stdio:'ignore'});spawnSync('git',['-C',fixture,'add','double.mjs'],{windowsHide:true,stdio:'ignore'});}
 await page.getByLabel('Open a local project',{exact:true}).fill(fixture);await page.getByRole('button',{name:'Open project',exact:true}).click();
 await page.getByRole('heading',{name:/double-/}).waitFor();report.projectOpened=true;
 await page.screenshot({path:join(directory,'localagent-workspace.png'),fullPage:true});
 if(process.argv.includes('--coding')||reviewing){
   if(!reviewing){report.inferenceRequested=true;await page.getByLabel('Describe your coding task').fill('Read double.mjs. Fix double(n) to return n multiplied by 2. Add double.test.mjs using node:test and node:assert/strict verifying double(3) is 6 and double(-2) is -4. Run exactly node --test. Change only those two files. Complete all steps.');
   await page.getByRole('button',{name:'Start task',exact:true}).click();}
   else await page.locator('.session-tabs button').filter({hasText:'Read double.mjs.'}).first().click();
   const end=Date.now()+130000;let snapshot,session;
   while(Date.now()<end){
     const projects=(await request('projects')).data;const p=projects.find(p=>p.path===fixture);const sessions=(await request('projects/'+p.id+'/sessions')).data;session=sessions[0];
     if(session){snapshot=(await request('sessions/'+session.id)).data;
       if(snapshot.error){await request('sessions/'+session.id+'/cancel',{});throw Error('Snapshot failed: '+snapshot.error);}
       for(const permission of snapshot.permissions||[]){
         const allowed=permission.permission==='edit'||permission.permission==='bash'&&permission.patterns?.every(p=>p==='node --test');
         if(!allowed){await request('sessions/'+session.id+'/cancel',{});throw Error('Unexpected permission action: '+permission.permission);}
         await page.getByRole('button',{name:'Allow once',exact:true}).first().click();
       }
       if(['completed','provider_error','progress_budget_exhausted','task_deadline_exceeded'].includes(snapshot.state))break;
     }
     await page.waitForTimeout(1000);
   }
   report.taskState=snapshot?.state;
   const tools=snapshot?.messages.flatMap(m=>m.parts).filter(p=>p.type==='tool')||[];const lastTest=tools.filter(p=>p.tool==='bash'&&p.command==='node --test').at(-1);
   report.agentTestExit=lastTest?.exit;report.actions=tools.map(p=>({tool:p.tool,status:p.status,exit:p.exit}));
   writeFileSync(join(directory,'coding-actions.json'),JSON.stringify(report.actions,null,2));
   writeFileSync(join(directory,'agent-tests.txt'),lastTest?.output||'No completed agent test command');
   spawnSync('git',['-C',fixture,'add','-N','double.test.mjs'],{windowsHide:true,stdio:'ignore'});
   writeFileSync(join(directory,'source.diff'),spawnSync('git',['-C',fixture,'diff','--','double.mjs','double.test.mjs'],{windowsHide:true,encoding:'utf8'}).stdout||'');
   await page.getByRole('button',{name:'Tests',exact:true}).click();await page.screenshot({path:join(directory,'localagent-coding-result.png'),fullPage:true});
   check(snapshot?.state==='completed'&&lastTest?.exit===0&&/return n\s*\*\s*2/.test(readFileSync(join(fixture,'double.mjs'),'utf8')),'Agent did not complete edit and passing tests');
   check(snapshot.diffs.length>0,'No actual diff exposed through UI');
   await page.getByRole('button',{name:/^Changes/}).click();await page.locator('.diff').first().waitFor();
   await page.screenshot({path:join(directory,'localagent-changes.png'),fullPage:true});report.codingPassed=true;
 }
 check(!errors.length,'Browser page errors');report.passed=true;
}catch(e){report.passed=false;report.failure=e.message;process.exitCode=1;}
finally{writeFileSync(join(directory,'workspace-ui.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));await browser.close();}
