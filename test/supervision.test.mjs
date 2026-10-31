import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { superviseAgent } from '../src/supervision.mjs';
const fixture=()=>{const c=new EventEmitter();c.stdout=new EventEmitter();c.kills=0;c.kill=()=>c.kills++;return c;};
test('fragmented overflow event stops once; cleanup detaches monitoring',()=>{
 const c=fixture(),codes=[];const dispose=superviseAgent(c,{onStop:code=>codes.push(code)});
 c.stdout.emit('data','{"error":{"name":"Context');c.stdout.emit('data','OverflowError"}}\n');c.stdout.emit('data','{"error":{"name":"ContextOverflowError"}}\n');
 assert.equal(c.kills,1);assert.deepEqual(codes,['context_overflow']);dispose();assert.equal(c.stdout.listenerCount('data'),0);
});
test('deadline terminates a stalled child without provider retries',async()=>{
 const c=fixture();let done;const stopped=new Promise(r=>done=r);const dispose=superviseAgent(c,{deadlineMs:5,onStop:done});
 assert.equal(await stopped,'task_deadline_exceeded');assert.equal(c.kills,1);dispose();
});
test('normal exit clears the deadline',async()=>{
 const c=fixture();superviseAgent(c,{deadlineMs:5});c.emit('exit',0);await new Promise(r=>setTimeout(r,15));assert.equal(c.kills,0);
});
