import test from 'node:test';
import assert from 'node:assert/strict';
import { ROLE_DEFINITIONS, getRoleDefinition, formatHandoffContext, buildRolePrompt } from '../src/workspace/roles.mjs';

test('role definitions enforce strict tool boundaries per specialized agent', () => {
  const planner = getRoleDefinition('planner');
  assert.ok(planner.allowedTools.includes('read'));
  assert.ok(planner.prohibitedTools.includes('write'));
  assert.ok(planner.prohibitedTools.includes('bash'));

  const implementer = getRoleDefinition('implementer');
  assert.ok(implementer.allowedTools.includes('write'));
  assert.ok(implementer.prohibitedTools.includes('bash'));

  const tester = getRoleDefinition('tester');
  assert.ok(tester.allowedTools.includes('bash'));
  assert.ok(tester.prohibitedTools.includes('write'));

  const debuggerRole = getRoleDefinition('debugger');
  assert.ok(debuggerRole.allowedTools.includes('write'));
  assert.ok(debuggerRole.allowedTools.includes('bash'));
  assert.equal(debuggerRole.prohibitedTools.length, 0);

  const reviewer = getRoleDefinition('reviewer');
  assert.ok(reviewer.allowedTools.includes('read'));
  assert.ok(reviewer.prohibitedTools.includes('write'));
  assert.ok(reviewer.prohibitedTools.includes('bash'));
});

test('buildRolePrompt generates specialized prompt with target files, criteria and handoff context', () => {
  const handoff = formatHandoffContext({
    iteration: 2,
    previousRole: 'tester',
    previousStepTitle: 'Unit Test Runner',
    testOutput: 'Error: expected true got false',
    reviewFeedback: 'Ensure boolean coercion is safe'
  });

  const prompt = buildRolePrompt({
    roleId: 'implementer',
    stepTitle: 'Fix Boolean Handling',
    taskPrompt: 'Update bool conversion in converter.mjs',
    targetFiles: ['src/converter.mjs'],
    acceptanceCriteria: ['Passes unit tests', 'No regression on null handling'],
    handoffContext: handoff
  });

  assert.ok(prompt.includes('You are the Implementer agent in LocalAgent'));
  assert.ok(prompt.includes('Target Files: src/converter.mjs'));
  assert.ok(prompt.includes('Acceptance Criteria:'));
  assert.ok(prompt.includes('Error: expected true got false'));
  assert.ok(prompt.includes('Ensure boolean coercion is safe'));
});

