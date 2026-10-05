# Multibody Frame Kinematics and Constraints Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement 6-DOF Multibody Frame domain support, rigid transformation with accurate 3D translation and rotation, transform sensor, and distance/angle constraints with measurement outputs connectable to Scope, resolving Benchmark B39 certification issues.

**Architecture:** Each physical node with domain `Frame` or `MultibodyFrame` is allocated 6 contiguous across unknowns $[P_x, P_y, P_z, \theta_x, \theta_y, \theta_z]$ in the DAE system. `world_frame` pins all 6 unknowns strictly to $0$ as a reference node. `rigid_transform` computes relative 3D pose using Euler rotation and translation vectors. `dist_constraint` and `angle_constraint` compute 3D Euclidean distances and relative Euler angles with Lagrange multipliers and output measurement channels ($d, F_{\text{reac}}, \theta, \tau_{\text{reac}}$) to Scope. A new `transform_sensor` block measures 6-DOF relative poses $[X, Y, Z, Rx, Ry, Rz]$ and exposes them as physical signals for Scope.

**Tech Stack:** TypeScript, React, ReactFlow (@xyflow/react), Vitest, DAE Implicit Solver.

## Global Constraints
- Preserve zero-handling: use `params.dist !== undefined ? Number(params.dist) : 1.0` (never `params.dist || 1`).
- Read parameter `params.angle` (not `params.limit`).
- Internal kinematic equations use radians; sensor measurement outputs use degrees for angles and meters for translations.
- All Frame ports (`W`, `R`, `B`, `F`) must carry `"domain": "Frame"`.
- `world_frame` variables must remain invariant at $[0,0,0,0,0,0]$ regardless of connected constraints.

---

### Task 1: Domain System & Library Contract Updates

**Files:**
- Modify: `src/engine/vlab/types.ts:1-15`
- Modify: `src/engine/vlab/vlabPortDomains.ts:1-10`
- Modify: `src/components/vlab/VLabWorkspace.tsx:932-941`
- Modify: `src/components/vlab/vlabConnectionValidation.test.ts:40-54`
- Modify: `src/utils/vlabLibrary.ts:6488-6615`
- Modify: `src/engine/vlab/vlabComponentDefinitions.ts:1158-1187`
- Test: `src/engine/vlab/vlabPortDomains.test.ts`
- Create: `src/engine/vlab/vlab_multibody_frames.test.ts`

**Interfaces:**
- Consumes: `PHYSICAL_DOMAINS` in `types.ts`, `VLAB_LIBRARY` in `vlabLibrary.ts`.
- Produces: `isValidVLabPortDomain('Frame') === true`, `isValidVLabPortDomain('MultibodyFrame') === true`, port domain metadata on multibody blocks.

- [ ] **Step 1: Write the failing test for Frame port domain validity and block library contracts**

