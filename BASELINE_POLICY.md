# Immutable Baseline Policy — v0.1.0

Schema: `schemas/audit/0.1.0/baseline-snapshot.schema.json`.

## 1. Target identity (stable across snapshots)
| Strength | Basis |
|---|---|
| STRONG | Git root commit SHA(s) (`git rev-list --max-parents=0 HEAD`) + normalized remote |
| MODERATE | Normalized remote only (shallow clone, root unknown) |
| WEAK | Non-git: user assertion + first content manifest hash |

Remotes are normalized: lower-case host, `.git` suffix unified, **userinfo/tokens stripped** (schema rejects credentials). Two directories with the same root commit are the same project. Sibling worktrees are recorded as `worktreeCount`, not as separate targets.

## 2. Snapshot fingerprint (one moment)
1. Path/URL, branch or `(detached)`, HEAD SHA, shallow flag, submodule SHAs, stash count, worktree count.
2. `statusHash` = sha256 of `GIT_OPTIONAL_LOCKS=0 git status --porcelain=v2 -z --untracked-files=all` (read-only; no index refresh).
3. Dirty counts: modified / untracked / deleted.
4. **Content manifest** `sha256-sorted-path-v1`: for every tracked file plus untracked non-ignored file (excluding `.git/`), the line `<posix path>\0<sha256 of bytes>\n`, sorted by path bytes; `manifestHash` = sha256 of the concatenation. Line endings are hashed as stored on disk (no normalization).
5. Exclusions recorded as counts/paths only: git-ignored count, secret-candidate paths (contents never read into evidence), oversize, symlinks escaping the root.
6. **Capture integrity:** manifest computed before and after capture. If unequal ⇒ `INVALIDATED` (re-capture when the target is quiet).

## 3. Stored copy
- Git: `git bundle create --all` (full history, verifiable) + overlay archive of modified/untracked non-ignored, non-secret files.
- Non-git: full archive of included files.
- Stored as content-addressed write-once objects. The snapshot references them by hash.

## 4. Capture procedure (before any remediation)
1. Record identity and fingerprint (above).
2. Inventory files, languages, manifests, scripts, dependencies, signals (read-only detectors).
3. Optionally execute install/build/test/lint/typecheck/secret scan/dependency audit in the sandbox on a copy (`SECURITY_BOUNDARIES.md` B8).
4. Capture known external-system evidence (confirmed environments only).
5. Generate evidence, control results, findings, scores.
6. Owner reviews the report → **finalize**.

## 5. Finalization = seal
- `sealHash` = sha256 over canonical JSON of the snapshot (without `finalization`) plus the baseline run's evidence, control results, findings (as of finalization), dimension and readiness scores.
- Appended to `ledger.jsonl` as `{seq, at, objectKind, objectId, objectHash, prevHash}`. `ledgerEntryHash` is stored in the snapshot.
- After sealing, files are read-only locally (WORM object lock when hosted). Verification = recompute seal and chain.

## 6. Immutability across remediation
- Remediation happens in the target, never in the store. Later states are **new** `CURRENT` snapshots, each linked to the baseline (`AuditRun.baselineId`).
- Baseline scores are never recomputed in place. Rescoring under a new registry creates a separate record labelled with its versions.
- Corrections are appended `AuditNote`s (`CORRECTION`, `CLARIFICATION`, `SCOPE_CHANGE`, `INVALIDATION`). The original snapshot is never rewritten or deleted.
- If a baseline proves unusable (e.g. wrong repository), it gets an `INVALIDATION` note and a new baseline is captured. Both remain in history.
