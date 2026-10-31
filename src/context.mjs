// Guard ceiling in the guard's own unit (UTF-8 bytes treated as tokens).
export function inputCeiling(contextWindow, outputTokens) {
  if (!Number.isInteger(contextWindow) || contextWindow <= 0) return null;
  return contextWindow - outputTokens - Math.max(512, Math.ceil(contextWindow * .05));
}
// Upstream triggers automatic compaction when its chars/4 estimate exceeds
// contextWindow - max(output, buffer). That estimate is roughly four times the
// guard's byte estimate, so upstream's default 20K buffer would only fire long
// after the guard has already rejected the request and compaction could never
// run. Derive the supported buffer/retained-token settings that make upstream
// compact first. The guard itself is never relaxed.
export function compactionSettings(contextWindow, outputTokens = 1800) {
  const usable = inputCeiling(contextWindow, outputTokens);
  if (usable === null || usable <= 0) return null;
  // Fire at 85% of the ceiling, converted from guard bytes to upstream tokens.
  const trigger = Math.floor(usable / 4 * .85);
  if (trigger <= 0) return null;
  // Keep the most recent third of the trigger verbatim; the rest is summarized.
  const keep = Math.max(1000, Math.min(Math.floor(trigger * .3), 32000));
  return { auto: true, buffer: contextWindow - trigger, keep: { tokens: keep } };
}
// UTF-8 bytes are an intentionally conservative text-token upper estimate.
// This trades some capacity for safety and includes schemas, roles and framing.
export function requestBudget(body, capability, outputDefault = 1800) {
  const bytes = value => Buffer.byteLength(JSON.stringify(value ?? null), 'utf8');
  const messageTokens = bytes(body.messages || []);
  const toolTokens = bytes(body.tools || []);
  const other = { ...body }; delete other.messages; delete other.tools;
  const overheadTokens = bytes(other) + 32 * (body.messages?.length || 0) + 256;
  const estimatedInputTokens = messageTokens + toolTokens + overheadTokens;
  const reservedOutputTokens = Math.min(body.max_completion_tokens ?? body.max_tokens ?? outputDefault, outputDefault);
  const contextWindow = capability?.contextWindow;
  const safetyMargin = Number.isInteger(contextWindow) ? Math.max(512, Math.ceil(contextWindow * .05)) : null;
  const usableInputBudget = inputCeiling(contextWindow, reservedOutputTokens);
  return { contextWindow: contextWindow || null, estimatedInputTokens, messageTokens, toolTokens, overheadTokens, reservedOutputTokens, safetyMargin, usableInputBudget, fits: Boolean(capability?.tools && Number.isInteger(contextWindow) && contextWindow > 0 && estimatedInputTokens <= usableInputBudget) };
}
export class ProgressBudget {
  constructor(maxCompactions = 2, maxRequests = 30) { this.maxCompactions = maxCompactions; this.maxRequests = maxRequests; this.requests = 0; this.compactions = 0; this.previous = Infinity; }
  observe({ compaction = false, size = 0, overflow = false } = {}) {
    if (++this.requests > this.maxRequests) return 'Request budget exhausted; resume explicitly after inspecting diagnostics.';
    if (overflow) return 'Context overflow: stop unchanged retries. Compact through OpenCode or choose a verified larger context route.';
    if (compaction) {
      if (++this.compactions > this.maxCompactions || size >= this.previous * .95) return 'Compaction made insufficient progress; reduce tool overhead or choose a larger verified route.';
      this.previous = size;
    }
    return null;
  }
}
