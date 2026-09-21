#!/usr/bin/env python3
"""Foundation conformance check for 1stStep OS Audit (evidence for audit:G1).

Validates: upstream lock, all schemas (2020-12 metaschema), control registry and
project-type profiles (schema + referential integrity against the pinned upstream
capability taxonomy), and the worked example: every object against its schema,
lifecycle legality, verifier independence, and a full deterministic rescoring
(control caps, dimension caps, overall, confidence, inputsHash, priorities, order).

  python tools/validate_foundation.py              # check
  python tools/validate_foundation.py --update-lock  # re-pin upstream after review

ponytail: reference scoring lives here until engine-core exists; port these checks
into engine-core golden tests in the scaffold cycle, then delete this file.
"""
import hashlib
import heapq
import json
import sys
from datetime import datetime, timezone
from decimal import ROUND_HALF_UP, Decimal
from pathlib import Path

from jsonschema import Draft202012Validator
from jsonschema.exceptions import SchemaError
from referencing import Registry, Resource

ROOT = Path(__file__).resolve().parents[1]
STATE = ROOT / ".project-os-audit"
SCHEMA_DIR = ROOT / "schemas/audit/0.1.0"
errors: list[str] = []


def fail(msg):
    errors.append(msg)


def load(p):
    return json.loads(Path(p).read_text(encoding="utf-8"))


def sha_file(p):
    return "sha256:" + hashlib.sha256(Path(p).read_bytes()).hexdigest()


def sha_json(obj):
    return "sha256:" + hashlib.sha256(json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()).hexdigest()


def r1(x):
    return float(Decimal(repr(x)).quantize(Decimal("0.1"), ROUND_HALF_UP))


def r3(x):
    return float(Decimal(repr(x)).quantize(Decimal("0.001"), ROUND_HALF_UP))


