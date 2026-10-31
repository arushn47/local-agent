import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { stateDir } from '../config.mjs';
import { POLICIES } from './models.mjs';

export function calculateCost(model, tokens = {}) {
  if (!model || model.tier === 'free') return 0;
  const promptTokens = Number(tokens.prompt_tokens || tokens.input_tokens || 0);
  const completionTokens = Number(tokens.completion_tokens || tokens.output_tokens || 0);
  const promptRate = Number(model.pricing?.prompt || 0);
  const completionRate = Number(model.pricing?.completion || 0);
  const requestRate = Number(model.pricing?.request || 0);
  const cost = (promptTokens * promptRate) + (completionTokens * completionRate) + (promptTokens > 0 ? requestRate : 0);
  return Math.round(cost * 1e6) / 1e6; // Round to 6 decimal places (micro-dollars)
}

export function estimateCost(model, inputTokens = 2048, outputTokens = 1800) {
  if (!model || model.tier === 'free') return 0;
  return calculateCost(model, { prompt_tokens: inputTokens, completion_tokens: outputTokens });
}

export class BudgetLedger {
  constructor({
    policy = POLICIES.FREE_ONLY,
    perTaskBudgetUsd = undefined,
    perWorkflowBudgetUsd = undefined,
    monthlySpendingLimitUsd = undefined,
    storageFile = join(stateDir, 'budget-ledger.json')
  } = {}) {
    this.storageFile = storageFile;
    this.policy = POLICIES.FREE_ONLY;
    this.limits = {
      perTaskBudgetUsd: 0.0,
      perWorkflowBudgetUsd: 0.0,
      monthlySpendingLimitUsd: 0.0
    };
    this.monthlyCumulativeSpendUsd = 0.0;
    this.workflows = new Map();
    this.tasks = new Map();
    this.pendingApprovals = new Map();

    if (this.storageFile) {
      this.load();
    }

    // Explicit constructor arguments always take precedence over loaded defaults
    if (policy !== undefined) this.policy = policy;
    if (perTaskBudgetUsd !== undefined) this.limits.perTaskBudgetUsd = Math.max(0, Number(perTaskBudgetUsd) || 0);
    if (perWorkflowBudgetUsd !== undefined) this.limits.perWorkflowBudgetUsd = Math.max(0, Number(perWorkflowBudgetUsd) || 0);
    if (monthlySpendingLimitUsd !== undefined) this.limits.monthlySpendingLimitUsd = Math.max(0, Number(monthlySpendingLimitUsd) || 0);
  }

  load() {
    if (!this.storageFile) return;
    try {
      if (existsSync(this.storageFile)) {
        const data = JSON.parse(readFileSync(this.storageFile, 'utf8'));
        const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
        if (data.month === currentMonth) {
          this.monthlyCumulativeSpendUsd = Number(data.monthlyCumulativeSpendUsd) || 0.0;
        } else {
          // New month -> reset monthly counter
          this.monthlyCumulativeSpendUsd = 0.0;
        }
        if (data.policy) this.policy = data.policy;
        if (data.limits) {
          this.limits.perTaskBudgetUsd = Number(data.limits.perTaskBudgetUsd) || this.limits.perTaskBudgetUsd;
          this.limits.perWorkflowBudgetUsd = Number(data.limits.perWorkflowBudgetUsd) || this.limits.perWorkflowBudgetUsd;
          this.limits.monthlySpendingLimitUsd = Number(data.limits.monthlySpendingLimitUsd) || this.limits.monthlySpendingLimitUsd;
        }
      }
    } catch {}
  }

  save() {
    if (!this.storageFile) return;
    try {
      const currentMonth = new Date().toISOString().slice(0, 7);
      const data = {
        month: currentMonth,
        policy: this.policy,
        limits: this.limits,
        monthlyCumulativeSpendUsd: this.monthlyCumulativeSpendUsd,
        updatedAt: new Date().toISOString()
      };
      writeFileSync(this.storageFile, JSON.stringify(data, null, 2), { mode: 0o600 });
    } catch {}
  }

  setPolicy(policy, newLimits = {}) {
    if (!Object.values(POLICIES).includes(policy)) {
      throw new Error(`invalid_policy: ${policy}`);
    }
    this.policy = policy;
    if (newLimits.perTaskBudgetUsd !== undefined) this.limits.perTaskBudgetUsd = Math.max(0, Number(newLimits.perTaskBudgetUsd) || 0);
    if (newLimits.perWorkflowBudgetUsd !== undefined) this.limits.perWorkflowBudgetUsd = Math.max(0, Number(newLimits.perWorkflowBudgetUsd) || 0);
    if (newLimits.monthlySpendingLimitUsd !== undefined) this.limits.monthlySpendingLimitUsd = Math.max(0, Number(newLimits.monthlySpendingLimitUsd) || 0);
    this.save();
  }

