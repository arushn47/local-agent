import { spawn } from 'node:child_process';
import { createWriteStream, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { root, runtime, credentials, omniRoot, omniPort, proxyPort } from './common.mjs';

const secret = credentials();
mkdirSync(join(runtime, 'omniroute'), { recursive: true });
const server = join(omniRoot, 'dist', 'server-ws.mjs');
if (!existsSync(server)) throw new Error(`Installed OmniRoute server not found: ${server}`);

const children = [];
for (const [name, entry, env] of [
  ['fault-proxy', join(root, 'scripts', 'fault-proxy.mjs'), {}],
  ['omniroute', server, {
    DATA_DIR: join(runtime, 'omniroute'), PORT: String(omniPort), HOSTNAME: '127.0.0.1',
    OMNIROUTE_PORT: String(omniPort), API_PORT: String(omniPort), DASHBOARD_PORT: String(omniPort),
    STORAGE_ENCRYPTION_KEY: secret.storage, JWT_SECRET: secret.jwt,
    API_KEY_SECRET: secret.storage, INITIAL_PASSWORD: secret.password,
    REQUIRE_API_KEY: 'false', OMNIROUTE_HEADLESS: '1',
    NEXT_TELEMETRY_DISABLED: '1', DISABLE_SQLITE_AUTO_BACKUP: 'true',
    ARENA_ELO_SYNC_ENABLED: 'false', OPENROUTER_PROVIDER_STATS_ENABLED: 'false',
    FREE_PROXY_AUTO_SYNC_ENABLED: 'false', OMNIROUTE_DISABLE_CREDENTIAL_HEALTH_CHECK: 'true',
    RATE_LIMIT_MAX_WAIT_MS: '600000', REQUEST_TIMEOUT_MS: '600000',
    OMNIROUTE_DIRECT_HEADERS_TIMEOUT_MS: '600000',
  }],
]) {
  const log = createWriteStream(join(runtime, `${name}.log`), { flags: 'a' });
  const child = spawn(process.execPath, [entry], { cwd: root, env: { ...process.env, ...env }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.pipe(log); child.stderr.pipe(log);
  child.on('error', error => console.error(`${name}: ${error.message}`));
  child.on('exit', code => console.log(`${name} exited (${code})`));
  children.push(child);
  console.log(`${name} started (pid ${child.pid})`);
}
console.log(`OmniRoute: http://127.0.0.1:${omniPort}; local fault proxy: http://127.0.0.1:${proxyPort}`);
const stop = () => { for (const child of children) child.kill(); };
process.on('SIGINT', stop); process.on('SIGTERM', stop);
