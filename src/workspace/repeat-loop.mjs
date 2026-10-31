import { formatHandoffContext } from './roles.mjs';

export const LOOP_STATUS = Object.freeze({
  PENDING: 'pending',
  RUNNING: 'running',
  SUCCEEDED: 'succeeded',
  EXHAUSTED: 'exhausted',
  PAUSED_BUDGET: 'paused_budget',
  FAILED: 'failed',
  CANCELLED: 'cancelled'
});

export class RepeatLoopEngine {
  constructor({
    stageId = 'repeat-loop',
    title = 'Repeat Loop',
    steps = [],
    maxIterations = 3,
    exitCondition = 'tests_passed && reviewer_approved',
    timeoutMs = 600000 // 10 minutes
  }) {
    this.stageId = stageId;
    this.title = title;
    this.steps = steps;
    this.maxIterations = Math.max(1, Math.min(10, Number(maxIterations) || 3));
    this.exitCondition = exitCondition;
    this.timeoutMs = timeoutMs;

    this.currentIteration = 0;
    this.status = LOOP_STATUS.PENDING;
    this.iterations = [];
    this.startedAt = null;
    this.completedAt = null;
    this.failureReason = null;
  }

  evaluateExitCondition({ testPassed = false, reviewerApproved = false }) {
    if (this.exitCondition === 'tests_passed') {
      return testPassed === true;
    }
    if (this.exitCondition === 'tests_passed && reviewer_approved') {
      return testPassed === true && reviewerApproved === true;
    }
    // Default fallback: requires test passage
    return testPassed === true;
  }

  startIteration() {
    if (this.status === LOOP_STATUS.SUCCEEDED) {
      throw new Error('loop_already_succeeded');
    }
    if (this.status === LOOP_STATUS.CANCELLED) {
      throw new Error('loop_cancelled');
    }
    if (this.currentIteration >= this.maxIterations) {
      this.status = LOOP_STATUS.EXHAUSTED;
      this.completedAt = Date.now();
      throw new Error(`max_iterations_reached: ${this.maxIterations}`);
    }

    if (!this.startedAt) this.startedAt = Date.now();
    this.currentIteration += 1;
    this.status = LOOP_STATUS.RUNNING;

    const iterationRecord = {
      iterationNumber: this.currentIteration,
      startedAt: Date.now(),
      completedAt: null,
      stepOutputs: new Map(),
      testPassed: false,
      reviewerApproved: false,
      testOutput: null,
      reviewFeedback: null,
      modifiedFiles: [],
      errorSummary: null
    };

    this.iterations.push(iterationRecord);
    return iterationRecord;
  }

  getCurrentIterationRecord() {
    return this.iterations[this.iterations.length - 1] || null;
  }

  recordStepOutcome(stepId, { output = '', error = null, testPassed = null, reviewerApproved = null, modifiedFiles = [] }) {
    const current = this.getCurrentIterationRecord();
    if (!current) throw new Error('no_active_iteration');

    current.stepOutputs.set(stepId, { output, error, timestamp: Date.now() });

    if (testPassed !== null) current.testPassed = Boolean(testPassed);
    if (reviewerApproved !== null) current.reviewerApproved = Boolean(reviewerApproved);
    if (output && (stepId.includes('test') || stepId.includes('suite'))) {
      current.testOutput = output;
    }
    if (output && (stepId.includes('review') || stepId.includes('criteria'))) {
      current.reviewFeedback = output;
    }
    if (Array.isArray(modifiedFiles) && modifiedFiles.length > 0) {
      for (const f of modifiedFiles) {
        if (!current.modifiedFiles.includes(f)) current.modifiedFiles.push(f);
      }
    }
    if (error) {
      current.errorSummary = error.message || String(error);
    }
  }

  completeIteration() {
    const current = this.getCurrentIterationRecord();
    if (!current) throw new Error('no_active_iteration');

    current.completedAt = Date.now();
    current.durationMs = current.completedAt - current.startedAt;

    const satisfied = this.evaluateExitCondition({
      testPassed: current.testPassed,
      reviewerApproved: current.reviewerApproved
    });

    if (satisfied) {
      this.status = LOOP_STATUS.SUCCEEDED;
      this.completedAt = Date.now();
      return {
        completed: true,
        succeeded: true,
        iteration: this.currentIteration,
        status: this.status
      };
    }

    // Check if max iterations reached
    if (this.currentIteration >= this.maxIterations) {
      this.status = LOOP_STATUS.EXHAUSTED;
      this.completedAt = Date.now();
      this.failureReason = `Exit condition "${this.exitCondition}" not satisfied after ${this.maxIterations} iterations.`;
      return {
        completed: true,
        succeeded: false,
        exhausted: true,
        iteration: this.currentIteration,
        status: this.status,
        reason: this.failureReason,
        errorSummary: current.errorSummary || current.testOutput || 'Acceptance criteria not met.'
      };
    }

    // Need next iteration: construct handoff context for subsequent attempt
    const handoff = formatHandoffContext({
      iteration: this.currentIteration,
      previousRole: 'tester',
      previousStepTitle: 'Test and Review Verification',
      testOutput: current.testOutput,
      reviewFeedback: current.reviewFeedback,
      modifiedFiles: current.modifiedFiles
    });

    return {
      completed: false,
      succeeded: false,
      nextIteration: this.currentIteration + 1,
      handoffContext: handoff
    };
  }

  cancel(reason = 'user_cancelled') {
    this.status = LOOP_STATUS.CANCELLED;
    this.completedAt = Date.now();
    this.failureReason = reason;
  }

  getStatus() {
    return {
      stageId: this.stageId,
      title: this.title,
      status: this.status,
      currentIteration: this.currentIteration,
      maxIterations: this.maxIterations,
      exitCondition: this.exitCondition,
      startedAt: this.startedAt,
      completedAt: this.completedAt,
      failureReason: this.failureReason,
      iterations: this.iterations.map(it => ({
        iterationNumber: it.iterationNumber,
        durationMs: it.durationMs,
        testPassed: it.testPassed,
        reviewerApproved: it.reviewerApproved,
        modifiedFiles: it.modifiedFiles,
        errorSummary: it.errorSummary
      }))
    };
  }
}

