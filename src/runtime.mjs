import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { root, stateDir, omniRoot, urls, secrets, loadEnvironment } from './config.mjs';
import { startGuard } from './guard.mjs';
import { discover, saveCatalog } from './catalog.mjs';
import { configureGateway } from './omniroute.mjs';
import { waitForRuntime } from './readiness.mjs';
import { checkRuntimes } from './runtime-dependencies.mjs';
import { createRuntimeState } from './runtime-state.mjs';
import {boundedLogStream} from './log-retention.mjs';
import {withoutWorkspaceAuthentication} from './runtime-environment.mjs';

export async function startPlatform(config, { onChild = () => {}, onStage = () => {}, onFailure = () => {}, signal } = {}) {
  const dependencies = checkRuntimes();
  if (!dependencies.ready) throw new Error('Pinned runtimes unavailable or mismatched. Run npm ci, then npm run check:runtime.');
  const secret = secrets(); mkdirSync(join(stateDir, 'omniroute'), { recursive: true });
  const serverFile = join(omniRoot, 'dist/server-ws.mjs');
  if (!existsSync(serverFile)) throw new Error('Install the pinned OmniRoute runtime or set OMNIROUTE_PACKAGE_DIR');
  const state = createRuntimeState();
  const guard = startGuard(config, secret, { runtimeState:state.snapshot });
  await new Promise((resolve, reject) => { guard.once('listening', resolve); guard.once('error', reject); });
  const log = boundedLogStream(join(stateDir, 'omniroute.log'));
  const port = String(config.gatewayPort);
  const child = spawn(process.execPath, [serverFile], { cwd: root, windowsHide: true, env: { ...withoutWorkspaceAuthentication(process.env), DATA_DIR: join(stateDir, 'omniroute'), PORT: port, OMNIROUTE_PORT: port, API_PORT: port, DASHBOARD_PORT: port, HOSTNAME: '127.0.0.1', STORAGE_ENCRYPTION_KEY: secret.storage, JWT_SECRET: secret.jwt, API_KEY_SECRET: secret.storage, INITIAL_PASSWORD: secret.password, REQUIRE_API_KEY: 'true', OMNIROUTE_HEADLESS: '1', NEXT_TELEMETRY_DISABLED: '1', DISABLE_SQLITE_AUTO_BACKUP: 'true', ARENA_ELO_SYNC_ENABLED: 'false', OPENROUTER_PROVIDER_STATS_ENABLED: 'false', FREE_PROXY_AUTO_SYNC_ENABLED: 'false', OMNIROUTE_DISABLE_CREDENTIAL_HEALTH_CHECK: 'true', REQUEST_TIMEOUT_MS: '600000', OMNIROUTE_DIRECT_HEADERS_TIMEOUT_MS: '600000' }, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.pipe(log,{end:false}); child.stderr.pipe(log,{end:false});child.once('close',()=>log.end());
  log.on('error',()=>{child.stdout.unpipe(log);child.stderr.unpipe(log);child.stdout.resume();child.stderr.resume();});
  onChild(child, 'gateway');
  let stopped = false; let refresh;
  const stop = () => { if (stopped) return; stopped = true; state.set('stopped'); clearInterval(refresh); guard.close(); guard.closeAllConnections(); child.kill(); signal?.removeEventListener('abort', stop); process.removeListener('SIGINT',stop); process.removeListener('SIGTERM',stop); };
  signal?.addEventListener('abort', stop, { once:true });
  child.once('error', () => { console.error('OmniRoute could not start'); stop(); process.exitCode = 1; });
  child.once('exit', () => { if (!stopped) { console.error('OmniRoute exited; stopping LocalAgent'); stop(); onFailure('gateway_exited'); process.exitCode = 1; } });
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
  try {
    console.log(JSON.stringify({ stage: 'runtime_readiness' }));
    state.set('runtime_readiness');
    onStage('runtime_readiness');
    await waitForRuntime(urls(config).gateway, { signal });
    if (stopped) throw new Error('Startup stopped');
    console.log(JSON.stringify({ stage: 'catalog_discovery' }));
    state.set('catalog_discovery');
    onStage('catalog_discovery');
    const catalog = await discover(config, loadEnvironment()); saveCatalog(catalog);
    console.log(JSON.stringify({ stage: 'authentication_and_configuration' }));
    state.set('authentication_and_configuration');
    onStage('authentication_and_configuration');
    const result = await configureGateway(config, catalog);
    state.set('ready');
    console.log(JSON.stringify({ ready: true, ...result, providers: 'npm run status', agent: 'npm run agent -- --project PATH', stop: 'Ctrl+C' }, null, 2));
    let refreshing = false;
    refresh = setInterval(async () => { if (refreshing) return; refreshing = true; try { const catalog = await discover(config, loadEnvironment()); saveCatalog(catalog); await configureGateway(config, catalog); } catch { console.error('Catalog refresh failed; cloud routes expire closed. Run npm run configure.'); } finally { refreshing = false; } }, 30 * 60 * 1000);
    return { stop, child, guard };
  } catch (error) { stop(); throw error; }
}
