# Readiness Scoring Model — v0.1.0

Config: `.project-os-audit/scoring.json`. Reference implementation and worked example: `tools/validate_foundation.py`, `fixtures/foundation-example.json`.

Scores are computed **only** by the deterministic engine. Agents propose a control `status` with evidence. They never set numbers.

**Product presentation boundary (owner direction, 2026-09-13):** This v0.1.0 formula is a reference/internal computation, not an automatic customer-facing readiness claim. Its `UNVERIFIED` and `BLOCKED` control levels contribute zero mathematically; when coverage is incomplete that zero must **never** be explained as observed weakness or used to publish a misleading low overall number. `AUDIT_STANDARD.md` now requires an explicit, validated coverage/publication gate before a quantitative readiness score appears in a free audit. Exact gate thresholds, denominator handling, and behavior for incomplete identity/required evidence are unresolved design work; changing them requires versioned scoring, fixtures, negative tests and a new ratified Audit decision. No new engine has been implemented by this note.

## 1. Applicability
1. Project types come from upstream ProjectProfile fields via `project-types.json` derivation, confirmed at audit:G0. Multiple types are allowed.
2. A control applies if any matched type is in `applicability.projectTypes` (or `ALL`) and that type does not list it in `excludeControls` (union).
3. If a referenced profile field is UNKNOWN, `onUnknown` decides: INCLUDE, EXCLUDE, or RAISE_DECISION (blocks audit:G0).
4. Not-applicable controls are excluded from every denominator.

## 2. Control score
```
level      = statusLevels[status]    ABSENT 0 · PARTIAL 25 · IMPLEMENTED_UNVERIFIED 50 · IMPLEMENTED_STRONG 75 · VERIFIED 100 · UNVERIFIED 0 · BLOCKED 0
cap(e)     = min(evidenceCaps[e.strength], control.evidenceKindCaps[e.kind] ?? defaultSourceKindCaps[e.kind] ?? 100)
                 evidenceCaps: E0 0 · E1 50 · E2 70 · E3 85 · E4 100
                 defaultSourceKindCaps: DOCUMENTATION 25 · USER_STATEMENT 25 · AI_INFERENCE 25 · USER_ATTESTATION_ARTIFACT 50
evidenceCap = max over cited evidence of cap(e)            (0 if none)
            ; if requiredPlane = LIVE and no LIVE-plane evidence: min(evidenceCap, 50)
finalScore = min(level, evidenceCap)
weight     = riskWeight(1..5) × max(controlMultipliers[matched types] ?? 1)
```
Validity rules (not scores): `VERIFIED` needs E4 evidence. `ABSENT` needs E3+ ABSENCE/REFUTES evidence with search coverage. `UNVERIFIED` scores 0 but is reported as unknown, never as absent.

## 3. Dimension score
```
raw   = Σ(weight × finalScore) / Σ weight          over applicable controls in the domain
caps  = CRITICAL open finding → 40 ; HIGH open finding → 70
score = min(raw, caps)
```
"Open" means status **as of `scoredAt`** ∈ {OPEN, IN_PROGRESS, BLOCKED, REMEDIATED}. **REMEDIATED does not lift caps; only VERIFIED does.** ACCEPTED_RISK lifts the cap and is listed separately.
A dimension is excluded (never averaged in) if its type weight is 0, it is out of scope, or it has no applicable controls.

## 4. Overall readiness
```
W_d        = max over matched types of (profile.domainWeights[d] ?? domainDefaults[d])     (0..5)
uncapped   = Σ(W_d × dimension_d) / Σ W_d          over included dimensions
score      = uncapped, or min(uncapped, 49) if any open launch-blocker finding
label      = ≥90 STRONG · ≥80 GOOD_WITH_MINOR_GAPS · ≥70 MATERIAL_GAPS · ≥50 NOT_RELEASE_READY · else HIGH_RISK_RECOVERY_REQUIRED
launchBlocked = any open finding whose control's launchBlocker rule matched (status ∈ whenStatusIn, type ∈ projectTypes)
```
`launchBlocked` overrides the label for release decisions whatever the number says.

## 5. Confidence
```
strong(control) = best cited strength ∈ {E3,E4} AND finalScore ≥ level (not capped)
ratio           = Σ weight(strong) / Σ weight(applicable)
HIGH  : ratio ≥ 0.70 and every applicable launch-blocker control has E3+ evidence
MEDIUM: ratio ≥ 0.40
LOW   : otherwise
```

## 6. Reproducibility
- Intermediate math is exact. Published values round half-up to 1 decimal (ratio: 3).
- `inputsHash = sha256(canonical JSON {versions, projectTypes, domains, scoredAt, controlResults[{controlId,status,evidence[(kind,strength)]}], findings[{id,domain,severity,launchBlocker,status@scoredAt}]})`, with sorted keys and no whitespace.
- Every run pins `controlRegistry`, `scoringModel`, `projectTypeProfiles` versions and `upstreamLockHash`.
- **No retroactive changes:** stored scores are never recomputed in place. A newer registry produces a *new* labelled rescoring record. Baseline vs current deltas are `comparable` only under identical versions.

## 7. Why this cannot be gamed by documentation
- DOCUMENTATION evidence is E2 at most, and capped at 25 for implementation controls (70 only for controls whose subject *is* documentation).
- AI inference and user statements are capped at 25 and never reach VERIFIED.
- LIVE controls stay ≤50 without live evidence.
- Open HIGH/CRITICAL findings cap dimensions whatever else was documented.
- Worked example: `CTL-AUTH-002` claimed IMPLEMENTED_STRONG (75) on `SECURITY.md` alone scores **25**.

## 8. Worked example (fixture)
SaaS target, 3 domains in scope:
- SECURITY raw (5·100 + 3·25)/8 = 71.9 → open HIGH caps it at **70**.
- AUTH (5·25 + 4·25)/9 = **25**.
- DOCUMENTATION_OS **0**.
- Overall (5·70 + 5·25 + 2·0)/12 = **39.6** → HIGH_RISK_RECOVERY_REQUIRED, launchBlocked (AUD-0002), confidence HIGH (ratio 0.789).

AUD-0001 is VERIFIED today, but the baseline still scores 39.6 because findings are evaluated as of `scoredAt`.
