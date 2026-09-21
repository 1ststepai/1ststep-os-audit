// Read-only baseline capture (BASELINE_POLICY.md, SECURITY_BOUNDARIES.md B1/B6/B7). Never writes into the target.
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve, sep } from "node:path";
import { putObject } from "./store.ts";
import { type Json, canonical, sha256 } from "./util.ts";

export const ANALYSIS_MAX_BYTES = 2 * 1024 * 1024;
const SECRET = /(^|\/)(\.env(\.(?!example$|sample$|template$)[^/]*)?|[^/]*\.(pem|key|p12|pfx|jks|keystore)|id_(rsa|dsa|ecdsa|ed25519)|credentials(\.json)?|secrets?\.(json|ya?ml|toml))$/i;
const WALK_SKIP = new Set([".git", "node_modules"]);

const git = (cwd: string, args: string[]): Buffer =>
  execFileSync("git", args, { cwd, env: { ...process.env, GIT_OPTIONAL_LOCKS: "0", GIT_TERMINAL_PROMPT: "0" }, maxBuffer: 1 << 30, stdio: ["ignore", "pipe", "ignore"] });
const gitText = (cwd: string, args: string[]): string | null => { try { return git(cwd, args).toString("utf8").trim(); } catch { return null; } };

export type FileEntry = { path: string; hash: string; size: number };

function listFiles(root: string, isGit: boolean): { paths: string[]; ignoredCount: number } {
  if (isGit) {
    const paths = git(root, ["-c", "core.quotepath=off", "ls-files", "-z", "-c", "-o", "--exclude-standard"]).toString("utf8").split("\0").filter(Boolean);
    const ignored = gitText(root, ["ls-files", "-z", "-o", "-i", "--exclude-standard", "--directory"]) ?? "";
    return { paths: [...new Set(paths)], ignoredCount: ignored.split("\0").filter(Boolean).length };
  }
  const paths: string[] = [];
  let ignoredCount = 0;
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (WALK_SKIP.has(name)) { ignoredCount++; continue; }
      const abs = join(dir, name);
      const st = lstatSync(abs);
      if (st.isDirectory()) walk(abs);
      else paths.push(relative(root, abs).split(sep).join("/"));
    }
  };
  walk(root);
  return { paths, ignoredCount };
}

/** sha256-sorted-path-v1 manifest. Secret candidates are listed by path only and never hashed or stored. */
export function buildManifest(root: string, paths: string[]) {
  const entries: FileEntry[] = [];
  const secretCandidatePaths: string[] = [];
  let symlinkOutsideRootCount = 0, oversizeCount = 0, totalBytes = 0;
  const realRoot = realpathSync(root);
  for (const p of paths) {
    const abs = join(root, p);
    if (!existsSync(abs)) continue; // tracked but deleted
    if (SECRET.test(p)) { secretCandidatePaths.push(p); continue; }
    const st = lstatSync(abs);
    if (st.isSymbolicLink()) {
      const target = realpathSync(abs);
      if (target !== realRoot && !target.startsWith(realRoot + sep)) { symlinkOutsideRootCount++; continue; }
    }
    if (!lstatSync(realpathSync(abs)).isFile()) continue;
    const data = readFileSync(abs);
    if (data.length > ANALYSIS_MAX_BYTES) oversizeCount++;
    totalBytes += data.length;
    entries.push({ path: p, hash: sha256(data), size: data.length });
  }
  entries.sort((a, b) => Buffer.compare(Buffer.from(a.path), Buffer.from(b.path)));
  const text = entries.map((e) => `${e.path}\0${e.hash.slice(7)}\n`).join("");
  return { entries, text, manifestHash: sha256(text), totalBytes, secretCandidatePaths: secretCandidatePaths.sort(), symlinkOutsideRootCount, oversizeCount };
}

const normalizeRemote = (url: string | null): string | undefined => {
  if (!url) return undefined;
  const clean = url.replace(/^(https?:\/\/)[^@/]+@/, "$1").replace(/\/+$/, "");
  return /^(https:\/\/|ssh:\/\/|git@)/.test(clean) ? clean : undefined;
};