In `src/engine/vlab/vlab_multibody_frames.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { isValidVLabPortDomain } from './vlabPortDomains';
import { VLAB_LIBRARY } from '../../utils/vlabLibrary';

describe('VLab Multibody Frame Domains & Block Contracts', () => {
  it('validates Frame and MultibodyFrame port domains', () => {
    expect(isValidVLabPortDomain('Frame')).toBe(true);
    expect(isValidVLabPortDomain('frame')).toBe(true);
    expect(isValidVLabPortDomain('MultibodyFrame')).toBe(true);
    expect(isValidVLabPortDomain('multibodyframe')).toBe(true);
  });

  it('verifies world_frame, ref_frame, rigid_transform, dist_constraint, angle_constraint have Frame domain ports', () => {
    const physDomain = VLAB_LIBRARY.find(d => d.type === 'Physical');
    expect(physDomain).toBeDefined();

    const worldFrame = physDomain?.blocks.find(b => b.id === 'world_frame');
    expect(worldFrame?.ports.find(p => p.id === 'w')?.domain).toBe('Frame');

    const refFrame = physDomain?.blocks.find(b => b.id === 'ref_frame');
    expect(refFrame?.ports.find(p => p.id === 'r')?.domain).toBe('Frame');

    const rigidTrans = physDomain?.blocks.find(b => b.id === 'rigid_transform');
    expect(rigidTrans?.ports.find(p => p.id === 'b')?.domain).toBe('Frame');
    expect(rigidTrans?.ports.find(p => p.id === 'f')?.domain).toBe('Frame');

    const distCons = physDomain?.blocks.find(b => b.id === 'dist_constraint');
    expect(distCons?.ports.find(p => p.id === 'b')?.domain).toBe('Frame');
    expect(distCons?.ports.find(p => p.id === 'f')?.domain).toBe('Frame');
    expect(distCons?.ports.find(p => p.id === 'd')?.domain).toBe('Physical');

    const angleCons = physDomain?.blocks.find(b => b.id === 'angle_constraint');
    expect(angleCons?.ports.find(p => p.id === 'b')?.domain).toBe('Frame');
    expect(angleCons?.ports.find(p => p.id === 'f')?.domain).toBe('Frame');
    expect(angleCons?.ports.find(p => p.id === 'ang')?.domain).toBe('Physical');

    const transformSensor = physDomain?.blocks.find(b => b.id === 'transform_sensor');
    expect(transformSensor).toBeDefined();
    expect(transformSensor?.ports.find(p => p.id === 'b')?.domain).toBe('Frame');
    expect(transformSensor?.ports.find(p => p.id === 'f')?.domain).toBe('Frame');
    expect(transformSensor?.ports.find(p => p.id === 'x')?.domain).toBe('Physical');
    expect(transformSensor?.ports.find(p => p.id === 'rx')?.domain).toBe('Physical');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/vlab/vlab_multibody_frames.test.ts`
Expected: FAIL with missing domain or undefined properties.

- [ ] **Step 3: Implement domain definitions and library metadata**

1. In `src/engine/vlab/types.ts`:
Add `'frame'` and `'multibodyframe'` to `PHYSICAL_DOMAINS`.

2. In `src/engine/vlab/vlabPortDomains.ts`:
Ensure `SUPPLEMENTAL_PORT_DOMAINS` includes `'frame'` and `'multibodyframe'` if not covered by canonical domains.

3. In `src/components/vlab/VLabWorkspace.tsx:932-941`:
Update `areDomainsCompatible`:
```typescript
export const areDomainsCompatible = (d1?: string, d2?: string): boolean => {
  if (!d1 || !d2) return true;
  const a = d1.toLowerCase();
  const b = d2.toLowerCase();
  if (a === b) return true;
  if ((a === 'frame' || a === 'multibodyframe') && (b === 'frame' || b === 'multibodyframe')) return true;
  if (a === 'mechanical' && (b === 'translational' || b === 'rotational')) return true;
  if (b === 'mechanical' && (a === 'translational' || a === 'rotational')) return true;
  return false;
};
```

4. In `src/utils/vlabLibrary.ts`:
Update `world_frame`, `ref_frame`, `rigid_transform`, `dist_constraint`, `angle_constraint` ports to specify `"domain": "Frame"`.
Add `d` and `f_reac` ports to `dist_constraint`.
Add `ang` and `t_reac` ports to `angle_constraint`.
Add `transform_sensor` block definition with ports `b`, `f` (Frame) and `x`, `y`, `z`, `rx`, `ry`, `rz` (Physical).

