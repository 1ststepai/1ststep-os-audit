// Deterministic read-only discovery over the STORED snapshot (recovery/DISCOVERY_SPEC.md). Never executes target code.
import type { FileEntry } from "./capture.ts";
import type { Json } from "./util.ts";

type Rule = { category: string; id: string; cap: string; dep?: RegExp; path?: RegExp; kind?: string; value: string };

// ponytail: pattern table covers the common JS/Python/infra ecosystem; extend per stack as dogfooding finds gaps.
const RULES: Rule[] = [
  { category: "STACK", id: "det.stack.nextjs", cap: "development.web_apps", dep: /^next$/, value: "Next.js" },
  { category: "STACK", id: "det.stack.react", cap: "development.web_apps", dep: /^react$/, value: "React" },
  { category: "STACK", id: "det.stack.vue", cap: "development.web_apps", dep: /^(vue|nuxt)$/, value: "Vue/Nuxt" },
  { category: "STACK", id: "det.stack.svelte", cap: "development.web_apps", dep: /^(svelte|@sveltejs\/kit)$/, value: "Svelte" },
  { category: "STACK", id: "det.stack.astro", cap: "development.web_apps", dep: /^astro$/, value: "Astro" },
  { category: "STACK", id: "det.stack.node_server", cap: "development.apis", dep: /^(express|fastify|hono|koa)$/, value: "Node HTTP server" },
  { category: "STACK", id: "det.stack.typescript", cap: "development.web_apps", path: /(^|\/)tsconfig\.json$/, kind: "CONFIGURATION", value: "TypeScript" },
  { category: "STACK", id: "det.stack.python", cap: "development.apis", path: /(^|\/)(pyproject\.toml|requirements[^/]*\.txt)$/, kind: "DEPENDENCY_MANIFEST", value: "Python" },
  { category: "STACK", id: "det.stack.django", cap: "development.web_apps", path: /(^|\/)manage\.py$/, kind: "SOURCE_CODE", value: "Django" },
  { category: "STACK", id: "det.stack.mobile", cap: "development.mobile_apps", dep: /^(react-native|expo)$/, value: "React Native/Expo" },
  // Root/extension-dir manifest.json only: nested manifests (e.g. .project-os-audit/manifest.json) were a false positive in the self-audit.
  { category: "STACK", id: "det.stack.extension", cap: "development.browser_extensions", path: /^((extension|src|public)\/)?manifest\.json$/, kind: "CONFIGURATION", value: "Possible extension manifest" },
  { category: "STACK", id: "det.stack.extension_tooling", cap: "development.browser_extensions", dep: /^(webextension-polyfill|@crxjs\/vite-plugin|wxt|plasmo)$/, value: "Extension tooling" },
  { category: "TESTS", id: "det.tests.vitest", cap: "quality.unit_testing", dep: /^vitest$/, value: "Vitest" },
  { category: "TESTS", id: "det.tests.jest", cap: "quality.unit_testing", dep: /^jest$/, value: "Jest" },
  { category: "TESTS", id: "det.tests.playwright", cap: "quality.e2e_testing", dep: /^@playwright\/test$/, value: "Playwright" },
  { category: "TESTS", id: "det.tests.cypress", cap: "quality.e2e_testing", dep: /^cypress$/, value: "Cypress" },
  { category: "TESTS", id: "det.tests.files", cap: "quality.unit_testing", path: /(^|\/)(test_[^/]+\.py|[^/]+\.(test|spec)\.[cm]?[jt]sx?)$/, kind: "SOURCE_CODE", value: "Test files" },
  { category: "AUTH", id: "det.auth.nextauth", cap: "backend.auth", dep: /^(next-auth|@auth\/core)$/, value: "Auth.js" },
  { category: "AUTH", id: "det.auth.clerk", cap: "backend.auth", dep: /^@clerk\//, value: "Clerk" },
  { category: "AUTH", id: "det.auth.supabase", cap: "backend.auth", dep: /^@supabase\/(supabase-js|ssr|auth-helpers)/, value: "Supabase" },
  { category: "AUTH", id: "det.auth.other", cap: "backend.auth", dep: /^(auth0|@auth0\/|firebase|lucia|passport|jsonwebtoken|jose|bcrypt|bcryptjs)$/, value: "Auth library" },
  { category: "DATABASE", id: "det.db.prisma", cap: "backend.database", path: /(^|\/)schema\.prisma$/, kind: "CONFIGURATION", value: "Prisma" },
  { category: "DATABASE", id: "det.db.orm", cap: "backend.database", dep: /^(drizzle-orm|pg|postgres|mysql2|mongoose|mongodb|sequelize|typeorm|knex|@prisma\/client|better-sqlite3)$/, value: "Database client" },
  { category: "DATABASE", id: "det.db.migrations", cap: "backend.migrations", path: /(^|\/)(migrations|supabase\/migrations|drizzle|alembic)\/[^/]+\.(sql|ts|js|py)$/, kind: "SOURCE_CODE", value: "Migrations" },
  { category: "PAYMENTS", id: "det.payments.provider", cap: "marketing.monetization", dep: /^(stripe|@stripe\/|@paddle\/|@lemonsqueezy\/|react-native-purchases)/, value: "Payment provider SDK" },
  { category: "DEPLOYMENT", id: "det.deploy.config", cap: "infra.deployment", path: /(^|\/)(vercel\.json|\.vercel\/project\.json|netlify\.toml|fly\.toml|render\.yaml|railway\.json|Dockerfile|serverless\.ya?ml|app\.yaml|[^/]+\.tf)$/, kind: "CONFIGURATION", value: "Deployment config" },
  { category: "DEPLOYMENT", id: "det.ci.workflows", cap: "infra.ci_cd", path: /^\.github\/workflows\/[^/]+\.ya?ml$/, kind: "CONFIGURATION", value: "GitHub Actions" },
  { category: "AI_PROVIDERS", id: "det.ai.sdk", cap: "ai.model_routing", dep: /^(openai|@anthropic-ai\/sdk|@google\/genai|@google\/generative-ai|ai|@ai-sdk\/|langchain|@langchain\/|llamaindex|ollama|groq-sdk|@mistralai\/)/, value: "AI provider SDK" },
  { category: "AI_PROVIDERS", id: "det.ai.mcp", cap: "ai.mcp_connectors", dep: /^@modelcontextprotocol\/sdk$/, value: "MCP" },
  { category: "ANALYTICS", id: "det.analytics.product", cap: "analytics.product_analytics", dep: /^(posthog-js|posthog-node|mixpanel|mixpanel-browser|@segment\/|@amplitude\/|react-ga4|@vercel\/analytics|plausible-tracker)/, value: "Analytics SDK" },
  { category: "ANALYTICS", id: "det.observability.errors", cap: "infra.observability", dep: /^(@sentry\/|dd-trace|@datadog\/|logrocket|@logtail\/|pino|winston)/, value: "Observability SDK" },
  { category: "INTEGRATIONS", id: "det.integrations.email", cap: "backend.email", dep: /^(resend|@sendgrid\/mail|postmark|nodemailer|@react-email\/)/, value: "Email" },
  { category: "INTEGRATIONS", id: "det.integrations.jobs", cap: "backend.queues", dep: /^(bullmq|bull|node-cron|agenda|@upstash\/qstash|inngest|@trigger\.dev\/)/, value: "Jobs/queues" },
  { category: "INTEGRATIONS", id: "det.integrations.messaging", cap: "automation.webhook_automation", dep: /^(twilio|@slack\/|discord\.js)/, value: "Messaging" },
  { category: "DEPENDENCIES", id: "det.deps.lockfile", cap: "security.dependency_security", path: /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?|poetry\.lock|uv\.lock|Cargo\.lock|go\.sum|Gemfile\.lock)$/, kind: "DEPENDENCY_MANIFEST", value: "Lockfile" },
  { category: "DEPENDENCIES", id: "det.deps.update_bot", cap: "security.vulnerability_management", path: /^(\.github\/dependabot\.ya?ml|renovate\.json5?|\.renovaterc(\.json)?)$/, kind: "CONFIGURATION", value: "Dependency update automation" },
  { category: "DOCS", id: "det.docs.readme", cap: "docs.readme", path: /^README(\.[a-z]+)?$/i, kind: "DOCUMENTATION", value: "README" },
  { category: "DOCS", id: "det.docs.project_os", cap: "recovery.os_recovery", path: /^(AGENTS\.md|CLAUDE\.md|\.cursorrules|\.project-os(-audit)?\/manifest\.json|state\/CURRENT_STATE\.md)$/, kind: "DOCUMENTATION", value: "Project OS / agent authority" },
  { category: "DOCS", id: "det.docs.architecture", cap: "docs.architecture_docs", path: /^(ARCHITECTURE\.md|DECISIONS\.md|docs\/(adr|architecture)[^/]*)/i, kind: "DOCUMENTATION", value: "Architecture/decisions" },
  { category: "DOCS", id: "det.docs.runbooks", cap: "docs.runbooks", path: /(^|\/)(runbooks?|RUNBOOK[^/]*\.md)/i, kind: "DOCUMENTATION", value: "Runbooks" },
];

