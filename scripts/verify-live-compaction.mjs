// End-to-end automatic-compaction probe. It performs external inference, so it
// refuses to run without explicit owner approval:
//
//   LOCALAGENT_LIVE_COMPACTION_APPROVAL=1 node scripts/verify-live-compaction.mjs --approved
//
// Without that, it validates the configuration preconditions and exits without
// any network request. Budgets are hard bounds, not targets. The free-only guard
// and the generated route are used unchanged; no second summarizer exists.
import assert from 'node:assert/strict';
import {createServer} from 'node:net';
import {existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {loadConfig, loadEnvironment, stateDir, urls, root} from '../src/config.mjs';
import {compactionSettings, inputCeiling} from '../src/context.mjs';
import {startEngine} from '../src/workspace/engine.mjs';
import {createTasks} from '../src/workspace/tasks.mjs';
import {checkFidelity, LIVE_COMPACTION_EXPECTATIONS} from '../src/workspace/summary-fidelity.mjs';

const directory = 'validation/phase64';
mkdirSync(directory, {recursive:true});
const approved = process.argv.includes('--approved') && process.env.LOCALAGENT_LIVE_COMPACTION_APPROVAL === '1';
const maxRequests = Number(process.env.LOCALAGENT_LIVE_REQUESTS || 6);
const maxMs = Number(process.env.LOCALAGENT_LIVE_MS || 360000);
const report = {ran:false, approved, inferenceRequests:0, budget:{maxRequests, maxMs}, checks:{}, evidence:{}};
let sent = 0, started = Date.now();
const remaining = () => maxMs - (Date.now() - started);
const freePort = () => new Promise((resolve, reject) => {
  const probe = createServer();
  probe.once('error', reject);
  probe.listen(0, '127.0.0.1', () => { const {port} = probe.address(); probe.close(() => resolve(port)); });
});
const write = () => writeFileSync(join(directory, 'live-compaction.json'), JSON.stringify(report, null, 2));

// Preconditions: no inference, no credentials printed.
function preflight(config) {
  const path = join(stateDir, 'opencode.json');
  assert.ok(existsSync(path), 'stale_engine_config: no engine config; run npm run configure with this build');
  const generated = JSON.parse(readFileSync(path, 'utf8'));
  const model = generated.provider?.omniroute?.models?.['localagent/coding'];
  assert.ok(model, 'generated engine config has no coding alias');
  const contextWindow = model.limit?.context;
  const compaction = generated.compaction;
  // The installed build may predate automatic-compaction scheduling; say so
  // instead of reporting a code defect. This file is rewritten by npm run configure.
  assert.equal(compaction?.auto, true, 'stale_engine_config: run npm run configure with this build to schedule automatic compaction');
  assert.ok(Number.isInteger(compaction.buffer) && compaction.buffer > 0, 'compaction buffer is missing');
  // The scheduled trigger must precede the guard ceiling for the same window.
  const expected = compactionSettings(contextWindow, config.outputTokens);
  assert.equal(compaction.buffer, expected.buffer, 'compaction buffer drifted from the guard ceiling');
  assert.ok(4 * (contextWindow - compaction.buffer) < inputCeiling(contextWindow, config.outputTokens),
    'compaction cannot fire before the guard rejects');
  assert.ok(existsSync(join(stateDir, 'gateway-key.json')), 'gateway key is missing; start the app once');
  if (existsSync(join(root, 'validation/phase6/engine-routes.json'))) {
    const probe = JSON.parse(readFileSync(join(root, 'validation/phase6/engine-routes.json'), 'utf8'));
    report.evidence.manualCompaction = probe.summary?.manualCompactionAvailable === false ? 'unavailable' : 'unknown';
  }
  report.evidence.contextWindow = contextWindow;
  report.evidence.compaction = {auto:compaction.auto, buffer:compaction.buffer, keep:compaction.keep ?? null};
  report.evidence.routing = config.routingOrder.filter(name => config.providers?.[name]?.enabled);
  return {contextWindow};
}

async function health(url) {
  try {
    const response = await fetch(url, {signal:AbortSignal.timeout(2000)});
    return response.ok;
  } catch { return false; }
}
async function settle(tasks, id, ms = 90000) {
  const end = Date.now() + ms;
  let snapshot;
  while (Date.now() < end) {
    snapshot = await tasks.snapshot(id);
    if (snapshot.state !== 'running') return snapshot;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  return snapshot;
}
function budget(request) {
  if (++sent > maxRequests) throw new Error(`Request budget exhausted (${maxRequests}); stopping instead of retrying.`);
  if (remaining() <= 0) throw new Error('Time budget exhausted; stopping instead of retrying.');
  return request;
}

let engine, tasks, project;
try {
  const config = loadConfig();
  loadEnvironment();
  preflight(config);
  report.checks.preflight = true;

  const guardUp = await health(urls(config).guard + '/health');
  report.checks.runtimeRunning = guardUp;
  if (!approved) {
    report.status = 'ready';
    write();
    console.log('preflight passed; live inference NOT run. Approve with LOCALAGENT_LIVE_COMPACTION_APPROVAL=1 and --approved.');
    process.exit(0);
  }
  assert.ok(guardUp, 'policy guard is not running; start the app before an approved live probe');

  const fixture = mkdtempSync(join(tmpdir(), 'localagent-live-compaction-'));
  // Facts seeded before compaction, then requested after it.
  writeFileSync(join(fixture, 'poll.mjs'), 'export const retry = () => {};\n');
  // ~140 KB forces the next model request above the scheduled compaction trigger.
  writeFileSync(join(fixture, 'history.txt'), 'deploy poller log line\n'.repeat(6300));
  project = {id:'cccccccc-cccc-cccc-cccc-cccccccccccc', name:'Live compaction fixture', path:fixture};

  engine = await startEngine({port:await freePort(), profileName:'live-compaction-profile'});
  const sessionFile = join(fixture, '.sessions.json');
  tasks = createTasks(engine, {get:() => project, list:() => [project]}, {sessionFile});
  const session = await tasks.create(project.id);
  report.evidence.session = session.id;

  await budget(tasks.prompt(session.id,
    'Objective: fix the deploy retry bug in poll.mjs. Constraint: free models only. ' +
    'Unresolved error: deploy poller timeout. Pending task: add a regression test. ' +
    'Do not edit files yet; reply in one sentence.'));
  report.inferenceRequests++;
  const seeded = await settle(tasks, session.id);
  assert.equal(seeded.state, 'completed', `seeding request ended as ${seeded.state}`);

  await budget(tasks.prompt(session.id, 'Read history.txt and reply with its last line only.'));
  report.inferenceRequests++;
  const inflated = await settle(tasks, session.id, 120000);
  report.evidence.afterLargeRead = {state:inflated.state, compaction:inflated.compaction, messages:inflated.messages.length};
  assert.ok(inflated.compaction.count > 0, 'no compaction event was observed; the probe does not retry');
  report.checks.compactionObserved = true;

  // Earlier work must remain projected after compaction.
  const parts = inflated.messages.flatMap(message => message.parts);
  report.checks.historyRetained = inflated.messages.some(message => message.id === seeded.messages[0]?.id);
  report.checks.toolResultRetained = parts.some(part => part.type === 'tool' && /history\.txt/.test(part.title || ''));
  assert.ok(report.checks.historyRetained, 'pre-compaction messages disappeared');
  assert.ok(report.checks.toolResultRetained, 'the read tool result disappeared');

  await budget(tasks.prompt(session.id,
    'Restate the objective, the constraint, the unresolved error, the pending task, and the files you read.'));
  report.inferenceRequests++;
  const answered = await settle(tasks, session.id);
  const answer = answered.messages.flatMap(message => message.parts)
    .filter(part => part.type === 'text').at(-1)?.text || '';
  const fidelity = checkFidelity(answer, LIVE_COMPACTION_EXPECTATIONS);
  report.evidence.fidelity = {...fidelity, answerChars:answer.length};
  report.checks.summaryFidelity = fidelity.passed;

  // Interruption and restart across the compaction boundary.
  await tasks.cancel(session.id).catch(() => {});
  await settle(tasks, session.id).catch(() => {});
  tasks.stop();
  engine.stop();
  const restartedEngine = await startEngine({port:await freePort(), profileName:'live-compaction-profile'});
  const restartedTasks = createTasks(restartedEngine, {get:() => project, list: () => [project]}, {sessionFile});
  try {
    const recovered = await restartedTasks.snapshot(session.id);
    report.evidence.recovered = {state:recovered.state, compaction:recovered.compaction, messages:recovered.messages.length};
    report.checks.restartRecovered = recovered.compaction.count > 0 && recovered.messages.length > 0;
    report.checks.noPromptReplay = sent === report.inferenceRequests;
  } finally { restartedTasks.stop(); restartedEngine.stop(); }

  report.ran = true;
  report.passed = Object.values(report.checks).every(Boolean);
  assert.ok(report.passed, 'live compaction checks failed: ' + JSON.stringify(report.checks));
} catch (error) {
  report.passed = false;
  report.error = String(error.message).slice(0, 600);
  // A precondition failure blocks the probe; only a started live run is a failure.
  report.status = report.ran ? 'failed' : 'blocked';
  if (report.ran) process.exitCode = 1;
} finally {
  try { tasks?.stop(); } catch {}
  try { engine?.stop(); } catch {}
  report.elapsedMs = Date.now() - started;
  write();
}
console.log(report.ran ? (report.passed ? 'live compaction verified' : 'live compaction probe failed') : report.status === 'ready' ? 'live compaction ready, not executed' : 'live compaction blocked: ' + report.error);
