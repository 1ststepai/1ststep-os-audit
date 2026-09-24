// CI release gate for the reachable free-audit module graph; fail closed on new imports/egress.
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import ts from "typescript";
import { REPO_ROOT } from "./contracts.ts";
import { type Json, loadJson } from "./util.ts";

export function scanFreeSource(source: string, policy: Json): string[] {
  const errors: string[] = [];
  if (/\b(?:fetch|XMLHttpRequest|WebSocket|EventSource)\s*\(|\b(?:http|https)\.request\s*\(|\b(?:net|tls)\.connect\s*\(/.test(source)) errors.push("network call in free execution graph");
  if (/\b(?:import|require)\s*\(/.test(source)) errors.push("dynamic import/require in free execution graph");
  if (/https?:\/\/(?:api\.openai\.com|api\.anthropic\.com|generativelanguage\.googleapis\.com|api\.cohere\.ai|api\.tavily\.com|api\.exa\.ai)/i.test(source)) errors.push("metered endpoint in free execution graph");
  if (/\b(?:execFileSync|spawnSync|execSync)\s*\(\s*["'`](?!git["'`])/.test(source)) errors.push("unreviewed subprocess in free execution graph");
  for (const key of policy.forbiddenEnvKeys) if (new RegExp(`\\b${key}\\b`).test(source)) errors.push(`metered provider config ${key} in free execution graph`);
  return errors;
}

export function freeCostGate(root = REPO_ROOT): { gate: string; status: "PASS" | "FAIL"; checkedFiles: string[]; errors: string[] } {
  const policy = loadJson(resolve(root, ".project-os-audit/free-cost-policy.json"));
  const errors: string[] = [];
  if (policy.gate !== "FREE-AUDIT-ZERO-METERED-COST" || policy.networkEgress !== "DENY_ALL" || policy.externalPaidApiCostUsd !== 0 ||
      JSON.stringify(policy.allowedExternalImports) !== JSON.stringify(["ajv/dist/2020.js", "typescript"])) errors.push("free cost policy weakened or malformed");
  const pkg = loadJson(resolve(root, "package.json"));
  const lock = loadJson(resolve(root, "package-lock.json"));
  if (pkg.dependencies?.typescript !== "5.9.3" || lock.packages?.["node_modules/typescript"]?.version !== "5.9.3") errors.push("unreviewed TypeScript parser version");
  for (const name of policy.forbiddenPackages) {
    if (pkg.dependencies?.[name] || pkg.devDependencies?.[name] || lock.packages?.[`node_modules/${name}`]) errors.push(`forbidden metered dependency ${name}`);
  }
  const checkedFiles: string[] = [], seen = new Set<string>();
  const visit = (relative: string) => {
    const path = resolve(root, relative);
    if (!path.startsWith(resolve(root) + "\\") && !path.startsWith(resolve(root) + "/")) { errors.push(`import escapes audit root: ${relative}`); return; }
    if (seen.has(path)) return;
    seen.add(path);
    if (!existsSync(path)) { errors.push(`missing reachable free module ${relative}`); return; }
    const source = readFileSync(path, "utf8");
    checkedFiles.push(relative.replaceAll("\\", "/"));
    errors.push(...scanFreeSource(source, policy).map((e) => `${relative}: ${e}`));
    // Parse imports: regex confuses the string "from" with a clause and misses compact valid syntax.
    const ast = ts.createSourceFile(path, source.replace(/^\uFEFF/, ""), ts.ScriptTarget.Latest, false);
    if ((ast as ts.SourceFile & { parseDiagnostics?: readonly ts.Diagnostic[] }).parseDiagnostics?.length) errors.push(`${relative}: cannot parse free module`);
    const imports = ast.statements.flatMap((statement) =>
      (ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) && statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)
        ? [statement.moduleSpecifier.text] : []);
    for (const spec of imports) {
      if (spec.startsWith(".")) visit(resolve(dirname(path), spec).slice(resolve(root).length + 1));
      else if (spec.startsWith("node:")) {
        if (["node:http", "node:https", "node:net", "node:tls", "node:dns", "node:http2"].includes(spec)) errors.push(`${relative}: network builtin ${spec}`);
        if (spec === "node:child_process" && !["engine/src/capture.ts", "engine/src/free-engine.ts"].includes(relative.replaceAll("\\", "/"))) errors.push(`${relative}: unexpected child process use`);
      } else if (!policy.allowedExternalImports.includes(spec)) errors.push(`${relative}: unreviewed external import ${spec}`);
    }
  };
  visit(policy.entry);
  return { gate: policy.gate, status: errors.length ? "FAIL" : "PASS", checkedFiles: checkedFiles.sort(), errors };
}
