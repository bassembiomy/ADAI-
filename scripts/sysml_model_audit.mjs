#!/usr/bin/env node
/**
 * ADIA SysML model audit — reproducible evidence for
 * docs/SYSML_STANDARDS_REVIEW_2026-09-08.md (sections 4 and 7.2).
 *
 * Loads the pure TypeScript consistency services directly (Node >= 22.6 type
 * stripping) and exercises them against a project file, so the review numbers
 * can be re-generated instead of trusted.
 *
 * Usage:
 *   node --experimental-strip-types scripts/sysml_model_audit.mjs [path/to/project.json]
 *
 * Default project: adia_project_unified_adia_corrected.json
 *
 * What it reports
 *   1. Model census (blocks / relationships / parts / connectors / ports)
 *   2. Relationship-type census + SysML v1.6 direction conformance
 *   3. Requirement coverage (as computed by the RTM today) and orphan count
 *   4. Deletion-path divergence: the properties-panel cascade vs. the flat
 *      filter used by the Delete key / Ctrl+X (App.tsx deleteNonStateElements)
 *   5. Post-delete reconciliation diagnostics for both paths
 *
 * Exit code is 0 — this is a report, not a gate. Wire the assertions in as
 * vitest specs (see the review, section 9) before relying on it in CI.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  cascadeDeleteReportElement,
  reconcileReportModel,
} from '../src/services/reportModelConsistency.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
const projectPath = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(REPO, 'adia_project_unified_adia_corrected.json');

const raw = JSON.parse(fs.readFileSync(projectPath, 'utf8'));
const model = {
  blocks: raw.blocks ?? [],
  relationships: raw.relationships ?? [],
  parts: raw.parts ?? [],
  connectors: raw.connectors ?? [],
  states: raw.states ?? [],
  layers: raw.layers ?? [],
  transitions: raw.transitions ?? [],
  junctions: raw.junctions ?? [],
};
const interfaceRealizations = raw.interfaceRealizations ?? [];

const line = (s = '') => console.log(s);
const header = (s) => line(`\n=== ${s} ===`);

/**
 * SysML v1.6 (section 16): requirement relationships are UML dependencies and
 * point from the client (dependent) to the supplier (independent).
 *   satisfy    : client = satisfying block/part, supplier = requirement
 *   verify     : client = test/verification element, supplier = requirement
 *   deriveReqt : client = DERIVED requirement,     supplier = SOURCE requirement
 *   refine     : client = refining model element,  supplier = requirement
 *   trace/copy : unconstrained / requirement-to-requirement
 */
const DIRECTION_RULES = {
  satisfy: (s, t) => (s.isReq ? 'NONCONFORMANT (requirement cannot be the satisfying client)' : t.isReq ? 'ok' : 'NONCONFORMANT (supplier must be a requirement)'),
  verify: (s, t) => (t.isReq ? 'ok' : 'NONCONFORMANT (supplier must be a requirement)'),
  deriveReqt: (s, t) => (s.isReq && t.isReq ? 'ok' : 'NONCONFORMANT (both ends must be requirements)'),
  derive: (s, t) => (s.isReq && t.isReq ? 'ok (legacy token — canonicalise to deriveReqt)' : 'NONCONFORMANT (both ends must be requirements)'),
  refine: (s, t) => (s.isReq || t.isReq ? 'ok' : 'n/a'),
  trace: () => 'ok',
  copy: () => 'ok',
};

/** Emulates App.tsx deleteNonStateElements (the Delete key / Ctrl+X path). */
function flatDelete(ids) {
  const idSet = new Set(ids);
  return {
    blocks: model.blocks.filter((b) => !idSet.has(b.id)),
    relationships: model.relationships.filter(
      (r) => !idSet.has(r.id) && !idSet.has(r.sourceId) && !idSet.has(r.targetId),
    ),
    parts: model.parts.filter((p) => !idSet.has(p.id)),
    connectors: model.connectors.filter(
      (c) => !idSet.has(c.id) && !idSet.has(c.sourcePartId) && !idSet.has(c.targetPartId),
    ),
  };
}

const codes = (diag) =>
  diag.diagnostics.errors.reduce((acc, e) => {
    acc[e.code] = (acc[e.code] ?? 0) + 1;
    return acc;
  }, {});

