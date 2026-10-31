import { createServer } from 'node:http';
import { timingSafeEqual, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { loadConfig, loadEnvironment, secrets, guardToken, stateDir } from './config.mjs';
import { loadCatalog } from './catalog.mjs';
import { PROVIDER_BASES, providerKey, guardBody, providerEligibility } from './policy.mjs';
import { contextMetadata, quotaMetadata, record, readEvents } from './telemetry.mjs';
import { requestBudget } from './context.mjs';
import { GeminiSignatures } from './gemini-signatures.mjs';
import { ContinuationLedger } from './routing.mjs';
import { getBudgetLedger } from './workspace/budget-ledger.mjs';

export function tokenMatches(received, expected) {
  const a = Buffer.from(received || ''); const b = Buffer.from(expected || '');
  return a.length === b.length && timingSafeEqual(a, b);
}
function send(res, status, value) { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); }
async function readBody(req) {
  let size = 0; const chunks = [];
  for await (const chunk of req) { size += chunk.length; if (size > 1024 * 1024) throw new Error('body_too_large'); chunks.push(chunk); }
  return JSON.parse(Buffer.concat(chunks).toString());
}

export function createGuard({ config, env = loadEnvironment, secret, catalog = loadCatalog, budgetLedger = getBudgetLedger(), fetcher = fetch, auditPath = join(stateDir, 'routing.jsonl'), runtimeState = () => ({ apiVersion:1, stage:'guard_only', ready:false }) }) {
  const signatures = new GeminiSignatures();
  const ledger = new ContinuationLedger();
  return createServer(async (req, res) => {
    const path = req.url;
    if (path === '/api/v1/runtime' && req.method === 'GET') {
      if (!tokenMatches(req.headers.authorization, `Bearer ${guardToken(secret, 'admin')}`)) return send(res, 401, { error:'unauthorized' });
      return send(res, 200, runtimeState());
    }
    if (path === '/health' && req.method === 'GET') return send(res, 200, { healthy: true, faultInjection: false });
    if (path === '/status' && req.method === 'GET') {
      if (!tokenMatches(req.headers.authorization, `Bearer ${guardToken(secret, 'admin')}`)) return send(res, 401, { error: 'unauthorized' });
      const credentials = env(); const discovered = catalog();
      return send(res, 200, { catalogAt: discovered.discoveredAt, expiresAt: discovered.expiresAt, providers: Object.fromEntries(Object.entries(discovered.providers).map(([name, entry]) => [name, { ...entry, ...providerEligibility(name, credentials) }])), recent: readEvents(auditPath).slice(-30), budget: budgetLedger?.getStatus() });
    }
    if (path === '/budget' && req.method === 'GET') {
      if (!tokenMatches(req.headers.authorization, `Bearer ${guardToken(secret, 'admin')}`)) return send(res, 401, { error: 'unauthorized' });
      return send(res, 200, budgetLedger?.getStatus());
    }
    if (path === '/budget/approve' && req.method === 'POST') {
      if (!tokenMatches(req.headers.authorization, `Bearer ${guardToken(secret, 'admin')}`)) return send(res, 401, { error: 'unauthorized' });
      const b = await readBody(req);
      return send(res, 200, budgetLedger?.approveBudgetIncrease(b?.workflowId, b?.additionalAmountUsd));
    }
    const match = path?.match(/^\/egress\/(gemini|groq|openrouter|ollama)\/v1\/(models|chat\/completions)$/);
    if (!match) return send(res, 404, { error: 'unknown_endpoint' });
    const [, provider, endpoint] = match;
    if (!tokenMatches(req.headers.authorization, `Bearer ${guardToken(secret, provider)}`)) return send(res, 401, { error: 'unauthorized' });
    const discovered = catalog(); const credentials = env(); const entry = discovered.providers[provider];
    if (!entry?.enabled || !entry.allowed || !providerEligibility(provider, credentials).allowed) return send(res, 503, { error: { message: 'Provider is not admitted by LocalAgent policy', type: 'policy_blocked' } });
    if (provider !== 'ollama' && (!Number.isFinite(Date.parse(discovered.expiresAt)) || Date.parse(discovered.expiresAt) <= Date.now())) return send(res, 503, { error: { message: 'Refresh the expired cloud model catalog', type: 'policy_blocked' } });
    if (endpoint === 'models' && req.method === 'GET') return send(res, 200, { object: 'list', data: entry.models.map(id => ({ id, object: 'model', owned_by: provider, context_length: entry.capabilities?.[id]?.contextWindow || null, supported_parameters: ['tools'] })) });
    if (endpoint !== 'chat/completions' || req.method !== 'POST') return send(res, 405, { error: 'method_not_allowed' });
    
    const requestId = randomUUID(); let body;
    const policy = budgetLedger?.policy || 'free_only';
    const admittedModels = (policy !== 'free_only' && entry.allModels?.length) ? entry.allModels : (entry.freeModels?.length ? [...new Set([...entry.models, ...entry.freeModels])] : entry.models);
    try { body = guardBody(provider, await readBody(req), admittedModels, config, credentials, { policy }); }
    catch (error) { const reason = /^[a-z_]{1,80}$/.test(error.message) ? error.message : 'invalid_json'; record(auditPath, { event: 'policy_blocked', provider, requestId, reason }); return send(res, error.message === 'body_too_large' ? 422 : 403, { error: { type: 'policy_blocked', code: reason, message: 'LocalAgent rejected this request before inference: ' + reason } }); }
    
    const continuationScope = ledger.scopeFor(provider, body.model, providerKey(provider, credentials));
    try { ledger.assertHistory(continuationScope, body.messages); }
    catch { return send(res, 422, { error: { type: 'continuation_unavailable', code: 'unverified_continuation', message: 'No verified continuation route for this tool history. Start a new session; do not retry unchanged.' } }); }
    const signatureScope = provider === 'gemini' ? signatures.scope(providerKey(provider, credentials), body.model) : null;
    if (signatureScope) {
      try { body = signatures.restore(signatureScope, body); }
      catch { return send(res, 422, { error: { type: 'signature_continuation_error', code: 'gemini_signature_unavailable', message: 'Required Gemini continuation metadata expired or was lost. Start a new session; unchanged retries cannot recover it.' } }); }
    }
    const modelCapability = entry.capabilities?.[body.model] || (entry.modelsDetailed?.[body.model] ? { contextWindow: entry.modelsDetailed[body.model].contextWindow, maxOutputTokens: entry.modelsDetailed[body.model].maxOutputTokens, tools: entry.modelsDetailed[body.model].tools } : undefined);
    const budget = requestBudget(body, modelCapability, config.outputTokens);
    if (!budget.fits) {
      record(auditPath, { event: 'context_rejected', provider, model: body.model, requestId, budget });
      // Deliberately distinct from OpenCode's automatically retried context_length_exceeded.
      return send(res, 422, { error: { type: 'context_budget_error', code: 'localagent_context_budget', message: 'Request cannot fit the verified model budget. Reduce tools or compact through OpenCode; unchanged retries will not help.', budget } });
    }

    // Atomic Budget Reservation check before dispatch
    const modelDetails = entry.modelsDetailed?.[body.model] || (entry.models?.includes(body.model) ? { id: body.model, name: body.model, tier: 'free', pricing: { prompt: 0, completion: 0, request: 0 } } : undefined);
    const reservation = budgetLedger?.reserve({
      model: modelDetails,
      estimatedInputTokens: budget.input,
      maxOutputTokens: body.max_tokens
    });
    if (reservation && !reservation.allowed) {
      record(auditPath, { event: 'budget_blocked', provider, model: body.model, requestId, reason: reservation.code });
      return send(res, 402, { error: { type: 'budget_blocked', code: reservation.code, message: reservation.reason, details: reservation.details } });
    }

    const start = Date.now();
    record(auditPath, { event: 'request', provider, model: body.model, requestId, budget, ...contextMetadata(body.messages) });
    const abort = new AbortController();
    res.once('close', () => { if (!res.writableEnded) abort.abort(); });
    try {
      const base = provider === 'ollama' ? config.providers.ollama.baseURL + '/v1' : PROVIDER_BASES[provider];
      const upstream = await fetcher(base + '/chat/completions', { method: 'POST', redirect: 'error', signal: AbortSignal.any([abort.signal, AbortSignal.timeout(600000)]), headers: { 'Content-Type': 'application/json', ...(provider === 'ollama' ? {} : { Authorization: `Bearer ${providerKey(provider, credentials)}` }) }, body: JSON.stringify(body) });
      const quota = quotaMetadata(upstream.headers, upstream.status);
      record(auditPath, { event: 'upstream_headers', provider, model: body.model, requestId, status: upstream.status, quota });
      const headers = { 'Content-Type': upstream.headers.get('content-type') || 'application/json' };
      for (const [key, value] of Object.entries(quota.headers)) headers[key] = value;
      res.writeHead(upstream.status, headers);
      let tail = ''; let usage;
      const signatureCollector = signatureScope && upstream.ok ? signatures.collector(signatureScope, body.stream === true) : null;
      const continuationCollector = upstream.ok ? ledger.collector(continuationScope, body.stream === true) : null;
      for await (const chunk of upstream.body || []) {
        signatureCollector?.push(chunk);
        continuationCollector?.push(chunk);
        if (res.destroyed) break;
        if (!res.write(chunk)) await new Promise(resolve => { res.once('drain', resolve); res.once('close', resolve); });
        tail += Buffer.from(chunk).toString('utf8');
        const lines = tail.split('\n'); tail = lines.pop().slice(-65536);
        for (const line of lines) { try { const frame = JSON.parse(line.replace(/^data:\s*/, '')); if (frame.usage) usage = frame.usage; } catch {} }
      }
      signatureCollector?.finish();
      continuationCollector?.finish();
      if (!res.destroyed) res.end();
      // Reconcile budget spend
      const tokens = usage ? Object.fromEntries(['prompt_tokens', 'completion_tokens', 'total_tokens'].filter(k => Number.isFinite(usage[k])).map(k => [k, usage[k]])) : undefined;
      let costUsd = 0;
      if (reservation?.reservationId) {
        if (tokens) {
          const rec = budgetLedger.reconcile({ reservationId: reservation.reservationId, model: modelDetails, usage: tokens });
          costUsd = rec.actualCostUsd;
        } else {
          budgetLedger.release({ reservationId: reservation.reservationId });
        }
      }
      record(auditPath, { event: res.destroyed && !res.writableEnded ? 'interrupted' : 'completed', provider, model: body.model, requestId, status: upstream.status, durationMs: Date.now() - start, tokens, costUsd });
    } catch {
      if (reservation?.reservationId) {
        budgetLedger?.release({ reservationId: reservation.reservationId });
      }
      record(auditPath, { event: 'network_error', provider, model: body.model, requestId, durationMs: Date.now() - start });
      if (!res.headersSent) send(res, 502, { error: { type: 'upstream_error', message: 'Provider connection failed' } });
      else res.destroy();
    }
  });
}

export function startGuard(config, secret, options = {}) {
  const server = createGuard({ config, secret, ...options });
  server.listen(config.guardPort, '127.0.0.1');
  return server;
}
