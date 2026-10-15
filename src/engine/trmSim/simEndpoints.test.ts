// WP-05 acceptance tests (planner-owned). Contract: docs/superpowers/plans/2026-10-14-trm-simulation-loop.md §3 WP-05
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { projectSimSources, buildSimEndpoints, projectExternalEndpoints, projectExternalEndpointSignature } from './simEndpoints';
import { loadCanonicalSysmlProject } from '../../services/sysmlCommandGateway';
import { evaluateSysmlConnection } from '../sysml/connectionPolicy';
import { validateSysmlRepository } from '../sysml/validation';
import { createEmptyRepository } from '../sysml/model';
import { buildTraceabilityIndex } from '../sysml/traceabilityIndex';
import { buildSimExternalElements } from './simExternalElements';

const coffee = JSON.parse(readFileSync(new URL('../../../adia_project_unified_adia_corrected.json', import.meta.url), 'utf8'));
const heater = JSON.parse(readFileSync(new URL('../../../inductance_heater.json', import.meta.url), 'utf8'));
const HEATER_VAR = 'sim:sm/var/a002ce43-8aaa-4ebe-b84b-b872033fb4ea';
const OMEGA = 'sim:xb/global/ac_motor_controller/omega';

const sim = (id: string) => ({ id, name: id, family: 'simulationTarget' as const });
const req = { id: 'req1', name: 'Req 1', family: 'requirement' as const };
const blk = { id: 'b1', name: 'B', family: 'block' as const };

describe('projectSimSources', () => {
  it('collects the state machine, the global X-Bridges canvas, the global V-Lab canvas and models inside X-Bridges states', () => {
    const embedded = { ...heater, states: [...heater.states, { id: 'sx', name: 'Ctl', isXBridges: true, xBridgesModel: { version: 1, nodes: [{ id: 'g', type: 'GAIN', parameters: { gain: 1 } }], edges: [] } }] };
    const src = projectSimSources({ ...embedded, globalXBridgesNodes: coffee.globalXBridgesNodes, vlabNodes: [{ id: 'r', data: { type: 'resistor', params: {} } }] });
    expect(src.stateMachine?.variables).toHaveLength(6);
    expect(src.xbridges?.map(c => c.canvas).sort()).toEqual(['global', 'state:sx']);
    expect(src.vlab?.map(c => c.canvas)).toEqual(['global']);
  });

  it('tolerates a payload with nothing in it', () => {
    expect(buildSimEndpoints(projectSimSources({})).size).toBe(0);
  });
});

describe('buildSimEndpoints', () => {
  const endpoints = buildSimEndpoints(projectSimSources(coffee));

  it('turns every simulation element into an external endpoint of family simulationTarget, keyed by its sim id', () => {
    expect(endpoints.get(OMEGA)).toEqual({ id: OMEGA, name: buildSimExternalElements(projectSimSources(coffee)).find(e => e.id === OMEGA)?.name, family: 'simulationTarget' });
    expect(endpoints.get(OMEGA)?.name).toMatch(/\S/);
    for (const [id, e] of endpoints) {
      expect(id.startsWith('sim:')).toBe(true);
      expect(e.family).toBe('simulationTarget');
    }
  });

  it('leaves states and junctions to the existing state endpoints', () => {
    const elements = buildSimExternalElements(projectSimSources(heater));
    const simIds = elements.filter(e => e.id.startsWith('sim:')).map(e => e.id).sort();
    expect([...buildSimEndpoints(projectSimSources(heater)).keys()].sort()).toEqual(simIds);
    expect(buildSimEndpoints(projectSimSources(heater)).has('s1')).toBe(false);
  });
});

describe('projectExternalEndpoints', () => {
  it('merges state endpoints and simulation endpoints for project hydration', () => {
    const m = projectExternalEndpoints(heater);
    expect(m.get('s1')).toMatchObject({ family: 'state', name: 'IDLE' });
    expect(m.get(HEATER_VAR)).toMatchObject({ family: 'simulationTarget', name: 'HEATER' });
  });
});

