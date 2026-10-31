// Extended-conversation fixture: ten 50-message pages, scroll anchoring,
// bounded history, task switching and accessibility. Loopback only, no engine.
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {createWorkspaceServer} from '../src/workspace/server.mjs';
import {loadConfig} from '../src/config.mjs';
import {launchBrowser} from './browser.mjs';

const directory='validation/phase64';
mkdirSync(directory,{recursive:true});
const require=createRequire(import.meta.url);
const axe=readFileSync(require.resolve('axe-core/axe.min.js'),'utf8');
const project={id:'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',name:'Scale fixture',path:'D:\\Fixture'};
// Twelve pages exist so the 500-message view bound is reached before the data ends.
const pages=12;
const latest=()=>[
  {id:'msg_latest_0',role:'assistant',parts:[
    {type:'text',text:'# Summary\n\n**All checks passed.** The `double` helper is covered.\n\n```javascript\nconst double = (n) => n * 2;\nexport { double };\n```'},
  ]},
  {id:'msg_latest_1',role:'user',parts:[{type:'text',text:'Current message 0: keep the public API stable.'}]},
  {id:'msg_latest_2',role:'assistant',parts:[{type:'tool',tool:'bash',status:'completed',title:'Run tests',output:'3 passed',exit:0,command:'node --test'},{type:'text',text:'Tests pass. Next: tidy the error text.'}]},
  {id:'msg_latest_3',role:'user',parts:[{type:'text',text:'Current message 2: tidy the error text.'}]},
  {id:'msg_latest_4',role:'assistant',parts:[{type:'text',text:'Done: the error text now names the failed file.'}]},
];
const beta=()=>[
  {id:'msg_beta_0',role:'user',parts:[{type:'text',text:'Beta current: unrelated task.'}]},
  {id:'msg_beta_1',role:'assistant',parts:[{type:'text',text:'Beta answer stays separate.'}]},
];
// Each older page carries one id that the client already has, to prove dedupe.
const pageFor=(session,p)=>Array.from({length:50},(_,i)=>{
  const n=p*50+i;
  if(p>0&&i===49)return {id:`msg_${session}_old_${(p-1)*50}`,role:'user',parts:[{type:'text',text:'duplicate boundary message'}]};
  return {id:`msg_${session}_old_${n}`,role:n%2?'assistant':'user',parts:[{type:'text',text:`Older ${session} page ${p} item ${n}: requirement retained across compaction.`}]};
});
const historyCalls=[];
const server=createWorkspaceServer({
  config:loadConfig(),
  projects:{list:()=>[project],get:()=>project},
  tasks:{
    list:()=>[{id:'ses_scale',projectId:project.id,title:'Task Alpha'},{id:'ses_beta',projectId:project.id,title:'Task Beta'}],
    history:async(id,before)=>{
      historyCalls.push({id,before});
      if(id==='ses_beta')return {messages:[{id:'msg_beta_old',role:'user',parts:[{type:'text',text:'Beta older message.'}]}],hasMore:false};
      // The UI pages from the oldest rendered id: the first call uses the latest
      // page's oldest message, later calls use the oldest id of the page returned.
      const page=before==='msg_latest_0'?0:/^msg_scale_old_\d+$/.test(before)?Number(before.replace(/^msg_scale_old_/,''))/50+1:NaN;
      assert.ok(Number.isInteger(page)&&page>=0&&page<pages,'Unexpected history cursor: '+before);
      return {messages:pageFor('scale',page),hasMore:page+1<pages};
    },
    snapshot:async id=>id==='ses_beta'
      ? {state:'completed',messages:beta(),permissions:[],diffs:[],context:{source:'unavailable',inputTokens:null,percentage:null},compaction:{count:0,auto:false}}
      : {state:'completed',messages:latest(),permissions:[],diffs:[],context:{source:'opencode-reported',inputTokens:900,inputIncludingCache:1000},compaction:{count:1,auto:true}},
  },
  credentials:{},port:0,
});
let browser,page;const errors=[];const report={fixture:true,inferenceRequests:0,pages,checks:{},measurements:{},audits:[]};
const region=page=>page.locator('.conversation');
const count=async page=>page.locator('.conversation .message').count();
// The paging control sits above the transcript, so prepending always starts from
// the top of the list. The invariant under test is that the message already on
// screen keeps its viewport offset, not that a mid-list element keeps its
// absolute position.
const viewOffset=handle=>handle.evaluate(e=>e.getBoundingClientRect().top-document.querySelector('.conversation').getBoundingClientRect().top);
async function audit(page,name){
  await page.evaluate(axe);
  const result=await page.evaluate(async()=>{
    const r=await window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa','best-practice']}});
    return {violations:r.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>n.target)})),incomplete:r.incomplete.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),passes:r.passes.length};
  });
  report.audits.push({name,...result});
  assert.deepEqual(result.violations,[],'Accessibility violations: '+JSON.stringify(result.violations));
}
try{
  server.listen(0,'127.0.0.1');await once(server,'listening');
  browser=await launchBrowser();
  page=await browser.newPage({viewport:{width:1440,height:900}});
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>{
    const url=new URL(route.request().url());
    if(url.hostname!=='127.0.0.1')return route.abort();
    if(url.pathname==='/api/v1/status')return route.fulfill({json:{providers:[],plan:{targets:[]},events:[]}});
    return route.continue();
  });
  await page.goto('http://127.0.0.1:'+server.address().port);
  await page.getByRole('button',{name:'Scale fixture',exact:true}).click();
  await page.getByRole('button',{name:'Task Alpha',exact:true}).click();
  await page.locator('.markdown h1').filter({hasText:'Summary'}).waitFor();
  await page.locator('code.language-javascript span').first().waitFor();
  assert.equal(await count(page),5);
  report.checks.initialRender=true;

  // Markdown and code accessibility: named, focusable scroll container.
  const code=page.locator('.markdown pre').first();
  assert.equal(await code.getAttribute('tabindex'),'0');
  assert.equal(await code.getAttribute('aria-label'),'Code block');
  const cdp=await page.context().newCDPSession(page);
  const tree=await cdp.send('Accessibility.getFullAXTree');
  const named=tree.nodes.filter(n=>!n.ignored&&n.name?.value==='Code block');
  report.accessibilityTree={namedCodeBlocks:named.length,codeRole:named[0]?.role?.value??null,
    conversationRegion:tree.nodes.some(n=>!n.ignored&&n.role?.value==='region'&&n.name?.value==='Coding conversation'),
    markdownHeading:tree.nodes.some(n=>!n.ignored&&n.role?.value==='heading'&&n.name?.value==='Summary'),
    historyButton:tree.nodes.some(n=>!n.ignored&&n.role?.value==='button'&&/Load earlier messages/.test(n.name?.value||''))};
  assert.ok(report.accessibilityTree.namedCodeBlocks>0,'Code block is not named in the accessibility tree');
  assert.ok(report.accessibilityTree.markdownHeading,'Markdown heading missing from the accessibility tree');
  await audit(page,'conversation-markdown');

  // Keyboard: the code block and the paging button are reachable and operable.
  await code.focus();
  assert.ok(await code.evaluate(e=>e===document.activeElement));
  const overflow=await code.evaluate(e=>({scrollWidth:e.scrollWidth,clientWidth:e.clientWidth,scrollLeft:e.scrollLeft}));
  await page.keyboard.press('ArrowRight');
  const scrolled=await code.evaluate(e=>e.scrollLeft);
  report.measurements.codeOverflow={...overflow,scrollLeftAfterArrow:scrolled};
  if(overflow.scrollWidth>overflow.clientWidth+1)assert.ok(scrolled>0,'Focused code block did not scroll with ArrowRight');
  report.checks.codeKeyboard=overflow.scrollWidth<=overflow.clientWidth+1||scrolled>0;

  // Ten pages of 50 with scroll anchoring and dedupe.
  const offsets=[];
  for(let index=0;index<pages;index++){
    const loaded=await count(page);
    const button=page.getByRole('button',{name:'Load earlier messages'});
    if(await button.count()===0)break;
    if(await button.getAttribute('aria-disabled')==='true')break;
    await button.focus();
    const reference=await page.locator('.conversation .message').first().elementHandle();
    const beforeTop=await region(page).evaluate(e=>e.scrollTop);
    const beforeOffset=await viewOffset(reference);
    if(index===1)await page.evaluate(()=>{
      const frames=window.__scrollTimeline=[];
      let n=0;
      const tick=()=>{
        const region=document.querySelector('.conversation');
        frames.push({t:Math.round(performance.now()),top:region.scrollTop,height:region.scrollHeight,connected:region.isConnected,regions:document.querySelectorAll('.conversation').length,count:region.querySelectorAll('.message').length});
        if(n++<90)requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    await page.keyboard.press('Enter');
    await page.waitForFunction(previous=>document.querySelectorAll('.conversation .message').length>previous,loaded,{timeout:10000});
    // The component restores scroll in requestAnimationFrame; observe it settling
    // instead of assuming the first frame has already run.
    const started=Date.now();
    let settleMs=null;
    try{await page.waitForFunction(target=>document.querySelector('.conversation').scrollTop>target,beforeTop,{timeout:3000,polling:16});settleMs=Date.now()-started;}catch{}
    const afterTop=await region(page).evaluate(e=>e.scrollTop);
    const afterOffset=await viewOffset(reference);
    // Every later page repeats one boundary id; the projection must drop it.
    const expectedAdded=index===0?50:49,total=await count(page);
    offsets.push({page:index,added:total-loaded,expectedAdded,scrollBefore:beforeTop,scrollAfter:afterTop,prepended:afterTop-beforeTop,anchorShift:Math.abs(afterOffset-beforeOffset),settleMs});
    assert.equal(total-loaded,expectedAdded,'Page merge added '+String(total-loaded)+' messages');
    assert.equal(total,5+50+49*index,'Dedupe or page merge lost messages');
    assert.ok(afterTop>beforeTop,'Earlier messages did not become visible: '+JSON.stringify(offsets.at(-1)));
    assert.ok(Math.abs(afterOffset-beforeOffset)<=2,'The message on screen moved '+Math.abs(afterOffset-beforeOffset)+'px: '+JSON.stringify(offsets.at(-1)));
    assert.ok(await region(page).evaluate(e=>e===document.activeElement),'Focus left the conversation after paging');
  }
  report.checks.scrollAnchoring=offsets.every(o=>o.anchorShift<=2);
  report.measurements.paging=offsets;
  report.measurements.scrollTimeline=await page.evaluate(()=>window.__scrollTimeline||[]).catch(()=>null);
  // The 500-message bound stops requests; further activation must not page again.
  const capped=page.getByRole('button',{name:/History view limit reached/});
  assert.equal(await capped.count(),1,'The bounded history limit was not surfaced');
  const beforeCap=historyCalls.length;
  assert.ok(beforeCap<pages,'Paging reached the data end before the view bound');
  // aria-disabled keeps focus but does not stop a real pointer click, so dispatch
  // the DOM click directly; the handler must still refuse to page.
  await capped.evaluate(element=>element.click());await page.waitForTimeout(300);
  assert.equal(historyCalls.length,beforeCap,'A capped history control still requested another page');
  report.measurements.cap={requests:beforeCap,pagesAvailable:pages};
  report.checks.dedupe=true;report.checks.pagingBound=true;

  // The same projection must survive a reload of the task (no durable UI store).
  await page.getByRole('button',{name:'Task Beta',exact:true}).click();
  await page.getByText('Beta current: unrelated task.',{exact:true}).waitFor();
  assert.equal(await count(page),2);
  assert.equal(await page.getByText(/Older scale page/).count(),0,'Older messages leaked across tasks');
  report.checks.taskSwitchIsolated=true;
  await audit(page,'task-beta');
  await page.getByRole('button',{name:'Task Alpha',exact:true}).click();
  await page.getByText('Current message 0: keep the public API stable.',{exact:true}).waitFor();
  assert.equal(await count(page),5,'Switching back retained earlier paging state');
  assert.equal(await page.getByRole('button',{name:'Load earlier messages'}).count(),1,'History browsing did not reset for the task');
  report.checks.taskSwitchResets=true;

  await page.setViewportSize({width:390,height:844});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Mobile overflow with Markdown and code');
  await page.screenshot({path:directory+'/conversation-scale-mobile.png',fullPage:false});
  await page.setViewportSize({width:1440,height:900});
  await region(page).evaluate(element=>{element.scrollTop=0;});
  await page.waitForTimeout(200);
  await page.screenshot({path:directory+'/conversation-scale.png',fullPage:false});
  assert.deepEqual(errors,[]);
  report.passed=Object.values(report.checks).every(Boolean);
  assert.ok(report.passed,'Checks failed: '+JSON.stringify(report.checks));
}catch(error){
  report.passed=false;report.error=String(error.message).slice(0,600);process.exitCode=1;
}finally{
  if(page)report.measurements.scrollTimeline ||= await page.evaluate(()=>window.__scrollTimeline||[]).catch(()=>null);
  await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r));
  writeFileSync(directory+'/conversation-scale.json',JSON.stringify(report,null,2));
  console.log(JSON.stringify({passed:report.passed,error:report.error,checks:report.checks,measurements:{codeOverflow:report.measurements.codeOverflow,lastPages:report.measurements.paging?.slice(-2)},audits:report.audits.map(a=>({name:a.name,violations:a.violations.length,incomplete:a.incomplete.length})),accessibilityTree:report.accessibilityTree},null,2));
}
