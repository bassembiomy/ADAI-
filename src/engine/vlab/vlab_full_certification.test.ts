import { describe, expect, it } from 'vitest';
import type { Edge, Node } from '@xyflow/react';
import { VLAB_LIBRARY, type VLabBlock } from '../../utils/vlabLibrary';
import { DAEAssembler } from './DAEAssembler';
import { blockEquations, type BlockEquationArgs } from './vlabEquations';
import { VLabPhysicsEngine } from './vlabPhysics';
import { VLAB_VALIDATION_CONTRACTS } from './vlabValidationContracts';

interface CatalogEntry {
  domain: string;
  block: VLabBlock;
}

interface CertificationIssue {
  domain: string;
  blockId: string;
  phase: 'catalog' | 'ports' | 'equation' | 'reference' | 'connected';
  message: string;
}

const inventory: CatalogEntry[] = VLAB_LIBRARY.flatMap((domain) =>
  domain.blocks.map((block) => ({ domain: domain.type, block })),
);

const COMPATIBILITY_FACTORY_ALIASES = new Set([
  'Subsystem',
  'Inport',
  'Outport',
  'heat_sensor',
  'vfd_controller',
]);

const issue = (
  domain: string,
  blockId: string,
  phase: CertificationIssue['phase'],
  message: string,
): CertificationIssue => ({ domain, blockId, phase, message });

const formatIssues = (issues: CertificationIssue[]): string =>
  issues.length === 0
    ? 'No certification issues.'
    : `V-Lab certification found ${issues.length} issue(s):\n${issues
        .map((item) => `- ${item.domain}/${item.blockId} [${item.phase}]: ${item.message}`)
        .join('\n')}`;

const isValidParameterValue = (value: number | string): boolean =>
  typeof value === 'number' ? Number.isFinite(value) : value.trim().length > 0;

const collectCatalogIssues = (): CertificationIssue[] => {
  const issues: CertificationIssue[] = [];
  const domainNames = new Set<string>();
  const blockIds = new Set<string>();

  for (const domain of VLAB_LIBRARY) {
    if (!domain.type.trim()) issues.push(issue('(empty)', '(domain)', 'catalog', 'domain name is empty'));
    if (domainNames.has(domain.type)) issues.push(issue(domain.type, '(domain)', 'catalog', 'duplicate domain name'));
    if (domain.blocks.length === 0) issues.push(issue(domain.type, '(domain)', 'catalog', 'domain contains no blocks'));
    domainNames.add(domain.type);

    for (const block of domain.blocks) {
      if (!block.id.trim()) issues.push(issue(domain.type, '(empty)', 'catalog', 'block ID is empty'));
      if (blockIds.has(block.id)) issues.push(issue(domain.type, block.id, 'catalog', 'duplicate global block ID'));
      blockIds.add(block.id);

      for (const [field, value] of Object.entries({
        name: block.name,
        icon: block.icon,
        color: block.color,
        equation: block.equation,
        description: block.description,
      })) {
        if (typeof value !== 'string' || value.trim().length === 0) {
          issues.push(issue(domain.type, block.id, 'catalog', `${field} is empty`));
        }
      }

      if (!blockEquations[block.id]) issues.push(issue(domain.type, block.id, 'catalog', 'equation factory is missing'));
      if (!VLAB_VALIDATION_CONTRACTS[block.id]) issues.push(issue(domain.type, block.id, 'catalog', 'validation contract is missing'));

      for (const [name, parameter] of Object.entries(block.params)) {
        if (!parameter.label.trim()) issues.push(issue(domain.type, block.id, 'catalog', `parameter ${name} has no label`));
        if (typeof parameter.unit !== 'string') issues.push(issue(domain.type, block.id, 'catalog', `parameter ${name} unit is not a string`));
        if (!isValidParameterValue(parameter.value)) issues.push(issue(domain.type, block.id, 'catalog', `parameter ${name} has an invalid value`));
      }
    }
  }

  for (const factoryId of Object.keys(blockEquations)) {
    if (!blockIds.has(factoryId) && !COMPATIBILITY_FACTORY_ALIASES.has(factoryId)) {
      issues.push(issue('(registry)', factoryId, 'catalog', 'orphan equation factory'));
    }
  }

  for (const contractId of Object.keys(VLAB_VALIDATION_CONTRACTS)) {
    if (!blockIds.has(contractId)) issues.push(issue('(registry)', contractId, 'catalog', 'orphan validation contract'));
  }

  return issues;
};

