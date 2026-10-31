import test from 'node:test';
import assert from 'node:assert/strict';
import { RepeatLoopEngine, LOOP_STATUS } from '../src/workspace/repeat-loop.mjs';

test('single iteration succeeds immediately when test passes and reviewer approves', () => {
  const loop = new RepeatLoopEngine({
    stageId: 'implement-and-verify',
    maxIterations: 3,
    exitCondition: 'tests_passed && reviewer_approved'
  });

  const it1 = loop.startIteration();
  assert.equal(it1.iterationNumber, 1);
  assert.equal(loop.status, LOOP_STATUS.RUNNING);

  loop.recordStepOutcome('implement', { output: 'Code changes applied', modifiedFiles: ['src/app.js'] });
  loop.recordStepOutcome('run-tests', { output: '✔ 10/10 tests passed', testPassed: true });
  loop.recordStepOutcome('review', { output: 'Approved: Clean diff', reviewerApproved: true });

  const outcome = loop.completeIteration();
  assert.equal(outcome.completed, true);
  assert.equal(outcome.succeeded, true);
  assert.equal(loop.status, LOOP_STATUS.SUCCEEDED);
  assert.equal(loop.currentIteration, 1);
});

test('iterative retry passes failure context to subsequent iteration and succeeds on iteration 2', () => {
  const loop = new RepeatLoopEngine({
    stageId: 'fix-and-verify',
    maxIterations: 3,
    exitCondition: 'tests_passed && reviewer_approved'
  });

  // Iteration 1 fails tests
  loop.startIteration();
  loop.recordStepOutcome('implement', { output: 'Initial attempt', modifiedFiles: ['src/calc.js'] });
  loop.recordStepOutcome('run-tests', { output: 'FAIL: calculateTotal expected 10 got 0', testPassed: false });
  loop.recordStepOutcome('review', { output: 'Changes requested: fix off-by-one error', reviewerApproved: false });

  const outcome1 = loop.completeIteration();
  assert.equal(outcome1.completed, false);
  assert.equal(outcome1.nextIteration, 2);
  assert.ok(outcome1.handoffContext.includes('FAIL: calculateTotal expected 10 got 0'));
  assert.ok(outcome1.handoffContext.includes('Changes requested: fix off-by-one error'));

  // Iteration 2 receives handoff and passes
  loop.startIteration();
  loop.recordStepOutcome('implement', { output: 'Fixed calculation logic', modifiedFiles: ['src/calc.js'] });
  loop.recordStepOutcome('run-tests', { output: 'PASS: all tests pass', testPassed: true });
  loop.recordStepOutcome('review', { output: 'Approved', reviewerApproved: true });

  const outcome2 = loop.completeIteration();
  assert.equal(outcome2.completed, true);
  assert.equal(outcome2.succeeded, true);
  assert.equal(loop.status, LOOP_STATUS.SUCCEEDED);
  assert.equal(loop.currentIteration, 2);
});

test('repeat loop halts cleanly and reports exhausted when maxIterations clamp is reached', () => {
  const loop = new RepeatLoopEngine({
    stageId: 'stubborn-bug',
    maxIterations: 2,
    exitCondition: 'tests_passed'
  });

  // Iteration 1 fails
  loop.startIteration();
  loop.recordStepOutcome('test', { output: 'AssertionError: failure', testPassed: false });
  loop.completeIteration();

  // Iteration 2 fails
  loop.startIteration();
  loop.recordStepOutcome('test', { output: 'AssertionError: failure again', testPassed: false });
  const finalOutcome = loop.completeIteration();

  assert.equal(finalOutcome.completed, true);
  assert.equal(finalOutcome.succeeded, false);
  assert.equal(finalOutcome.exhausted, true);
  assert.equal(loop.status, LOOP_STATUS.EXHAUSTED);
  assert.equal(loop.currentIteration, 2);

  // Calling startIteration on exhausted loop throws bounded error
  assert.throws(() => loop.startIteration(), /max_iterations_reached/);
});

