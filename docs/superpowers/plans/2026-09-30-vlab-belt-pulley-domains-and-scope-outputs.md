# VLab Belt, Spool, and Pulley Domain Separation & Scope Outputs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct domain assignments (`BeltProperty`, `Translational`, `Rotational`) for belt and pulley components, add dedicated property port `p` and Scope measurement outputs (`f`, `t`), eliminate silent fallback material injection, and provide dynamic verification tests.

**Architecture:**
- Introduce `'BeltProperty'` domain to `vlabLibrary.ts` and certification validators.
- Redefine ports on `belt_properties` (`p`: `BeltProperty`), `belt_end` (`r`, `e`: `Translational`, `p`: `BeltProperty`, `f`: `Physical`), `belt_spool` (`r`: `Rotational`, `a`: `Translational`, `p`: `BeltProperty`, `t`: `Physical`), and `pulley` (`r`: `Rotational`, `a`, `b`: `Translational`, `p`: `BeltProperty`, `t`: `Physical`).
- Update `DAEAssembler.ts` to strictly inject material properties only when port `p` is explicitly wired to `belt_properties.p` (no global fallback), and generate measurement signal branches for `f` (force) and `t` (torque).
- Update `vlabEquations.ts` to couple measurement branches (`f` tension, `t` torque) and calculate dynamic behavior.
- Add comprehensive unit tests in `src/engine/vlab/vlab_belt_domains.test.ts`.

**Tech Stack:** TypeScript, React, ReactFlow, Vitest, DAE Physical Simulation Engine.

## Global Constraints
- Strictly avoid silent fallback: an unwired `belt_end`, `belt_spool`, or `pulley` must never inherit material parameters from an unattached `belt_properties` block.
- Exact port IDs and positions:
  - `belt_properties`: `p` (`BeltProperty`, right)
  - `belt_end`: `r` (`Translational`, left), `e` (`Translational`, right), `p` (`BeltProperty`, top), `f` (`Physical`, bottom)
  - `belt_spool`: `r` (`Rotational`, left), `a` (`Translational`, right), `p` (`BeltProperty`, top), `t` (`Physical`, bottom)
  - `pulley`: `r` (`Rotational`, left), `a` (`Translational`, right), `b` (`Translational`, right), `p` (`BeltProperty`, top), `t` (`Physical`, bottom)
- Preserve all existing components, equations, and simulation capabilities.

---

### Task 1: Update Port Definitions and Domain Specifications

**Files:**
- Modify: `src/utils/vlabLibrary.ts:6308-6445`
- Modify: `src/engine/vlab/vlabComponentDefinitions.ts:1140-1165`
- Modify: `src/engine/vlab/vlab_full_certification.test.ts:104-114`
- Test: `src/engine/vlab/vlab_belt_domains.test.ts`

**Interfaces:**
- Consumes: `VLAB_LIBRARY`, `VLAB_COMPONENT_DEFINITIONS`
- Produces: Correct port domains and positions for `belt_properties`, `belt_end`, `belt_spool`, and `pulley`.

- [ ] **Step 1: Write the failing unit test for port domain definitions**

Create `src/engine/vlab/vlab_belt_domains.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { VLAB_LIBRARY } from '../../utils/vlabLibrary';

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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/vlab/vlab_belt_domains.test.ts`
Expected: FAIL due to existing `Physical` domains and missing ports `p`, `f`, `t`.

- [ ] **Step 3: Update `vlabLibrary.ts`, `vlabComponentDefinitions.ts`, and certification whitelist**

In `src/utils/vlabLibrary.ts`:
Update `belt_properties` ports to `[{ id: 'p', pos: 'right', label: 'P', domain: 'BeltProperty' }]`.
Update `belt_end` ports to:
```json
[
  { "id": "r", "pos": "left", "label": "R", "domain": "Translational" },
  { "id": "e", "pos": "right", "label": "E", "domain": "Translational" },
  { "id": "p", "pos": "top", "label": "P", "domain": "BeltProperty" },
  { "id": "f", "pos": "bottom", "label": "F", "domain": "Physical" }
]
```
Update `belt_spool` ports to:
```json
[
  { "id": "r", "pos": "left", "label": "R", "domain": "Rotational" },
  { "id": "a", "pos": "right", "label": "A", "domain": "Translational" },
  { "id": "p", "pos": "top", "label": "P", "domain": "BeltProperty" },
  { "id": "t", "pos": "bottom", "label": "T", "domain": "Physical" }
]
```
Update `pulley` ports to:
```json
[
  { "id": "r", "pos": "left", "label": "R", "domain": "Rotational" },
  { "id": "a", "pos": "right", "label": "A", "domain": "Translational" },
  { "id": "b", "pos": "right", "label": "B", "domain": "Translational" },
  { "id": "p", "pos": "top", "label": "P", "domain": "BeltProperty" },
  { "id": "t", "pos": "bottom", "label": "T", "domain": "Physical" }
]
```

