# Three-Level PWM Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a physical, three-level PWM generator with explicit scalar gate/modulation outputs and neutral-point-aware switching.

**Architecture:** `vlabLibrary` defines nine physical ports and visible parameters. `DAEAssembler` allocates six output branches. `blockEquations.pwm_3ph_3level` generates 50 Hz references, two `f_sw` carriers, and `-1/0/+1` gates. Component-definition text and tests document the same mapping.

**Tech Stack:** TypeScript, Vitest, VLab DAE assembler.

## Global Constraints

- Keep block id `pwm_3ph_3level`.
- Inputs: `vabc`, `vdc`, `vneut`; outputs: `ga`, `gb`, `gc`, `ma`, `mb`, `mc`.
- Every port is `Physical`; output branches are scalar and explicit.
- `f_sw` and `output_frequency_hz` are visible parameters.
- Gate values are exactly `-1`, `0`, or `+1`.
- No `|| 0.5` fallback for `vabc`; zero must remain zero.
- The block must not read or write shared `grid_freq` state.

---

### Task 1: Define ports and DAE output branches

**Files:**
- Modify: `src/utils/vlabLibrary.ts` in `pwm_3ph_3level` near line 5931
- Modify: `src/utils/vlabLibrary.test.ts`
- Modify: `src/engine/vlab/DAEAssembler.ts` in the component switch near line 572
- Create: `src/engine/vlab/threeLevelPwmModel.test.ts`

- [ ] **Step 1: Write failing contract tests**

```ts
it('exposes physical inputs and scalar outputs', () => {
  const block = VLAB_LIBRARY.flatMap(domain => domain.blocks).find(item => item.id === 'pwm_3ph_3level');
  expect(block?.ports.map(port => port.id)).toEqual(['vabc', 'vdc', 'vneut', 'ga', 'gb', 'gc', 'ma', 'mb', 'mc']);
  expect(block?.ports.every(port => port.domain === 'Physical')).toBe(true);
  expect(block?.params.output_frequency_hz).toEqual({ value: 50, unit: 'Hz', label: 'Output Frequency' });
  expect(block?.params.neutral_balance_gain).toEqual({ value: 0.1, unit: '1/V', label: 'Neutral Balance Gain' });
});

it('allocates one branch for each three-level output', () => {
  const node: Node = { id: 'pwm', type: 'pwm_3ph_3level', position: { x: 0, y: 0 }, data: { blockId: 'pwm_3ph_3level' } };
  const names = new DAEAssembler().assemble([node], []).variableNames;
  expect(names.filter(name => name.startsWith('pwm_branch_'))).toEqual([
    'pwm_branch_ga', 'pwm_branch_gb', 'pwm_branch_gc',
    'pwm_branch_ma', 'pwm_branch_mb', 'pwm_branch_mc'
  ]);
});
```

- [ ] **Step 2: Run RED**

Run `npx vitest run src/utils/vlabLibrary.test.ts src/engine/vlab/threeLevelPwmModel.test.ts --reporter=dot`; expected failure because the old ports and branch case do not exist.

- [ ] **Step 3: Implement the contract**

Set library parameters to `f_sw: { value: 2000, unit: 'Hz', label: 'Switch Freq' }`, `output_frequency_hz: { value: 50, unit: 'Hz', label: 'Output Frequency' }`, and `neutral_balance_gain: { value: 0.1, unit: '1/V', label: 'Neutral Balance Gain' }`. Replace ports with the nine IDs above, each with `domain: 'Physical'`.

Add this DAE case:

```ts
case 'pwm_3ph_3level':
  for (const name of ['ga', 'gb', 'gc', 'ma', 'mb', 'mc']) {
    branches.push({ name, ports: [{ id: name, sign: 1 }] });
  }
  break;
```

- [ ] **Step 4: Run GREEN and commit**

Run the targeted tests and expect PASS. Commit with `git add src/utils/vlabLibrary.ts src/utils/vlabLibrary.test.ts src/engine/vlab/DAEAssembler.ts src/engine/vlab/threeLevelPwmModel.test.ts; git commit -m "feat(vlab): define three-level PWM ports"`.

### Task 2: Implement references, carriers, neutral balancing, and equations

**Files:**
- Modify: `src/engine/vlab/vlabEquations.ts` in `pwm_3ph_3level` near line 2288
- Modify: `src/engine/vlab/vlabComponentDefinitions.ts` in `pwm_3ph_3level` near line 1094
- Modify: `src/engine/vlab/threeLevelPwmModel.test.ts`

- [ ] **Step 1: Write failing behavior tests**

