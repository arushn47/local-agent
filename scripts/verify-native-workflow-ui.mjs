// Imported only by the credential-free deterministic native verifier. This is
// actual browser interaction with the product API and native tools, not live AI.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { once } from 'node:events';
import { spawnSync } from 'node:child_process';
import { createTasks } from '../src/workspace/tasks.mjs';
import { createWorkspaceServer } from '../src/workspace/server.mjs';
import { loadWorkflow } from '../src/workspace/workflow-engine.mjs';
import { launchBrowser } from './browser.mjs';

export async function verifyNativeWorkflowUI({engine,config,profile,qualified}) {
  const path=join(profile,'ui-flow');mkdirSync(path);
  const before='export function double(n){ return n + 1; }\n';
  const test="import {double} from './target.mjs';import assert from 'node:assert/strict';import fs from 'node:fs';assert.equal(double(3),6);assert.equal(double(-3),-6);assert.equal(double(0),0);fs.writeFileSync('command-ran','yes');\n";
  writeFileSync(join(path,'target.mjs'),before);writeFileSync(join(path,'check.test.mjs'),test);
  assert.notEqual(spawnSync(process.execPath,['--test','check.test.mjs'],{cwd:path,windowsHide:true}).status,0);
  const project={id:'ui-project',name:'Native UI acceptance',path};
  const projects={list:()=>[project],get:()=>project};
  const tasks=createTasks(engine,projects,{sessionFile:join(path,'sessions.json'),pollMs:100,deadlineMs:60000});
  // Execution readiness belongs only to this isolated server. The native
  // permission verifier remains unchanged and production startup stays gated.
  const server=createWorkspaceServer({config,projects,tasks,credentials:{},engine:{...engine,workflowReady:true},port:0});
  let browser;
  const errors=[],approvals=[];
  try {
    server.listen(0,'127.0.0.1');await once(server,'listening');
    browser=await launchBrowser();const page=await browser.newPage({viewport:{width:1440,height:900}});
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
    await page.goto('http://127.0.0.1:'+server.address().port);
    await page.getByRole('button',{name:project.name,exact:true}).first().click();
    await page.getByRole('tab',{name:'Workflows',exact:true}).click();
    await page.getByRole('button',{name:'+ New Workflow',exact:true}).click();
    await page.getByLabel('Task or Feature Objective').fill('Fix and independently verify double(n)');
    const plan={id:'wf-ui-double',title:'Native UI coding acceptance',policy:'free_only',budget:{maxSpendUsd:0,maxRequests:8,maxTokens:64000},stages:[
      {id:'implement',title:'Implement double',agent:'implementer',prompt:'CASE_edit_ui',assignedModel:qualified,targetFiles:['target.mjs']},
      {id:'test',title:'Verify double',agent:'tester',prompt:'CASE_bash_ui',assignedModel:qualified,testCommand:'node --test check.test.mjs',dependsOn:['implement']},
      {id:'review',title:'Review changes',agent:'reviewer',prompt:'CASE_review_ui',assignedModel:qualified,dependsOn:['test']}
    ]};
    plan.stages=[{id:'cycle',title:'Implement, test and review',type:'repeat',maxIterations:2,exitCondition:'tests_passed && reviewer_approved',steps:plan.stages}];
    await page.getByLabel('Reviewed plan JSON (optional)').fill(JSON.stringify(plan));
    await page.getByRole('button',{name:'Create & Plan',exact:true}).click();
    const start=page.getByRole('button',{name:'Start workflow',exact:true});await start.waitFor();
    assert.equal(readFileSync(join(path,'target.mjs'),'utf8'),before);
    await start.click();
    const deadline=Date.now()+110000, answered=new Set();let final,humanReviewed=false;
    while(Date.now()<deadline){
      final=loadWorkflow(plan.id,path);
      const permission=page.getByRole('group',{name:'Workflow tool permission'});
      const requestId=await permission.count()?await permission.first().getAttribute('data-permission-id'):null;
      if(requestId && !answered.has(requestId)){
        const text=await permission.first().innerText();
        if(text.startsWith('edit:'))assert.equal(readFileSync(join(path,'target.mjs'),'utf8'),before);
        else {assert.ok(text.startsWith('bash:'));assert.equal(existsSync(join(path,'command-ran')),false);}
        answered.add(requestId);approvals.push(text.split('\n')[0]);await permission.first().getByRole('button',{name:'Allow once',exact:true}).click();
      }
      if(final?.status==='paused'&&final.stepStates.review?.error==='workflow_review_required'){
        assert.ok(!final.stepStates.review.reviewerApproved);
        await page.getByRole('button',{name:'Approve reviewed changes',exact:true}).waitFor();
        assert.ok(await page.getByRole('button',{name:'Resume workflow',exact:true}).isDisabled());
        page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Approve reviewed changes',exact:true}).click();
        await page.waitForFunction(()=>!document.querySelector('button[aria-label="Resume workflow"]')?.disabled);
        humanReviewed=true;await page.getByRole('button',{name:'Resume workflow',exact:true}).click();
      }
      if(['completed','failed','cancelled'].includes(final?.status))break;
      await page.waitForTimeout(150);
    }
    assert.equal(final?.status,'completed',JSON.stringify(final?.stepStates));
    assert.equal(approvals.length,2);assert.equal(final.stepStates.test.testPassed,true);
    assert.ok(humanReviewed&&final.stepStates.review.reviewerApproved);
    assert.equal(new Set(Object.values(final.stepStates).map(step=>step.sessionID)).size,3);
    assert.equal(final.loopStates.cycle.status,'succeeded');assert.equal(final.loopStates.cycle.iteration,1);
    assert.notEqual(final.stepStates.implement.sessionID,final.stepStates.test.sessionID);
    for(const step of Object.values(final.stepStates))assert.equal(step.assignedModel,qualified);
    assert.equal(readFileSync(join(path,'check.test.mjs'),'utf8'),test);
    const independent=spawnSync(process.execPath,['--test','check.test.mjs'],{cwd:path,windowsHide:true,encoding:'utf8'});
    assert.equal(independent.status,0,independent.stdout+independent.stderr);
    const ledger=JSON.parse(readFileSync(join(profile,'budget-ledger.json')));
    const accounting=Object.values(ledger.workflows)[0];
    assert.ok(accounting.calls<=8);assert.ok(accounting.reservedTokensLifetime<=64000);
    await page.reload();await page.getByRole('tab',{name:'Workflows',exact:true}).click();
    await page.getByText('Native UI coding acceptance',{exact:true}).waitFor();
    assert.equal(loadWorkflow(plan.id,path).status,'completed');assert.deepEqual(errors,[]);
    mkdirSync('validation/mvp',{recursive:true});await page.screenshot({path:'validation/mvp/native-ui-completed.png',fullPage:true});
    return {name:'browser-native-workflow',passed:true,approvals,humanReviewed,distinctSessions:3,nativeRepeatCycle:final.loopStates.cycle,independentTestsPassed:true,terminalStatePreserved:true,accounting,errors};
  } finally {tasks.stop();await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