const LANG: Record<string, string> = { ts: "TypeScript", tsx: "TypeScript", js: "JavaScript", jsx: "JavaScript", mjs: "JavaScript", cjs: "JavaScript", py: "Python", go: "Go", rs: "Rust", rb: "Ruby", php: "PHP", java: "Java", kt: "Kotlin", swift: "Swift", dart: "Dart", cs: "C#", md: "Markdown", json: "JSON", sql: "SQL", css: "CSS", html: "HTML", yml: "YAML", yaml: "YAML" };
const MANIFEST = /(^|\/)(package\.json|pyproject\.toml|requirements[^/]*\.txt|go\.mod|Cargo\.toml|Gemfile|composer\.json|pubspec\.yaml|[^/]+\.csproj|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|poetry\.lock|uv\.lock)$/;

export type DiscoverCtx = { runId: string; snapshotId: string; runSeq: string; at: string };

export function discover(entries: FileEntry[], read: (hash: string) => Buffer, ctx: DiscoverCtx) {
  const evidence: Json[] = [];
  const signals: Json[] = [];
  const seen = new Map<string, string>();
  const addEvidence = (rule: Rule, entry: FileEntry, kind: string, claim: string) => {
    const key = `${rule.id}|${entry.path}`;
    if (seen.has(key)) return seen.get(key)!;
    const id = `EV-${ctx.runSeq}-${String(evidence.length + 1).padStart(4, "0")}`;
    const docs = kind === "DOCUMENTATION";
    evidence.push({
      kind: "EvidenceItem", schemaVersion: "0.1.0", id, runId: ctx.runId, snapshotId: ctx.snapshotId, claim,
      sourceKind: kind, strength: docs ? "E2" : "E3", state: "OBSERVED", polarity: "SUPPORTS", collectedAt: ctx.at,
      collector: { actorType: "SYSTEM", actorId: rule.id }, scope: { controlIds: [] },
      locator: { type: "REPOSITORY", path: entry.path, contentHash: entry.hash },
    });
    seen.set(key, id);
    return id;
  };
  const signal = (rule: Rule, value: string, evidenceId: string) => {
    if (!signals.some((s) => s.detectorId === rule.id && s.value === value)) signals.push({ category: rule.category, detectorId: rule.id, value, capabilityRef: rule.cap, evidenceId });
  };

  const manifests = entries.filter((e) => MANIFEST.test(e.path)).map((e) => e.path);
  const scripts: Json[] = [];
  let direct = 0, dev = 0;
  for (const pkg of entries.filter((e) => /(^|\/)package\.json$/.test(e.path) && e.size < 1 << 20)) {
    let json: Json;
    try { json = JSON.parse(read(pkg.hash).toString("utf8")); } catch { continue; }
    const deps = Object.keys(json.dependencies ?? {}), devDeps = Object.keys(json.devDependencies ?? {});
    direct += deps.length; dev += devDeps.length;
    for (const [name, command] of Object.entries<Json>(json.scripts ?? {})) {
      scripts.push({ source: pkg.path, name: name.slice(0, 200), command: { text: String(command).slice(0, 20000), trust: "UNTRUSTED_EXTERNAL" } });
    }
    for (const rule of RULES.filter((r) => r.dep)) {
      for (const d of [...deps, ...devDeps].filter((n) => rule.dep!.test(n))) {
        signal(rule, d, addEvidence(rule, pkg, "DEPENDENCY_MANIFEST", `${pkg.path} declares dependency "${d}" (${rule.value}); declared, not proof of use.`));
      }
    }
  }
  for (const rule of RULES.filter((r) => r.path)) {
    const hits = entries.filter((e) => rule.path!.test(e.path));
    if (hits.length) signal(rule, rule.value, addEvidence(rule, hits[0], rule.kind!, `${hits.length} file(s) match ${rule.value}, e.g. ${hits[0].path}.`));
  }
  for (const cap of [...new Set(signals.map((s) => s.capabilityRef))].sort()) {
    const s = signals.find((x) => x.capabilityRef === cap)!;
    signals.push({ category: "CAPABILITY", detectorId: "det.capability.rollup", value: cap, capabilityRef: cap, evidenceId: s.evidenceId });
  }

  const langCounts = new Map<string, number>();
  for (const e of entries) { const l = LANG[e.path.split(".").pop()!.toLowerCase()]; if (l) langCounts.set(l, (langCounts.get(l) ?? 0) + 1); }
  const has = (cat: string) => signals.filter((s) => s.category === cat);
  const known = (sigs: Json[]) => sigs.length ? { status: "KNOWN", value: true, evidence: "OBSERVED", source: "INFERRED", note: "Declared in repository (intent); confirm at audit:G0." } : { status: "UNKNOWN", note: "No repository signal; absence of a signal is not proof." };

  return {
    evidence,
    inventory: {
      languages: [...langCounts].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).map(([name, files]) => ({ name, files })),
      manifests, scripts, dependencyCounts: { direct, dev }, signals,
    },
    profileDraft: {
      auth: known(has("AUTH")), payments: known(has("PAYMENTS")), usesAI: known(has("AI_PROVIDERS")),
      integrations: has("INTEGRATIONS").length ? { status: "KNOWN", value: [...new Set(has("INTEGRATIONS").map((s) => s.value))], evidence: "OBSERVED", source: "INFERRED" } : { status: "UNKNOWN" },
    },
  };
}