function gitFingerprint(root: string) {
  const head = gitText(root, ["rev-parse", "--verify", "-q", "HEAD"]);
  if (!head) return null; // unborn or not a repo
  const status = git(root, ["status", "--porcelain=v2", "-z", "--untracked-files=all"]);
  const tokens = status.toString("utf8").split("\0");
  let modified = 0, untracked = 0, deleted = 0;
  const dirtyPaths: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.startsWith("? ")) { untracked++; dirtyPaths.push(t.slice(2)); }
    else if (t.startsWith("1 ") || t.startsWith("2 ") || t.startsWith("u ")) {
      const parts = t.split(" ");
      const path = parts.slice(t.startsWith("1 ") ? 8 : t.startsWith("2 ") ? 9 : 10).join(" ");
      if (parts[1].includes("D")) deleted++; else { modified++; dirtyPaths.push(path); }
      if (t.startsWith("2 ")) i++; // skip original path of rename/copy
    }
  }
  const submodules = (gitText(root, ["ls-files", "-s"]) ?? "").split("\n").filter((l) => l.startsWith("160000 ")).map((l) => ({ path: l.split("\t")[1], sha: l.split(" ")[1] }));
  return {
    git: {
      headSha: head,
      branch: gitText(root, ["symbolic-ref", "--short", "-q", "HEAD"]) || "(detached)",
      rootCommits: (gitText(root, ["rev-list", "--max-parents=0", "HEAD"]) ?? "").split("\n").filter(Boolean),
      ...(normalizeRemote(gitText(root, ["remote", "get-url", "origin"])) ? { normalizedRemote: normalizeRemote(gitText(root, ["remote", "get-url", "origin"])) } : {}),
      isShallow: gitText(root, ["rev-parse", "--is-shallow-repository"]) === "true",
      submodules,
      worktreeCount: Math.max(1, (gitText(root, ["worktree", "list", "--porcelain"]) ?? "").split("\n").filter((l) => l.startsWith("worktree ")).length),
      statusHash: sha256(status),
      stashCount: Number(gitText(root, ["rev-list", "--walk-reflogs", "--count", "refs/stash"]) ?? 0) || 0,
    },
    dirty: { isDirty: modified + untracked + deleted > 0, modifiedCount: modified, untrackedCount: untracked, deletedCount: deleted },
    dirtyPaths,
  };
}

export type CaptureResult = { fingerprint: Json; storage: Json; entries: FileEntry[]; notes: string[]; invalidated: boolean };

export function capture(targetPath: string, home: string, options: { omitGitHistory?: boolean } = {}): CaptureResult {
  const root = resolve(targetPath);
  if (resolve(home).startsWith(root + sep) || resolve(home) === root) throw new Error("audit home must be outside the target (B1)");
  const notes: string[] = [];
  const isGitRepo = gitText(root, ["rev-parse", "--show-toplevel"]) !== null && existsSync(join(root, ".git"));
  const gfp = isGitRepo ? gitFingerprint(root) : null;
  if (isGitRepo && !gfp) notes.push("Git repository has no commits: captured as vcs NONE (WEAK identity).");
  const { paths, ignoredCount } = listFiles(root, isGitRepo);

  const pre = buildManifest(root, paths);
  let stableContent = true;
  for (const e of pre.entries) {
    const data = readFileSync(join(root, e.path));
    if (sha256(data) !== e.hash) { stableContent = false; continue; }
    putObject(home, data);
  }
  const post = buildManifest(root, listFiles(root, isGitRepo).paths);
  const stable = stableContent && pre.manifestHash === post.manifestHash;
  if (!stable) notes.push("Target changed during capture: snapshot INVALIDATED. Re-capture when no process is writing.");

  const tree = (entries: FileEntry[]) => putObject(home, canonical({ kind: "FileTree", algorithm: "sha256-sorted-path-v1", entries: entries.map((e) => [e.path, e.hash, e.size]) }));
  const storage: Json = { manifestObject: putObject(home, pre.text) };
  if (gfp && !options.omitGitHistory) {
    const dir = mkdtempSync(join(tmpdir(), "osaudit-bundle-"));
    try {
      const bundle = join(dir, "repo.bundle");
      git(root, ["bundle", "create", bundle, "--all"]);
      storage.gitBundleObject = putObject(home, readFileSync(bundle));
    } finally { rmSync(dir, { recursive: true, force: true }); }
    const dirty = new Set(gfp.dirtyPaths);
    storage.overlayArchiveObject = tree(pre.entries.filter((e) => dirty.has(e.path)));
  } else {
    storage.fullArchiveObject = tree(pre.entries);
    if (gfp) storage.overlayArchiveObject = tree(pre.entries.filter((e) => new Set(gfp.dirtyPaths).has(e.path)));
  }

  const fingerprint: Json = {
    vcs: gfp ? "GIT" : "NONE",
    ...(gfp ? { git: gfp.git } : {}),
    dirty: gfp ? gfp.dirty : { isDirty: false, modifiedCount: 0, untrackedCount: 0, deletedCount: 0 },
    contentManifest: {
      algorithm: "sha256-sorted-path-v1", fileCount: pre.entries.length, totalBytes: pre.totalBytes, manifestHash: pre.manifestHash,
      excluded: { gitIgnoredCount: ignoredCount, secretCandidatePaths: pre.secretCandidatePaths, oversizeCount: pre.oversizeCount, symlinkOutsideRootCount: pre.symlinkOutsideRootCount },
    },
    captureIntegrity: { preCaptureManifestHash: pre.manifestHash, postCaptureManifestHash: post.manifestHash, stable },
  };
  return { fingerprint, storage, entries: pre.entries, notes, invalidated: !stable };
}
