import { createHash } from 'node:crypto';
const digest = value => createHash('sha256').update(value).digest('hex');
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])]));
  return value;
}
export function callKey(scope, call) {
  if (!call.id || !call.function?.name) return null;
  let args; try { args = JSON.parse(call.function.arguments || '{}'); } catch { return null; }
  return digest(JSON.stringify([scope, call.id, call.function.name, canonical(args)]));
}
const signatureOf = call => call.extra_content?.google?.thought_signature;
export class GeminiSignatures {
  constructor({ now = Date.now, ttlMs = 30 * 60 * 1000, limit = 1000 } = {}) { this.now = now; this.ttlMs = ttlMs; this.limit = limit; this.entries = new Map(); }
  scope(key, model) { return digest(key + '\0' + model); }
  remember(scope, call) {
    const key = callKey(scope, call); const signature = signatureOf(call);
    if (!key || typeof signature !== 'string' || !signature || signature.length > 262144) return;
    this.entries.set(key, { signature, expires: this.now() + this.ttlMs });
    for (const [id, entry] of this.entries) if (entry.expires <= this.now()) this.entries.delete(id);
    while (this.entries.size > this.limit) this.entries.delete(this.entries.keys().next().value);
  }
  rememberGroup(scope, calls) {
    const anchor = calls.find(call => signatureOf(call));
    for (const call of calls) this.remember(scope, call);
    if (!anchor) return;
    const anchorKey = callKey(scope, anchor);
    for (const call of calls) {
      const key = callKey(scope, call);
      if (key && !signatureOf(call)) this.entries.set(key, { anchor: anchorKey, expires: this.now() + this.ttlMs });
    }
    while (this.entries.size > this.limit) this.entries.delete(this.entries.keys().next().value);
  }
  restore(scope, body) {
    const result = structuredClone(body);
    for (const message of result.messages || []) {
    for (const call of message.tool_calls || []) {
      if (signatureOf(call)) continue;
      const key = callKey(scope, call); const entry = this.entries.get(key);
      if (!entry || entry.expires <= this.now()) throw new Error('gemini_signature_unavailable');
      if (entry.anchor) continue;
      call.extra_content = { ...call.extra_content, google: { ...call.extra_content?.google, thought_signature: entry.signature } };
    }
    for (const call of message.tool_calls || []) {
      if (signatureOf(call)) continue;
      const entry = this.entries.get(callKey(scope, call));
      if (!entry?.anchor || entry.expires <= this.now() || !(result.messages || []).flatMap(m => m.tool_calls || []).some(anchor => callKey(scope, anchor) === entry.anchor && signatureOf(anchor))) throw new Error('gemini_signature_unavailable');
    }
    }
    return result;
  }
  collector(scope, streaming = true) {
    const calls = new Map(); const slots = new Map(); const decoder = new TextDecoder(); let pending = '';
    const frame = value => {
      for (const choice of value.choices || []) {
        for (const [position, part] of ((choice.delta || choice.message || {}).tool_calls || []).entries()) {
          const slot = `${choice.index || 0}:${part.index ?? position}`;
          const index = part.id ? `${choice.index || 0}:id:${part.id}` : slots.get(slot) || slot;
          const prior = calls.get(slots.get(slot));
          const call = calls.get(index) || (prior && !prior.id ? prior : { function: { arguments: '' } });
          if (prior && !prior.id && slots.get(slot) !== index) calls.delete(slots.get(slot));
          slots.set(slot, index);
          if (part.id) call.id = part.id;
          if (part.function?.name) call.function.name = part.function.name;
          if (part.function?.arguments) call.function.arguments += part.function.arguments;
          if (signatureOf(part)) call.extra_content = part.extra_content;
          calls.set(index, call);
        }
        if (choice.finish_reason) this.rememberGroup(scope, [...calls.values()]);
      }
    };
    return {
      push: chunk => {
        pending += decoder.decode(chunk, { stream: true });
        if (pending.length > 2 * 1024 * 1024) throw new Error('gemini_signature_frame_too_large');
        if (streaming) { const lines = pending.split('\n'); pending = lines.pop(); for (const line of lines) if (line.startsWith('data:')) { const data = line.slice(5).trim(); if (data && data !== '[DONE]') frame(JSON.parse(data)); } }
      },
      finish: () => { if (!streaming && pending.trim()) frame(JSON.parse(pending)); this.rememberGroup(scope, [...calls.values()]); },
    };
  }
}
