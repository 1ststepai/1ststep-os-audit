import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { reviewSources, testSelection } from "../src/source-review.ts";
import { runFreeAudit } from "../src/free-engine.ts";
import { summarizeFreeAudit } from "../src/free-summary.ts";
import { ANALYSIS_MAX_BYTES } from "../src/capture.ts";
import { sha256 } from "../src/util.ts";

const inspect = (files: Record<string, string>) => {
  const objects = new Map<string, Buffer>();
  const entries = Object.entries(files).map(([path, text]) => {
    const bytes = Buffer.from(text), hash = sha256(bytes); objects.set(hash, bytes);
    return { path, hash, size: bytes.length };
  });
  return reviewSources(entries, (hash) => objects.get(hash)!);
};
const temp = () => mkdtempSync(join(tmpdir(), "audit-review-"));
const root = resolve(import.meta.dirname, "../..");

test("AST review distinguishes actual query chains from comments, strings and unrelated select calls", () => {
  const review = inspect({
    "package.json": JSON.stringify({ dependencies: { next: "16" } }),
    "app/page.tsx": "export default function Page() { return <div/> }",
    "app/api/member/route.ts": [
      "// db.from('member').select('*')",
      "const doc = `db.from('member').delete()`;",
      "export async function GET() { return db.from('member').select('*'); }",
      "export const PATCH = () => db.from('member').update({ok: true}).eq('id', id);",
      "export function POST() { return unrelated.select('*'); }",
    ].join("\n"),
  });
  assert.equal(review.framework, "NEXT_DECLARED");
  assert.equal(review.pages.length, 1);
  assert.deepEqual(review.routes[0].methods, ["GET", "PATCH", "POST"]);
  assert.equal(review.candidates.length, 2);
  assert.equal(review.candidates.find((c) => c.kind === "WILDCARD_DATA_SELECTION")?.line, 3);
  assert.equal(review.candidates.find((c) => c.kind === "DATA_MUTATION")?.line, 4);
  assert.ok(review.candidates.every((c) => c.contentHash.startsWith("sha256:") && c.conclusion === "NEEDS_REVIEW_NOT_A_FINDING"));
});

test("syntax failures, oversized files and reexports remain explicit coverage gaps", () => {
  const review = inspect({
    "package.json": "broken",
    "src/app/api/broken/route.ts": "export function GET( {",
    "app/api/large/route.ts": " ".repeat(ANALYSIS_MAX_BYTES + 1),
    "app/api/proxy/route.ts": "export { GET } from './handler';",
    "pages/api/legacy.ts": "db.from('member').delete()",
  });
  assert.equal(review.routes.length, 3);
  assert.deepEqual(review.skipped.map((s) => s.reason), ["INVALID_JSON", "SYNTAX_ERRORS", "SIZE_LIMIT"]);
  assert.equal(review.routes.find((r) => r.path.includes("proxy"))?.exportResolution, "UNKNOWN_REEXPORT");
  assert.equal(review.candidates.length, 0);
});

test("explicit test lists and globs support omitted-test triage without treating wrappers or discovery as absent", () => {
  const paths = ["lib/a.test.ts", "lib/b.spec.ts", "app/api/[id]/route.test.ts"];
  assert.deepEqual(testSelection("node --experimental-strip-types --test lib/a.test.ts", paths).notSelected, paths.slice(1));
  assert.deepEqual(testSelection('node --test "lib/*.ts"', paths).selected, paths.slice(0, 2));
  assert.deepEqual(testSelection('node --test "app/api/[id]/route.test.ts"', paths).selected, [paths[2]]);
  for (const command of ["node --test", "npm run test:unit", "vitest", "node --test a.test.ts && npm run extra", "node --import loader --test lib/a.test.ts", "node --test $FILES"]) {
    assert.equal(testSelection(command, paths).status, "UNKNOWN", command);
    assert.deepEqual(testSelection(command, paths).notSelected, []);
  }
});

