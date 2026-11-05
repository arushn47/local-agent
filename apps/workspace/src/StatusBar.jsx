import { Show } from 'solid-js';

export function StatusBar(props) {
  const primaryTarget = () => props.plan?.targets?.[0];
  const routeText = () => {
    if (!primaryTarget()) return 'no route configured';
    const t = primaryTarget();
    return `${t.model || t.provider}`;
  };

  const contextText = () => {
    const ctx = props.context;
    if (!ctx || ctx.inputTokens == null) return 'last input: unknown';
    return `last input: ${(ctx.inputIncludingCache ?? ctx.inputTokens).toLocaleString()} tokens`;
  };

  return (
    <footer class="status" aria-label="Workspace status">
      <div class="status-left">
        <span class={props.connected ? 'status-dot ok' : 'status-dot error'}>●</span>
        <span>{props.connected ? 'Local runtime' : 'Runtime disconnected'}</span>
        <span class="status-sep">·</span>
        <span class="status-policy">free-only</span>
        <Show when={primaryTarget()}>
          <span class="status-sep">·</span>
          <span class="status-route">route: {routeText()}</span>
        </Show>
      </div>

      <span class="spacer" />

      <div class="status-right">
        <Show when={props.testStatus}>
          <span class="status-item">
            tests <span class={props.testStatus.kind === 'pass' ? 'ok' : props.testStatus.kind === 'fail' ? 'fail' : 'muted'}>{props.testStatus.text}</span>
          </span>
          <span class="status-sep">·</span>
        </Show>
        <span class="status-item">changes {props.diffCount || 0}</span>
        <span class="status-sep">·</span>
        <span class="status-item">{contextText()}</span>
        <span class="status-sep opt">·</span>
        <span class="status-shortcuts opt">
          <span class="kbd">Ctrl</span>+<span class="kbd">Alt</span>+<span class="kbd">P</span> panels
        </span>
      </div>
    </footer>
  );
}

