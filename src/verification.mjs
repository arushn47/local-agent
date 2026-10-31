import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stateDir, urls } from './config.mjs';
import { loadCatalog } from './catalog.mjs';
import { readEvents } from './telemetry.mjs';

export async function verifyProviders(config) {
  const catalog = loadCatalog();
  const key = JSON.parse(readFileSync(join(stateDir, 'gateway-key.json'), 'utf8')).key;
  const providers = {};
  const call = async model => {
    const start = Date.now(); const cursor = readEvents(join(stateDir, 'routing.jsonl')).length;
    try {
      const response = await fetch(urls(config).gateway + '/v1/chat/completions', { method: 'POST', redirect: 'error', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }, body: JSON.stringify({ model, messages: [{ role: 'user', content: 'Reply with the single word READY.' }], max_tokens: 96, stream: false }), signal: AbortSignal.timeout(90000) });
      // Consume the result, but never print provider error bodies or raw content.
      const body = await response.json().catch(() => ({}));
      const events = readEvents(join(stateDir, 'routing.jsonl')).slice(cursor);
      const requestedProviders = [...new Set(events.filter(e => e.event === 'request').map(e => e.provider))];
      const failure = events.find(e => e.event === 'upstream_headers' && e.status >= 400 || e.event === 'network_error');
      const recovery = events.find(e => e.event === 'completed' && e.status === 200 && failure && e.provider !== failure.provider);
      return { httpStatus: response.status, durationMs: Date.now() - start, responded: response.ok && Boolean(body.choices?.[0]?.message?.content || body.choices?.[0]?.message?.tool_calls), requestedProviders, naturalFailoverObserved: Boolean(failure && recovery), events };
    } catch { return { httpStatus: null, responded: false, durationMs: Date.now() - start, reason: 'request_failed_or_timed_out', events: readEvents(join(stateDir, 'routing.jsonl')).slice(cursor) }; }
  };
  // One bounded call per provider: do not deliberately exhaust free quotas.
  for (const provider of config.routingOrder) {
    const entry = catalog.providers[provider];
    providers[provider] = entry?.allowed && entry.models.length ? await call(`localagent/check/${provider}`) : { responded: false, reason: entry?.reason || 'not_configured' };
    console.log(JSON.stringify({ provider, status: providers[provider].httpStatus, responded: providers[provider].responded, reason: providers[provider].reason }));
  }
  const routing = await call('localagent/coding');
  return { checkedAt: new Date().toISOString(), simulatedFailures: false, deliberatelyExhaustedQuota: false, providers, routing, cloudProvidersVerified: Object.entries(providers).filter(([p, r]) => p !== 'ollama' && r.responded).map(([p]) => p), allProvidersResponded: Object.values(providers).every(r => r.responded) };
}
