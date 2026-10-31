import test from 'node:test';
import assert from 'node:assert/strict';
import { contextMetadata, quotaMetadata, parseRetryAfter } from '../src/telemetry.mjs';

test('Retry-After supports seconds and an absolute HTTP date', () => {
  const now = Date.UTC(2026, 0, 1);
  assert.equal(parseRetryAfter('12', now), now + 12000);
  assert.equal(parseRetryAfter(new Date(now + 60000).toUTCString(), now), now + 60000);
});
test('missing and invalid Retry-After values stay unknown', () => {
  for (const value of [null, '', 'nonsense', '-1']) assert.equal(parseRetryAfter(value, Date.UTC(2026, 0, 1)), null);
});
test('request and token quota dimensions are retained without conflating their windows', () => {
  const result = quotaMetadata(new Headers({ 'x-ratelimit-remaining-requests': '5', 'x-ratelimit-remaining-tokens': '900', 'x-ratelimit-reset-requests': '23h', 'x-ratelimit-reset-tokens': '40s', 'retry-after': '2', Authorization: 'secret' }), 429, 1000);
  assert.equal(result.status, 'rate_limited'); assert.equal(result.retryAt, 3000);
  assert.equal(result.headers['x-ratelimit-reset-requests'], '23h'); assert.equal(result.headers['x-ratelimit-reset-tokens'], '40s');
  assert.equal(JSON.stringify(result).includes('secret'), false);
});
test('missing quota headers are explicitly unknown', () => assert.equal(quotaMetadata(new Headers(), 200).status, 'unknown'));
test('context tracing retains only hashes of tool contents and identifiers', () => {
  const result = contextMetadata([{ role: 'tool', tool_call_id: 'secret-call', content: 'private source' }]);
  assert.equal(result.toolResults.length, 1); assert.equal(result.toolResults[0].content.length, 64);
  assert.equal(JSON.stringify(result).includes('private source'), false);
  assert.deepEqual(result, contextMetadata([{ role: 'tool', tool_call_id: 'secret-call', content: 'private source' }]));
});
