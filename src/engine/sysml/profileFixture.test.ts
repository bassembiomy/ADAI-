import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { deriveBddView } from './bdd';
import { deriveIbdView } from './ibd';
import { assessOpmRoundTripLoss, projectSysmlToOpm } from './opmAdapter';
import { compareBaselines, createBaseline, loadRepository, serializeRepository } from './persistence';
import { buildTraceabilityMatrix, computeCoverageMetrics, exportRtmCsv } from './rtm';
import { validateSysmlRepository } from './validation';
import type { SysmlRepository } from './model';

describe('normative representative SysML profile fixture', () => {
  const fixturePath = resolve(__dirname, 'fixtures/representative-profile.json');

  it('loads the normative fixture and validates without fail-closed errors', () => {
    const raw = readFileSync(fixturePath, 'utf-8');
    const json = JSON.parse(raw);
    const { repository: repo, diagnostics } = loadRepository(json);

    expect(diagnostics.filter(d => d.severity === 'error')).toHaveLength(0);
    const validation = validateSysmlRepository(repo);
    expect(validation.valid).toBe(true);
    expect(validation.diagnostics.filter(d => d.severity === 'error')).toHaveLength(0);
  });

  it('contains every supported BDD construct', () => {
    const raw = readFileSync(fixturePath, 'utf-8');
    const { repository: repo } = loadRepository(JSON.parse(raw));

    // Blocks: abstract and concrete
    const blocks = Object.values(repo.definitions).filter(d => d.kind === 'block');
    expect(blocks.some(b => b.isAbstract)).toBe(true);
    expect(blocks.some(b => !b.isAbstract)).toBe(true);

    // Value types with units and dimensions
    const valueTypes = Object.values(repo.definitions).filter(d => d.kind === 'valueType');
    expect(valueTypes.length).toBeGreaterThan(0);
    expect(valueTypes.some(v => v.kind === 'valueType' && v.unit && v.dimension)).toBe(true);

    // Interface definitions
    const interfaces = Object.values(repo.definitions).filter(d => d.kind === 'interface');
    expect(interfaces.length).toBeGreaterThan(0);

    // Block properties: part, reference, value, flow
    const allProps = blocks.flatMap(b => (b.kind === 'block' ? b.properties : []));
    expect(allProps.some(p => p.kind === 'part')).toBe(true);
    expect(allProps.some(p => p.kind === 'reference')).toBe(true);
    expect(allProps.some(p => p.kind === 'value')).toBe(true);
    expect(allProps.some(p => p.kind === 'flow')).toBe(true);

    // Ports: full and proxy
    const allPorts = blocks.flatMap(b => (b.kind === 'block' ? b.ports : []));
    expect(allPorts.some(p => p.kind === 'full')).toBe(true);
    expect(allPorts.some(p => p.kind === 'proxy')).toBe(true);

    // Relationships: composition, sharedAggregation, association, generalization, dependency, allocation
    const relKinds = new Set(Object.values(repo.relationships).map(r => r.kind));
    expect(relKinds.has('composition')).toBe(true);
    expect(relKinds.has('sharedAggregation')).toBe(true);
    expect(relKinds.has('association')).toBe(true);
    expect(relKinds.has('generalization')).toBe(true);
    expect(relKinds.has('dependency')).toBe(true);
    expect(relKinds.has('allocation')).toBe(true);

    // Derives BDD view cleanly
    const bddView = deriveBddView(repo);
    expect(bddView.elements.length).toBeGreaterThan(0);
    expect(bddView.relationships.length).toBeGreaterThan(0);
  });

  it('contains every supported IBD construct with valid boundaries', () => {
    const raw = readFileSync(fixturePath, 'utf-8');
    const { repository: repo } = loadRepository(JSON.parse(raw));

    // Typed usages
    const usages = Object.values(repo.usages);
    expect(usages.some(u => u.kind === 'part' && u.aggregation === 'composite')).toBe(true);
    expect(usages.some(u => u.kind === 'part' && u.aggregation === 'shared')).toBe(true);

    // Connectors: assembly, delegation, binding
    const connKinds = new Set(Object.values(repo.connectors).map(c => c.kind));
    expect(connKinds.has('assembly')).toBe(true);
    expect(connKinds.has('delegation')).toBe(true);
    expect(connKinds.has('binding')).toBe(true);

    // Item flows
    const itemFlows = Object.values(repo.connectors).filter(c => c.itemFlowId !== undefined);
    expect(itemFlows.length).toBeGreaterThan(0);

    // Derives IBD view for top-level block
    const systemBlock = Object.values(repo.definitions).find(d => d.kind === 'block' && d.name === 'SpacecraftSystem');
    expect(systemBlock).toBeDefined();
    const ibdView = deriveIbdView(repo, systemBlock!.id);
    expect(ibdView.parts.length).toBeGreaterThan(0);
    expect(ibdView.connectors.length).toBeGreaterThan(0);
  });

  it('contains every supported Requirement relationship and governance attribute', () => {
    const raw = readFileSync(fixturePath, 'utf-8');
    const { repository: repo } = loadRepository(JSON.parse(raw));

    // Core requirement relationships: deriveReqt, satisfy, verify, refine, trace, copy
    const relKinds = new Set(Object.values(repo.relationships).map(r => r.kind));
    expect(relKinds.has('deriveReqt')).toBe(true);
    expect(relKinds.has('satisfy')).toBe(true);
    expect(relKinds.has('verify')).toBe(true);
    expect(relKinds.has('refine')).toBe(true);
    expect(relKinds.has('trace')).toBe(true);
    expect(relKinds.has('copy')).toBe(true);

    // Requirements governance attributes
    const reqs = Object.values(repo.requirements);
    expect(reqs.length).toBeGreaterThanOrEqual(4);
    for (const r of reqs) {
      expect(r.requirementId).toBeDefined();
      expect(r.text).toBeDefined();
      expect(r.status).toBeDefined();
      expect(r.version).toBeDefined();
    }

    // Verification cases and evidence
    expect(Object.keys(repo.verificationCases).length).toBeGreaterThan(0);
    expect(Object.keys(repo.evidence).length).toBeGreaterThan(0);
    expect(Object.keys(repo.artifacts).length).toBeGreaterThan(0);
  });

  it('projects canonical RTM with baseline comparison on the normative fixture', () => {
    const raw = readFileSync(fixturePath, 'utf-8');
    const { repository: repo } = loadRepository(JSON.parse(raw));

    const matrix = buildTraceabilityMatrix(repo);
    expect(matrix.rows.length).toBeGreaterThanOrEqual(4);
    const metrics = computeCoverageMetrics(matrix);
    expect(metrics.total).toBeGreaterThanOrEqual(4);

    const csv = exportRtmCsv(matrix);
    expect(csv).toContain('Requirement ID');
    expect(csv).toContain('REQ-');

    // Baseline creation and comparison
    const bl1 = createBaseline(repo, { id: 'BL-NORM-1', name: 'Normative Baseline 1', createdAt: '2026-09-09T00:00:00Z' });
    const bl2 = createBaseline(bl1.repository, { id: 'BL-NORM-2', name: 'Normative Baseline 2', createdAt: '2026-09-09T01:00:00Z' });
    const diff = compareBaselines(bl2.repository, 'BL-NORM-1', 'BL-NORM-2');
    expect(diff.added).toHaveLength(0);
    expect(diff.removed).toHaveLength(0);
    expect(diff.changed).toHaveLength(0);
  });

  it('evaluates OPM projection loss accurately against normative fixture without mutating SysML', () => {
    const raw = readFileSync(fixturePath, 'utf-8');
    const { repository: repo } = loadRepository(JSON.parse(raw));
    const before = structuredClone(repo);

    const projection = projectSysmlToOpm(repo);
    expect(projection.nodes.length).toBeGreaterThan(0);
    expect(projection.edges.length).toBeGreaterThan(0);

    const loss = assessOpmRoundTripLoss(repo, projection);
    expect(loss.lossless).toBe(false);
    // Composite parts and relationships are flagged as lossy
    expect(loss.lossySourceIds.length).toBeGreaterThan(0);
    expect(projection.diagnostics.some(d => d.code === 'OPM_COMPOSITION_OWNERSHIP_LOSS')).toBe(true);
    expect(projection.diagnostics.some(d => d.code === 'OPM_IBD_CONNECTOR_UNSUPPORTED')).toBe(true);

    // Authoritative SysML unchanged
    expect(repo).toEqual(before);
  });
});
