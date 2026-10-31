import test from 'node:test';
import assert from 'node:assert/strict';
import { BudgetLedger, calculateCost, estimateCost } from '../src/workspace/budget-ledger.mjs';
import { POLICIES } from '../src/workspace/models.mjs';

const freeModel = {
  id: 'gemini-2.5-flash',
  tier: 'free',
  pricing: { prompt: 0, completion: 0, request: 0 }
};

const paidModel = {
  id: 'anthropic/claude-3.5-sonnet',
  tier: 'paid',
  pricing: { prompt: 0.000003, completion: 0.000015, request: 0 } // $3/M prompt, $15/M completion
};

test('calculateCost computes exact micro-dollar amounts and returns 0 for free models', () => {
  assert.equal(calculateCost(freeModel, { prompt_tokens: 10000, completion_tokens: 5000 }), 0);
  // Paid: 10,000 * 0.000003 = 0.03, 5,000 * 0.000015 = 0.075 -> total 0.105
  assert.equal(calculateCost(paidModel, { prompt_tokens: 10000, completion_tokens: 5000 }), 0.105);
});

test('estimateCost projects pre-execution budget based on token allocations', () => {
  assert.equal(estimateCost(freeModel, 4000, 2000), 0);
  // Paid: 4,000 * 0.000003 = 0.012, 2,000 * 0.000015 = 0.03 -> total 0.042
  assert.equal(estimateCost(paidModel, 4000, 2000), 0.042);
});

test('Free Only policy strictly rejects paid models with zero charges', () => {
  const ledger = new BudgetLedger({ policy: POLICIES.FREE_ONLY });

  // Free model must succeed
  const freeRes = ledger.reserve({ workflowId: 'wf-1', taskId: 't-1', model: freeModel });
  assert.equal(freeRes.allowed, true);
  assert.equal(freeRes.amountUsd, 0);

  // Paid model must fail closed
  const paidRes = ledger.reserve({ workflowId: 'wf-1', taskId: 't-2', model: paidModel });
  assert.equal(paidRes.allowed, false);
  assert.equal(paidRes.code, 'free_only_policy_violation');
});

test('Free Preferred and Paid Allowed enforce per-task and per-workflow limits', () => {
  const ledger = new BudgetLedger({
    policy: POLICIES.PAID_ALLOWED,
    perTaskBudgetUsd: 0.05,
    perWorkflowBudgetUsd: 0.10,
    monthlySpendingLimitUsd: 5.00
  });

  // Task requesting $0.042 is within task ($0.05) and workflow ($0.10) limit
  const res1 = ledger.reserve({
    workflowId: 'wf-1',
    taskId: 't-1',
    model: paidModel,
    estimatedInputTokens: 4000,
    maxOutputTokens: 2000
  });
  assert.equal(res1.allowed, true);
  assert.equal(res1.amountUsd, 0.042);

  // Second task requesting $0.042 in same workflow: total reservations = $0.084, still <= $0.10
  const res2 = ledger.reserve({
    workflowId: 'wf-1',
    taskId: 't-2',
    model: paidModel,
    estimatedInputTokens: 4000,
    maxOutputTokens: 2000
  });
  assert.equal(res2.allowed, true);

  // Third task in same workflow requesting $0.042: $0.084 + $0.042 = $0.126 > $0.10 limit -> BLOCKED
  const res3 = ledger.reserve({
    workflowId: 'wf-1',
    taskId: 't-3',
    model: paidModel,
    estimatedInputTokens: 4000,
    maxOutputTokens: 2000
  });
  assert.equal(res3.allowed, false);
  assert.equal(res3.code, 'workflow_budget_exceeded');

  // Verify workflow is paused pending approval
  const status = ledger.getStatus('wf-1');
  assert.equal(status.workflow.isPaused, true);
  assert.ok(status.workflow.pendingApproval);
});

test('Post-execution reconciliation commits actual spend and releases unused reservation delta', () => {
  const ledger = new BudgetLedger({
    policy: POLICIES.PAID_ALLOWED,
    perWorkflowBudgetUsd: 1.00
  });

  const reservation = ledger.reserve({
    workflowId: 'wf-reconcile',
    taskId: 't-1',
    model: paidModel,
    estimatedInputTokens: 5000,
    maxOutputTokens: 2000 // estimated: 5000*0.000003 + 2000*0.000015 = 0.015 + 0.03 = 0.045
  });
  assert.equal(reservation.allowed, true);
  assert.equal(reservation.amountUsd, 0.045);

  // Actual run was shorter: only 2,000 prompt tokens and 500 completion tokens
  // Actual: 2000*0.000003 + 500*0.000015 = 0.006 + 0.0075 = 0.0135
  const rec = ledger.reconcile({
    workflowId: 'wf-reconcile',
    taskId: 't-1',
    reservationId: reservation.reservationId,
    model: paidModel,
    usage: { prompt_tokens: 2000, completion_tokens: 500 }
  });

  assert.equal(rec.actualCostUsd, 0.0135);
  assert.equal(rec.reservationReleasedUsd, 0.045);
  assert.equal(rec.deltaUsd, 0.0315); // $0.0315 returned to available budget

  const status = ledger.getStatus('wf-reconcile');
  assert.equal(status.workflow.cumulativeSpendUsd, 0.0135);
  assert.equal(status.workflow.activeReservationsUsd, 0);
  assert.equal(status.workflow.remainingBudgetUsd, 0.9865);
});

test('approveBudgetIncrease unpauses workflow and expands budget limit', () => {
  const ledger = new BudgetLedger({
    policy: POLICIES.PAID_ALLOWED,
    perWorkflowBudgetUsd: 0.02
  });

  // Attempting $0.042 spend exceeds $0.02 limit
  const res1 = ledger.reserve({
    workflowId: 'wf-paused',
    taskId: 't-1',
    model: paidModel,
    estimatedInputTokens: 4000,
    maxOutputTokens: 2000
  });
  assert.equal(res1.allowed, false);
  assert.equal(ledger.getStatus('wf-paused').workflow.isPaused, true);

  // Approve $0.10 budget increase
  const approval = ledger.approveBudgetIncrease('wf-paused', 0.10);
  assert.equal(approval.approved, true);
  assert.equal(approval.newWorkflowLimitUsd, 0.12);
  assert.equal(approval.isPaused, false);

  // Now the reservation succeeds
  const res2 = ledger.reserve({
    workflowId: 'wf-paused',
    taskId: 't-1',
    model: paidModel,
    estimatedInputTokens: 4000,
    maxOutputTokens: 2000
  });
  assert.equal(res2.allowed, true);
});

