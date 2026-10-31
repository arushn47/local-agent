import { createHash } from 'node:crypto';
import {appendBounded,readLogTail} from './log-retention.mjs';
export const hash = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');

export function contextMetadata(messages) {
  return { messageCount: messages.length, toolResults: messages.filter(m => m.role === 'tool').map(m => ({ call: hash(m.tool_call_id || ''), content: hash(m.content || '') })), contextHash: hash(messages) };
}
export function parseRetryAfter(value, now = Date.now()) {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return now + seconds * 1000;
  const date = Date.parse(value);
  return Number.isFinite(date) && date >= now ? date : null;
}
export function quotaMetadata(headers, status, now = Date.now()) {
  const fields = ['retry-after', 'x-ratelimit-limit-requests', 'x-ratelimit-limit-tokens', 'x-ratelimit-remaining-requests', 'x-ratelimit-remaining-tokens', 'x-ratelimit-reset-requests', 'x-ratelimit-reset-tokens'];
  const observed = Object.fromEntries(fields.filter(k => headers.has(k)).map(k => [k, headers.get(k)]));
  return { status: status === 429 ? 'rate_limited' : Object.keys(observed).length ? 'headers_observed' : 'unknown', headers: observed, retryAt: parseRetryAfter(headers.get('retry-after'), now) };
}
export function record(path, event) { appendBounded(path, JSON.stringify({ timestamp: new Date().toISOString(), ...event }) + '\n'); }
export function readEvents(path) { return readLogTail(path).trim().split('\n').filter(Boolean).flatMap(line=>{try{return [JSON.parse(line)];}catch{return [];}}); }
