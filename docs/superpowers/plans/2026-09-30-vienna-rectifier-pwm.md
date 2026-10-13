# Vienna Rectifier PWM Generator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform `pwm_vienna` into an authentic, physically consistent Vienna Rectifier PWM generator with explicit physical ports, DAE output branches, UI parameters, component definitions, and carrier-based switching equations.

**Architecture:** Model the Vienna Rectifier as a 14-port physical block (8 physical inputs: `va, vb, vc, ia, ib, ic, vdc, vneut`; 6 physical outputs: `ga, gb, gc, ma, mb, mc`). The DAE assembler explicitly allocates 6 output branches matching the 6 residual equations. The equation factory synthesizes an active current reference from DC link regulation, applies neutral-point midpoint balancing, computes 3-phase modulation indices, and performs carrier-based comparisons at frequency `f_sw` to emit binary gate states $\{0, 1\}$.

**Tech Stack:** TypeScript, React, Vitest, VLab DAE Assembler, VLab Physical Engine.

## Global Constraints

- All ports must specify `domain: "Physical"`.
- DAE output branches must be explicitly allocated in `DAEAssembler.ts` for all 6 outputs: `ga`, `gb`, `gc`, `ma`, `mb`, `mc`.
- Gate outputs must strictly evaluate to binary values in $\{0, 1\}$.
- Residual equations must return exactly 6 values: `branch[k] - output[k]`.
- No truthiness fallback on inputs that treats valid zero values as missing numbers.
- Maintain full TypeScript cleanliness (`npx tsc --noEmit`).

---

### Task 1: Library Port Definitions, Parameters, and Component Metadata

**Files:**
- Modify: `src/utils/vlabLibrary.ts`
- Modify: `src/engine/vlab/vlabComponentDefinitions.ts`
- Modify: `src/components/vlab/blockDimensions.ts`
- Modify: `src/components/vlab/VLabWorkspace.tsx`
- Modify: `src/utils/vlabLibrary.test.ts`

**Interfaces:**
- Consumes: `VLAB_LIBRARY` in `src/utils/vlabLibrary.ts`, `VLAB_COMPONENT_DEFINITIONS` in `src/engine/vlab/vlabComponentDefinitions.ts`
- Produces: 14 physical ports on `pwm_vienna`, 4 parameters (`f_sw`, `vdc_ref`, `kp_v`, `neutral_balance_gain`), dimensions `80x120`

- [ ] **Step 1: Write the failing library unit test**

In `src/utils/vlabLibrary.test.ts`, add:
```typescript
  it('exposes physical Vienna Rectifier PWM inputs and scalar outputs', () => {
    const block = VLAB_LIBRARY.flatMap(domain => domain.blocks).find(item => item.id === 'pwm_vienna');
    expect(block).toBeDefined();
    expect(block?.ports.map(port => port.id)).toEqual([
      'va', 'vb', 'vc', 'ia', 'ib', 'ic', 'vdc', 'vneut',
      'ga', 'gb', 'gc', 'ma', 'mb', 'mc'
    ]);
    expect(block?.ports.every(port => port.domain === 'Physical')).toBe(true);
    expect(block?.params.f_sw).toEqual({ value: 10000, unit: 'Hz', label: 'Switch Freq' });
    expect(block?.params.vdc_ref).toEqual({ value: 800, unit: 'V', label: 'Vdc Ref' });
    expect(block?.params.kp_v).toEqual({ value: 0.1, unit: 'A/V', label: 'Voltage Prop Gain' });
    expect(block?.params.neutral_balance_gain).toEqual({ value: 0.1, unit: '1/V', label: 'Neutral Balance Gain' });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/vlabLibrary.test.ts`
Expected: FAIL asserting port list or parameters mismatch.

- [ ] **Step 3: Update `vlabLibrary.ts`, `vlabComponentDefinitions.ts`, and block dimensions**

