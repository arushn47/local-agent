// Aggregate-only audit of an upstream session's tool usage. It reports counts
// and sizes, never prompts, file contents, commands, paths or reasoning, so the
// result is safe to keep as evidence.
const text = value => typeof value === 'string' ? value : '';
const normalize = command => command.trim().replace(/\s+/g, ' ');

export function auditSession(messages) {
  const tools = Object.create(null);
  const reads = new Map();
  const commands = new Map();
  let steps = 0, totalToolCalls = 0, toolOutputBytes = 0, largestToolOutputBytes = 0;
  let failedToolCalls = 0, cachedOutputs = 0, inputTokens = null;
  for (const message of messages || []) {
    const role = message?.info?.role;
    if (role === 'assistant') {
      steps++;
      const tokens = message.info?.tokens?.input;
      if (Number.isFinite(tokens)) inputTokens = tokens;
    }
    for (const part of message?.parts || []) {
      if (part?.type !== 'tool') continue;
      totalToolCalls++;
      const tool = text(part.tool) || 'unknown';
      tools[tool] = (tools[tool] || 0) + 1;
      const state = part.state || {};
      const output = text(state.output);
      const bytes = Buffer.byteLength(output, 'utf8');
      toolOutputBytes += bytes;
      if (bytes > largestToolOutputBytes) largestToolOutputBytes = bytes;
      if (/truncated|saved to .*tool_/i.test(output)) cachedOutputs++;
      if (state.status === 'completed' && Number.isFinite(state.metadata?.exit) && state.metadata.exit !== 0) failedToolCalls++;
      const input = state.input || {};
      const file = [input.filePath, input.path].find(value => typeof value === 'string' && value.trim());
      if (tool === 'read' && file) reads.set(file, (reads.get(file) || 0) + 1);
      if (tool === 'bash' && typeof input.command === 'string' && input.command.trim()) {
        const key = normalize(input.command);
        commands.set(key, (commands.get(key) || 0) + 1);
      }
    }
  }
  const duplicateReads = [...reads.values()].reduce((sum, count) => sum + Math.max(0, count - 1), 0);
  const duplicateCommands = [...commands.values()].reduce((sum, count) => sum + Math.max(0, count - 1), 0);
  return {
    steps, totalToolCalls, tools,
    toolOutputBytes, largestToolOutputBytes,
    failedToolCalls, cachedOutputs,
    uniqueFilesRead: reads.size, duplicateReads, duplicateCommands,
    // Calls that a stricter loop would usually avoid: unchanged re-reads and
    // unchanged repeated shell commands.
    avoidableCalls: duplicateReads + duplicateCommands,
    lastInputTokens: inputTokens,
  };
}

// Positive deltas mean the candidate used more than the baseline.
export function compareArms(baseline, candidate) {
  const keys = ['steps', 'totalToolCalls', 'toolOutputBytes', 'failedToolCalls', 'duplicateReads', 'duplicateCommands', 'avoidableCalls', 'lastInputTokens'];
  return Object.fromEntries(keys.map(key => {
    const before = baseline?.[key], after = candidate?.[key];
    return [key, Number.isFinite(before) && Number.isFinite(after) ? after - before : null];
  }));
}