test("template suffixes stop filename false positives without storing their values or exempting real env files", () => {
  const path = temp(), home = temp();
  for (const file of [".env.local.example", ".env.production", ".env.example.backup"]) writeFileSync(join(path, file), "SYNTHETIC_SECRET_DO_NOT_STORE=sentinel");
  mkdirSync(join(path, "docs/production-readiness"), { recursive: true });
  writeFileSync(join(path, "docs/production-readiness/GO_LIVE.md"), "Release intent, not proof");
  execFileSync("git", ["init", "-q"], { cwd: path });
  execFileSync("git", ["add", "."], { cwd: path });
  execFileSync("git", ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.com", "commit", "-qm", "fixture"], { cwd: path });
  const result = runFreeAudit({ path, home, targetId: "TGT-TEMPLATE" });
  assert.ok(!result.findings.some((f) => f.affectedSurfaces.some((s: any) => s.ref === ".env.local.example")));
  assert.equal(result.findings.length, 2);
  assert.ok(result.rules.find((r) => r.ruleId === "free.tracked-env")?.reason.startsWith("Tracked sensitive"));
  assert.equal(result.rules.find((r) => r.ruleId === "free.release-doc")?.status, "OBSERVED");
  assert.ok(result.baseline.fingerprint.contentManifest.excluded.secretCandidatePaths.includes(".env.local.example"));
  assert.ok(!JSON.stringify(result).includes("sentinel"));
});

test("compact summaries retain identity, unknowns and overflow counts without dumping source", () => {
  const path = temp(), home = temp();
  mkdirSync(join(path, "app/api/member"), { recursive: true });
  writeFileSync(join(path, "app/api/member/route.ts"), "export function GET() { return db.from('SENTINEL_TABLE').select('*'); }");
  const result = runFreeAudit({ path, home, targetId: "TGT-SUMMARY" });
  for (let i = 0; i < 12; i++) result.sourceReview.candidates.push({ ...result.sourceReview.candidates[0], id: `synthetic-${i}` });
  const summary = summarizeFreeAudit(result, "full.json", 2);
  assert.equal(summary.reviewQueue.total, 13);
  assert.equal(summary.reviewQueue.omitted, 11);
  assert.equal(summary.reviewQueue.items.length, 2);
  assert.equal(summary.status, "PARTIAL / NOT ASSESSED");
  assert.ok(summary.baseline.contentManifest);
  assert.ok(!JSON.stringify(summary).includes("SENTINEL_TABLE"));
  assert.throws(() => summarizeFreeAudit(result, "full.json", 0));
  result.sourceReview.candidates.unshift({ ...result.sourceReview.candidates[0], kind: "DATA_MUTATION" });
  assert.equal(new Set(summarizeFreeAudit(result, "full.json", 2).reviewQueue.items.map((c) => c.kind)).size, 2);
});

test("CLI protects immutable outputs and refuses an output directory junction into the target", () => {
  const path = temp(), home = temp(), output = temp();
  writeFileSync(join(path, "README.md"), "fixture");
  const args = ["engine/src/free-cli.ts", path, "--target", "TGT-CLI", "--home", home, "--out", join(output, "full.json"), "--summary", join(output, "summary.json")];
  const result = spawnSync(process.execPath, args, { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const full = readFileSync(join(output, "full.json"));
  const repeated = spawnSync(process.execPath, args, { cwd: root, encoding: "utf8" });
  assert.notEqual(repeated.status, 0);
  assert.deepEqual(readFileSync(join(output, "full.json")), full);
  const link = join(output, "alias");
  symlinkSync(path, link, process.platform === "win32" ? "junction" : "dir");
  const invalid = spawnSync(process.execPath, [...args.slice(0, 7), join(link, "forbidden.json")], { cwd: root, encoding: "utf8" });
  assert.notEqual(invalid.status, 0);
  assert.match(invalid.stderr, /outside target/);
});
