# Internal Dogfooding Plan

**No internal project has been audited or modified in the Foundation Cycle.** During this cycle only directory existence and `.git` presence were checked, to plan identity capture.

## Preconditions (all targets)
- audit:G1 ratified by the owner; engine-core CLI able to reach audit:G2 (baseline) on the self-audit.
- The repository mapping is confirmed by the owner at audit:G0 (see blockers).
- **No agent is actively writing to the target during capture.** Several internal repos show Codex/Claude queue and worktree directories. Per the app.1ststep.ai agent-team rule, confirm quiet state first. The capture stability check invalidates a baseline if files change anyway.
- The execute stage runs only in Docker on a copy, with no host environment variables.

## Order and modes

| # | Target | Candidate local path(s) (UNCONFIRMED) | Audit project types (to confirm) | Modes | Why this position |
|---|---|---|---|---|---|
| 0 | 1stStep OS Audit (self) | this repo | DEVELOPER_TOOL, INTERNAL_TOOL | SNAPSHOT | Zero user-data risk; exercises intake → baseline → report end to end; mostly DOCUMENTATION_OS/CODE_QUALITY controls. It is not a git repo yet, so it also tests WEAK identity. |
| 1 | DaySetGo | `DaySetGo` (+ sibling dirs `DaySetGo-admin-dashboard`, `-marketing-baseline`, `-owner-brand`, `-sonar-quality-gate`) | SAAS (+ verify) | SNAPSHOT → GROWTH | Real SaaS with moderate risk. Sibling directories test multi-worktree/multi-repo identity (are they worktrees of one repo or separate repos?). |
| 2 | SwingTradePros | `Trading Tools`? (unconfirmed) | FINTECH_TRADING, AUTOMATION_BUSINESS | LAUNCH | Exercises fintech weighting, LEGAL_READINESS-002 disclaimers on alert surfaces (e.g. Discord), and automation idempotency. |
| 3 | 1stStep.ai Job Agent | `1ststep.ai` **or** `AI-Powered Job Search Platform` (both git repos; unconfirmed) | AI_SAAS | RECOVERY + AI_EFFICIENCY + MIGRATION (billing/legacy users) | Highest value and risk (AI, billing, user data, active multi-agent development). Audited last, once the pipeline has proven itself on lower-risk targets, because a flawed baseline is permanent (only notes can amend it). |

The owner may move the Job Agent earlier. If so, run it as SNAPSHOT only first and defer LAUNCH/RECOVERY scoring until self-audit and DaySetGo have validated the pipeline.

## Per-target procedure
1. audit:G0 — confirm path, remote, branch, product types, environments (prod URLs), external systems, modes, excluded domains.
2. Quiet-state check → capture → audit:G2.
3. Execute (opt-in) → assess → score → report draft.
4. Owner review → finalize (seal).
5. Recovery plan (P0 first) → owner approval (audit:G5) → remediation happens in the target's own cycles, **not** in this repo.
6. Verification run → re-audit delta.

## What each dogfood run must prove
| Run | Engine capability under test |
|---|---|
| Self | WEAK identity, non-git archive, DOCUMENTATION_OS scoring, report rendering |
| DaySetGo | Worktree/sibling identity, dirty-state overlay, SaaS weighting, live probe of confirmed domain |
| SwingTradePros | Multi-type MAX combination, fintech launch blockers, automation controls |
| Job Agent | AI controls, billing intent-vs-live split (connector or BLOCKED), provider policy, large-repo limits, migration continuity decisions |

## Success criteria for the dogfood program
- Each finalized baseline reproduces its scores exactly from stored inputs.
- Zero writes to targets during audit, proven by manifest stability.
- Every P0 finding is judged "correct and actionable" by the owner. False-positive rate on P0/P1 is recorded and fed back into the controls.
