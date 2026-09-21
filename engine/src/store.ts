// Write-once content-addressed object store + hash-chained ledger (BASELINE_POLICY.md §3, §5).
import { appendFileSync, chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { type Json, canonical, nowIso, sha256 } from "./util.ts";

export const objectPath = (home: string, hash: string): string => {
  const hex = hash.replace(/^sha256:/, "");
  return join(home, "store/objects/sha256", hex.slice(0, 2), hex.slice(2, 4), hex.slice(4));
};

/** Stores bytes under their hash. Existing objects are never rewritten (write-once). */
export function putObject(home: string, data: Buffer | string): string {
  const hash = sha256(data);
  const p = objectPath(home, hash);
  if (!existsSync(p)) {
    mkdirSync(dirname(p), { recursive: true });
    const tmp = `${p}.tmp-${process.pid}`;
    writeFileSync(tmp, data);
    renameSync(tmp, p);
    chmodSync(p, 0o444);
  }
  return hash;
}

export function getObject(home: string, hash: string): Buffer {
  const data = readFileSync(objectPath(home, hash));
  if (sha256(data) !== hash) throw new Error(`store corruption: ${hash}`);
  return data;
}

/** Writes a JSON record exactly once; refuses to overwrite (immutable artifacts). */
export function writeOnceJson(path: string, obj: Json): string {
  if (existsSync(path)) throw new Error(`refusing to overwrite immutable record ${path}`);
  mkdirSync(dirname(path), { recursive: true });
  const text = JSON.stringify(obj, null, 2) + "\n";
  writeFileSync(path, text);
  chmodSync(path, 0o444);
  return sha256(canonical(obj));
}

const ledgerPath = (home: string) => join(home, "ledger.jsonl");

export function readLedger(home: string): Json[] {
  return existsSync(ledgerPath(home)) ? readFileSync(ledgerPath(home), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
}

export function appendLedger(home: string, e: { objectKind: string; objectId: string; objectHash: string; at?: string }): string {
  const entries = readLedger(home);
  const prev = entries.at(-1);
  const body = { seq: entries.length + 1, at: e.at ?? nowIso(), objectKind: e.objectKind, objectId: e.objectId, objectHash: e.objectHash, prevHash: prev ? prev.entryHash : null };
  const entry = { ...body, entryHash: sha256(canonical(body)) };
  mkdirSync(home, { recursive: true });
  appendFileSync(ledgerPath(home), JSON.stringify(entry) + "\n");
  return entry.entryHash;
}

/** Returns chain violations; empty = intact. */
export function verifyLedger(home: string): string[] {
  const errs: string[] = [];
  let prev: string | null = null;
  readLedger(home).forEach((e, i) => {
    const { entryHash, ...body } = e;
    if (e.seq !== i + 1) errs.push(`ledger seq ${e.seq} out of order`);
    if (e.prevHash !== prev) errs.push(`ledger entry ${e.seq}: broken chain`);
    if (sha256(canonical(body)) !== entryHash) errs.push(`ledger entry ${e.seq}: hash mismatch (tampered)`);
    prev = entryHash;
  });
  return errs;
}
