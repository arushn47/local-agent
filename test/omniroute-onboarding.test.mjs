import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
const folder=mkdtempSync(join(tmpdir(),'localagent-empty-gateway-'));
process.env.LOCALAGENT_STATE_DIR=folder;
const { configureGateway }=await import('../src/omniroute.mjs');
const {loadConfig}=await import('../src/config.mjs');
test('empty onboarding creates no combo and disables its internal inference key',async()=>{
 const calls=[];let created=false;
 const managementAPI=async(path,options={})=>{
   calls.push({path,...options});
   if(path==='/api/keys'&&options.method==='POST'){
     assert.equal(options.body.allowedConnections,undefined,'OmniRoute rejects an empty create-key connection list');created=true;return {key:'test-placeholder'};
   }
   if(path==='/api/keys')return created?[{id:'test-key',name:'LocalAgent OpenCode'}]:[];
   return [];
 };
 try{
   const result=await configureGateway(loadConfig(),{providers:{}},{managementAPI});
   assert.deepEqual(result.targets,[]);
   assert.ok(!calls.some(c=>c.path==='/api/combos'&&c.method==='POST'));
   const restriction=calls.find(c=>c.path==='/api/keys/test-key'&&c.method==='PATCH').body;
   assert.equal(restriction.isActive,false);assert.equal(restriction.modelAccessMode,'restricted');
   assert.deepEqual(restriction.allowedModels,[]);assert.deepEqual(restriction.allowedCombos,[]);
   // Generated engine config must schedule upstream compaction against the guard
   // ceiling so automatic compaction can run before the guard rejects a request.
   const {compactionSettings}=await import('../src/context.mjs');
   const generated=JSON.parse(readFileSync(join(folder,'opencode.json'),'utf8'));
   assert.deepEqual(generated.compaction,compactionSettings(generated.provider.omniroute.models['localagent/coding'].limit.context,loadConfig().outputTokens));
   assert.equal(generated.provider.omniroute.models['localagent/coding'].limit.context,32768);
   // Opt-in only: the default configuration must not change tool-output behavior.
   assert.equal(generated.tool_output,undefined);
   await configureGateway({...loadConfig(),executionGuidance:true},{providers:{}},{managementAPI});
   const guided=JSON.parse(readFileSync(join(folder,'opencode.json'),'utf8'));
   assert.deepEqual(guided.tool_output,{max_lines:600,max_bytes:16384});
   assert.deepEqual(guided.compaction,generated.compaction,'guidance must not alter compaction');
 }finally{
   assert.equal(dirname(resolve(folder)),resolve(tmpdir()));
   rmSync(folder,{recursive:true,force:true});
 }
});
