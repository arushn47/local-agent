// Compaction boundary recovery: interruption, restart and bounded progress
// around an upstream compaction event. Loopback fake engine only; no inference,
// no credentials and no project files.
import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createTasks} from '../src/workspace/tasks.mjs';

const projectId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const sessionId = 'ses_recovery_fixture';

function fixture({busy = true, markers = 1} = {}) {
  const created = Date.now();
  const base = [
    {info:{id:'msg_user_1',role:'user',time:{created}},parts:[
      {id:'part_user_1',type:'text',text:'Fix the retry bug in poll.mjs.'},
    ]},
    {info:{id:'msg_assistant_1',role:'assistant',time:{created:created + 1,completed:created + 2},finish:'stop',tokens:{input:400,output:40,cache:{read:0,write:0}}},parts:[
      {id:'part_edit',type:'tool',tool:'edit',state:{status:'completed',title:'Edit poll.mjs',output:'ok',metadata:{exit:0,filediff:{file:'poll.mjs',patch:'+retry()',additions:1,deletions:0}}}},
    ]},
    {info:{id:'msg_user_2',role:'user',time:{created:created + 3}},parts:[
      {id:'part_compaction_1',type:'compaction',auto:true},
      {id:'part_user_2',type:'text',text:'Continue: add the regression test.'},
    ]},
  ];
  // Extra markers let a test exercise the unproductive-compaction guard without
  // changing the projected payload size.
  for (let index = 1; index < markers; index++) {
    base.push({info:{id:`msg_marker_${index}`,role:'user',time:{created:created + 3 + index}},parts:[
      {id:`part_compaction_${index + 1}`,type:'compaction',auto:true},
    ]});
  }
  const calls = {prompt:0, abort:0};  const engine = {forProject: () => ({
    session:{
      create:async () => ({data:{id:sessionId,title:'Recovery fixture'}}),
      messages:async () => ({data:base}),
      status:async() => ({data:busy ? {[sessionId]:{type:'busy'}} : {}}),
      diff:async() => ({data:[]}),
      promptAsync:async() => {calls.prompt++;},
      abort:async() => {calls.abort++;},
    },
    permission:{list:async() => ({data:[]})},
  })};
  const projects = {get:() => ({id:projectId,name:'Recovery fixture',path:join(tmpdir(),'localagent-recovery-project')}), list:() => []};
  return {engine,projects,calls};
}

async function withTasks(options, run) {
  const directory = mkdtempSync(join(tmpdir(),'localagent-recovery-'));
  const sessionFile = join(directory,'sessions.json');
  const {engine,projects,calls} = fixture(options);
  const tasks = createTasks(engine,projects,{sessionFile});
  try {
    const session = await tasks.create(projectId);
    await run({tasks,session, calls, sessionFile, directory});
  } finally {
    tasks.stop();
    rmSync(directory,{recursive:true,force:true});
  }
}

test('cancelling at a compaction boundary keeps earlier work and reports cancellation', async () => {
  await withTasks({}, async ({tasks,session,calls}) => {
    await tasks.prompt(session.id,'Continue: add the regression test.');
    await tasks.snapshot(session.id);
    await tasks.cancel(session.id);
    const snapshot = await tasks.snapshot(session.id);
    assert.equal(snapshot.state,'cancelled');
    assert.equal(calls.abort,1);
    // The compaction marker and the pre-compaction patch survive the interrupt.
    assert.deepEqual(snapshot.compaction,{count:1,auto:true});
    assert.equal(snapshot.messages[0].id,'msg_user_1');
    assert.deepEqual(snapshot.diffs.map(d=>d.file),['poll.mjs']);
    assert.equal(calls.prompt,1);
    assert.equal(snapshot.context.inputIncludingCache,400);
  });
});

test('restarting after a compaction boundary restores history without replaying work', async () => {
  const directory = mkdtempSync(join(tmpdir(),'localagent-restart-'));
  const sessionFile = join(directory,'sessions.json');
  try {
    const first = fixture({busy:false});
    const tasks = createTasks(first.engine,first.projects,{sessionFile});
    const session = await tasks.create(projectId);
    const before = await tasks.snapshot(session.id);
    assert.deepEqual(before.compaction,{count:1,auto:true});
    tasks.stop();
    assert.ok(existsSync(sessionFile),'session reference was not persisted');

    // A fresh process re-reads only the durable session reference.
    const second = fixture({busy:false});
    const restarted = createTasks(second.engine,second.projects,{sessionFile});
    try {
      assert.deepEqual(JSON.parse(readFileSync(sessionFile,'utf8')).map(s=>s.id),[sessionId]);
      const after = await restarted.snapshot(session.id);
      assert.deepEqual(after.compaction,{count:1,auto:true});
      assert.equal(after.messages[0].id,'msg_user_1');
      assert.equal(after.state,'completed');
      assert.equal(second.calls.prompt,0,'restart must not resend a prompt');
      assert.equal(after.diffs.length,1);
    } finally { restarted.stop(); }
  } finally { rmSync(directory,{recursive:true,force:true}); }
});

test('a second compaction with no size reduction stops the run instead of looping', async () => {
  await withTasks({markers:2}, async ({tasks,session,calls}) => {
    await tasks.prompt(session.id,'Continue: add the regression test.');
    const first = await tasks.snapshot(session.id);
    assert.equal(first.compaction.count,2);
    // Same payload size => unproductive compaction, so the run is aborted.
    const second = await tasks.snapshot(session.id);
    assert.equal(calls.abort,1);
    assert.equal(second.state,'progress_budget_exhausted');
    // Work already produced is still projected; nothing is replayed.
    assert.equal(calls.prompt,1);
    assert.ok(second.messages.some(m=>m.id==='msg_assistant_1'));
  });
});