// ---------------------------------------------------------------- 1. census
header('1. MODEL CENSUS');
line(`project: ${path.relative(REPO, projectPath)}`);
line(`blocks ${model.blocks.length} | relationships ${model.relationships.length} | parts ${model.parts.length} | connectors ${model.connectors.length} | interfaceRealizations ${interfaceRealizations.length}`);
const byStereo = {};
for (const b of model.blocks) byStereo[b.stereotype ?? '(none)'] = (byStereo[b.stereotype ?? '(none)'] ?? 0) + 1;
line(`block stereotypes: ${JSON.stringify(byStereo)}`);
const byType = {};
for (const r of model.relationships) byType[r.type] = (byType[r.type] ?? 0) + 1;
line(`relationship types: ${JSON.stringify(byType)}`);
let ports = 0;
let withDirection = 0;
const portKinds = {};
for (const b of model.blocks) {
  for (const p of b.ports ?? []) {
    ports += 1;
    if (p.direction) withDirection += 1;
    portKinds[p.kind ?? '(none)'] = (portKinds[p.kind ?? '(none)'] ?? 0) + 1;
  }
}
line(`ports: ${ports} total | with direction: ${withDirection} | kinds: ${JSON.stringify(portKinds)}`);

// ------------------------------------------------- 2. direction conformance
header('2. RELATIONSHIP DIRECTION vs SysML v1.6');
const stereoById = new Map(model.blocks.map((b) => [b.id, b.stereotype]));
const partIds = new Set(model.parts.map((p) => p.id));
const describe = (id) =>
  partIds.has(id) ? 'part' : id === 'root' ? 'root' : stereoById.get(id) ?? '(missing)';
for (const [type, count] of Object.entries(byType)) {
  const rule = DIRECTION_RULES[type];
  if (!rule) {
    line(`${type} (${count}): structural relationship — direction rule not applicable`);
    continue;
  }
  const verdicts = {};
  for (const r of model.relationships.filter((x) => x.type === type)) {
    const v = rule({ isReq: stereoById.get(r.sourceId) === 'requirement' }, { isReq: stereoById.get(r.targetId) === 'requirement' });
    const key = `${v} [${describe(r.sourceId)} -> ${describe(r.targetId)}]`;
    verdicts[key] = (verdicts[key] ?? 0) + 1;
  }
  line(`${type} (${count}):`);
  for (const [k, n] of Object.entries(verdicts)) line(`   ${n} × ${k}`);
}

// ------------------------------------------------------- 3. RTM coverage
header('3. REQUIREMENT COVERAGE (as the RTM computes it today)');
const reqs = model.blocks.filter((b) => b.stereotype === 'requirement');
const coveredByRelation = new Set(model.relationships.filter((r) => r.type === 'satisfy').map((r) => r.targetId));
const coveredByField = new Set();
for (const b of model.blocks) for (const id of b.satisfiedReqIds ?? []) coveredByField.add(id);
for (const p of model.parts) for (const id of p.satisfiedReqIds ?? []) coveredByField.add(id);
line(`requirements: ${reqs.length}`);
line(`covered by «satisfy» relation : ${reqs.filter((r) => coveredByRelation.has(r.id)).length}`);
line(`covered by satisfiedReqIds     : ${reqs.filter((r) => coveredByField.has(r.id)).length}`);
line(`covered by either              : ${reqs.filter((r) => coveredByRelation.has(r.id) || coveredByField.has(r.id)).length}`);
line(`UNCOVERED (orphan requirements): ${reqs.filter((r) => !coveredByRelation.has(r.id) && !coveredByField.has(r.id)).length}`);
const divergent = reqs.filter((r) => coveredByRelation.has(r.id) !== coveredByField.has(r.id));
line(`sources of truth disagree on   : ${divergent.length}${divergent.length ? ` (${divergent.slice(0, 8).map((r) => r.reqId ?? r.id).join(', ')})` : ''}`);
const status = {};
const method = {};
for (const r of reqs) {
  status[r.status ?? '(none)'] = (status[r.status ?? '(none)'] ?? 0) + 1;
  method[r.verificationMethod ?? '(none)'] = (method[r.verificationMethod ?? '(none)'] ?? 0) + 1;
}
line(`status: ${JSON.stringify(status)}`);
line(`verificationMethod: ${JSON.stringify(method)}`);
line(`«verify» relationships in model: ${model.relationships.filter((r) => r.type === 'verify').length}`);

// ------------------------------------------------- 4. deletion divergence
header('4. DELETION PATHS: cascade (panel button) vs flat (Delete key)');
const baseline = reconcileReportModel(model);
line(`baseline diagnostics: ${JSON.stringify(codes(baseline))}`);