```ts
const evaluate = (time: number, across = [0.8, 100, 0], params = { f_sw: 2000, output_frequency_hz: 50, neutral_balance_gain: 0.1 }) => blockEquations.pwm_3ph_3level({
  across, dAcross: [0, 0, 0], branch: [0, 0, 0, 0, 0, 0], dBranch: [], state: [], dState: [], params,
  ctx: { time, dt: 1e-5, parameters: {}, prevStates: [], states: [], stateDerivatives: [] },
  ports: ['vabc', 'vdc', 'vneut', 'ga', 'gb', 'gc', 'ma', 'mb', 'mc'], nodeId: 'pwm'
});

it('keeps zero vabc as zero modulation amplitude', () => {
  const r = evaluate(0, [0, 100, 0]);
  expect(r[3]).toBeCloseTo(0);
  expect(r[4]).toBeCloseTo(0);
  expect(r[5]).toBeCloseTo(0);
});

it('returns six residuals with three-level gates and modulation values', () => {
  const r = evaluate(0.0001);
  expect(r).toHaveLength(6);
  const gates = r.slice(0, 3).map(value => -value);
  expect(gates.every(value => [-1, 0, 1].includes(value))).toBe(true);
});

it('uses f_sw and neutral inputs', () => {
  expect(evaluate(0.00013, [0.8, 100, 0], { f_sw: 1000, output_frequency_hz: 50, neutral_balance_gain: 0.1 }))
    .not.toEqual(evaluate(0.00013, [0.8, 100, 0], { f_sw: 4000, output_frequency_hz: 50, neutral_balance_gain: 0.1 }));
  expect(evaluate(0.00013, [0.8, 100, 0.2])).not.toEqual(evaluate(0.00013, [0.8, 100, -0.2]));
});
```

- [ ] **Step 2: Run RED**

Run `npx vitest run src/engine/vlab/threeLevelPwmModel.test.ts --reporter=dot`; expected failure because the old equation returns only three sinusoidal branches and ignores `f_sw`, `vdc`, and `vneut`.

- [ ] **Step 3: Implement the equation**

Use this structure, preserving the residual order `[ga, gb, gc, ma, mb, mc]`:

```ts
const amplitude = Math.max(0, Math.min(1, across[0] ?? 0.5));
const vdc = Math.abs(across[1] ?? 0);
const vneut = across[2] ?? 0;
const fOut = params.output_frequency_hz ?? 50;
const fSw = Math.max(1, params.f_sw ?? 2000);
const neutralCorrection = Math.max(-0.15, Math.min(0.15, (params.neutral_balance_gain ?? 0.1) * vneut / Math.max(vdc, 1)));
const phase = 2 * Math.PI * fOut * ctx.time;
const refs = [
  0.8 * amplitude * Math.sin(phase),
  0.8 * amplitude * Math.sin(phase - 2 * Math.PI / 3),
  0.8 * amplitude * Math.sin(phase + 2 * Math.PI / 3)
];
const carrierPhase = (ctx.time * fSw) % 1;
const carrier = carrierPhase < 0.5 ? 4 * carrierPhase - 1 : 3 - 4 * carrierPhase;
const upper = carrier + 0.5;
const lower = carrier - 0.5;
const gates = refs.map(ref => ref + neutralCorrection >= upper ? 1 : ref + neutralCorrection <= lower ? -1 : 0);
return [...gates.map((gate, index) => branch[index] - gate), ...refs.map((ref, index) => branch[index + 3] - ref)];
```

Update the component definition to document the six scalar outputs, carrier frequency, and neutral correction. Do not write to `ctx.parameters.grid_freq`.

- [ ] **Step 4: Run GREEN and regression tests**

Run `npx vitest run src/engine/vlab/threeLevelPwmModel.test.ts src/engine/vlab/vlab_full_certification.test.ts --reporter=dot`; expect the new tests to pass. Any unrelated existing Gas/Magnetic certification errors must be reported separately.

- [ ] **Step 5: Commit**

Run `git add src/engine/vlab/vlabEquations.ts src/engine/vlab/vlabComponentDefinitions.ts src/engine/vlab/threeLevelPwmModel.test.ts; git commit -m "fix(vlab): implement three-level PWM switching"`.

### Task 3: Final verification

- [ ] Run `git diff --check`.
- [ ] Run `npx vitest run src/utils/vlabLibrary.test.ts src/engine/vlab/threeLevelPwmModel.test.ts src/engine/vlab/vlab_full_certification.test.ts --reporter=dot`.
- [ ] Run `npx tsc --noEmit`; report unrelated pre-existing failures without modifying them.
- [ ] Inspect `git status --short --branch` and preserve unrelated user changes.
