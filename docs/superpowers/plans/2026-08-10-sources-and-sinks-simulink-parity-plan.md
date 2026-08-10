# Sources & Sinks 100% Simulink Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement 100% Simulink-exact C99 code generation and executable conformance test suites for `Clock` and `WaveformGen` in X-Bridges.

**Architecture:** Extend `XB_CAPABILITIES`, `xbCGenerator.ts`, and `xbCConformanceCases.ts` to support `Clock` (time accumulator) and `WaveformGen` (sine, square, triangle, sawtooth signal source) with ANSI C `<math.h>` mathematical expressions and stateful simulation time tracking.

**Tech Stack:** TypeScript, C99, Vitest, Node.js

## Global Constraints

- Code generation MUST produce strict ANSI C99 compliant code.
- Continuous time tracking MUST use double-precision floating point (`double`).
- Mathematical expressions MUST match MathWorks Simulink exact behavior for Sine, Square, Triangle, and Sawtooth waveforms.

---

### Task 1: Capability Registration for Sources & Sinks

**Files:**
- Modify: `src/utils/stateMachine/xbCapabilities.ts`
- Test: `src/utils/stateMachine/xbCGenerator.test.ts`

**Interfaces:**
- Consumes: `XB_CAPABILITIES`, `XB_C_CONFORMANCE_CASE_IDS`
- Produces: Updated `XB_CAPABILITIES` registry containing `Clock` and `WaveformGen` with valid codegen definitions.

- [ ] **Step 1: Write failing capability test**

Add to `src/utils/stateMachine/xbCGenerator.test.ts`:
```typescript
it('registers Clock and WaveformGen as C99 codegen capable blocks in XB_CAPABILITIES', () => {
  expect(XB_CAPABILITIES.Clock).toBeDefined();
  expect(XB_CAPABILITIES.Clock.codegen).toBe(true);
  expect(XB_CAPABILITIES.WaveformGen).toBeDefined();
  expect(XB_CAPABILITIES.WaveformGen.codegen).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/stateMachine/xbCGenerator.test.ts -t "registers Clock and WaveformGen"`  
Expected: FAIL if capability mappings are missing or not matching expected schema.

- [ ] **Step 3: Update `xbCapabilities.ts`**

