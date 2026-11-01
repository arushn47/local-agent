import { existsSync, readdirSync, realpathSync } from 'node:fs';
import { flattenSteps, validatePlan } from './planner.mjs';
import { assertWorkflowId, stateDirectory, writeState, readState } from './workflow-storage.mjs';
import { ConflictMatrix } from './conflict-matrix.mjs';
import { RepeatLoopEngine, LOOP_STATUS } from './repeat-loop.mjs';
import { createCheckpoint, restoreCheckpoint, getCheckpoint, authorizeCheckpointRestore } from './checkpoints.mjs';
import { buildRolePrompt, workflowToolMask } from './roles.mjs';
import { validateModelAssignment, getModel } from './models.mjs';
import { acquireExecution, executionOwner, ownerProcessAlive, releaseExecution, safeParallelBatches } from './workflow-coordination.mjs';

const executions = new Map();
const executionKey = (dir,id) => `${realpathSync(dir).toLowerCase()}:${id}`;

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
  executions.get(executionKey(workspaceDir,workflowId))?.abort();
  return { success: true, workflowId, status: wf.status };
}

export function resumeWorkflow(workflowId, workspaceDir) {
  const wf = loadWorkflow(workflowId, workspaceDir);
  if (!wf) throw new Error(`workflow_not_found: ${workflowId}`);
  if (wf.status !== WORKFLOW_STATUS.PAUSED) {
    throw new Error(`workflow_not_paused: ${wf.status}`);
  }
  if (wf.requiresReplan) throw Error('invalid_workflow_replan_required');
  if (executions.has(executionKey(workspaceDir,workflowId))) throw Error('workflow_runner_still_stopping');
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
  executions.get(executionKey(workspaceDir,workflowId))?.abort();
  return { success: true, workflowId, status: wf.status, reason };
}

export function retryStep(workflowId, stepId, { alternateModelId = null, workspaceDir }) {
  const wf = loadWorkflow(workflowId, workspaceDir);
  if (!wf) throw new Error(`workflow_not_found: ${workflowId}`);
  const step = wf.stepStates[stepId];
  if (!step) throw new Error(`step_not_found: ${stepId}`);

  if (step.status !== STEP_STATUS.FAILED) throw Error('workflow_retry_requires_failed_step');
  if(step.sessionID||step.dispatchState==='dispatched')throw Error('workflow_retry_requires_reconciliation');
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
  if(executionOwner(workspaceDir))throw Error('invalid_checkpoint_active_workflow');
  const release=acquireExecution(workspaceDir,workflowId);
  try {
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
  } finally {release();}
}

export async function recoverWorkflow({workflowId,workspaceDir,tasks}) {
  const wf=loadWorkflow(workflowId,workspaceDir);if(!wf)throw Error('workflow_not_found');
  if(executions.has(executionKey(workspaceDir,workflowId)))throw Error('workflow_runner_already_active');
  const owner=executionOwner(workspaceDir);
  if(owner&&(owner.workflowId!==workflowId||(owner.pid!==process.pid&&ownerProcessAlive(owner))))throw Error('workflow_execution_owner_active');
  for(const step of Object.values(wf.stepStates)){
    if(step.sessionID && step.status!==STEP_STATUS.COMPLETED){
      if(!tasks?.workflowRecover)throw Error('workflow_recovery_supervisor_required');
      await tasks.workflowRecover(step.sessionID);
      step.status=STEP_STATUS.FAILED;step.error='workflow_interrupted_requires_review';step.dispatchState='interrupted';
    }
  }
  wf.requiresReplan=true;wf.status=WORKFLOW_STATUS.PAUSED;
  wf.recovery={at:new Date().toISOString(),replayed:false};saveWorkflow(wf,workspaceDir);
  if(owner)releaseExecution(workspaceDir,owner.token);
  return {status:wf.status,workflowId,replayed:false,requiresReplan:true};
}


