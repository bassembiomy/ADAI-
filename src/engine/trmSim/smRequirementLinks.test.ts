// WP-06 acceptance tests (planner-owned). Contract: docs/superpowers/plans/2026-10-14-trm-simulation-loop.md §3 WP-06
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { smRequirementLinks } from './smRequirementLinks';
import { createEmptyRepository } from '../sysml/model';
import { buildSemanticModel } from '../../utils/stateMachine/smSemanticBuilder';
import { migrateStateMachineModel } from '../../utils/stateMachine/smModelMigration';
import { buildSMTestManifest } from '../../utils/stateMachine/smTestPlanBuilder';
import { generateMISRACCode } from '../../utils/stateMachineCodeGenerator';

const heater = JSON.parse(readFileSync(new URL('../../../inductance_heater.json', import.meta.url), 'utf8'));
const T_IDLE_TO_S4 = heater.transitions.find((t: any) => t.sourceId === 's1' && t.targetId.startsWith('1e65')).id as string;
const HEATER_UP = 'bda23ddc-8487-44aa-9274-5be8dba8298b';

const repo = () => {
  const r = createEmptyRepository();
  const req = (id: string, requirementId: string) => ({ id, name: id, namespace: [], kind: 'requirement', requirementId, text: 't', status: 'draft', version: '1' } as any);
  r.requirements.r1 = req('r1', 'REQ-HEAT-1');
  r.requirements.r2 = req('r2', 'REQ-HEAT-2');
  r.requirements.r3 = { ...req('r3', ''), requirementId: undefined };
  r.relationships.a = { id: 'a', kind: 'satisfy', sourceId: HEATER_UP, targetId: 'r1' } as any;
  r.relationships.b = { id: 'b', kind: 'verify', sourceId: `sim:sm/transition/${T_IDLE_TO_S4}`, targetId: 'r2' } as any;
  r.relationships.c = { id: 'c', kind: 'trace', sourceId: 'r1', targetId: `sim:sm/transition/${T_IDLE_TO_S4}` } as any;
  r.relationships.d = { id: 'd', kind: 'refine', sourceId: 's1', targetId: 'r3' } as any;
  r.relationships.e = { id: 'e', kind: 'deriveReqt', sourceId: 'r1', targetId: 'r2' } as any;
  r.relationships.f = { id: 'f', kind: 'satisfy', sourceId: 'some-block', targetId: 'r2' } as any;
  return r;
};

describe('smRequirementLinks', () => {
  const links = smRequirementLinks(repo(), heater);

  it('maps each state and transition to the requirement ids linked by satisfy/verify/refine/trace, sorted and unique', () => {
    expect(links.get(HEATER_UP)).toEqual(['REQ-HEAT-1']);
    expect(links.get(T_IDLE_TO_S4)).toEqual(['REQ-HEAT-1', 'REQ-HEAT-2']);
  });

  it('falls back to the requirement element id when it has no requirement id', () => {
    expect(links.get('s1')).toEqual(['r3']);
  });

  it('ignores links to elements outside this state machine and requirement-to-requirement links', () => {
    expect(links.has('some-block')).toBe(false);
    expect([...links.keys()].sort()).toEqual([HEATER_UP, T_IDLE_TO_S4, 's1'].sort());
  });
});

describe('requirement ids flow into the semantic model, test plan and generated C', () => {
  const links = smRequirementLinks(repo(), heater);
  const ir = buildSemanticModel(migrateStateMachineModel(heater).model, { requirementLinks: links }).ir!;

  it('fills traceable elements from the links and leaves the rest empty', () => {
    const el = (id: string) => ir.traceableElements.find(e => e.id === id)!;
    expect(el(HEATER_UP).requirementIds).toEqual(['REQ-HEAT-1']);
    expect(el(T_IDLE_TO_S4).requirementIds).toEqual(['REQ-HEAT-1', 'REQ-HEAT-2']);
    expect(el('5a79639c-8e01-4f18-b96d-279eb19fcbe8')?.requirementIds ?? []).toEqual([]);
  });

  it('builds the same model as before when no links are given', () => {
    const plain = buildSemanticModel(migrateStateMachineModel(heater).model).ir!;
    expect(plain.traceableElements.every(e => e.requirementIds.length === 0)).toBe(true);
  });

  it('uses the real requirement ids for test cases on linked states and transitions, and keeps the placeholder otherwise', () => {
    const manifest = buildSMTestManifest(ir);
    const onUp = manifest.cases.filter(c => c.traceability.stateIds.includes(HEATER_UP));
    expect(onUp.length).toBeGreaterThan(0);
    for (const c of onUp) expect(c.traceability.requirementIds).toContain('REQ-HEAT-1');
    const init = manifest.cases.find(c => c.id === 'SM-TC-INIT-NULL-INSTANCE')!;
    expect(init.traceability.requirementIds).toEqual(['TEST-INIT-001']);
    expect(buildSMTestManifest(buildSemanticModel(migrateStateMachineModel(heater).model).ir!).cases.every(c => c.traceability.requirementIds.every(id => !id.startsWith('REQ-HEAT')))).toBe(true);
  });

  it('writes the requirement ids into the generated C trace markers', () => {
    const { files, errors } = generateMISRACCode(heater, { requirementLinks: links });
    expect(errors).toEqual([]);
    const c = files.filter(f => f.name.endsWith('.c')).map(f => f.content).join('\n');
    expect(c).toMatch(/TRACE-BEGIN: traceId=TRACE-STATE-\w+ symbol=\w+ requirements=REQ-HEAT-1 \*\//);
    expect(c).toContain('requirements=REQ-HEAT-1,REQ-HEAT-2');
  });

  it('never lets a requirement id break out of the C comment', () => {
    const evil = new Map([[HEATER_UP, ['REQ 1 */ int x; /*', 'REQ-\nNEXT']]]);
    const c = generateMISRACCode(heater, { requirementLinks: evil }).files.filter(f => f.name.endsWith('.c')).map(f => f.content).join('\n');
    const marker = c.split('\n').find(l => l.includes('TRACE-BEGIN') && l.includes('requirements='))!;
    expect(marker.match(/\*\//g)).toHaveLength(1);
    expect(marker).toMatch(/requirements=[A-Za-z0-9_.,:-]+ \*\/$/);
  });

  it('leaves generated C unchanged when nothing is linked', () => {
    const a = generateMISRACCode(heater).files.map(f => f.content).join('\n');
    const b = generateMISRACCode(heater, { requirementLinks: new Map() }).files.map(f => f.content).join('\n');
    expect(b).toBe(a);
    expect(a).not.toContain('requirements=');
  });
});
