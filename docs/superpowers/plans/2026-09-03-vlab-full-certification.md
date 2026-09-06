# V-Lab Full Certification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one data-driven Vitest gate that certifies every live V-Lab domain, block, port, equation factory, and representative connected physical model.

**Architecture:** A single master test derives its inventory from `VLAB_LIBRARY`, accumulates domain/block-specific diagnostics, and asserts once per certification layer. It directly exercises `blockEquations` for every block and reuses `VLabPhysicsEngine` for connected reference systems, while an npm script provides the user-facing entry point.

**Tech Stack:** TypeScript 5.4, Vitest 4, React Flow `Node`/`Edge` model objects, V-Lab `DAEAssembler`, `VLabPhysicsEngine`, and existing validation contracts.

## Global Constraints

- Discover domains and blocks from `VLAB_LIBRARY`; never hard-code the current 242-block count.
- Create one user-facing master file at `src/engine/vlab/vlab_full_certification.test.ts`.
- Validate the real `VLabPort` contract: `id`, `pos`, optional `label`, and optional `domain`; do not invent a direction field.
- Visit every live block in the catalog, and report failures with domain, block ID, phase, and observed defect.
- Do not catch and ignore exceptions; convert them into certification issues.
- Require equation results to be finite, deterministic, dimensionally stable, and input-immutable under nominal and boundary cases.
- Use explicit allowlists only for documented compatibility aliases and structural zero-residual blocks.
- Keep connected-model benchmarks independent from the per-block equation sweep.
- Limit production changes to defects demonstrated by the new gate.
- Preserve the existing V-Lab regression suite and TypeScript build.

---

## File Structure

- Create `src/engine/vlab/vlab_full_certification.test.ts`: inventory helpers, issue formatting, catalog checks, port checks, equation sweeps, independent mathematical reference cases, and connected-domain cases.
- Modify `package.json`: add the `test:vlab:full` command beside the existing V-Lab scripts.
- Modify `src/engine/vlab/vlabEquations.ts` only if a new failing assertion proves a factory defect. No speculative equation refactoring is permitted.
- Modify `src/utils/vlabLibrary.ts` only if a new failing assertion proves invalid catalog or port metadata. Intentional empty units for dimensionless/text controls remain valid.

### Task 1: Catalog inventory and actionable diagnostics

**Files:**
- Create: `src/engine/vlab/vlab_full_certification.test.ts`
- Test: `src/engine/vlab/vlab_full_certification.test.ts`

**Interfaces:**
- Consumes: `VLAB_LIBRARY`, `blockEquations`, `VLAB_VALIDATION_CONTRACTS`.
- Produces: `CatalogEntry`, `CertificationIssue`, `formatIssues()`, `collectCatalogIssues()`, and the catalog-integrity test used by later tasks.

- [ ] **Step 1: Write the failing catalog test**

Create the file with imports, types, live inventory, and a test that refers to the not-yet-defined collector:

