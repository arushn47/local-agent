// Metadata only. OpenCode owns history and compaction; never project reasoning.
export function contextSummary(messages) {
  const number = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
  const message = messages.toReversed().find(m => m.info?.role === 'assistant' &&
    m.info?.time?.completed && number(m.info.tokens?.input) !== null &&
    [m.info.tokens.input, m.info.tokens.output, m.info.tokens.cache?.read, m.info.tokens.cache?.write].some(n => number(n) > 0));
  if (!message) return {source:'unavailable', inputTokens:null, contextWindow:null, percentage:null};
  const tokens=message.info.tokens;
  const input=number(tokens.input), read=number(tokens.cache?.read), write=number(tokens.cache?.write);
  return {
    source:'opencode-reported', messageId:message.info.id,
    inputTokens:input, cacheReadTokens:read, cacheWriteTokens:write,
    // Matches upstream's disjoint input/cache accounting. Missing data is unknown.
    inputIncludingCache:read === null || write === null ? null : input + read + write,
    outputTokens:number(tokens.output),
    contextWindow:null, percentage:null,
    breakdown:null,
  };
}
