import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createGuard } from '../src/guard.mjs';
import { guardToken } from '../src/config.mjs';

async function fixture(t, response = new Response('data: {"choices":[{"delta":{"content":"OK"}}]}\n\ndata: [DONE]\n\n', { headers: { 'Content-Type': 'text/event-stream' } })) {
  const directory = mkdtempSync(join(tmpdir(), 'localagent-test-')); const auditPath = join(directory, 'audit.jsonl');
  const secret = { guard: 'unit-test-secret' }; const calls = [];
  const env = { OPENROUTER_API_KEY: 'private-provider-key' };
  const catalog = { expiresAt: new Date(Date.now() + 60000).toISOString(), providers: { openrouter: { enabled: true, allowed: true, capabilities: { 'example/coder:free': { contextWindow: 8192, tools: true } }, models: ['example/coder:free'] } } };
  const server = createGuard({ config: { outputTokens: 1800 }, env: () => env, secret, catalog: () => catalog, auditPath, fetcher: async (url, options) => { calls.push({ url, ...options }); return response.clone(); } });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); assert.ok(resolve(directory).startsWith(resolve(tmpdir()) + sep)); rmSync(directory, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const body = { model: 'example/coder:free', messages: [{ role: 'user', content: 'private-source-marker' }], stream: true };
  const post = (value = body, token = guardToken(secret, 'openrouter')) => fetch(base + '/egress/openrouter/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(value) });
  return { post, calls, catalog, auditPath, body, base, secret };
}
test('unauthenticated requests cannot reach a provider', async t => {
  const f = await fixture(t); const result = await f.post(f.body, 'wrong-token');
  assert.equal(result.status, 401); assert.equal(f.calls.length, 0);
});

test('runtime contract is authenticated and a guard alone never claims application readiness', async t => {
  const f=await fixture(t);
  assert.equal((await fetch(f.base+'/api/v1/runtime')).status,401);
  const r=await fetch(f.base+'/api/v1/runtime',{headers:{Authorization:'Bearer '+guardToken(f.secret,'admin')}});
  assert.deepEqual(await r.json(),{apiVersion:1,stage:'guard_only',ready:false});assert.equal(f.calls.length,0);
});
test('paid/unknown models are blocked before any upstream request', async t => {
  const f = await fixture(t); const result = await f.post({ ...f.body, model: 'example/paid' });
  assert.equal(result.status, 403); assert.equal(f.calls.length, 0);
});
test('oversized tool schemas are rejected as context errors before dispatch', async t => {
  const f = await fixture(t);
  const response = await f.post({ ...f.body, tools: [{ type: 'function', function: { name: 'read', description: 'x'.repeat(10000), parameters: { type: 'object' } } }] });
  assert.equal(response.status, 422);
  assert.equal((await response.json()).error.type, 'context_budget_error');
  assert.equal(f.calls.length, 0);
});
test('expired cloud pricing eligibility fails closed', async t => {
  const f = await fixture(t); f.catalog.expiresAt = new Date(0).toISOString();
  assert.equal((await f.post()).status, 503); assert.equal(f.calls.length, 0);
});

test('unknown historical tool calls are blocked before dispatch even on an admitted model', async t => {
  const f = await fixture(t);
  const response = await f.post({ ...f.body, messages: [
    {role:'assistant', tool_calls:[{id:'unknown',function:{name:'read',arguments:'{}'}}]},
    {role:'tool',tool_call_id:'unknown',content:'private-history'}
  ] });
  assert.equal(response.status,422);assert.equal((await response.json()).error.code,'unverified_continuation');assert.equal(f.calls.length,0);
});

test('provider-issued streamed calls can continue on the same model through the guard',async t=>{
  const call={id:'issued',type:'function',function:{name:'read',arguments:'{}'}};
  const f=await fixture(t,new Response('data: '+JSON.stringify({choices:[{delta:{tool_calls:[call]},finish_reason:'tool_calls'}]})+'\n\ndata: [DONE]\n\n',{headers:{'Content-Type':'text/event-stream'}}));
  await (await f.post()).text();
  const next=await f.post({...f.body,messages:[...f.body.messages,{role:'assistant',tool_calls:[call]},{role:'tool',tool_call_id:'issued',content:'result'}]});
  await next.text();assert.equal(next.status,200);assert.equal(f.calls.length,2);
});
test('the streaming body passes through and the guard replaces rather than forwards its credential', async t => {
  const f = await fixture(t); const result = await f.post(); const text = await result.text();
  assert.equal(result.status, 200); assert.ok(text.includes('[DONE]'));
  assert.equal(f.calls[0].headers.Authorization, 'Bearer private-provider-key');
  assert.equal(f.calls[0].redirect, 'error');
  const request = JSON.parse(f.calls[0].body);
  assert.deepEqual(request.provider.max_price, { prompt: 0, completion: 0, request: 0, image: 0 });
  const audit = readFileSync(f.auditPath, 'utf8');
  assert.equal(audit.includes('private-provider-key'), false); assert.equal(audit.includes('private-source-marker'), false);
});
test('real upstream 429 status and Retry-After are forwarded for OmniRoute cooldown handling', async t => {
  const f = await fixture(t, new Response('{"error":{"message":"quota exhausted"}}', { status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': '15', 'x-ratelimit-remaining-requests': '0' } }));
  const result = await f.post(); await result.text();
  assert.equal(result.status, 429); assert.equal(result.headers.get('retry-after'), '15');
  const events = readFileSync(f.auditPath, 'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(events.find(e => e.event === 'upstream_headers').quota.status, 'rate_limited');
});
