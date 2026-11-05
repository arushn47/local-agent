import { For, Show, createMemo } from 'solid-js';
import { commandOutcome, isTestCommand } from './tool-outcomes.mjs';

export function extractTests(messages) {
  const tests = [];
  let idx = 0;
  for (const m of messages || []) {
    for (const p of m.parts || []) {
      if (p.type === 'tool' && p.tool === 'bash') {
        const cmd = p.command || '';
        if (isTestCommand(cmd)) {
          tests.push({
            id: `test_${idx++}`,
            command: cmd,
            exit: p.exit,
            passed: commandOutcome(p).kind === 'pass',
            outcome: commandOutcome(p),
            output: p.output || '',
            status: p.status
          });
        }
      }
    }
  }
  return tests;
}

export function TestsPanel(props) {
  const tests = createMemo(() => extractTests(props.messages));
  const latest = createMemo(() => tests().at(-1));

  return (
    <div class="tests-panel">
      <div class="tests-head">
        <span class="tests-title">Test results ({tests().length})</span>
        <Show when={latest()}>
          <span class={'test-status-pill ' + latest().outcome.kind}>
            {latest().outcome.kind === 'pass' ? '● Last run passed' : latest().outcome.kind === 'fail' ? '● Last run failed' : '● Last run ' + latest().outcome.label}
          </span>
        </Show>
      </div>

      <div class="tests-scroll">
        <Show when={tests().length} fallback={
          <div class="tests-empty">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M9 11l3 3L22 4 M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
            </svg>
            <h3>No test results yet</h3>
            <p>Ask the agent to run the project's test suite. Command outcomes and failure logs will appear here.</p>
          </div>
        }>
          <For each={[...tests()].reverse()}>
            {(t) => (
              <div class={'test-card ' + t.outcome.kind}>
                <div class="test-card-top">
                  <span class={'result-badge result-' + t.outcome.kind}>
                    {t.passed ? '✓ PASSED' : t.outcome.kind === 'fail' ? `✕ FAILED (${t.outcome.label})` : t.outcome.label}
                  </span>
                  <code class="test-command">{t.command}</code>
                </div>
                <Show when={t.output}>
                  <pre class="test-output">{t.output}</pre>
                </Show>
              </div>
            )}
          </For>
        </Show>
      </div>
    </div>
  );
}