5. In `src/engine/vlab/vlabComponentDefinitions.ts`:
Update component definitions for `world_frame`, `ref_frame`, `rigid_transform`, `dist_constraint`, `angle_constraint`, and `transform_sensor`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/engine/vlab/vlab_multibody_frames.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/engine/vlab/types.ts src/engine/vlab/vlabPortDomains.ts src/components/vlab/VLabWorkspace.tsx src/components/vlab/vlabConnectionValidation.test.ts src/utils/vlabLibrary.ts src/engine/vlab/vlabComponentDefinitions.ts src/engine/vlab/vlab_multibody_frames.test.ts
git commit -m "feat(vlab): add Frame domain and multibody block port definitions"
```

---

### Task 2: Vector Parsing & 3D Kinematics Utility

**Files:**
- Create: `src/engine/vlab/vlabFrameKinematics.ts`
- Test: `src/engine/vlab/vlab_multibody_frames.test.ts`

**Interfaces:**
- Consumes: None (pure math/geometry utility).
- Produces:
  - `parseVector3(val: any, defaultVal?: [number, number, number]): [number, number, number]`
  - `eulerToRotationMatrix(rx: number, ry: number, rz: number): number[][]`
  - `transformPoint(R: number[][], p: [number, number, number]): [number, number, number]`
  - `computeFrameDistance(pA: [number, number, number], pB: [number, number, number]): number`
  - `computeRelativeAngle(rA: [number, number, number], rB: [number, number, number]): number`

- [ ] **Step 1: Write the failing test for kinematics utilities**

In `src/engine/vlab/vlab_multibody_frames.test.ts`:
```typescript
import {
  parseVector3,
  eulerToRotationMatrix,
  transformPoint,
  computeFrameDistance,
  computeRelativeAngle
} from './vlabFrameKinematics';

