import test from 'node:test';
import assert from 'node:assert/strict';
import {auditSession, compareArms} from '../src/workspace/behavior-audit.mjs';

const tool = (name, state) => ({type:'tool', tool:name, state});
const session = [
  {info:{id:'m1',role:'assistant',tokens:{input:900}},parts:[
    tool('read',{status:'completed',input:{filePath:'src/a.mjs'},output:'x'.repeat(400),metadata:{exit:0}}),
    tool('read',{status:'completed',input:{filePath:'src/a.mjs'},output:'x'.repeat(400),metadata:{exit:0}}),
    tool('read',{status:'completed',input:{filePath:'src/b.mjs'},output:'y'.repeat(1200),metadata:{exit:0}}),
    tool('bash',{status:'completed',input:{command:'node --test   test/a.test.mjs'},output:'ok',metadata:{exit:0}}),
    tool('bash',{status:'completed',input:{command:'node --test test/a.test.mjs'},output:'ok',metadata:{exit:0}}),
    tool('bash',{status:'completed',input:{command:'node --test test/b.test.mjs'},output:'boom',metadata:{exit:1}}),
    {type:'reasoning',text:'private'},
    {type:'text',text:'prompt text must not appear'},
  ]},
];

test('audit counts tool calls, duplicate work and failures without retaining content', () => {
  const result = auditSession(session);
  assert.equal(result.steps, 1);
  assert.equal(result.totalToolCalls, 6);
  // Null-prototype map so hostile tool names cannot reach Object.prototype.
  assert.deepEqual({...result.tools}, {read:3, bash:3});
  assert.equal(result.toolOutputBytes, 400 + 400 + 1200 + 2 + 2 + 4);
  assert.equal(result.largestToolOutputBytes, 1200);
  assert.equal(result.failedToolCalls, 1);
  assert.equal(result.uniqueFilesRead, 2);
  assert.equal(result.duplicateReads, 1);
  // Whitespace-only differences are the same command.
  assert.equal(result.duplicateCommands, 1);
  assert.equal(result.avoidableCalls, 2);
  assert.equal(result.lastInputTokens, 900);
  const serialized = JSON.stringify(result);
  for (const secret of ['src/a.mjs', 'node --test', 'private', 'prompt text']) {
    assert.ok(!serialized.includes(secret), `audit leaked ${secret}`);
  }
});

test('empty and partial sessions stay safe', () => {
  const empty = auditSession(undefined);
  assert.deepEqual({...empty, tools:{...empty.tools}}, {
    steps:0,totalToolCalls:0,tools:{},toolOutputBytes:0,largestToolOutputBytes:0,failedToolCalls:0,
    cachedOutputs:0,uniqueFilesRead:0,duplicateReads:0,duplicateCommands:0,avoidableCalls:0,lastInputTokens:null,
  });
  const partial = auditSession([{info:{id:'m',role:'assistant'},parts:[{type:'tool'}]}]);
  assert.equal(partial.totalToolCalls,1);
  assert.equal(partial.tools.unknown,1);
  assert.equal(partial.toolOutputBytes,0);
});

test('arm comparison reports deltas and refuses unknown measurements', () => {
  const baseline = auditSession(session);
  const candidate = {...baseline, totalToolCalls:4, toolOutputBytes:2000, avoidableCalls:0, lastInputTokens:null};
  const delta = compareArms(baseline, candidate);
  assert.equal(delta.totalToolCalls, -2);
  assert.equal(delta.toolOutputBytes, 2000 - baseline.toolOutputBytes);
  assert.equal(delta.avoidableCalls, -2);
  assert.equal(delta.lastInputTokens, null);
  assert.equal(compareArms(null, candidate).steps, null);
});
