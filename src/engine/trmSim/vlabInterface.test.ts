// WP-04 acceptance tests (planner-owned). Contract: docs/superpowers/plans/2026-10-14-trm-simulation-loop.md §2.2
import { describe, expect, it } from 'vitest';
import { extractVlabInterface } from './vlabInterface';

const nodes = [
  { id: 'm1', type: 'default', data: { type: 'dc_motor', label: 'Drive motor', params: { Ra: 0.5, J: 0 } } },
  { id: 'vs', type: 'default', data: { type: 'v_sensor', params: {} } },
  { id: 'x', type: 'default', data: { type: 'not_a_block' } },
];
const edges = [{ id: 'e1', source: 'vs', target: 'm1', sourceHandle: 'p_s', targetHandle: 'p_t' }];
const iface = extractVlabInterface({ canvas: 'global', nodes, edges });
const sig = (blockId: string, portId: string) => iface.signals.find(s => s.blockId === blockId && s.portId === portId);
const par = (blockId: string, key: string) => iface.parameters.find(p => p.blockId === blockId && p.key === key);

describe('extractVlabInterface', () => {
  it('exposes a signal output with its quantity and unit as an observable', () => {
    expect(sig('vs', 'v')).toMatchObject({
      target: 'sim:vlab/global/vs/v', kind: 'signal', direction: 'observe',
      quantity: 'voltage', unit: 'V', width: 1, name: 'Voltage Sensor.V — voltage [V]',
    });
  });

  it('exposes a conserving port with its across and through variables and units', () => {
    expect(sig('m1', 'p')).toMatchObject({
      target: 'sim:vlab/global/m1/p', kind: 'conserving', direction: 'observe', domain: 'Electrical',
      across: { quantity: 'voltage', unit: 'V' }, through: { quantity: 'current', unit: 'A' },
    });
    expect(sig('m1', 'r')).toMatchObject({ domain: 'Rotational', across: { unit: 'rad/s' }, through: { unit: 'N*m' } });
  });

  it('marks wired ports, resolving the _s/_t handle suffixes', () => {
    expect(sig('m1', 'p')?.connected).toBe(true);
    expect(sig('vs', 'p')?.connected).toBe(true);
    expect(sig('m1', 'n')?.connected).toBe(false);
  });

  it('lists parameters with instance value, unit and bounds, keeping zero', () => {
    expect(par('m1', 'Ra')).toMatchObject({ target: 'sim:vlab/global/m1/$param/Ra', name: 'Drive motor.Armature Res [Ω]', value: 0.5, unit: 'Ω' });
    expect(par('m1', 'J')?.value).toBe(0);
    const libDefault = par('m1', 'La');
    expect(libDefault?.unit).toBe('H');
    expect(typeof libDefault?.value).toBe('number');
    expect(par('vs', 'R_int')).toBeDefined();
  });

  it('carries library bounds so a criterion can be checked against them', () => {
    const iface2 = extractVlabInterface({ canvas: 'global', nodes: [{ id: 'r1', data: { type: 'resistor', params: { R: 47 } } }], edges: [] });
    expect(iface2.parameters[0]).toMatchObject({ key: 'R', value: 47, min: 0, exclusiveMin: true });
  });

  it('reports blocks that are not in the library instead of guessing their ports', () => {
    expect(iface.signals.some(s => s.blockId === 'x')).toBe(false);
    expect(iface.diagnostics).toContainEqual(expect.objectContaining({ code: 'UNKNOWN_BLOCK', blockId: 'x' }));
  });
});
