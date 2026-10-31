# Current project status

Latest recovery checkpoint: exact workflow aliases map to one provider/model with no fallback; six specialized native roles are installed with deny-first permissions. 168/168 regressions, UI build and all three browser checks pass. The actual pinned-engine registry probe passes without inference. Workflow egress is separate and rejects inference pending attribution. Production remains gated; durable coordination and budgets are next.

Updated 2026-11-01. Phase 8 recovery checkpoints 1–3 have source/fixture acceptance: local Git baseline `21eacb4`, false-success fixes `d78ab90`, strict workflow API/state/snapshot validation and explicitly approved, content-bound checkpoint restoration. **156/156 tests**, production UI build and real authenticated browser restore checks pass. [Detailed evidence and remaining gates](phase8/RECOVERY.md).

Production workflow activation/resume/retry is gated until real supervised OpenCode execution and guard attribution are validated. Plans can be saved; existing single-agent functionality remains available. Paid workflow activation is rejected. Checkpoints 4–9 remain open: lifecycle/model/permission integration, concurrency/crash recovery, budgets, actual role tools and adverse end-to-end validation. No live inference, packaging, publication or remote push occurred. Phase 5 public-release blockers remain open.

## Historical Phase 5–6 evidence

Updated 2026-10-29. 0.5.1 is an accepted development milestone. Phase 5.2 produced an unsigned 0.5.2 development candidate; **public release remains blocked**. Owner now authorizes Phase 6 coding/context development; no new inference routes. See [focused audit](PHASE6-AUDIT.md).

- Installer: **528,384,756 bytes**, down **21.57%** from 0.5.1. Payload: 19,215 files versus 65,534. Accepted 0.3/0.4/0.5.0/0.5.1 hashes are preserved.
- Backend packaging follows the pinned upstream backend-only build, traces, native/worker extras and installed dependency closure. Candidate/stage/package byte hashes match; isolated tool/history/cooldown fixture passes with zero development-module escapes. Spline/Giscus/Lobe/Ant Design/Monaco external packages are excluded; Next's React peers remain required.
- **77 regressions**, zero production/full npm advisory findings, known-secret/env/link scan, actual fresh installation/builder/security/uninstall and automated accessibility checks pass. See the [distribution matrix](../validation/phase52/distribution.json) for final per-version install/upgrade/rollback/failure results.
- All four 0.3/0.4/0.5.0/0.5.1 upgrade/rollback matrices pass, including exact registration and protected-data preservation. Extended packaged accessibility passes 14 views with WCAG 2.2 tags and 400% zoom; human verification remains open. Final tracked-process cleanup passes.
- Installed accessibility launch measured 6.8 seconds on this host. File caches/load are uncontrolled; true OS-cold and independent clean-machine performance are unverified.
- The 31-minute engine-session baseline settled near 703 MiB private / 391 MiB resident. A short Bun --smol pilot did not justify a production change. High engine memory remains open.
- **Long packaged UI stability is not accepted:** one run timed out after 17 cycles; another ended after 16 cycles with the browser closed. Both recorded runtime shutdown. No native crash event was found in the scoped query; that does not establish the closure cause. No repeated long restart or speculative product patch.
- Exact Bun/WebKit/TinyCC pins, versioned notices, seven source archives and native hashes improve compliance evidence. Full JSC/native source/object/relinking and redistribution review remain incomplete. Additional Sharp review materials acquired after payload freeze are held outside the installer; not a cleared source offer.

[Phase 5.2 evidence](../validation/phase52/README.md), [memory](../MEMORY.md), [launch/build](DESKTOP.md), [recovery](RELEASE.md), [owner decisions](RELEASE_DECISIONS.md), [license review](LICENSE_REVIEW.md).

Independent Windows testing remains unavailable: Home build 26300, hypervisor present, no verified independent guest. No virtualization installation, OS configuration change, image download or paid service. Human Narrator/NVDA/native-dialog/OS-scaling testing, incomplete automated checks, power loss/disk-full/quarantine and registry-write-denial coverage remain gates.

The product supports isolated static HTML/CSS/JavaScript previews; commands run as the Windows user, not an OS sandbox. Free-only admission, credential protection, signatures, context limits and fixed egress remain. Only previously verified directed routes may qualify; no universal failover claim. Phase 4's real coding evidence is historical. No publication, owner-license selection, signing purchase or automatic update was performed.

Phase 6.5 source checkpoint: **110 regressions**. Opt-in `executionGuidance` writes bounded ambient guidance into the engine profile and tightens upstream tool-output limits (600 lines / 16 KiB), with no extra request, prompt change or permission change; aggregate behavior metrics and five immutable benchmark fixtures pass fail-before/pass-after verification with zero inference. No three-arm live comparison ran, so no efficiency or completion claim is made. [Evidence](../validation/phase65/README.md).

Phase 6.4 source checkpoint: **102 regressions**, production UI build, an eleven-page history fixture (scroll anchoring within 0.86 px, 500-message bound, task switching, axe/AX/keyboard pass) and the packaged soak reproduction (40 clean rounds) pass with zero inference. Compaction interruption/restart fixtures and a summary-fidelity validator pass; the live compaction probe is approval-gated and currently blocked because the on-disk engine config predates this build. The historical soak closure is not fixed and not masked. [Evidence](../validation/phase64/README.md).

Phase 6.3 source checkpoint: 96 regressions, production UI build and context/conversation browser fixtures pass. Safe Markdown, lazy code highlighting, bounded older-history navigation and clearer tools implemented; no live inference or new package artifact. [Evidence](../validation/phase63/README.md). Manual compaction stays disabled per owner decision.
