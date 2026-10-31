import { createServer } from 'node:http';
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { runtime, proxyPort, primary } from './common.mjs';

mkdirSync(runtime, { recursive: true });
let armed = false;
let successfulPrimary = 0;
let requests = 0;
let marker = '';
const events = [];
function record(event) {
  const row = { timestamp: new Date().toISOString(), ...event };
  events.push(row);
  appendFileSync(join(runtime, 'routing.jsonl'), JSON.stringify(row) + '\n');
  console.log(JSON.stringify(row));
}
function reply(res, status, body) { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); }

createServer(async (req, res) => {
  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const bytes = Buffer.concat(chunks);
    let body;
    try { body = bytes.length ? JSON.parse(bytes.toString('utf8')) : {}; } catch { return reply(res, 400, { error: 'Invalid JSON' }); }
    if (req.url === '/__control') {
      if (req.method === 'POST') {
        armed = body.armed === true; successfulPrimary = 0; requests = 0; events.length = 0;
        marker = typeof body.marker === 'string' ? body.marker : '';
        record({ event: 'control', armed });
      }
      return reply(res, 200, { armed, successfulPrimary, events });
    }
    if (req.url === '/health') return reply(res, 200, { healthy: true, armed });
    const isCompletion = req.url?.endsWith('/chat/completions');
    const requestId = ++requests;
    if (isCompletion) {
      const messages = body.messages || [];
      const text = JSON.stringify(messages);
      record({ event: 'request', requestId, model: body.model, messageCount: messages.length,
        toolResults: messages.filter(m => m.role === 'tool').length,
        hasPriorToolCalls: messages.some(m => m.tool_calls?.length),
        toolsOffered: (body.tools || []).map(t => t.function?.name),
        markerInContext: Boolean(marker && text.includes(marker)),
        promptHash: createHash('sha256').update(text).digest('hex'),
      });
      if (armed && body.model === primary && successfulPrimary >= 1) {
        record({ event: 'injected_rate_limit', requestId, model: body.model, status: 429 });
        res.setHeader('Retry-After', '120');
        return reply(res, 429, { error: { message: 'Controlled demo: primary model rate limited after a successful request', type: 'rate_limit_exceeded', code: 'rate_limit_exceeded' } });
      }
      // Both models are real Ollama models. Bound generation and disable optional thinking.
      body.think = false;
      body.reasoning_effort = 'none';
      body.temperature = 0;
      body.max_tokens = Math.min(body.max_tokens || 1800, 1800);
    }
    const abort = new AbortController();
    res.on('close', () => { if (!res.writableEnded) abort.abort(); });
    const upstream = await fetch(`http://127.0.0.1:11434${req.url}`, {
      method: req.method, headers: { 'Content-Type': 'application/json' },
      body: ['GET','HEAD'].includes(req.method) ? undefined : isCompletion ? JSON.stringify(body) : bytes,
      signal: abort.signal,
    });
    res.writeHead(upstream.status, { 'Content-Type': upstream.headers.get('content-type') || 'application/json' });
    let responseText = '';
    for await (const chunk of upstream.body || []) { responseText += Buffer.from(chunk).toString('utf8'); res.write(chunk); }
    res.end();
    if (isCompletion) {
      if (upstream.ok && body.model === primary) successfulPrimary++;
      const models = new Set(); const tools = new Set(); const finishes = new Set(); let contentChars = 0;
      for (const line of responseText.split('\n')) {
        const value = line.startsWith('data:') ? line.slice(5).trim() : line.trim();
        try {
          const frame = JSON.parse(value); if (frame.model) models.add(frame.model);
          for (const choice of frame.choices || []) {
            const delta = choice.delta || choice.message || {};
            contentChars += (delta.content || '').length;
            for (const call of delta.tool_calls || []) if (call.function?.name) tools.add(call.function.name);
            if (choice.finish_reason) finishes.add(choice.finish_reason);
          }
        } catch {}
      }
      record({ event: 'upstream_completed', requestId, requestedModel: body.model, status: upstream.status,
        responseModels: [...models], toolNames: [...tools], finishReasons: [...finishes], contentChars });
    }
  } catch (error) {
    record({ event: 'proxy_error', message: error.message });
    if (!res.headersSent) reply(res, 502, { error: { message: 'Local Ollama request failed', type: 'upstream_error' } });
    else res.end();
  }
}).listen(proxyPort, '127.0.0.1', () => console.log(`Local fault proxy listening on ${proxyPort}`));