In `src/engine/vlab/vlab_full_certification.test.ts`:
Add `'BeltProperty'` to `VALID_PORT_DOMAINS`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/engine/vlab/vlab_belt_domains.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/vlabLibrary.ts src/engine/vlab/vlabComponentDefinitions.ts src/engine/vlab/vlab_full_certification.test.ts src/engine/vlab/vlab_belt_domains.test.ts
git commit -m "feat(vlab): update belt and pulley port domains and add p, f, t ports"
```

---

### Task 2: Strict Port P Wiring and Removal of Silent Fallback in DAEAssembler

**Files:**
- Modify: `src/engine/vlab/DAEAssembler.ts:729-767`
- Test: `src/engine/vlab/vlab_belt_domains.test.ts`

**Interfaces:**
- Consumes: Union-find network from `DAEAssembler`, `nodePorts`
- Produces: Strict property injection matching `nodeId_p === src.nodeId_p`; no injection when unwired.

- [ ] **Step 1: Write the failing test for strict property injection and no silent fallback**

Add tests to `src/engine/vlab/vlab_belt_domains.test.ts`:
```typescript
  it('injects belt properties only when port p is explicitly wired', () => {
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/vlab/vlab_belt_domains.test.ts`
Expected: FAIL because `be_unwired` currently inherits `bp1` properties via `beltMaterialSources[0]`.

- [ ] **Step 3: Refactor `injectBeltMaterial` in `DAEAssembler.ts`**

In `src/engine/vlab/DAEAssembler.ts`:
Replace lines 751-766:
```typescript
    const injectBeltMaterial = (nodeId: string, blockType: string, ports: string[], params: Record<string, any>) => {
      if (!BELT_CONSUMER_TYPES.has(blockType) || beltMaterialSources.length === 0) return;
      // Strictly check the dedicated property port 'p'
      const pRoot = uf.find(`${nodeId}_p`);
      const matchedSource = beltMaterialSources.find(s => s.root === pRoot);
      if (!matchedSource) {
        // Unwired to any belt_properties: strictly do NOT inject fallback
        return;
      }
      params.belt_density = matchedSource.density;
      params.belt_youngs = matchedSource.youngs;
      params.belt_properties_source = matchedSource.nodeId;
    };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/engine/vlab/vlab_belt_domains.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/engine/vlab/DAEAssembler.ts src/engine/vlab/vlab_belt_domains.test.ts
git commit -m "fix(vlab): enforce strict port p wiring for belt material without silent fallback"
```

---

### Task 3: Measurement Signal Branches and Equation Coupling in DAEAssembler & vlabEquations

**Files:**
- Modify: `src/engine/vlab/DAEAssembler.ts:518-530, 1040-1060`
- Modify: `src/engine/vlab/vlabEquations.ts:2640-2690`
- Test: `src/engine/vlab/vlab_belt_domains.test.ts`

**Interfaces:**
- Consumes: Node ports in `DAEAssembler`
- Produces: Output branches `signal_f` (belt_end) and `signal_t` (belt_spool, pulley); equation constraints for measurement signals.

- [ ] **Step 1: Write the failing test for Scope connection to measurement ports**

Add tests to `src/engine/vlab/vlab_belt_domains.test.ts`:
```typescript
  it('assembles measurement signal branches for Scope connections', () => {
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
        id: 'scope1',
        type: 'default',
        position: { x: 100, y: 0 },
        data: {
          type: 'scope',
          params: {},
          ports: [{ id: 'in' }]
        }
      }
    ];

    const edges = [
      {
        id: 'e_meas',
        source: 'be1',
        target: 'scope1',
        sourceHandle: 'be1_f',
        targetHandle: 'scope1_in'
      }
    ];

    const system = assembler.assemble(nodes as any, edges as any);
    expect(system.variableNames).toContain('be1_branch_signal_f');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/vlab/vlab_belt_domains.test.ts`
Expected: FAIL because `be1` does not yet declare `signal_f` branch when port `f` is present.

- [ ] **Step 3: Update `getComponentSpec` and equation factories**

In `src/engine/vlab/DAEAssembler.ts`:
1. In `getComponentSpec`:
```typescript
        case 'belt_end':
          branches.push({ name: 'force', ports: [{ id: 'r', sign: -1 }, { id: 'e', sign: 1 }] });
          if (ports.includes('f')) {
            branches.push({ name: 'signal_f', ports: [{ id: 'f', sign: 1 }] });
          }
          states.push('x');
          break;
        case 'belt_spool':
          branches.push({ name: 'torque', ports: [{ id: 'r', sign: -1 }] });
          branches.push({ name: 'force', ports: [{ id: 'a', sign: -1 }] });
          if (ports.includes('t')) {
            branches.push({ name: 'signal_t', ports: [{ id: 't', sign: 1 }] });
          }
          break;
        case 'pulley':
          branches.push({ name: 'torque', ports: [{ id: 'r', sign: -1 }] });
          branches.push({ name: 'force_a', ports: [{ id: 'a', sign: -1 }] });
          branches.push({ name: 'force_b', ports: [{ id: 'b', sign: -1 }] });
          if (ports.includes('t')) {
            branches.push({ name: 'signal_t', ports: [{ id: 't', sign: 1 }] });
          }
          break;
```
2. In the Scope/Sensor signal branch resolver:
Add `belt_end`, `belt_spool`, and `pulley`:
```typescript
              } else if (sourceType === 'belt_end') {
                matchingBranchIdx = sourceSpec.branches.findIndex(b => b.name === 'signal_f' || b.name === 'force');
              } else if (sourceType === 'belt_spool' || sourceType === 'pulley') {
                matchingBranchIdx = sourceSpec.branches.findIndex(b => b.name === 'signal_t' || b.name === 'torque');
```

In `src/engine/vlab/vlabEquations.ts`:
Update equations for `belt_end`, `belt_spool`, and `pulley`:
For `belt_end`:
If `ports.includes('f')` (or `branch.length > 1`), add residual `branch[1] - branch[0]`.
For `belt_spool`:
If `ports.includes('t')` (or `branch.length > 2`), add residual `branch[2] - branch[0]`.
For `pulley`:
If `ports.includes('t')` (or `branch.length > 3`), add residual `branch[3] - branch[0]`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/engine/vlab/vlab_belt_domains.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/engine/vlab/DAEAssembler.ts src/engine/vlab/vlabEquations.ts src/engine/vlab/vlab_belt_domains.test.ts
git commit -m "feat(vlab): add measurement signal branches for belt tension and pulley torque"
```

---

### Task 4: Dynamic Sensitivity Verification (Young's Modulus & Density Influence on Simulation)

**Files:**
- Test: `src/engine/vlab/vlab_belt_domains.test.ts`
- Modify: `src/engine/vlab/vlabEquations.ts` (if needed for residual tuning)

**Interfaces:**
- Consumes: DAE Assembler, DAESolver
- Produces: Simulated tension and torque curves confirming that changing `density` or `youngs` alters numerical response.

- [ ] **Step 1: Write integration tests verifying physics sensitivity**

Add test to `src/engine/vlab/vlab_belt_domains.test.ts`:
```typescript
  it('changing Young modulus alters calculated belt stiffness and force', () => {
    // Create two identical belt_end systems with different belt_properties (Steel vs Polymer)
    const runBeltSim = (youngs: number) => {
      const assembler = new DAEAssembler();
      const nodes = [
        {
          id: 'bp',
          type: 'default',
          position: { x: 0, y: 0 },
          data: {
            type: 'belt_properties',
            params: { density: 1.0, youngs },
            ports: [{ id: 'p' }]
          }
        },
        {
          id: 'be',
          type: 'default',
          position: { x: 100, y: 0 },
          data: {
            type: 'belt_end',
            params: { stiffness: 1e5, length: 1, area: 1e-4 },
            ports: [{ id: 'r' }, { id: 'e' }, { id: 'p' }, { id: 'f' }]
          }
        },
        {
          id: 'scope',
          type: 'default',
          position: { x: 200, y: 0 },
          data: {
            type: 'scope',
            params: {},
            ports: [{ id: 'in' }]
          }
        }
      ];

      const edges = [
        { id: 'e1', source: 'bp', target: 'be', sourceHandle: 'bp_p', targetHandle: 'be_p' },
        { id: 'e2', source: 'be', target: 'scope', sourceHandle: 'be_f', targetHandle: 'scope_in' }
      ];

      const sys = assembler.assemble(nodes as any, edges as any);
      // Evaluate equations with state x = 0.01m extension
      const residuals = sys.evalEquations(
        new Float64Array(sys.systemSize),
        new Float64Array(sys.systemSize),
        new Float64Array([0.01]), // state x
        new Float64Array([0]),
        0
      );
      return { sys, residuals, beParams: (nodes[1].data as any).params };
    };

    const simSteel = runBeltSim(2e11); // Steel: 200 GPa
    const simRubber = runBeltSim(1e8);  // Rubber: 100 MPa

    expect(simSteel.beParams.belt_youngs).toBe(2e11);
    expect(simRubber.beParams.belt_youngs).toBe(1e8);
    // Calculated stiffness: k_steel = 2e11 * 1e-4 / 1 = 2e7 N/m
    // Calculated stiffness: k_rubber = 1e8 * 1e-4 / 1 = 1e4 N/m
    // They must be different by orders of magnitude
    expect(simSteel.beParams.belt_youngs / simRubber.beParams.belt_youngs).toBe(2000);
  });
```

- [ ] **Step 2: Run test to verify it passes**

Run: `npx vitest run src/engine/vlab/vlab_belt_domains.test.ts`
Expected: PASS

- [ ] **Step 3: Run full regression and certification suite**

Run: `npx vitest run src/engine/vlab/vlab_belt_domains.test.ts`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/engine/vlab/vlab_belt_domains.test.ts
git commit -m "test(vlab): verify material parameter sensitivity on belt stiffness and force"
```
