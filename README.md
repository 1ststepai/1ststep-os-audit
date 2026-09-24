# 1stStep OS Audit

**Product:** 1stStep OS Audit & Recovery  
**Parent brand:** 1stStep.ai  
**Companion product:** 1stStep OS  
**Release status:** early developer preview; source inspection, not production certification.

## Mission

Audit existing projects against the canonical 1stStep OS capability model, establish an immutable baseline, identify evidence-backed gaps, score readiness, generate prioritized remediation, and verify recovery without rewriting history.

## Core principle

> Audit the actual project, not the documentation claims.

A `SECURITY.md` file does not prove security.
A passing build does not prove production readiness.
A README does not prove architecture.
A pricing page does not prove viable unit economics.

## Primary flow

Existing Project  
→ Discovery  
→ Baseline Snapshot  
→ Evidence Collection  
→ Multi-domain Audit  
→ Findings  
→ Readiness Scores  
→ Prioritized Recovery Plan  
→ Generated/Updated Project OS  
→ Remediation Cycles  
→ Verification  
→ Re-audit

## Offline review with less context

Requires Node.js 24+ and Git. Clone the public companion contracts alongside this repository at the verified revision. The directory name `1stStep OS` matters because the contract lock resolves that sibling path:

```sh
git clone https://github.com/1ststepai/1ststep-os.git "1stStep OS"
git -C "1stStep OS" checkout e8580728e9bbb71eb39e021658b091de47d49709
git clone https://github.com/1ststepai/1ststep-os-audit.git
cd 1ststep-os-audit
git checkout v0.2.0
npm ci
npm run check
```

The audit itself runs locally without model/API calls. Installation requires network access to GitHub and npm. Do not run the audited project's commands. From this repository, replace the example paths with your target and a separate output directory:

```powershell
node engine/src/free-cli.ts C:/Projects/example --target TGT-EXAMPLE --home C:/Audits/example/store --out C:/Audits/example/full.json --summary C:/Audits/example/summary.json
```

Read `summary.json` first; open only the cited files or full-report sections that need review. Use new output names for each run: reports are immutable. Both outputs and the store must be outside the target.

The free lane retains its 12 provisional rules and now adds a separate Next.js App Router source inventory, AST-based data-access review queue, and explicit Node test-file selection checks. Suspect patterns are review candidates, not confirmed vulnerabilities or finalized findings. No target scripts, model calls or network requests run. TypeScript 5.9.3 is reused as the local parser.

This remains **PARTIAL / NOT ASSESSED**, with no aggregate readiness score. It does not verify rendered UI, authenticated behavior, payments or production. Smaller review payloads can reduce context supplied to an assistant; actual token billing has not been measured. See [scope, reuse decision and limitations](docs/offline-review.md).

In one internal STP comparison, the initial report to read fell from 60,049 bytes to 5,849 bytes (90.26% smaller); the expanded full evidence report was retained separately. This is a byte-size measurement for one project, not a token-count, invoice or accuracy benchmark. See [measurement and release notes](docs/releases/v0.2.0.md).
