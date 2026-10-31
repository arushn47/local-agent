import {Show} from 'solid-js';

export function ContextUsage(props) {
  const usage=()=>props.context;
  const count=()=>usage()?.inputIncludingCache ?? usage()?.inputTokens;
  return <details class="context-usage">
    <summary>Context · <Show when={count()!=null} fallback="usage unavailable">{count()?.toLocaleString()} last input tokens</Show></summary>
    <details class="context-technical"><summary>Technical details</summary><p>Automatic compaction is configured in OpenCode; guard budgets remain enforced. Manual compaction is unavailable in the pinned coding engine.</p></details>
    <p><Show when={usage()?.source==='opencode-reported'} fallback="No completed request with token usage is available.">
      Last completed request, reported by OpenCode; includes cached input when supplied. This is not a live measurement of the next request.
    </Show></p>
    <p>Current occupancy, percentage, and conversation/file/system breakdown are unavailable. The routing alias does not identify the underlying active model here. Guard budgets remain enforced.</p>
  </details>;
}
