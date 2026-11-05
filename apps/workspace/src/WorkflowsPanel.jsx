import { createSignal, createEffect, onMount, onCleanup, For, Show } from 'solid-js';
import { api } from './api';
import { WorkflowTree } from './WorkflowTree';
import { Modal } from './Modal';

export function WorkflowsPanel(props) {
  const [executionReady, setExecutionReady] = createSignal(false);
  const [workflows, setWorkflows] = createSignal([]);
  const [selectedWorkflowId, setSelectedWorkflowId] = createSignal(null);
  const [selectedWorkflow, setSelectedWorkflow] = createSignal(null);
  const [templates, setTemplates] = createSignal([]);
  const [models, setModels] = createSignal([]);
  const [checkpoints, setCheckpoints] = createSignal([]);
  const [stepSessions, setStepSessions] = createSignal({});
  const [loading, setLoading] = createSignal(false);
  const [showNewModal, setShowNewModal] = createSignal(false);
  const [newTitle, setNewTitle] = createSignal('');
  const [newPlan, setNewPlan] = createSignal('');
  const [newTemplate, setNewTemplate] = createSignal('feature-implement-verify');
  const [newPolicy, setNewPolicy] = createSignal('free_only');
  const [createError, setCreateError] = createSignal('');
  let generation = 0;

  const projectId = () => props.project?.id;

  const loadData = async () => {
    const id = projectId(), revision = generation;
    if (!id) return;
    setLoading(true);
    try {
      const status = await api('status');setExecutionReady(status.workflowExecutionReady === true);
      const [wfList, tplList, mdlList] = await Promise.all([
        api(`projects/${id}/workflows`),
        api('templates'),
        api('models')
      ]);
      if (revision !== generation) return;
      setWorkflows(wfList || []);
      setTemplates(tplList || []);
      setModels(mdlList || []);

      if (wfList && wfList.length > 0) {
        const idToSelect = wfList.some(wf => wf.id === selectedWorkflowId()) ? selectedWorkflowId() : wfList[0].id;
        await selectWorkflow(idToSelect);
      } else {
        setSelectedWorkflow(null);
      }
    } catch (e) {
      console.error('Failed to load workflows:', e);
    } finally {
      setLoading(false);
    }
  };

  const selectWorkflow = async (wfid) => {
    const id = projectId(), revision = generation;
    if (!id || !wfid) return;
    setSelectedWorkflowId(wfid);
    try {
      const [wfDetail, chkList] = await Promise.all([
        api(`projects/${id}/workflows/${wfid}`),
        api(`projects/${id}/checkpoints?workflowId=${wfid}`)
      ]);
      if (revision !== generation || selectedWorkflowId() !== wfid) return;
      setSelectedWorkflow(wfDetail);
      setCheckpoints(chkList || []);
      const pairs = await Promise.all(Object.values(wfDetail.stepStates || {}).filter(step => step.sessionID).map(async step => {
        try { return [step.id, await api(`projects/${id}/workflows/${wfid}/session?stepId=${encodeURIComponent(step.id)}`)]; }
        catch { return [step.id, null]; }
      }));
      if (revision === generation && selectedWorkflowId() === wfid) setStepSessions(Object.fromEntries(pairs));
    } catch (e) {
      console.error('Failed to load workflow details:', e);
    }
  };

  const handleCreateWorkflow = async (e) => {
    e.preventDefault();
    if (!projectId() || !newTitle().trim()) return;
    try {
      setCreateError('');
      const created = await api(`projects/${projectId()}/workflows`, {
        ...(newPlan().trim() ? {plan:JSON.parse(newPlan())} : {}),
        prompt: newTitle(),
        templateId: newTemplate(),
        policy: newPolicy(),
        autoStart: false
      });
      setShowNewModal(false);
      setNewTitle('');
      setNewPlan('');
      await loadData();
      if (created?.id) await selectWorkflow(created.id);
    } catch (e) {
      setCreateError('The plan could not be saved. Check its file paths and model availability, then try again.');
      console.error('Failed to create workflow:', e);
    }
  };

  createEffect(() => {
    projectId(); generation++;
    setSelectedWorkflowId(null); setSelectedWorkflow(null); setWorkflows([]); setStepSessions({}); setCheckpoints([]);
    void loadData();
  });
  onMount(() => {
    const interval = setInterval(() => {
      const cur = selectedWorkflow();
      if (cur && (cur.status === 'running' || cur.status === 'pending')) {
        selectWorkflow(cur.id);
      }
    }, 1500);
    onCleanup(() => clearInterval(interval));
  });

  return (
    <div class="workflows-panel" role="region" aria-label="Workflows management panel">
      <p role="status">{executionReady() ? 'Review exact model assignments and tool permissions before starting.' : 'Workflow execution is temporarily unavailable. You can save and edit plans without running agents.'}</p>
      <Show when={createError()}><p role="alert">{createError()}</p></Show>
      {/* Workflows Sub-header */}
      <div class="wf-panel-subhead">
        <div class="wf-subhead-left">
          <label class="sr-only" for="workflow-picker">Select workflow</label>
          <select
            id="workflow-picker"
            class="wf-selector"
            value={selectedWorkflowId() || ''}
            onChange={(e) => selectWorkflow(e.currentTarget.value)}
          >
            <Show when={workflows().length === 0}>
              <option value="">No workflows</option>
            </Show>
            <For each={workflows()}>
              {(w) => (
                <option value={w.id}>
                  {w.title} ({w.status})
                </option>
              )}
            </For>
          </select>
        </div>

        <div class="wf-subhead-right">
          <button
            class="wf-btn primary-btn small"
            onClick={() => setShowNewModal(true)}
            title="Create new workflow"
          >
            + New Workflow
          </button>
        </div>
      </div>

      {/* Main Content: Workflow Tree or Empty State */}
      <div class="wf-panel-body">
        <Show
          when={selectedWorkflow()}
          fallback={
            <div class="wf-empty-state">
              <div class="wf-empty-icon" aria-hidden="true">🌿</div>
              <h3>No Workflow Active</h3>
              <p>Create an intelligent multi-agent workflow to plan, implement, and verify complex tasks with bounded loops and zero unapproved charges.</p>
              <button
                class="wf-btn primary-btn"
                onClick={() => setShowNewModal(true)}
              >
                Create Workflow
              </button>
            </div>
          }
        >
          <WorkflowTree
            executionReady={executionReady()}
            workflow={selectedWorkflow()}
            models={models()}
            checkpoints={checkpoints()}
            sessions={stepSessions()}
            projectId={projectId()}
            onRefresh={loadData}
          />
        </Show>
      </div>

      {/* Create Workflow Modal */}
      <Show when={showNewModal()}>
        <Modal onClose={() => setShowNewModal(false)}>
          <div
            class="wf-modal-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-wf-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div class="wf-modal-head">
              <h3 id="new-wf-title">Create Multi-Agent Workflow</h3>
              <button
                class="wf-modal-close"
                onClick={() => setShowNewModal(false)}
                aria-label="Close dialog"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleCreateWorkflow} class="wf-modal-form">
              <div class="wf-form-field">
                <label for="wf-title-input">Task or Feature Objective</label>
                <input
                  id="wf-title-input"
                  type="text"
                  placeholder="e.g. Implement user authentication or Fix failing test"
                  value={newTitle()}
                  onInput={(e) => setNewTitle(e.currentTarget.value)}
                  required
                  autofocus
                />
              </div>

              <div class="wf-form-field">
                <label for="wf-tpl-select">Workflow Template Preset</label>
                <select
                  id="wf-tpl-select"
                  value={newTemplate()}
                  onChange={(e) => setNewTemplate(e.currentTarget.value)}
                >
                  <For each={templates()}>
                    {(tpl) => (
                      <option value={tpl.id}>
                        {tpl.name} — {tpl.description}
                      </option>
                    )}
                  </For>
                </select>
              </div>

              <div class="wf-form-field">
                <label for="wf-plan-input">Reviewed plan JSON (optional)</label>
                <textarea id="wf-plan-input" value={newPlan()} onInput={e => setNewPlan(e.currentTarget.value)} rows="6" placeholder="Paste a custom plan with exact files, commands and models." />
              </div>

              <div class="wf-form-field">
                <label for="wf-policy-select">Spending Policy</label>
                <select
                  id="wf-policy-select"
                  value={newPolicy()}
                  onChange={(e) => setNewPolicy(e.currentTarget.value)}
                >
                  <option value="free_only">Free Only (Strict $0.00 cap, default)</option>
                  <option value="free_preferred" disabled>Free Preferred — authorization unavailable</option>
                  <option value="paid_allowed" disabled>Paid Allowed — authorization unavailable</option>
                </select>
              </div>

              <div class="wf-modal-actions">
                <button
                  type="button"
                  class="wf-btn secondary-btn"
                  onClick={() => setShowNewModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" class="wf-btn primary-btn" disabled={!newTitle().trim()}>
                  Create & Plan
                </button>
              </div>
            </form>
          </div>
        </Modal>
      </Show>
    </div>
  );
}