describe('project load keeps links to simulation targets', () => {
  const withLink = () => {
    const repository = createEmptyRepository();
    repository.requirements.req1 = { id: 'req1', name: 'Req 1', kind: 'requirement', namespace: [], requirementId: 'REQ-1', text: 'Must hold', status: 'draft', version: '1' } as any;
    repository.relationships.link = { id: 'link', kind: 'satisfy', sourceId: HEATER_VAR, targetId: 'req1' } as any;
    return { ...heater, sysmlRepository: repository };
  };

  it('keeps the link when hydration is given the project external endpoints', () => {
    const payload = withLink();
    const loaded = loadCanonicalSysmlProject(payload, { externalEndpoints: projectExternalEndpoints(payload) });
    expect(loaded.repository.relationships.link).toBeDefined();
    expect(loaded.quarantinedRelationshipIds).not.toContain('link');
  });

  it('changes the endpoint signature when a simulation target appears or disappears, so a stale preload is revalidated', () => {
    const payload = withLink();
    const without = { ...payload, variables: payload.variables.filter((v: any) => `sim:sm/var/${v.id}` !== HEATER_VAR) };
    expect(projectExternalEndpointSignature(payload)).toBe(projectExternalEndpointSignature(withLink()));
    expect(projectExternalEndpointSignature(without)).not.toBe(projectExternalEndpointSignature(payload));
  });
});

describe('connection policy for simulation targets', () => {
  it.each(['satisfy', 'verify', 'refine', 'trace'] as const)('allows %s from a simulation target to a requirement', kind => {
    expect(evaluateSysmlConnection({ relationshipKind: kind, source: sim(OMEGA), target: req, diagram: 'rtm' } as any).allowed).toBe(true);
  });

  it('allows trace from a requirement to a simulation target', () => {
    expect(evaluateSysmlConnection({ relationshipKind: 'trace', source: req, target: sim(OMEGA), diagram: 'rtm' } as any).allowed).toBe(true);
  });

  it('keeps satisfy directed from the model to the requirement', () => {
    const d = evaluateSysmlConnection({ relationshipKind: 'satisfy', source: req, target: sim(OMEGA), diagram: 'rtm' } as any);
    expect(d.allowed).toBe(false);
    expect(d.diagnostics[0].code).toBe('INVALID_SATISFY_DIRECTION');
  });

  it.each(['dependency', 'allocation'] as const)('rejects %s with a simulation target', kind => {
    const d = evaluateSysmlConnection({ relationshipKind: kind, source: sim(OMEGA), target: blk, diagram: 'bdd' } as any);
    expect(d.allowed).toBe(false);
    expect(d.diagnostics[0].code).toBe('SIMULATION_TARGET_RELATIONSHIP');
  });
});

describe('repository validation with simulation endpoints', () => {
  const repo = () => {
    const r = createEmptyRepository();
    r.requirements.req1 = { id: 'req1', name: 'Req 1', namespace: [], kind: 'requirement', requirementId: 'REQ-1', text: 'Speed', status: 'draft', version: '1' } as any;
    r.relationships.rel1 = { id: 'rel1', kind: 'satisfy', sourceId: OMEGA, targetId: 'req1' } as any;
    return r;
  };

  it('accepts a satisfy from a simulation target when the target is supplied as an external endpoint', () => {
    const context = { externalEndpoints: buildSimEndpoints(projectSimSources(coffee)) };
    expect(validateSysmlRepository(repo(), context).valid).toBe(true);
  });

  it('still reports the link when the simulation target no longer exists', () => {
    const report = validateSysmlRepository(repo(), { externalEndpoints: new Map() });
    expect(report.valid).toBe(false);
  });

  it('shows the simulation target as the element covering the requirement in the traceability index', () => {
    const index = buildTraceabilityIndex(repo(), buildSimExternalElements(projectSimSources(coffee)));
    expect(index.coveringElementsByRequirement.get('req1')).toEqual([OMEGA]);
    expect(index.diagnostics.filter(d => d.code === 'UNRESOLVED_ENDPOINT')).toEqual([]);
  });
});
