# Three-Phase Inverter Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver explicit averaged and switch-level PWM for `pwm_3ph_2level`, with unambiguous control inputs and DC-link current conservation.

**Architecture:** The library owns the visible contract, `DAEAssembler` owns current-branch allocation, and `blockEquations` resolves controls into duty values then evaluates phase and DC-link residuals. Tests execute the real equation factory and assemble a real one-node DAE system.

**Tech Stack:** TypeScript, Vitest, React Flow node metadata, VLab DAE assembler.

## Global Constraints

- Keep block id `pwm_3ph_2level`.
- `averaged` is default; only `switching` uses `f_sw`.
- The new controls are scalar physical inputs `ma`, `mb`, `mc`; the legacy scalar `vabc` is only valid with `control_mode: sinusoidal_modulation`.
- No numeric threshold may infer the control interpretation.
- DC+ and DC- must have a `dc_link` current branch.
- `output_resistance_ohm` remains visible with default `0.001` ohm.

---

### Task 1: Expose the inverter contract and allocate DC current

**Files:**
- Modify: `src/utils/vlabLibrary.ts` in `pwm_3ph_2level` near line 5838
- Modify: `src/utils/vlabLibrary.test.ts`
- Modify: `src/engine/vlab/DAEAssembler.ts` in the `pwm_3ph_2level` case near line 572
- Create: `src/engine/vlab/threePhaseInverterModel.test.ts`

**Interfaces:** Produces ports `vabc, ma, mb, mc, p, n, a, b, c` and branches `[Idc, Ia, Ib, Ic]`.

- [ ] **Step 1: Write failing library and DAE tests**

```ts
it('exposes an explicit inverter control contract', () => {
  const inverter = VLAB_LIBRARY.flatMap(d => d.blocks).find(b => b.id === 'pwm_3ph_2level');
  expect(inverter?.params.model_mode).toEqual({ value: 'averaged', unit: '', label: 'Model Mode' });
  expect(inverter?.params.control_mode).toEqual({ value: 'three_phase_modulation', unit: '', label: 'Control Mode' });
  expect(inverter?.params.output_frequency_hz).toEqual({ value: 50, unit: 'Hz', label: 'Output Frequency' });
  expect(inverter?.params.output_resistance_ohm).toEqual({ value: 0.001, unit: 'ohm', label: 'Output Resistance' });
  expect(inverter?.ports.map(p => p.id)).toEqual(['vabc', 'ma', 'mb', 'mc', 'p', 'n', 'a', 'b', 'c']);
});

it('allocates DC-link and phase-current branches', () => {
  const node: Node = { id: 'inv', type: 'pwm_3ph_2level', position: { x: 0, y: 0 }, data: { blockId: 'pwm_3ph_2level' } };
  const names = new DAEAssembler().assemble([node], []).variableNames;
  expect(names.filter(name => name.startsWith('inv_branch_'))).toEqual([
    'inv_branch_dc_link', 'inv_branch_current_a', 'inv_branch_current_b', 'inv_branch_current_c'
  ]);
});
```

- [ ] **Step 2: Verify RED**

Run `npx vitest run src/utils/vlabLibrary.test.ts src/engine/vlab/threePhaseInverterModel.test.ts --reporter=dot`.

Expected: failure because the parameters, the three controls, and `dc_link` are absent.

- [ ] **Step 3: Implement the smallest contract change**

Set library parameters to:

```ts
model_mode: { value: 'averaged', unit: '', label: 'Model Mode' },
control_mode: { value: 'three_phase_modulation', unit: '', label: 'Control Mode' },
output_frequency_hz: { value: 50, unit: 'Hz', label: 'Output Frequency' },
f_sw: { value: 5000, unit: 'Hz', label: 'Switch Freq' },
output_resistance_ohm: { value: 0.001, unit: 'ohm', label: 'Output Resistance' }
```

Add physical ports `ma`, `mb`, and `mc` immediately after legacy `vabc`. Replace the assembler case with:

