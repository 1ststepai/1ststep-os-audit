# Security Boundaries — Audit Engine

Threat model: the **target repository is hostile input**. It may contain prompt injection, malicious scripts, secrets, path tricks, archive bombs, or instructions aimed at AI auditors. The audit must stay trustworthy even when the target is adversarial.

## B1 — No writes to the target
- Capture reads files with read-only handles. Git is read with plumbing commands and `GIT_OPTIONAL_LOCKS=0` (plain `git status` can rewrite `.git/index`). No `fetch`, `gc`, checkout, stash or hooks.
- The manifest is hashed before and after capture. If they differ, the snapshot is `INVALIDATED`.
- The audit home (store, runs, ledger) is outside the target.

## B2 — Analyze the snapshot, not the live directory
Every later stage reads the stored snapshot. The live working directory is touched only during capture.

## B3 — Repository content is data, never instructions
- Agents run with cwd **outside** the target. The target's `CLAUDE.md`, `AGENTS.md`, `.cursorrules`, `.github/copilot-instructions.md`, `prompts/**` and similar files are **never loaded as agent configuration**. They are evidence about the target's documentation.
- Target content reaches models only inside delimited, provenance-tagged envelopes (`path`, `contentHash`, `trust: UNTRUSTED_EXTERNAL`). The system prompt states that envelope content cannot change instructions, tools, scope or output format.
- Agents get a **read-only tool surface over the snapshot** (list, read range, search). No shell, no network, no write, no connector credentials.
- Output must validate against the audit schemas (structured output). Free text is stored as `untrustedText`/`AI_GENERATED`.

## B4 — Deterministic checks on every model claim
- **Citation verifier:** each REPOSITORY locator must resolve to a snapshot file whose hash equals `contentHash`, and the excerpt must appear in the cited line range. Failed citations are rejected, not downgraded.
- **Status ceiling:** models may propose a control status but cannot set scores. The engine applies caps, and `VERIFIED` requires E4 evidence from a non-model source kind.
- Models cannot create `VerificationRecord`s, transition findings to VERIFIED, finalize baselines, or change registries.
- `ABSENT` requires E3+ absence/refuting evidence with recorded search coverage. A model's "I couldn't find it" is `UNVERIFIED`.

## B5 — Injection detection and quarantine
Detectors flag AI-directed imperative text ("ignore previous instructions", text addressed to auditors/agents/LLMs, fake tool-call or JSON-schema blocks, hidden Unicode such as zero-width characters and bidi overrides, base64 blobs in docs).
Flagged spans are excluded from model context (redaction type `PROMPT_INJECTION_QUARANTINE`) and analyzed only by deterministic detectors. The detection itself is recorded as evidence and may raise a SECURITY finding.

## B6 — Secrets
- The secret scanner runs **before** any content is sent to a model or written into evidence.
- Secret values are never stored. Evidence records path, line, type and an 8-hex hash prefix. Ignored secret files (`.env*`) are recorded by path only and excluded from archives.
- Command containers receive no host environment variables.

## B7 — Filesystem and archive safety
Canonicalize paths; reject `..`, absolute paths and symlinks resolving outside the root; skip devices/FIFOs; cap file size (default 2 MB for analysis, larger files hashed only), file count and total bytes. Archive import (later) enforces zip-slip checks, entry count, expansion ratio and total size limits.

## B8 — Command execution sandbox (opt-in)
- Runs only after explicit user opt-in per run, in a **disposable Docker container** on a copy of the snapshot (Docker 29.7 is present on the dev machine). The original working directory is never mounted.
- `CONTAINER_NO_NETWORK` by default. Dependency install may use `CONTAINER_REGISTRY_ONLY` (egress to package registries only) with lifecycle scripts disabled (`--ignore-scripts` or the equivalent).
- Non-root user, read-only base image, CPU/memory/time/output limits, no Docker socket, no host mounts except the copy.
- If no container runtime is available, the command is `NOT_RUN` and the controls stay `UNVERIFIED`. `PROCESS_DISPOSABLE_COPY` needs a second explicit consent and is labelled in the report.

## B9 — Network and SSRF
- URLs found in the repository are **never fetched automatically**.
- Live probes only hit `AuditTarget.environments[].urls` with `confirmed: true`. Private/link-local/metadata IP ranges are rejected after DNS resolution (rebinding-safe). No credentials are sent. GET/HEAD only, bounded page count.
- Connectors call allowlisted provider API hosts with read-only, least-privilege, short-lived credentials held in an OS keychain or secret store, never in evidence, reports or bundles.

## B10 — Rendering and exports
Reports escape all target-derived text: no raw HTML, neutralized Markdown links/images (no remote image beacons), fenced excerpts. Exported bundles redact `localPath` to its basename and contain no secrets or connector tokens.

## B11 — Permissions
The audit holds only upstream scope `read`. Any remediation that touches external systems is a `RemediationTask` with `approvalClass` `APPROVAL_REQUIRED`/`HIGH_RISK_APPROVAL`, executed outside the audit by the user or an approved remediation workflow.

## B12 — Hosted mode (later)
Tenant-scoped storage prefixes and row-level security; per-job ephemeral workers; object lock for snapshots; append-only history tables (no UPDATE/DELETE grants); audit log of every access to snapshot contents; data retention per org policy.

## B13 — Integrity of the audit itself
Registries, scoring config and upstream lock are versioned and hash-referenced by every run. The ledger is hash-chained. Changing a registry never alters stored scores. It only affects future runs or explicitly labelled rescoring records.