describe('VLab Frame Kinematics Math', () => {
  it('parses various vector3 representations', () => {
    expect(parseVector3('[1 2 3]')).toEqual([1, 2, 3]);
    expect(parseVector3('[1, 2, 3]')).toEqual([1, 2, 3]);
    expect(parseVector3('1 2 3')).toEqual([1, 2, 3]);
    expect(parseVector3([4, 5, 6])).toEqual([4, 5, 6]);
    expect(parseVector3(undefined, [0, 0, 0])).toEqual([0, 0, 0]);
  });

  it('computes 3D Euclidean frame distance', () => {
    expect(computeFrameDistance([0, 0, 0], [3, 4, 0])).toBeCloseTo(5.0);
    expect(computeFrameDistance([1, 1, 1], [1, 1, 1])).toBeCloseTo(0.0);
  });

  it('transforms vector with rotation matrix correctly (90 deg around Z)', () => {
    const Rz90 = eulerToRotationMatrix(0, 0, Math.PI / 2);
    const p = transformPoint(Rz90, [1, 0, 0]);
    expect(p[0]).toBeCloseTo(0, 5);
    expect(p[1]).toBeCloseTo(1, 5);
    expect(p[2]).toBeCloseTo(0, 5);
  });

  it('computes relative angle between orientations', () => {
    const ang = computeRelativeAngle([0, 0, 0], [0, 0, Math.PI / 2]);
    expect(ang).toBeCloseTo(Math.PI / 2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/vlab/vlab_multibody_frames.test.ts`
Expected: FAIL with module `./vlabFrameKinematics` not found.

- [ ] **Step 3: Implement `vlabFrameKinematics.ts`**

```typescript
export function parseVector3(val: any, defaultVal: [number, number, number] = [0, 0, 0]): [number, number, number] {
  if (Array.isArray(val) && val.length >= 3) {
    return [Number(val[0]) || 0, Number(val[1]) || 0, Number(val[2]) || 0];
  }
  if (typeof val === 'string') {
    const cleaned = val.replace(/[\[\]]/g, '').trim();
    const parts = cleaned.split(/[\s,]+/).filter(Boolean).map(Number);
    if (parts.length >= 3 && parts.every(Number.isFinite)) {
      return [parts[0], parts[1], parts[2]];
    }
  }
  return [...defaultVal];
}

export function eulerToRotationMatrix(rx: number, ry: number, rz: number): number[][] {
  const cx = Math.cos(rx), sx = Math.sin(rx);
  const cy = Math.cos(ry), sy = Math.sin(ry);
  const cz = Math.cos(rz), sz = Math.sin(rz);

  // R = Rz * Ry * Rx
  return [
    [cz * cy, cz * sy * sx - sz * cx, cz * sy * cx + sz * sx],
    [sz * cy, sz * sy * sx + cz * cx, sz * sy * cx - cz * sx],
    [-sy, cy * sx, cy * cx]
  ];
}

export function transformPoint(R: number[][], p: [number, number, number]): [number, number, number] {
  return [
    R[0][0] * p[0] + R[0][1] * p[1] + R[0][2] * p[2],
    R[1][0] * p[0] + R[1][1] * p[1] + R[1][2] * p[2],
    R[2][0] * p[0] + R[2][1] * p[1] + R[2][2] * p[2]
  ];
}

export function computeFrameDistance(pA: [number, number, number], pB: [number, number, number]): number {
  const dx = pB[0] - pA[0];
  const dy = pB[1] - pA[1];
  const dz = pB[2] - pA[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz + 1e-18);
}

export function computeRelativeAngle(rA: [number, number, number], rB: [number, number, number]): number {
  const dx = rB[0] - rA[0];
  const dy = rB[1] - rA[1];
  const dz = rB[2] - rA[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/engine/vlab/vlab_multibody_frames.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/engine/vlab/vlabFrameKinematics.ts src/engine/vlab/vlab_multibody_frames.test.ts
git commit -m "feat(vlab): implement 3D frame kinematics and vector parsing utility"
```

---

### Task 3: DAE Assembler Multi-variable Allocation & World Frame Pinning

**Files:**
- Modify: `src/engine/vlab/DAEAssembler.ts:208-255, 903-940, 1130-1175`
- Test: `src/engine/vlab/vlab_multibody_frames.test.ts`

**Interfaces:**
- Consumes: `PhysicalDomain`, `rootToPorts`, `referenceNodeIds` in `DAEAssembler.ts`.
- Produces: 6 across variables allocated for Frame roots, zero pinning in `residuals()` for `world_frame`.

- [ ] **Step 1: Write the failing test for DAEAssembler Frame variable stride and World pinning**

In `src/engine/vlab/vlab_multibody_frames.test.ts`:
```typescript
import { DAEAssembler } from './DAEAssembler';
import { Node, Edge } from '@xyflow/react';

describe('DAEAssembler Frame System Allocation & World Pinning', () => {
  it('allocates 6 variables per Frame root and pins world_frame to 0', () => {
    const assembler = new DAEAssembler();
    const nodes: Node[] = [
      { id: 'w1', type: 'default', position: { x: 0, y: 0 }, data: { type: 'world_frame' } } as any,
    ];
    const edges: Edge[] = [];

    const system = assembler.assemble(nodes, edges);
    // At least 6 across variables for world frame
    expect(system.variableNames.some(name => name.includes('Across_') && name.includes('_Px'))).toBe(true);
    expect(system.variableNames.some(name => name.includes('Across_') && name.includes('_Rz'))).toBe(true);

    // Residual of world frame must pin x to 0
    const ctx: any = { dt: 0.01, time: 0, parameters: {}, prevStates: new Array(system.systemSize).fill(0) };
    const testX = new Array(system.systemSize).fill(5); // Non-zero test vector
    const res = system.residuals(testX, ctx);

    // For world frame variables, residual should be testX[idx] - 0 = 5
    system.variableNames.forEach((name, idx) => {
      if (name.includes('Across_') && (name.includes('(frame)') || name.includes('(multibody)'))) {
        expect(res[idx]).toBe(5);
      }
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/vlab/vlab_multibody_frames.test.ts`
Expected: FAIL (only 1 across variable allocated, no `_Px` / `_Rz`).

- [ ] **Step 3: Update `DAEAssembler.ts` for Frame variable allocation and reference pinning**

1. In step 3 (Allocate Across variables):
Detect if `domain === 'frame' || domain === 'multibodyframe'`:
If true, allocate 6 consecutive indices:
```typescript
const stride = (domain === 'frame' || domain === 'multibodyframe') ? 6 : 1;
const acrossIndex = varCount;
varCount += stride;
nodeAcrossIndex.set(root, acrossIndex);
physicalNodes.push({ id: root, domain, acrossVarIndex: acrossIndex });

if (stride === 6) {
  const suffixes = ['Px', 'Py', 'Pz', 'Rx', 'Ry', 'Rz'];
  suffixes.forEach(s => {
    variableNames.push(`Across_${root}_${s}_(${domain})`);
    isDifferentialState.push(false);
  });
} else {
  variableNames.push(`Across_${root}_(${domain})`);
  isDifferentialState.push(false);
}
```

2. In step 5 (Setup Kirchhoff Conservation nodes & reference nodes):
Add `'world_frame'` to the reference components scan:
```typescript
if (['world_frame', 'ground', 'rot_ref', 'trans_ref', 'thermal_ref', ...].includes(type)) {
  // pin node root
  ports.forEach(portId => {
    const key = `${node.id}_${portId}`;
    const root = uf.find(key);
    referenceNodeIds.add(root);
    referenceNodeTargets.set(root, 0);
  });
}
```

3. In `residuals()`:
When `referenceNodeIds.has(pn.id)`:
If `pn.domain === 'frame' || pn.domain === 'multibodyframe'`:
Pin all 6 variables to 0:
```typescript
for (let k = 0; k < 6; k++) {
  res[acrossVarIdx + k] = x[acrossVarIdx + k] - 0;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/engine/vlab/vlab_multibody_frames.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/engine/vlab/DAEAssembler.ts src/engine/vlab/vlab_multibody_frames.test.ts
git commit -m "feat(vlab): allocate 6-DOF across variables for frames and pin world_frame"
```

---

### Task 4: Component Governing Equations, Branches, and Scope Mapping

**Files:**
- Modify: `src/engine/vlab/DAEAssembler.ts:258-450, 830-860, 1040-1085`
- Modify: `src/engine/vlab/vlabEquations.ts:1825-1845, 2705-2715`
- Modify: `src/components/vlab/VLabSymbols.tsx:1570-1585`
- Test: `src/engine/vlab/vlab_multibody_frames.test.ts`

**Interfaces:**
- Consumes: `vlabFrameKinematics.ts`, `nodeAcrossIndex`, `portToVarIndex`.
- Produces: Full residual evaluation for `rigid_transform`, `dist_constraint`, `angle_constraint`, `transform_sensor`, and Scope channel bindings.

- [ ] **Step 1: Write failing test for component branches, equations, and Scope measurements**

In `src/engine/vlab/vlab_multibody_frames.test.ts`:
```typescript
import { VLabPhysicsEngine } from './vlabPhysics';

describe('Multibody Component Equations and Scope Connectivity', () => {
  it('correctly models rigid_transform offset and rotation into transform_sensor scope', () => {
    const engine = new VLabPhysicsEngine();
    const nodes: Node[] = [
      { id: 'w', type: 'default', position: { x: 0, y: 0 }, data: { type: 'world_frame' } } as any,
      {
        id: 't1',
        type: 'default',
        position: { x: 100, y: 0 },
        data: {
          type: 'rigid_transform',
          params: { offset: { value: '[1 2 3]' }, rotation: { value: '[0 0 90]' } }
        }
      } as any,
      { id: 's1', type: 'default', position: { x: 200, y: 0 }, data: { type: 'transform_sensor' } } as any,
      { id: 'scope1', type: 'default', position: { x: 300, y: 0 }, data: { type: 'scope' } } as any,
    ];
    const edges: Edge[] = [
      { id: 'e1', source: 'w', target: 't1', sourceHandle: 'w', targetHandle: 'b' },
      { id: 'e2', source: 't1', target: 's1', sourceHandle: 'f', targetHandle: 'f' },
      { id: 'e3', source: 'w', target: 's1', sourceHandle: 'w', targetHandle: 'b' },
      { id: 'e4', source: 's1', target: 'scope1', sourceHandle: 'x', targetHandle: 'in_1' },
      { id: 'e5', source: 's1', target: 'scope1', sourceHandle: 'y', targetHandle: 'in_2' },
      { id: 'e6', source: 's1', target: 'scope1', sourceHandle: 'z', targetHandle: 'in_3' },
      { id: 'e7', source: 's1', target: 'scope1', sourceHandle: 'rz', targetHandle: 'in_4' },
    ];

    let state: any = null;
    state = engine.simulateStep(nodes, edges, state, 0.01);
    expect(state).toBeDefined();

    // Verify Scope mapped channel values
    const scopeData = state.scopeOutputs['scope1'];
    expect(scopeData).toBeDefined();
    // [X, Y, Z, Rz]
    expect(scopeData[0]).toBeCloseTo(1, 2);
    expect(scopeData[1]).toBeCloseTo(2, 2);
    expect(scopeData[2]).toBeCloseTo(3, 2);
    expect(scopeData[3]).toBeCloseTo(90, 1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/vlab/vlab_multibody_frames.test.ts`
Expected: FAIL with incorrect scope data or missing branches.

- [ ] **Step 3: Implement equations, branches, and scope mappings**

1. In `DAEAssembler.ts:getComponentSpec`:
- `rigid_transform`:
  Allocate 6 branches: `['fx', 'fy', 'fz', 'tx', 'ty', 'tz']`
- `transform_sensor`:
  Allocate 6 signal branches: `['signal_x', 'signal_y', 'signal_z', 'signal_rx', 'signal_ry', 'signal_rz']`
- `dist_constraint`:
  Allocate 2 branches: `['force', 'signal_d']`
- `angle_constraint`:
  Allocate 2 branches: `['torque', 'signal_ang']`

2. In `DAEAssembler.ts:acrossVals mapping`:
When extracting `acrossVals` for a component:
If port domain is `frame` or `multibodyframe`, map to a slice of 6 elements: `[x[varIdx], x[varIdx+1], x[varIdx+2], x[varIdx+3], x[varIdx+4], x[varIdx+5]]`.

3. In `vlabEquations.ts`:
- Implement `rigid_transform` equation with 3D translation & rotation.
- Implement `transform_sensor` equation computing relative position and Euler orientation.
- Implement `dist_constraint` equation with 3D distance and zero-safe `params.dist !== undefined ? Number(params.dist) : 1.0`.
- Implement `angle_constraint` reading `params.angle !== undefined ? Number(params.angle) : 0.0` with radian conversion.

4. In `DAEAssembler.ts:scope mapping`:
Map `transform_sensor` output ports `x`, `y`, `z`, `rx`, `ry`, `rz` to their signal branches.
Map `dist_constraint` output ports `d`, `f_reac` to their signal branches.
Map `angle_constraint` output ports `ang`, `t_reac` to their signal branches.

5. In `VLabSymbols.tsx`:
Add visual symbol rendering for `transform_sensor`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/engine/vlab/vlab_multibody_frames.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/engine/vlab/DAEAssembler.ts src/engine/vlab/vlabEquations.ts src/components/vlab/VLabSymbols.tsx src/engine/vlab/vlab_multibody_frames.test.ts
git commit -m "feat(vlab): implement 6-DOF frame equations, transform sensor, and scope routing"
```

---

### Task 5: End-to-End Simulation & Benchmark B39 Certification Suite

**Files:**
- Test: `src/engine/vlab/vlab_multibody_frames.test.ts`

**Interfaces:**
- Consumes: `VLabPhysicsEngine`, full multibody block library.
- Produces: Certified Benchmark B39 passing test, zero regression in full test suite.

- [ ] **Step 1: Write Benchmark B39 reproduction and certification test**

In `src/engine/vlab/vlab_multibody_frames.test.ts`:
```typescript
describe('Benchmark B39 Multibody Certification', () => {
  it('certifies B39: distance constraint = 2m, angle constraint = 90 deg, zero drift on World', () => {
    const engine = new VLabPhysicsEngine();
    const nodes: Node[] = [
      { id: 'world', type: 'default', position: { x: 0, y: 0 }, data: { type: 'world_frame' } } as any,
      {
        id: 't_b',
        type: 'default',
        position: { x: 100, y: 0 },
        data: { type: 'rigid_transform', params: { offset: { value: '[0 0 0]' }, rotation: { value: '[0 0 0]' } } }
      } as any,
      {
        id: 't_f',
        type: 'default',
        position: { x: 100, y: 100 },
        data: { type: 'rigid_transform', params: { offset: { value: '[2 0 0]' }, rotation: { value: '[0 0 90]' } } }
      } as any,
      {
        id: 'dist_c',
        type: 'default',
        position: { x: 250, y: 0 },
        data: { type: 'dist_constraint', params: { dist: { value: 2 } } }
      } as any,
      {
        id: 'angle_c',
        type: 'default',
        position: { x: 250, y: 100 },
        data: { type: 'angle_constraint', params: { angle: { value: 90 } } }
      } as any,
      { id: 'scope_dist', type: 'default', position: { x: 400, y: 0 }, data: { type: 'scope' } } as any,
      { id: 'scope_angle', type: 'default', position: { x: 400, y: 100 }, data: { type: 'scope' } } as any,
    ];

    const edges: Edge[] = [
      { id: 'e1', source: 'world', target: 't_b', sourceHandle: 'w', targetHandle: 'b' },
      { id: 'e2', source: 'world', target: 't_f', sourceHandle: 'w', targetHandle: 'b' },
      // Connect distance constraint between t_b and t_f
      { id: 'e3', source: 't_b', target: 'dist_c', sourceHandle: 'f', targetHandle: 'b' },
      { id: 'e4', source: 't_f', target: 'dist_c', sourceHandle: 'f', targetHandle: 'f' },
      // Connect angle constraint between t_b and t_f
      { id: 'e5', source: 't_b', target: 'angle_c', sourceHandle: 'f', targetHandle: 'b' },
      { id: 'e6', source: 't_f', target: 'angle_c', sourceHandle: 'f', targetHandle: 'f' },
      // Connect scopes
      { id: 'e7', source: 'dist_c', target: 'scope_dist', sourceHandle: 'd', targetHandle: 'in_1' },
      { id: 'e8', source: 'angle_c', target: 'scope_angle', sourceHandle: 'ang', targetHandle: 'in_1' },
    ];

    let state: any = null;
    for (let step = 0; step < 10; step++) {
      state = engine.simulateStep(nodes, edges, state, 0.001);
    }

    // 1. World Frame coordinates must remain strictly zero
    const worldAcrossIndices = [0, 1, 2, 3, 4, 5]; // first 6 variables
    worldAcrossIndices.forEach(idx => {
      expect(Math.abs(state.x[idx])).toBeLessThan(1e-9);
    });

    // 2. Distance scope channel must read exactly 2 m
    expect(state.scopeOutputs['scope_dist'][0]).toBeCloseTo(2.0, 3);

    // 3. Angle scope channel must read exactly 90 deg
    expect(state.scopeOutputs['scope_angle'][0]).toBeCloseTo(90.0, 2);
  });

  it('handles dist = 0 without defaulting to 1', () => {
    const engine = new VLabPhysicsEngine();
    const nodes: Node[] = [
      { id: 'world', type: 'default', position: { x: 0, y: 0 }, data: { type: 'world_frame' } } as any,
      {
        id: 'dist_c',
        type: 'default',
        position: { x: 200, y: 0 },
        data: { type: 'dist_constraint', params: { dist: { value: 0 } } }
      } as any,
      { id: 'scope', type: 'default', position: { x: 350, y: 0 }, data: { type: 'scope' } } as any,
    ];
    const edges: Edge[] = [
      { id: 'e1', source: 'world', target: 'dist_c', sourceHandle: 'w', targetHandle: 'b' },
      { id: 'e2', source: 'world', target: 'dist_c', sourceHandle: 'w', targetHandle: 'f' },
      { id: 'e3', source: 'dist_c', target: 'scope', sourceHandle: 'd', targetHandle: 'in_1' },
    ];

    const state = engine.simulateStep(nodes, edges, null, 0.001);
    expect(state.scopeOutputs['scope'][0]).toBeCloseTo(0.0, 5);
  });
});
```

- [ ] **Step 2: Run test suite to verify B39 passes**

Run: `npx vitest run src/engine/vlab/vlab_multibody_frames.test.ts`
Expected: PASS

- [ ] **Step 3: Run full VLab certification suite to ensure no regressions across any domain**

Run: `npx vitest run src/engine/vlab/`
Expected: All tests PASS with zero errors.

- [ ] **Step 4: Commit**

```bash
git add src/engine/vlab/vlab_multibody_frames.test.ts
git commit -m "test(vlab): certify B39 multibody benchmark and zero-regression suite"
```
