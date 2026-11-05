import { createSignal, For, Show } from 'solid-js';
import { api } from './api';

export function WorkflowTree(props) {
  const [collapsedNodes, setCollapsedNodes] = createSignal(new Set());
  const [actionError, setActionError] = createSignal('');

  const wf = () => props.workflow;
  const models = () => props.models || [];
  const checkpoints = () => props.checkpoints || [];
  const needsReview = () => Object.values(wf()?.stepStates || {}).some(step=>step.error==='workflow_review_required'&&step.reviewerApproved!==true);
  const stageStatus = (stage) => {
    if (stage.agent) return wf()?.stepStates?.[stage.id]?.status || 'pending';
    const states = (stage.steps || []).map(step => stageStatus(step));
    if (states.includes('failed')) return 'failed';
    if (states.length && states.every(status => status === 'completed')) return 'completed';
    if (states.includes('running')) return 'running';
    return 'pending';
  };

  const toggleNode = (id) => {
    setCollapsedNodes(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const isExpanded = (id) => !collapsedNodes().has(id);

  const formatDuration = (ms) => {
    if (!ms || ms < 1000) return ms ? `${ms}ms` : '0s';
    const s = Math.round(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return `${m}m ${rem}s`;
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'completed': return '✓';
      case 'running': return '⟳';
      case 'failed': return '⊗';
      case 'paused': return '⏸';
      case 'skipped': return '↷';
      default: return '⏳';
    }
  };

  const getStatusClass = (status) => {
    switch (status) {
      case 'completed': return 'status-completed';
      case 'running': return 'status-running';
      case 'failed': return 'status-failed';
      case 'paused': return 'status-paused';
      case 'skipped': return 'status-skipped';
      default: return 'status-pending';
    }
  };

  const handleStart = async () => {
    try { await api(`projects/${props.projectId}/workflows/${wf().id}/start`, {}); props.onRefresh?.(); }
    catch { setActionError('Workflow execution is unavailable. No new work was authorized.'); }
  };
  const handlePause = async () => {
    if (!wf()?.id || !props.projectId) return;
    try {
      await api(`projects/${props.projectId}/workflows/${wf().id}/pause`, {});
      props.onRefresh?.();
    } catch (e) {
      console.error('Failed to pause workflow:', e);
    }
  };

  const handleResume = async () => {
    if (!wf()?.id || !props.projectId) return;
    try {
      await api(`projects/${props.projectId}/workflows/${wf().id}/resume`, {});
      props.onRefresh?.();
    } catch (e) {
      setActionError('This workflow cannot resume yet. Review its pending approval or recovery requirements.');
    }
  };

  const handleCancel = async () => {
    if (!wf()?.id || !props.projectId) return;
    try {
      await api(`projects/${props.projectId}/workflows/${wf().id}/cancel`, { reason: 'user_cancelled' });
      props.onRefresh?.();
    } catch (e) {
      console.error('Failed to cancel workflow:', e);
    }
  };

  const handleRetry = async (stepId, alternateModel = null) => {
    if (!wf()?.id || !props.projectId || !stepId) return;
    try {
      await api(`projects/${props.projectId}/workflows/${wf().id}/retry`, {
        stepId,
        alternateModelId: alternateModel
      });
      props.onRefresh?.();
    } catch (e) {
      console.error('Failed to retry step:', e);
    }
  };
  const handleAssign = async (stepId, modelId) => {
    try { await api(`projects/${props.projectId}/workflows/${wf().id}/assign-model`, {stepId, modelId}); props.onRefresh?.(); }
    catch { setActionError('The model could not be assigned. Only an unstarted plan can be edited, and the model must be eligible for its role.'); }
  };
  const handleReview = async stepId => {
    try {
      const preview=await api(`projects/${props.projectId}/workflows/${wf().id}/review-preview`,{stepId});
      if(!window.confirm(`Approve the reviewed changes? Inspect the file diffs and test results first.\n\nFiles: ${preview.files.map(f=>f.path).join(', ')}\nTests: ${preview.tests.length?preview.tests.map(t=>`${t.id}: ${t.passed?'passed':'unverified'}`).join(', '):'No test evidence'}\n\nApproval is bound to these exact file contents. Resume is a separate action.`))return;
      await api(`projects/${props.projectId}/workflows/${wf().id}/review-approve`,{stepId,approval:{approved:true,token:preview.token}});props.onRefresh?.();
    }catch{setActionError('Review approval was not saved. Files or workflow state may have changed; refresh and inspect them again.');}
  };

  const handleRestoreCheckpoint = async (checkpointId) => {
    if (!wf()?.id || !props.projectId || !checkpointId) return;
    try {
      setActionError('');
      const preview = await api(`projects/${props.projectId}/workflows/${wf().id}/rollback-preview`, { checkpointId });
      const changes = preview.files.filter(file => file.currentHash !== file.snapshotHash);
      if (!window.confirm(`Restore this checkpoint? This will replace or remove the current contents of these files:\n\n${changes.map(file => `${file.action}: ${file.path}`).join('\n') || 'No file changes.'}\n\nChanges made after this preview will stop restoration. The workflow will remain paused.`)) return;
      await api(`projects/${props.projectId}/workflows/${wf().id}/rollback`, { checkpointId, approval: { approved: true, token: preview.token } });
      props.onRefresh?.();
    } catch (e) {
      setActionError('Checkpoint was not restored. Refresh and review the current files before trying again.');
      console.error('Failed to restore checkpoint:', e);
    }
  };
  const handlePermission = async (stepId, requestID, reply) => {
    const session = wf()?.stepStates?.[stepId]?.sessionID;
    if (!session) return;
    try { await api(`sessions/${session}/permission`, { requestID, reply }); props.onRefresh?.(); }
    catch { setActionError('The permission request could not be answered. Refresh the workflow and try again.'); }
  };

  return (
    <div class="workflow-tree-card" role="region" aria-label="Workflow execution tree">
      <Show when={actionError()}><p role="alert">{actionError()}</p></Show>
      {/* 1. Header Card */}
      <div class="wf-card-header">
        <div class="wf-header-left">
          <button
            class="wf-collapse-btn"
            onClick={() => toggleNode('root')}
            aria-expanded={isExpanded('root')}
            title={isExpanded('root') ? 'Collapse workflow details' : 'Expand workflow details'}
          >
            <span class="wf-chevron" aria-hidden="true">{isExpanded('root') ? '▼' : '▶'}</span>
            <span class="wf-title">{wf()?.title || 'Workflow'}</span>
          </button>
          <span class="wf-mode-badge">{wf()?.mode || 'team'}</span>
          <span class={`wf-policy-chip ${wf()?.policy === 'free_only' ? 'free' : 'paid'}`}>
            ● {wf()?.policy === 'free_only' ? 'Free Only ($0.00)' : wf()?.policy === 'free_preferred' ? 'Free Preferred' : 'Paid Allowed'}
          </span>
        </div>

        <div class="wf-header-right">
          <Show when={wf()?.metadata?.totalEstimatedCostUsd !== undefined}>
            <span class="wf-spend-chip">
              Est: ${Number(wf()?.metadata?.totalEstimatedCostUsd || 0).toFixed(2)}
            </span>
          </Show>
          <Show when={wf()?.status === 'pending'}><button class="wf-btn" disabled={!props.executionReady} onClick={handleStart}>Start workflow</button></Show>
          <div class="wf-actions-toolbar" role="toolbar" aria-label="Workflow controls">
            <Show when={wf()?.status === 'running'}>
              <button class="wf-btn icon-btn" onClick={handlePause} title="Pause workflow" aria-label="Pause workflow">
                ⏸
              </button>
            </Show>
            <Show when={wf()?.status === 'paused'}>
              <button class="wf-btn icon-btn" disabled={!props.executionReady || wf()?.requiresReplan || needsReview()} onClick={handleResume} title="Resume workflow" aria-label="Resume workflow">
                ▶
              </button>
            </Show>
            <Show when={wf()?.status === 'running' || wf()?.status === 'paused'}>
              <button class="wf-btn icon-btn cancel" onClick={handleCancel} title="Cancel workflow" aria-label="Cancel workflow">
                ⏹
              </button>
            </Show>
            <button class="wf-btn icon-btn" onClick={() => props.onRefresh?.()} title="Refresh workflow status" aria-label="Refresh workflow status">
              ⟳
            </button>
          </div>
        </div>
      </div>

      {/* 2. Failure & Checkpoint Restore Banner */}
      <Show when={wf()?.status === 'failed' || wf()?.status === 'paused' || checkpoints().length > 0}>
        <div class={`wf-alert-banner ${wf()?.status === 'failed' ? 'error' : 'warning'}`} role="alert">
          <div class="wf-alert-top">
            <span class="wf-alert-icon" aria-hidden="true">{wf()?.status === 'failed' ? '⊗' : '📍'}</span>
            <span class="wf-alert-msg">
              {wf()?.status === 'failed'
                ? `Workflow stopped: ${wf()?.cancellationReason || 'Task failure encountered.'}`
                : `Workflow paused: Checkpoint available.`}
            </span>
          </div>

          <Show when={checkpoints().length > 0}>
            <div class="wf-checkpoint-controls">
              <span class="wf-checkpoint-label">
                Checkpoint: {checkpoints()[0].description} ({new Date(checkpoints()[0].createdAt).toLocaleTimeString()})
              </span>
              <div class="wf-checkpoint-buttons">
                <button
                  class="wf-btn primary-btn small"
                  onClick={() => handleRestoreCheckpoint(checkpoints()[0].checkpointId)}
                  title="Revert to pre-stage snapshot preserving unrelated files"
                >
                  Restore Checkpoint
                </button>
                <Show when={wf()?.status === 'paused'}>
                  <button class="wf-btn secondary-btn small" disabled={!props.executionReady || wf()?.requiresReplan || needsReview()} onClick={handleResume}>
                    Continue
                  </button>
                </Show>
              </div>
            </div>
          </Show>
        </div>
      </Show>

      {/* 3. Expandable Live Step Tree */}
      <Show when={isExpanded('root')}>
        <div class="wf-tree-body" role="group" aria-label="Workflow steps">
          <For each={wf()?.plan?.stages || []}>
            {(stage, stageIdx) => (
              <div class="wf-stage-node" role="group" aria-label={stage.title || stage.id}>
                {/* Stage Header */}
                <button type="button" class="wf-stage-header" aria-expanded={isExpanded(stage.id || `stage-${stageIdx()}`)} onClick={() => toggleNode(stage.id || `stage-${stageIdx()}`)}>
                  <span class="wf-node-chevron" aria-hidden="true">
                    {isExpanded(stage.id || `stage-${stageIdx()}`) ? '▼' : '▶'}
                  </span>
                  <span class={`wf-status-badge ${getStatusClass(stageStatus(stage))}`}>
                    {getStatusIcon(stageStatus(stage))}
                  </span>
                  <span class="wf-stage-title">{stage.title}</span>
                  <Show when={stage.type === 'repeat'}>
                    <span class="wf-repeat-badge">repeat (max {stage.maxIterations || 3})</span>
                  </Show>
                  <Show when={stage.type === 'parallel'}>
                    <span class="wf-parallel-badge">parallel ({stage.steps?.length || 0})</span>
                  </Show>
                </button>

                {/* Stage Children */}
                <Show when={isExpanded(stage.id || `stage-${stageIdx()}`)}>
                  <div class="wf-stage-children">
                    {/* Render repeat iterations or child steps */}
                    <For each={stage.steps || [stage]}>
                      {(step) => {
                        const stepState = () => wf()?.stepStates?.[step.id] || step;
                        const isStepExpanded = () => isExpanded(step.id);
                        return (
                          <div class="wf-step-node" role="group" aria-label={step.title || step.id}>
                            <div class="wf-step-header">
                              <button type="button" class="wf-node-chevron small wf-step-disclosure" aria-label={'Toggle ' + (step.title || step.id)} aria-expanded={isStepExpanded()} onClick={() => toggleNode(step.id)}>
                                {isStepExpanded() ? '▼' : '▶'}
                              </button>
                              <span class={`wf-status-badge ${getStatusClass(stepState().status)}`}>
                                {getStatusIcon(stepState().status)}
                              </span>
                              <span class="wf-step-title">{step.title}</span>
                              <Show when={step.agent}>
                                <span class={`wf-role-tag role-${step.agent}`}>{step.agent}</span>
                              </Show>

                              {/* Interactive Model Chip */}
                              <div class="wf-model-chip-wrap">
                                <select
                                  class="wf-model-chip"
                                  disabled={wf()?.status !== 'pending'}
                                  aria-label={'Model for ' + (step.title || step.id)}
                                  title={stepState().assignedModel || 'Choose an exact model'}
                                  value={stepState().assignedModel || ''}
                                  onChange={e => handleAssign(step.id, e.currentTarget.value)}
                                >
                                  <Show when={!models().some(m => m.qualifiedId === stepState().assignedModel)}><option value={stepState().assignedModel || ''}>{stepState().assignedModel || 'Choose a model'}</option></Show>
                                    <For each={models()}>
                                      {(m) => (
                                        <option value={m.qualifiedId}>{m.name} · {m.provider} · {m.tier === 'free' ? 'Free' : 'Paid'}</option>
                                      )}
                                    </For>
                                </select>
                              </div>

                              <Show when={stepState().durationMs}>
                                <span class="wf-duration">{formatDuration(stepState().durationMs)}</span>
                              </Show>
                            </div>

                            {/* Step Expanded Details */}
                            <Show when={isStepExpanded()}>
                              <div class="wf-step-details">
                                <For each={props.sessions?.[step.id]?.permissions || []}>
                                  {permission => <div role="group" aria-label="Workflow tool permission" data-permission-id={permission.id}>
                                    <p>{permission.permission}: {(permission.patterns || []).join(', ')}</p>
                                    <button class="wf-btn" onClick={() => handlePermission(step.id, permission.id, 'once')}>Allow once</button>
                                    <button class="wf-btn" onClick={() => handlePermission(step.id, permission.id, 'reject')}>Reject</button>
                                  </div>}
                                </For>
                                <Show when={step.prompt}>
                                  <div class="wf-detail-row">
                                    <span class="wf-detail-label">Task:</span>
                                    <span class="wf-detail-text">{step.prompt}</span>
                                  </div>
                                </Show>
                                <Show when={step.targetFiles?.length}>
                                  <div class="wf-detail-row">
                                    <span class="wf-detail-label">Files:</span>
                                    <span class="wf-detail-code">
                                      {Array.isArray(step.targetFiles) ? step.targetFiles.join(', ') : step.targetFiles}
                                    </span>
                                  </div>
                                </Show>
                                <Show when={stepState().output}>
                                  <div class="wf-detail-output">
                                    <span class="wf-detail-label">Output:</span>
                                    <pre class="wf-output-box">{stepState().output}</pre>
                                  </div>
                                </Show>
                                <Show when={stepState().error}>
                                  <div class="wf-detail-error">
                                    <span class="wf-detail-label">Error:</span>
                                    <pre class="wf-error-box">{stepState().error}</pre>
                                  </div>
                                </Show>
                                <For each={props.sessions?.[step.id]?.messages || []}>{message=><For each={message.parts?.filter(part=>part.type==='tool') || []}>{part=><details><summary>{part.tool}: {part.command || part.title} · {part.exit === undefined ? part.status : `exit ${part.exit}`}</summary><pre class="wf-output-box">{part.output}</pre></details>}</For>}</For>
                                <For each={props.sessions?.[step.id]?.diffs || []}>{diff=><details><summary>Changes: {diff.file}</summary><pre class="wf-output-box">{diff.patch || `Before:\n${diff.before || ''}\nAfter:\n${diff.after || ''}`}</pre></details>}</For>
                                <Show when={stepState().error==='workflow_review_required' && wf()?.status==='paused'}><button class="wf-btn" onClick={()=>handleReview(step.id)}>Approve reviewed changes</button></Show>

                                <div class="wf-detail-actions">
                                  <button
                                    class="wf-btn secondary-btn small"
                                    disabled={!props.executionReady || stepState().status !== 'failed' || !!stepState().sessionID}
                                    onClick={() => handleRetry(step.id, stepState().assignedModel)}
                                  >
                                    ↺ Retry Step
                                  </button>
                                </div>
                              </div>
                            </Show>
                          </div>
                        );
                      }}
                    </For>
                  </div>
                </Show>
              </div>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}
