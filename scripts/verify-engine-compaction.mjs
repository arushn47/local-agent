// Zero-inference engine probe: which compaction/context routes does the pinned
// OpenCode build actually serve? Uses a throwaway profile so no project state,
// credentials or provider calls are involved.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {mkdirSync, writeFileSync, readFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {join} from 'node:path';
import {opencodeExe, root} from '../src/config.mjs';

const directory = 'validation/phase6';
mkdirSync(directory, {recursive:true});
const stamp = Date.now();
const profile = join(root, '.localagent', `phase6-compaction-probe-${stamp}`);
for (const part of ['config','data','cache','tmp']) mkdirSync(join(profile, part), {recursive:true});

const freePort = () => new Promise((resolve, reject) => {
  const probe = createServer();
  probe.once('error', reject);
  probe.listen(0, '127.0.0.1', () => {
    const {port} = probe.address();
    probe.close(() => resolve(port));
  });
});

// A coding-shaped provider entry is required by upstream config validation; it
// is never contacted because every request below targets a missing session.
const config = {
  '$schema':'https://opencode.ai/config.json',
  model:'omniroute/localagent/coding',
  enabled_providers:['omniroute'],
  autoupdate:false,
  share:'disabled',
  provider:{omniroute:{npm:'@ai-sdk/openai-compatible',name:'LocalAgent',options:{baseURL:'http://127.0.0.1:9/v1',apiKey:'probe',timeout:1000},models:{'localagent/coding':{name:'Probe',tool_call:true,limit:{context:32768,output:1800}}}}},
};
const port = await freePort();
const password = randomBytes(16).toString('hex');
const profilePath = value => value.replaceAll('\\', '/');
const child = spawn(opencodeExe, ['serve','--pure','--hostname','127.0.0.1','--port',String(port)], {
  cwd: profile,
  windowsHide: true,
  env: {
    ...process.env,
    OPENCODE_SERVER_PASSWORD: password,
    OPENCODE_CONFIG_CONTENT: JSON.stringify(config),
    OPENCODE_CONFIG_DIR: join(profile, 'config'),
    XDG_CONFIG_HOME: join(profile, 'config'),
    XDG_DATA_HOME: join(profile, 'data'),
    XDG_CACHE_HOME: join(profile, 'cache'),
    OPENCODE_DISABLE_DEFAULT_PLUGINS: 'true',
    OPENCODE_DISABLE_AUTOUPDATE: 'true',
    OPENCODE_DISABLE_MODELS_FETCH: 'true',
  },
  stdio: ['ignore','pipe','pipe'],
});
const logs = [];
child.stdout.on('data', c => logs.push(c.toString()));
child.stderr.on('data', c => logs.push(c.toString()));
const base = `http://127.0.0.1:${port}`;
const headers = {Authorization:`Basic ${Buffer.from(`opencode:${password}`).toString('base64')}`};
const session = 'ses_probe000000000000000000';
const probes = [
  ['POST', `/api/session/${session}/compact`],
  ['GET',  `/api/session/${session}/context`],
  ['GET',  `/api/session/${session}/history?limit=1`],
  ['GET',  `/api/session/${session}/message?limit=5`],
  ['POST', `/session/${session}/summarize`, {providerID:'omniroute', modelID:'localagent/coding'}],
  ['GET',  `/session/${session}/message?limit=5`],
  ['POST', `/session/${session}/abort`],
  ['GET',  `/session/${session}`],
  ['GET',  `/api/session/${session}`],
];
// Baselines: paths that cannot exist, to record the missing-route signature.
const baselines = [
  ['GET',  `/api/session/${session}/definitely-not-a-route`],
  ['GET',  `/session/${session}/definitely-not-a-route`],
];

