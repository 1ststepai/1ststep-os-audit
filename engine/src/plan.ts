// Recovery prioritization (recovery/RECOVERY_CONTRACT.md §2-3): P0/P1/P2, inheritance, deterministic order.
import type { Contracts } from "./contracts.ts";
import { domainWeight, SEVERITY } from "./scoring.ts";
import type { Json } from "./util.ts";

const P0_HIGH_DOMAINS = new Set(["SECURITY", "AUTH", "PRIVACY_DATA", "DATABASE", "CONTINUITY", "BILLING_CONTINUITY", "MIGRATION_CONTINUITY"]);
const RANK: Record<string, number> = { P0: 0, P1: 1, P2: 2 };
const EFFORT: Record<string, number> = { S: 0, M: 1, L: 2, XL: 3 };

export function prioritize(C: Contracts, types: string[], tasks: Json[], findings: Map<string, Json>) {
  const errors: string[] = [];
  const byId = new Map<string, Json>(tasks.map((t) => [t.id, t]));
  const linked = (t: Json) => t.findingIds.map((id: string) => findings.get(id) ?? (errors.push(`${t.id}: unknown finding ${id}`), null)).filter(Boolean);

  const priority = new Map<string, string>();
  for (const t of tasks) {
    const fs = linked(t);
    for (const d of t.dependencies) if (!byId.has(d)) errors.push(`${t.id}: unknown dependency ${d}`);
    priority.set(t.id,
      fs.some((f: Json) => f.launchBlocker || f.severity === "CRITICAL" || (f.severity === "HIGH" && P0_HIGH_DOMAINS.has(f.domain))) ? "P0"
      : fs.some((f: Json) => f.severity === "HIGH" || (f.severity === "MEDIUM" && domainWeight(C, f.domain, types) >= 4)) ? "P1" : "P2");
  }
  // A prerequisite is at least as urgent as anything depending on it.
  for (let changed = true; changed;) {
    changed = false;
    for (const t of tasks) for (const d of t.dependencies) {
      if (byId.has(d) && RANK[priority.get(t.id)!] < RANK[priority.get(d)!]) { priority.set(d, priority.get(t.id)!); changed = true; }
    }
  }

  const key = (id: string): (number | string)[] => {
    const t = byId.get(id);
    const fs = linked(t);
    return [RANK[priority.get(id)!], fs.some((f: Json) => f.launchBlocker) ? 0 : 1, -Math.max(...fs.map((f: Json) => SEVERITY[f.severity])), EFFORT[t.effort] ?? 4, id];
  };
  const cmp = (a: string, b: string) => {
    const ka = key(a), kb = key(b);
    for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return ka[i] < kb[i] ? -1 : 1;
    return 0;
  };
  const indeg = new Map(tasks.map((t) => [t.id, t.dependencies.filter((d: string) => byId.has(d)).length]));
  const ready = tasks.filter((t) => indeg.get(t.id) === 0).map((t) => t.id);
  const order: string[] = [];
  while (ready.length) {
    ready.sort(cmp);
    const id = ready.shift()!;
    order.push(id);
    for (const t of tasks) if (t.dependencies.includes(id)) {
      indeg.set(t.id, indeg.get(t.id)! - 1);
      if (indeg.get(t.id) === 0) ready.push(t.id);
    }
  }
  if (order.length !== tasks.length) errors.push("dependency cycle in recovery plan");
  const groups = { P0: [] as string[], P1: [] as string[], P2: [] as string[] };
  for (const [id, p] of [...priority].sort()) groups[p as "P0"].push(id);
  return { priority, priorities: groups, executionOrder: order, errors };
}
