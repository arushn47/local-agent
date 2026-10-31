# Phase 6 evidence

Updated 2026-10-30. Zero external inference was used for every check below. These
files are development evidence, not public-release acceptance; the gates in
[MEMORY](../../MEMORY.md) and [release](../../docs/RELEASE.md) are unchanged.

| File | What it shows |
|---|---|
| [context-desktop.png](context-desktop.png), [context-mobile.png](context-mobile.png) | Composer context disclosure and compaction marker at 1440px and 390px |
| [context-ui.json](context-ui.json) | 6.1/6.2 loopback UI fixture: reported tokens, keyboard expansion, missing usage, mobile reflow, compaction marker, no browser errors |
| [engine-routes.json](engine-routes.json) | Pinned engine 1.18.31 route probe (missing session and live session) proving which compaction/context endpoints exist and that manual compaction answers 503 |
| [regression.log](regression.log) | First 6.1 checkpoint: 86/86 |
| [compaction-regression.log](compaction-regression.log) | 6.2 checkpoint: 94/94 |

## Reproduce

```bash
node --test test/*.test.mjs          # current suite (102 at 6.4)
node scripts/verify-context-ui.mjs   # loopback UI fixture, no engine
node scripts/verify-engine-compaction.mjs  # spawns the pinned engine, zero inference
npm run build:ui
```

`verify-engine-compaction.mjs` starts a throwaway profile under
`.localagent/phase6-compaction-probe-<timestamp>` with a provider base URL that
cannot be reached, so an accidental dispatch fails locally instead of spending
quota. It creates one session, probes the compaction/context routes, records only
status codes and error labels, and stops the child.

## Verified

- `POST /api/session/:id/compact` exists and returns **503** ("Session compact is
  not available yet") for a real session: the pinned upstream stubs
  `V2Session.compact` with `OperationUnavailableError`. Manual compaction cannot
  be offered without an upstream upgrade or a second summarizer, which is
  prohibited.
- The SDK's `client.session.summarize` target (`/session/:id/summarize`) is the
  deprecated v1 route upstream's own migration checklist replaces with the
  compact API; it is not a usable manual trigger.
- `GET /api/session/:id/message` (paged durable messages) and
  `GET /session/:id/message` (legacy shape used by the workspace) both serve a
  created session; `GET /api/session/:id/context` returns only post-compaction
  messages. Upstream keeps full history in its own store; LocalAgent adds none.
- Generated engine configuration now carries `compaction` settings derived from
  the unchanged guard ceiling, so upstream automatic compaction fires before the
  guard rejects the same request (85% of the byte ceiling, converted to upstream
  `chars/4` tokens).

## Not verified

No live model, real compaction event or cross-provider continuation was executed.
The projection of a compaction marker is verified against upstream's
`session-message.ts` mapping and a fixture, not a recorded live compaction.
Manual compaction remains unavailable until the pinned engine implements it.
