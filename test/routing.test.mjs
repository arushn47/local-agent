import test from 'node:test';
import assert from 'node:assert/strict';
import { compilePlan, ContinuationLedger } from '../src/routing.mjs';

const call = { id: 'call-1', function: { name: 'read', arguments: '{"path":"a"}' } };
const history = [{ role: 'assistant', tool_calls: [call] }, { role: 'tool', tool_call_id: call.id, content: 'file contents' }];
test('planning excludes metadata-approved but unverified fallback directions', () => {
  const config = { routingOrder: ['gemini','groq','openrouter'] };
  const models = { gemini: 'gemini-3.5-flash-lite', groq: 'openai/gpt-oss-20b', openrouter: 'cohere/north-mini-code:free' };
  const catalog = { providers: Object.fromEntries(Object.entries(models).map(([p,m]) => [p,{enabled:true,allowed:true,models:[m],capabilities:{[m]:{codingApproved:true,tools:true,contextWindow:131072}}}])) };
  assert.deepEqual(compilePlan(config,catalog).targets.map(t=>t.provider), ['gemini','openrouter']);
  assert.deepEqual(compilePlan({...config,routingOrder:['groq','gemini','openrouter']},catalog).targets.map(t=>t.provider), ['groq']);
  catalog.providers.openrouter.capabilities[models.openrouter].codingApproved=false;
  assert.deepEqual(compilePlan(config,catalog).targets.map(t=>t.provider),['gemini']);
});
test('ledger preserves known same-provider history and only the verified forward edge', () => {
  const l = new ContinuationLedger(), gem = l.scopeFor('gemini','gemini-3.5-flash-lite','secret'), groq = l.scopeFor('groq','openai/gpt-oss-20b','key'), or = l.scopeFor('openrouter','cohere/north-mini-code:free','key');
  const c=l.collector(gem,true); const frame=JSON.stringify({choices:[{delta:{tool_calls:[call]},finish_reason:'tool_calls'}]});
  c.push(Buffer.from('data: '+frame.slice(0,30)));c.push(Buffer.from(frame.slice(30)+'\n\n'));c.finish();
  assert.doesNotThrow(()=>l.assertHistory(gem,history)); assert.doesNotThrow(()=>l.assertHistory(or,history));
  assert.throws(()=>l.assertHistory(groq,history));
  l.rememberGroup(or,[{...call,id:'fallback-call'}]);
  assert.throws(()=>l.assertHistory(gem,[{role:'assistant',tool_calls:[{...call,id:'fallback-call'}]}]));
});
test('unknown, changed, expired, orphaned and foreign-credential calls fail closed', () => {
  let now=0;const l=new ContinuationLedger({now:()=>now,ttlMs:10});const s=l.scopeFor('groq','openai/gpt-oss-20b','key');
  assert.throws(()=>l.assertHistory(s,history));l.rememberGroup(s,[call]);
  assert.throws(()=>l.assertHistory(l.scopeFor('groq','openai/gpt-oss-20b','changed'),history));
  assert.throws(()=>l.assertHistory(s,[history[1]]));
  assert.throws(()=>l.assertHistory(s,[{role:'assistant',tool_calls:[{...call,function:{...call.function,arguments:'{}'}}]}]));
  now=11;assert.throws(()=>l.assertHistory(s,history));
});