export async function executeStep({
  workflowId,
  stepId,
  workspaceDir,
  engine = null,
  projectId = null,
  signal = null,
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
  if(step.sessionID||step.status===STEP_STATUS.RUNNING)throw Error('workflow_attempt_requires_recovery');

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
  let ownedSession=null;

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
    } else if (tasks?.workflowStart && tasks?.workflowObserve && projectId) {
      if (!step.assignedModel) throw Error('workflow_exact_model_required');
      if(!engine?.resolveWorkflowModel)throw Error('workflow_model_registry_unavailable');
      const model = engine.resolveWorkflowModel(step.assignedModel);
      const sessionID = await tasks.workflowStart({
        projectId, workflowId, stepId, attemptId: `${workflowId}-${stepId}-${step.attempts}`,
        model, agent: `localagent-${step.agent}`, tools: workflowToolMask(step.agent), text: promptText, signal,
        beforeDispatch: async sessionID => {
          const current = loadWorkflow(workflowId, workspaceDir);
          if (current.status !== WORKFLOW_STATUS.RUNNING) throw Error('workflow_execution_interrupted');
          current.stepStates[stepId].sessionID = sessionID;
          current.stepStates[stepId].dispatchState = 'dispatched';
          saveWorkflow(current, workspaceDir);
          ownedSession=sessionID;
          await engine.bindWorkflowSession?.({sessionID,workspaceDir,workflowId,stepId,attemptId:`${workflowId}-${stepId}-${step.attempts}`,qualifiedModel:step.assignedModel,modelAlias:model.modelID,limits:wf.plan.budget});
        }
      });
      let observed;
      const started = Date.now();
      do {
        if (signal?.aborted) { await tasks.cancel(sessionID); throw Error('workflow_execution_interrupted'); }
        observed = await tasks.workflowObserve(sessionID);
        if (observed.state !== 'running') break;
        await new Promise(r => setTimeout(r, pollIntervalMs));
      } while (Date.now() - started < Math.min(executionTimeoutMs, 120000));
      if (observed?.state !== 'completed') {
        await tasks.cancel(sessionID);
        throw Error(observed?.state === 'running' ? 'workflow_execution_timeout' : `workflow_${observed?.state || 'observation_failed'}`);
      }
      executionOutput = observed.messages.flatMap(m=>m.parts).filter(p=>p.type==='text').map(p=>p.text).join('\n').slice(-16000);
      modifiedFiles = observed.modifiedFiles;
      if (observed.tools.some(t=>t.status!=='completed')) throw Error('workflow_tool_failed');
      if (step.agent === 'tester') {
        const expected = planStep.testCommand;
        const results = observed.tools.filter(t=>t.tool==='bash');
        if (!expected || !results.length || !results.some(t=>t.command===expected)) throw Error('workflow_tests_unverified');
        testPassed = results.every(t=>t.status==='completed' && t.exit===0);
      }
      // Human review approval is intentionally not derived from a model reply.
      if (step.agent === 'reviewer') throw Error('workflow_review_required');
    } else {
      throw Error('workflow_executor_unavailable');
    }
  } catch (err) {
    executionError = err;
  } finally {
    if(ownedSession){try{await engine?.releaseWorkflowSession?.(ownedSession);}catch{executionError ||= Error('workflow_scope_close_failed');}}
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
    latestStep.error = /^workflow_[a-z_]+$/.test(executionError.message) ? executionError.message : 'workflow_execution_failed';
    latestStep.completedAt = Date.now();
    latestStep.durationMs = latestStep.completedAt - latestStep.startedAt;
    latestStep.output = executionOutput;
    latestStep.testPassed = testPassed;
    latestStep.reviewerApproved = reviewerApproved;
    if (latestStep.error === 'workflow_review_required') latestWf.status = WORKFLOW_STATUS.PAUSED;
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
  latestStep.evidenceSource = runner ? 'custom_runner' : 'supervised_opencode_session';

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

export async function runWorkflow(options) {
  const key=executionKey(options.workspaceDir,options.workflowId);
  if(executions.has(key))throw Error('workflow_runner_already_active');
  const release=acquireExecution(options.workspaceDir,options.workflowId);
  const controller=new AbortController();
  const forward=()=>controller.abort();options.signal?.addEventListener('abort',forward,{once:true});
  if(options.signal?.aborted)controller.abort();
  executions.set(key,controller);
  try{return await runWorkflowBody({...options,signal:controller.signal});}
  finally{
    executions.delete(key);options.signal?.removeEventListener('abort',forward);
    if(!options.tasks?.workflowQuiescent||options.tasks.workflowQuiescent(options.workflowId))release();
  }
}

async function runWorkflowBody({
  workflowId,
  workspaceDir,
  engine = null,
  projectId = null,
  signal = null,
  tasks = null,
  budgetLedger = null,
  catalog = null,
  conflictMatrix = null,
  runner = null
}) {
  let wf = loadWorkflow(workflowId, workspaceDir);
  if (!wf) throw new Error(`workflow_not_found: ${workflowId}`);
  if (wf.requiresReplan) throw Error('invalid_workflow_replan_required');
  if(wf.status===WORKFLOW_STATUS.COMPLETED)return {status:wf.status,workflowId};
  if(wf.status===WORKFLOW_STATUS.CANCELLED)throw Error('workflow_terminal_cancelled');

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
          projectId,
          signal,
          tasks,
          budgetLedger,
          catalog,
          conflictMatrix: cm,
          runner
        });

        const control = loadWorkflow(workflowId, workspaceDir);
        if (['paused','cancelled'].includes(control.status)) return {status:control.status,workflowId};
        if (res.status === STEP_STATUS.FAILED) {
          wf = loadWorkflow(workflowId, workspaceDir);
          wf.status = WORKFLOW_STATUS.FAILED;
          wf.cancellationReason = `Step "${stage.title}" failed: ${res.error}`;
          saveWorkflow(wf, workspaceDir);
          return { status: WORKFLOW_STATUS.FAILED, failedStepId: stepId, error: res.error };
        }
      } else if (stage.type === 'parallel') {
        const steps = stage.steps || [];
        const waves = safeParallelBatches(steps,cm);

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
              projectId,
              signal,
              tasks,
              budgetLedger,
              catalog,
              conflictMatrix: cm,
              runner
            }))
          );

          const control = loadWorkflow(workflowId, workspaceDir);
          if (['paused','cancelled'].includes(control.status)) return {status:control.status,workflowId};
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
        const durable=loadWorkflow(workflowId,workspaceDir);
        durable.loopStates ||= {};
        if(durable.loopStates[stage.id]?.status==='succeeded')continue;
        if(durable.loopStates[stage.id]?.status==='running')throw Error('workflow_loop_requires_recovery');
        const repeatLoop = new RepeatLoopEngine({
          stageId: stage.id,
          title: stage.title,
          steps: stage.steps,
          maxIterations: stage.maxIterations || 3,
          exitCondition: stage.exitCondition || 'tests_passed && reviewer_approved'
        });
        repeatLoop.currentIteration=durable.loopStates[stage.id]?.iteration||0;

        let loopCompleted = false;
        let currentHandoff = null;

        while (!loopCompleted) {
          wf = loadWorkflow(workflowId, workspaceDir);
          if (wf.status === WORKFLOW_STATUS.PAUSED || wf.status === WORKFLOW_STATUS.CANCELLED) {
            return { status: wf.status, workflowId };
          }

          repeatLoop.startIteration();
          wf.loopStates ||= {};
          wf.loopStates[stage.id]={status:'running',iteration:repeatLoop.currentIteration};

          // Reset iteration steps to pending for re-run if iterating
          for (const s of stage.steps || []) {
            const stepState = wf.stepStates[s.id];
            if (stepState) {
              if(stepState.sessionID)throw Error('workflow_loop_requires_review_before_new_attempt');
              stepState.previousAttempts ||= [];
              if(stepState.attempts)stepState.previousAttempts.push({status:stepState.status,attempt:stepState.attempts,testPassed:stepState.testPassed,error:stepState.error});
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
              projectId,
              signal,
              tasks,
              budgetLedger,
              catalog,
              conflictMatrix: cm,
              runner,
              handoffContext: currentHandoff
            });

            const control = loadWorkflow(workflowId, workspaceDir);
            if (['paused','cancelled'].includes(control.status)) return {status:control.status,workflowId};
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
          const loopWf=loadWorkflow(workflowId,workspaceDir);
          loopWf.loopStates ||= {};
          loopWf.loopStates[stage.id]={status:outcome.succeeded?'succeeded':outcome.exhausted?'exhausted':'pending',iteration:repeatLoop.currentIteration};
          saveWorkflow(loopWf,workspaceDir);
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
    if (wf && !['cancelled','paused'].includes(wf.status)) {
      wf.status = WORKFLOW_STATUS.FAILED;
      wf.cancellationReason = err.message || String(err);
      saveWorkflow(wf, workspaceDir);
    }
    throw err;
  }
}
