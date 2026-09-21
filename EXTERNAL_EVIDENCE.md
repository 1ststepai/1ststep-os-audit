# External Evidence — Live State vs Code Intent

## Principle
Two planes are never conflated:

- **REPOSITORY (intent):** what code/config says *should* happen. Max E3; E4 only for executed tests/commands and git facts.
- **LIVE (state):** what running systems actually do. E4 only when observed through an authoritative system, in the **declared environment class**, and still **fresh**.

A control with `requiredPlane: LIVE` is capped at `livePlaneCap` (50) until LIVE evidence exists. Code intent can never confirm live state. If intent and live state disagree, the result is a finding, not an average.

## Connector contract
```text
Connector {
  id, provider, category,               # e.g. stripe-readonly, BILLING
  scopes: read-only, least privilege,   # declared and shown to user before connect
  evidenceKinds: [EXTERNAL_SYSTEM|RUNTIME_PROBE],
  environmentClass detection,           # live vs test mode, prod vs preview
  freshnessTtl,                         # evidence older than TTL at scoredAt ⇒ treated as UNVERIFIED
  rateLimits, dataMinimization          # metadata/aggregates only, never row-level customer data
}
```
Connectors only emit `EvidenceItem`s with a `LIVE` locator (`connectorId`, `systemId`, `environmentClass`, `observedAt`, `freshUntil`, `responseObject`). They cannot create findings or scores.

## Coverage plan

| Area | Evidence (read-only) | Source kind | TTL | Typical controls | Phase |
|---|---|---|---|---|---|
| Production deployments | Hosting API (Vercel/Netlify/Fly/Render): production deployment commit SHA, env var **names**, rollback history, protection; HTTP probe of confirmed prod URL | EXTERNAL_SYSTEM, RUNTIME_PROBE | 24h | DEPLOYMENT-001/002, SECURITY-003, RELEASE_READINESS-001 | probe: MVP; APIs: C2 |
| Auth providers | Supabase/Clerk/Auth0/Firebase admin read: enabled methods, MFA policy, redirect allowlist, password policy | EXTERNAL_SYSTEM | 7d | AUTH-002 | C2 |
| Database state | Read-only metadata role: migration history table, RLS/policy enabled per table, backup/PITR settings. **No row data.** | EXTERNAL_SYSTEM | 24h | DATABASE-001/002, CONTINUITY-001 | C2 |
| Billing providers | Restricted read key (Stripe/Paddle/LemonSqueezy): live-mode webhook endpoints + events, products/prices, delivery failure rate, aggregate subscription counts by status | EXTERNAL_SYSTEM | 24h | BILLING_CONTINUITY-002, PRICING-001, MIGRATION_CONTINUITY-001 | C2 |
| Analytics | PostHog/GA4/Plausible read: event names and 7-day volumes vs taxonomy; conversion source capture | EXTERNAL_SYSTEM | 7d | ANALYTICS-001, GROWTH-001 | C3 |
| CI/CD | GitHub API (`gh`, read): default-branch runs, required checks, branch protection, Dependabot/secret scanning status | EXTERNAL_SYSTEM | 24h | DEPLOYMENT-001, SECURITY-002 | C2 |
| Domain/DNS | Public DNS: A/AAAA/CNAME, CAA, MX, SPF/DKIM/DMARC; TLS cert chain + expiry; registrar expiry (RDAP) | RUNTIME_PROBE | 7d | SECURITY-003, CUSTOMER_SUCCESS (email deliverability) | MVP |
| App stores | App Store Connect / Play Console read: live version, review status, privacy labels; public listing fetch | EXTERNAL_SYSTEM, RUNTIME_PROBE | 7d | DISTRIBUTION-002 | C3 |
| Social / launch | Public profile/listing pages for **user-declared** handles/URLs; manual attestation (screenshot/export) as E2 | RUNTIME_PROBE, USER_ATTESTATION_ARTIFACT | 30d | SOCIAL-001, DISTRIBUTION-001, BRAND-001 | MVP (manual + public fetch) |
| Legal pages / SEO / perf | Crawl of confirmed prod domain (bounded) | RUNTIME_PROBE | 7d | LEGAL_READINESS-001/002, SEO_CONTENT-001, PERFORMANCE-001 | MVP |

## Rules
1. **Environment match:** preview/staging evidence never satisfies a PRODUCTION control. The mismatch is recorded.
2. **Freshness:** evaluated against `ReadinessScore.scoredAt`, so it is reproducible. Stale evidence counts as `UNVERIFIED` and creates an `EVIDENCE_COLLECTION` task.
3. **User statements** (E1, cap 25) and **attestation artifacts** (E2, cap 50) are recorded as context. They never produce `VERIFIED`.
4. **Intent/live mismatch** (e.g. code handles `invoice.paid` but the live endpoint does not subscribe to it) produces a finding that cites both evidence items.
5. **Blocked access** (no credentials, consent declined) ⇒ evidence `BLOCKED`/E0 and control `BLOCKED`, reported under unknowns, never scored as absent.
