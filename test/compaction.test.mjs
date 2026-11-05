// Compaction preservation fixture. A loopback fake engine stands in for OpenCode:
// no inference, no credentials, no project files. It verifies that LocalAgent
// projects upstream compaction without duplicating history or replaying work.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createTasks, safeMessages} from '../src/workspace/tasks.mjs';

const projectId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const sessionId = 'ses_compaction_fixture';

function fixture({withUsage = true, startedAt = 0, directory} = {}) {
  const created = Math.max(Date.now(), startedAt) + 5;
  const messages = [
    {info:{id:'msg_user_1',role:'user',time:{created}},parts:[
      {id:'part_user_1',type:'text',text:'Add a test for the doubling helper.'},
    ]},
    {info:{id:'msg_assistant_1',role:'assistant',time:{created:created + 1,completed:created + 2},finish:'tool-calls'},parts:[
      {id:'part_read',type:'tool',tool:'read',state:{status:'completed',title:'Read double.mjs',output:'export const double = n => n * 2;',metadata:{exit:0}}},
      {id:'part_edit',type:'tool',tool:'edit',state:{status:'completed',title:'Edit double.test.mjs',output:'ok',metadata:{exit:0,filediff:{file:'double.test.mjs',patch:'+test("doubles",()=>{})',additions:1,deletions:0}}}},
      {id:'part_reasoning',type:'reasoning',text:'private chain of thought'},
    ]},
    // Upstream attaches the compaction marker to the user message it follows.
    {info:{id:'msg_user_2',role:'user',time:{created:created + 3}},parts:[
      {id:'part_compaction',type:'compaction',auto:true},
      {id:'part_user_2',type:'text',text:'Continue: run the tests.'},
    ]},
    {info:{id:'msg_assistant_2',role:'assistant',time:{created:created + 4,completed:created + 5},finish:'stop',
      ...(withUsage ? {tokens:{input:420,output:60,cache:{read:80,write:0}}} : {})},parts:[
      {id:'part_test',type:'tool',tool:'bash',state:{status:'completed',title:'Run tests',output:'1 passed',metadata:{exit:0},input:{command:'node --test'}}},
      {id:'part_text_2',type:'text',text:'The test passes.'},
    ]},
  ];
  const calls = {prompt:0,abort:0};
  const engine = {forProject:()=>({
    session:{
      create:async()=>({data:{id:sessionId,title:'Compaction fixture'}}),
      messages:async()=>({data:messages}),
      status:async()=>({data:{}}),
      diff:async()=>({data:[]}),
      promptAsync:async()=>{calls.prompt++;},
      abort:async()=>{calls.abort++;},
    },
    permission:{list:async()=>({data:[{id:'perm_1',sessionID:sessionId,permission:'bash',patterns:['node --test']}]})},
  })};
  const projects = {get:()=>({id:projectId,name:'Fixture',path:directory}),list:()=>[]};
  return {engine,projects,calls,messages};
}

async function withTasks(options, run) {
  const directory = mkdtempSync(join(tmpdir(), 'localagent-compaction-'));
  const {engine,projects,calls,messages} = fixture({...options,directory});
  const tasks = createTasks(engine, projects, {sessionFile:join(directory,'sessions.json')});
  try {
    const session = await tasks.create(projectId);
    await run({tasks, session, calls, messages});
  } finally {
    tasks.stop();
    rmSync(directory, {recursive:true,force:true});
  }
}

test('compaction keeps earlier messages, tool results and patches available', async () => {
  await withTasks({}, async ({tasks, session}) => {
    const snapshot = await tasks.snapshot(session.id);
    const parts = snapshot.messages.flatMap(message => message.parts);
    // History retention: the pre-compaction turn is still projected.
    assert.ok(snapshot.messages.some(message => message.id === 'msg_assistant_1'));
    assert.equal(parts.find(part => part.tool === 'read')?.output, 'export const double = n => n * 2;');
    assert.equal(parts.filter(part => part.tool === 'bash').at(-1).exit, 0);
    // Tool patches from the earlier turn still populate Changes.
    assert.equal(snapshot.diffs.length, 1);
    assert.equal(snapshot.diffs[0].file, 'double.test.mjs');
    // Permissions and their identifiers survive compaction unchanged.
    assert.deepEqual(snapshot.permissions, [{id:'perm_1',permission:'bash',patterns:['node --test']}]);
  });
});

test('compaction is reported as metadata and never exposes the summary or reasoning', async () => {
  await withTasks({}, async ({tasks, session}) => {
    const snapshot = await tasks.snapshot(session.id);
    assert.deepEqual(snapshot.compaction, {count:1, auto:true});
    const markers = snapshot.messages.flatMap(message => message.parts).filter(part => part.type === 'compaction');
    assert.deepEqual(markers, [{type:'compaction',auto:true}]);
    const serialized = JSON.stringify(snapshot);
    assert.ok(!serialized.includes('private chain of thought'));
    assert.ok(!/thought_signature|reasoning/.test(serialized));
    // Usage still describes the last completed upstream request.
    assert.equal(snapshot.context.inputIncludingCache, 500);
    assert.equal(snapshot.context.percentage, null);
  });
});

test('missing usage and manual compaction markers stay honest', async () => {
  await withTasks({withUsage:false}, async ({tasks, session}) => {
    const snapshot = await tasks.snapshot(session.id);
    assert.equal(snapshot.context.source, 'unavailable');
    assert.equal(snapshot.context.inputTokens, null);
    assert.deepEqual(snapshot.compaction, {count:1, auto:true});
    assert.deepEqual(safeMessages([{info:{id:'m',role:'user'},parts:[{type:'compaction'}]}])[0].parts, [{type:'compaction',auto:false}]);
  });
});

test('compaction does not replay the prompt or re-run tools', async () => {
  await withTasks({startedAt:Date.now()}, async ({tasks, session, calls, messages}) => {
    // Re-stamp the fixture so the run window covers the assistant messages.
    const now = Date.now() + 1000;
    for (const message of messages) {
      message.info.time = {created:now + 1,completed:now + 2};
      if (message.info.role === 'assistant') message.info.finish = 'stop';
    }
    await tasks.prompt(session.id, 'Continue: run the tests.');
    assert.equal(calls.prompt, 1);
    // Repeated snapshots reconcile from OpenCode events, they do not resend work.
    await tasks.snapshot(session.id);
    await tasks.snapshot(session.id);
    assert.equal(calls.prompt, 1);
    const snapshot = await tasks.snapshot(session.id);
    assert.equal(snapshot.state, 'completed');
  });
});
