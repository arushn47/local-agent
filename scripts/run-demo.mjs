import { spawn } from 'node:child_process';
import { writeFileSync, readFileSync, mkdirSync, createWriteStream } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { root, runtime, proxyURL, primary, fallback, opencodeExe, json } from './common.mjs';

mkdirSync(runtime, { recursive: true });
const marker = 'copper-heron-472';
const digest = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const testsHash = digest(join(root, 'demo', 'duration.test.mjs'));
const specHash = digest(join(root, 'demo', 'SPEC.md'));
// Reset only this disposable exercise, not the integration or any user project.
writeFileSync(join(root, 'demo', 'duration.mjs'), readFileSync(join(root, 'demo', 'duration.before.txt')));
await json(proxyURL + '/__control', { method: 'POST', body: { armed: true, marker } });

const config = {
  permission: { '*': 'deny', read: 'allow', edit: 'allow', bash: { '*': 'deny', 'node --test duration.test.mjs': 'allow' } },
  tools: { task: false, todowrite: false, webfetch: false, websearch: false, codesearch: false, question: false, skill: false },
  agent: { demo: { mode: 'primary', prompt: 'Fix the existing JavaScript duration parser. First read SPEC.md and duration.mjs. Make the small changes described in the specification using edit. Then run bash with exactly node --test duration.test.mjs. Change only duration.mjs. Do not delegate. Keep explanations brief.' } },
};
const outputPath = join(runtime, 'opencode-events.jsonl');
const output = createWriteStream(outputPath);
const errorOutput = createWriteStream(join(runtime, 'opencode-stderr.log'));
const started = new Date().toISOString();
const child = spawn(opencodeExe, ['run', '--pure', '--format', 'json', '--agent', 'demo', '--model', 'omniroute/local-coding-failover', '--title', 'Real coding task with automatic model fallback',
  'Read SPEC.md first, then duration.mjs. Fix the existing parser as specified and run node --test duration.test.mjs. Do not modify tests. Perform all steps now.'], {
  cwd: join(root, 'demo'), windowsHide: true,
  env: { ...process.env, OPENCODE_CONFIG: join(root, 'demo', 'opencode.poc.json'), OPENCODE_CONFIG_CONTENT: JSON.stringify(config),
    OPENCODE_DISABLE_AUTOUPDATE: 'true', OPENCODE_DISABLE_DEFAULT_PLUGINS: 'true',
    OPENCODE_DISABLE_SHARE: 'true',
  }, stdio: ['ignore', 'pipe', 'pipe'],
});
let pending = '';
const seen = [];
child.stdout.on('data', chunk => {
  output.write(chunk); pending += chunk.toString();
  const lines = pending.split('\n'); pending = lines.pop();
  for (const line of lines) {
    try {
      const event = JSON.parse(line); seen.push(event);
      console.log(JSON.stringify({ type: event.type, sessionID: event.sessionID, tool: event.part?.tool, status: event.part?.state?.status,
        text: event.type === 'text' ? event.part?.text?.slice(0, 160) : undefined }));
    } catch { if (line.trim()) console.log(line.slice(0, 200)); }
  }
});
child.stderr.on('data', chunk => { errorOutput.write(chunk); console.error(chunk.toString().slice(0, 500)); });
const deadline = setTimeout(() => { console.error('Demo exceeded 20 minutes; stopping OpenCode.'); child.kill(); }, 20 * 60 * 1000);
try {
  const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); });
  output.end(); errorOutput.end();
  const state = await json(proxyURL + '/__control');
  await json(proxyURL + '/__control', { method: 'POST', body: { armed: false } });
  const test = spawn(process.execPath, ['--test', 'duration.test.mjs'], { cwd: join(root, 'demo'), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let testText = '';
  test.stdout.on('data', b => testText += b); test.stderr.on('data', b => testText += b);
  const testExit = await new Promise((resolve, reject) => { test.once('error', reject); test.once('exit', resolve); });
  writeFileSync(join(runtime, 'test-output.txt'), testText);
  const first = state.events.find(e => e.event === 'upstream_completed' && e.requestedModel === primary && e.status === 200 && e.toolNames?.length);
  const fault = state.events.find(e => e.event === 'injected_rate_limit');
  const recovery = state.events.find(e => e.event === 'upstream_completed' && e.requestedModel === fallback && e.status === 200);
  const context = state.events.find(e => e.event === 'request' && e.model === fallback && e.toolResults > 0 && e.markerInContext);
  const sessions = [...new Set(seen.map(e => e.sessionID).filter(Boolean))];
  const agentEditedCode = seen.some(e => e.type === 'tool_use' && ['edit', 'write'].includes(e.part?.tool) && e.part?.state?.status === 'completed' && /duration\.mjs$/.test(e.part?.state?.input?.filePath || ''));
  const agentRanTests = seen.some(e => e.type === 'tool_use' && e.part?.tool === 'bash' && e.part?.state?.status === 'completed' && e.part?.state?.input?.command === 'node --test duration.test.mjs');
  const fixturesUnchanged = testsHash === digest(join(root, 'demo', 'duration.test.mjs')) && specHash === digest(join(root, 'demo', 'SPEC.md'));
  const report = {
    started, finished: new Date().toISOString(), opencodeExit: code, testExit,
    primary, fallback, sessions, fixturesUnchanged, agentEditedCode, agentRanTests, primaryMadeToolCall: Boolean(first), injected429: Boolean(fault),
    fallbackCompleted: Boolean(recovery), fallbackReceivedPriorToolContext: Boolean(context),
    successful: code === 0 && testExit === 0 && fixturesUnchanged && agentEditedCode && Boolean(first && fault && recovery && context) && sessions.length === 1,
    events: state.events,
  };
  writeFileSync(join(runtime, 'report.json'), JSON.stringify(report, null, 2));
  console.log(testText.split('\n').filter(line => /^ℹ|^#|^✔|^✖/.test(line)).slice(0,35).join('\n'));
  console.log(JSON.stringify({ ...report, events: undefined }, null, 2));
  if (!report.successful) process.exitCode = 1;
} finally {
  clearTimeout(deadline);
  await json(proxyURL + '/__control', { method: 'POST', body: { armed: false } }).catch(() => {});
}
