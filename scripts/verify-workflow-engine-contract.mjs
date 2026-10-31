// Actual pinned engine, zero inference. Verify installed roles/model registry
// through its APIs; no prompt is sent and provider credentials are placeholders.
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { once } from 'node:events';
const directory=mkdtempSync(join(tmpdir(),'localagent-engine-contract-'));
process.env.LOCALAGENT_STATE_DIR=directory;
const {startEngine}=await import('../src/workspace/engine.mjs');
const {workflowAlias}=await import('../src/workspace/workflow-models.mjs');
const qualified='gemini/gemini-2.5-flash',alias=workflowAlias(qualified);
writeFileSync(join(directory,'gateway-key.json'),JSON.stringify({key:'fixture-no-inference'}));
writeFileSync(join(directory,'workflow-models.json'),JSON.stringify({[qualified]:{qualified,provider:'gemini',model:'gemini-2.5-flash',alias}}));
writeFileSync(join(directory,'opencode.json'),JSON.stringify({model:'omniroute/'+alias,small_model:'omniroute/'+alias,enabled_providers:['omniroute'],share:'disabled',autoupdate:false,provider:{omniroute:{npm:'@ai-sdk/openai-compatible',options:{baseURL:'http://127.0.0.1:9/v1',apiKey:'fixture'},models:{[alias]:{tool_call:true,limit:{context:32768,output:1800}}}}}}));
const probe=createServer();probe.listen(0,'127.0.0.1');await once(probe,'listening');const port=probe.address().port;await new Promise(r=>probe.close(r));
let engine;
try{
  engine=await startEngine({port});
  const client=engine.forProject(directory);
  let agents=[];
  for(let i=0;i<40;i++){
    const result=(await client.v2.agent.list()).data;
    agents=Array.isArray(result)?result:result?.data||[];
    if(agents.some(a=>a.id==='localagent-planner'))break;
    await new Promise(r=>setTimeout(r,250));
  }
  assert.ok(Array.isArray(agents),'pinned engine must return its actual agent registry');
  for(const role of ['planner','researcher','reviewer','implementer','debugger','tester']){
    const agent=agents.find(a=>a.id===`localagent-${role}`);assert.ok(agent,role);
    assert.ok(agent.permissions.some(r=>r.action==='task'&&r.effect==='deny'));
    if(['planner','researcher','reviewer'].includes(role))assert.ok(agent.permissions.some(r=>r.action==='edit'&&r.effect==='deny'));
  }
  console.log(JSON.stringify({passed:true,engine:'1.18.31',registeredRoles:6,inferenceRequests:0,note:'Native config/API validation only; actual tool enforcement awaits bounded end-to-end acceptance.'}));
}finally{if(engine){const exited=once(engine.child,'exit');engine.stop();await exited;}}
