# Offline coverage and compact review — 2026-09-24

## Outcome and scope

An owner needs a reviewer to find important source surfaces without repeatedly sending an entire repository or verbose evidence ledger to an assistant. The STP dogfood showed that a static-HTML-only first look missed Next.js routes and that its 60,049-byte full JSON was a poor default reading surface.

Target: retain immutable evidence while reducing the initial review payload by at least 70% against that pinned dogfood report, inventory Next.js App Router routes, identify explicit test-selection gaps, and make source-review limitations visible. This is a local integration into the existing engine, not a replacement security scanner or a completed platform audit.

## Reuse research

Primary sources checked September 24, 2026. Installed package/lockfile evidence is authoritative for the parser version used here. No target package, plugin, config or test script is loaded or executed.

| Option | Requirement fit and gap | Cost, license, deployment and maintenance | Data, authentication and tradeoffs |
|---|---|---|---|
| Installed TypeScript compiler API | `createSourceFile` and `forEachChild` parse captured TS/JS without executing it. Fits small, syntax-level review signals and route exports. Does not prove data flow, ownership or runtime behavior. | Reuse pinned 5.9.3 already installed; Apache-2.0; local Node library, no metered API. Official repository and compiler API documentation checked; no claim this pinned version is latest. | No account or credential needed for this parser path. Captured bytes stay local. Promoted from dev to runtime dependency; bounded CPU/memory overhead and compiler API maintenance. Low service lock-in, some API coupling. |
| ESLint custom rules | Mature AST visitor/rule ecosystem, suitable for a broader lint integration. Would still need our snapshot/evidence binding and custom visitors; TypeScript parsing/config adds setup beyond what is installed here. | MIT, local open-source CLI/library; official repository and custom-rule docs checked. Exact candidate package/version and release cadence not verified. | No hosted account needed for local linting. Target configs/plugins can execute code, so they must not be trusted or loaded by this audit. Integration effort higher for this bounded task; low service lock-in. |
| Semgrep Community Edition | Existing local security-pattern engine; preferred candidate to evaluate for broader SAST rather than expanding a homemade scanner. Still needs reviewed local rules and an evidence adapter. | LGPL-2.1 CE engine, local CLI; official CE/CLI documentation checked. Separate installation, rule licensing and version selection require review. Hosted plan prices not evaluated because they are outside this offline job. | No login needed for documented local CE workflow. Registry/metrics behavior needs explicit offline configuration; no remote registry fetching or telemetry allowed in this lane. More operational setup than reusing the parser; cross-file/runtime assurance remains limited. |

Sources: [TypeScript compiler API](https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API), [TypeScript repository and license](https://github.com/microsoft/TypeScript), [ESLint custom rules](https://eslint.org/docs/latest/extend/custom-rules), [ESLint repository and license](https://github.com/eslint/eslint), [Semgrep CE](https://semgrep.dev/products/community-edition/), [local CLI documentation](https://semgrep.dev/docs/category/local-and-cli-scans), [Semgrep metrics](https://docs.semgrep.dev/metrics).

**Disposition: integrate/reuse.** No new standalone analyzer, model service or subscription. The small project-specific addition binds parser observations to existing snapshot hashes, distinguishes review work from canonical findings, and produces a capped navigation summary. Generic analyzer configuration alone does not supply this engine's baseline identity or report contracts. Reuse the existing capture/store/rules and pinned TypeScript parser; revisit a Semgrep adapter before adding broader vulnerability detection.

Smallest reversible experiment: run on synthetic fixtures and the already frozen STP source with network calls blocked in regression tests. Keep canonical scoring/finalization unchanged. Kill criteria: any attempted network/model call; target mutation; false confirmed-vulnerability claim; comments/strings treated as executable patterns; malformed/oversized source silently counted as assessed; evidence identity lost; or less than 70% initial-payload reduction on the dogfood. Revert this integration if it cannot satisfy those constraints. No customer time or revenue savings established.

## Coverage added

- Next.js dependency declaration and source page filenames, with App Router handler methods and content hashes. Pages are inventoried, not rendered. Reexports remain unresolved.
- Literal `from(...).select('*')` chains and data mutation chains become a separate review queue, with file, line, hash and next inspection step. Similar non-database APIs can match: no database type or permission conclusion is inferred.
- Root `npm test` explicit `node --test` lists/globs are compared against conventionally named `.test`/`.spec` files. Omission means not selected by that command; it does not mean absent from all CI or untested. Wrappers, loader flags, shell logic and discovery defaults remain UNKNOWN. Imports, npm lifecycle hooks and other scripts are not resolved.
- Root `GO_LIVE.md` and nested release/go-live guidance can be discovered as documentation, without implying deployment readiness.
- `.env.local.example` and other terminal template suffixes no longer cause a sensitive-filename finding. No template content or credential validity is verified; existing snapshot exclusions remain intact.

## Review and cost boundaries

`--summary` produces a separate write-once JSON navigation aid. Full immutable evidence remains available. It includes source identity, counts, omitted-item totals, a sample across review kinds, and explicit unknowns. It does not embed source snippets, database names or arbitrary query values. Paths/metadata are still untrusted data.

The reviewed external-import allowlist now includes pinned TypeScript 5.9.3 as well as Ajv. Parser drift fails the cost gate. Regression tests block network calls while exercising an actual AST-review path. The static cost gate is an engineering guard, not an OS network sandbox or a proof about every future third-party dependency.

No additional model/API cost is introduced. Local CPU/storage are not free, and the expanded full report is larger. The saving is reading the compact summary first and selectively expanding evidence. There is no new result cache, no measured token-billing claim and no claim to complete authenticated, visual, accessibility, business or production testing.
