# Verified OpenCode + OmniRoute demonstration

Successful run: 2026-10-22T20:15:38.256Z to 2026-10-22T20:18:38.053Z (UTC).
OpenCode session: `ses_e9abeb67cffevU54R0j8tzqwBd`.

A focused bug fix in an existing duration parser: the fallback changed the marker and unit conversion factors. The fixture and tests were authored before the run; the agent performed the two production-file edits. Attempts at full parser generation with the available small local models failed.

| UTC timestamp | Observed event |
| --- | --- |
| 2026-10-22T20:16:34.317Z | Real Qwen 2.5 7B response called read; OpenCode read specification and existing source |
| 2026-10-22T20:16:34.480Z | Proxy deliberately returned HTTP 429 for the primary |
| 2026-10-22T20:16:34.556Z | OmniRoute automatically selected Qwen3 4B Instruct; received 2 prior tool results and the specification marker |
| 2026-10-22T20:17:17.635Z | OpenCode edit completed: task marker |
| 2026-10-22T20:17:24.283Z | OpenCode edit completed: unit conversion factors |
| 2026-10-22T20:18:38.053Z | Independent verification: 22/22 tests passed; specification and tests unchanged |

Switch dispatch latency: 76 ms (excludes fallback model loading/generation).

Before: 15 passed, 7 failed. After: 22 passed, 0 failed.
The model did not invoke the test command itself; the harness ran it independently after OpenCode exited.

## Evidence

- [Routing report](routing-report.json): full metadata-only upstream timeline and verification flags.
- [OpenCode events](opencode-events.jsonl): actual read/edit events and single session identifier.
- [Baseline tests](tests-before.txt) and [verification tests](tests-after.txt).
- Before code: `../demo/duration.before.txt`; after code: `../demo/duration.mjs`.

## Scope

Both models ran on the same local Ollama process; no paid model API or external inference key was used. The rate limit was injected deliberately after a genuine successful primary inference. The proxy does not invent successful responses or code. This proves automatic request-boundary failover and coding-context replay, not resilience to a shared Ollama outage or recovery from partially executed shell commands.

Versions: OpenCode 1.18.31, OmniRoute 3.8.50, Ollama 0.13.5, Node v24.15.0.
The demo was exercised on a GTX 1650 4 GB GPU with partial CPU offload.
