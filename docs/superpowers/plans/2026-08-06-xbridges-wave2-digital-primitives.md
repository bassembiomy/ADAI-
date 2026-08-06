# X-Bridges Wave 2 Digital Primitives Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add deterministic strict-C99 code generation for `DFlipFlop`, `JKFlipFlop`, `Register`, `Counter`, `Clock`, and `WaveformGen` with float32 and fixed-point boundary compatibility.

**Architecture:** Represent edge history and stored values as explicit semantic state slots. Derive time-based source output from the semantic step counter and solver step, never wall-clock time; release capabilities only after executed interpreter/C traces agree.

**Tech Stack:** TypeScript, Vitest, X-Bridges semantic IR, generated strict C99, GCC.

## Global Constraints

- Wave 1 executable-conformance registry and bounded embedded profile are prerequisites.
- Emit strict C99 using static storage, bounded loops, and no heap, recursion, VLA, or mutable globals.
- Support float32 and fixed-point together wherever numeric signals apply; logical ports remain Boolean/integer semantic values.
- Fail closed until semantic, interpreter, C, and paired executable coverage exists.
- Keep all `ROBOT_VACUUM_*`, `Note`, `ROOT_LOCUS`, and `Scope` excluded.

## File Map

- Modify `xbSemanticBuilder.ts`, `xbInterpreter.ts`, and `xbCGenerator.ts` for stateful digital/source semantics.
- Modify `xbCConformanceCases.ts` and `xbDeclaredCConformance.test.ts` for executed traces.
- Modify `xbCapabilities.ts` only at the release task.
- Extend focused builder/interpreter/generator tests and embedded documentation.

---

### Task 1: Edge-triggered flip-flops

**Files:**
- Modify: `src/utils/stateMachine/xbSemanticBuilder.ts`
- Modify: `src/utils/stateMachine/xbInterpreter.ts`
- Modify: `src/utils/stateMachine/xbCGenerator.ts`
- Test: `src/utils/stateMachine/xbSemanticBuilder.test.ts`
- Test: `src/utils/stateMachine/xbInterpreter.test.ts`

**Interfaces:**
- Produces slots `<op>:q` and `<op>:last_clk` and outputs `q`, `qbar` for `DFlipFlop` and `JKFlipFlop`.
- Consumes the existing operation state-boundary commit mechanism.

- [ ] **Step 1: Add failing reset/edge tests**

```ts
it.each([
  ['DFlipFlop', [[1, 0, 0], [1, 1, 0], [0, 1, 0]], [0, 1, 1]],
  ['JKFlipFlop', [[1, 1, 0, 0], [1, 1, 1, 0], [1, 1, 0, 0], [1, 1, 1, 0]], [0, 1, 1, 0]],
])('%s changes q only on a rising edge', (type, inputs, qTrace) => {
  expect(runDigitalTrace(type, inputs).map(frame => frame.q)).toEqual(qTrace);
});
```

- [ ] **Step 2: Confirm RED**

Run: `npx vitest run src/utils/stateMachine/xbInterpreter.test.ts -t "rising edge"`

Expected: FAIL as both types are host-only.

- [ ] **Step 3: Implement canonical and C state transitions**

Use `rising = !last_clk && clk`. Reset has highest priority. DFF samples Boolean `d`; JK applies hold/reset/set/toggle for `00/01/10/11`. Always emit `qbar = !q`. Commit `q` and `last_clk` only at the state boundary so multiple reads in one step see the old state.

```c
const bool rising = (!state_last_clk) && clk;
bool next_q = state_q;
if (rst) next_q = false;
else if (rising) next_q = d;
q = next_q;
qbar = !next_q;
```

- [ ] **Step 4: Run focused tests**

Run: `npx vitest run src/utils/stateMachine/xbSemanticBuilder.test.ts src/utils/stateMachine/xbInterpreter.test.ts src/utils/stateMachine/xbCGenerator.test.ts -t "FlipFlop"`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/stateMachine/xbSemanticBuilder.ts src/utils/stateMachine/xbInterpreter.ts src/utils/stateMachine/xbCGenerator.ts src/utils/stateMachine/xbSemanticBuilder.test.ts src/utils/stateMachine/xbInterpreter.test.ts src/utils/stateMachine/xbCGenerator.test.ts
git commit -m "feat: add embedded flip-flop semantics"
```

### Task 2: Register and counter

**Files:**
- Modify: `src/utils/stateMachine/xbSemanticBuilder.ts`
- Modify: `src/utils/stateMachine/xbInterpreter.ts`
- Modify: `src/utils/stateMachine/xbCGenerator.ts`
- Modify: `src/utils/stateMachine/xbCConformanceCases.ts`

**Interfaces:**
- Produces static `bitWidth` register storage and `maxValue` counter storage with reset/enable/rising-edge priority.
- Produces executable cases `XB-W2-DIGITAL-F32` and `XB-W2-DIGITAL-FIXED`.

- [ ] **Step 1: Add failing boundary tests**

```ts
it('masks an 8-bit Register sample and holds while disabled', () => {
  expect(runRegisterTrace(8, [[511, 0, 1, 0], [511, 1, 1, 0], [7, 0, 0, 0], [7, 1, 0, 0]])).toEqual([0, 255, 255, 255]);
});

