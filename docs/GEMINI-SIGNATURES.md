# Gemini signature compatibility — verified 23 October 2026

## Root cause and request path

Google's compatible API returns opaque continuation metadata in `tool_calls[].extra_content.google.thought_signature`. It must be replayed with the corresponding historical function call. The generic OpenAI-compatible OpenCode/OmniRoute chain did not retain that extension on replay. LocalAgent's previous guard cloned outgoing messages and forwarded incoming bytes, but did not recover the lost metadata. Google consequently accepted the first tool call and rejected later function-call history.

OmniRoute 3.8.50 already has this concept in its native Gemini path: `gemini-to-openai.ts` caches signatures and `openai-to-gemini.ts` restores them under connection-scoped tool IDs using `geminiThoughtSignatureStore.ts`. Our provider is a generic compatible node and never enters that native transformation path. The installed default native Gemini executor also builds Google's URL directly rather than honoring our guard's connection base URL. Switching blindly would bypass the existing cost boundary. No upstream installation or SDK was patched.

## Narrow boundary adapter

`src/gemini-signatures.mjs` observes Gemini response metadata before forwarding chunks. It reconstructs fragmented tool calls, including Google frames without numeric indexes, and retains only signatures issued with actual calls. On later requests it reattaches metadata using a hash of credential identity, model, tool-call ID, function name, and canonical arguments.

Parallel calls can share a signed anchor: an unsigned companion is accepted only when it was observed in that exact provider response group and its signed anchor is retained in the request history. OpenCode may split the group's calls across assistant messages. Signatures are not copied onto other calls or invented. Unknown or expired metadata returns a distinct 422 continuation error.

The cache is memory-only, bounded to 1,000 entries with a 30-minute TTL and per-signature size cap. It does not parse thought text, enable thought summaries, persist signatures, or add them to diagnostic logs. A gateway restart or expired cache can prevent resuming an older Gemini tool session; the error instructs the user to start a new session. This is a deliberate limitation, not a guarantee of durable provider sessions.

Replay occurs before the existing context budget check, so restored metadata consumes the budget. Authentication, free-tier attestations, model allowlists, zero-price caps, context accounting, and bounded coding checks remain active. No validator sentinel, weakened validation, or paid route was introduced.

## Evidence

- 39 regression tests pass, including existing context, auth, free-model, zero-price and quota checks.
- Signature regressions cover fragmentation, missing indexes, parallel groups, split assistant messages, credential/model/argument isolation, expiration, and fail-closed behavior.
- The first normal coding check completed using Gemini and Groq, exposing the parallel-call issue. It is not used as proof of Gemini-only success.
- The first pinned Gemini-only check stopped on missing metadata. Its report/diff are retained as `validation/gemini-only/attempt-1-*`.
- After the framing correction, a fresh pinned Gemini-only session completed: read source, edit `double(n)`, write two focused tests, run `node --test` itself with exit 0, and return a final completion. No alternate provider was allowed by that verification route.
- Final evidence: `validation/gemini-only/report.json`, `routing.json`, `agent-tests.txt`, and `source.diff`. The report records actual provider/model and upstream statuses.

The initial normal check and the two bounded pinned checks were separate verification steps; no failed coding session was repeatedly resumed. Model quota was not deliberately exhausted. General failover and quota-exhaustion recovery are not claimed.

## Reproduce

1. `npm test` (local deterministic tests; no inference).
2. `npm start`; wait for `ready: true`.
3. `node scripts/verify-gemini-coding.mjs` (one Gemini-only task, new disposable directory each run, stops on an error or after 120 seconds).

The verification reads local credentials but does not print them. Reports contain no signature values or hidden reasoning.

## References

- [Google thinking/signature documentation](https://ai.google.dev/gemini-api/docs/thinking).
- [Google OpenAI compatibility](https://ai.google.dev/gemini-api/docs/openai).
- Installed OmniRoute 3.8.50 source: `open-sse/services/geminiThoughtSignatureStore.ts`, `translator/response/gemini-to-openai.ts`, `translator/request/openai-to-gemini.ts`, and `executors/default.ts`.