In `src/utils/vlabLibrary.ts`:
Replace ports and params for `pwm_vienna` with:
```typescript
        "params": {
          "f_sw": {
            "value": 10000,
            "unit": "Hz",
            "label": "Switch Freq"
          },
          "vdc_ref": {
            "value": 800,
            "unit": "V",
            "label": "Vdc Ref"
          },
          "kp_v": {
            "value": 0.1,
            "unit": "A/V",
            "label": "Voltage Prop Gain"
          },
          "neutral_balance_gain": {
            "value": 0.1,
            "unit": "1/V",
            "label": "Neutral Balance Gain"
          }
        },
        "ports": [
          { "id": "va", "pos": "left", "label": "Va", "domain": "Physical" },
          { "id": "vb", "pos": "left", "label": "Vb", "domain": "Physical" },
          { "id": "vc", "pos": "left", "label": "Vc", "domain": "Physical" },
          { "id": "ia", "pos": "left", "label": "Ia", "domain": "Physical" },
          { "id": "ib", "pos": "left", "label": "Ib", "domain": "Physical" },
          { "id": "ic", "pos": "left", "label": "Ic", "domain": "Physical" },
          { "id": "vdc", "pos": "left", "label": "Vdc", "domain": "Physical" },
          { "id": "vneut", "pos": "left", "label": "vNeutral", "domain": "Physical" },
          { "id": "ga", "pos": "right", "label": "Gate A", "domain": "Physical" },
          { "id": "gb", "pos": "right", "label": "Gate B", "domain": "Physical" },
          { "id": "gc", "pos": "right", "label": "Gate C", "domain": "Physical" },
          { "id": "ma", "pos": "right", "label": "Mod A", "domain": "Physical" },
          { "id": "mb", "pos": "right", "label": "Mod B", "domain": "Physical" },
          { "id": "mc", "pos": "right", "label": "Mod C", "domain": "Physical" }
        ],
```

In `src/engine/vlab/vlabComponentDefinitions.ts`:
Update `pwm_vienna`:
```typescript
  pwm_vienna: {
    equations: [
      'I^* = max(0, kp_v * (vdc_ref - vdc))',
      'Δ_neut = clamp(k_neut * v_neut / max(|vdc|, 1), -0.2, 0.2)',
      'm_x = clamp(2*v_x/max(|vdc|, 1) + 0.05 * e_ix + Δ_neut, -1, 1)',
      'g_x = 1 if C_tri(f_sw, t) < (1 - |m_x|) else 0'
    ],
    latex: [
      'g_x \\in \\{0, 1\\}',
      'd_x = 1 - |m_x|',
      '\\Delta_{neut} = \\text{clamp}(k_{neut} v_{neut} / \\max(|v_{dc}|, 1), -0.2, 0.2)'
    ],
    across: 'Physical Inputs', through: 'Physical Outputs',
    description: 'Three-phase Vienna Rectifier PWM generator with explicit ga/gb/gc switching gates and ma/mb/mc modulation indices. Uses carrier-based PWM at f_sw, DC voltage regulation, and neutral-point midpoint balancing.'
  },
```

In `src/components/vlab/blockDimensions.ts`:
Add `pwm_vienna: { width: 80, height: 120 },`.

In `src/components/vlab/VLabWorkspace.tsx`:
Add `case 'pwm_vienna': return { width: 80, height: 120 };`.

- [ ] **Step 4: Run library tests**

Run: `npx vitest run src/utils/vlabLibrary.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit changes**

```bash
git add src/utils/vlabLibrary.ts src/engine/vlab/vlabComponentDefinitions.ts src/components/vlab/blockDimensions.ts src/components/vlab/VLabWorkspace.tsx src/utils/vlabLibrary.test.ts
git commit -m "feat(vlab): define physical ports and parameters for pwm_vienna"
```

---

### Task 2: DAE Assembler Output Branch Allocation for `pwm_vienna`

**Files:**
- Modify: `src/engine/vlab/DAEAssembler.ts`
- Create: `src/engine/vlab/viennaPwmModel.test.ts`

**Interfaces:**
- Consumes: `DAEAssembler.assemble([node], [])`
- Produces: `pwm_branch_ga`, `pwm_branch_gb`, `pwm_branch_gc`, `pwm_branch_ma`, `pwm_branch_mb`, `pwm_branch_mc`

- [ ] **Step 1: Write the failing branch allocation test**

Create `src/engine/vlab/viennaPwmModel.test.ts`:
```typescript
import { describe, expect, it } from 'vitest';
import type { Node } from '@xyflow/react';
import { DAEAssembler } from './DAEAssembler';

