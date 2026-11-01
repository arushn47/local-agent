import test from 'node:test';
import assert from 'node:assert/strict';
import { workflowAlias, workflowCandidates, workflowAgents, exactWorkflowModel } from '../src/workspace/workflow-models.mjs';
const catalog=()=>({expiresAt:new Date(Date.now()+60000).toISOString(),providers:{gemini:{enabled:true,allowed:true,models:['gemini-2.5-flash'],capabilities:{'gemini-2.5-flash':{contextWindow:100000,tools:true,codingApproved:true}}}}});
test('exact workflow IDs cannot fall back to another model, provider or stale catalog',()=>{
  const c=catalog(),[model]=workflowCandidates({routingOrder:['gemini'],outputTokens:1800},c),registry={[model.qualified]:model};
  assert.deepEqual(exactWorkflowModel(model.qualified,registry,c),{providerID:'localagent-workflow',modelID:workflowAlias(model.qualified)});
  assert.throws(()=>exactWorkflowModel('groq/gemini-2.5-flash',registry,c),/not_registered/);
  assert.throws(()=>exactWorkflowModel(model.qualified,registry,{...c,expiresAt:'2000-01-01'}),/expired/);
  c.providers.gemini.allowed=false;assert.throws(()=>exactWorkflowModel(model.qualified,registry,c),/unavailable/);
});
test('specialized roles install deny-first native permissions plus a deny tool mask',()=>{
  const agents=workflowAgents('C:/private-profile');
  for(const role of ['planner','researcher','reviewer']){
    const a=agents[`localagent-${role}`];assert.equal(a.permission.bash,'deny');assert.equal(a.permission.edit,'deny');assert.equal(a.tools.write,false);assert.equal(a.permission['*'],'deny');assert.equal(a.permission.read['**/.env*'],'deny');
  }
  assert.equal(agents['localagent-tester'].permission.bash,'ask');assert.equal(agents['localagent-implementer'].permission.edit,'ask');
  for(const a of Object.values(agents))assert.equal(a.permission.task,'deny');
});
