import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,readFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {once} from 'node:events';
import {spawnSync} from 'node:child_process';
import {createTasks} from '../src/workspace/tasks.mjs';
import {createWorkspaceServer} from '../src/workspace/server.mjs';
import {launchBrowser} from './browser.mjs';
export async function verifyNativeSingleUI({engine,config,profile,getCalls}){
  const path=join(profile,'ui-flow');mkdirSync(path);
  const before='export function double(n){ return n + 1; }\n';
  const test="import {double} from './target.mjs';import assert from 'node:assert/strict';import fs from 'node:fs';assert.equal(double(3),6);assert.equal(double(-3),-6);assert.equal(double(0),0);fs.writeFileSync('command-ran','yes');\n";
  writeFileSync(join(path,'target.mjs'),before);writeFileSync(join(path,'check.test.mjs'),test);
  assert.notEqual(spawnSync(process.execPath,['--test','check.test.mjs'],{cwd:path,windowsHide:true}).status,0);
  const project={id:'single-project',name:'Native single-agent acceptance',path},projects={list:()=>[project],get:()=>project};
  const tasks=createTasks(engine,projects,{sessionFile:join(path,'sessions.json'),pollMs:100,coordinateProject:true});
  const server=createWorkspaceServer({config,projects,tasks,engine,credentials:{},port:0});let browser;const errors=[],approvals=[],answered=new Set();
  try{
    server.listen(0,'127.0.0.1');await once(server,'listening');browser=await launchBrowser();const page=await browser.newPage({viewport:{width:1440,height:900}});page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
    await page.goto('http://127.0.0.1:'+server.address().port);await page.getByRole('button',{name:project.name,exact:true}).first().click();
    const qualified='openrouter/example/coder:free';
    await page.getByLabel('Coding model',{exact:true}).selectOption(qualified);
    await page.getByRole('button',{name:/^Project memory/}).click();
    await page.getByLabel('Project brief',{exact:true}).fill('Deterministic project brief: double multiplies by two; preserve fixed tests.');
    await page.getByRole('button',{name:'Save shared brief',exact:true}).click();
    await page.getByLabel('Describe your coding task').fill('CASE_single_ui Read target.mjs, fix double(n), then run exactly node --test check.test.mjs.');
    await page.getByRole('button',{name:'Start task',exact:true}).click();
    const deadline=Date.now()+110000;let final,sessionID,steered=false;
    while(Date.now()<deadline){
      sessionID=tasks.list(project.id)[0]?.id;
      if(sessionID){final=await tasks.snapshot(sessionID);
        for(const permission of final.permissions){
          if(answered.has(permission.id))continue;
          assert.ok(['edit','bash'].includes(permission.permission));
          if(permission.permission==='edit')assert.equal(readFileSync(join(path,'target.mjs'),'utf8'),before);
          else assert.equal(existsSync(join(path,'command-ran')),false);
          const card=page.getByRole('region',{name:'Permission request',exact:true}).filter({hasText:'Permission needed · '+permission.permission});await card.waitFor();
          if(permission.permission==='edit'&&!steered){
            await page.getByRole('tab',{name:'Files',exact:true}).click();
            await page.getByRole('button',{name:'Follow agent',exact:true}).click();
            await page.getByRole('region',{name:'File contents, read only'}).filter({hasText:'return n + 1'}).waitFor();
            const composer=page.getByLabel('Describe your coding task');
            await composer.fill('CASE_single_ui Keep the fixed tests unchanged.');await page.getByRole('button',{name:'Queue message',exact:true}).click();
            const queued=page.getByRole('article',{name:'Queued message'});
            await queued.getByRole('button',{name:'Edit message',exact:true}).click();await page.getByLabel('Edit queued message',{exact:true}).fill('CASE_single_ui Steering: preserve fixed tests and continue.');await queued.getByRole('button',{name:'Save message',exact:true}).click();
            await queued.getByRole('button',{name:'Steer now',exact:true}).click();
            await queued.waitFor({state:'hidden'});
            await composer.fill('CASE_single_ui Queued follow-up: report the finished result.');await page.getByRole('button',{name:'Queue message',exact:true}).click();
            steered=true;
          }
          answered.add(permission.id);approvals.push(permission.permission);await card.getByRole('button',{name:'Allow once',exact:true}).click();
        }
        if(final.state!=='running'&&!final.session.queue?.length)break;
      }
      await page.waitForTimeout(100);
    }
    assert.equal(final?.state,'completed');assert.deepEqual(approvals,['edit','bash']);
    assert.equal(steered,true);assert.equal(final.session.modelId,qualified);
    assert.ok(final.messages.some(m=>m.role==='user'&&m.parts.some(p=>p.text?.includes('Steering: preserve fixed tests'))),'native steer was consumed in the same chat');
    assert.ok(final.messages.some(m=>m.role==='user'&&m.parts.some(p=>p.text?.includes('Queued follow-up'))),'queue drained after completion');
    await page.getByRole('region',{name:'File contents, read only'}).filter({hasText:'return n * 2'}).waitFor();
    const count=tasks.list(project.id).length;await page.getByLabel('Coding model',{exact:true}).selectOption('auto');
    await page.waitForFunction(()=>document.querySelector('[aria-label="Coding model"]')?.value==='auto');
    await page.getByLabel('Describe your coding task').fill('CASE_single_ui After switching models, keep the same chat.');await page.getByRole('button',{name:'Start task',exact:true}).click();
    for(let i=0;i<100;i++){final=await tasks.snapshot(sessionID);if(final.state==='completed')break;await page.waitForTimeout(100);}
    assert.equal(final.state,'completed');assert.ok(final.messages.some(m=>m.role==='user'&&m.parts.some(p=>p.text?.includes('After switching models'))));
    assert.equal(tasks.list(project.id).length,count);assert.equal(tasks.list(project.id)[0].id,sessionID);assert.equal((await tasks.snapshot(sessionID)).session.modelId,'auto');
    const tools=final.messages.flatMap(m=>m.parts).filter(p=>p.type==='tool');assert.ok(tools.some(t=>t.tool==='bash'&&t.command==='node --test check.test.mjs'&&t.status==='completed'&&t.exit===0));
    assert.equal(readFileSync(join(path,'check.test.mjs'),'utf8'),test);assert.equal(spawnSync(process.execPath,['--test','check.test.mjs'],{cwd:path,windowsHide:true}).status,0);assert.ok(final.diffs.length);
    await page.getByRole('tab',{name:'Changes',exact:false}).click();await page.getByRole('tab',{name:'Tests',exact:true}).click();await page.getByText('● Last run passed',{exact:true}).waitFor();
    const calls=getCalls();await page.reload();await page.getByLabel('Describe your coding task').waitFor();await page.waitForTimeout(500);assert.equal(getCalls(),calls);assert.deepEqual(errors,[]);
    mkdirSync('validation/mvp',{recursive:true});await page.screenshot({path:'validation/mvp/native-single-completed.png',fullPage:true});
    return {name:'browser-native-single-agent',passed:true,approvals,independentTestsPassed:true,actualEditAndTest:true,reloadDidNotReplay:true,exactModel:true,sameChatModelSwitch:true,projectMemory:true,followAgent:true,queuedFollowup:true,nativeSteering:true,errors};
  }finally{tasks.stop();await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
}
