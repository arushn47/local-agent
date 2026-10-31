# OpenCode + OmniRoute local coding demo

This workspace connects the installed OpenCode CLI to an isolated OmniRoute gateway.
Both inference models run locally in Ollama:

- Primary: `localagent-qwen2.5:7b` (existing `qwen2.5:7b-instruct` weights)
- Fallback: `localagent-qwen3:4b-instruct` (`qwen3:4b-instruct`, downloaded for this demo, about 2.5 GB)

The aliases set `num_ctx 8192` explicitly. They do not download or duplicate model
weights, and do not change the original model tags. This aligns Ollama's actual
context with the 8K window advertised to the coding agent.

The gateway uses `http://127.0.0.1:20129/v1`. OpenCode selects
`omniroute/local-coding-failover`; OmniRoute owns the priority fallback decision.
No paid inference or external provider API keys are needed.

## Run

Prerequisites: Node.js 24, the installed `opencode-ai` and `omniroute` packages,
and Ollama running with the two models above. The launch scripts discover the
Windows global npm package directory through `%APPDATA%`. Override
`OMNIROUTE_PACKAGE_DIR` or `OPENCODE_EXE` if the installations are elsewhere.

In one terminal:

```powershell
npm start
```

In another terminal, from this workspace:

```powershell
ollama pull qwen3:4b-instruct
ollama create localagent-qwen2.5:7b -f models/primary.Modelfile
ollama create localagent-qwen3:4b-instruct -f models/fallback.Modelfile
npm run configure
npm run demo
```

The demo resets **only** `demo/duration.mjs` from the supplied buggy fixture, asks
OpenCode to fix its unit conversion factors and preserve a marker from the specification,
and independently runs all 22 tests. The baseline passes 15 and fails 7 tests.
It deliberately injects HTTP
429 for the primary model after its first successful inference request. The
proxy forwards all successful inference to Ollama; it never fabricates model
responses, source code, or tool calls. OmniRoute performs the actual fallback.
The harness verifies one OpenCode session, both real models, the injected error,
replay of the earlier tool context to the fallback model, a completed agent edit,
and independently passing tests. It also records whether the agent itself ran tests;
that is distinct from the harness's mandatory independent test run.

The fault is disarmed after the run. Normal subsequent requests pass through
without injected errors. `npm run demo` deliberately overwrites the disposable
exercise implementation; do not put user work in that file.

## Use OpenCode normally

With the services running, launch `opencode` from this workspace. Its project
configuration selects the local routing combo automatically. Or run:

```powershell
opencode run --model omniroute/local-coding-failover "Describe this project"
```

Stop the launcher with Ctrl+C when finished. It stops only the two processes it
started. All listeners bind to loopback. Runtime data is stored under `.runtime/`,
separate from the user's existing OmniRoute database and configuration.

## Evidence and scope

After a demo, inspect:

- `.runtime/report.json`: machine-readable outcome and routing timeline.
- `.runtime/opencode-events.jsonl`: actual OpenCode session and tool events.
- `.runtime/test-output.txt`: independent Node test output.
- `.runtime/omniroute.log`: gateway logs, including fallback decisions.

Logs and generated local admin credentials are excluded by `.gitignore`.
The successful run's sanitized evidence is saved under `evidence/`.
The loopback gateway deliberately permits keyless inference for this local demo;
do not expose it on a public interface. Management requests use OmniRoute's local
CLI authentication and the isolated instance's admin login. This demonstrates request-boundary recovery, not recovery
from partially executed shell commands or a broken stream halfway through a tool.

Timeouts are extended for cold starts and partial CPU offload on a 4 GB GPU.
The same Ollama process serves both models, so they are not independent failure
domains: an Ollama outage would affect both.

The demo proxy sets `reasoning_effort: "none"`, temperature zero, and a bounded
output budget on the OpenAI-compatible request. See [Ollama's API documentation](https://docs.ollama.com/api/openai-compatibility).
An earlier 8B vision-model attempt exhausted its output budget in thinking and
did not complete the exercise; the smaller text model avoids that hardware mismatch.
Attempts to generate an entire parser with the small local models also failed.
The successful demonstration is a focused bug fix, not evidence that these models
can reliably build complex applications. Both model aliases use an 8K context window.

To preserve deterministic primary-first order, configuration disables session
stickiness and prompt-cache affinity in this isolated gateway. Otherwise previous
requests can cause a known fallback to be selected first, bypassing the intended
demonstration. Normal production routing should choose affinity policies deliberately.
