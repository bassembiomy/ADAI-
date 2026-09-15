import { describe, expect, it } from 'vitest';
import { VLAB_LIBRARY } from '../../utils/vlabLibrary';
import { DAEAssembler } from './DAEAssembler';
import { VLAB_COMPONENT_DEFINITIONS } from './vlabComponentDefinitions';
import { blockEquations } from './vlabEquations';

const findBlock = (id: string) => {
  for (const domain of VLAB_LIBRARY) {
    const block = domain.blocks.find(candidate => candidate.id === id);
    if (block) return block;
  }
  throw new Error(`Missing V-Lab block: ${id}`);
};

describe('steam generator and nozzle hydraulic ports', () => {
  it('exposes p and n hydraulic ports while retaining the generator heat input', () => {
    const generatorPorts = findBlock('steam_generator_fluid').ports;
    const nozzlePorts = findBlock('steam_nozzle').ports;

    expect(generatorPorts.map(port => port.id)).toEqual(expect.arrayContaining(['p', 'n', 'q_in']));
    expect(nozzlePorts.map(port => port.id)).toEqual(expect.arrayContaining(['p', 'n']));
  });

  it('implements the ideal steam-generator heat-to-mass-flow equation', () => {
    const hFg = (2257 - 2.175 * ((200000 - 101325) / 3600)) * 1000;
    const residual = blockEquations.steam_generator_fluid({
      across: [200000, 101325, 1000],
      dAcross: [],
      branch: [1000 / hFg],
      dBranch: [],
      state: [],
      dState: [],
      ctx: {} as any,
      params: { Q: 1000 },
      ports: ['p', 'n', 'q_in'],
      nodeId: 'generator'
    });

    expect(residual[0]).toBeCloseTo(0, 12);
    expect(blockEquations.steam_generator_fluid({
      across: [200000, 101325, 1000],
      dAcross: [],
      branch: [0],
      dBranch: [],
      state: [],
      dState: [],
      ctx: {} as any,
      params: { Q: 1000 },
      ports: ['p', 'n', 'q_in'],
      nodeId: 'generator'
    })[0]).toBeLessThan(0);
  });

  it('assembles generator p and n into the signed mass-flow topology', () => {
    const system = new DAEAssembler().assemble([
      { id: 'generator', type: 'steam_generator_fluid', position: { x: 0, y: 0 }, data: { type: 'steam_generator_fluid' } } as any,
      { id: 'resistance', type: 'fluid_resistance', position: { x: 100, y: 0 }, data: { type: 'fluid_resistance' } } as any
    ], [
      { id: 'p-connection', source: 'generator', sourceHandle: 'p', target: 'resistance', targetHandle: 'p' },
      { id: 'n-connection', source: 'generator', sourceHandle: 'n', target: 'resistance', targetHandle: 'n' }
    ] as any);

    const generator = system.components.find(component => component.blockId === 'generator');
    const massFlowBranch = system.variableNames.findIndex(name => name === 'generator_branch_mass_flow');
    const topologySigns = system.kirchhoffNodes
      .filter(node => node.throughIndices.includes(massFlowBranch))
      .flatMap(node => node.signs[node.throughIndices.indexOf(massFlowBranch)]);

    expect(generator?.portNodeMap.has('p')).toBe(true);
    expect(generator?.portNodeMap.has('n')).toBe(true);
    expect(topologySigns).toEqual(expect.arrayContaining([-1, 1]));
  });

  it('uses downstream pressure for nozzle flow and blocks reverse pressure flow', () => {
    const args = {
      dAcross: [],
      branch: [0],
      dBranch: [],
      state: [],
      dState: [],
      ctx: {} as any,
      params: { Cd: 0.5, d: 0.0005 },
      ports: ['p', 'n'],
      nodeId: 'nozzle'
    };

    expect(blockEquations.steam_nozzle({ ...args, across: [200000, 101325] })[0]).toBeLessThan(0);
    expect(blockEquations.steam_nozzle({ ...args, across: [101325, 200000] })[0]).toBe(0);
  });

  it('assembles steam hydraulic branch orientation from p to n', () => {
    const system = new DAEAssembler().assemble([
      { id: 'nozzle', type: 'steam_nozzle', position: { x: 0, y: 0 }, data: { type: 'steam_nozzle' } } as any,
      { id: 'resistance', type: 'fluid_resistance', position: { x: 100, y: 0 }, data: { type: 'fluid_resistance' } } as any
    ], [
      { id: 'p-connection', source: 'nozzle', sourceHandle: 'p', target: 'resistance', targetHandle: 'p' },
      { id: 'n-connection', source: 'nozzle', sourceHandle: 'n', target: 'resistance', targetHandle: 'n' }
    ] as any);

    const pNode = system.kirchhoffNodes.find(node => node.signs.includes(-1));
    const nNode = system.kirchhoffNodes.find(node => node.signs.includes(1));

    expect(pNode).toBeDefined();
    expect(nNode).toBeDefined();
    expect(system.components.find(component => component.blockId === 'nozzle')?.portNodeMap.has('p')).toBe(true);
    expect(system.components.find(component => component.blockId === 'nozzle')?.portNodeMap.has('n')).toBe(true);
  });

  it('displays the implemented two-port nozzle equation in both V-Lab definitions', () => {
    const equation = 'mdot = Cd*A*sqrt(2*rho*max(Pp-Pn,0))';

    expect(VLAB_COMPONENT_DEFINITIONS.steam_nozzle.equations).toContain(equation);
    expect(findBlock('steam_nozzle').equation).toBe(equation);
    expect(findBlock('steam_nozzle').description).toContain('downstream pressure');
  });

  it('uses the declared ctrl port index for the controlled pressure source', () => {
    expect(blockEquations.ctrl_pressure_source({
      across: [101325, 200000],
      dAcross: [],
      branch: [0],
      dBranch: [],
      state: [],
      dState: [],
      ctx: {} as any,
      params: {},
      ports: ['p', 'ctrl'],
      nodeId: 'source'
    })).toEqual([-98675]);
  });
});
