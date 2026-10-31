import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { loadConfig, loadEnvironment, secrets, stateDir, opencodeExe, urls, requestJSON, guardToken } from './config.mjs';
import { discover, saveCatalog } from './catalog.mjs';
import { configureGateway } from './omniroute.mjs';
import { startPlatform } from './runtime.mjs';
import { superviseAgent } from './supervision.mjs';

async function main() {
  const [command = 'status', ...args] = process.argv.slice(2);
  const config = loadConfig();
  if (command === 'start') return startPlatform(config);
  if (command === 'configure') {
    secrets(); const catalog = await discover(config, loadEnvironment()); saveCatalog(catalog);
    const result = await configureGateway(config, catalog);
    console.log(JSON.stringify({ ...result, providers: catalog.providers }, null, 2)); return;
  }
  if (command === 'status') {
    const status = await requestJSON(urls(config).guard + '/status', { headers: { Authorization: `Bearer ${guardToken(secrets(), 'admin')}` } });
    console.log(JSON.stringify(status, null, 2)); return;
  }
  if (command === 'doctor') {
    secrets(); const catalog = await discover(config, loadEnvironment());
    console.log(JSON.stringify({ opencodeInstalled: existsSync(opencodeExe), catalog, note: 'Metadata discovery only. No inference requests were made.' }, null, 2)); return;
  }
  if (command === 'agent') {
    const configPath = join(stateDir, 'opencode.json'); const keyPath = join(stateDir, 'gateway-key.json');
    if (!existsSync(configPath) || !existsSync(keyPath)) throw new Error('Start LocalAgent first: npm start');
    let project = process.cwd(); let session; let json = false; const prompt = [];
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--project' && args[i + 1]) project = resolve(args[++i]);
      else if (args[i] === '--session' && args[i + 1]) session = args[++i];
      else if (args[i] === '--json') json = true;
      else prompt.push(args[i]);
    }
    if (!existsSync(project)) throw new Error('Project path does not exist');
    const childArgs = prompt.length ? ['run', '--pure', '--model', 'omniroute/localagent/coding', ...(json ? ['--format', 'json'] : []), ...(session ? ['--session', session] : []), prompt.join(' ')] : ['--pure'];
    if (!prompt.length && session) childArgs.push('--session', session);
    if (prompt.length && !json) throw new Error('Noninteractive coding requires --json so context failures and retries are monitored.');
    const generated = JSON.parse(readFileSync(configPath, 'utf8'));
    if (generated.provider?.omniroute?.models?.['localagent/coding']?.limit?.context < 32768) throw new Error('Stale or undersized coding configuration. Start the platform and run npm run configure successfully before coding.');
    const profile = join(stateDir, 'opencode-profile');
    for (const sub of ['config', 'data', 'cache']) mkdirSync(join(profile, sub), { recursive: true });
    const child = spawn(opencodeExe, childArgs, { cwd: project, windowsHide: false, env: { ...process.env, XDG_CONFIG_HOME: join(profile, 'config'), XDG_DATA_HOME: join(profile, 'data'), XDG_CACHE_HOME: join(profile, 'cache'), OPENCODE_CONFIG_DIR: join(profile, 'config'), LOCALAGENT_GATEWAY_KEY: JSON.parse(readFileSync(keyPath, 'utf8')).key, OPENCODE_CONFIG: configPath, OPENCODE_CONFIG_CONTENT: JSON.stringify(generated), OPENCODE_DISABLE_AUTOUPDATE: 'true', OPENCODE_DISABLE_DEFAULT_PLUGINS: 'true' }, stdio: ['inherit', json ? 'pipe' : 'inherit', 'inherit'] });
    if (json) {
      child.stdout.on('data', chunk => process.stdout.write(chunk));
      superviseAgent(child, { onStop: code => { console.error(code); process.exitCode = 1; } });
    }
    child.once('error', () => { console.error('OpenCode could not start. Check OPENCODE_EXE.'); process.exitCode = 1; });
    child.once('exit', code => { process.exitCode = code ?? 1; }); return;
  }
  if (command === 'verify-providers') {
    const { verifyProviders } = await import('./verification.mjs');
    const report = await verifyProviders(config);
    writeFileSync(join(stateDir, 'provider-verification.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2)); return;
  }
  throw new Error('Use start, configure, status, doctor, agent, or verify-providers');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
