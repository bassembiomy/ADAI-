import { describe, it, expect } from 'vitest';
import { VLAB_LIBRARY } from '../../utils/vlabLibrary';
import { DAEAssembler } from './DAEAssembler';

describe('VLab Belt and Pulley Domain Definitions', () => {
  const findBlock = (id: string) => {
    for (const group of VLAB_LIBRARY) {
      const b = group.blocks.find(blk => blk.id === id);
      if (b) return b;
    }
    return undefined;
  };

  it('belt_properties has port p with domain BeltProperty at right', () => {
    const block = findBlock('belt_properties');
    expect(block).toBeDefined();
    expect(block!.ports).toEqual([
      { id: 'p', pos: 'right', label: 'P', domain: 'BeltProperty' }
    ]);
  });

  it('belt_end has translational mechanical ports, BeltProperty p, and Physical f measurement port', () => {
    const block = findBlock('belt_end');
    expect(block).toBeDefined();
    expect(block!.ports).toEqual([
      { id: 'r', pos: 'left', label: 'R', domain: 'Translational' },
      { id: 'e', pos: 'right', label: 'E', domain: 'Translational' },
      { id: 'p', pos: 'top', label: 'P', domain: 'BeltProperty' },
      { id: 'f', pos: 'bottom', label: 'F', domain: 'Physical' }
    ]);
  });

  it('belt_spool has rotational r, translational a, BeltProperty p, and Physical t measurement port', () => {
    const block = findBlock('belt_spool');
    expect(block).toBeDefined();
    expect(block!.ports).toEqual([
      { id: 'r', pos: 'left', label: 'R', domain: 'Rotational' },
      { id: 'a', pos: 'right', label: 'A', domain: 'Translational' },
      { id: 'p', pos: 'top', label: 'P', domain: 'BeltProperty' },
      { id: 't', pos: 'bottom', label: 'T', domain: 'Physical' }
    ]);
  });

  it('pulley has rotational r, translational a and b, BeltProperty p, and Physical t measurement port', () => {
    const block = findBlock('pulley');
    expect(block).toBeDefined();
    expect(block!.ports).toEqual([
      { id: 'r', pos: 'left', label: 'R', domain: 'Rotational' },
      { id: 'a', pos: 'right', label: 'A', domain: 'Translational' },
      { id: 'b', pos: 'right', label: 'B', domain: 'Translational' },
      { id: 'p', pos: 'top', label: 'P', domain: 'BeltProperty' },
      { id: 't', pos: 'bottom', label: 'T', domain: 'Physical' }
    ]);
  });

  it('injects belt properties only when port p is explicitly wired (no silent fallback)', () => {
    const assembler = new DAEAssembler();
    const nodes = [
      {
        id: 'bp1',
        type: 'default',
        position: { x: 0, y: 0 },
        data: {
          type: 'belt_properties',
          params: { density: 2.5, youngs: 5e8 },
          ports: [{ id: 'p' }]
        }
      },
      {
        id: 'be1',
        type: 'default',
        position: { x: 100, y: 0 },
        data: {
          type: 'belt_end',
          params: { stiffness: 1e5, length: 2, area: 0.002 },
          ports: [{ id: 'r' }, { id: 'e' }, { id: 'p' }, { id: 'f' }]
        }
      },
      {
        id: 'be_unwired',
        type: 'default',
        position: { x: 200, y: 0 },
        data: {
          type: 'belt_end',
          params: { stiffness: 1e5, length: 2, area: 0.002 },
          ports: [{ id: 'r' }, { id: 'e' }, { id: 'p' }, { id: 'f' }]
        }
      }
    ];

    // Wire bp1.p to be1.p
    const edges = [
      {
        id: 'e1',
        source: 'bp1',
        target: 'be1',
        sourceHandle: 'bp1_p',
        targetHandle: 'be1_p'
      }
    ];

    assembler.assemble(nodes as any, edges as any);

    // be1 should have injected properties
    const be1Params = (nodes[1].data as any).params;
    expect(be1Params.belt_density).toBe(2.5);
    expect(be1Params.belt_youngs).toBe(5e8);
    expect(be1Params.belt_properties_source).toBe('bp1');

    // be_unwired MUST NOT inherit properties from bp1 (no silent fallback)
    const unwiredParams = (nodes[2].data as any).params;
    expect(unwiredParams.belt_density).toBeUndefined();
    expect(unwiredParams.belt_youngs).toBeUndefined();
    expect(unwiredParams.belt_properties_source).toBeUndefined();
  });

  it('assembles measurement signal branches for Scope connections on belt_end, belt_spool, and pulley', () => {
    const assembler = new DAEAssembler();
    const nodes = [
      {
        id: 'be1',
        type: 'default',
        position: { x: 0, y: 0 },
        data: {
          type: 'belt_end',
          params: { stiffness: 1e5, length: 1, area: 0.001 },
          ports: [{ id: 'r' }, { id: 'e' }, { id: 'p' }, { id: 'f' }]
        }
      },
      {
        id: 'spool1',
        type: 'default',
        position: { x: 0, y: 100 },
        data: {
          type: 'belt_spool',
          params: { radius: 0.1, inertia: 0.01 },
          ports: [{ id: 'r' }, { id: 'a' }, { id: 'p' }, { id: 't' }]
        }
      },
      {
        id: 'pulley1',
        type: 'default',
        position: { x: 0, y: 200 },
        data: {
          type: 'pulley',
          params: { radius: 0.1, inertia: 0.01 },
          ports: [{ id: 'r' }, { id: 'a' }, { id: 'b' }, { id: 'p' }, { id: 't' }]
        }
      },
      {
        id: 'scope1',
        type: 'default',
        position: { x: 200, y: 0 },
        data: {
          type: 'scope',
          params: {},
          ports: [{ id: 'in' }]
        }
      },
      {
        id: 'scope2',
        type: 'default',
        position: { x: 200, y: 100 },
        data: {
          type: 'scope',
          params: {},
          ports: [{ id: 'in' }]
        }
      },
      {
        id: 'scope3',
        type: 'default',
        position: { x: 200, y: 200 },
        data: {
          type: 'scope',
          params: {},
          ports: [{ id: 'in' }]
        }
      }
    ];

    const edges = [
      { id: 'e_f', source: 'be1', target: 'scope1', sourceHandle: 'f', targetHandle: 'in' },
      { id: 'e_t1', source: 'spool1', target: 'scope2', sourceHandle: 't', targetHandle: 'in' },
      { id: 'e_t2', source: 'pulley1', target: 'scope3', sourceHandle: 't', targetHandle: 'in' }
    ];

    const system = assembler.assemble(nodes as any, edges as any);
    expect(system.variableNames).toContain('be1_branch_signal_f');
    expect(system.variableNames).toContain('spool1_branch_signal_t');
    expect(system.variableNames).toContain('pulley1_branch_signal_t');

    // Scopes should have mapped the measurement signal branch variables
    const fVarIdx = system.variableNames.indexOf('be1_branch_signal_f');
    const tSpoolVarIdx = system.variableNames.indexOf('spool1_branch_signal_t');
    const tPulleyVarIdx = system.variableNames.indexOf('pulley1_branch_signal_t');
    expect(system.scopeOutputs.get('scope1')).toEqual([fVarIdx]);
    expect(system.scopeOutputs.get('scope2')).toEqual([tSpoolVarIdx]);
    expect(system.scopeOutputs.get('scope3')).toEqual([tPulleyVarIdx]);

    // Residual evaluation should match systemSize without unhandled equation gaps
    const x = Array(system.systemSize).fill(0);
    const dx = Array(system.systemSize).fill(0);
    const ctx = {
      dt: 0.001,
      time: 0,
      parameters: {},
      prevStates: [],
      prevPrevStates: [],
      prevDt: 0.001,
      order: 1,
      states: [],
      stateDerivatives: []
    };
    const residuals = system.residuals(x, dx, ctx);
    expect(residuals.length).toBe(system.systemSize);

    // Verify numerical coupling of signal_f to physical force
    const forceVarIdx = system.variableNames.indexOf('be1_branch_force');
    x[forceVarIdx] = 120.0;
    x[fVarIdx] = 75.0;
    const resCoupled = system.residuals(x, dx, ctx);
    expect(resCoupled[fVarIdx]).toBeCloseTo(75.0 - 120.0);
  });
});