  _getWorkflowRecord(workflowId) {
    if (!this.workflows.has(workflowId)) {
      this.workflows.set(workflowId, {
        cumulativeSpendUsd: 0.0,
        budgetLimitUsd: this.limits.perWorkflowBudgetUsd,
        activeReservations: new Map(),
        isPaused: false
      });
    }
    return this.workflows.get(workflowId);
  }

  _getTaskSpend(taskId) {
    return this.tasks.get(taskId) || 0.0;
  }

  _getActiveReservationsTotal() {
    let total = 0.0;
    for (const wf of this.workflows.values()) {
      for (const res of wf.activeReservations.values()) {
        total += res.amountUsd;
      }
    }
    return total;
  }

  reserve({
    workflowId = 'default-workflow',
    taskId = 'default-task',
    model,
    estimatedInputTokens = 2048,
    maxOutputTokens = 1800
  }) {
    // 1. Free Only Policy Enforcement:
    if (this.policy === POLICIES.FREE_ONLY) {
      if (!model || model.tier !== 'free' || (model.pricing?.prompt || 0) > 0 || (model.pricing?.completion || 0) > 0) {
        return {
          allowed: false,
          code: 'free_only_policy_violation',
          reason: `Model ${model?.name || model?.id || 'unknown'} requires payment, but current policy is Free Only ($0.00 cap).`
        };
      }
      return {
        allowed: true,
        reservationId: `free_res_${randomUUID()}`,
        amountUsd: 0.0,
        estimatedTokens: estimatedInputTokens + maxOutputTokens
      };
    }

    // 2. Free model under other policies incurs 0 spend
    if (model && model.tier === 'free') {
      return {
        allowed: true,
        reservationId: `free_res_${randomUUID()}`,
        amountUsd: 0.0,
        estimatedTokens: estimatedInputTokens + maxOutputTokens
      };
    }

    // 3. Paid Model Check under Free Preferred / Paid Allowed
    const wf = this._getWorkflowRecord(workflowId);
    if (wf.isPaused) {
      return {
        allowed: false,
        code: 'workflow_paused_budget',
        reason: 'Workflow is paused pending budget approval.'
      };
    }

    const estimatedCostUsd = estimateCost(model, estimatedInputTokens, maxOutputTokens);
    const taskSpend = this._getTaskSpend(taskId);

    // Calculate active workflow reservations:
    let wfReservations = 0.0;
    for (const r of wf.activeReservations.values()) wfReservations += r.amountUsd;

    // Check Task Budget Limit:
    if (this.limits.perTaskBudgetUsd > 0 && (taskSpend + estimatedCostUsd > this.limits.perTaskBudgetUsd)) {
      return {
        allowed: false,
        code: 'task_budget_exceeded',
        reason: `Estimated cost ($${estimatedCostUsd.toFixed(4)}) exceeds remaining per-task budget ($${Math.max(0, this.limits.perTaskBudgetUsd - taskSpend).toFixed(4)}).`,
        details: { limit: this.limits.perTaskBudgetUsd, currentSpend: taskSpend, estimatedCostUsd }
      };
    }

    // Check Workflow Budget Limit:
    const effectiveWorkflowLimit = wf.budgetLimitUsd || this.limits.perWorkflowBudgetUsd;
    if (effectiveWorkflowLimit > 0 && (wf.cumulativeSpendUsd + wfReservations + estimatedCostUsd > effectiveWorkflowLimit)) {
      wf.isPaused = true;
      this.pendingApprovals.set(workflowId, {
        workflowId,
        taskId,
        modelId: model.id,
        estimatedCostUsd,
        currentSpend: wf.cumulativeSpendUsd,
        limit: effectiveWorkflowLimit,
        createdAt: Date.now()
      });
      return {
        allowed: false,
        code: 'workflow_budget_exceeded',
        reason: `Estimated cost ($${estimatedCostUsd.toFixed(4)}) exceeds remaining workflow budget ($${Math.max(0, effectiveWorkflowLimit - wf.cumulativeSpendUsd - wfReservations).toFixed(4)}).`,
        details: { limit: effectiveWorkflowLimit, currentSpend: wf.cumulativeSpendUsd, estimatedCostUsd }
      };
    }

    // Check Monthly Spending Limit:
    const globalActiveReservations = this._getActiveReservationsTotal();
    if (this.limits.monthlySpendingLimitUsd > 0 &&
        (this.monthlyCumulativeSpendUsd + globalActiveReservations + estimatedCostUsd > this.limits.monthlySpendingLimitUsd)) {
      return {
        allowed: false,
        code: 'monthly_spending_limit_exceeded',
        reason: `Estimated cost ($${estimatedCostUsd.toFixed(4)}) would exceed monthly spending limit ($${this.limits.monthlySpendingLimitUsd.toFixed(2)}).`,
        details: { limit: this.limits.monthlySpendingLimitUsd, currentSpend: this.monthlyCumulativeSpendUsd, estimatedCostUsd }
      };
    }

    // Grant atomic reservation
    const reservationId = `res_${randomUUID()}`;
    wf.activeReservations.set(reservationId, {
      taskId,
      modelId: model.id,
      amountUsd: estimatedCostUsd,
      createdAt: Date.now()
    });

    return {
      allowed: true,
      reservationId,
      amountUsd: estimatedCostUsd,
      estimatedTokens: estimatedInputTokens + maxOutputTokens
    };
  }