let result;
const observed = [];
const liveObserved = [];
try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null) throw new Error('engine_exited');
    try {
      const response = await fetch(`${base}/global/health`, {headers, signal:AbortSignal.timeout(1000)});
      if (response.ok) { ready = true; break; }
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  if (!ready) throw new Error('engine_startup_timeout');
  for (const [method, path, body] of [...probes, ...baselines]) {
    const response = await fetch(base + path, {
      method,
      headers: {...headers, ...(body ? {'Content-Type':'application/json'} : {})},
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000),
    });
    const text = await response.text();
    let parsed; try { parsed = JSON.parse(text); } catch {}
    observed.push({
      method, path,
      status: response.status,
      // Error labels/messages only: these distinguish "route missing" from
      // "session missing" and contain no prompts or credentials.
      errorName: parsed?.name || parsed?.error?.name || parsed?._tag || null,
      errorMessage: String(parsed?.data?.message || parsed?.message || parsed?.error?.message || '').slice(0, 160) || null,
      contentType: response.headers.get('content-type'),
      bodyBytes: Buffer.byteLength(text),
    });
  }
  const byRoute = Object.fromEntries(observed.map(entry => [`${entry.method} ${entry.path}`, entry]));
  // The engine's web UI catch-all answers unknown paths with 200 HTML, so the
  // missing-route signature must include content type and body size.
  const signature = entry => `${entry.status}|${entry.errorName}|${(entry.errorMessage || '').replace(/ses_\w+/g, '<id>').replace(/\s+/g, ' ')}|${entry.contentType}|${entry.bodyBytes}`;
  const missingRoute = {
    api: signature(byRoute[`GET /api/session/${session}/definitely-not-a-route`]),
    legacy: signature(byRoute[`GET /session/${session}/definitely-not-a-route`]),
  };
  const reachable = route => signature(route) !== missingRoute.api && signature(route) !== missingRoute.legacy;
  for (const [method, path] of probes) {
    const entry = byRoute[`${method} ${path}`];
    assert.ok(reachable(entry), `${method} ${path} is not served by this engine build`);
  }
  const compactRoute = byRoute[`POST /api/session/${session}/compact`];
  assert.equal(compactRoute.status, 404, 'compact must report the missing session, not succeed');
  assert.match(compactRoute.errorName || '', /SessionNotFound/);

  // Real session: does the pinned build actually expose manual compaction?
  const created = await fetch(`${base}/api/session`, {
    method:'POST', headers:{...headers,'Content-Type':'application/json'}, body:'{}', signal:AbortSignal.timeout(20000),
  });
  const createdBody = await created.json().catch(() => ({}));
  const live = createdBody?.data?.id;
  assert.ok(live, `session creation failed: HTTP ${created.status}`);
  const liveProbes = [
    ['POST', `/api/session/${live}/compact`],
    ['GET',  `/api/session/${live}/context`],
    ['GET',  `/api/session/${live}/message?limit=5`],
    // The deprecated v1 summarize route is deliberately not exercised on a live
    // session: it may attempt inference. Its existence is recorded above.
    ['GET',  `/session/${live}/message?limit=5`],
  ];
  for (const [method, path, body] of liveProbes) {
    const response = await fetch(base + path, {
      method,
      headers: {...headers, ...(body ? {'Content-Type':'application/json'} : {})},
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20000),
    });
    const text = await response.text();
    liveObserved.push({
      method, path: path.replace(live, '<session>'), status: response.status,
      errorName: (() => { try { const parsed = JSON.parse(text); return parsed?.name || parsed?.error?.name || null; } catch { return null; } })(),
      errorMessage: (() => { try { const parsed = JSON.parse(text); return String(parsed?.data?.message || parsed?.message || '').slice(0,160) || null; } catch { return null; } })(),
      bodyBytes: Buffer.byteLength(text),
    });
  }
  const liveBy = Object.fromEntries(liveObserved.map(entry => [`${entry.method} ${entry.path}`, entry]));
  // Pinned 1.18.31: manual compaction is a declared-but-unavailable operation.
  assert.equal(liveBy[`POST /api/session/<session>/compact`].status, 503, 'pinned engine exposes compact as unavailable');
  result = {
    passed: true,
    engine: JSON.parse(readFileSync(join(root, 'node_modules/opencode-ai/package.json'), 'utf8')).version,
    profile: profilePath(profile),
    inferenceRequests: 0,
    observed,
    missingRoute,
    liveSession: {created:true, observed:liveObserved},
    summary: {
      // Mapping verified against the pinned build, not an SDK-generation guess.
      manualCompaction: 'POST /api/session/:sessionID/compact (client.v2.session.compact)',
      activeContext: 'GET /api/session/:sessionID/context (client.v2.session.context)',
      messages: 'GET /api/session/:sessionID/message (paged) and GET /session/:sessionID/message (client.session.messages)',
      manualCompactionAvailable: false,
      manualCompactionNote: 'V2Session.compact returns OperationUnavailableError (HTTP 503) in 1.18.31; the v1 summarize route is deprecated.',
    },
  };
} catch (error) {
  result = {passed:false, error:error.message, engine:null, inferenceRequests:0, observed, logs:logs.join('').slice(-4000)};
} finally {
  child.kill();
}
writeFileSync(join(directory, 'engine-routes.json'), JSON.stringify(result, null, 2));
if (!result.passed) console.error(result.error || 'probe failed');
console.log(result.passed ? 'engine compaction routes verified' : 'engine compaction route probe failed');
process.exitCode = result.passed ? 0 : 1;
