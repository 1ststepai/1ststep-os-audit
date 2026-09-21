// Loads and verifies every contract the engine depends on: upstream lock, schemas, registries.
import { Ajv2020 } from "ajv/dist/2020.js";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { type Json, loadJson, sha256 } from "./util.ts";

export const REPO_ROOT = resolve(import.meta.dirname, "../..");

export type Contracts = {
  root: string;
  errors: string[];
  validate: (title: string, obj: Json) => string[];
  scoring: Json;
  ptp: Json;
  domains: string[];
  controls: Map<string, Json>;
  profiles: Map<string, Json>;
  taxonomy: Set<string>;
  versions: { controlRegistry: string; scoringModel: string; projectTypeProfiles: string; upstreamLockHash: string };
};

export function loadContracts(root = REPO_ROOT): Contracts {
  const errors: string[] = [];
  const state = join(root, ".project-os-audit");
  const lockPath = join(state, "upstream-lock.json");
  const lock = loadJson(lockPath);
  const up = resolve(root, lock.localPath);
  const upSchemaDir = join(up, "schemas/0.1.0");
  const upSchemaFiles = readdirSync(upSchemaDir).filter((f) => f.endsWith(".json")).sort().map((f) => join(upSchemaDir, f));
  const taxonomyPath = join(up, ".project-os/capability-taxonomy.json");

  // 1. upstream lock: every upstream file pinned, every pin matches.
  for (const p of [...upSchemaFiles, taxonomyPath]) {
    const rel = p.slice(up.length + 1).replaceAll("\\", "/");
    if (!(rel in lock.files)) errors.push(`lock: upstream file not pinned: ${rel}`);
  }
  for (const [rel, h] of Object.entries<string>(lock.files)) {
    const p = join(up, rel);
    if (!existsSync(p)) errors.push(`lock: pinned upstream file missing: ${rel}`);
    else if (sha256(readFileSync(p)) !== h) errors.push(`lock: upstream drift in ${rel} (review, then re-pin)`);
  }

  // 2. schemas (upstream by $id + audit)
  const ajv = new Ajv2020({ strict: false, allErrors: true, validateFormats: false });
  const titles = new Map<string, string>();
  const auditDir = join(root, "schemas/audit/0.1.0");
  for (const p of [...upSchemaFiles, ...readdirSync(auditDir).filter((f) => f.endsWith(".json")).sort().map((f) => join(auditDir, f))]) {
    const s = loadJson(p);
    if (!s.$id) { errors.push(`schema has no $id: ${p}`); continue; }
    ajv.addSchema(s);
    if (p.startsWith(auditDir)) titles.set(s.title, s.$id);
  }
  const validate = (title: string, obj: Json): string[] => {
    const id = titles.get(title) ?? (title.startsWith("https://") ? title : undefined); // title or absolute $ref (e.g. …#/$defs/auditNote)
    if (!id) return [`no schema titled ${title}`];
    const fn = ajv.getSchema(id)!;
    return fn(obj) ? [] : (fn.errors ?? []).map((e) => `${e.instancePath || "/"} ${e.message}`);
  };
  for (const t of ["AuditTarget", "BaselineSnapshot", "AuditRun", "EvidenceItem", "ControlDefinition", "ControlResult", "Finding",
    "DimensionScore", "ReadinessScore", "RemediationTask", "VerificationRecord", "RecoveryPlan", "ControlRegistry", "ProjectTypeProfiles"]) {
    try { ajv.getSchema(titles.get(t) ?? "") ?? errors.push(`schema missing for ${t}`); } catch (e) { errors.push(`schema ${t} does not compile: ${(e as Error).message}`); }
  }

  // 3. registries + referential integrity
  const common = loadJson(join(auditDir, "audit-common.schema.json"));
  const domains: string[] = loadJson(join(state, "domains.json")).domains;
  if ([...domains].sort().join() !== [...common.$defs.domain.enum].sort().join()) errors.push("domains.json does not match audit-common domain enum");
  const reg = loadJson(join(state, "controls.json"));
  const ptp = loadJson(join(state, "project-types.json"));
  const scoring = loadJson(join(state, "scoring.json"));
  errors.push(...validate("ControlRegistry", reg).map((e) => `controls.json: ${e}`));
  errors.push(...validate("ProjectTypeProfiles", ptp).map((e) => `project-types.json: ${e}`));

  const taxonomy = new Set<string>();
  for (const [d, caps] of Object.entries<string[]>(loadJson(taxonomyPath).domains)) for (const c of caps) taxonomy.add(`${d}.${c.toLowerCase()}`);
  const controls = new Map<string, Json>(reg.controls.map((c: Json) => [c.id, c]));
  if (controls.size !== reg.controls.length) errors.push("controls.json: duplicate control ids");
  const templates = new Set<string>();
  for (const c of reg.controls) {
    if (!c.id.startsWith(`CTL-${c.domain}-`)) errors.push(`${c.id}: id prefix does not match domain`);
    for (const ref of c.capabilityRefs) if (!taxonomy.has(ref)) errors.push(`${c.id}: capabilityRef ${ref} not in upstream taxonomy`);
    for (const t of c.findingTemplates) {
      if (!t.templateId.startsWith(`FT-${c.id.slice(4)}-`) || templates.has(t.templateId)) errors.push(`${c.id}: bad/duplicate template ${t.templateId}`);
      templates.add(t.templateId);
    }
  }
  for (const d of domains) {
    if (!reg.controls.some((c: Json) => c.domain === d)) errors.push(`domain ${d} has no controls`);
    if (!existsSync(join(root, `audits/domains/${d}.md`))) errors.push(`domain ${d} has no contract file`);
  }
  const profiles = new Map<string, Json>(ptp.profiles.map((p: Json) => [p.id, p]));
  if ([...profiles.keys()].sort().join() !== [...common.$defs.projectTypeId.enum].sort().join()) errors.push("project-types.json must define the 11 project types");
  for (const p of ptp.profiles) for (const cid of [...Object.keys(p.controlMultipliers), ...p.excludeControls]) if (!controls.has(cid)) errors.push(`profile ${p.id}: unknown control ${cid}`);

  return {
    root, errors, validate, scoring, ptp, domains, controls, profiles, taxonomy,
    versions: { controlRegistry: reg.registryVersion, scoringModel: scoring.scoringModelVersion, projectTypeProfiles: ptp.profilesVersion, upstreamLockHash: sha256(readFileSync(lockPath)) },
  };
}