# ---------- 1. upstream lock ----------
lock_path = STATE / "upstream-lock.json"
lock = load(lock_path)
UP = (ROOT / lock["localPath"]).resolve()
up_schema_files = sorted((UP / "schemas/0.1.0").glob("*.json"))
up_files = up_schema_files + [UP / ".project-os/capability-taxonomy.json"]
if "--update-lock" in sys.argv:
    lock["files"] = {p.relative_to(UP).as_posix(): sha_file(p) for p in up_files}
    lock["capturedAt"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    lock_path.write_text(json.dumps(lock, indent=2) + "\n", encoding="utf-8")
    print("lock updated:", len(lock["files"]), "files")
for p in up_files:
    rel = p.relative_to(UP).as_posix()
    if rel not in lock["files"]:
        fail(f"lock: upstream file not pinned: {rel}")
for rel, h in lock["files"].items():
    p = UP / rel
    if not p.exists():
        fail(f"lock: pinned upstream file missing: {rel}")
    elif sha_file(p) != h:
        fail(f"lock: upstream drift in {rel} (review change, then --update-lock)")

# ---------- 2. schemas ----------
resources, schemas = [], {}
for p in up_schema_files + sorted(SCHEMA_DIR.glob("*.json")):
    s = load(p)
    if "$id" not in s:
        fail(f"schema has no $id: {p.name}")
        continue
    try:
        Draft202012Validator.check_schema(s)
    except SchemaError as e:
        fail(f"schema invalid {p.name}: {e.message[:200]}")
    resources.append((s["$id"], Resource.from_contents(s)))
    if p.parent == SCHEMA_DIR:
        schemas[s["title"]] = s
registry = Registry().with_resources(resources)
REQUIRED = ["AuditTarget", "BaselineSnapshot", "AuditRun", "EvidenceItem", "ControlDefinition", "ControlResult", "Finding",
            "DimensionScore", "ReadinessScore", "RemediationTask", "VerificationRecord"]
for t in REQUIRED:
    if t not in schemas:
        fail(f"schema missing for {t}")


def validate(obj, title, label):
    v = Draft202012Validator(schemas[title], registry=registry)
    for e in sorted(v.iter_errors(obj), key=lambda e: [str(x) for x in e.absolute_path]):
        fail(f"{label}: /{'/'.join(map(str, e.absolute_path))}: {e.message[:240]}")


# ---------- 3. registries ----------
common = load(SCHEMA_DIR / "audit-common.schema.json")
DOMAINS = load(STATE / "domains.json")["domains"]
if sorted(DOMAINS) != sorted(common["$defs"]["domain"]["enum"]) or len(DOMAINS) != 33:
    fail("domains.json does not match the 33-domain enum in audit-common")
reg = load(STATE / "controls.json")
validate(reg, "ControlRegistry", "controls.json")
PTP = load(STATE / "project-types.json")
validate(PTP, "ProjectTypeProfiles", "project-types.json")
SC = load(STATE / "scoring.json")

taxonomy = {f"{d}.{c.lower()}" for d, cs in load(UP / ".project-os/capability-taxonomy.json")["domains"].items() for c in cs}
CONTROLS = {c["id"]: c for c in reg["controls"]}
if len(CONTROLS) != len(reg["controls"]):
    fail("controls.json: duplicate control ids")
templates = set()
for c in reg["controls"]:
    if not c["id"].startswith(f"CTL-{c['domain']}-"):
        fail(f"{c['id']}: id prefix does not match domain {c['domain']}")
    for ref in c["capabilityRefs"]:
        if ref not in taxonomy:
            fail(f"{c['id']}: capabilityRef {ref} not in pinned upstream taxonomy")
    for t in c["findingTemplates"]:
        if not t["templateId"].startswith(f"FT-{c['id'][4:]}-") or t["templateId"] in templates:
            fail(f"{c['id']}: bad or duplicate templateId {t['templateId']}")
        templates.add(t["templateId"])
    for k in c.get("evidenceKindCaps", {}):
        if k not in SC["sourceKinds"]:
            fail(f"{c['id']}: unknown evidenceKindCaps kind {k}")
for d in DOMAINS:
    if not any(c["domain"] == d for c in reg["controls"]):
        fail(f"domain {d} has no controls")
    if not (ROOT / f"audits/domains/{d}.md").exists():
        fail(f"domain {d} has no contract audits/domains/{d}.md")
PROFILES = {p["id"]: p for p in PTP["profiles"]}
if sorted(PROFILES) != sorted(common["$defs"]["projectTypeId"]["enum"]):
    fail("project-types.json must define exactly the 11 project types")
if set(PTP["domainDefaults"]) != set(DOMAINS):
    fail("project-types.json domainDefaults must cover all 33 domains")
for p in PTP["profiles"]:
    for cid in list(p["controlMultipliers"]) + p["excludeControls"]:
        if cid not in CONTROLS:
            fail(f"profile {p['id']}: unknown control {cid}")

# ---------- 4. engine (reference) ----------
STRENGTH_RANK = {"E0": 0, "E1": 1, "E2": 2, "E3": 3, "E4": 4}
SEV_RANK = {"INFO": 0, "LOW": 1, "MEDIUM": 2, "HIGH": 3, "CRITICAL": 4}


def field_value(profile, path):
    node = profile
    for part in path.split("."):
        node = node.get(part) if isinstance(node, dict) else None
    if not isinstance(node, dict) or node.get("status") != "KNOWN":
        return None
    return node["value"]


def cond(profile, c):
    v = field_value(profile, c["field"])
    if v is None:
        return False
    op, vals = c["operator"], set(c.get("values", []))
    return {"INCLUDES_ANY": lambda: bool(set(v) & vals), "EXCLUDES_ALL": lambda: not (set(v) & vals),
            "IN": lambda: v in vals, "IS_TRUE": lambda: v is True, "IS_FALSE": lambda: v is False}[op]()


def derive_types(profile):
    out = []
    for p in PTP["profiles"]:
        d = p["derivation"]
        if all(cond(profile, c) for c in d.get("all", [])) and (not d.get("any") or any(cond(profile, c) for c in d["any"])):
            out.append(p["id"])
    return out


def applicability(control, types):
    allowed = control["applicability"]["projectTypes"]
    matched = [t for t in types if ("ALL" in allowed or t in allowed) and control["id"] not in PROFILES[t]["excludeControls"]]
    return matched


def domain_weight(domain, types):
    return max(PROFILES[t]["domainWeights"].get(domain, PTP["domainDefaults"][domain]) for t in types)


def control_weight(control, matched):
    return control["riskWeight"] * max(PROFILES[t]["controlMultipliers"].get(control["id"], 1) for t in matched)


def evidence_cap(control, evs):
    if not evs:
        return {"value": 0, "reason": "NO_SUPPORTING_EVIDENCE"}
    best = None
    for e in evs:
        kind_cap = control.get("evidenceKindCaps", {}).get(e["sourceKind"], SC["defaultSourceKindCaps"].get(e["sourceKind"], 100))
        str_cap = SC["evidenceCaps"][e["strength"]]
        v = min(kind_cap, str_cap)
        if best is None or v > best[0]:
            best = (v, "SOURCE_KIND_CAP" if kind_cap < str_cap else "STRENGTH_CAP", e["id"])
    v, reason, eid = best
    live = any(SC["sourceKinds"][e["sourceKind"]]["plane"] == "LIVE" for e in evs)
    if control["requiredPlane"] == "LIVE" and not live and SC["livePlaneCap"] < v:
        return {"value": SC["livePlaneCap"], "reason": "LIVE_PLANE_CAP"}
    if v >= 100:
        return {"value": 100, "reason": "NONE"}
    return {"value": v, "limitingEvidenceId": eid, "reason": reason}


def status_at(finding, t):
    s = None
    for h in finding["history"]:
        if h["at"] <= t:
            s = h["to"]
    return s


def lb_applies(control, status, matched):
    lb = control["launchBlocker"]
    return bool(lb["enabled"] and status in lb["whenStatusIn"] and ("ALL" in lb["projectTypes"] or set(matched) & set(lb["projectTypes"])))


def label_for(score):
    return next(l["label"] for l in SC["labels"] if score >= l["min"])


def expect(label, got, want):
    if got != want:
        fail(f"{label}: artifact has {got!r}, engine computed {want!r}")


# ---------- 5. worked example ----------
fx = load(ROOT / "fixtures/foundation-example.json")["objects"]
by_kind = {}
for o in fx:
    validate(o, o["kind"], f"fixture {o['kind']} {o.get('id', o.get('controlId', o.get('domain', '')))}")
    by_kind.setdefault(o["kind"], []).append(o)
target = by_kind["AuditTarget"][0]
EV = {e["id"]: e for e in by_kind["EvidenceItem"]}
FINDINGS = {f["id"]: f for f in by_kind["Finding"]}
RUNS = {r["id"]: r for r in by_kind["AuditRun"]}
VERS = {v["id"]: v for v in by_kind["VerificationRecord"]}
TASKS = {t["id"]: t for t in by_kind["RemediationTask"]}
score = by_kind["ReadinessScore"][0]
run = RUNS[score["runId"]]
t_score = score["scoredAt"]

types = derive_types(target["profile"])
expect("derived project types", types, target["profile"]["auditProjectTypes"]["value"])
expect("readiness projectTypes", score["projectTypes"], types)


def ref_ev(label, ids):
    for i in ids:
        if i not in EV:
            fail(f"{label}: unknown evidence {i}")
    return [EV[i] for i in ids if i in EV]


results = [r for r in by_kind["ControlResult"] if r["runId"] == run["id"]]
for r in results:
    c = CONTROLS[r["controlId"]]
    lab = f"ControlResult {r['controlId']}"
    matched = applicability(c, types)
    expect(f"{lab} matchedProjectTypes", r["applicability"]["matchedProjectTypes"], matched)
    expect(f"{lab} domain", r["domain"], c["domain"])
    evs = ref_ev(lab, r["evidenceIds"])
    if not matched:
        expect(f"{lab} applicability", r["applicability"]["status"], "NOT_APPLICABLE")
        continue
    if r["status"] == "VERIFIED" and not any(e["strength"] == "E4" for e in evs):
        fail(f"{lab}: VERIFIED requires E4 evidence")
    if r["status"] == "ABSENT" and not any(e["polarity"] in ("ABSENCE", "REFUTES") and STRENGTH_RANK[e["strength"]] >= 3 for e in evs):
        fail(f"{lab}: ABSENT requires E3+ absence/refuting evidence (missing docs are not proof)")
    level = SC["statusLevels"][r["status"]]
    cap = evidence_cap(c, evs)
    expect(f"{lab} weight", r["weight"], control_weight(c, matched))
    expect(f"{lab} level", r["level"], level)
    expect(f"{lab} evidenceCap", r["evidenceCap"], cap)
    expect(f"{lab} finalScore", r["finalScore"], min(level, cap["value"]))
    expect(f"{lab} launchBlocker", r["launchBlocker"], lb_applies(c, r["status"], matched))
    for fid in r["findingIds"]:
        f = FINDINGS.get(fid)
        if not f or f["controlId"] != c["id"]:
            fail(f"{lab}: finding {fid} missing or bound to another control")
        else:
            expect(f"{fid} launchBlocker", f["launchBlocker"], r["launchBlocker"])

active = set(SC["capActiveFindingStatuses"])
dims = {d["domain"]: d for d in by_kind["DimensionScore"] if d["runId"] == run["id"]}
exact = {}
for domain in run["scope"]["domains"]:
    d = dims.get(domain)
    if not d:
        fail(f"DimensionScore missing for {domain}")
        continue
    lab = f"DimensionScore {domain}"
    crs = [r for r in results if r["domain"] == domain and r["applicability"]["status"] != "NOT_APPLICABLE"]
    w = domain_weight(domain, types)
    expect(f"{lab} weight", d["weight"], w)
    raw = sum(r["weight"] * r["finalScore"] for r in crs) / sum(r["weight"] for r in crs)
    fids = sorted({f for r in crs for f in r["findingIds"]})
    caps = []
    for sev in ("CRITICAL", "HIGH"):
        hit = [f for f in fids if FINDINGS[f]["severity"] == sev and status_at(FINDINGS[f], t_score) in active]
        if hit:
            caps.append({"type": f"SEVERITY_{sev}", "limit": SC["severityDimensionCaps"][sev], "findingIds": hit})
    final = min([raw] + [c["limit"] for c in caps])
    lowest = min((c["limit"] for c in caps), default=None)
    for c in caps:
        c["binding"] = c["limit"] == lowest and lowest < raw
    exact[domain] = (w, final)
    expect(f"{lab} rawScore", d["rawScore"], r1(raw))
    expect(f"{lab} score", d["score"], r1(final))
    expect(f"{lab} caps", [{k: c[k] for k in ("type", "limit", "binding", "findingIds")} for c in caps],
           [{k: c[k] for k in ("type", "limit", "binding", "findingIds")} for c in d["caps"]])
    expect(f"{lab} findingIds", d["findingIds"], fids)
    expect(f"{lab} cappedControlIds", d["cappedControlIds"], [r["controlId"] for r in crs if r["finalScore"] < r["level"]])
    expect(f"{lab} unverifiedControlIds", d["unverifiedControlIds"], [r["controlId"] for r in crs if r["status"] in ("UNVERIFIED", "BLOCKED")])

inc = [(w, s) for w, s in exact.values() if w > 0]
uncapped = sum(w * s for w, s in inc) / sum(w for w, _ in inc)
lb_fids = sorted(f["id"] for f in FINDINGS.values() if f["launchBlocker"] and status_at(f, t_score) in active)
overall = min(uncapped, SC["launchBlockerOverallCap"]) if lb_fids else uncapped
expect("ReadinessScore uncappedScore", score["uncappedScore"], r1(uncapped))
expect("ReadinessScore score", score["score"], r1(overall))
expect("ReadinessScore label", score["label"], label_for(r1(overall)))
expect("ReadinessScore launchBlockerFindingIds", score["launchBlockerFindingIds"], lb_fids)
expect("ReadinessScore dimensions", score["dimensions"], [{"domain": k, "weight": w, "score": r1(s)} for k, (w, s) in exact.items()])
appl = [r for r in results if r["applicability"]["status"] != "NOT_APPLICABLE"]
strong = lambda r: any(STRENGTH_RANK[EV[i]["strength"]] >= 3 for i in r["evidenceIds"]) and r["finalScore"] >= r["level"]
ratio = sum(r["weight"] for r in appl if strong(r)) / sum(r["weight"] for r in appl)
lb_ev = all(any(STRENGTH_RANK[EV[i]["strength"]] >= 3 for i in r["evidenceIds"])
            for r in appl if CONTROLS[r["controlId"]]["launchBlocker"]["enabled"]
            and ("ALL" in CONTROLS[r["controlId"]]["launchBlocker"]["projectTypes"] or set(r["applicability"]["matchedProjectTypes"]) & set(CONTROLS[r["controlId"]]["launchBlocker"]["projectTypes"])))
level = "HIGH" if ratio >= SC["confidence"]["HIGH"] and lb_ev else "MEDIUM" if ratio >= SC["confidence"]["MEDIUM"] else "LOW"
expect("ReadinessScore confidence", score["confidence"], {"level": level, "strongEvidenceWeightRatio": r3(ratio),
       "unverifiedControlCount": sum(r["status"] in ("UNVERIFIED", "BLOCKED") for r in appl), "launchBlockerControlsEvidenced": lb_ev})
inputs = {
    "versions": score["versions"], "projectTypes": types, "domains": sorted(run["scope"]["domains"]), "scoredAt": t_score,
    "controlResults": sorted(({"controlId": r["controlId"], "status": r["status"], "evidence": sorted((EV[i]["sourceKind"], EV[i]["strength"]) for i in r["evidenceIds"])} for r in results), key=lambda x: x["controlId"]),
    "findings": sorted(({"id": f["id"], "domain": f["domain"], "severity": f["severity"], "launchBlocker": f["launchBlocker"], "status": status_at(f, t_score)} for f in FINDINGS.values()), key=lambda x: x["id"]),
}
expect("ReadinessScore inputsHash", score["inputsHash"], sha_json(inputs))

# ---------- 6. finding lifecycle ----------
ALLOWED = {None: {"OPEN"}, "OPEN": {"IN_PROGRESS", "BLOCKED", "REMEDIATED", "ACCEPTED_RISK", "NOT_APPLICABLE", "DUPLICATE"},
           "IN_PROGRESS": {"REMEDIATED", "BLOCKED", "OPEN"}, "BLOCKED": {"OPEN", "IN_PROGRESS"}, "REMEDIATED": {"VERIFIED", "OPEN"},
           "VERIFIED": {"OPEN"}, "ACCEPTED_RISK": {"OPEN"}, "NOT_APPLICABLE": {"OPEN"}, "DUPLICATE": {"OPEN"}}
for f in FINDINGS.values():
    lab = f"Finding {f['id']}"
    c = CONTROLS.get(f["controlId"])
    if c:
        t = next((t for t in c["findingTemplates"] if t["templateId"] == f.get("templateId")), None)
        if not t:
            fail(f"{lab}: templateId not in control")
        surfaces = sorted(f"{s['type']}:{s['ref'].strip().lower()}" for s in f["affectedSurfaces"])
        expect(f"{lab} fingerprint", f["fingerprint"], sha_json([f["controlId"], f.get("templateId"), surfaces]))
    ref_ev(lab, f["evidenceIds"] + f["verificationEvidence"])
    prev, prev_at, remediated_at = None, "", None
    for i, h in enumerate(f["history"], 1):
        if h["seq"] != i or h["from"] != prev or h["to"] not in ALLOWED[prev] or h["at"] < prev_at:
            fail(f"{lab}: illegal history entry seq {h['seq']} {h['from']}->{h['to']}")
        if h["to"] == "REMEDIATED":
            remediated_at = h["at"]
            if not (h.get("remediationTaskId") or h.get("runId")):
                fail(f"{lab}: REMEDIATED needs remediationTaskId or runId")
        if h["to"] == "VERIFIED":
            v = VERS.get(h.get("verificationRecordId"))
            if not v or v["result"] != "PASS" or v["findingId"] != f["id"]:
                fail(f"{lab}: VERIFIED needs a PASS VerificationRecord for this finding")
            else:
                if v["verifier"] == v["remediatedBy"]:
                    fail(f"{lab}: verifier must differ from remediator")
                if v["snapshotId"] == f["introducedInSnapshot"]:
                    fail(f"{lab}: verification must use a CURRENT snapshot, not the baseline")
                for e in ref_ev(lab, v["evidenceIds"]):
                    if STRENGTH_RANK[e["strength"]] < STRENGTH_RANK[f["verificationRequired"]["minStrength"]]:
                        fail(f"{lab}: verification evidence {e['id']} below required strength")
                    if remediated_at and e["collectedAt"] <= remediated_at:
                        fail(f"{lab}: verification evidence {e['id']} predates remediation")
        if prev in ("REMEDIATED", "VERIFIED") and h["to"] == "OPEN" and not (h.get("verificationRecordId") or h.get("runId")):
            fail(f"{lab}: reopen needs a failing verification or re-audit run")
        prev, prev_at = h["to"], h["at"]
    expect(f"{lab} status projection", f["status"], prev)
    expect(f"{lab} lastUpdated projection", f["lastUpdated"], prev_at)

# ---------- 7. recovery plan ----------
plan = by_kind["RecoveryPlan"][0]
P0_HIGH_DOMAINS = {"SECURITY", "AUTH", "PRIVACY_DATA", "DATABASE", "CONTINUITY", "BILLING_CONTINUITY", "MIGRATION_CONTINUITY"}
PRANK = {"P0": 0, "P1": 1, "P2": 2}
EFFORT = {"S": 0, "M": 1, "L": 2, "XL": 3, None: 4}


def base_priority(task):
    fs = [FINDINGS[i] for i in task["findingIds"]]
    if any(f["launchBlocker"] or f["severity"] == "CRITICAL" or (f["severity"] == "HIGH" and f["domain"] in P0_HIGH_DOMAINS) for f in fs):
        return "P0"
    if any(f["severity"] == "HIGH" or (f["severity"] == "MEDIUM" and domain_weight(f["domain"], types) >= 4) for f in fs):
        return "P1"
    return "P2"


for t in TASKS.values():
    for fid in t["findingIds"]:
        if fid not in FINDINGS:
            fail(f"{t['id']}: unknown finding {fid}")
    for dep in t["dependencies"]:
        if dep not in TASKS:
            fail(f"{t['id']}: unknown dependency {dep}")
prio = {tid: base_priority(t) for tid, t in TASKS.items()}
changed = True
while changed:  # inherit: a prerequisite is at least as urgent as its dependents
    changed = False
    for tid, t in TASKS.items():
        for dep in t["dependencies"]:
            if PRANK[prio[tid]] < PRANK[prio[dep]]:
                prio[dep], changed = prio[tid], True
for tid, t in TASKS.items():
    expect(f"{tid} priority", t["priority"], prio[tid])
expect("RecoveryPlan priorities", plan["priorities"], {p: sorted(k for k, v in prio.items() if v == p) for p in ("P0", "P1", "P2")})
indeg = {tid: len(t["dependencies"]) for tid, t in TASKS.items()}
dependents = {tid: [k for k, t in TASKS.items() if tid in t["dependencies"]] for tid in TASKS}


def sort_key(tid):
    t = TASKS[tid]
    fs = [FINDINGS[i] for i in t["findingIds"]]
    return (PRANK[prio[tid]], not any(f["launchBlocker"] for f in fs), -max(SEV_RANK[f["severity"]] for f in fs), EFFORT[t.get("effort")], tid)


ready = [sort_key(k) for k, n in indeg.items() if n == 0]
heapq.heapify(ready)
order = []
while ready:
    tid = heapq.heappop(ready)[-1]
    order.append(tid)
    for d in dependents[tid]:
        indeg[d] -= 1
        if indeg[d] == 0:
            heapq.heappush(ready, sort_key(d))
if len(order) != len(TASKS):
    fail("RecoveryPlan: dependency cycle")
expect("RecoveryPlan executionOrder", plan["executionOrder"], order)
for g in plan["projectOsHandoff"]["capabilityGaps"]:
    if g["capabilityRef"] not in taxonomy or not all(g["capabilityRef"] in CONTROLS[c]["capabilityRefs"] for c in g["controlIds"]):
        fail(f"handoff gap {g['capabilityRef']} not backed by its controls/taxonomy")

# ---------- report ----------
print(f"schemas: {len(schemas)} audit + {len(up_schema_files)} upstream | controls: {len(CONTROLS)} over {len({c['domain'] for c in CONTROLS.values()})} domains | "
      f"project types: {len(PROFILES)} | fixture objects: {len(fx)}")
print(f"example baseline: score {r1(overall)} ({label_for(r1(overall))}), launchBlocked={bool(lb_fids)}, confidence {level}, order {order}")
if errors:
    print(f"\nFAIL ({len(errors)}):")
    for e in errors:
        print(" -", e)
    sys.exit(1)
print("PASS")
