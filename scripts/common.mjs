import { mkdirSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const runtime = join(root, '.runtime');
export const omniPort = 20129;
export const proxyPort = 20130;
export const omniURL = `http://127.0.0.1:${omniPort}`;
export const proxyURL = `http://127.0.0.1:${proxyPort}`;
export const primary = 'localagent-qwen2.5:7b';
export const fallback = process.env.DEMO_FALLBACK_MODEL || 'localagent-qwen3:4b-instruct';
export const comboName = 'local-coding-failover';
export const omniRoot = process.env.OMNIROUTE_PACKAGE_DIR || join(process.env.APPDATA || '', 'npm', 'node_modules', 'omniroute');
export const opencodeExe = process.env.OPENCODE_EXE || join(process.env.APPDATA || '', 'npm', 'node_modules', 'opencode-ai', 'bin', 'opencode.exe');

export function credentials() {
  mkdirSync(runtime, { recursive: true });
  const path = join(runtime, 'credentials.json');
  if (!existsSync(path)) {
    writeFileSync(path, JSON.stringify({
      storage: randomBytes(32).toString('hex'),
      jwt: randomBytes(32).toString('hex'),
      password: randomBytes(24).toString('base64url'),
    }, null, 2));
  }
  return JSON.parse(readFileSync(path, 'utf8'));
}

export async function json(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: options.signal || AbortSignal.timeout(30000),
  });
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { text: text.slice(0, 300) }; }
  if (!response.ok) throw new Error(`${new URL(url).pathname}: HTTP ${response.status}: ${JSON.stringify(data).slice(0, 400)}`);
  return data;
}
