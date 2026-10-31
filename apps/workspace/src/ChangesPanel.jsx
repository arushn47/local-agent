import { For, Show } from 'solid-js';

export function ChangesPanel(props) {
  const display = (file) => props.displayPath ? props.displayPath(file) : file;

  return (
    <div class="changes-panel">
      <div class="changes-head">
        <span class="changes-title">Session changes ({props.diffs?.length || 0})</span>
        <span class="subtab-meta">file modifications by agent</span>
      </div>
      <div class="changes-scroll">
        <Show when={props.diffs?.length} fallback={
          <div class="changes-empty">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M8 5l-6 7 6 7 M16 5l6 7-6 7" />
            </svg>
            <h3>No changes in this session yet</h3>
            <p>Files created or modified by the agent will appear here with line-by-line diffs.</p>
          </div>
        }>
          <For each={props.diffs}>
            {(d) => (
              <details class="diff-card" open>
                <summary class="diff-card-head" title={d.file}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                    <path d="M6 3v12a4 4 0 0 0 4 4h8" />
                    <path d="M15 16l3 3-3 3" />
                  </svg>
                  <span class="diff-filename">{display(d.file)}</span>
                  <Show when={!d.snapshot}>
                    <span class="diff-stats">
                      <Show when={d.additions}><span class="add">+{d.additions}</span> </Show>
                      <Show when={d.deletions}><span class="del">−{d.deletions}</span></Show>
                    </span>
                  </Show>
                </summary>
                <div class="diff-card-body">
                  <Show when={d.patch} fallback={
                    <div class="diff-fallback">
                      <Show when={!d.snapshot && d.before}>
                        <div class="diff-section-label">Before</div>
                        <pre class="diff-pre before">{d.before}</pre>
                      </Show>
                      <div class="diff-section-label">{d.snapshot ? 'Written content · baseline unavailable' : 'After'}</div>
                      <pre class="diff-pre after">{d.after}</pre>
                    </div>
                  }>
                    <pre class="diff-pre patch">{display(d.patch)}</pre>
                  </Show>
                </div>
              </details>
            )}
          </For>
        </Show>
      </div>
    </div>
  );
}

