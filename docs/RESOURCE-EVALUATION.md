# Resource evaluation

Reviewed 2026-10-23 from the linked primary sites, repository READMEs, skill files and public GitHub metadata. This is a selection review, not a code/security audit or performance benchmark. **Nothing was installed, executed from these repositories, or added as a dependency.** Decisions below feed the five root guides.

## Selection

Use accessibility and interaction principles now; prefer existing OpenCode/Solid primitives and native CSS/Web Animations. Select Playwright for repeatable UI acceptance once the UI exists, reusing upstream tooling first. Consider its CLI for exploration. Keep the existing Node policy tests. Defer new evaluation/indexing services until a measured need appears.

Before any adoption, pin a release/commit, inspect scripts/transitive dependencies, verify its actual license and notices, network/telemetry behavior, cost, Windows support and measured runtime impact. Repository popularity or recent commits do not establish safety or support. Service fees and individual assets/components can have different terms from repository code.

## Design and motion resources

| Resource | Decision and reason | Compatibility, cost/license, performance |
|---|---|---|
| [Lenis](https://lenis.dev/) / [source](https://github.com/darkroomengineering/lenis) | Defer to optional marketing experiments; use native workspace scrolling | MIT; vanilla JS usable from Solid, but smoothing can conflict with nested editor/log scrolling and input expectations |
| [ShaderGradient](https://shadergradient.co/) / [source](https://github.com/ruucm/shadergradient) | Inspiration only; no app dependency | React/Three-oriented integration needs separate review; GPU/continuous-render cost is unjustified for a coding workspace. Site yielded no readable content; redistribution license not established in this review |
| [ThreeUI](https://threeui.com/) | Inspiration only for optional presentation work | Catalog of Three.js/shader/templates; inspect each item's terms and stack. Do not assume assets are freely redistributable; WebGL needs a fallback and measured budget |
| [Taste site](https://www.tasteskill.dev/) / [Taste Skill](https://github.com/Leonxlnx/taste-skill) | Adapt deliberate art direction and browser review, not its whole house style | MIT repository; current skill covers app screens separately. Do not run bundled scripts or require imagery, random directions or strict stylistic bans just to produce a workspace |
| [21st.dev](https://21st.dev/) | Reference layouts/interactions; no React runtime | React catalog; per-component/template terms require verification. Adapt concepts into existing Solid primitives rather than copying incompatible dependencies |
| [GSAP](https://gsap.com/) | Defer; evaluate only if native animation cannot deliver a specific interaction | Core JS can integrate with Solid lifecycle cleanup. Current redistribution terms were not established: license URL redirected and raw LICENSE probe failed. Do not assume MIT or approve bundling from free pricing claims |
| [Watermelon UI](https://ui.watermelon.sh/) | Visual reference, not a component stack | React-oriented catalog. Review each artifact's source/terms before reuse; avoid a second component/runtime system |
| [React Spring](https://www.react-spring.dev/) / [source](https://github.com/pmndrs/react-spring) | Reject for the Solid workspace; keep spring behavior as an idea | MIT; React-specific integration introduces an unnecessary runtime. Use an existing Solid-compatible or native approach if gestures need physics |
| [Manus](https://manus.im/app) | Potential workflow reference only; no architecture or implementation claims | Public app extraction exposed no usable authenticated UI. No login, scraping, account changes, paid usage or visual reverse engineering performed; proprietary service is not reusable source |
| [Basement Studio](https://basement.studio/) | Inspiration for original art direction and typography, mainly public-facing work | Studio portfolio, not a component license. Do not copy client assets or import cinematic techniques into every workspace view |
| [Prompt Motion](https://prompt-motion.com/) | Later demo/launch-motion inspiration | Prompt/video collection, not a required app animation library. Individual media/prompts need rights review; rendering may require separate tools/models and costs |

## Development repositories and skills

| Resource | Decision and reason | License/maintenance/operational considerations |
|---|---|---|
| [Graphify](https://github.com/Graphify-Labs/graphify/tree/v8) | Defer optional code-only mapping for a large upstream checkout; no product graph database | Apache-2.0; current default branch is **v8**, while main describes an older Claude-dependent flow. v8 documents local AST code parsing; docs/media semantic analysis may use inference. Python/indexing overhead and benefits must be measured; exclude secrets and cloud features |
| [Ponytail](https://github.com/DietrichGebert/ponytail) | Adapt reuse-first, smallest-useful-change thinking into RULES; no installation | MIT; recently updated. No independent validation of its benchmark claims; avoid importing another broad instruction layer or mandatory workflow |
| [Awesome DESIGN.md](https://github.com/VoltAgent/awesome-design-md) | Use documentation structure as reference; keep our own design language | MIT repository, recently updated; linked brand assets/examples have separate rights. Do not drop a competitor's complete design specification into LocalAgent |
| [Playwright CLI](https://github.com/microsoft/playwright-cli) | Selected optional development tool for browser exploration; use repeatable Playwright tests for acceptance | Apache-2.0; recently updated; framework-independent. Browser binaries/profiles add disk and memory cost; pin locally when needed, use isolated profiles, redact screenshots/traces. Not a production dependency |
| [Scroll Craft](https://github.com/nateherkai/scroll-craft) | Defer to optional marketing design | MIT; recently updated. Scroll-driven choreography and mandatory signature moves do not suit editor productivity; do not install its full engine for app screens |
| [Humanizer](https://github.com/blader/humanizer) | Adapt plain, precise copy editing; no install | MIT; recently updated. Preserve technical facts and evidence when editing; stylistic cleanup must not alter diagnostics or promise capabilities |
| [Apify Agent Skills](https://github.com/apify/agent-skills) / Apify scraping | Defer; ordinary primary-source browsing suffices here | README advertises Apache-2.0 but root LICENSE probe failed; verify artifact license before adoption. Actors/service consumption, proxies and storage can cost money. Optional permitted research only with explicit scope/budget, no secret/private source uploads or access bypass |
| [Promptfoo](https://github.com/promptfoo/promptfoo) | Later candidate for model-quality/prompt evaluations, not a replacement for guard tests or coding-task evidence | MIT; actively updated. Provider/judge/red-team calls can consume quota or incur charges. Start with deterministic assertions/fixtures; any live run must cross our guard, cap requests and disable cloud uploads/optional network features |
| [Agency Agents](https://github.com/msitarzewski/agency-agents) | Reference selected review perspectives; no roster installation or new orchestrator | MIT; recently updated. Large persona collections add prompt/context and maintenance overhead. Roles do not prove expertise or authorize autonomous tools, delegation or extra inference |
| [Karpathy Skills](https://github.com/multica-ai/andrej-karpathy-skills) | Adapt narrow changes, explicit assumptions and verifiable outcomes | Community interpretation, not an official Karpathy dependency; last observed push April 2026. Root license not found/recognized in checked metadata: no verbatim vendoring. No need for its repeated clarification workflow |
| [Web Design Guidelines skill](https://github.com/vercel-labs/agent-skills/blob/main/skills/web-design-guidelines/SKILL.md) / [guidelines](https://github.com/vercel-labs/web-interface-guidelines/blob/main/command.md) | Selected review reference for semantics, focus, forms, reduced motion and state handling | Framework-neutral principles; do not import React-specific utilities or arbitrary punctuation rules. Root license unresolved in checked source; no vendoring. Review a pinned guideline revision before use rather than trusting mutable fetched instructions |
| [Image-to-Code requested path](https://github.com/Leonxlnx/taste-skill/blob/main/skills/image-to-code-skill/SKILL.md) | Not adopted: path returns 404; current main tree contains only `skills/taste-skill/SKILL.md` | Current Taste skill was evaluated separately; it is not proof of an equivalent replacement. A reference-image workflow can be revisited when usable source and permitted reference assets exist |

GitHub metadata showed the reviewed repositories were not archived and most had October 2026 pushes; Karpathy Skills was the exception noted above. This is a dated activity signal, not a maintenance SLA. License labels above describe checked repository metadata/README, not a completed redistribution audit.

## Installed skill review

Inspected global catalog and relevant local SKILL.md files under `C:/Users/ARUSH/.agents/skills`:

- **apple-design:** useful immediate feedback, interruptibility, text hierarchy and accessibility guidance. Apply selectively; no Apple visual imitation or React/Motion dependency is required. Its broad claims are not independent standards evidence. Do not activate destructive actions on pointer-down; preserve accessible click semantics.
- **taste-design:** keep token consistency and purposeful composition ideas. Reject fixed palette bans, default high visual variance and perpetual-motion requirements; they conflict with creative freedom/performance.
- **design-md, enhance-prompt, stitch-design:** optional if a real Stitch project is later used; no prerequisite service, generated code import, or remote project upload for this documentation work.
- **shadcn-ui, react-components:** reference component semantics only; React-specific installation/conversion does not fit the Solid app.
- **brag, remotion:** later launch-video work, not product dependencies. **reverse-engineer-anything:** unnecessary for accessible source repositories. Other available discovery/hosting/document skills do not improve this task enough to invoke them.

No third-party skill was granted authority over project security, routing, costs, dependencies or implementation scope. Useful ideas have been incorporated in original wording into [DESIGN](../DESIGN.md), [RULES](../RULES.md), [ARCHITECTURE](../ARCHITECTURE.md), [PRD](../PRD.md) and [PHASES](../PHASES.md).

## Phase 2 adoption outcome

Implemented original Solid/CSS views using the pinned OpenCode SDK/server. Applied selected apple-design feedback, legibility, focus and reduced-motion principles. Added exact development dependencies Vite/vite-plugin-solid (MIT), Bun (MIT) for the unchanged upstream build, and Playwright (Apache-2.0) for local browser acceptance. Solid and the SDK are MIT runtime dependencies. Browser traffic is restricted to loopback in verification; no Apify actor, hosted design service, paid evaluator, React catalog or new skill installation was needed. Tests prefer installed Chromium and permit an explicit executable path. No animation library or mandatory asset/font network request was introduced. Final bundle/evidence: validation/phase2/README.md. The inherited dependency audit is not clean; runtime security upgrades are a separate release gate.