const targets = [
  ...model.blocks
    .filter((b) => model.parts.some((p) => p.typeId === b.id))
    .slice(0, 3)
    .map((b) => ({ kind: 'block', id: b.id, name: b.name })),
  ...reqs.slice(0, 1).map((r) => ({ kind: 'requirement', id: r.id, name: `${r.reqId ?? ''} ${r.name}`.trim() })),
  ...model.parts
    .filter((p) => model.connectors.some((c) => c.sourcePartId === p.id || c.targetPartId === p.id))
    .slice(0, 1)
    .map((p) => ({ kind: 'part', id: p.id, name: p.name })),
];

for (const t of targets) {
  line('');
  line(`--- delete ${t.kind} "${t.name}" ---`);
  const cascaded = cascadeDeleteReportElement(model, { kind: t.kind, id: t.id });
  const flat = flatDelete([t.id]);
  line(`cascade : blocks ${model.blocks.length}->${cascaded.blocks.length} parts ${model.parts.length}->${cascaded.parts.length} connectors ${model.connectors.length}->${cascaded.connectors.length} relationships ${model.relationships.length}->${cascaded.relationships.length}`);
  line(`flat    : blocks ${model.blocks.length}->${flat.blocks.length} parts ${model.parts.length}->${flat.parts.length} connectors ${model.connectors.length}->${flat.connectors.length} relationships ${model.relationships.length}->${flat.relationships.length}`);

  const orphanParts = flat.parts.filter((p) => p.typeId && !flat.blocks.some((b) => b.id === p.typeId));
  if (orphanParts.length) {
    const wired = model.connectors.filter((c) => orphanParts.some((p) => p.id === c.sourcePartId || p.id === c.targetPartId));
    line(`ORPHAN parts left by the flat path: ${orphanParts.length} (${orphanParts.map((p) => p.name).join(', ')}) — still wired by ${wired.length} connector(s)`);
  }
  const staleness = (next) =>
    [...new Set(next.blocks.filter((b) => (b.satisfiedReqIds ?? []).includes(t.id)).map((b) => b.name))];
  const staleCascade = staleness(cascaded);
  const staleFlat = staleness(flat);
  if (staleCascade.length) line(`STALE satisfiedReqIds after CASCADE: ${staleCascade.length} (${staleCascade.slice(0, 5).join(', ')})`);
  if (staleFlat.length) line(`STALE satisfiedReqIds after FLAT   : ${staleFlat.length} (${staleFlat.slice(0, 5).join(', ')})`);
  const staleIR = interfaceRealizations.filter((ir) => ir.partId === t.id || ir.interfaceId === t.id);
  if (staleIR.length) line(`STALE interfaceRealizations -> deleted element: ${staleIR.length}`);

  const flatDiag = reconcileReportModel({ ...flat, states: model.states, layers: model.layers, transitions: model.transitions, junctions: model.junctions });
  const cascDiag = reconcileReportModel({ ...cascaded, states: model.states, layers: model.layers, transitions: model.transitions, junctions: model.junctions });
  line(`diagnostics after cascade: ${JSON.stringify(codes(cascDiag))}`);
  line(`diagnostics after flat   : ${JSON.stringify(codes(flatDiag))}   <-- empty here means the corruption is invisible`);
}

// --------------------------------------------------- 5. IBD context blast radius
header('5. BLAST RADIUS: deleting an IBD context block');
const contexts = model.parts.reduce((acc, p) => {
  acc[p.blockId] = (acc[p.blockId] ?? 0) + 1;
  return acc;
}, {});
for (const [blockId, partCount] of Object.entries(contexts).sort((a, b) => b[1] - a[1]).slice(0, 3)) {
  const blk = model.blocks.find((b) => b.id === blockId);
  const next = cascadeDeleteReportElement(model, { kind: 'block', id: blockId });
  const removedConns = model.connectors.length - next.connectors.length;
  line(`"${blk?.name ?? blockId}" hosts ${partCount} part(s) -> deleting it removes ${partCount} parts, ${removedConns} connectors, ${model.relationships.length - next.relationships.length} relationships (no confirmation dialog is shown today)`);
}

header('NOTES');
line('Rule set: OMG SysML v1.6 section 16 (dependencies point client -> supplier).');
line('See docs/SYSML_STANDARDS_REVIEW_2026-09-08.md for the analysis and the change plan.');
