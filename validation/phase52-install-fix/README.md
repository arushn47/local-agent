# 0.5.2 installation recovery — 2026-10-29

Actual intended destination: **D:\LocalAgent**. Initial C: inspection was superseded by the user's clarification; C: recovery material was left untouched.

Confirmed pre-repair D: state: empty target, retained 0.5.1 stage, format-2 journal marked rolled_back to 0.3.0, no rollback payload, and no registration. This stale retained state triggered the original generic refusal. The original removal/interruption cause is unknown; 0.3.0 could not safely be restored from absent files.

The revised preflight identifies unrecorded extraction, completed installs, restored/interrupted transactions and ambiguous states. Preservation renames entire retained folders/journals into a unique sibling archive and records each move. No material is deleted. Pending recovery reuses the existing validated rollback/registration mechanism. Silent installs decline recovery by default. Trusted recovery Node comes from the installer's own archive, not retained files. Existing safeguards and runtime archive are unchanged.

Verified:

- [84 regressions](regression.log), including missing-restored-install and preservation interruption cases.
- [Native disposable reproduction and upgrade/rollback/retry](native.json): original refusal, safe silent cancellation, unknown-material preservation and committed-version retention pass.
- Actual interactive D: install completed with recovery revision 2. Current registry and journal identify **0.5.2**, committed at **D:\LocalAgent**.
- Retained data: **D:\LocalAgent.recovery-1793244277903-d31c3afc**. No previous recovery material was deleted.
- [7,387 user-data file hashes unchanged](user-data-preservation.json). No real credentials were decrypted or exposed.
- [Actual installed application](actual-app/packaged-fixture.json): isolated-profile builder, responsive previews, security/error recovery and shutdown pass. No inference calls.

Directory selection: upstream appends LocalAgent at the installation step, leaving a drive-root-only selection visible beforehand. Revision 4 adds immediate normalization and a silent-install root guard. It compiled, but live visual verification was stopped by the user's physical Escape. **Final directory-field behavior remains unverified.** Do not repeat installation just for that check; the user's D: installation is already working. If manually choosing a future destination, specify the complete `D:\LocalAgent` path.

[Final installer-only candidate](artifact.json): `release/desktop-0.5.2-recovery4/LocalAgent-Setup-0.5.2-recovery4-x64.exe`, unsigned; unchanged original runtime archive. Earlier recovery revisions are intermediate builds. No Phase 5.3 work, publishing, paid inference or security-policy changes. Existing public-release gates remain open.
