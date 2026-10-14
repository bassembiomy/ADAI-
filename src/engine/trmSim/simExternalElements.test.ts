// WP-01 acceptance tests (planner-owned). Contract: docs/superpowers/plans/2026-10-14-trm-simulation-loop.md §2.1
import { describe, expect, it } from 'vitest';
import { buildSimExternalElements } from './simExternalElements';

const sources = {
  stateMachine: {
    states: [{ id: 's1', name: 'Idle' }, { id: 's2', name: 'Heating' }],
    junctions: [{ id: 'j1', name: 'Choice', type: 'choice' }, { id: 'j2', name: '' }],
    transitions: [{ id: 't1', sourceId: 's1', targetId: 's2' }, { id: 't2', sourceId: 's2', targetId: 'j1' }],
    variables: [{ id: 'v1', name: 'POWER' }],
  },
  xbridges: [
    {
      canvas: 'global',
      nodes: [{
        id: 'pid', type: 'xblock',
        data: {
          type: 'AC_MOTOR_PID_CONTROL', label: 'ac_motor_controller', params: { kp: 1, ki: 0 },
          inputs: [{ id: 'w_ref', name: 'w_ref' }, { id: 'tl', name: 'tl' }],
          outputs: [{ id: 'omega', name: 'omega' }],
        },
      }],
    },
    {
      canvas: 'state:s2',
      nodes: [{
        id: 'g', type: 'GAIN', label: 'Gain',
        parameters: { inputs: [{ id: 'u', direction: 'input' }], outputs: [{ id: 'y', direction: 'output' }], gain: 2 },
      }],
    },
  ],
  vlab: [
    {
      canvas: 'global',
      nodes: [
        { id: 'vs1', type: 'default', data: { type: 'v_sensor', label: 'Supply sense', params: {} } },
        { id: 'r1', type: 'default', data: { type: 'resistor', params: { R: 47 } } },
      ],
    },
  ],
};

const byId = (id: string) => buildSimExternalElements(sources).find(e => e.id === id);

describe('buildSimExternalElements', () => {
  it('keeps states and junctions on their raw ids, as the TRM window already links them', () => {
    expect(byId('s1')).toEqual({ id: 's1', name: 'Idle', kind: 'state' });
    expect(byId('j1')).toEqual({ id: 'j1', name: 'Choice', kind: 'choice' });
    expect(byId('j2')?.kind).toBe('pseudostate');
  });

  it('names transitions by their source and target and variables by name', () => {
    expect(byId('sim:sm/transition/t1')).toEqual({ id: 'sim:sm/transition/t1', name: 'Idle → Heating', kind: 'transition' });
    expect(byId('sim:sm/transition/t2')?.name).toBe('Heating → Choice');
    expect(byId('sim:sm/var/v1')).toEqual({ id: 'sim:sm/var/v1', name: 'POWER', kind: 'variable' });
  });

  it('lists X-Bridges blocks, every instance port and every parameter on the global canvas', () => {
    expect(byId('sim:xb/global/pid')).toEqual({ id: 'sim:xb/global/pid', name: 'ac_motor_controller', kind: 'xbridgesBlock' });
    expect(byId('sim:xb/global/pid/w_ref')).toEqual({ id: 'sim:xb/global/pid/w_ref', name: 'ac_motor_controller.w_ref', kind: 'xbridgesPort' });
    expect(byId('sim:xb/global/pid/omega')?.kind).toBe('xbridgesPort');
    expect(byId('sim:xb/global/pid/$param/kp')).toEqual({ id: 'sim:xb/global/pid/$param/kp', name: 'ac_motor_controller.kp', kind: 'xbridgesParameter' });
    expect(byId('sim:xb/global/pid/$param/ki')).toBeDefined();
  });

  it('reads state-embedded X-Bridges models in the persisted shape, without listing port arrays as parameters', () => {
    expect(byId('sim:xb/state%3As2/g/u')?.name).toBe('Gain.u');
    expect(byId('sim:xb/state%3As2/g/y')?.kind).toBe('xbridgesPort');
    expect(byId('sim:xb/state%3As2/g/$param/gain')?.name).toBe('Gain.gain');
    expect(byId('sim:xb/state%3As2/g/$param/inputs')).toBeUndefined();
    expect(byId('sim:xb/state%3As2/g/$param/outputs')).toBeUndefined();
  });

  it('lists V-Lab ports from the library with quantity and unit on signal outputs', () => {
    expect(byId('sim:vlab/global/vs1')).toEqual({ id: 'sim:vlab/global/vs1', name: 'Supply sense', kind: 'vlabBlock' });
    expect(byId('sim:vlab/global/vs1/v')).toEqual({ id: 'sim:vlab/global/vs1/v', name: 'Supply sense.V — voltage [V]', kind: 'vlabPort' });
    expect(byId('sim:vlab/global/vs1/p')?.name).toBe('Supply sense.+');
  });

  it('falls back to the library block name and labels parameters with their unit', () => {
    expect(byId('sim:vlab/global/r1')?.name).toBe('Resistor');
    expect(byId('sim:vlab/global/r1/$param/R')).toEqual({ id: 'sim:vlab/global/r1/$param/R', name: 'Resistor.Resistance [Ω]', kind: 'vlabParameter' });
    expect(byId('sim:vlab/global/vs1/$param/R_int')?.kind).toBe('vlabParameter');
  });

  it('produces unique ids and tolerates missing sources', () => {
    const all = buildSimExternalElements(sources);
    expect(new Set(all.map(e => e.id)).size).toBe(all.length);
    expect(buildSimExternalElements({})).toEqual([]);
  });
});
