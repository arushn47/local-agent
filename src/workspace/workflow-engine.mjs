import { existsSync, readdirSync } from 'node:fs';
import { flattenSteps, validatePlan } from './planner.mjs';
import { assertWorkflowId, stateDirectory, writeState, readState } from './workflow-storage.mjs';
import { ConflictMatrix } from './conflict-matrix.mjs';
import { RepeatLoopEngine, LOOP_STATUS } from './repeat-loop.mjs';
import { createCheckpoint, restoreCheckpoint, getCheckpoint, authorizeCheckpointRestore } from './checkpoints.mjs';
import { buildRolePrompt } from './roles.mjs';
import { validateModelAssignment, getModel } from './models.mjs';

export const WORKFLOW_STATUS = Object.freeze({
  PENDING: 'pending',
  RUNNING: 'running',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled'
});

export const STEP_STATUS = Object.freeze({
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  SKIPPED: 'skipped'
});

export function getWorkflowsDirectory(workspaceDir) {
  return stateDirectory(workspaceDir, 'workflows');
}

export function createWorkflowInstance({ plan, workspaceDir }) {
  if (!workspaceDir) throw new Error('workspaceDir_required');
  if (!plan?.id) throw new Error('plan_must_have_id');
  const validation = validatePlan(plan);
  if (!validation.valid) throw Error(`invalid_workflow_plan: ${validation.errors.join(', ')}`);

  const flatSteps = flattenSteps(plan);
  const stepStates = {};

  for (const step of flatSteps) {
    stepStates[step.id] = {
      id: step.id,
      title: step.title || step.id,
      agent: step.agent || 'implementer',
      path: step.path || '',
      status: STEP_STATUS.PENDING,
      attempts: 0,
      assignedModel: step.assignedModel || null,
      fallbackChain: Array.isArray(step.fallbackChain) ? step.fallbackChain : [],
      targetFiles: Array.isArray(step.targetFiles) ? step.targetFiles : [],
      readFiles: Array.isArray(step.readFiles) ? step.readFiles : [],
      startedAt: null,
      completedAt: null,
      durationMs: 0,
      output: null,
      error: null
    };
  }

  const instance = {
    id: plan.id,
    title: plan.title,
    mode: plan.mode || 'team',
    policy: plan.policy || 'free_only',
    status: WORKFLOW_STATUS.PENDING,
    plan,
    stepStates,
    checkpoints: [],
    currentStageIndex: 0,
    startedAt: null,
    completedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  writeState(workspaceDir, 'workflows', instance.id, instance, { createOnly: true });
  return instance;
}

export function saveWorkflow(workflow, workspaceDir) {
  if (!workspaceDir) throw new Error('workspaceDir_required');
  assertWorkflowId(workflow.id);
  workflow.updatedAt = new Date().toISOString();
  writeState(workspaceDir, 'workflows', workflow.id, workflow);
}

export function loadWorkflow(workflowId, workspaceDir) {
  if (!workspaceDir || !workflowId) return null;
  assertWorkflowId(workflowId);
  try {
    const wf = readState(workspaceDir, 'workflows', workflowId);
    if (!wf) return null;
    if (wf.id !== workflowId || !validatePlan(wf.plan).valid || !wf.stepStates) throw Error('invalid_workflow_state');
    const steps = flattenSteps(wf.plan);
    if (Object.keys(wf.stepStates).length !== steps.length || steps.some(s => !Object.hasOwn(wf.stepStates, s.id))) throw Error('invalid_workflow_state');
    return wf;
  } catch {
    return null;
  }
}

export function listWorkflows(workspaceDir) {
  if (!workspaceDir) return [];
  const dir = getWorkflowsDirectory(workspaceDir);
  if (!existsSync(dir)) return [];

  const results = [];
  try {
    const files = readdirSync(dir);
    for (const f of files) {
      if (!f.endsWith('.json')) continue;
      try {
        const wf = loadWorkflow(f.slice(0, -5), workspaceDir);
        if (!wf) continue;
        if (wf.id && wf.plan) {
          const flat = Object.values(wf.stepStates || {});
          const totalSteps = flat.length;
          const completedSteps = flat.filter(s => s.status === STEP_STATUS.COMPLETED).length;
          const failedSteps = flat.filter(s => s.status === STEP_STATUS.FAILED).length;
          results.push({
            id: wf.id,
            title: wf.title,
            mode: wf.mode,
            policy: wf.policy,
            status: wf.status,
            totalSteps,
            completedSteps,
            failedSteps,
            createdAt: wf.createdAt,
            updatedAt: wf.updatedAt
          });
        }
      } catch {}
    }
  } catch {}

  return results.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}

export function pauseWorkflow(workflowId, workspaceDir) {
  const wf = loadWorkflow(workflowId, workspaceDir);
  if (!wf) throw new Error(`workflow_not_found: ${workflowId}`);
  if (wf.status === WORKFLOW_STATUS.COMPLETED || wf.status === WORKFLOW_STATUS.CANCELLED) {
    throw new Error(`cannot_pause_terminal_workflow: ${wf.status}`);
  }
  wf.status = WORKFLOW_STATUS.PAUSED;
  saveWorkflow(wf, workspaceDir);
  return { success: true, workflowId, status: wf.status };
}

export function resumeWorkflow(workflowId, workspaceDir) {
  const wf = loadWorkflow(workflowId, workspaceDir);
  if (!wf) throw new Error(`workflow_not_found: ${workflowId}`);
  if (wf.status !== WORKFLOW_STATUS.PAUSED) {
    throw new Error(`workflow_not_paused: ${wf.status}`);
  }
  if (wf.requiresReplan) throw Error('invalid_workflow_replan_required');
  wf.status = WORKFLOW_STATUS.RUNNING;
  saveWorkflow(wf, workspaceDir);
  return { success: true, workflowId, status: wf.status };
}

export function cancelWorkflow(workflowId, workspaceDir, reason = 'user_cancelled') {
  const wf = loadWorkflow(workflowId, workspaceDir);
  if (!wf) throw new Error(`workflow_not_found: ${workflowId}`);
  wf.status = WORKFLOW_STATUS.CANCELLED;
  wf.completedAt = new Date().toISOString();
  wf.cancellationReason = reason;
  saveWorkflow(wf, workspaceDir);
  return { success: true, workflowId, status: wf.status, reason };
}

export function retryStep(workflowId, stepId, { alternateModelId = null, workspaceDir }) {
  const wf = loadWorkflow(workflowId, workspaceDir);
  if (!wf) throw new Error(`workflow_not_found: ${workflowId}`);
  const step = wf.stepStates[stepId];
  if (!step) throw new Error(`step_not_found: ${stepId}`);

  if (step.status !== STEP_STATUS.FAILED) throw Error('workflow_retry_requires_failed_step');
  step.status = STEP_STATUS.PENDING;
  step.error = null;
  if (alternateModelId) {
    step.assignedModel = alternateModelId;
  }
  if (wf.status === WORKFLOW_STATUS.FAILED) {
    wf.status = WORKFLOW_STATUS.RUNNING;
  }
  saveWorkflow(wf, workspaceDir);
  return { success: true, workflowId, stepId, assignedModel: step.assignedModel, status: step.status };
}

export function rollbackToCheckpoint(workflowId, checkpointId, workspaceDir, approval) {
  const wf = loadWorkflow(workflowId, workspaceDir);
  if (!wf) throw new Error(`workflow_not_found: ${workflowId}`);
  if (wf.status === WORKFLOW_STATUS.RUNNING || Object.values(wf.stepStates).some(s => s.status === STEP_STATUS.RUNNING)) throw Error('invalid_checkpoint_active_workflow');
  const chk = getCheckpoint({ workspaceDir, checkpointId });
  if (!chk || chk.workflowId !== workflowId) throw Error('invalid_checkpoint_owner');

  authorizeCheckpointRestore({ workspaceDir, checkpointId, workflowId, approval });
  // Restoration invalidates prior completion evidence. Preserve the historical
  // outcomes, but require a new reviewed plan instead of silently replaying it.
  wf.requiresReplan = true;
  wf.restoration = { checkpointId, restoredAt: new Date().toISOString() };
  wf.status = WORKFLOW_STATUS.PAUSED;
  saveWorkflow(wf, workspaceDir);
  // Persist invalidation before file writes: a crash cannot retain a completed
  // workflow whose files were partly restored.
  const restoreRes = restoreCheckpoint({ workspaceDir, checkpointId, workflowId, approval });

  return {
    success: true,
    workflowId,
    checkpointId,
    restoredFiles: restoreRes.restoredFiles,
    removedFiles: restoreRes.removedFiles
  };
}


export async function executeStep({
  workflowId,
  stepId,
  workspaceDir,
  engine = null,
  tasks = null,
  budgetLedger = null,
  catalog = null,
  conflictMatrix = null,
  runner = null,
  handoffContext = null,
  executionTimeoutMs = 120000,
  pollIntervalMs = 1000
}) {
  const wf = loadWorkflow(workflowId, workspaceDir);
  if (!wf) throw new Error(`workflow_not_found: ${workflowId}`);
  const step = wf.stepStates[stepId];
  if (!step) throw new Error(`step_not_found: ${stepId}`);

  // Never replay already completed side effects!
  if (step.status === STEP_STATUS.COMPLETED) {
    return {
      status: STEP_STATUS.COMPLETED,
      output: step.output,
      replayed: false,
      alreadyCompleted: true
    };
  }

  // Check dependencies: ensure all predecessor steps in dependsOn are completed
  const flat = flattenSteps(wf.plan);
  const planStep = flat.find(s => s.id === stepId);
  const dependsOn = planStep?.dependsOn || [];
  for (const depId of dependsOn) {
    const depState = wf.stepStates[depId];
    if (depState && depState.status !== STEP_STATUS.COMPLETED) {
      return {
        status: STEP_STATUS.PENDING,
        blocked: true,
        reason: `waiting_for_dependency: ${depId}`
      };
    }
  }

  // Acquire file-locks via ConflictMatrix to guarantee safe isolation
  const cm = conflictMatrix || new ConflictMatrix(workspaceDir);
  const lockAcquired = cm.canAcquire(stepId, {
    writeFiles: step.targetFiles,
    readFiles: step.readFiles
  });

  if (!lockAcquired.allowed) {
    return {
      status: STEP_STATUS.PENDING,
      blocked: true,
      reason: `file_lock_conflict: ${lockAcquired.conflictType} on "${lockAcquired.file}" held by "${lockAcquired.conflictWithTaskId}"`
    };
  }

  cm.acquireLocks(stepId, {
    writeFiles: step.targetFiles,
    readFiles: step.readFiles
  });

  // Take an automatic safety checkpoint snapshot of target files before any writes
  let checkpoint = null;
  if (step.targetFiles && step.targetFiles.length > 0) {
    try {
      checkpoint = createCheckpoint({
        workspaceDir,
        workflowId,
        stageId: stepId,
        targetFiles: step.targetFiles,
        description: `Pre-execution snapshot for ${step.title}`
      });
      if (checkpoint?.checkpointId) {
        wf.checkpoints = wf.checkpoints || [];
        wf.checkpoints.push(checkpoint.checkpointId);
      }
    } catch (error) {
      cm.releaseLocks(stepId);
      throw error;
    }
  }

  // Transition state to RUNNING
  step.status = STEP_STATUS.RUNNING;
  step.startedAt = Date.now();
  step.attempts += 1;
  saveWorkflow(wf, workspaceDir);

  const promptText = buildRolePrompt({
    roleId: step.agent,
    stepTitle: step.title,
    taskPrompt: planStep?.prompt || step.title,
    targetFiles: step.targetFiles,
    acceptanceCriteria: planStep?.acceptanceCriteria || [],
    handoffContext
  });

  let executionError = null;
  let executionOutput = '';
  let testPassed = null;
  let reviewerApproved = null;
  let modifiedFiles = [];

  try {
    if (typeof runner === 'function') {
      // Custom or test runner
      const res = await runner({
        step,
        workflow: wf,
        promptText,
        checkpoint,
        workspaceDir
      });
      if (res?.verified !== true) throw Error('workflow_runner_outcome_unverified');
      executionOutput = res.output || '';
      testPassed = res.testPassed ?? null;
      reviewerApproved = res.reviewerApproved ?? null;
      modifiedFiles = res.modifiedFiles || [];
    } else if (engine) {
      // Genuine OpenCode invocation!
      const client = engine.forProject(workspaceDir);
      const sessionData = (await client.session.create({ title: `[${step.agent}] ${step.title}` })).data;
      const sessionID = sessionData.id;
      if (!sessionID) throw Error('workflow_session_creation_failed');
      const assignedModel = step.assignedModel || 'localagent/coding';

      await client.session.promptAsync({
        sessionID,
        agent: step.agent,
        model: {
          providerID: 'omniroute',
          modelID: assignedModel
        },
        parts: [{ type: 'text', text: promptText }]
      });

      // Bounded poll for completion
      let completed = false;
      const startPoll = Date.now();
      try {
      while (!completed && (Date.now() - startPoll < Math.min(executionTimeoutMs, 120000))) {
        await new Promise(r => setTimeout(r, pollIntervalMs));
        const control = loadWorkflow(workflowId, workspaceDir);
        if (control.status !== WORKFLOW_STATUS.RUNNING && control.status !== WORKFLOW_STATUS.PENDING) throw Error('workflow_execution_interrupted');
        const statusRes = (await client.session.status()).data;
        const msgRes = (await client.session.messages({ sessionID, limit: 100 })).data;
        if (!statusRes || !Array.isArray(msgRes)) throw Error('workflow_observation_unavailable');

        const lastMsg = msgRes.filter(m => m.info?.role === 'assistant').at(-1);
        if (lastMsg?.info?.error) throw Error('workflow_provider_error');
        if (!['busy', 'retry'].includes(statusRes[sessionID]?.type) && lastMsg?.info?.time?.completed && lastMsg.info.finish === 'stop') {
          completed = true;
          executionOutput = lastMsg.parts?.filter(p => p.type === 'text').map(p => p.text).join('\n') || '';
        }
      }
      if (!completed) throw Error('workflow_execution_timeout');
      } catch (error) {
        await client.session.abort({ sessionID }).catch(() => {});
        throw error;
      }

      try {
        const diffRes = (await client.session.diff({ sessionID })).data || [];
        modifiedFiles = diffRes.map(d => d.file);
      } catch {}

      // Text is not a test result or review approval. Lifecycle integration
      // must supply independently verifiable outcomes before these roles pass.
      if (step.agent === 'tester' || step.agent === 'reviewer') throw Error('workflow_verification_unavailable');
    } else {
      throw Error('workflow_executor_unavailable');
    }
  } catch (err) {
    executionError = err;
  } finally {
    // Release file-locks immediately
    cm.releaseLocks(stepId);
  }
  if (!executionError && step.agent === 'tester' && testPassed !== true) executionError = Error(testPassed === false ? 'workflow_tests_failed' : 'workflow_tests_unverified');
  if (!executionError && step.agent === 'reviewer' && reviewerApproved !== true) executionError = Error(reviewerApproved === false ? 'workflow_review_rejected' : 'workflow_review_unverified');

  // Reload latest workflow to prevent state overwrite
  const latestWf = loadWorkflow(workflowId, workspaceDir);
  const latestStep = latestWf.stepStates[stepId];

  if (executionError) {
    latestStep.status = STEP_STATUS.FAILED;
    latestStep.error = executionError.message || String(executionError);
    latestStep.completedAt = Date.now();
    latestStep.durationMs = latestStep.completedAt - latestStep.startedAt;
    latestStep.output = executionOutput;
    latestStep.testPassed = testPassed;
    latestStep.reviewerApproved = reviewerApproved;
    saveWorkflow(latestWf, workspaceDir);
    return {
      status: STEP_STATUS.FAILED,
      error: latestStep.error,
      output: executionOutput,
      testPassed,
      reviewerApproved,
      modifiedFiles,
      stepId
    };
  }

  latestStep.status = STEP_STATUS.COMPLETED;
  latestStep.output = executionOutput;
  latestStep.completedAt = Date.now();
  latestStep.durationMs = latestStep.completedAt - latestStep.startedAt;
  latestStep.testPassed = testPassed;
  latestStep.reviewerApproved = reviewerApproved;
  latestStep.modifiedFiles = modifiedFiles;
  latestStep.evidenceSource = runner ? 'custom_runner' : 'opencode_session';

  saveWorkflow(latestWf, workspaceDir);

  return {
    status: STEP_STATUS.COMPLETED,
    stepId,
    output: executionOutput,
    durationMs: latestStep.durationMs,
    testPassed,
    reviewerApproved,
    modifiedFiles
  };
}

export async function runWorkflow({
  workflowId,
  workspaceDir,
  engine = null,
  tasks = null,
  budgetLedger = null,
  catalog = null,
  conflictMatrix = null,
  runner = null
}) {
  let wf = loadWorkflow(workflowId, workspaceDir);
  if (!wf) throw new Error(`workflow_not_found: ${workflowId}`);
  if (wf.requiresReplan) throw Error('invalid_workflow_replan_required');

  wf.status = WORKFLOW_STATUS.RUNNING;
  if (!wf.startedAt) wf.startedAt = new Date().toISOString();
  saveWorkflow(wf, workspaceDir);

  const cm = conflictMatrix || new ConflictMatrix(workspaceDir);

  try {
    for (const stage of wf.plan.stages || []) {
      // Check pause or cancel status before every stage
      wf = loadWorkflow(workflowId, workspaceDir);
      if (wf.status === WORKFLOW_STATUS.PAUSED || wf.status === WORKFLOW_STATUS.CANCELLED) {
        return { status: wf.status, workflowId };
      }

      if (stage.type === 'task' || stage.agent) {
        const stepId = stage.id;
        const res = await executeStep({
          workflowId,
          stepId,
          workspaceDir,
          engine,
          tasks,
          budgetLedger,
          catalog,
          conflictMatrix: cm,
          runner
        });

        if (res.status === STEP_STATUS.FAILED) {
          wf = loadWorkflow(workflowId, workspaceDir);
          wf.status = WORKFLOW_STATUS.FAILED;
          wf.cancellationReason = `Step "${stage.title}" failed: ${res.error}`;
          saveWorkflow(wf, workspaceDir);
          return { status: WORKFLOW_STATUS.FAILED, failedStepId: stepId, error: res.error };
        }
      } else if (stage.type === 'parallel') {
        const steps = stage.steps || [];
        const waves = cm.scheduleParallelBatches(steps);

        for (const wave of waves) {
          wf = loadWorkflow(workflowId, workspaceDir);
          if (wf.status === WORKFLOW_STATUS.PAUSED || wf.status === WORKFLOW_STATUS.CANCELLED) {
            return { status: wf.status, workflowId };
          }

          const results = await Promise.all(
            wave.map(s => executeStep({
              workflowId,
              stepId: s.id,
              workspaceDir,
              engine,
              tasks,
              budgetLedger,
              catalog,
              conflictMatrix: cm,
              runner
            }))
          );

          const failed = results.find(r => r.status === STEP_STATUS.FAILED);
          if (failed) {
            wf = loadWorkflow(workflowId, workspaceDir);
            wf.status = WORKFLOW_STATUS.FAILED;
            wf.cancellationReason = `Parallel step failed: ${failed.error}`;
            saveWorkflow(wf, workspaceDir);
            return { status: WORKFLOW_STATUS.FAILED, failedStepId: failed.stepId, error: failed.error };
          }
        }
      } else if (stage.type === 'repeat') {
        const repeatLoop = new RepeatLoopEngine({
          stageId: stage.id,
          title: stage.title,
          steps: stage.steps,
          maxIterations: stage.maxIterations || 3,
          exitCondition: stage.exitCondition || 'tests_passed && reviewer_approved'
        });

        let loopCompleted = false;
        let currentHandoff = null;

        while (!loopCompleted) {
          wf = loadWorkflow(workflowId, workspaceDir);
          if (wf.status === WORKFLOW_STATUS.PAUSED || wf.status === WORKFLOW_STATUS.CANCELLED) {
            return { status: wf.status, workflowId };
          }

          repeatLoop.startIteration();

          // Reset iteration steps to pending for re-run if iterating
          for (const s of stage.steps || []) {
            const stepState = wf.stepStates[s.id];
            if (stepState) {
              stepState.status = STEP_STATUS.PENDING;
              stepState.error = null;
            }
          }
          saveWorkflow(wf, workspaceDir);

          for (const s of stage.steps || []) {
            const res = await executeStep({
              workflowId,
              stepId: s.id,
              workspaceDir,
              engine,
              tasks,
              budgetLedger,
              catalog,
              conflictMatrix: cm,
              runner,
              handoffContext: currentHandoff
            });

            repeatLoop.recordStepOutcome(s.id, {
              output: res.output,
              error: res.error,
              testPassed: res.testPassed,
              reviewerApproved: res.reviewerApproved,
              modifiedFiles: res.modifiedFiles
            });

            if (res.status === STEP_STATUS.FAILED && !s.id.includes('test') && !s.id.includes('review')) {
              // Critical non-test failure
              wf = loadWorkflow(workflowId, workspaceDir);
              wf.status = WORKFLOW_STATUS.FAILED;
              wf.cancellationReason = `Repeat cycle critical error in ${s.id}: ${res.error}`;
              saveWorkflow(wf, workspaceDir);
              return { status: WORKFLOW_STATUS.FAILED, failedStepId: s.id, error: res.error };
            }
          }

          const outcome = repeatLoop.completeIteration();
          if (outcome.succeeded) {
            loopCompleted = true;
          } else if (outcome.exhausted) {
            loopCompleted = true;
            wf = loadWorkflow(workflowId, workspaceDir);
            wf.status = WORKFLOW_STATUS.FAILED;
            wf.cancellationReason = `Repeat cycle exhausted after ${stage.maxIterations || 3} iterations: ${outcome.errorSummary}`;
            saveWorkflow(wf, workspaceDir);
            return { status: WORKFLOW_STATUS.FAILED, stageId: stage.id, reason: outcome.reason };
          } else {
            currentHandoff = outcome.handoffContext;
          }
        }
      }
    }

    wf = loadWorkflow(workflowId, workspaceDir);
    if (wf.status === WORKFLOW_STATUS.PAUSED || wf.status === WORKFLOW_STATUS.CANCELLED) return { status: wf.status, workflowId };
    if (Object.values(wf.stepStates).some(step => step.status !== STEP_STATUS.COMPLETED)) throw Error('workflow_incomplete_steps');
    if (Object.values(wf.stepStates).some(step => (step.agent === 'tester' && step.testPassed !== true) || (step.agent === 'reviewer' && step.reviewerApproved !== true))) throw Error('workflow_verification_unconfirmed');
    wf.status = WORKFLOW_STATUS.COMPLETED;
    wf.completedAt = new Date().toISOString();
    saveWorkflow(wf, workspaceDir);
    return { status: WORKFLOW_STATUS.COMPLETED, workflowId };
  } catch (err) {
    wf = loadWorkflow(workflowId, workspaceDir);
    if (wf) {
      wf.status = WORKFLOW_STATUS.FAILED;
      wf.cancellationReason = err.message || String(err);
      saveWorkflow(wf, workspaceDir);
    }
    throw err;
  }
}
