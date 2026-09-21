import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

export type Json = any;

export const loadJson = (p: string): Json => JSON.parse(readFileSync(p, "utf8"));

/** Canonical JSON: sorted keys, no whitespace. Matches Python json.dumps(sort_keys=True, separators=(",",":"), ensure_ascii=False). */
export function canonical(v: Json): string {
  if (Array.isArray(v)) return "[" + v.map(canonical).join(",") + "]";
  if (v && typeof v === "object") {
    return "{" + Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + canonical(v[k])).join(",") + "}";
  }
  return JSON.stringify(v);
}

export const sha256 = (data: string | Buffer): string => "sha256:" + createHash("sha256").update(data).digest("hex");
export const shaJson = (v: Json): string => sha256(canonical(v));

/** Round half-up to `dp` decimals using decimal string math (avoids binary float drift). */
export function roundHalfUp(x: number, dp: number): number {
  const s = x.toFixed(dp + 6);
  const f = 10 ** dp;
  return Math.round(Number(s) * f + 1e-9) / f;
}

export const nowIso = (): string => new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
