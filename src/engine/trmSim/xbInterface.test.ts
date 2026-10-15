// WP-03 acceptance tests (planner-owned). Contract: docs/superpowers/plans/2026-10-14-trm-simulation-loop.md §2.2
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { extractXbInterface } from './xbInterface';

const coffee = JSON.parse(readFileSync(new URL('../../../adia_project_unified_adia_corrected.json', import.meta.url), 'utf8'));

describe('extractXbInterface on the global canvas (legacy React Flow nodes)', () => {
  const iface = extractXbInterface({ canvas: 'global', nodes: coffee.globalXBridgesNodes, edges: coffee.globalXBridgesEdges });
  const sig = (blockId: string, portId: string) => iface.signals.find(s => s.blockId === blockId && s.portId === portId);

  it('lists the controller ports with their saved names, direction and signal type', () => {
    expect(sig('ac_motor_controller', 'omega')).toMatchObject({
      target: 'sim:xb/global/ac_motor_controller/omega', name: 'AC Motor PID Control.ω',
      portDirection: 'output', direction: 'observe', signalType: 'measurement', width: 1,
    });
    expect(sig('ac_motor_controller', 'w_ref')).toMatchObject({ portDirection: 'input', direction: 'stimulus', signalType: 'control' });
    expect(['w_ref', 'tl', 'omega', 'error', 'te'].every(p => sig('ac_motor_controller', p))).toBe(true);
  });

  it('marks which ports are wired, from the canvas edges', () => {
    const edges = coffee.globalXBridgesEdges as { source: string; target: string; sourceHandle: string; targetHandle: string }[];
    const wiredOmega = edges.some(e => e.source === 'ac_motor_controller' && e.sourceHandle === 'omega');
    expect(sig('ac_motor_controller', 'omega')?.connected).toBe(wiredOmega);
    expect(iface.signals.filter(s => s.connected)).toHaveLength(edges.length * 2);
  });

  it('reports a missing unit as unknown instead of inventing one', () => {
    expect(sig('ac_motor_controller', 'omega')?.unit).toBeUndefined();
  });

  it('lists block parameters with their current value as stimulus candidates', () => {
    expect(iface.parameters).toContainEqual({ target: 'sim:xb/global/w_ref_const/$param/value', blockId: 'w_ref_const', name: 'Speed Ref (rad/s).value', value: 157 });
    expect(iface.parameters.filter(p => p.blockId === 'ac_motor_controller').map(p => p.value)).toEqual([2.5, 1.2, 0.1, 157, 2]);
  });
});

describe('extractXbInterface on a model inside an X-Bridges state (persisted shape)', () => {
  const nodes = [
    { id: 'in1', type: 'Inport', parameters: { smVarId: 'v_u', outputs: [{ id: 'out', direction: 'output', shape: 'scalar', dataType: 'float32' }] } },
    { id: 'gain', type: 'GAIN', label: 'Gain', parameters: { inputs: [{ id: 'u', direction: 'input', dimensions: [3] }], outputs: [{ id: 'y', direction: 'output', dimensions: [2, 2], unit: 'V' }], gain: 0 } },
    { id: 'out1', type: 'Outport', parameters: { smVarId: 'v_y', inputs: [{ id: 'in', direction: 'input' }] } },
  ];
  const edges = [
    { id: 'e1', sourceNodeId: 'in1', sourcePortId: 'out', targetNodeId: 'gain', targetPortId: 'u' },
    { id: 'e2', sourceNodeId: 'gain', sourcePortId: 'y', targetNodeId: 'out1', targetPortId: 'in' },
  ];
  const mappings = [
    { smVarId: 'v_u', blockId: 'in1', portId: 'out', direction: 'in' as const },
    { smVarId: 'v_y', blockId: 'out1', portId: 'in', direction: 'out' as const },
  ];
  const iface = extractXbInterface({ canvas: 'state:s2', nodes, edges, mappings });
  const sig = (blockId: string, portId: string) => iface.signals.find(s => s.blockId === blockId && s.portId === portId);

  it('reads ports from parameters and computes width from dimensions', () => {
    expect(sig('gain', 'u')).toMatchObject({ target: 'sim:xb/state%3As2/gain/u', width: 3, connected: true, name: 'Gain.u' });
    expect(sig('gain', 'y')).toMatchObject({ width: 4, unit: 'V' });
    expect(sig('in1', 'out')?.dataType).toBe('float32');
  });

  it('attaches the state-machine variable each Inport/Outport is bound to', () => {
    expect(sig('in1', 'out')?.boundVariable).toEqual({ smVarId: 'v_u', direction: 'in' });
    expect(sig('out1', 'in')?.boundVariable).toEqual({ smVarId: 'v_y', direction: 'out' });
    expect(sig('gain', 'u')?.boundVariable).toBeUndefined();
  });

  it('keeps a zero parameter value and never lists port arrays or smVarId as parameters', () => {
    expect(iface.parameters).toContainEqual({ target: 'sim:xb/state%3As2/gain/$param/gain', blockId: 'gain', name: 'Gain.gain', value: 0 });
    expect(iface.parameters.map(p => p.name)).not.toEqual(expect.arrayContaining([expect.stringMatching(/\.(inputs|outputs|smVarId)$/)]));
  });
});
