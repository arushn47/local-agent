# LocalAgent UX requirements

Create an original, premium coding product whose confidence comes from clarity, responsiveness and visible results. This document fixes usability requirements, not a visual template. Branding, color, type, composition, iconography and signature interactions remain open to exploration.

## Product experience

- Start with the user's project and next action. First use explains local vs cloud execution, accepts local keys without exposing them, and offers a metadata-only check before any optional inference check.
- Distinguish configured, reachable, coding-eligible and continuation-eligible providers. Show why a route is unavailable and a concrete next step; never decorate an unsupported provider as ready.
- Keep current model/provider and task status discoverable without making routing administration dominate the workspace. Offer detailed routing history on demand: reason, destination, observed quota/reset and uncertainty. Do not display invented quota gauges, savings or billing totals.
- Make permissions, cancellation, tests and changes first-class. A completed task shows what changed, the actual last test outcome and any remaining failures. A final assistant message alone is not success.
- Retain typed input and relevant project state across transient failures. Errors distinguish rate limits, missing keys, context rejection, lost signature metadata and unavailable runtimes. Never silently start over or imply every older session can resume.
- LocalAgent's identity should emerge through a coherent project workflow, routing experience, onboarding and builder, alongside a distinctive visual system. Reuse useful upstream coding interactions without preserving their whole information hierarchy by default.

## Surfaces and state

Design a project home, coding workspace, provider setup, routing details, settings and eventually builder preview. Adapt panels to available space; preserve editor/diff legibility rather than shrinking a desktop layout into a phone. Use progressive disclosure, keyboard shortcuts with discoverable alternatives, stable panel positions and clear back paths.

Every feature specifies empty, loading, streaming, success, partial result, error, disconnected and cancelled behavior where applicable. Provider switches must not steal focus or discard drafts. Long filenames, large diffs, long sessions and unknown quota values are normal cases. Use real fixture content and labelled sample data in prototypes.

## Accessibility and responsiveness

Target WCAG 2.2 AA for product surfaces; validate rather than claim certification. Use semantic controls, visible focus, labelled inputs/buttons, keyboard access and restoration, accessible dialogs, non-color status cues and restrained live announcements. Maintain readable contrast and text at zoom; support reduced motion, increased contrast and opaque alternatives to transparency. No hover-only essential actions, blocked paste or scroll hijacking in the workspace.

Respect IME input and code-editor shortcuts. Feedback may appear on press, but activate actions through normal accessible control semantics. Offer touch-friendly targets without sacrificing useful desktop density. Test keyboard-only and screen-reader flows manually as well as automated checks.

## Motion, typography and performance

Use motion to explain state or spatial relationships. Feedback is immediate; transitions remain interruptible and never block input. CSS/Web Animations and existing Solid primitives are the default. Springs are optional for direct manipulation when they improve behavior. Cleanup effects/listeners when views unmount.

No required perpetual animation, shader background, parallax or physics engine. Decorative effects must justify their cost, stop when hidden, and have static/reduced-motion alternatives. Native scrolling remains in code, logs, menus and chat. Marketing experiments can use richer effects separately from the working app.

Build hierarchy through typography, spacing and content, with a legible code face. Choose licensed, locally bundled fonts or system fallbacks; no required external font/asset requests. Define reusable semantic tokens once a visual direction is selected, including status and focus roles; do not hard-code a palette before exploration.

Keep typing and scrolling responsive while tokens stream. Reuse upstream virtualization and lazy loading. Measure startup, input latency, frame stability, memory and bundle deltas on the target Windows hardware before accepting heavier dependencies.

## Design and review loop

Explore a few coherent directions against real onboarding/coding/routing screens, select by usability and product fit, then capture tokens and component states here. Creative changes remain welcome within accessibility, security and performance constraints. Do not clone another brand's screen or follow a skill's arbitrary palette/layout bans.

Apply selected Apple Design principles (feedback, interruptibility, legibility), Vercel's accessibility review ideas and Taste's browser look-and-fix approach. Treat them as references, not universal rules. React-only catalogs are inspiration, not dependencies. [Resource decisions](docs/RESOURCE-EVALUATION.md) explain selections.

Review screenshots at desktop and narrow widths, keyboard/focus behavior, zoom, light/dark treatment if offered, reduced motion, realistic failures and long content. Use Playwright acceptance tests plus human visual review; screenshots alone cannot prove accessibility or correctness. Brand direction is still open; no design tooling or subscription is mandatory.

## Phase 2 direction

The implemented light workspace uses warm paper, moss accents and a restrained three-bar mark. System sans-serif, serif editorial headings and a local monospace face avoid external font requests. Semantic tokens live in `apps/workspace/src/tokens.css`; CSS handles short press/hover feedback, with reduced-motion and increased-contrast alternatives. Desktop uses project navigation, conversation and a changes/tests inspector; narrow screens stack panels and expose a project selector. Credentials, permission prompts and routing limitations use plain language. This direction can evolve; no heavy animation or React library is installed. See [visual evidence](validation/phase2/README.md).

## Builder interaction

Keep the existing conversation beside a wider Preview inspector. Device controls use real desktop/tablet/mobile CSS viewports, scaled to fit the panel. Show server/watch state, revision, stale screenshots, syntax results and bounded console output distinctly. Inspection is explicit and reports errors and horizontal overflow; a screenshot alone is not a usability pass. Refine drafts findings into the current conversation for review, preserving permission prompts. Changes and agent-run Tests remain one tab away. Empty, busy, stopped, watcher failure, browser failure and recovery states need actionable text. Export is labelled source export, not deployment. Avoid animation on preview reload; preserve chat drafts and keyboard focus.

Release accessibility: modal background is inert, Tab stays within the dialog, Escape closes when safe and restores the opener. Navigation transfers focus to the new heading; skip navigation focuses the main landmark. System fonts, darker semantic metadata/accent colors, visible select focus and forced-colors treatment preserve the visual direction. Automated axe and accessibility-tree reports are partial evidence; human screen-reader/native-dialog review remains required. Idle workspace polling is reduced and pauses while hidden; active task monitoring remains responsive.


Phase 6 retains this visual identity and prioritizes conversation usability. Put context information beside the composer in a keyboard-operable disclosure. Label last completed request versus current estimates, include unknown states, and never imply a percentage when capacity/current input is unavailable. Later compaction notifications should be subtle and preserve focus/drafts. Safe Markdown/code readability, clear tool/permission/error states and older-history navigation precede cosmetic work.
