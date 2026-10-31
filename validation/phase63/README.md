# Phase 6.3 - conversation usability

2026-10-30. Source checkpoint only. Installed 0.5.2/approved installers unchanged. Zero inference and no routing, credential, signature or compaction-scheduling changes.

Implemented safe assistant Markdown, literal HTML, blocked remote images, absolute HTTP(S)/mailto links, lazy syntax highlighting (JavaScript/TypeScript/JSON/HTML/CSS/Python/Bash). Other languages or blocks over 8K chars remain plain code. Code blocks support keyboard scrolling. Tools show titles/exit status. Manual compaction remains disabled with limitation in technical details only.

History reuses the authenticated SDK before cursor with 50-message pages, validated session ownership/cursor, existing safe projection and transient UI deduplication. Scroll/focus retained and older state resets per session. Bounded to 500 older messages plus latest 100; reopen resets browsing, never durable history. All saved task tabs accessible. No second conversation store or tool replay.

## Verification

- Full suite: **96/96**, [regression.log](regression.log).
- Production UI build passes: [build.log](build.log).
- `node scripts/verify-conversation-ui.mjs`: [report](conversation-ui.json), [desktop](conversation-desktop.png), [mobile](conversation-mobile.png). Markdown, token spans, inactive script/image/unsafe links, keyboard paging through the real LocalAgent HTTP history endpoint with fake upstream data, message order/focus, mobile reflow and zero browser errors.
- `node scripts/verify-context-ui.mjs`: existing Phase 6.2 marker/context/keyboard/missing-data/reflow checks pass. Manual limitation hidden until technical details opens.

## Dependency and performance limits

Promoted existing locked production versions to direct dependencies: Marked 15.0.12 (MIT), DOMPurify 3.4.17 (MPL-2.0 OR Apache-2.0), Shiki 4.5.0 (MIT). No new versions or package code installed. Initial offline npm resolution lacked metadata; root manifest/lock metadata was updated against the matching existing nodes instead. No scripts ran. Retain upstream licenses and grammar/transitive notices in future bundled distributions; this is not clearance. Refresh backend-distribution lock proofs before new packaging. Existing frozen artifacts were not modified.

Main JS 129.40 KB / 45.28 KB gzip; lazy highlighter 757.76 KB / 127.87 KB gzip. Vite's optional chunk-size warning retained. No full performance/accessibility or live engine-history pass. Existing 16K text/12K tool projection bounds remain. History is bounded, not virtualized; extended polling/history/reconnect and human screen-reader/contrast checks remain. No live coding, compaction fidelity or failover claim. Existing public-release blockers remain open.
