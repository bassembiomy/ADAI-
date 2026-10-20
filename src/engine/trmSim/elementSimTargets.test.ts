// WP-10b acceptance tests (planner-owned). Contract: docs/superpowers/plans/2026-10-14-trm-simulation-loop.md §3 WP-10b
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { elementSimTargets } from './elementSimTargets';

const heater = JSON.parse(readFileSync(join(process.cwd(), 'inductance_heater.json'), 'utf8'));
const HEATER_UP = 'bda23ddc-8487-44aa-9274-5be8dba8298b';

const xbNode = (id: string, type: string, params: Record<string, unknown>) => ({ id, type: 'xbridgesBlock', position: { x: 0, y: 0 }, data: { id, type, params } });
const vlNode = (id: string, type: string, params: Record<string, unknown> = {}) => ({ id, type: 'default', position: { x: 0, y: 0 }, data: { type, params } });
const project = {
  ...heater,
  globalXBridgesNodes: [xbNode('c1', 'Constant', { value: 5 }), xbNode('i1', 'INTEGRATOR_CONTINUOUS', { initial_condition: 2 })],
  globalXBridgesEdges: [{ id: 'e1', source: 'c1', sourceHandle: 'out', target: 'i1', targetHandle: 'u' }],
  vlabNodes: [vlNode('c', 'ps_constant', { value: 2 }), vlNode('i', 'ps_integrator')],
  vlabEdges: [{ id: 'v1', source: 'c', sourceHandle: 'y_s', target: 'i', targetHandle: 'u_t' }],
};

const ids = (xs: { target: string }[]) => xs.map(x => x.target);
const unique = (xs: { target: string }[]) => expect(new Set(ids(xs)).size).toBe(xs.length);

describe('elementSimTargets', () => {
  it('offers a state and its outgoing transitions, state first, with readable names', () => {
    const t = elementSimTargets(project, { engine: 'sm', stateId: HEATER_UP });
    expect(t[0]).toMatchObject({ target: HEATER_UP, name: 'HEATER_UP', engine: 'sm' });
    expect(ids(t).slice(1).sort()).toEqual([
      'sim:sm/transition/23de9ffc-0ebb-40d6-8ff6-99b4affb0b34',
      'sim:sm/transition/a1cc9a88-b03e-4ada-8161-dc971b2bc2ea',
    ]);
    expect(t.find(x => x.target.endsWith('a1cc9a88-b03e-4ada-8161-dc971b2bc2ea'))?.name).toBe('HEATER_UP → HEATER_DOWN');
    unique(t);
  });

  it('offers the ports and parameters of one X-Bridges block, and nothing from other blocks', () => {
    const t = elementSimTargets(project, { engine: 'xb', blockId: 'i1' });
    expect(ids(t).sort()).toEqual(['sim:xb/global/i1/$param/initial_condition', 'sim:xb/global/i1/y']);
    expect(t.every(x => x.engine === 'xb')).toBe(true);
    expect(t.find(x => x.target === 'sim:xb/global/i1/y')?.name).toBe('INTEGRATOR_CONTINUOUS.y');
    expect(ids(elementSimTargets(project, { engine: 'xb', blockId: 'c1' })).sort()).toEqual(['sim:xb/global/c1/$param/value', 'sim:xb/global/c1/out']);
  });

  it('offers the signals and parameters of one V-Lab component, keeping units', () => {
    const t = elementSimTargets(project, { engine: 'vlab', blockId: 'c' });
    expect(ids(t).sort()).toEqual(['sim:vlab/global/c/$param/value', 'sim:vlab/global/c/y']);
    expect(t.find(x => x.target === 'sim:vlab/global/c/$param/value')).toMatchObject({ unit: '1', engine: 'vlab' });
    unique(t);
  });

  it('does not confuse blocks whose ids share a prefix', () => {
    const p = { ...project, globalXBridgesNodes: [...project.globalXBridgesNodes, xbNode('i10', 'INTEGRATOR_CONTINUOUS', { initial_condition: 0 })] };
    expect(ids(elementSimTargets(p, { engine: 'xb', blockId: 'i1' })).every(x => x.startsWith('sim:xb/global/i1/'))).toBe(true);
  });

  it('returns nothing for an unknown element or an empty project', () => {
    expect(elementSimTargets(project, { engine: 'xb', blockId: 'nope' })).toEqual([]);
    expect(elementSimTargets(project, { engine: 'sm', stateId: 'nope' })).toEqual([]);
    expect(elementSimTargets({}, { engine: 'vlab', blockId: 'c' })).toEqual([]);
  });
});
