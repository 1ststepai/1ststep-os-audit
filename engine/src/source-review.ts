// Offline triage over captured bytes only. Never loads target configuration or executes target code.
import ts from "typescript";
import { posix } from "node:path";
import { ANALYSIS_MAX_BYTES, type FileEntry } from "./capture.ts";
import { type Json, shaJson } from "./util.ts";

export const SOURCE_REVIEW_VERSION = "0.1.0";
const APP_ROUTE = /^(?:src\/)?app\/(?:.*\/)?route\.[cm]?[jt]sx?$/;
const PAGE = /^(?:src\/)?app\/(?:.*\/)?page\.[jt]sx?$|^(?:src\/)?pages\/(?!api\/|_)[^.]+\.[jt]sx?$/;
const TEST = /(?:^|\/)[^/]+\.(?:test|spec)\.[cm]?[jt]sx?$/;
const METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);

/** Recognizes only explicit node --test file/glob lists. Everything else stays UNKNOWN. */
export function testSelection(command: unknown, paths: string[]) {
  const unknown = { status: "UNKNOWN", selected: [] as string[], notSelected: [] as string[] };
  if (typeof command !== "string" || /[&|;`$<>\r\n]/.test(command)) return unknown;
  const tokens = command.match(/"[^"]*"|'[^']*'|[^\s]+/g)?.map((s) => s.replace(/^(["'])(.*)\1$/, "$2")) ?? [];
  if (tokens[0] !== "node" || !tokens.includes("--test")) return unknown;
  const patterns: string[] = [];
  for (const token of tokens.slice(1)) {
    if (["--test", "--experimental-strip-types", "--experimental-transform-types", "--no-warnings"].includes(token)) continue;
    // Reject flags, folders and shell expansions whose selection we cannot establish.
    if (token.startsWith("-") || !/\.[cm]?[jt]sx?$/.test(token) || /[{}!]/.test(token)) return unknown;
    patterns.push(token.replaceAll("\\", "/").replace(/^\.\//, ""));
  }
  if (!patterns.length) return unknown; // Node discovery defaults vary by version/configuration.
  const selected = paths.filter((path) => patterns.some((pattern) => path === pattern || posix.matchesGlob(path, pattern)));
  return { status: "EXPLICIT_FILE_LIST", selected, notSelected: paths.filter((path) => !selected.includes(path)) };
}

export function reviewSources(entries: FileEntry[], read: (hash: string) => Buffer) {
  const routes: Json[] = [], candidates: Json[] = [], skipped: Json[] = [];
  const pages = entries.filter((e) => PAGE.test(e.path)).map((e) => e.path);
  const tests = entries.filter((e) => TEST.test(e.path)).map((e) => e.path);
  const packageFile = entries.find((e) => e.path === "package.json");
  let pkg: Json = {};
  if (packageFile && packageFile.size <= ANALYSIS_MAX_BYTES) {
    try { pkg = JSON.parse(read(packageFile.hash).toString("utf8")) ?? {}; } catch { skipped.push({ path: packageFile.path, reason: "INVALID_JSON" }); }
  }
  for (const entry of entries.filter((e) => APP_ROUTE.test(e.path))) {
    const route: Json = { path: entry.path, contentHash: entry.hash, methods: [], status: "UNVERIFIED" };
    routes.push(route);
    if (entry.size > ANALYSIS_MAX_BYTES) { skipped.push({ path: entry.path, reason: "SIZE_LIMIT" }); continue; }
    let ast: ts.SourceFile;
    try {
      ast = ts.createSourceFile(entry.path, read(entry.hash).toString("utf8").replace(/^\uFEFF/, ""), ts.ScriptTarget.Latest, true);
    } catch { skipped.push({ path: entry.path, reason: "PARSE_FAILED" }); continue; }
    // TypeScript recovers malformed syntax; recovered trees cannot support complete coverage claims.
    if ((ast as ts.SourceFile & { parseDiagnostics?: readonly ts.Diagnostic[] }).parseDiagnostics?.length) {
      skipped.push({ path: entry.path, reason: "SYNTAX_ERRORS" }); continue;
    }
    route.status = "PARSED_SOURCE_ONLY";
    const add = (kind: string, node: ts.Node, reason: string, next: string) => {
      const line = ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1;
      candidates.push({ id: shaJson({ version: SOURCE_REVIEW_VERSION, kind, path: entry.path, hash: entry.hash, line }),
        kind, state: "OBSERVED", conclusion: "NEEDS_REVIEW_NOT_A_FINDING", path: entry.path, contentHash: entry.hash,
        line, reason, next });
    };
    for (const statement of ast.statements) {
      if (ts.isExportDeclaration(statement)) { route.exportResolution = "UNKNOWN_REEXPORT"; continue; }
      if (!ts.canHaveModifiers(statement) || !ts.getModifiers(statement)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) continue;
      if (ts.isFunctionDeclaration(statement) && statement.name && METHODS.has(statement.name.text)) route.methods.push(statement.name.text);
      if (ts.isVariableStatement(statement)) for (const d of statement.declarationList.declarations) {
        if (ts.isIdentifier(d.name) && METHODS.has(d.name.text)) route.methods.push(d.name.text);
      }
    }
    const fromChain = (node: ts.Expression): boolean => {
      let current = node;
      while (ts.isCallExpression(current) && ts.isPropertyAccessExpression(current.expression)) {
        if (current.expression.name.text === "from") return true;
        current = current.expression.expression;
      }
      return false;
    };
    const stack: ts.Node[] = [ast];
    while (stack.length) {
      const node = stack.pop()!;
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && fromChain(node.expression.expression)) {
        const method = node.expression.name.text;
        if (method === "select" && node.arguments[0] && ts.isStringLiteralLike(node.arguments[0]) && node.arguments[0].text.trim() === "*") {
          add("WILDCARD_DATA_SELECTION", node, "A from(...).select('*') chain requests all fields; response exposure and database permissions are UNKNOWN.", "Trace the response DTO and member/admin permissions; check whether internal fields can reach a member.");
        }
        if (["update", "delete", "insert", "upsert"].includes(method)) {
          add("DATA_MUTATION", node, "A route contains a data mutation chain; resource ownership, authentication and database policy effectiveness are UNKNOWN.", "Trace session identity, role checks, row ownership and database permissions for this operation; require a cross-user test.");
        }
      }
      ts.forEachChild(node, (child) => { stack.push(child); });
    }
  }
  candidates.sort((a, b) => a.kind.localeCompare(b.kind) || a.path.localeCompare(b.path) || a.line - b.line);
  const selection = testSelection(pkg.scripts?.test, tests);
  return { version: SOURCE_REVIEW_VERSION, framework: pkg.dependencies?.next || pkg.devDependencies?.next ? "NEXT_DECLARED" : "UNKNOWN",
    pages, routes, candidates, skipped,
    tests: { discovered: tests.length, ...selection, evidence: packageFile ? { path: packageFile.path, contentHash: packageFile.hash } : null,
      meaning: "Selection by root npm test only, not execution, code coverage or CI coverage. Imported tests, lifecycle hooks and other scripts are not resolved." },
    limitations: ["App Router route inventory only; Pages Router APIs, custom servers, aliases and imported query chains are not resolved.",
      "Candidate patterns do not establish a security defect. No type checking, data-flow analysis or target code execution ran.",
      "Rendered accessibility, visual layout, business promises, auth, billing and production remain NOT ASSESSED."] };
}
