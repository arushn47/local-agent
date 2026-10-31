import test from 'node:test';
import assert from 'node:assert/strict';
import { waitForRuntime } from '../src/readiness.mjs';
test('cold readiness polls status without repeating credential submissions', async () => {
  let time = 0; let calls = 0;
  await waitForRuntime('http://127.0.0.1:1', { now: () => time, pause: async ms => { time += ms; }, fetcher: async (url, options) => {
    assert.ok(url.endsWith('/api/auth/status')); assert.equal(options.body, undefined);
    if (++calls === 1) throw new Error('cold initialization');
    return new Response('{}');
  } });
  assert.equal(calls, 2);
});
test('unready runtime terminates at a bounded readiness deadline', async () => {
  let time = 0;
  await assert.rejects(waitForRuntime('http://127.0.0.1:1', { timeoutMs: 2000, now: () => time, pause: async ms => { time += ms; }, fetcher: async () => new Response('', { status: 503 }) }), /before authentication\/configuration/);
});
test('desktop shutdown cancels readiness before any further request',async()=>{
 const controller=new AbortController();controller.abort();let calls=0;
 await assert.rejects(waitForRuntime('http://127.0.0.1:1',{signal:controller.signal,fetcher:async()=>{calls++;return new Response('{}');}}),/abort/i);
 assert.equal(calls,0);
});