In `src/utils/stateMachine/xbCapabilities.ts`:
Ensure `Clock` and `WaveformGen` entries in `XB_CAPABILITIES` are defined as:
```typescript
Clock: direct(scalar, undefined, undefined, ['T10-C99-WAVEFORMS'], { inputShapes: [], outputShapes: scalar }),
WaveformGen: direct(scalar, undefined, undefined, ['T10-C99-WAVEFORMS'], { inputShapes: [], outputShapes: scalar }),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/stateMachine/xbCGenerator.test.ts -t "registers Clock and WaveformGen"`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/stateMachine/xbCapabilities.ts src/utils/stateMachine/xbCGenerator.test.ts
git commit -m "feat(xb-capabilities): register Clock and WaveformGen in XB_CAPABILITIES"
```

---

### Task 2: C99 Lowering Handlers for Clock and WaveformGen

**Files:**
- Modify: `src/utils/stateMachine/xbCGenerator.ts`
- Test: `src/utils/stateMachine/xbCGenerator.test.ts`

**Interfaces:**
- Consumes: `SemanticState`, `XBSemanticOperation`, `XBStateLayout`
- Produces: Lowered C99 code for `Clock` and `WaveformGen` operations in `xbCGenerator.ts`.

- [ ] **Step 1: Write failing C99 lowering test for Clock and WaveformGen**

Add to `src/utils/stateMachine/xbCGenerator.test.ts`:
```typescript
it('generates C99 code for Clock and WaveformGen blocks', () => {
  const clockModel = createSingleBlockModel('Clock', {});
  const clockC = generateXBC99Code(clockModel);
  expect(clockC).toContain('sim_time');

  const waveModel = createSingleBlockModel('WaveformGen', {
    waveform: 'triangle',
    amplitude: 2.0,
    frequency: 5.0,
    bias: 1.0,
  });
  const waveC = generateXBC99Code(waveModel);
  expect(waveC).toContain('asin(sin(');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/stateMachine/xbCGenerator.test.ts -t "generates C99 code for Clock and WaveformGen"`  
Expected: FAIL

- [ ] **Step 3: Implement C99 lowering in `xbCGenerator.ts`**

In `src/utils/stateMachine/xbCGenerator.ts`, add handlers for `WaveformGen`:
```typescript
if (operation.type === 'WaveformGen' || operation.type === 'WAVEFORM_GEN') {
  const outputSignalId = operation.outputSignalIds[0];
  if (outputSignalId !== undefined) {
    const waveform = String(scalarParameter(operation, ['waveform', 'type'], 'sine')).toLowerCase();
    const amp = cNumber(scalarParameter(operation, ['amplitude', 'amp'], 1.0));
    const freq = cNumber(scalarParameter(operation, ['frequency', 'freq'], 1.0));
    const phase = cNumber(scalarParameter(operation, ['phase'], 0.0));
    const bias = cNumber(scalarParameter(operation, ['bias', 'offset'], 0.0));
    const prefix = `wave_${operationIndex}`;
    const lines = [
      `    double ${prefix}_t = instance->${member}.sim_time;`,
      `    double ${prefix}_arg = 2.0 * 3.14159265358979323846 * (${freq}) * ${prefix}_t + (${phase});`,
      `    double ${prefix}_val = (${bias});`,
    ];
    if (waveform === 'sine') {
      lines.push(`    ${prefix}_val += (${amp}) * sin(${prefix}_arg);`);
    } else if (waveform === 'square') {
      lines.push(`    ${prefix}_val += (${amp}) * (sin(${prefix}_arg) >= 0.0 ? 1.0 : -1.0);`);
    } else if (waveform === 'triangle') {
      lines.push(`    ${prefix}_val += (${amp}) * (2.0 / 3.14159265358979323846) * asin(sin(${prefix}_arg));`);
    } else if (waveform === 'sawtooth') {
      lines.push(`    double ${prefix}_u = (${freq}) * ${prefix}_t + (${phase}) / (2.0 * 3.14159265358979323846);`);
      lines.push(`    ${prefix}_val += (${amp}) * (2.0 * (${prefix}_u - floor(${prefix}_u)) - 1.0);`);
    } else {
      lines.push(`    ${prefix}_val += (${amp}) * sin(${prefix}_arg);`);
    }
    lines.push(...renderSignalWrite(state, operation, operationIndex, 0, outputSignalId, `${prefix}_val`, layout, member));
    return lines;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/stateMachine/xbCGenerator.test.ts -t "generates C99 code for Clock and WaveformGen"`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/stateMachine/xbCGenerator.ts src/utils/stateMachine/xbCGenerator.test.ts
git commit -m "feat(xb-codegen): implement C99 lowering for Clock and WaveformGen blocks"
```

---

### Task 3: Executable Conformance Case Registration & Suite Execution

**Files:**
- Modify: `src/utils/stateMachine/xbCConformanceCases.ts`
- Test: `src/utils/stateMachine/xbCGenerator.test.ts`

**Interfaces:**
- Consumes: `XB_EXECUTABLE_C_CASES`
- Produces: Registered `T10-C99-WAVEFORMS` executable conformance test case.

- [ ] **Step 1: Write failing test for conformance case execution**

Add to `src/utils/stateMachine/xbCGenerator.test.ts`:
```typescript
it('executes T10-C99-WAVEFORMS conformance suite without errors', () => {
  const cCase = XB_EXECUTABLE_C_CASES['T10-C99-WAVEFORMS'];
  expect(cCase).toBeDefined();
  const ir = cCase.buildModel();
  const cCode = generateXBC99Code(ir);
  expect(cCode).toBeDefined();
  expect(cCode.length).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/stateMachine/xbCGenerator.test.ts -t "executes T10-C99-WAVEFORMS"`  
Expected: FAIL if case definition is missing or model construction fails.

- [ ] **Step 3: Register `T10-C99-WAVEFORMS` in `xbCConformanceCases.ts`**

In `src/utils/stateMachine/xbCConformanceCases.ts`:
Ensure `T10-C99-WAVEFORMS` is fully populated with `buildModel` creating test nodes for `Clock` and `WaveformGen`.

- [ ] **Step 4: Run full C generator test suite**

Run: `npx vitest run src/utils/stateMachine/xbCGenerator.test.ts`  
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/stateMachine/xbCConformanceCases.ts src/utils/stateMachine/xbCGenerator.test.ts
git commit -m "test(xb-conformance): add T10-C99-WAVEFORMS conformance test suite"
```
