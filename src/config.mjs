import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, createHmac } from 'node:crypto';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const stateDir = resolve(process.env.LOCALAGENT_STATE_DIR || join(root, '.localagent'));
export const omniRoot = process.env.OMNIROUTE_PACKAGE_DIR || join(root, 'node_modules/omniroute');
export const opencodeExe = process.env.OPENCODE_EXE || join(root, 'node_modules/opencode-ai/bin', process.platform === 'win32' ? 'opencode.exe' : 'opencode');
let credentialOverlay = {};
export function setCredentialOverlay(values) { credentialOverlay = { ...values }; }

export function loadEnvironment(path = [join(root, '.env'), join(root, '.env.local')], inherited = process.env) {
  const env = { ...inherited };
  for (const file of process.env.LOCALAGENT_DESKTOP === '1' ? [] : Array.isArray(path) ? path : [path]) {
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || env[match[1]]) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    else value = value.replace(/\s+#.*$/, '');
    env[match[1]] = value;
  }
  }
  for (const [key,value] of Object.entries(credentialOverlay)) { if(value === null) delete env[key]; else env[key]=value; }
  return env;
}

export function loadConfig() {
  const config = JSON.parse(readFileSync(process.env.LOCALAGENT_CONFIG || join(root, 'localagent.config.json'), 'utf8'));
  if (config.version !== 1) throw new Error('Unsupported LocalAgent configuration version');
  for (const field of ['gatewayPort', 'guardPort']) if (!Number.isInteger(config[field]) || config[field] < 1024 || config[field] > 65535) throw new Error(`Invalid ${field}`);
  if (config.gatewayPort === config.guardPort) throw new Error('Gateway and guard ports must differ');
  if (!Number.isInteger(config.contextTokens) || config.contextTokens < 4096 || !Number.isInteger(config.outputTokens) || config.outputTokens < 64 || config.outputTokens > config.contextTokens / 2) throw new Error('Invalid context/output limits');
  // Opt-in efficiency features are off unless the owner enables them explicitly.
  if ('executionGuidance' in config && typeof config.executionGuidance !== 'boolean') throw new Error('Invalid executionGuidance');
  const known = ['gemini', 'groq', 'openrouter', 'ollama'];
  if (!Array.isArray(config.routingOrder) || new Set(config.routingOrder).size !== config.routingOrder.length || config.routingOrder.some(p => !known.includes(p))) throw new Error('Invalid routingOrder');
  for (const provider of known) {
    const entry = config.providers?.[provider];
    if (!entry || typeof entry.enabled !== 'boolean' || !Array.isArray(entry.models) || entry.models.some(m => typeof m !== 'string' || !m || m.length > 200)) throw new Error(`Invalid ${provider} configuration`);
  }
  const local = new URL(config.providers.ollama.baseURL);
  if (local.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(local.hostname) || local.username || local.password || local.search || local.hash || local.pathname !== '/') throw new Error('Ollama must use a loopback HTTP origin');
  return config;
}

export function secrets() {
  mkdirSync(stateDir, { recursive: true });
  const path = join(stateDir, 'secrets.json');
  if (!existsSync(path)) writeFileSync(path, JSON.stringify({ storage: randomBytes(32).toString('hex'), jwt: randomBytes(32).toString('hex'), password: randomBytes(24).toString('base64url'), guard: randomBytes(32).toString('hex') }), { mode: 0o600, flag: 'wx' });
  return JSON.parse(readFileSync(path, 'utf8'));
}
export const guardToken = (secret, provider) => createHmac('sha256', secret.guard).update(provider).digest('hex');
export const urls = config => ({ gateway: `http://127.0.0.1:${config.gatewayPort}`, guard: `http://127.0.0.1:${config.guardPort}` });

export async function requestJSON(url, options = {}) {
  const response = await fetch(url, { ...options, redirect: 'error', signal: options.signal || AbortSignal.timeout(30000), headers: { 'Content-Type': 'application/json', ...options.headers }, body: options.body === undefined ? undefined : JSON.stringify(options.body) });
  // Do not include upstream response bodies/URLs in errors: these can contain keys.
  if (!response.ok) throw new Error(`Service ${new URL(url).pathname} failed: HTTP ${response.status}`);
  return response.json();
}
