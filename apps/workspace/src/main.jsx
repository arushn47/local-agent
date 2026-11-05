import { render } from 'solid-js/web';
import { For, Show, onMount, onCleanup, createMemo, createEffect } from 'solid-js';
import { createStore, reconcile } from 'solid-js/store';
import { api, errorText } from './api';
import './style.css';
import { Modal } from './Modal';
import { createRefreshQueue } from './refresh.mjs';
import { BuilderPanel } from './BuilderPanel';
import { FilesPanel } from './FilesPanel';
import {ChatQueue} from './ChatQueue';
import { CommandsPanel, CommandsDock } from './CommandsPanel';
import { ChangesPanel } from './ChangesPanel';
import { TestsPanel } from './TestsPanel';
import { StatusBar } from './StatusBar';
import { ContextUsage } from './ContextUsage';
import { Markdown } from './MessageMarkdown.jsx';
import { WorkflowsPanel } from './WorkflowsPanel';
import {ModelPicker} from './ModelPicker';
import {ProjectMemory} from './ProjectMemory';
import { commandOutcome, isTestCommand } from './tool-outcomes.mjs';

const providerNames = { gemini: 'Google Gemini', groq: 'Groq', openrouter: 'OpenRouter', ollama: 'Ollama' };
const stateNames = {
  running: 'Working',
  completed: 'Completed',
  idle: 'Ready',
  cancelled: 'Stopped',
  provider_error: 'Provider stopped',
  task_deadline_exceeded: 'Time limit reached',
  progress_budget_exhausted: 'Progress limit reached'
};

function Icon(props) {
  const paths = {
    workspace: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
    connections: 'M8 3v5 M16 3v5 M6 8h12v4a6 6 0 0 1-12 0z M12 18v4',
    routing: 'M5 4v12a4 4 0 0 0 8 0V8a4 4 0 0 1 8 0 M2 7l3-3 3 3 M18 17l3 3 3-3',
    folder: 'M3 7V5h6l3 3h9v12H3z',
    plus: 'M12 5v14 M5 12h14',
    check: 'M5 12l4 4L19 6',
    close: 'M6 6l12 12 M18 6L6 18',
    sun: 'M12 3v2M12 19v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M3 12h2M19 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10z',
    moon: 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z',
    dock: 'M3 4h18v16H3z M3 15h18',
    panel: 'M3 4h18v16H3z M14 4v16',
    arrow: 'M5 12h14 M13 6l6 6-6 6'
  };
  return (
    <svg width={props.size || 16} height={props.size || 16} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d={paths[props.name] || paths.workspace} />
    </svg>
  );
}

function MessagePart(props) {
  const part = () => props.part;
  return (
    <Show
      when={part().type === 'text'}
      fallback={
        <Show
          when={part().type === 'compaction'}
          fallback={
            <details class="tool-card">
              <summary class="tool-head">
                <span class={'pill ' + (part().exit === 0 ? 'pass' : part().exit !== undefined ? 'fail' : '')}>
                  {part().tool || 'tool'}
                </span>
                <span class="cmd">{part().command || part().title || part().tool}</span>
                <Show when={part().exit !== undefined}>
                  <span class={'pill ' + (part().exit === 0 ? 'pass' : 'fail')}>exit {part().exit}</span>
                </Show>
              </summary>
              <pre class="tool-body">{part().output || 'Awaiting tool result…'}</pre>
            </details>
          }
        >
          <p class="compaction-marker">{part().auto ? 'Earlier history summarized automatically' : 'Earlier history summarized'} · OpenCode compaction</p>
        </Show>
      }
    >
      <Show when={props.markdown} fallback={<div class="user-bubble">{part().text}</div>}>
        <div class="agent-content"><Markdown text={part().text} theme={props.theme} /></div>
      </Show>
    </Show>
  );
}

