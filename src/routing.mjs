import { GeminiSignatures, callKey } from './gemini-signatures.mjs';
import { hash } from './telemetry.mjs';

// Evidence is directional and model/version specific. Discovery never creates edges.
export const verifiedEdges = Object.freeze([Object.freeze({
  from: 'gemini/gemini-3.5-flash-lite', to: 'openrouter/cohere/north-mini-code:free',
  opencode: '1.18.31', omniroute: '3.8.50', profile: 'text-function-tools',
  evidence: 'validation/cross-provider/gemini-openrouter-1792713474750/failover.json',
})]);
export const targetId = (provider, model) => `${provider}/${model}`;
export const canContinue = (from, to) => from === to || verifiedEdges.some(e => e.from === from && e.to === to);

export function compilePlan(config, catalog) {
  const candidates = config.routingOrder.flatMap(provider => {
    const entry = catalog.providers[provider];
    if (!entry?.enabled || !entry.allowed) return [];
    return entry.models.filter(model => {
      const cap = entry.capabilities?.[model];
      return cap?.codingApproved && cap.tools && cap.contextWindow >= 32768;
    }).map(model => ({ provider, model, contextWindow: entry.capabilities[model].contextWindow }));
  });
  const primary = candidates[0];
  // Every ordered pair must be safe, including after the fallback has emitted tools.
  // Reverse edges need not exist: guard provenance rejects an unsafe return to primary.
  const targets = primary ? [primary, ...candidates.slice(1).filter(t => canContinue(targetId(primary.provider, primary.model), targetId(t.provider, t.model)))] : [];
  return { version: 1, targets, excluded: candidates.filter(t => !targets.includes(t)).map(t => ({ ...t, reason: 'unverified_continuation' })) };
}

// Reuse the tested fragmented/indexless SSE collector; store only call hashes.
export class ContinuationLedger extends GeminiSignatures {
  rememberGroup(scope, calls) {
    for (const call of calls) {
      const key = callKey('', call);
      if (key) this.entries.set(key, { scope, expires: this.now() + this.ttlMs });
    }
    while (this.entries.size > this.limit) this.entries.delete(this.entries.keys().next().value);
  }
  scopeFor(provider, model, credential) { return { target: targetId(provider, model), credential: hash(credential || 'local') }; }
  assertHistory(destination, messages) {
    const ids = new Set(messages.flatMap(m => m.tool_calls || []).map(c => c.id));
    if (messages.some(m => m.role === 'tool' && !ids.has(m.tool_call_id))) throw new Error('unverified_continuation');
    for (const call of messages.flatMap(m => m.tool_calls || [])) {
      const entry = this.entries.get(callKey('', call));
      if (!entry || entry.expires <= this.now() || !canContinue(entry.scope.target, destination.target) || (entry.scope.target === destination.target && entry.scope.credential !== destination.credential)) throw new Error('unverified_continuation');
    }
  }
}
