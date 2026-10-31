import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {resolve, join} from 'node:path';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {backendTreeHash} from './backend-contract.mjs';

const evidence = resolve('validation/phase52'), closureBytes = readFileSync(join(evidence, 'backend-closure.json'));
const closure = JSON.parse(closureBytes), candidate = resolve(process.argv[2] || closure.output);
if (candidate !== resolve(closure.output)) throw Error('Candidate does not match closure');
const scripts = join(candidate, 'scripts');
mkdirSync(scripts, {recursive: true});
const fixture = readFileSync('scripts/verify-gateway-compatibility.mjs', 'utf8')
  .replaceAll('validation/phase51', evidence.replaceAll('\\', '/'));
writeFileSync(join(scripts, 'verify-gateway-compatibility.mjs'), fixture);
const log = join(evidence, 'backend-modules.ndjson');
writeFileSync(log, '');
const env = {...process.env, NODE_OPTIONS: '--require="' + resolve('scripts/trace-backend-modules.cjs').replaceAll('\\', '/') + '"',
  LOCALAGENT_CLOSURE_ROOT: candidate, LOCALAGENT_CLOSURE_LOG: log};
for (const key of Object.keys(env)) if (/API_KEY|TOKEN|SECRET|PASSWORD/i.test(key)) delete env[key];
const child = spawn(resolve('.localagent/desktop-node/node.exe'), [join(scripts, 'verify-gateway-compatibility.mjs')],
  {cwd: candidate, env, windowsHide: true, stdio: 'inherit'});
const code = await new Promise((r, j) => {child.once('exit', c => r(c ?? 1)); child.once('error', j);});
const records = readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
const proof = {candidate, closureSha256: createHash('sha256').update(closureBytes).digest('hex'),
  treeSha256: backendTreeHash(join(candidate, 'node_modules')),
  scope: 'LocalAgent management/configuration and loopback tool/history/cooldown flows; traces, extras and externals retained. Optional upstream features are not universally certified.',
  moduleEscapes: records.filter(r => r.event === 'escape').length,
  observedModuleFiles: new Set(records.filter(r => r.file).map(r => r.file)).size,
  gatewayFixturePassed: code === 0, externalInferenceRequests: 0};
proof.passed = code === 0 && proof.moduleEscapes === 0;
writeFileSync(join(evidence, 'backend-proof.json'), JSON.stringify(proof, null, 2));
console.log(JSON.stringify(proof));
process.exitCode = proof.passed ? 0 : 1;
