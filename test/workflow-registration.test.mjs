import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const directory=mkdtempSync(join(tmpdir(),'localagent-registration-'));
process.env.LOCALAGENT_STATE_DIR=directory;
const {configureGateway}=await import('../src/omniroute.mjs');
const {loadConfig}=await import('../src/config.mjs');
test('gateway registration pins each workflow combo to one model and a separate fail-closed egress connection',async()=>{
  const calls=[];
  const api=async(path,options={})=>{
    calls.push({path,...options});
    if(options.method==='POST'&&path==='/api/provider-nodes')return {node:{id:'node-'+options.body.prefix}};
    if(options.method==='POST'&&path==='/api/providers')return {connection:{id:'conn-'+options.body.name}};
    if(options.method==='POST'&&path==='/api/keys')return {key:'fixture-only'};
    if(path==='/api/keys')return [{id:'key-fixture',name:'LocalAgent OpenCode'}];
    return [];
  };
  const entry={enabled:true,allowed:true,models:['gemini-2.5-flash'],capabilities:{'gemini-2.5-flash':{contextWindow:100000,tools:true,codingApproved:true}}};
  try {
    await configureGateway(loadConfig(),{providers:{gemini:entry}},{managementAPI:api});
    const workflow=calls.find(c=>c.path==='/api/combos'&&c.body?.name.startsWith('localagent/workflow/'));
    assert.equal(workflow.body.models.length,1);assert.match(workflow.body.models[0].providerId,/workflow-gemini/);
    assert.ok(calls.some(c=>c.body?.providerSpecificData?.baseUrl.includes('/workflow-egress/gemini/v1')));
    const config=JSON.parse(readFileSync(join(directory,'opencode.json'),'utf8'));
    assert.ok(config.provider.omniroute.models[workflow.body.name]);assert.ok(config.provider.omniroute.models['localagent/coding']);
    const restriction=calls.find(c=>c.path==='/api/keys/key-fixture'&&c.method==='PATCH').body;
    assert.ok(restriction.allowedCombos.includes(workflow.body.name));assert.ok(restriction.allowedCombos.includes('localagent/coding'));
  } finally {rmSync(directory,{recursive:true,force:true});}
});