```ts
case 'pwm_3ph_2level':
  branches.push({ name: 'dc_link', ports: [{ id: 'p', sign: -1 }, { id: 'n', sign: 1 }] });
  branches.push({ name: 'current_a', ports: [{ id: 'a', sign: -1 }, { id: 'n', sign: 1 }] });
  branches.push({ name: 'current_b', ports: [{ id: 'b', sign: -1 }, { id: 'n', sign: 1 }] });
  branches.push({ name: 'current_c', ports: [{ id: 'c', sign: -1 }, { id: 'n', sign: 1 }] });
  break;
```

- [ ] **Step 4: Verify GREEN and commit**

Run `npx vitest run src/utils/vlabLibrary.test.ts src/engine/vlab/threePhaseInverterModel.test.ts --reporter=dot`; expect PASS. Then run `git add src/utils/vlabLibrary.ts src/utils/vlabLibrary.test.ts src/engine/vlab/DAEAssembler.ts src/engine/vlab/threePhaseInverterModel.test.ts` and `git commit -m "feat(vlab): expose inverter control contract"`.

### Task 2: Implement the explicit averaged model and documented 50 Hz behavior

**Files:**
- Modify: `src/engine/vlab/vlabEquations.ts` in `pwm_3ph_2level` near line 1205
- Modify: `src/engine/vlab/vlabComponentDefinitions.ts` in `pwm_3ph_2level` near line 1083
- Modify: `src/engine/vlab/threePhaseInverterModel.test.ts`
- Modify: `src/engine/vlab/labs_sim.test.ts` and `src/engine/vlab/vlab_comprehensive.test.ts` only where a legacy `vabc` diagram must declare `sinusoidal_modulation`.

**Interfaces:** Consumes `branch = [Idc, Ia, Ib, Ic]` and ports in Task 1. Produces residuals `[Idc relation, Va, Vb, Vc]`.

- [ ] **Step 1: Write failing equation tests**

```ts
const residuals = (time: number, params: Record<string, unknown>) => blockEquations.pwm_3ph_2level({
  across: [0.4, 0.7, 0.5, 0.3, 160, 0, 0, 0, 0], dAcross: Array(9).fill(0),
  branch: [0, 2, -1, -1], dBranch: [0, 0, 0, 0], state: [], dState: [], params,
  ctx: { time, dt: 1e-5, parameters: {}, prevStates: [], states: [], stateDerivatives: [] },
  ports: ['vabc', 'ma', 'mb', 'mc', 'p', 'n', 'a', 'b', 'c'], nodeId: 'inv'
});

it('uses explicit three-phase modulation and conserves DC-link power', () => {
  const r = residuals(0, { model_mode: 'averaged', control_mode: 'three_phase_modulation', output_resistance_ohm: 0.001 });
  expect(r).toHaveLength(4);
  expect(r[0]).toBeCloseTo(2 * 0.7 + -1 * 0.5 + -1 * 0.3);
  expect(r.slice(1)).toEqual([-112.002, -80.001, -48.001]);
});

it('repeats its legacy sinusoidal reference after five 50 Hz cycles in 0.1 seconds', () => {
  const p = { model_mode: 'averaged', control_mode: 'sinusoidal_modulation', output_frequency_hz: 50, output_resistance_ohm: 0.001 };
  expect(residuals(0, p).slice(1)).toEqual(residuals(0.1, p).slice(1));
});
```

- [ ] **Step 2: Verify RED**

Run `npx vitest run src/engine/vlab/threePhaseInverterModel.test.ts --reporter=dot`.

Expected: failure because the existing model yields three residuals, has no DC-link equation, and uses hidden `314.159`.

- [ ] **Step 3: Implement averaged reference resolution**

Use this implementation shape, with port values in the exact order defined in Task 1:

