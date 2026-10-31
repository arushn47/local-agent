# Cross-provider validation — 2026-10-23

One directed route completed a real coding task: **Gemini 3.5 Flash Lite → OpenRouter Cohere North Mini Code (`:free`)**. This does not validate universal failover.

| Primary → fallback | Result | Evidence |
|---|---|---|
| Gemini → OpenRouter | Completed: fallback edited source, created tests, ran tests, corrected a missing test import, reran 2 tests successfully, and returned a final answer | `validation/cross-provider/gemini-openrouter-1792713474750/` |
| Gemini → Groq GPT OSS 20B | Partial continuation: same tool-result hashes, fallback edited source; real 8,000 TPM quota prevented completion within the deadline | `validation/cross-provider/gemini-groq-1792713357152/` |
| Groq → Gemini | Rejected with HTTP 422 after the injected 429. Foreign-provider tool history cannot acquire genuine Gemini signatures; signature guard retained. Primary read itself returned an error, so this is not proof of successful read continuity | `validation/cross-provider/groq-gemini-1792713490764/` |
| Any route involving Ollama | Not dispatched: local server was unreachable during fresh discovery; no admitted local models | `.localagent/failover-configuration.json` (local metadata) |
| Groq → OpenRouter; OpenRouter → Groq/Gemini | Not tested | No claim |

## Method and safeguards

`scripts/verify-cross-provider.mjs` creates temporary OmniRoute provider connections and a priority combo, with a narrowly scoped temporary inference key. A loopback verification proxy injects 429/Retry-After only after a successful primary coding response and a subsequent tool result. Actual provider requests use the unchanged production guard module: credential isolation, context checks, Gemini signature cache, confirmed free tiers, and OpenRouter zero-price caps. The successful OpenRouter candidate was explicitly selected from fresh catalog metadata; it was not added to production's approved coding pool.

The disposable project starts with `double(n)` returning `n`. OpenCode must edit it, write two Node tests, and invoke `node --test` itself. Permissions permit file reads/edits and only that exact shell command. Each task has a 120-second deadline and the proxy limits requests to 16. Temporary keys, combos, connections and provider nodes were deleted successfully after every run; production configuration and safeguards were not changed.

The first Gemini→Groq run exposed automatic SDK/router retries on real quota failures. It stopped within its deadline, but made multiple real 429 requests. The verifier was subsequently tightened to suppress further upstream coding requests to a provider after its first real failure. This change is verification-only, not a production retry-policy fix.

The first OpenRouter attempt was stopped because the verifier incorrectly treated a rejected auxiliary title request as a failure of the coding route. The corrected attempt separates that auxiliary failure from coding eligibility. Unknown request fields remain rejected by the guard. The final report was corrected offline to inspect the **last** test result, preserving the initial failed test and subsequent successful repair; no extra inference was needed.

## Continuity evidence

In the successful route, Gemini performed the initial read. After injected 429, the exact hashed tool-call ID and tool-result content appeared in the OpenRouter request. Every later coding response was OpenRouter. `actions.json` contains sanitized action timestamps and both test results; `source.diff` records the actual source and test changes; `agent-tests.txt` records 2 passing tests; `routing.json` records routing decisions and context hashes. Whole-message hashes differ across provider transformations, so only retained tool results, one OpenCode session, and demonstrated behavior support the continuity claim. No hidden reasoning or signatures are published in these evidence files.

## Cost and quota

Only user-confirmed billing-disabled Gemini, free-plan Groq, and a currently zero-priced `:free` OpenRouter model were used. OpenRouter requests forced all supported price caps to zero. Expected inference charge: **$0**. Billing-account statements were not available, and no authoritative per-request monetary charge was captured: actual settled charges are not independently audited. Injected failures made no provider calls. Groq returned real quota headers and Retry-After values; OpenRouter quota headers remained unknown. Token telemetry where supplied is retained in `guard.jsonl`; it is not a billing statement.

## Remaining blockers

* Groq's 8K TPM allowance is too small for repeated default OpenCode prompts (~6K actual input tokens per request). A smaller existing OpenCode agent/tool profile and quota-aware scheduling should be evaluated before another live Groq task.
* Gemini cannot safely resume unsigned foreign-provider tool calls through the current signature path. Do not synthesize signatures or use validation bypass sentinels. A verified upstream cross-provider history mechanism is required before enabling that direction.
* Restore Ollama availability and verify real configured context capacity before attempting local fallback. Previously installed 8K aliases must not be advertised as cloud-sized contexts.
* Production discovery still ranks restricted ThinkingMachines free models ahead of the explicitly tested Cohere candidate. Do not equate metadata discovery with coding approval.

Regression verification: **39/39 tests pass**, including context, security, pricing, quota, and signature tests (`validation/failover-final-tests.txt`). No production source files were modified by this validation.