const VALID_PORT_POSITIONS = new Set(['left', 'right', 'top', 'bottom']);
const VALID_PORT_DOMAINS = new Set([
  'Electrical',
  'Fluid',
  'Physical',
  'Rotational',
  'Thermal',
  'Translational',
]);
const ZERO_PORT_BLOCKS = new Set(['gas_properties', 'ma_properties', 'subsystem', 'doe_custom']);

const collectPortIssues = (): CertificationIssue[] => {
  const issues: CertificationIssue[] = [];
  const assembler = new DAEAssembler();

  for (const { domain, block } of inventory) {
    const portIds = new Set<string>();
    if (block.ports.length === 0 && !ZERO_PORT_BLOCKS.has(block.id)) {
      issues.push(issue(domain, block.id, 'ports', 'unexpected zero-port block'));
    }

    for (const port of block.ports) {
      if (!port.id.trim()) issues.push(issue(domain, block.id, 'ports', 'empty port ID'));
      if (portIds.has(port.id)) issues.push(issue(domain, block.id, 'ports', `duplicate port ID "${port.id}"`));
      if (!VALID_PORT_POSITIONS.has(port.pos)) issues.push(issue(domain, block.id, 'ports', `invalid position "${port.pos}"`));
      if (port.label !== undefined && !port.label.trim()) issues.push(issue(domain, block.id, 'ports', `port "${port.id}" has an empty label`));
      if (port.domain !== undefined && !VALID_PORT_DOMAINS.has(port.domain)) {
        issues.push(issue(domain, block.id, 'ports', `port "${port.id}" has unknown domain "${port.domain}"`));
      }
      portIds.add(port.id);
    }

    const node: Node = {
      id: `cert-${block.id}`,
      type: 'default',
      position: { x: 0, y: 0 },
      data: { type: block.id, params: block.params, ports: block.ports, domain },
    } as Node;

    try {
      const system = assembler.assemble([node], []);
      if (!Number.isInteger(system.systemSize) || system.systemSize < 0) {
        issues.push(issue(domain, block.id, 'ports', `invalid assembled system size ${system.systemSize}`));
      }
      if (system.variableNames.length !== system.systemSize) {
        issues.push(issue(domain, block.id, 'ports', 'variable-name count does not match system size'));
      }
      if (system.isDifferentialState.length !== system.systemSize) {
        issues.push(issue(domain, block.id, 'ports', 'differential-state mask does not match system size'));
      }
    } catch (error) {
      issues.push(issue(domain, block.id, 'ports', `assembly threw: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  return issues;
};

const ZERO_RESIDUAL_FACTORIES = new Set([
  'ground', 'delta_ref', 'open_circuit', 'subsystem', 'inport', 'outport', 'rot_ref', 'trans_ref',
  'thermal_ref', 'ma_ref', 'gas_ref', 'gas_properties', 'mag_ref', 'world_frame',
  'ref_frame', 'ps_terminator', 'fluid_ref', 'scope', 'solver_config', 'mech_config',
  'belt_properties', 'ma_properties',
]);

const numericParams = (block: VLabBlock): Record<string, number | string> =>
  Object.fromEntries(Object.entries(block.params).map(([name, parameter]) => [name, parameter.value]));

const makeEquationArgs = (ports: string[], params: Record<string, unknown> = {}): BlockEquationArgs => ({
  across: Array.from({ length: Math.max(16, ports.length + 4) }, (_, index) => 1 + index * 0.25),
  dAcross: Array.from({ length: Math.max(16, ports.length + 4) }, (_, index) => 0.1 + index * 0.01),
  branch: Array.from({ length: Math.max(16, ports.length + 4) }, (_, index) => 0.5 + index * 0.05),
  dBranch: Array.from({ length: Math.max(16, ports.length + 4) }, (_, index) => 0.2 + index * 0.02),
  state: Array.from({ length: 16 }, (_, index) => 0.25 + index * 0.01),
  dState: Array.from({ length: 16 }, (_, index) => 0.05 + index * 0.005),
  ctx: {
    dt: 1e-3,
    time: 0.125,
    parameters: {},
    prevStates: Array(16).fill(0.2),
    prevPrevStates: Array(16).fill(0.15),
    prevDt: 1e-3,
    order: 2,
    states: Array(16).fill(0.25),
    stateDerivatives: Array(16).fill(0.05),
  },
  params,
  ports,
  nodeId: 'full-certification-dut',
});

const cloneArgs = (args: BlockEquationArgs): BlockEquationArgs => structuredClone(args);

const immutableInputs = (args: BlockEquationArgs): string => JSON.stringify({
  across: args.across,
  dAcross: args.dAcross,
  branch: args.branch,
  dBranch: args.dBranch,
  state: args.state,
  dState: args.dState,
  params: args.params,
  ports: args.ports,
  nodeId: args.nodeId,
});

const expectNear = (actual: number, expected: number, abs = 1e-10, rel = 1e-8): void => {
  const tolerance = abs + rel * Math.max(Math.abs(actual), Math.abs(expected));
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance);
};

const collectEquationIssues = (): CertificationIssue[] => {
  const issues: CertificationIssue[] = [];

  for (const { domain, block } of inventory) {
    const factory = blockEquations[block.id];
    if (!factory) continue;
    const contract = VLAB_VALIDATION_CONTRACTS[block.id];
    const cases: Record<string, unknown>[] = [
      numericParams(block),
      ...(contract?.boundaryParameters ?? []),
    ];

    cases.forEach((params, caseIndex) => {
      const args = makeEquationArgs(block.ports.map((port) => port.id), params);
      const before = cloneArgs(args);
      const immutableBefore = immutableInputs(args);
      try {
        const first = factory(args);
        const second = factory(cloneArgs(before));
        if (!Array.isArray(first)) issues.push(issue(domain, block.id, 'equation', `case ${caseIndex} did not return an array`));
        else {
          if (!ZERO_RESIDUAL_FACTORIES.has(block.id) && first.length === 0) {
            issues.push(issue(domain, block.id, 'equation', `case ${caseIndex} returned no residuals`));
          }
          if (first.some((value) => !Number.isFinite(value))) {
            issues.push(issue(domain, block.id, 'equation', `case ${caseIndex} returned a non-finite residual`));
          }
          if (first.length !== second.length) {
            issues.push(issue(domain, block.id, 'equation', `case ${caseIndex} changed residual count`));
          } else if (!first.every((value, index) => Object.is(value, second[index]))) {
            issues.push(issue(domain, block.id, 'equation', `case ${caseIndex} is nondeterministic`));
          }
        }
        if (immutableInputs(args) !== immutableBefore) {
          issues.push(issue(domain, block.id, 'equation', `case ${caseIndex} mutated its inputs`));
        }
      } catch (error) {
        issues.push(issue(domain, block.id, 'equation', `case ${caseIndex} threw: ${error instanceof Error ? error.message : String(error)}`));
      }
    });
  }

  return issues;
};

const blockById = new Map(inventory.map(({ block }) => [block.id, block]));

const makeNode = (id: string, blockId: string, overrides: Record<string, number> = {}): Node => {
  const block = blockById.get(blockId);
  if (!block) throw new Error(`Unknown connected-case block ${blockId}`);
  const params = structuredClone(block.params);
  for (const [name, value] of Object.entries(overrides)) {
    params[name] = params[name] ? { ...params[name], value } : { value, unit: '1', label: name };
  }
  const domain = inventory.find((entry) => entry.block.id === blockId)?.domain;
  return { id, type: 'default', position: { x: 0, y: 0 }, data: { type: blockId, params, ports: block.ports, domain } } as Node;
};

const makeEdge = (
  id: string,
  source: string,
  target: string,
  sourceHandle: string,
  targetHandle: string,
): Edge => ({ id, source, target, sourceHandle, targetHandle });

interface ConnectedCase {
  name: string;
  nodes: Node[];
  edges: Edge[];
  dt: number;
  steps: number;
}

const connectedCases = (): ConnectedCase[] => [
  {
    name: 'electrical', dt: 1e-4, steps: 20,
    nodes: [makeNode('src', 'dc_voltage', { V: 12 }), makeNode('r', 'resistor', { R: 100 }), makeNode('g', 'ground')],
    edges: [makeEdge('e1', 'src', 'r', 'p', 'p'), makeEdge('e2', 'r', 'g', 'n', 'a'), makeEdge('e3', 'src', 'g', 'n', 'a')],
  },
  {
    name: 'translational', dt: 1e-3, steps: 20,
    nodes: [makeNode('src', 'force_source', { F: 10 }), makeNode('m', 'mass', { m: 1 }), makeNode('d', 'trans_damper', { b: 5 }), makeNode('ref', 'trans_ref')],
    edges: [makeEdge('e1', 'src', 'm', 'a', 'p'), makeEdge('e2', 'src', 'ref', 'b', 'p'), makeEdge('e3', 'm', 'd', 'p', 'r'), makeEdge('e4', 'd', 'ref', 'c', 'p')],
  },
  {
    name: 'rotational', dt: 1e-3, steps: 20,
    nodes: [makeNode('src', 'torque_source', { T: 5 }), makeNode('j', 'inertia', { J: 0.01 }), makeNode('d', 'rot_damper', { b: 0.1 }), makeNode('ref', 'rot_ref')],
    edges: [makeEdge('e1', 'src', 'j', 'r', 'r'), makeEdge('e2', 'src', 'ref', 'c', 'r'), makeEdge('e3', 'j', 'd', 'r', 'r'), makeEdge('e4', 'd', 'ref', 'c', 'r')],
  },
  {
    name: 'thermal', dt: 0.01, steps: 20,
    nodes: [makeNode('src', 'temp_src', { T: 350 }), makeNode('c', 'conductive_heat', { k: 2 }), makeNode('ref', 'thermal_ref')],
    edges: [makeEdge('e1', 'src', 'c', 'a', 'a'), makeEdge('e2', 'c', 'ref', 'b', 'a')],
  },
  {
    name: 'fluid', dt: 0.005, steps: 20,
    nodes: [makeNode('src', 'pressure_source', { P: 106325 }), makeNode('pipe', 'fluid_resistance', { Rf: 100000 }), makeNode('ref', 'fluid_ref')],
    edges: [makeEdge('e1', 'src', 'pipe', 'p', 'p'), makeEdge('e2', 'pipe', 'ref', 'n', 'p')],
  },
  {
    name: 'gas', dt: 0.002, steps: 20,
    nodes: [makeNode('src', 'gas_pressure_source', { P: 200000 }), makeNode('r', 'gas_resistance', { k: 2e-5 }), makeNode('ref', 'gas_ref')],
    edges: [makeEdge('e1', 'src', 'r', 'b', 'a'), makeEdge('e2', 'r', 'ref', 'b', 'g')],
  },
  {
    name: 'magnetic', dt: 0.001, steps: 20,
    nodes: [makeNode('src', 'mag_mmf_source', { MMF: 500 }), makeNode('core', 'reluctance', { R: 1000000 }), makeNode('ref', 'mag_ref')],
    edges: [makeEdge('e1', 'src', 'core', 's', 'n'), makeEdge('e2', 'core', 'ref', 's', 'n')],
  },
  {
    name: 'signal-control', dt: 0.002, steps: 20,
    nodes: [makeNode('src', 'ps_constant', { value: 3 }), makeNode('gain', 'ps_gain', { gain: 2 }), makeNode('scope', 'scope')],
    edges: [makeEdge('e1', 'src', 'gain', 'y', 'u'), makeEdge('e2', 'gain', 'scope', 'y', 'in1')],
  },
  {
    name: 'electromechanical', dt: 0.001, steps: 20,
    nodes: [makeNode('src', 'dc_voltage', { V: 24 }), makeNode('motor', 'dc_motor', { Ra: 2, La: 0.005, Ke: 0.1, J: 0.01 }), makeNode('g', 'ground'), makeNode('ref', 'rot_ref')],
    edges: [makeEdge('e1', 'src', 'motor', 'p', 'p'), makeEdge('e2', 'motor', 'g', 'n', 'a'), makeEdge('e3', 'motor', 'ref', 'r', 'r')],
  },
];

const collectConnectedIssues = (): CertificationIssue[] => {
  const issues: CertificationIssue[] = [];
  for (const connected of connectedCases()) {
    const engine = new VLabPhysicsEngine();
    let state: { x: number[] } | null = null;
    try {
      for (let step = 0; step < connected.steps; step += 1) {
        state = engine.simulateStep(connected.nodes, connected.edges, state as never, connected.dt);
        if (!state?.x.every(Number.isFinite)) {
          issues.push(issue(connected.name, '(model)', 'connected', `non-finite state at step ${step}`));
          break;
        }
      }
      if (!state || state.x.length === 0) issues.push(issue(connected.name, '(model)', 'connected', 'model produced no state vector'));
    } catch (error) {
      issues.push(issue(connected.name, '(model)', 'connected', `simulation threw: ${error instanceof Error ? error.message : String(error)}`));
    }
  }
  return issues;
};

describe('V-Lab full certification', () => {
  it('certifies the complete live catalog in both directions', () => {
    const issues = collectCatalogIssues();
    expect(issues, formatIssues(issues)).toEqual([]);
  });

  it('certifies every declared port and its DAE assembly contract', () => {
    const issues = collectPortIssues();
    expect(issues, formatIssues(issues)).toEqual([]);
  });

  it('executes every equation factory at nominal and boundary conditions', () => {
    const issues = collectEquationIssues();
    expect(issues, formatIssues(issues)).toEqual([]);
  });

  it('matches independent governing-equation reference points', () => {
    const args = makeEquationArgs(['p', 'n']);

    expectNear(blockEquations.resistor({ ...args, across: [12, 0], branch: [0.12], params: { R: 100 } })[0], 0);
    expectNear(blockEquations.capacitor({ ...args, dAcross: [2, 0], branch: [0.002], params: { C: 1e-3 } })[0], 0);
    expectNear(blockEquations.inductor({ ...args, across: [5, 0], dBranch: [5000], params: { L: 1e-3 } })[0], 0);
    expectNear(blockEquations.conductive_heat({ ...args, across: [350, 300], branch: [100], params: { k: 2 } })[0], 0);
    expectNear(blockEquations.gas_resistance({ ...args, across: [200000, 100000], branch: [2], params: { k: 2e-5 } })[0], 0);
    expectNear(blockEquations.reluctance({ ...args, across: [500, 0], branch: [5e-4], params: { R: 1e6 } })[0], 0);
    const springResiduals = blockEquations.trans_spring({
      ...args,
      across: [2, 0],
      branch: [10],
      state: [0.1],
      dState: [2],
      params: { k: 100 },
    });
    springResiduals.forEach((residual) => expectNear(residual, 0));
    expectNear(blockEquations.rot_damper({ ...args, across: [50, 0], branch: [5], params: { b: 0.1 } })[0], 0);
    expectNear(blockEquations.ps_gain({ ...args, across: [3], branch: [6], params: { gain: 2 } })[0], 0);
  });

  it('runs a finite connected reference model for every behavior group', { timeout: 120_000 }, () => {
    const issues = collectConnectedIssues();
    expect(issues, formatIssues(issues)).toEqual([]);
  });
});