  reconcile({
    workflowId = 'default-workflow',
    taskId = 'default-task',
    reservationId,
    model,
    usage = {}
  }) {
    const wf = this._getWorkflowRecord(workflowId);
    const reservation = wf.activeReservations.get(reservationId);
    wf.activeReservations.delete(reservationId);

    const actualCostUsd = calculateCost(model, usage);

    // Commit actual cost to spend counters
    wf.cumulativeSpendUsd = Math.round((wf.cumulativeSpendUsd + actualCostUsd) * 1e6) / 1e6;
    this.tasks.set(taskId, Math.round((this._getTaskSpend(taskId) + actualCostUsd) * 1e6) / 1e6);
    this.monthlyCumulativeSpendUsd = Math.round((this.monthlyCumulativeSpendUsd + actualCostUsd) * 1e6) / 1e6;

    this.save();

    return {
      actualCostUsd,
      reservationReleasedUsd: reservation ? reservation.amountUsd : 0.0,
      deltaUsd: Math.round(((reservation ? reservation.amountUsd : 0.0) - actualCostUsd) * 1e6) / 1e6
    };
  }

  release({ workflowId = 'default-workflow', reservationId }) {
    const wf = this._getWorkflowRecord(workflowId);
    const reservation = wf.activeReservations.get(reservationId);
    wf.activeReservations.delete(reservationId);
    return { released: !!reservation, amountUsd: reservation ? reservation.amountUsd : 0.0 };
  }

  approveBudgetIncrease(workflowId, additionalAmountUsd) {
    const wf = this._getWorkflowRecord(workflowId);
    const increase = Math.max(0, Number(additionalAmountUsd) || 0);
    wf.budgetLimitUsd = Math.round((wf.budgetLimitUsd + increase) * 1e6) / 1e6;
    wf.isPaused = false;
    this.pendingApprovals.delete(workflowId);
    return {
      approved: true,
      newWorkflowLimitUsd: wf.budgetLimitUsd,
      isPaused: false
    };
  }

  getStatus(workflowId = 'default-workflow') {
    const wf = this._getWorkflowRecord(workflowId);
    let wfReservations = 0.0;
    for (const r of wf.activeReservations.values()) wfReservations += r.amountUsd;

    const globalActiveReservations = this._getActiveReservationsTotal();
    const effectiveWfLimit = wf.budgetLimitUsd || this.limits.perWorkflowBudgetUsd;

    return {
      policy: this.policy,
      limits: { ...this.limits },
      monthlyCumulativeSpendUsd: this.monthlyCumulativeSpendUsd,
      globalActiveReservationsUsd: Math.round(globalActiveReservations * 1e6) / 1e6,
      remainingMonthlyBudgetUsd: this.limits.monthlySpendingLimitUsd > 0
        ? Math.max(0, Math.round((this.limits.monthlySpendingLimitUsd - this.monthlyCumulativeSpendUsd - globalActiveReservations) * 1e6) / 1e6)
        : null,
      workflow: {
        id: workflowId,
        cumulativeSpendUsd: wf.cumulativeSpendUsd,
        activeReservationsUsd: Math.round(wfReservations * 1e6) / 1e6,
        budgetLimitUsd: effectiveWfLimit,
        remainingBudgetUsd: effectiveWfLimit > 0
          ? Math.max(0, Math.round((effectiveWfLimit - wf.cumulativeSpendUsd - wfReservations) * 1e6) / 1e6)
          : null,
        isPaused: wf.isPaused,
        pendingApproval: this.pendingApprovals.get(workflowId) || null
      }
    };
  }
}

// Global default ledger instance
let defaultLedger = null;
export function getBudgetLedger() {
  if (!defaultLedger) {
    defaultLedger = new BudgetLedger();
  }
  return defaultLedger;
}
