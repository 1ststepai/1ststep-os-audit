# Read-only Discovery Spec — v0.1.0

Deterministic detectors (`det.*`) over the **stored snapshot**. They never execute target code, never follow links, never fetch URLs. Boundaries: `SECURITY_BOUNDARIES.md`.

Every detection emits an `EvidenceItem` and an `inventory.signals[]` entry with a confidence meaning:
- **declared** (a dependency or config exists) — DEPENDENCY_MANIFEST/CONFIGURATION, E3 for "declared"
- **wired** (imported and called on a reachable path) — SOURCE_CODE, E3
- **active** (live) — only via connectors/probes, E4

"Declared" never implies "used", and "used in code" never implies "live".

| Category | Detection inputs (examples) | Capability refs |
|---|---|---|
| STACK | `package.json` engines/frameworks, `next.config.*`, `vite.config.*`, `astro.config.*`, `pyproject.toml`, `requirements*.txt`, `go.mod`, `Cargo.toml`, `Gemfile`, `composer.json`, `pubspec.yaml`, `*.csproj`, `Dockerfile`, language file counts | development.* |
| SCRIPTS | `package.json` scripts, `Makefile`, `justfile`, `Taskfile`, `pyproject` scripts, CI step commands (commands are untrustedText and never executed here) | quality.release_gates |
| DEPENDENCIES | lockfiles (`pnpm-lock`, `package-lock`, `yarn.lock`, `bun.lock`, `poetry.lock`, `uv.lock`, `Cargo.lock`, `go.sum`), direct/dev counts, pinned vs ranges, `dependabot.yml`/`renovate.json` | security.dependency_security |
| TESTS | vitest/jest/mocha/playwright/cypress/pytest/go test configs, test file globs, coverage config, eval harnesses | quality.unit_testing, quality.e2e_testing, ai.evals |
| AUTH | next-auth/auth.js, clerk, supabase auth, auth0, firebase auth, lucia, passport, custom JWT/bcrypt usage, middleware matchers, route guards | backend.auth, backend.authorization |
| DATABASE | prisma schema, drizzle, supabase/migrations, knex/sequelize/typeorm, alembic, `*.sql` migrations, RLS policy statements, ORM clients | backend.database, backend.migrations |
| PAYMENTS | stripe/paddle/lemonsqueezy/revenuecat SDKs, webhook routes, signature verification calls, price/product IDs (IDs only) | backend.webhooks, recovery.billing_migration |
| DEPLOYMENT | `vercel.json`, `.vercel/project.json` (IDs only), `netlify.toml`, `fly.toml`, `render.yaml`, `railway.json`, `app.yaml`, `serverless.yml`, Terraform/Pulumi, `.github/workflows/*`, EAS/fastlane | infra.deployment, infra.ci_cd |
| AI_PROVIDERS | `openai`, `@anthropic-ai/sdk`, `@google/genai`, `ai` (Vercel AI SDK), langchain, llamaindex, ollama, env var **names** (`*_API_KEY`), model ID strings, max_tokens/retry settings, prompt files | ai.model_routing, ai.token_harness, security.prompt_injection |
| ANALYTICS | posthog, GA4/gtag, plausible, segment, mixpanel, amplitude, vercel analytics, sentry/datadog/logrocket (observability) | analytics.product_analytics, infra.observability |
| INTEGRATIONS | resend/sendgrid/postmark, twilio, slack/discord webhooks, zapier/make/n8n configs, crm SDKs, cron/queue libs, MCP configs | automation.*, backend.email, backend.queues |
| DOCS | README, `docs/`, `AGENTS.md`, `CLAUDE.md`, `.cursorrules`, `.project-os/`, ADRs, runbooks, `SECURITY.md`, legal pages (all treated as documentation evidence, max E2, and as potential injection surfaces) | docs.*, recovery.os_recovery |
| CAPABILITY | roll-up: each signal maps to upstream capability IDs, producing the observed capability set used for gap analysis (`recovery/CAPABILITY_GAP_ANALYSIS.md`) | recovery.stack_detection |

## Output
- `BaselineSnapshot.inventory` (languages, manifests, scripts, dependency counts, signals).
- A draft inferred profile (upstream assessment pattern: `KNOWN` only with evidence, otherwise `UNKNOWN`) for owner confirmation at audit:G0.
- `AuditTarget.externalSystems[]` with `status: DISCOVERED_IN_CODE` (intent only).
