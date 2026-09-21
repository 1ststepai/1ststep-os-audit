# Evidence Policy — v0.1.0

Schema: `schemas/audit/0.1.0/evidence-item.schema.json`. Live vs intent: `EXTERNAL_EVIDENCE.md`.

## Two independent axes
- **state** — epistemic status, upstream vocabulary: CONFIRMED · OBSERVED · INFERRED · ASSUMED · UNVERIFIED · BLOCKED.
- **strength** — source class: E0–E4.

| strength | meaning | allowed state |
|---|---|---|
| E4 | Direct verified: runtime probe, authoritative external system, executed test/command, git facts | CONFIRMED |
| E3 | Strong repository evidence: source/config/manifest seen directly; runtime not verified | OBSERVED |
| E2 | Documentation, intended config, user-supplied artifacts | OBSERVED |
| E1 | Inference or user statement | INFERRED / ASSUMED |
| E0 | No evidence / blocked | UNVERIFIED / BLOCKED (ASSUMED allowed) |

## Source-kind ceilings (schema-enforced)
| sourceKind | max | plane |
|---|---|---|
| RUNTIME_PROBE, EXTERNAL_SYSTEM | E4 | LIVE |
| TEST_EXECUTION, COMMAND_OUTPUT, GIT_METADATA | E4 | REPOSITORY |
| SOURCE_CODE, CONFIGURATION, DEPENDENCY_MANIFEST | E3 | REPOSITORY |
| DOCUMENTATION, USER_ATTESTATION_ARTIFACT | E2 | REPOSITORY / HUMAN |
| USER_STATEMENT, AI_INFERENCE | E1 | HUMAN / ANALYSIS |

## Source hierarchy (preference when evidence conflicts)
1. production/runtime · 2. authoritative external system · 3. automated test execution · 4. source/configuration · 5. project documentation · 6. user statement · 7. inference.
Higher-ranked evidence decides. The conflict is kept (both items cited), and a REFUTES item from a higher rank can raise a finding.

## Polarity
`SUPPORTS` · `REFUTES` · `ABSENCE`. ABSENCE requires `searchCoverage` (patterns, paths, file count).

## Rules
- A score cannot exceed the evidence supporting it (`SCORING_MODEL.md` §2).
- Documentation cannot upgrade a runtime control to VERIFIED, and cannot be E3+.
- User statements are context, not verification.
- Missing evidence is `UNVERIFIED`, never silently complete and never proof of absence.
- Missing **documentation** is never proof that **implementation** is missing.
- Every repository citation carries `contentHash`. Excerpts are redacted, size-capped `untrustedText`.
- Live evidence carries `environmentClass`, `observedAt` and `freshUntil`. Stale evidence is UNVERIFIED at scoring time.
- Evidence is immutable once its run is finalized. Corrections are AuditNotes.