it('wraps Counter at maxValue plus one', () => {
  expect(runCounterTrace(2, sixEnabledEdges)).toEqual([0, 1, 2, 0, 1, 2]);
});
```

- [ ] **Step 2: Confirm RED**

Run: `npx vitest run src/utils/stateMachine/xbInterpreter.test.ts -t "Register|Counter"`

Expected: FAIL on unsupported blocks.

- [ ] **Step 3: Implement bounded integer semantics**

Validate `bitWidth` as integer `1..32`, derive mask without shifting by 32, and store in `uint32_t`. Validate `maxValue` as integer `0..UINT32_MAX`; counter update is `count >= maxValue ? 0U : count + 1U`. Treat non-finite or negative numeric register input under the existing numeric-fault policy before conversion.

- [ ] **Step 4: Register and execute paired cases**

Cover reset asserted with an edge, disabled edge, held-high clock, wraparound, widths 1/8/32, float32 input conversion, and fixed-point input conversion.

Run: `npx vitest run src/utils/stateMachine/xbDeclaredCConformance.test.ts -t "XB-W2-DIGITAL"`

Expected: PASS for both profiles.

- [ ] **Step 5: Commit**

```bash
git add src/utils/stateMachine/xbSemanticBuilder.ts src/utils/stateMachine/xbInterpreter.ts src/utils/stateMachine/xbCGenerator.ts src/utils/stateMachine/xbCConformanceCases.ts src/utils/stateMachine/xbInterpreter.test.ts
git commit -m "feat: add bounded register and counter generation"
```

### Task 3: Deterministic Clock and WaveformGen

**Files:**
- Modify: `src/utils/stateMachine/xbSemanticModel.ts`
- Modify: `src/utils/stateMachine/xbSemanticBuilder.ts`
- Modify: `src/utils/stateMachine/xbInterpreter.ts`
- Modify: `src/utils/stateMachine/xbCGenerator.ts`
- Modify: `src/utils/stateMachine/xbCConformanceCases.ts`

**Interfaces:**
- Produces a read-only operation time `stepIndex * solver.stepSeconds` available identically to interpreter and C.
- Produces `XB-W2-SOURCES-F32` and `XB-W2-SOURCES-FIXED`.

- [ ] **Step 1: Add failing source traces**

```ts
it('derives Clock and WaveformGen from semantic time', () => {
  expect(runSourceTrace(0.25, 5)).toEqual({
    clock: [0, 0, 1, 1, 0],
    sine: [1, 3, 1, -1, 1],
  });
});
```

- [ ] **Step 2: Confirm RED**

Run: `npx vitest run src/utils/stateMachine/xbInterpreter.test.ts -t "semantic time"`

Expected: FAIL because source operations lack canonical time semantics.

- [ ] **Step 3: Implement source equations**

Define `Clock` as `fmodf(timeSeconds * frequency, 1.0F) < 0.5F ? 0 : 1`. Define `WaveformGen` using `angle = 2*pi*frequency*time + phase`, then `offset + amplitude*sinf(angle)` or the square sign. Validate finite frequency/amplitude/offset/phase, frequency `>= 0`, and waveform type exactly `Sine` or `Square`. Fixed output passes through the standard quantizer; generated C uses no static/global clock.

- [ ] **Step 4: Execute source conformance**

Run: `npx vitest run src/utils/stateMachine/xbDeclaredCConformance.test.ts -t "XB-W2-SOURCES"`

Expected: PASS for start time, period boundaries, phase, zero frequency, and fixed saturation.

- [ ] **Step 5: Commit**

```bash
git add src/utils/stateMachine/xbSemanticModel.ts src/utils/stateMachine/xbSemanticBuilder.ts src/utils/stateMachine/xbInterpreter.ts src/utils/stateMachine/xbCGenerator.ts src/utils/stateMachine/xbCConformanceCases.ts src/utils/stateMachine/xbInterpreter.test.ts
git commit -m "feat: add deterministic embedded waveform sources"
```

### Task 4: Capability release and verification

**Files:**
- Modify: `src/utils/stateMachine/xbCapabilities.ts`
- Modify: `src/utils/stateMachine/xbCapabilities.test.ts`
- Modify: `docs/XBRIDGES_EMBEDDED_CODEGEN.md`

**Interfaces:**
- Enables exactly the six Wave 2 blocks using the four executed case IDs.

- [ ] **Step 1: Add failing capability assertions**

```ts
it.each(['DFlipFlop', 'JKFlipFlop', 'Register', 'Counter', 'Clock', 'WaveformGen'])('%s is released with executed paired coverage', type => {
  const cap = getXBBlockCapability(type)!;
  expect(cap.codegen).toBe(true);
  expect(cap.cConformanceCaseIds?.length).toBeGreaterThanOrEqual(2);
});
```

- [ ] **Step 2: Enable exact scalar/logical shapes and case IDs**

Remove only these names from the unclassified host-only set and declare statefulness/direct-feedthrough correctly. Do not enable `SWITCH_CASE` or any excluded block.

- [ ] **Step 3: Run the release gate**

Run: `npx vitest run src/utils/stateMachine/xbCapabilities.test.ts src/utils/stateMachine/xbDeclaredCConformance.test.ts src/utils/stateMachine/smDifferential.test.ts && npm run build:sm-runtime && npx tsc --noEmit`

Expected: PASS, all four Wave 2 executable cases run, and TypeScript reports zero errors.

- [ ] **Step 4: Document semantics and commit**

```bash
git add src/utils/stateMachine/xbCapabilities.ts src/utils/stateMachine/xbCapabilities.test.ts docs/XBRIDGES_EMBEDDED_CODEGEN.md src/generated/stateMachineRuntimeBundle.ts
git commit -m "feat: release X-Bridges digital primitives wave"
```

