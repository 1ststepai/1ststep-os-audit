# Canonical Audit Schemas — v0.1.0

JSON Schema 2020-12 in `schemas/audit/0.1.0/`. `$id` base: `https://1ststep.ai/os-audit/schemas/0.1.0/`. Upstream 1stStep OS schemas are referenced by `$id` and pinned by hash (`.project-os-audit/upstream-lock.json`), never copied.

| Schema | Purpose |
|---|---|
| `audit-common` | Audit IDs, 33 domains, 11 project types, evidence strength/source kinds, statuses, AuditNote; re-exports upstream common defs |
| `audit-target` | AuditTarget: source, identity strength, profile (upstream ProjectProfile properties), environments, external systems |
| `baseline-snapshot` | BaselineSnapshot (BASELINE/CURRENT): fingerprint, content manifest, capture integrity, stored objects, inventory, commands, seal |
| `audit-run` | AuditRun: run type, modes, scope, pinned versions, agents, checkpointed stages, gates |
| `evidence-item` | EvidenceItem: state × strength pairing, source-kind ceilings, locators, absence coverage, redactions |
| `control-definition` | ControlDefinition: capability refs, applicability, risk weight, plane, evidence requirements, scoring rule, finding templates, launch blocker |
| `control-registry` | ControlRegistry wrapper (`.project-os-audit/controls.json`) |
| `control-result` | ControlResult: applicability, proposed status, engine-computed weight/level/cap/finalScore |
| `finding` | Finding: immutable ID, fingerprint, append-only history, verification links |
| `dimension-score` | DimensionScore: control contributions, caps with `binding`, unverified/capped controls |
| `readiness-score` | ReadinessScore: pinned versions, inputsHash, caps, label, launch blockers, confidence |
| `remediation-task` | RemediationTask: findings, priority, type, scope, acceptance criteria, verification, approval class |
| `verification-record` | VerificationRecord: independent verifier, CURRENT snapshot, evidence, result |
| `project-type-profiles` | ProjectTypeProfiles (`.project-os-audit/project-types.json`): derivation, domain weights, multipliers |
| `recovery-plan` | RecoveryPlan: priorities, execution order, delta, Project OS handoff |

Reused from upstream 0.1.0: `common` (ids, hashes, evidenceState, actor, untrustedText, assessment, capabilityId), `project-profile` properties, `module-definition#/$defs/condition`, `gate-result` and `handoff` (for gate/handoff records), `finding` (export target).

Validate everything: `python tools/validate_foundation.py`.