function App() {
  const desktop = window.localagentDesktop;
  const saved = (() => {
    try {
      const val = JSON.parse(localStorage.getItem('localagent.workspace') || '{}');
      return {
        project: typeof val.project === 'string' ? val.project : null,
        session: typeof val.session === 'string' ? val.session : null,
        draft: typeof val.draft === 'string' ? val.draft.slice(0, 16000) : '',
        theme: val.theme === 'light' ? 'light' : 'dark',
        rightPanelOpen: val.rightPanelOpen !== false,
        inspectorTab: typeof val.inspectorTab === 'string' ? val.inspectorTab : 'files'
      };
    } catch {
      return { theme: 'dark', rightPanelOpen: true, inspectorTab: 'files' };
    }
  })();

  let hydrated = false;
  const [s, set] = createStore({
    view: 'workspace',
    theme: saved.theme || 'dark',
    rightPanelOpen: saved.rightPanelOpen !== false,
    dockExpanded: false,
    inspectorTab: saved.inspectorTab || 'files',
    projects: [],
    project: null,
    sessions: [],
    session: null,
    snapshot: null,
    older: [],
    historyMore: true,
    historyBusy: false,
    draft: saved.draft || '',
    path: '',
    error: '',
    notice: '',
    busy: false,
    connected: true,
    status: null,
    provider: null,
    key: '',
    confirmed: false,
    desktopState: null,
    showProjectModal: false
  });

  const project = createMemo(() => s.projects.find((p) => p.id === s.project));
  const conversation = createMemo(() => {
    const latest = s.snapshot?.messages || [];
    const ids = new Set(latest.map((m) => m.id));
    return [...s.older.filter((m) => !ids.has(m.id)), ...latest];
  });

  createEffect(() => {
    s.session;
    set({ older: [], historyMore: true });
  });

  createEffect(() => {
    document.documentElement.setAttribute('data-theme', s.theme);
  });

  async function loadHistory() {
    if (s.historyBusy || !s.session || s.older.length >= 500) return;
    const id = s.session;
    const before = conversation()[0]?.id;
    const region = document.querySelector('.conversation') || document.querySelector('.thread');
    if (!before || !region) return;

    const anchorEl = region.querySelector('.message');
    const initialOffset = anchorEl ? anchorEl.getBoundingClientRect().top - region.getBoundingClientRect().top : null;
    const height = region.scrollHeight;
    const top = region.scrollTop;
    set('historyBusy', true);
    try {
      const page = await api('sessions/' + id + '/history?before=' + encodeURIComponent(before));
      if (id !== s.session) return;
      const ids = new Set(conversation().map((m) => m.id));
      const added = page.messages.filter((m) => !ids.has(m.id));
      set('older', (old) => [...added, ...old]);
      set('historyMore', page.hasMore && added.length > 0);
      requestAnimationFrame(() => {
        if (id === s.session) {
          region.scrollTop = top + region.scrollHeight - height;
          region.focus({ preventScroll: true });
        }
      });
    } catch (e) {
      set('error', errorText(e));
    } finally {
      set('historyBusy', false);
    }
  }

  const active = createMemo(() => s.snapshot?.state === 'running');
  const displayPath = (text) => (project()?.path ? text?.split(project().path + '\\').join('').split(project().path + '/').join('') : text);

  let ticks = 0;
  const refresh = createRefreshQueue(async ({ includeSession }) => {
    try {
      if (!s.status || ticks++ % 5 === 0) set('status', await api('status'));
      if (includeSession && s.session) {
        const id = s.session;
        const snap = await api('sessions/' + id);
        if (id === s.session) set('snapshot', reconcile(snap));
      }
      set('connected', true);
    } catch {
      set('connected', false);
    }
  });

  async function action(fn) {
    set({ busy: true, error: '', notice: '' });
    try {
      await fn();
    } catch (e) {
      set('error', errorText(e));
    } finally {
      set('busy', false);
    }
  }

  async function chooseProject(id) {
    set({ project: id, session: null, sessions: [], snapshot: null, view: 'workspace', showProjectModal: false });
    const list = await api('projects/' + id + '/sessions');
    if(s.project !== id) return;
    set('sessions', list);
    if (list.length > 0 && !s.session) {
      set('session', list[0].id);
      await refresh({ includeSession: true });
    }
  }

  async function openProject(e) {
    e.preventDefault();
    await action(async () => {
      const p = await api('projects', { path: s.path });
      set('projects', await api('projects'));
      set('path', '');
      await chooseProject(p.id);
    });
  }

  async function chooseFolder() {
    await action(async () => {
      const selected = await desktop.selectProject();
      if (!selected) return;
      const p = await api('projects', { path: selected });
      set('projects', await api('projects'));
      set('path', '');
      await chooseProject(p.id);
    });
  }

  async function createNewTask(modelId, purpose) {
    if (!s.project || active()) return;
    const projectId=s.project;
    await action(async () => {
      const created = await api('projects/' + projectId + '/sessions', {});
      if(typeof modelId==='string')await api('sessions/'+created.id+'/model',{modelId,purpose});
      const sessions=await api('projects/' + projectId + '/sessions');
      if(s.project !== projectId) return;
      set('sessions', sessions);
      set('session', created.id);
      set('snapshot', null);
      await refresh({ includeSession: true });
    });
  }

  async function chooseModel(modelId,purpose){
    if(active())throw Error('task_already_running');
    if(!s.session){await createNewTask(modelId,purpose);return;}
    await api('sessions/'+s.session+'/model',{modelId,purpose});await refresh({includeSession:true});
  }

  async function selectSession(sessionId) {
    if(!s.sessions.some(session=>session.id===sessionId)) return;
    await action(async () => {
      set({ session: sessionId, snapshot: null });
      await refresh({ includeSession: true });
    });
  }

  async function sendPrompt(e) {
    e.preventDefault();
    if (!s.draft.trim() || s.busy) return;
    const projectId=s.project,text=s.draft;
    await action(async () => {
      let id = s.session;
      if (!id) {
        const session = await api('projects/' + projectId + '/sessions', {});
        if(s.project !== projectId) return;
        id = session.id;
        set('session', id);
      }
      await api('sessions/' + id + (active()?'/queue':'/prompt'), { text });
      if(s.project !== projectId || s.session !== id) return;
      if(s.draft === text) set('draft', '');
      const sessions=await api('projects/' + projectId + '/sessions');
      if(s.project !== projectId || s.session !== id) return;
      set('sessions', sessions);
      await refresh({ includeSession: true });
    });
  }

  async function saveProvider(e) {
    e.preventDefault();
    const id = s.provider;
    const key = s.key;
    const confirmed = s.confirmed;
    set('key', '');
    await action(async () => {
      const result = await api('providers/' + id, { key, confirmed });
      set({
        provider: null,
        confirmed: false,
        notice: result.routingReady ? 'Provider saved securely. Routing is ready.' : 'Provider saved securely. No coding route is available yet.'
      });
      set('status', await api('status'));
    });
  }

  async function respond(requestID, reply) {
    await action(async () => {
      await api('sessions/' + s.session + '/permission', { requestID, reply });
      await refresh({ includeSession: true });
    });
  }

  function toggleTheme() {
    set('theme', s.theme === 'dark' ? 'light' : 'dark');
  }

  createEffect(() => {
    const val = {
      project: s.project,
      session: s.session,
      draft: s.draft,
      theme: s.theme,
      rightPanelOpen: s.rightPanelOpen,
      inspectorTab: s.inspectorTab
    };
    if (hydrated) {
      try {
        localStorage.setItem('localagent.workspace', JSON.stringify(val));
      } catch {}
    }
  });

  onMount(() => {
    let idleTicks = 0;
    const timer = setInterval(() => {
      if (!document.hidden && (active() || ++idleTicks % 3 === 0)) {
        void refresh({ includeSession: active() || !s.connected, force: false });
      }
    }, 1000);
    onCleanup(() => clearInterval(timer));

    const onKeyDown = (e) => {
      if (e.ctrlKey && e.altKey && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
        set('rightPanelOpen', !s.rightPanelOpen);
      } else if (e.ctrlKey && e.altKey && (e.key === 'c' || e.key === 'C')) {
        e.preventDefault();
        set('dockExpanded', !s.dockExpanded);
      } else if (e.ctrlKey && (e.key === 'o' || e.key === 'O')) {
        e.preventDefault();
        if (desktop) void chooseFolder();
        else set('showProjectModal', true);
      } else if (e.key === 'Escape') {
        if (s.provider) set({ provider: null, key: '' });
        if (s.showProjectModal) set('showProjectModal', false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    onCleanup(() => window.removeEventListener('keydown', onKeyDown));

    if (desktop) {
      const offStatus = desktop.onStatus((val) => set('desktopState', val));
      const offOpen = desktop.onOpenProject(() => void chooseFolder());
      onCleanup(() => {
        offStatus();
        offOpen();
      });
      void desktop.status().then((val) => set('desktopState', val));
    }

    void (async () => {
      try {
        const prjs = await api('projects');
        set('projects', prjs);
        if (saved.project && prjs.some((p) => p.id === saved.project)) {
          await chooseProject(saved.project);
          if (saved.session && s.sessions.some((x) => x.id === saved.session)) {
            set('session', saved.session);
          }
        }
        hydrated = true;
        await refresh({ includeSession: true });
      } catch {
        hydrated = true;
        set('connected', false);
      }
    })();
  });

  const lastTest = createMemo(() => {
    const bashTools = s.snapshot?.messages?.flatMap((m) => m.parts).filter((p) => p.type === 'tool' && p.tool === 'bash' && isTestCommand(p.command || '')) || [];
    return bashTools.at(-1);
  });

  const testStatus = createMemo(() => {
    if (!lastTest()) return null;
    return {
      passed: commandOutcome(lastTest()).kind === 'pass',
      kind: commandOutcome(lastTest()).kind,
      text: commandOutcome(lastTest()).label
    };
  });

  function navigate(view) {
    set('view', view);
    queueMicrotask(() => document.querySelector('#main h1')?.focus());
  }

  let providerOpener;
  function openProvider(id) {
    providerOpener = document.activeElement;
    set({ provider: id, key: '', confirmed: false });
  }

  return (
    <div
      class={
        'app-shell ' +
        (!s.rightPanelOpen ? 'panel-collapsed ' : '') +
        (s.view !== 'workspace' || !project() ? 'full-view' : '')
      }
    >
      <a class="skip-link" href="#main" inert={s.provider ? true : undefined}>
        Skip to workspace
      </a>

      {/* 1. Left Product Rail */}
      <nav class="rail" aria-label="Product navigation" inert={s.provider ? true : undefined}>
        <a href="/" class="mark" aria-label="LocalAgent home" onClick={(e) => { e.preventDefault(); navigate('workspace'); }}>
          <i /><i /><i />
        </a>
        <button
          class="rail-btn"
          aria-current={s.view === 'workspace' ? 'page' : undefined}
          aria-label="Workspace"
          onClick={() => navigate('workspace')}
        >
          <Icon name="workspace" />
        </button>
        <button
          class="rail-btn"
          aria-current={s.view === 'providers' ? 'page' : undefined}
          aria-label="Connections"
          onClick={() => navigate('providers')}
        >
          <Icon name="connections" />
        </button>
        <button
          class="rail-btn"
          aria-current={s.view === 'routing' ? 'page' : undefined}
          aria-label="Routing"
          onClick={() => navigate('routing')}
        >
          <Icon name="routing" />
        </button>
        <div class="rail-bottom">
          <button
            class="rail-btn"
            aria-label={s.theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            onClick={toggleTheme}
          >
            <Icon name={s.theme === 'dark' ? 'sun' : 'moon'} />
          </button>
          <span class="avatar" aria-hidden="true" title="Local session">AR</span>
        </div>
      </nav>

      {/* 2. Top Tabs */}
      <header class="tabs" aria-label="Open tasks" inert={s.provider ? true : undefined}>
        <Show when={project()} fallback={<span class="tab-title">LocalAgent Workspace</span>}>
          <div class="tabs-list" role="tablist" aria-label="Open tasks">
            <For each={s.sessions.slice(0, 8)}>
              {(session) => (
                <button
                  class="tab"
                  role="tab"
                  aria-selected={s.session === session.id}
                  onClick={() => selectSession(session.id)}
                >
                  {session.title || 'Task'}
                </button>
              )}
            </For>
          </div>
          <button class="tab-add" aria-label="New task" onClick={createNewTask}>
            <span aria-hidden="true">+</span>
          </button>
        </Show>
        <span class="tab-strip-spacer" />
        <Show when={s.view === 'workspace' && project()}>
          <div class="layout-btns" role="group" aria-label="Layout">
            <button
              aria-label="Toggle commands dock"
              aria-pressed={s.dockExpanded}
              onClick={() => set('dockExpanded', !s.dockExpanded)}
              title="Toggle Commands Dock (Ctrl+Alt+C)"
            >
              <Icon name="dock" />
            </button>
            <button
              aria-label="Toggle right panel"
              aria-pressed={s.rightPanelOpen}
              onClick={() => set('rightPanelOpen', !s.rightPanelOpen)}
              title="Toggle Inspector Panel (Ctrl+Alt+P)"
            >
              <Icon name="panel" />
            </button>
          </div>
        </Show>
      </header>

      {/* 3. Left Sidebar */}
      <aside class="side" aria-label="Projects and tasks" inert={s.provider ? true : undefined}>
        <div class="side-head">
          <Show
            when={project()}
            fallback={
              <div>
                <div class="side-label">PROJECTS</div>
                <div class="project-list">
                  <For each={s.projects}>
                    {(p) => (
                      <button
                        class={'project-link ' + (s.project === p.id ? 'current' : '')}
                        onClick={() => action(() => chooseProject(p.id))}
                      >
                        {p.name}
                      </button>
                    )}
                  </For>
                </div>
              </div>
            }
          >
            <button
              class="project-switch"
              onClick={() => set('showProjectModal', true)}
              title="Switch project"
            >
              <span class="glyph" aria-hidden="true">P</span>
              <span class="project-switch-text">
                <span class="name">{project()?.name || 'No project open'}</span>
                <span class="path">{project()?.path || 'Click to select project'}</span>
              </span>
            </button>
            <button
              class="new-task"
              disabled={!project() || active()}
              onClick={createNewTask}
            >
              <Icon name="plus" size={13} />
              New task
            </button>
          </Show>
        </div>

        <div class="side-scroll">
          <Show when={project()}>
            <div class="side-label">TASKS</div>
            <Show when={s.sessions.length} fallback={<p class="sidebar-empty">No tasks in this project yet.</p>}>
              <For each={s.sessions}>
                {(session) => (
                  <button
                    class="task-row"
                    aria-current={s.session === session.id}
                    onClick={() => selectSession(session.id)}
                  >
                    <span class="task-title">{session.title || 'Untitled task'}</span>
                    <Show when={s.session === session.id && s.snapshot?.diffs?.length}>
                      <span class="badge">{s.snapshot.diffs.length}</span>
                    </Show>
                  </button>
                )}
              </For>
            </Show>
          </Show>
        </div>

        <div class="side-foot">
          <div class="quota">
            <span>Last input · {s.snapshot?.context?.inputTokens != null ? (s.snapshot.context.inputIncludingCache ?? s.snapshot.context.inputTokens).toLocaleString() + ' tokens' : 'unknown'}</span>
            <span>{s.status?.plan?.targets?.[0]?.model ? s.status.plan.targets[0].model.split('/').pop() : 'no coding model'}</span>
          </div>
          <div class="quota">
            <span>Free-only policy</span>
            <span>{!s.connected ? 'runtime offline' : s.status?.plan?.targets?.length ? 'route configured' : 'no coding route'}</span>
          </div>
        </div>
      </aside>

      {/* 4. Central Main Workspace */}
      <main id="main" class="main" tabindex="-1" inert={s.provider ? true : undefined}>
        <div class="mobile-projects">
          <label for="mobile-project">Project</label>
          <select
            id="mobile-project"
            value={s.project || ''}
            onChange={(e) => {
              const id = e.currentTarget.value;
              if (id) void action(() => chooseProject(id));
              else set({ project: null, session: null, snapshot: null });
            }}
          >
            <option value="">Open another project</option>
            <For each={s.projects}>{(p) => <option value={p.id}>{p.name}</option>}</For>
          </select>
        </div>

        <div class="alerts" aria-live="polite">
          <Show when={s.desktopState?.state === 'failed'}>
            <div class="alert error">
              The local runtime stopped. Your draft is preserved. Restart the runtime, then review the interrupted task.
              <button class="secondary" disabled={s.busy} onClick={() => action(() => desktop.restart())}>
                Restart local runtime
              </button>
            </div>
          </Show>
          <Show when={s.error}>
            <div class="alert error" role="alert">
              {s.error}
              <button aria-label="Dismiss error" onClick={() => set('error', '')}>×</button>
            </div>
          </Show>
          <Show when={s.notice}>
            <div class="alert">{s.notice}</div>
          </Show>
          <Show when={!s.connected}>
            <div class="alert error">Connection interrupted. Reconnecting to your local runtime; your draft is preserved.</div>
          </Show>
        </div>

        {/* View: Providers (Connections) */}
        <Show when={s.view === 'providers'}>
          <section class="page connections">
            <div class="eyebrow">BRING YOUR OWN INTELLIGENCE</div>
            <div class="page-heading">
              <div>
                <h1 tabindex="-1">Good connections. <br /><em>More possibilities.</em></h1>
                <p class="intro">Your keys, your providers. LocalAgent keeps inference within verified free-tier and local-model safeguards.</p>
              </div>
              <button class="secondary" disabled={s.busy} onClick={() => action(async () => { await api('providers/refresh', {}); set('status', await api('status')); set('notice', 'Provider metadata refreshed. No inference was used.'); })}>
                Refresh availability
              </button>
            </div>
            <div class="provider-grid">
              <For each={s.status?.providers}>
                {(p) => (
                  <article class="provider-card">
                    <div class="provider-top">
                      <span class={'provider-avatar ' + p.id}>{p.id === 'gemini' ? '✦' : p.id === 'groq' ? 'g' : p.id === 'openrouter' ? '⇄' : '◉'}</span>
                      <span class={'badge ' + (p.eligible ? 'good' : 'muted')}>{p.eligible ? 'Available' : p.configured ? 'Unavailable' : 'Not connected'}</span>
                    </div>
                    <h2>{providerNames[p.id]}</h2>
                    <p>{p.id === 'ollama' ? 'Run compatible models on your own hardware.' : p.id === 'openrouter' ? 'Access explicitly verified, zero-priced :free models.' : p.id === 'gemini' ? 'Connect a billing-disabled Gemini API project.' : 'Connect an organization on Groq’s free plan.'}</p>
                    <div class="provider-models">
                      <For each={p.models}>{(m) => <code>{m}</code>}</For>
                      <Show when={!p.models.length}><span>No admitted models available</span></Show>
                    </div>
                    <span class="provider-policy">{p.codingEligible ? 'Included in the coding plan' : p.eligible ? 'Standalone eligible · automatic continuation unavailable' : 'Not in the coding plan'}</span>
                    <Show when={p.id !== 'ollama'} fallback={<p class="hint">Start Ollama locally, install a compatible model, then refresh. No automatic downloads.</p>}>
                      <button class="secondary full" onClick={() => openProvider(p.id)}>
                        {p.configured ? 'Manage connection' : 'Connect provider'} <Icon name="arrow" size={13} />
                      </button>
                    </Show>
                  </article>
                )}
              </For>
            </div>
          </section>
        </Show>

        {/* View: Routing */}
        <Show when={s.view === 'routing'}>
          <section class="page routing">
            <div class="eyebrow">CLEAR CHOICES. NO SURPRISES.</div>
            <h1 tabindex="-1">Intelligence with <br /><em>a sense of direction.</em></h1>
            <p class="intro">Only compatible, verified routes can continue your task. When no safe destination exists, your agent stops clearly.</p>
            <div class="route-plan">
              <For each={s.status?.plan.targets}>
                {(t, i) => (
                  <>
                    <Show when={i() > 0}><span class="route-arrow">→</span></Show>
                    <article>
                      <span class="feature-index">{i() === 0 ? 'PRIMARY' : 'VERIFIED FORWARD FALLBACK'}</span>
                      <h2>{providerNames[t.provider]}</h2>
                      <code>{t.model}</code>
                      <span class="badge good">{Math.floor(t.contextWindow / 1024)}K verified context</span>
                    </article>
                  </>
                )}
              </For>
              <Show when={!s.status?.plan.targets.length}>
                <p>No eligible coding route. Configure a provider in Connections.</p>
              </Show>
            </div>
            <div class="routing-note">
              <strong>Compatibility has a direction.</strong>
              <p>Gemini → Cohere is the evidenced continuation route. Reverse, untested, quota-blocked, and unavailable routes stay excluded.</p>
            </div>
            <h2 class="section-title">Recent routing activity <span>Metadata only</span></h2>
            <div class="event-table" role="region" aria-label="Routing activity">
              <table>
                <thead>
                  <tr><th>Time</th><th>Provider / model</th><th>Decision</th><th>Quota</th></tr>
                </thead>
                <tbody>
                  <For each={[...(s.status?.events || [])].reverse().slice(0, 20)}>
                    {(e) => (
                      <tr>
                        <td>{new Date(e.timestamp).toLocaleTimeString()}</td>
                        <td><strong>{providerNames[e.provider] || e.provider}</strong><small>{e.model || '—'}</small></td>
                        <td>{e.event.replaceAll('_', ' ')}</td>
                        <td>{e.quota?.status === 'rate_limited' ? 'Rate limited' : 'Unknown'}</td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
            </div>
          </section>
        </Show>

        {/* View: Workspace */}
        <Show when={s.view === 'workspace'}>
          <Show
            when={project()}
            fallback={
              <section class="page welcome">
                <div class="eyebrow"><span class="status-dot ok">●</span> LOCAL-FIRST AI CODING</div>
                <h1 tabindex="-1">A workspace for <br />what comes <em>next.</em></h1>
                <p class="intro">Bring an idea, a project, and your own intelligence. <br />We’ll help you turn them into working code.</p>
                <form class="open-project" onSubmit={openProject}>
                  <label for="project-path">Open a local project</label>
                  <Show when={desktop}>
                    <button type="button" class="secondary native-folder" disabled={s.busy} onClick={chooseFolder}>
                      <Icon name="folder" /> Choose folder… <span>Ctrl+O</span>
                    </button>
                  </Show>
                  <div class="path-input">
                    <Icon name="folder" />
                    <input
                      id="project-path"
                      value={s.path}
                      onInput={(e) => set('path', e.currentTarget.value)}
                      placeholder="D:\Projects\your-next-idea"
                      autocomplete="off"
                      required
                    />
                    <button class="primary" disabled={s.busy}>Open project <Icon name="arrow" size={13} /></button>
                  </div>
                  <span class="hint">Use the full path to a folder on this computer. No upload required.</span>
                </form>
                <div class="welcome-bottom">
                  <div>
                    <span class="feature-index">01 / YOUR WORK</span>
                    <h2>Keep it close.</h2>
                    <p>Projects and conversations stay on this device. Cloud models receive only the context needed for your task.</p>
                  </div>
                  <div>
                    <span class="feature-index">02 / YOUR CHOICE</span>
                    <h2>Intelligence, on your terms.</h2>
                    <p>Connect a free cloud provider or a compatible local model. We’ll only use routes that meet the safeguards.</p>
                    <button class="text-button" onClick={() => navigate('providers')}>Configure connections ↗</button>
                  </div>
                </div>
              </section>
            }
          >
            {/* Project Heading */}
            <div class="workspace-heading" style="padding: 12px 22px 0; display: flex; align-items: baseline; gap: 12px;">
              <h1 tabindex="-1" style="font-size: 20px; margin: 0; font-weight: 600;">{project()?.name}</h1>
              <span class="path-caption" style="font: 10px var(--mono); color: var(--faint);">{project()?.path}</span>
            </div>

            {/* Conversation Thread */}
            <div class="thread conversation" role="region" aria-label="Coding conversation" aria-busy={s.historyBusy} tabindex="0">
              <div class="thread-inner">
                <Show when={s.snapshot?.messages.length && s.historyMore}>
                  <button
                    class="secondary history-load"
                    aria-disabled={s.historyBusy || s.older.length >= 500}
                    aria-busy={s.historyBusy}
                    onClick={loadHistory}
                  >
                    {s.historyBusy ? 'Loading earlier messages…' : s.older.length >= 500 ? 'History view limit reached — reopen task to reset' : 'Load earlier messages'}
                  </button>
                </Show>

                <Show when={s.snapshot?.messages.length} fallback={
                  <div class="task-empty">
                    <div class="large-mark"><Icon name="workspace" size={20} /></div>
                    <h2>Make something move forward.</h2>
                    <p>Describe the change you want. Your agent can read code, propose edits, and run tests with your permission.</p>
                    <div class="suggestions">
                      <For each={['Explain how this project works', 'Find a small improvement and add a test']}>
                        {(text) => <button type="button" onClick={() => set('draft', text)}>{text} ↗</button>}
                      </For>
                    </div>
                  </div>
                }>
                  <For each={conversation()}>
                    {(m) => (
                      <article class={'message msg ' + m.role}>
                        <div class="who">
                          {m.role === 'user' ? 'YOU' : 'LOCALAGENT'}
                          <Show when={m.failed}><span class="fail"> · Request stopped</span></Show>
                        </div>
                        <For each={m.parts}>
                          {(part) => <MessagePart part={part} markdown={m.role === 'assistant'} theme={s.theme} />}
                        </For>
                      </article>
                    )}
                  </For>
                </Show>

                <For each={s.snapshot?.permissions}>
                  {(p) => (
                    <div class="permission-card" role="region" aria-label="Permission request">
                      <div class="top">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                          <rect x="4" y="10" width="16" height="10" rx="2" />
                          <path d="M8 10V7a4 4 0 0 1 8 0v3" />
                        </svg>
                        Permission needed · {p.permission}
                      </div>
                      <code>{p.patterns?.join('\n')}</code>
                      <div class="acts">
                        <button class="primary" disabled={s.busy} onClick={() => respond(p.id, 'once')}>Allow once</button>
                        <button class="secondary" disabled={s.busy} onClick={() => respond(p.id, 'reject')}>Deny</button>
                        <span class="dock-caption" style="margin-left: auto;">OpenCode permission</span>
                      </div>
                    </div>
                  )}
                </For>

                <Show when={s.snapshot?.state && !['running', 'completed', 'idle'].includes(s.snapshot.state)}>
                  <div class="alert error">
                    {stateNames[s.snapshot.state] || 'Task stopped'}. Review the result and routing details before continuing. No automatic restart was performed.
                  </div>
                </Show>
              </div>
            </div>

            {/* Composer */}
            <div class="composer-wrap">
              <ContextUsage context={s.snapshot?.context} />
              <ChatQueue session={s.snapshot?.session} busy={s.busy} onAction={input=>action(async()=>{await api('sessions/'+s.session+'/queue-action',input);await refresh({includeSession:true});})}/>
              <form class="composer" onSubmit={sendPrompt}>
                <label class="sr-only" for="task-prompt">Describe your coding task</label>
                <textarea
                  id="task-prompt"
                  value={s.draft}
                  onInput={(e) => set('draft', e.currentTarget.value)}
                  placeholder="Ask for a change, or reference a file…"
                  rows="2"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void sendPrompt(e);
                    }
                  }}
                />
                <div class="composer-bottom">
                  <span class="chip">
                    <span class="dot" />
                    {s.status?.plan?.targets?.[0]?.model || 'Guarded coding route'}
                  </span>
                  <span class="spacer" />
                  <Show when={active()} fallback={
                    <button class="send-btn primary" disabled={s.busy || !s.draft.trim() || !s.status?.plan.targets.length}>
                      Start task <Icon name="arrow" size={13} />
                    </button>
                  }>
                    <button type="submit" class="send-btn primary" disabled={s.busy||!s.draft.trim()}>Queue message</button>
                    <button
                      type="button"
                      class="secondary"
                      onClick={() => action(async () => { await api('sessions/' + s.session + '/cancel', {}); await refresh({ includeSession: true }); })}
                    >
                      ■ Stop task
                    </button>
                  </Show>
                </div>
              </form>
              <ModelPicker session={s.snapshot?.session||s.sessions.find(session=>session.id===s.session)} busy={s.busy||active()} onSelect={chooseModel}/>
              <ProjectMemory projectId={s.project}/>
              <div class="hint-row">
                <span>Enter to send · Shift+Enter for new line · Ctrl+Alt+P panels</span>
                <span>Local draft · {s.status?.plan?.targets?.length ? 'eligible free route' : 'no coding model available'}</span>
              </div>
            </div>

            {/* Bottom Commands Dock */}
            <CommandsDock
              messages={s.snapshot?.messages}
              permissions={s.snapshot?.permissions}
              expanded={s.dockExpanded}
              onToggle={() => set('dockExpanded', !s.dockExpanded)}
            />
          </Show>
        </Show>
      </main>

      {/* 5. Right Inspector Panel */}
      <Show when={s.view === 'workspace' && project() && s.rightPanelOpen}>
        <aside class="panel" aria-label="Thread panel">
          <div class="panel-head">
            <div class="panel-tabs" role="tablist" aria-label="Inspector tabs">
              <button
                class="panel-tab"
                role="tab"
                aria-selected={s.inspectorTab === 'browser'}
                onClick={() => set('inspectorTab', 'browser')}
              >
                Browser
              </button>
              <button
                class="panel-tab"
                role="tab"
                aria-selected={s.inspectorTab === 'files'}
                onClick={() => set('inspectorTab', 'files')}
              >
                Files
              </button>
              <button
                class="panel-tab"
                role="tab"
                aria-selected={s.inspectorTab === 'commands'}
                onClick={() => set('inspectorTab', 'commands')}
              >
                Commands
              </button>
              <button
                class="panel-tab"
                role="tab"
                aria-selected={s.inspectorTab === 'changes'}
                onClick={() => set('inspectorTab', 'changes')}
              >
                Changes <Show when={s.snapshot?.diffs?.length}><span class="badge">{s.snapshot.diffs.length}</span></Show>
              </button>
              <button
                class="panel-tab"
                role="tab"
                aria-selected={s.inspectorTab === 'tests'}
                onClick={() => set('inspectorTab', 'tests')}
              >
                <Show when={lastTest()}><span aria-hidden="true" class={commandOutcome(lastTest()).kind === 'pass' ? 'ok' : commandOutcome(lastTest()).kind === 'fail' ? 'fail' : 'muted'}>● </span></Show>
                Tests
              </button>
              <button
                class="panel-tab"
                role="tab"
                aria-selected={s.inspectorTab === 'workflows'}
                onClick={() => set('inspectorTab', 'workflows')}
              >
                Workflows
              </button>
            </div>
            <span class="panel-actions">
              <button
                class="iconbtn"
                aria-label="Close panel"
                onClick={() => set('rightPanelOpen', false)}
              >
                <span aria-hidden="true">×</span>
              </button>
            </span>
          </div>

          <div class="panel-body">
            <Show when={s.inspectorTab === 'browser'}>
              <BuilderPanel
                project={project()}
                active={active()}
                onRefine={(text) => {
                  set('draft', (prior) => (prior.trim() ? prior + '\n\n' + text : text));
                  document.getElementById('task-prompt')?.focus();
                }}
              />
            </Show>
            <Show when={s.inspectorTab === 'files'}>
              <FilesPanel
                activity={s.snapshot?.activity}
                sessionId={s.session}
                project={project()}
                diffs={s.snapshot?.diffs}
                theme={s.theme}
                onEditViaAgent={(prefix) => {
                  set('draft', (prior) => (prior.trim() ? `${prefix} ${prior}` : prefix));
                  document.getElementById('task-prompt')?.focus();
                }}
              />
            </Show>
            <Show when={s.inspectorTab === 'commands'}>
              <CommandsPanel
                messages={s.snapshot?.messages}
                permissions={s.snapshot?.permissions}
              />
            </Show>
            <Show when={s.inspectorTab === 'changes'}>
              <ChangesPanel
                diffs={s.snapshot?.diffs}
                displayPath={displayPath}
              />
            </Show>
            <Show when={s.inspectorTab === 'tests'}>
              <TestsPanel messages={s.snapshot?.messages} />
            </Show>
            <Show when={s.inspectorTab === 'workflows'}>
              <WorkflowsPanel project={project()} />
            </Show>
          </div>
        </aside>
      </Show>

      {/* 6. Bottom Status Bar */}
      <StatusBar
        connected={s.connected}
        plan={s.status?.plan}
        context={s.snapshot?.context}
        diffCount={s.snapshot?.diffs?.length || 0}
        testStatus={testStatus()}
      />

      {/* Provider Modal */}
      <Show when={s.provider}>
        <Modal returnFocus={providerOpener} busy={s.busy} onClose={() => set({ provider: null, key: '' })}>
          <section class="modal" role="dialog" aria-modal="true" aria-labelledby="provider-title">
            <button class="modal-close" disabled={s.busy} aria-label="Close connection settings" onClick={() => set({ provider: null, key: '' })}>
              <Icon name="close" />
            </button>
            <div class="feature-index">SECURE LOCAL CONNECTION</div>
            <h2 id="provider-title">Connect {providerNames[s.provider]}</h2>
            <p>Use your own free-tier key. It is encrypted for your Windows account; LocalAgent never displays a saved key.</p>
            <form onSubmit={saveProvider}>
              <label for="provider-key">API key</label>
              <input
                id="provider-key"
                type="password"
                value={s.key}
                onInput={(e) => set('key', e.currentTarget.value)}
                autocomplete="new-password"
                spellcheck="false"
                autofocus
                required
              />
              <Show when={s.provider !== 'openrouter'}>
                <label class="checkbox-label">
                  <input
                    type="checkbox"
                    checked={s.confirmed}
                    onChange={(e) => set('confirmed', e.currentTarget.checked)}
                    required
                  />
                  {s.provider === 'gemini' ? 'I confirm billing is disabled for this Gemini project.' : 'I confirm this Groq organization uses the free plan.'}
                </label>
              </Show>
              <button class="primary full" disabled={s.busy}>
                {s.busy ? 'Saving and checking metadata…' : 'Save connection'}
              </button>
            </form>
            <button
              type="button"
              class="text-button disconnect"
              disabled={s.busy}
              onClick={() =>
                action(async () => {
                  await api('providers/' + s.provider, { remove: true });
                  set({ provider: null, key: '', notice: 'Provider disconnected in LocalAgent.' });
                  set('status', await api('status'));
                })
              }
            >
              Disconnect provider
            </button>
            <Show when={s.error}><p role="alert" class="field-error">{s.error}</p></Show>
          </section>
        </Modal>
      </Show>

      {/* Switch Project Modal */}
      <Show when={s.showProjectModal}>
        <Modal busy={s.busy} onClose={() => set('showProjectModal', false)}>
          <section class="modal" role="dialog" aria-modal="true" aria-labelledby="switch-project-title">
            <button class="modal-close" aria-label="Close project switcher" onClick={() => set('showProjectModal', false)}>
              <Icon name="close" />
            </button>
            <div class="feature-index">SWITCH LOCAL PROJECT</div>
            <h2 id="switch-project-title">Open or switch project</h2>
            <div class="side-scroll" style="max-height: 200px; margin: 12px 0;">
              <For each={s.projects}>
                {(p) => (
                  <button
                    class={'task-row ' + (s.project === p.id ? 'sel' : '')}
                    onClick={() => chooseProject(p.id)}
                  >
                    <span class="task-title">{p.name}</span>
                    <span class="meta">{p.path}</span>
                  </button>
                )}
              </For>
            </div>
            <form onSubmit={openProject}>
              <Show when={desktop}>
                <button type="button" class="secondary full native-folder" onClick={chooseFolder}>
                  <Icon name="folder" /> Choose folder from disk… (Ctrl+O)
                </button>
              </Show>
              <label for="modal-project-path">Or enter directory path</label>
              <input
                id="modal-project-path"
                type="text"
                value={s.path}
                onInput={(e) => set('path', e.currentTarget.value)}
                placeholder="D:\Projects\my-project"
                required
              />
              <button class="primary full" style="margin-top: 10px;" disabled={s.busy}>
                Open project
              </button>
            </form>
          </section>
        </Modal>
      </Show>
    </div>
  );
}

render(() => <App />, document.getElementById('root'));
