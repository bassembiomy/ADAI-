/* Builds full system-report HTML for the audit cases. Run: npx tsx scripts/report-audit/build.ts */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSystemReport, type SystemReportInput } from '../../src/features/reporting/systemReport/buildSystemReport';
import { richReportInput, richHierarchy } from '../../src/features/reporting/systemReport/systemReport.fixture';
import { loadCanonicalSysmlProject, projectLegacyDiagram } from '../../src/services/sysmlCommandGateway';
import { projectStateEndpoints } from '../../src/engine/sysml/workers/projectIoPayload';
import { createReportSnapshot, toHierarchySource } from '../../src/features/reporting/reportSnapshot';
import { buildTraceabilityMatrix, computeCoverageMetrics } from '../../src/engine/sysml/rtm';
import { buildTraceabilityIndex } from '../../src/engine/sysml/traceabilityIndex';
import { buildCanonicalTraceabilitySnapshot } from '../../src/engine/sysml/reportSnapshotAdapter';
import { analyzeStateMachine } from '../../src/utils/smAnalysisEngine';
import { renderStateMachineAnalysisHtml } from '../../src/features/reporting/systemReport/stateMachineAnalysisSection';
import { renderHmiDesignSection, renderHmiPrototypeSection } from '../../src/features/reporting/hmiReportSections';
import { renderHmiDiagram } from '../../src/features/reporting/reportDiagrams';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const outDir = process.env.REPORT_AUDIT_OUT ? resolve(process.env.REPORT_AUDIT_OUT) : resolve(here, 'out');
mkdirSync(outDir, { recursive: true });


type Section = { id: string; title: string; html: string };

/** The HMI design and interactive prototype sections exactly as App.tsx builds them. */
function hmiSections(project: any): Section[] {
  const comps = project.hmiComponents ?? [];
  if (!comps.length) return [];
  const variables = project.variables ?? [];
  return [
    { id: 'hmi-design', title: 'HMI Design', html: renderHmiDesignSection(comps, variables, []) },
    {
      id: 'interactive-prototype', title: 'Interactive System Prototype',
      html: renderHmiPrototypeSection({
        hmiComponents: comps, variables, states: project.states ?? [], junctions: project.junctions ?? [],
        transitions: project.transitions ?? [], layers: project.layers ?? [], tickMs: project.tickMs ?? 100, safetyMode: project.safetyMode ?? false,
      }),
    },
  ];
}

async function fromProject(file: string, name: string) {
  const project = JSON.parse(readFileSync(resolve(root, file), 'utf8'));
  const context = { externalEndpoints: projectStateEndpoints(project.states ?? []) };
  let loaded: ReturnType<typeof loadCanonicalSysmlProject>;
  try { loaded = loadCanonicalSysmlProject(project, context); }
  catch (e) {
    // inductance_heater.adia is a flat legacy file tagged schemaVersion 4; the loader mistakes it for a V4 repository and throws.
    // Record that as a finding and retry without the version tag so the report can still be audited.
    console.warn(`[${name}] loadCanonicalSysmlProject threw (${(e as Error).message}); retrying without schemaVersion`);
    const { schemaVersion: _drop, ...rest } = project;
    loaded = loadCanonicalSysmlProject(rest, context);
  }
  const repo = loaded.repository;
  const view = projectLegacyDiagram(repo);
  const states = project.states ?? [], layers = project.layers ?? [], transitions = project.transitions ?? [], junctions = project.junctions ?? [];
  const snapshot = createReportSnapshot({ blocks: view.blocks, relationships: view.relationships, parts: view.parts, connectors: view.connectors, states, layers, transitions, junctions } as any);
  const hierarchy = toHierarchySource(snapshot);
  const ext = [
    ...states.map((s: any) => ({ id: s.id, name: s.name, kind: 'state' })),
    ...junctions.map((j: any) => ({ id: j.id, name: j.name, kind: j.type ?? 'pseudostate' })),
  ];
  const matrix = buildTraceabilityMatrix(repo, {}, buildTraceabilityIndex(repo, ext), ext, {} as any);
  const snap = buildCanonicalTraceabilitySnapshot(repo);
  const extraSections: Section[] = [];
  if (hierarchy.states.length > 0) {
    const analysis = analyzeStateMachine({ tickMs: project.tickMs, states: hierarchy.states, junctions: hierarchy.junctions, transitions: hierarchy.transitions, variables: project.variables ?? [], layers: hierarchy.layers, safetyMode: project.safetyMode } as any);
    extraSections.push({ id: 'state-machine-analysis', title: 'State Machine Analysis', html: renderStateMachineAnalysisHtml(analysis) });
  }
  extraSections.push(...hmiSections(project));
  const comps = project.hmiComponents ?? [];
  if (comps.length) extraSections.push({ id: 'hmi-layout-figure', title: 'HMI Layout (renderHmiDiagram)', html: renderHmiDiagram({ components: comps } as any) });
  const input: SystemReportInput = {
    projectName: project.projectName ?? name, author: 'Audit', engineVersion: 'v2.4 ENGINE', generatedAt: new Date('2026-10-19T09:00:00Z'),
    repository: repo, hierarchy, diagnostics: snapshot.diagnostics,
    traceability: { matrix, metrics: computeCoverageMetrics(matrix), modelHash: snap.modelHash, repositoryRevision: snap.repositoryRevision, diagnostics: snap.diagnostics.map((d: any) => ({ code: d.code, message: d.message })) },
    extraSections,
  };
  return buildSystemReport(input);
}

async function stress() {
  const base = richReportInput();
  const long = (s: string) => `${s} with an extraordinarily long descriptive element name that keeps going`;
  const repo: any = base.repository;
  for (const d of Object.values<any>(repo.definitions)) if (d.kind === 'block') d.name = long(d.name);
  for (const r of Object.values<any>(repo.requirements)) r.name = long(r.name);
  const h: any = richHierarchy();
  h.blocks.forEach((b: any) => { b.name = long(b.name); });
  h.parts.forEach((p: any) => { p.name = long(p.name); });
  h.states.forEach((s: any) => { s.name = long(s.name); });
  const hmi: any[] = [
    { id: 'h1', name: 'Left switch', type: 'toggle', x: 0, y: 0, width: 140, height: 90 },
    { id: 'h2', name: 'A very very long named component label for the far right', type: 'button', x: 1500, y: 40, width: 160, height: 90 },
    { id: 'h3', name: 'Slider', type: 'slider', x: 700, y: 400, width: 200, height: 90, min: 0, max: 100 },
  ];
  const input: SystemReportInput = { ...base, hierarchy: h, extraSections: [...(base.extraSections ?? []), ...hmiSections({ hmiComponents: hmi, variables: [] })] };
  return buildSystemReport(input);
}

const cases: [string, () => Promise<string> | string][] = [
  ['fixture', () => buildSystemReport(richReportInput({ extraSections: [...(richReportInput().extraSections ?? [])] }))],
  ['mr_pld_ecu', () => fromProject('MR_PLD_ECU.adia', 'MR_PLD_ECU')],
  ['inductance_heater', () => fromProject('inductance_heater.adia', 'inductance_heater')],
  ['stress', stress],
];
const only = process.argv.slice(2);
for (const [name, fn] of cases) {
  if (only.length && !only.includes(name)) continue;
  try { const html = await fn(); writeFileSync(resolve(outDir, `${name}.html`), html); console.log(`built ${name}.html (${(html.length / 1024).toFixed(0)} kB)`); }
  catch (e) { console.error(`FAILED ${name}:`, (e as Error).stack); process.exitCode = 1; }
}