```ts
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

describe('V-Lab full certification', () => {
  it('certifies the complete live catalog in both directions', () => {
    const issues = collectCatalogIssues();
    expect(issues, formatIssues(issues)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the file and confirm the RED state**

Run:

```powershell
npx vitest run src/engine/vlab/vlab_full_certification.test.ts --reporter=verbose
```

Expected: FAIL during transformation because `collectCatalogIssues` and `formatIssues` are not defined.

- [ ] **Step 3: Implement the inventory collector**

Insert these helpers above the `describe` block:

```ts
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
```

- [ ] **Step 4: Run the catalog test and resolve only reported catalog defects**

Run the same Vitest command. Expected: PASS. If the live catalog changed after this plan was written, use the complete diagnostic list to correct the named catalog entries; do not weaken an assertion or add an alias without verifying that it is a real compatibility name used by the application.

- [ ] **Step 5: Commit the catalog gate**

```powershell
git add src/engine/vlab/vlab_full_certification.test.ts src/utils/vlabLibrary.ts
git commit -m "test: add V-Lab catalog certification gate"
```

Expected: one commit containing the master file and only proven catalog metadata corrections. If Git remains unavailable, record the intended commit message and continue without deleting or rewriting user changes.

### Task 2: Port and DAE assembly certification

**Files:**
- Modify: `src/engine/vlab/vlab_full_certification.test.ts`
- Test: `src/engine/vlab/vlab_full_certification.test.ts`

**Interfaces:**
- Consumes: `inventory`, `DAEAssembler`, and the real `VLabPort` schema.
- Produces: `collectPortIssues()` and a per-block port/assembly gate.

- [ ] **Step 1: Add the failing port test**

Add inside the master `describe` block:

```ts
it('certifies every declared port and its DAE assembly contract', () => {
  const issues = collectPortIssues();
  expect(issues, formatIssues(issues)).toEqual([]);
});
```

- [ ] **Step 2: Run the focused test and confirm RED**

```powershell
npx vitest run src/engine/vlab/vlab_full_certification.test.ts -t "every declared port" --reporter=verbose
```

Expected: FAIL during transformation because `collectPortIssues` is not defined.

- [ ] **Step 3: Implement static port and assembly checks**

Add above `describe`:

```ts
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
```

- [ ] **Step 4: Run the port gate and keep it green**

Run the focused command again. Expected: PASS for all live block declarations. Any failure must name the exact block and port; repair the declared metadata or assembler handling instead of adding an unexplained exemption.

- [ ] **Step 5: Commit the port gate**

```powershell
git add src/engine/vlab/vlab_full_certification.test.ts src/utils/vlabLibrary.ts src/engine/vlab/DAEAssembler.ts
git commit -m "test: certify V-Lab ports and assembly"
```

### Task 3: Every-block equation execution and independent reference equations

**Files:**
- Modify: `src/engine/vlab/vlab_full_certification.test.ts`
- Modify when proven necessary: `src/engine/vlab/vlabEquations.ts`
- Test: `src/engine/vlab/vlab_full_certification.test.ts`

**Interfaces:**
- Consumes: `BlockEquationArgs`, every entry in `blockEquations`, and nominal/boundary parameters from `VLAB_VALIDATION_CONTRACTS`.
- Produces: `collectEquationIssues()`, `expectNear()`, and explicit family reference cases.

- [ ] **Step 1: Add failing equation sweep and reference tests**

Add inside `describe`:

```ts
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
```

- [ ] **Step 2: Run and confirm RED**

```powershell
npx vitest run src/engine/vlab/vlab_full_certification.test.ts -t "equation|governing" --reporter=verbose
```

Expected: FAIL during transformation because `collectEquationIssues`, `makeEquationArgs`, and `expectNear` are undefined.

- [ ] **Step 3: Implement deterministic equation inputs and sweep**

Add above `describe`:

```ts
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
```

- [ ] **Step 4: Repair proven equation defects one at a time**

Run the focused tests. For each named failure, keep the failing block case, make the smallest change to that factory in `vlabEquations.ts`, rerun the single test, then rerun both equation tests. Do not suppress exceptions, replace non-finite output with zero, or add non-structural blocks to `ZERO_RESIDUAL_FACTORIES`.

Expected final output: both equation tests PASS and the issue array is empty.

- [ ] **Step 5: Commit the equation gate and proven fixes**

```powershell
git add src/engine/vlab/vlab_full_certification.test.ts src/engine/vlab/vlabEquations.ts
git commit -m "test: certify every V-Lab equation factory"
```

### Task 4: Connected-domain readiness and user command

**Files:**
- Modify: `src/engine/vlab/vlab_full_certification.test.ts`
- Modify: `package.json`
- Test: `src/engine/vlab/vlab_full_certification.test.ts`

**Interfaces:**
- Consumes: `VLabPhysicsEngine`, live block metadata, and React Flow `Node`/`Edge` contracts.
- Produces: connected electrical, translational, rotational, thermal, fluid, gas, magnetic, signal/control, and electromechanical checks plus `npm run test:vlab:full`.

- [ ] **Step 1: Add a failing connected-case test**

Add inside `describe`:

```ts
it('runs a finite connected reference model for every behavior group', { timeout: 120_000 }, () => {
  const issues = collectConnectedIssues();
  expect(issues, formatIssues(issues)).toEqual([]);
});
```

- [ ] **Step 2: Confirm RED**

```powershell
npx vitest run src/engine/vlab/vlab_full_certification.test.ts -t "connected reference" --reporter=verbose
```

Expected: FAIL during transformation because `collectConnectedIssues` is undefined.

- [ ] **Step 3: Implement representative connected models**

Add these helpers and cases above `describe`:

```ts
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
    edges: [makeEdge('e1', 'src', 'r', 'p', 'p'), makeEdge('e2', 'r', 'g', 'n', 'gnd'), makeEdge('e3', 'src', 'g', 'n', 'gnd')],
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
    nodes: [makeNode('src', 'temperature_source', { T: 350 }), makeNode('c', 'conductive_heat', { k: 2 }), makeNode('ref', 'thermal_ref')],
    edges: [makeEdge('e1', 'src', 'c', 'a', 'a'), makeEdge('e2', 'c', 'ref', 'b', 'a')],
  },
  {
    name: 'fluid', dt: 0.005, steps: 20,
    nodes: [makeNode('src', 'pressure_source', { P: 106325 }), makeNode('pipe', 'pipe_restriction', { R: 100000 }), makeNode('ref', 'fluid_ref')],
    edges: [makeEdge('e1', 'src', 'pipe', 'p', 'p'), makeEdge('e2', 'pipe', 'ref', 'n', 'gnd')],
  },
  {
    name: 'gas', dt: 0.002, steps: 20,
    nodes: [makeNode('src', 'gas_pressure_source', { P: 200000 }), makeNode('r', 'gas_resistance', { R: 50000 }), makeNode('ref', 'gas_ref')],
    edges: [makeEdge('e1', 'src', 'r', 'b', 'a'), makeEdge('e2', 'r', 'ref', 'b', 'g')],
  },
  {
    name: 'magnetic', dt: 0.001, steps: 20,
    nodes: [makeNode('src', 'mmf_source', { Ni: 500 }), makeNode('core', 'reluctance', { R: 1000000 }), makeNode('ref', 'mag_ref')],
    edges: [makeEdge('e1', 'src', 'core', 'p', 'p'), makeEdge('e2', 'core', 'ref', 'n', 'gnd')],
  },
  {
    name: 'signal-control', dt: 0.002, steps: 20,
    nodes: [makeNode('src', 'ps_constant', { value: 3 }), makeNode('gain', 'ps_gain', { gain: 2 }), makeNode('scope', 'scope')],
    edges: [makeEdge('e1', 'src', 'gain', 'y', 'in'), makeEdge('e2', 'gain', 'scope', 'out', 'in')],
  },
  {
    name: 'electromechanical', dt: 0.001, steps: 20,
    nodes: [makeNode('src', 'dc_voltage', { V: 24 }), makeNode('motor', 'dc_motor', { Ra: 2, La: 0.005, Kt: 0.1, Ke: 0.1, J: 0.01, b: 0.001 }), makeNode('g', 'ground'), makeNode('ref', 'rot_ref')],
    edges: [makeEdge('e1', 'src', 'motor', 'p', 'p_elec'), makeEdge('e2', 'motor', 'g', 'n_elec', 'gnd'), makeEdge('e3', 'motor', 'ref', 'n_mech', 'gnd')],
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
```

- [ ] **Step 4: Add the user-facing npm command**

Insert beside the other V-Lab scripts in `package.json`:

```json
"test:vlab:full": "vitest run src/engine/vlab/vlab_full_certification.test.ts --reporter=verbose",
```

- [ ] **Step 5: Run the connected case and full master gate**

```powershell
npx vitest run src/engine/vlab/vlab_full_certification.test.ts -t "connected reference" --reporter=verbose
npm run test:vlab:full
```

Expected: the connected test passes for all nine behavior groups, then all five master tests pass with no certification issues.

- [ ] **Step 6: Commit the connected gate and npm entry point**

```powershell
git add src/engine/vlab/vlab_full_certification.test.ts package.json
git commit -m "test: add full V-Lab certification command"
```

### Task 5: Full regression and completion evidence

**Files:**
- Verify: `src/engine/vlab/vlab_full_certification.test.ts`
- Verify: `package.json`
- Verify: any production files changed in Tasks 1–4

**Interfaces:**
- Consumes: completed master gate and existing repository test/build commands.
- Produces: fresh evidence that the deliverable is user-ready.

- [ ] **Step 1: Run the dedicated certification command**

```powershell
npm run test:vlab:full
```

Expected: exit code 0; five master tests pass; no issue list is printed.

- [ ] **Step 2: Run the existing V-Lab regression suite**

```powershell
npm run test:vlab
```

Expected: exit code 0 with all existing V-Lab regression tests passing.

- [ ] **Step 3: Run connected and all-block regression suites**

```powershell
npm run test:vlab:connected
npm run test:vlab:all-blocks
```

Expected: both commands exit 0. Solver warnings must be reviewed; an exception swallowed by a harness is not evidence of connected-model success.

- [ ] **Step 4: Run TypeScript verification**

```powershell
npx tsc --noEmit
```

Expected: exit code 0 and no TypeScript diagnostics.

- [ ] **Step 5: Review the final diff and requirement coverage**

```powershell
git diff --check
git diff -- src/engine/vlab/vlab_full_certification.test.ts package.json src/engine/vlab/vlabEquations.ts src/utils/vlabLibrary.ts
```

Confirm from the diff and fresh command output that catalog, ports, equations, references, all nine connected behavior groups, the npm command, regressions, and compilation are covered. If Git is unavailable, use `Get-Content` on the changed files and report that whitespace/diff verification could not be performed.

- [ ] **Step 6: Create the final commit**

```powershell
git add src/engine/vlab/vlab_full_certification.test.ts package.json src/engine/vlab/vlabEquations.ts src/utils/vlabLibrary.ts
git commit -m "test: certify complete V-Lab readiness"
```

Expected: a clean final commit containing the full gate and only demonstrated fixes. Omit unchanged production paths from staging.
