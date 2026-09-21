# Canonical Audit Standard

## Audit dimensions

1. Product Definition
2. Architecture
3. Code Quality
4. Security
5. Privacy & Data Governance
6. Authentication & Authorization
7. Database & Migrations
8. Testing & QA
9. Accessibility
10. UX & Visual Quality
11. Performance
12. AI Runtime / Token / Cost Efficiency
13. Observability
14. Deployment & Release Safety
15. Backup / Recovery / Continuity
16. Documentation / Project OS
17. Business Model
18. Pricing / Unit Economics
19. Market / Competitor Intelligence
20. Brand / Positioning
21. SEO / Content
22. Social Presence
23. Launch / Directory Distribution
24. Growth / Partnerships / Affiliates
25. Sales / CRM
26. Customer Success / Support
27. Automation / Operations
28. Analytics / CRO / Attribution
29. Localization / Internationalization
30. Legal / Compliance Readiness
31. Billing / Subscription Continuity
32. Legacy User / Migration Continuity
33. Release Readiness

## Audit modes

### Snapshot Audit
Read-only assessment of current state.

### Launch Audit
Focus on whether the product is safe and ready to ship.

### Recovery Audit
Full gap analysis plus remediation sequencing.

### Migration Audit
Focus on data, users, billing, entitlements, integrations, and continuity.

### AI Efficiency Audit
Focus on model routing, token/context waste, retries, caching, evals, and cost.

### Growth Audit
Focus on discoverability, positioning, channels, conversion, and lifecycle.

## Output requirements
An **accepted, complete** audit is tied to a sealed, immutable baseline and produces an evidence inventory, applicable controls and exclusions, confirmed strengths, evidence-backed findings, launch blockers where established, unresolved unknowns, prioritized remediation, and a recommended next cycle. Its methods and limits are visible even when it finds little or nothing wrong. A commercial free audit must remain useful without an OS purchase; neither a finding nor a specialist recommendation is required to make it valuable.

The **standard free result** has a permanent zero-metered-cost invariant (ADR-022): baseline-derived Genome, detectors, control/pattern checks, finding and priority selection, OS/agent mapping and report rendering require no metered AI/API call paid by 1stStep.ai. Only honestly deterministic domains are assessed. Product-market fit, nuanced UX/architecture, market/business strategy and other unsupported judgments are NOT ASSESSED, never filled by unpaid-looking inference. User answers are USER CONFIRMED, not independently verified repository evidence. Findings cite the explicit versioned rule and source that fired; a pattern must be reviewed and have deterministic applicability/evidence/severity logic. No “AI analyzing” copy is used when no AI ran. Separately authorized paid analysis may use models, but its evidence and fees must not be silently inserted into the free result. Track infrastructure consumption separately.

An incomplete first look or blocked audit is reported as **PARTIAL / NOT ASSESSED** with source identity, permissions, coverage and missing evidence stated. It is never presented as an “audit complete” result. The engine's internal dimension/overall scores may be computed under the versioned `SCORING_MODEL.md`, but customer-facing readiness numbers are **conditional** on a future, validated coverage/publication gate. Until that gate is defined, tested and passed, present evidence, strengths, findings, priorities and unknowns without an aggregate number. `UNVERIFIED` and `BLOCKED` do not mean `ABSENT` or a bad project. Finding counts are displayed only for real, finalized findings at a pinned baseline; example counts are labeled fixtures.

Audit-to-OS recommendations map applicable confirmed gaps and strengths to upstream capabilities/modules; unnecessary specialist agents are omitted. Ranking should prioritize severity, affected surface, evidence, dependencies, and verification path rather than conversion likelihood. A top-three list is a presentation limit, not a reason to hide other findings or unresolved critical unknowns. Remediation is followed by independent verification and a new audit/current snapshot, never rewriting the baseline.
