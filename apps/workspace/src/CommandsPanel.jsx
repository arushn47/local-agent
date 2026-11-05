import { For, Show, createMemo } from 'solid-js';
import { commandOutcome } from './tool-outcomes.mjs';

export function extractCommands(messages, permissions = []) {
  const list = [];
  let idx = 0;
  for (const m of messages || []) {
    const timeStr = m.time ? new Date(m.time).toLocaleTimeString() : undefined;
    for (const p of m.parts || []) {
      if (p.type === 'tool' && p.tool === 'bash') {
        list.push({
          id: `cmd_${idx++}`,
          command: p.command || p.title || 'command',
          status: p.status || (p.exit === 0 ? 'completed' : p.exit !== undefined ? 'error' : 'running'),
          exit: p.exit,
          output: p.output || '',
          outcome: commandOutcome(p),
          time: timeStr
        });
      }
    }
  }
  for (const perm of permissions || []) {
    if (perm.permission !== 'bash') continue;
    list.push({
      id: `perm_${perm.id}`,
      command: perm.patterns?.join(', ') || perm.permission || 'permission needed',
      status: 'awaiting_permission',
      exit: undefined,
      output: `Permission needed: ${perm.permission}`,
      isPermission: true,
      permissionId: perm.id
    });
  }
  return list;
}

export function CommandsPanel(props) {
  const commands = createMemo(() => extractCommands(props.messages, props.permissions));

  return (
    <div class="commands-panel">
      <div class="commands-head">
        <span class="commands-title">Agent commands ({commands().length})</span>
        <span class="subtab-meta">executed via OpenCode agent</span>
      </div>
      <div class="commands-scroll">
        <Show when={commands().length} fallback={<div class="commands-empty">No commands have been run in this task yet.</div>}>
          <For each={commands()}>
            {(cmd) => (
              <div class={'command-card ' + cmd.status}>
                <div class="command-row">
                  <Show when={cmd.status === 'awaiting_permission'}>
                    <span class="cmd-badge warn">● permission</span>
                  </Show>
                  <Show when={!cmd.isPermission}><span class={'cmd-badge ' + cmd.outcome.kind}>{cmd.outcome.label}</span></Show>
                  <code class="command-text">{cmd.command}</code>
                  <Show when={cmd.time}>
                    <span class="command-time">{cmd.time}</span>
                  </Show>
                </div>
                <Show when={cmd.output}>
                  <pre class="command-output">{cmd.output}</pre>
                </Show>
              </div>
            )}
          </For>
        </Show>
      </div>
    </div>
  );
}

export function CommandsDock(props) {
  const commands = createMemo(() => extractCommands(props.messages, props.permissions));

  return (
    <section class={'dock ' + (props.expanded ? 'expanded' : 'collapsed')} aria-label="Commands">
      <div class="dock-head" onClick={props.onToggle}>
        <span class="tabmini">Commands</span>
        <span class="badge">{commands().length}</span>
        <span class="dock-caption">agent-issued only · no separate shell</span>
        <span class="spacer" />
        <button
          type="button"
          class="iconbtn"
          aria-label={props.expanded ? 'Collapse commands dock' : 'Expand commands dock'}
          onClick={(e) => {
            e.stopPropagation();
            props.onToggle();
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
            <path d={props.expanded ? 'M6 9l6 6 6-6' : 'M6 15l6-6 6 6'} />
          </svg>
        </button>
      </div>
      <Show when={props.expanded}>
        <div class="dock-body">
          <Show when={commands().length} fallback={<div class="dock-empty">No agent commands executed yet.</div>}>
            <For each={commands()}>
              {(cmd) => (
                <div class="dock-line">
                  <Show when={cmd.time}><span class="dim">{cmd.time} </span></Show>
                  <Show when={cmd.status === 'awaiting_permission'}>
                    <span class="warn">●</span> awaiting permission: {cmd.command}
                  </Show>
                  <Show when={!cmd.isPermission}><span class={cmd.outcome.kind}>{cmd.command}</span> <span class="dim">· {cmd.outcome.label}</span></Show>
                </div>
              )}
            </For>
          </Show>
        </div>
      </Show>
    </section>
  );
}

