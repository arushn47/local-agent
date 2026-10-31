import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { omniRoot, omniURL, proxyURL, primary, fallback, comboName, json, credentials } from './common.mjs';

const { getCliToken, CLI_TOKEN_HEADER } = await import(pathToFileURL(join(omniRoot, 'bin/cli/utils/cliToken.mjs')).href);
const headers = { [CLI_TOKEN_HEADER]: await getCliToken() };
const login = await fetch(omniURL + '/api/auth/login', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ password: credentials().password }), signal: AbortSignal.timeout(120000),
});
if (!login.ok) throw new Error(`Local demo login failed (${login.status})`);
headers.Cookie = login.headers.getSetCookie().map(cookie => cookie.split(';')[0]).join('; ');
const api = (path, options = {}) => json(omniURL + path, { ...options, headers: { ...headers, ...options.headers }, signal: AbortSignal.timeout(120000) });
const existing = await api('/api/providers');
const connections = existing.connections || existing.providers || (Array.isArray(existing) ? existing : []);
if (!connections.some(c => c.provider === 'ollama-local')) {
  const data = await api('/api/providers', { method: 'POST', body: {
    provider: 'ollama-local', name: 'Local demo Ollama',
    providerSpecificData: { baseUrl: proxyURL + '/v1' },
  } });
  connections.push(data.connection);
  console.log('Created local Ollama provider:', data.connection?.name || 'Local demo Ollama');
}
let backup = connections.find(c => c.name === 'Local demo Ollama fallback');
if (!backup) {
  const data = await api('/api/providers', { method: 'POST', body: {
    provider: 'ollama-local', name: 'Local demo Ollama fallback',
    providerSpecificData: { baseUrl: proxyURL + '/v1' },
  } });
  backup = data.connection;
}
const main = connections.find(c => c.name === 'Local demo Ollama');
if (!main?.id || !backup?.id) throw new Error('Local connection IDs missing');
for (const connection of [main, backup]) {
  const synced = await api('/api/providers/' + connection.id + '/sync-models', { method: 'POST', body: {} });
  console.log('Refreshed local model catalog for', connection.name);
}
const list = await api('/api/combos');
const combos = list.combos || (Array.isArray(list) ? list : []);
const current = combos.find(c => c.name === comboName);
  await api(current ? '/api/combos/' + current.id : '/api/combos', { method: current ? 'PATCH' : 'POST', body: {
    name: comboName, strategy: 'priority', enabled: true,
    models: [primary, fallback].map((model, i) => ({ model, providerId: 'ollama-local', connectionId: i === 0 ? main.id : backup.id })),
    context_length: 8192,
    config: { disableSessionStickiness: true },
  } });
  console.log('Created priority combo:', primary, '->', fallback);
await api('/api/resilience', { method: 'PATCH', body: { requestQueue: { maxWaitMs: 600000 }, comboCooldownWait: { enabled: false }, waitForCooldown: { enabled: false } } });
await api('/api/resilience/reset', { method: 'POST' });
await api('/api/settings', { method: 'PATCH', body: { promptCacheAffinityEnabled: false, disableSessionStickiness: true } });
console.log('OpenCode endpoint:', omniURL + '/v1');
console.log('OpenCode model: omniroute/' + comboName);
