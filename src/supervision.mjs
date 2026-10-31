import { ProgressBudget } from './context.mjs';

// Shared by CLI and future server task launches. Does not own the agent loop.
export function superviseAgent(child, { deadlineMs = 120000, onStop = () => {} } = {}) {
  const progress = new ProgressBudget(); let pending = '', stopped = false;
  const stop = code => { if (stopped) return; stopped = true; child.kill(); onStop(code); };
  const timer = setTimeout(() => stop('task_deadline_exceeded'), deadlineMs);
  const consume = chunk => {
    pending += chunk.toString();
    if (Buffer.byteLength(pending) > 2 * 1024 * 1024) return stop('agent_event_too_large');
    const lines = pending.split('\n'); pending = lines.pop();
    for (const line of lines) {
      let event; try { event = JSON.parse(line); } catch { continue; }
      const overflow = event.error?.name === 'ContextOverflowError';
      const compaction = event.type === 'text' && /conversation was compacted/i.test(event.part?.text || '');
      if (event.type === 'step_start' || overflow || compaction) {
        const reason = progress.observe({ overflow, compaction, size: event.part?.text?.length || 0 });
        if (reason) stop(overflow ? 'context_overflow' : 'progress_budget_exhausted');
      }
    }
  };
  child.stdout.on('data', consume);
  const dispose = () => { clearTimeout(timer); child.stdout.removeListener('data', consume); };
  child.once('exit', dispose); child.once('error', dispose);
  return dispose;
}
