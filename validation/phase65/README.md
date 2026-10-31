# Phase 6.5 evidence — free-first agent optimization and benchmark preparation

Updated 2026-10-30. Zero external inference in every check below. Live
comparative arms are prepared but **not run**; they need owner approval.

| File | What it shows |
|---|---|
| [regression.log](regression.log) | 110/110 tests pass after this checkpoint |
| [benchmarks.json](benchmarks.json) | All five fixtures fail before the reference fix and pass after it |
| [../benchmarks/manifest.json](../../benchmarks/manifest.json) | Immutable hashes for every fixture task, repo, check and solution |

## What LocalAgent actually controls

An audit of the pinned engine 1.18.31 (`.localagent/upstream/source-014614d3…`)
found three supported levers and no new ones:

- **Ambient instructions.** `packages/core/src/instruction-context.ts` loads
  `AGENTS.md` from the global config directory (`$XDG_CONFIG_HOME/opencode`) plus
  project files, and diffs updates into the system context. The `instructions`
  config array exists in the schema but this build has no consumer for it, so it
  is not used.
- **Tool-output bounds.** `packages/core/src/tool-output-store.ts` truncates at
  `max_lines` (2000) / `max_bytes` (50 KiB) and saves the full text to a managed
  file with a marker. On a 32 K free route one 50 KiB tool result is roughly
  12.8 K tokens — about 39% of the window.
- **Step bounds.** `agent.<name>.steps` exists per agent; LocalAgent's existing
  120 s deadline, 30-request/2-compaction progress budget and approval prompts are
  unchanged and remain the outer bounds.

## Implemented (opt-in, zero extra requests)

`executionGuidance: true` in `localagent.config.json` (validated as a boolean,
off by default) now enables two things:

1. `src/workspace/guidance.mjs` writes a bounded (≤1.8 KB) ambient instruction
   file to the engine profile's global `opencode/AGENTS.md`. It asks for targeted
   search instead of whole-file reads, no unchanged re-reads or repeated failed
   commands, narrow tests first, small tool output, an explicit objective/next
   step/checkpoint before longer work, and honest reporting of failing commands
   and first error lines. `prepareGuidance` removes only its own marked file and
   never overwrites user-authored instructions.
2. `src/omniroute.mjs` adds upstream `tool_output` limits (600 lines / 16 KiB,
   versus 2000 / 50 KiB) to the generated engine config. The full output still
   lands on disk with the upstream marker, so nothing is lost permanently.

`src/workspace/engine.mjs` applies the guidance file at engine start, so enabling
or disabling the flag takes effect on the next launch. No prompt is appended to
user messages, no permission changes, no routing changes, and no additional model
call is made.

## Measurement tooling

`src/workspace/behavior-audit.mjs` reduces an upstream session to aggregates only:
steps, tool calls by name, total and largest tool-output bytes, failed calls,
truncated/cached outputs, unique files read, duplicate reads, duplicate shell
commands (`avoidableCalls`) and the last reported input tokens. It never retains
prompts, commands, paths, output text or reasoning, so it is safe to keep as
evidence. `compareArms` reports deltas and returns `null` for unknown
measurements instead of inventing a number.

## Benchmark spine

`benchmarks/fixtures/` holds five disposable tasks: an inclusive/exclusive
boundary bug, a new `slugify` feature with acceptance tests, a multi-file
`clamp` extraction, a failing env-parser diagnosis (with a partially passing
baseline, as in real projects), and a long-context task whose formatting rule
exists only inside a 56 KB `history.md`. Acceptance tests live outside `repo/` so
an agent cannot read the checks it must satisfy.

`node scripts/verify-benchmarks.mjs` copies each repo to a temp directory, adds
the hidden checks, requires a failing run, applies the reference solution and
requires a passing run; `--write-manifest` re-seals the hashes. Current result:
5/5 fixtures clean, zero inference, `validation/phase65/benchmarks.json`.

## Not verified

The three-arm comparison (baseline OpenCode without LocalAgent configuration,
current LocalAgent, guidance-enabled LocalAgent) has no measured runs. No claim
is made that guidance reduces tool calls, tokens or time. The long-context
fixture exercises retention only once a live arm runs it. Human review of the
guidance wording and its effect on a real small model is pending.
