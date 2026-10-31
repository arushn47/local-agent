# Phase 6.4 evidence — conversation scale, soak diagnosis, compaction boundaries

Updated 2026-10-30. Zero external inference was used for everything below. The
live compaction probe is built and gated but has **not** run; see
[Approval required](#approval-required).

| File | What it shows |
|---|---|
| [regression.log](regression.log) | 102/102 tests pass after this checkpoint |
| [conversation-scale.json](conversation-scale.json) | Eleven paged history loads, 500-message view bound, task switching, accessibility audit |
| [conversation-scale.png](conversation-scale.png), [conversation-scale-mobile.png](conversation-scale-mobile.png) | 1440px and 390px rendering of the same long history |
| [soak-diagnostic.log](soak-diagnostic.log), [diagnose-soak.json](diagnose-soak.json) | Forty instrumented packaged-app refresh rounds with per-round timing |
| [diagnose-visibility.json](diagnose-visibility.json) | Window visibility observed by the packaged renderer |
| [live-compaction.json](live-compaction.json) | Gated probe preflight: blocked, zero requests |

## Extended conversations and history paging

`scripts/verify-conversation-scale.mjs` drives the real UI against a loopback
workspace server with twelve 50-message pages behind the latest five messages.

Verified:

- Each page prepends the previously unknown messages, drops the repeated
  boundary id and never duplicates: 11 loads, 49 added per later page.
- **Scroll anchoring:** after every load the message under the reader keeps its
  viewport offset. Worst observed shift 0.86 px; scroll offset grows by exactly
  the prepended height.
- **Bounded history:** at 540 older messages the control reports *History view
  limit reached*, and a DOM click on it issues no further request (11 requests
  for 12 available pages).
- **Task switching:** switching to the other task shows only its messages, and
  switching back resets paging to the latest page with the control available.
- No page or console errors; mobile viewport has no horizontal overflow.

Two source defects were found by this fixture and fixed in `apps/workspace/src`:

1. History paging measured the scroll position *after* the request returned.
   Any reflow during the round trip was then mistaken for the reading position,
   producing a wrong restore. `loadHistory` now captures `scrollTop` and
   `scrollHeight` before awaiting, and refuses to run without the region.
2. The paging button was rendered `disabled` while busy, which drops focus from
   the control the user just activated. It now uses `aria-disabled`/`aria-busy`
   with an explicit in-handler guard (busy and 500-message limit), so focus stays
   in the conversation and the limit is still enforced.

## Accessibility

- `axe-core` WCAG 2.0/2.1/2.2 A-AA plus best-practice: **0 violations** on the
  long conversation and on the second task. Two incomplete `color-contrast`
  nodes (`.local-symbol`, one inline span) require manual review; they are not
  automated passes.
- Accessibility tree: the conversation is a named `region`, Markdown headings
  appear as `heading`, and the fenced block is a focused `group` named
  *Code block*.
- Keyboard: the code block is tabbable and scrolls with `ArrowRight`; the paging
  control is reachable and operable with `Enter`; focus stays in the region.
- Fixes made: the builder inspector's empty heading level was skipped, which
  breaks sequential heading navigation, and fenced blocks were exposed as
  unnamed `generic` roles. Both are corrected in the component source and CSS.

Not covered: human Narrator/NVDA passes, RTL, forced-colors and 400% zoom on
these new views.

## Packaged UI soak failures

Historical failure: the packaged soak stopped at round 17 waiting up to 20 s for
the preview marker; a second profile ended at round 16 with the browser closed.
Neither run crashed the runtime.

What the instrumented reproduction shows
(`node scripts/diagnose-ui-soak.mjs`, packaged executable, fresh profile):

- 40 consecutive rounds completed with **no error**; preview refresh took
  226-465 ms per round, every revision advanced, the frame stayed connected,
  DOM stayed at 141 nodes and the renderer heap oscillated around 5 MB.
- Both failed profiles' own lifecycle logs recorded a healthy engine/gateway
  that only stopped after the driver gave up, with no renderer errors.

Conclusion: the refresh path itself is not deterministically broken, so the old
failure is a stall in one of two places that the retained evidence cannot
separate — the preview file watcher not publishing a revision, or the renderer
poll not running while the window is occluded (`document.hidden` stays `false`
under this driver, so hidden-state throttling cannot be exercised here). The
failure is **not** claimed fixed and nothing was masked with retries. To make a
recurrence decidable, the soak failure report now also stores the iframe source
(revision) alongside the server preview state.

## Compaction boundaries

New fixtures (zero inference):

- `test/compaction-recovery.test.mjs`: cancelling at a compaction boundary keeps
  the pre-compaction patch and reports `cancelled`; restarting from only the
  durable session reference restores the compaction marker and history without
  resending a prompt; a second compaction with no size reduction stops the run
  as `progress_budget_exhausted` instead of looping.
- `test/summary-fidelity.test.mjs` covers `src/workspace/summary-fidelity.mjs`, a
  pure validator that requires every seeded fact (objective, constraint,
  unresolved error, pending task, read files) to survive into the
  post-compaction answer. Missing facts are reported by name; empty or malformed
  answers never pass.

`scripts/verify-live-compaction.mjs` is the end-to-end probe: preflight checks the
generated engine config schedules compaction ahead of the unchanged guard
ceiling, then (only with approval) seeds facts, inflates context with a large
read, requires an observed compaction event, checks history/tool-result retention
and fidelity, and finally cancels, restarts the engine and re-reads the session.

## Approval required

The live probe exits without any network request unless both
`LOCALAGENT_LIVE_COMPACTION_APPROVAL=1` and `--approved` are given
(`LOCALAGENT_LIVE_REQUESTS`, default 6, and `LOCALAGENT_LIVE_MS`, default 6 min,
are hard bounds). Its current preflight is **blocked**: the on-disk
`.localagent/opencode.json` was written by the installed 0.5.2 build and has no
`compaction` block, so automatic compaction is not scheduled until the new build
runs `npm run configure` (or launches the app, which regenerates it).

## Not verified

No live model call, live compaction event, real summary fidelity, packaged
restart under compaction, or full 500-message scroll session was executed.
Accessibility completeness and the soak closure cause remain open.
