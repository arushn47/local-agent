import test from 'node:test';
import assert from 'node:assert/strict';
import {commandOutcome,isTestCommand} from '../apps/workspace/src/tool-outcomes.mjs';
test('command and test projections distinguish running, rejected, unknown exit and confirmed outcomes',()=>{
  assert.equal(commandOutcome({status:'running'}).kind,'busy');
  assert.equal(commandOutcome({status:'error'}).label,'failed');
  assert.equal(commandOutcome({status:'completed'}).kind,'unknown');
  assert.equal(commandOutcome({status:'completed',exit:0}).kind,'pass');
  assert.equal(commandOutcome({status:'completed',exit:2}).kind,'fail');
  for(const cmd of ['node --test check.test.mjs','npm test','npm run test:unit','python -m pytest','cargo test','npx vitest run'])assert.ok(isTestCommand(cmd),cmd);
  for(const cmd of ['cat test.js','echo tests_pass','node latest.mjs'])assert.equal(isTestCommand(cmd),false,cmd);
});