describe('viennaPwmModel', () => {
  it('allocates one branch for each Vienna Rectifier output', () => {
    const node: Node = { id: 'pwm', type: 'pwm_vienna', position: { x: 0, y: 0 }, data: { blockId: 'pwm_vienna' } };
    const names = new DAEAssembler().assemble([node], []).variableNames;
    expect(names.filter(name => name.startsWith('pwm_branch_'))).toEqual([
      'pwm_branch_ga', 'pwm_branch_gb', 'pwm_branch_gc',
      'pwm_branch_ma', 'pwm_branch_mb', 'pwm_branch_mc'
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/vlab/viennaPwmModel.test.ts`
Expected: FAIL asserting empty array `[]` does not equal `['pwm_branch_ga', ...]`.

- [ ] **Step 3: Update `DAEAssembler.ts` to allocate output branches**

In `src/engine/vlab/DAEAssembler.ts`, right under `case 'pwm_3ph_3level':`:
```typescript
        case 'pwm_3ph_3level':
        case 'pwm_vienna':
          for (const name of ['ga', 'gb', 'gc', 'ma', 'mb', 'mc']) {
            branches.push({ name, ports: [{ id: name, sign: 1 }] });
          }
          break;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/engine/vlab/viennaPwmModel.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit changes**

```bash
git add src/engine/vlab/DAEAssembler.ts src/engine/vlab/viennaPwmModel.test.ts
git commit -m "feat(vlab): allocate output branches for pwm_vienna in DAEAssembler"
```

---

### Task 3: Physical Equations and Switching Logic for `pwm_vienna`

**Files:**
- Modify: `src/engine/vlab/vlabEquations.ts`
- Modify: `src/engine/vlab/viennaPwmModel.test.ts`

**Interfaces:**
- Consumes: `blockEquations.pwm_vienna({ across, branch, params, ctx, ports, nodeId })`
- Produces: 6 residual values `[branch[0]-ga, branch[1]-gb, branch[2]-gc, branch[3]-ma, branch[4]-mb, branch[5]-mc]`

- [ ] **Step 1: Write comprehensive failing tests for equations in `viennaPwmModel.test.ts`**

Add tests to `src/engine/vlab/viennaPwmModel.test.ts`:
```typescript
import { blockEquations } from './vlabEquations';

describe('viennaPwmModel equations', () => {
  const evaluate = (
    time: number,
    across = [230, -115, -115, 10, -5, -5, 800, 0],
    params = { f_sw: 10000, vdc_ref: 800, kp_v: 0.1, neutral_balance_gain: 0.1 }
  ) => blockEquations.pwm_vienna({
    across, dAcross: [], branch: [0, 0, 0, 0, 0, 0], dBranch: [], state: [], dState: [], params,
    ctx: { time, dt: 1e-5, parameters: {}, prevStates: [], states: [], stateDerivatives: [] },
    ports: ['va', 'vb', 'vc', 'ia', 'ib', 'ic', 'vdc', 'vneut', 'ga', 'gb', 'gc', 'ma', 'mb', 'mc'], nodeId: 'pwm'
  });

  it('returns six residuals with binary gates in {0, 1} and modulation values in [-1, 1]', () => {
    const r = evaluate(0.00005);
    expect(r).toHaveLength(6);
    const gates = r.slice(0, 3).map(value => -value);
    expect(gates.every(value => value === 0 || value === 1)).toBe(true);
    const mods = r.slice(3, 6).map(value => -value);
    expect(mods.every(value => value >= -1 && value <= 1)).toBe(true);
  });

  it('keeps zero AC inputs in safe idle clamped state', () => {
    // va=0, vb=0, vc=0, ia=0, ib=0, ic=0, vdc=800, vneut=0
    const r = evaluate(0, [0, 0, 0, 0, 0, 0, 800, 0]);
    // Modulation values are 0
    expect(r[3]).toBeCloseTo(0);
    expect(r[4]).toBeCloseTo(0);
    expect(r[5]).toBeCloseTo(0);
    // When m=0, duty ratio d = 1 - |m| = 1, so carrier < 1 turns all switches ON (g=1, clamped)
    expect(r[0]).toBe(-1); // branch[0] - 1 = -1
    expect(r[1]).toBe(-1);
    expect(r[2]).toBe(-1);
  });

  it('produces distinct phase-shifted modulation values for balanced 3-phase voltages', () => {
    const r = evaluate(0.0001, [325, -162.5, -162.5, 10, -5, -5, 800, 0]);
    expect(r[3]).not.toEqual(r[4]);
    expect(r[3]).not.toEqual(r[5]);
  });

  it('alters switching pulse transitions when f_sw changes', () => {
    const t = 0.00003;
    const rFast = evaluate(t, [230, -115, -115, 10, -5, -5, 800, 0], { f_sw: 20000, vdc_ref: 800, kp_v: 0.1, neutral_balance_gain: 0.1 });
    const rSlow = evaluate(t, [230, -115, -115, 10, -5, -5, 800, 0], { f_sw: 5000, vdc_ref: 800, kp_v: 0.1, neutral_balance_gain: 0.1 });
    expect(rFast).not.toEqual(rSlow);
  });

  it('responds to neutral-point unbalance vneut', () => {
    const rPosNeut = evaluate(0.0001, [230, -115, -115, 10, -5, -5, 800, 50]);
    const rNegNeut = evaluate(0.0001, [230, -115, -115, 10, -5, -5, 800, -50]);
    expect(rPosNeut[3]).not.toEqual(rNegNeut[3]);
  });

  it('responds to DC voltage regulation error', () => {
    const rLowVdc = evaluate(0.0001, [230, -115, -115, 10, -5, -5, 600, 0], { f_sw: 10000, vdc_ref: 800, kp_v: 0.5, neutral_balance_gain: 0.1 });
    const rHighVdc = evaluate(0.0001, [230, -115, -115, 10, -5, -5, 900, 0], { f_sw: 10000, vdc_ref: 800, kp_v: 0.5, neutral_balance_gain: 0.1 });
    expect(rLowVdc[3]).not.toEqual(rHighVdc[3]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/engine/vlab/viennaPwmModel.test.ts`
Expected: FAIL on length and equation outputs.

- [ ] **Step 3: Implement `pwm_vienna` equation in `src/engine/vlab/vlabEquations.ts`**

Replace `pwm_vienna` implementation in `src/engine/vlab/vlabEquations.ts`:
```typescript
  pwm_vienna: ({ across, branch, params, ctx }) => {
    const va = across[0] ?? 0;
    const vb = across[1] ?? 0;
    const vc = across[2] ?? 0;
    const ia = across[3] ?? 0;
    const ib = across[4] ?? 0;
    const ic = across[5] ?? 0;
    const vdc = Math.abs(across[6] ?? 0);
    const vneut = across[7] ?? 0;

    const fSw = Math.max(1, params.f_sw ?? 10000);
    const vdcRef = params.vdc_ref ?? 800;
    const kpV = params.kp_v ?? 0.1;
    const neutralGain = params.neutral_balance_gain ?? 0.1;

    // 1. DC voltage regulation loop
    const vdcError = vdcRef - vdc;
    const iRefAmplitude = Math.max(0, kpV * vdcError);

    // 2. Neutral-point midpoint balance correction
    const neutralCorrection = Math.max(-0.2, Math.min(0.2, neutralGain * vneut / Math.max(vdc, 1)));

    // 3. Phase modulation indices calculation
    const vNormDenom = Math.max(vdc, 1);
    const vMag = Math.max(Math.sqrt(va * va + vb * vb + vc * vc), 1);

    const phases = [
      { v: va, i: ia },
      { v: vb, i: ib },
      { v: vc, i: ic }
    ];

    const mods = phases.map(p => {
      const vNormalized = (2 * p.v) / vNormDenom;
      const iTarget = (iRefAmplitude * p.v) / vMag;
      const iError = iTarget - p.i;
      const rawMod = vNormalized + 0.05 * iError + neutralCorrection;
      return Math.max(-1, Math.min(1, rawMod));
    });

    // 4. Triangular carrier at f_sw in [0, 1]
    const carrierPhase = (ctx.time * fSw) % 1;
    const carrier = 2 * Math.abs(carrierPhase - 0.5);

    // 5. Switching gates: switch is ON (1) when carrier < duty (1 - |m|), else OFF (0)
    const gates = mods.map(m => {
      const duty = 1 - Math.abs(m);
      return carrier < duty ? 1 : 0;
    });

    return [
      branch[0] - gates[0],
      branch[1] - gates[1],
      branch[2] - gates[2],
      branch[3] - mods[0],
      branch[4] - mods[1],
      branch[5] - mods[2]
    ];
  },
```

- [ ] **Step 4: Run unit tests to verify they pass**

Run: `npx vitest run src/engine/vlab/viennaPwmModel.test.ts`
Expected: PASS (all 7 tests).

- [ ] **Step 5: Commit changes**

```bash
git add src/engine/vlab/vlabEquations.ts src/engine/vlab/viennaPwmModel.test.ts
git commit -m "feat(vlab): implement carrier-based Vienna Rectifier PWM equations and tests"
```

---

### Task 4: Full Suite Validation and TypeScript Check

**Files:**
- Test verification across all affected suites.

- [ ] **Step 1: Run all VLab tests**

Run: `npx vitest run src/engine/vlab src/utils/vlabLibrary.test.ts`
Expected: PASS.

- [ ] **Step 2: Run SysML and system test suite**

Run: `npm run test:sysml`
Expected: PASS.

- [ ] **Step 3: Run TypeScript compiler validation**

Run: `npx tsc --noEmit`
Expected: PASS with 0 errors.

- [ ] **Step 4: Commit any remaining adjustments if needed**