```ts
const clamp = (value: number) => Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
const refs = params.control_mode === 'sinusoidal_modulation'
  ? [0, -2 * Math.PI / 3, 2 * Math.PI / 3].map(offset => 0.5 + 0.4 * clamp(across[0]) * Math.sin(2 * Math.PI * (params.output_frequency_hz ?? 50) * ctx.time + offset))
  : [clamp(across[1]), clamp(across[2]), clamp(across[3])];
const [ma, mb, mc] = refs;
const Vdc = across[4] - across[5];
const Rout = params.output_resistance_ohm ?? 0.001;
const [Idc, Ia, Ib, Ic] = branch;
return [
  Idc + ma * Ia + mb * Ib + mc * Ic,
  across[6] - (across[5] + Vdc * ma) - Ia * Rout,
  across[7] - (across[5] + Vdc * mb) - Ib * Rout,
  across[8] - (across[5] + Vdc * mc) - Ic * Rout
];
```

Update the component definition to show `Vx = Vn + Vdc * mx` and state explicitly that averaged mode has no PWM ripple. Update legacy scenario nodes to include `control_mode: 'sinusoidal_modulation'` rather than relying on value magnitude.

- [ ] **Step 4: Verify GREEN and commit**

Run `npx vitest run src/engine/vlab/threePhaseInverterModel.test.ts src/engine/vlab/labs_sim.test.ts src/engine/vlab/vlab_comprehensive.test.ts --reporter=dot`; expect PASS. Then run `git add src/engine/vlab/vlabEquations.ts src/engine/vlab/vlabComponentDefinitions.ts src/engine/vlab/threePhaseInverterModel.test.ts src/engine/vlab/labs_sim.test.ts src/engine/vlab/vlab_comprehensive.test.ts` and `git commit -m "fix(vlab): model averaged inverter DC power"`.

### Task 3: Implement switch-level PWM and final verification

**Files:**
- Modify: `src/engine/vlab/vlabEquations.ts` in `pwm_3ph_2level`
- Modify: `src/engine/vlab/vlabComponentDefinitions.ts` in `pwm_3ph_2level`
- Modify: `src/engine/vlab/threePhaseInverterModel.test.ts`

**Interfaces:** Uses Task 2 references. When `model_mode === 'switching'`, it uses a triangular carrier at `f_sw` and substitutes three binary gate values in all Task 2 equations.

- [ ] **Step 1: Write failing switching tests**

```ts
it('uses f_sw only in switching mode', () => {
  const common = { control_mode: 'three_phase_modulation', output_resistance_ohm: 0.001 };
  expect(residuals(0.00017, { ...common, model_mode: 'averaged', f_sw: 1000 }))
    .toEqual(residuals(0.00017, { ...common, model_mode: 'averaged', f_sw: 20000 }));
  expect(residuals(0.00017, { ...common, model_mode: 'switching', f_sw: 1000 }))
    .not.toEqual(residuals(0.00017, { ...common, model_mode: 'switching', f_sw: 20000 }));
});
```

- [ ] **Step 2: Verify RED**

Run `npx vitest run src/engine/vlab/threePhaseInverterModel.test.ts --reporter=dot`.

Expected: failure because current code ignores `model_mode` and `f_sw`.

- [ ] **Step 3: Implement a normalized triangular carrier**

```ts
const carrierPhase = (ctx.time * Math.max(1, params.f_sw ?? 5000)) % 1;
const carrier = carrierPhase < 0.5 ? 2 * carrierPhase : 2 - 2 * carrierPhase;
const duties = params.model_mode === 'switching' ? refs.map(ref => ref >= carrier ? 1 : 0) : refs;
```

Destructure `duties` in place of `refs` before building DC and phase residuals. Extend the component description with the triangular-carrier rule and the fact that switching mode produces two voltage levels and ripple.

- [ ] **Step 4: Verify the complete change and commit**

Run `npx vitest run src/utils/vlabLibrary.test.ts src/engine/vlab/threePhaseInverterModel.test.ts src/engine/vlab/labs_sim.test.ts src/engine/vlab/vlab_comprehensive.test.ts src/engine/vlab/vlab_full_certification.test.ts --reporter=dot`; expect PASS. Run `git diff --check` and `npx tsc --noEmit`; if TypeScript errors remain, report only errors proven unrelated to these files. Then run `git add src/engine/vlab/vlabEquations.ts src/engine/vlab/vlabComponentDefinitions.ts src/engine/vlab/threePhaseInverterModel.test.ts` and `git commit -m "feat(vlab): add switch-level inverter PWM"`.
