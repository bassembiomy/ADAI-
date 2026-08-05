# IF_ELSE Block Strict C99 Code Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Promote `IF_ELSE` to full dual executable conformance (`codegen: true`) so that state machine diagrams containing `IF_ELSE` pass semantic model validation and generate valid strict C99 code.

**Architecture:** Register `IF_ELSE` in `xbCapabilities.ts` under `SIGNAL_ROUTING_COVERAGE`, implement evaluation handling in `xbInterpreter.ts`, C code rendering in `xbCGenerator.ts`, and cover with TDD tests across `xbCapabilities.test.ts`, `xbInterpreter.test.ts`, `xbCGenerator.test.ts`, and `xbSemanticValidator.test.ts`.

**Tech Stack:** TypeScript, C99 Code Generator, Vitest

## Global Constraints

- Spec: `g:\adia project\docs\superpowers\specs\2026-08-05-if-else-codegen-design.md`
- Preserve all existing public API signatures and exports.
- Follow strict TDD (failing test -> run -> implement -> run -> commit).
- File paths:
  - Capabilities: `src/utils/stateMachine/xbCapabilities.ts`
  - Capabilities test: `src/utils/stateMachine/xbCapabilities.test.ts`
  - Interpreter: `src/utils/stateMachine/xbInterpreter.ts`
  - Interpreter test: `src/utils/stateMachine/xbInterpreter.test.ts`
  - C Generator: `src/utils/stateMachine/xbCGenerator.ts`
  - C Generator test: `src/utils/stateMachine/xbCGenerator.test.ts`
  - Semantic Validator test: `src/utils/stateMachine/xbSemanticValidator.test.ts`

---

### Task 1: Register IF_ELSE Block Capabilities

**Files:**
- Modify: `src/utils/stateMachine/xbCapabilities.ts`
- Test: `src/utils/stateMachine/xbCapabilities.test.ts`

**Interfaces:**
- Produces: `IF_ELSE` registered in `XB_CAPABILITIES` with `codegen: true` and case IDs `'T10-INT-SIGNAL-ROUTING'` and `'T10-C99-SIGNAL-ROUTING'`.

- [ ] **Step 1: Write failing test in `src/utils/stateMachine/xbCapabilities.test.ts`**

```typescript
it('declares executable conformance coverage for IF_ELSE block', () => {
  const cap = getXBBlockCapability('IF_ELSE');
  expect(cap?.codegen).toBe(true);
  expect(cap?.interpreterConformanceCaseIds).toContain('T10-INT-SIGNAL-ROUTING');
  expect(cap?.cConformanceCaseIds).toContain('T10-C99-SIGNAL-ROUTING');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/stateMachine/xbCapabilities.test.ts`
Expected: FAIL because `IF_ELSE` currently has `codegen: false`.

- [ ] **Step 3: Update `src/utils/stateMachine/xbCapabilities.ts`**

1. Add `'IF_ELSE'` to `SIGNAL_ROUTING_COVERAGE` array.
2. Remove `'IF_ELSE'` from `UNCLASSIFIED_HOST_ONLY`.
3. Add `IF_ELSE` entry to `XB_CAPABILITIES`:
   `IF_ELSE: direct(allShapes, undefined, ['T10-INT-SIGNAL-ROUTING'], ['T10-C99-SIGNAL-ROUTING']),`

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/stateMachine/xbCapabilities.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/stateMachine/xbCapabilities.ts src/utils/stateMachine/xbCapabilities.test.ts
git commit -m "feat(xb): register IF_ELSE capability in signal routing conformance manifests"
```

---

### Task 2: Canonical Interpreter Implementation for IF_ELSE

**Files:**
- Modify: `src/utils/stateMachine/xbInterpreter.ts`
- Test: `src/utils/stateMachine/xbInterpreter.test.ts`

**Interfaces:**
- Produces: Evaluation handling for `IF_ELSE` in `evaluateDirectOperation`.

- [ ] **Step 1: Write failing test in `src/utils/stateMachine/xbInterpreter.test.ts`**

```typescript
it('evaluates IF_ELSE routing operation correctly', () => {
  const ifElseOp = operation('ifelse', 'IF_ELSE', ['cond', 'trueVal', 'falseVal'], ['ifelse:y']);
  const signalsTrue = {
    'ifelse:cond': signal([1]),
    'ifelse:trueVal': signal([42]),
    'ifelse:falseVal': signal([99]),
    'ifelse:y': signal([0]),
  };
  const resultTrue = evaluateDirectOperation(ifElseOp, signalsTrue);
  expect(resultTrue).toEqual([[42]]);

  const signalsFalse = {
    'ifelse:cond': signal([0]),
    'ifelse:trueVal': signal([42]),
    'ifelse:falseVal': signal([99]),
    'ifelse:y': signal([0]),
  };
  const resultFalse = evaluateDirectOperation(ifElseOp, signalsFalse);
  expect(resultFalse).toEqual([[99]]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/stateMachine/xbInterpreter.test.ts`
Expected: FAIL because `IF_ELSE` is not handled in `evaluateDirectOperation`.

- [ ] **Step 3: Update `src/utils/stateMachine/xbInterpreter.ts`**

Add case for `'IF_ELSE'` in `evaluateDirectOperation`:
```typescript
    case 'IF_ELSE': {
      const cond = inputs[0]?.[0];
      const threshold = Number(parameter(operation, ['threshold', 'Threshold'], 0.5));
      const pass = cond !== undefined && (Boolean(cond) && (typeof cond === 'boolean' || cond >= threshold || Number(cond) !== 0));
      return [pass ? (inputs[1] ?? [0]) : (inputs[2] ?? [0])];
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/stateMachine/xbInterpreter.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/stateMachine/xbInterpreter.ts src/utils/stateMachine/xbInterpreter.test.ts
git commit -m "feat(xb): implement IF_ELSE canonical interpreter evaluation"
```

---

### Task 3: C Code Generator Implementation for IF_ELSE

**Files:**
- Modify: `src/utils/stateMachine/xbCGenerator.ts`
- Test: `src/utils/stateMachine/xbCGenerator.test.ts`

**Interfaces:**
- Produces: `emitIfElse` emitter for `IF_ELSE` in `xbCGenerator.ts`.

- [ ] **Step 1: Write failing test in `src/utils/stateMachine/xbCGenerator.test.ts`**

```typescript
it('generates C code for IF_ELSE routing block', () => {
  const result = renderOperation(
    'IF_ELSE',
    ['cond', 'u_true', 'u_false'],
    ['y'],
  );
  expect(result).toContain('SM_XB_Truth');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/stateMachine/xbCGenerator.test.ts`
Expected: FAIL because `IF_ELSE` is not in `OPERATION_EMITTERS`.

- [ ] **Step 3: Update `src/utils/stateMachine/xbCGenerator.ts`**

1. Define `emitIfElse`:
```typescript
const emitIfElse = emitSingleOutput((inputs, operation) => {
  const threshold = cNumber(
    scalarParameter(operation, ['threshold', 'Threshold'], 0.5),
  );
  const cond = inputs[0] ?? '0.0';
  const trueVal = inputs[1] ?? '0.0';
  const falseVal = inputs[2] ?? '0.0';
  return `((SM_XB_Truth(${cond}) && (${cond}) >= ${threshold}) ? (${trueVal}) : (${falseVal}))`;
});
```
2. Map `IF_ELSE: emitIfElse` in `OPERATION_EMITTERS`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/stateMachine/xbCGenerator.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/stateMachine/xbCGenerator.ts src/utils/stateMachine/xbCGenerator.test.ts
git commit -m "feat(xb): implement IF_ELSE strict C99 emitter"
```

---

### Task 4: Semantic Validation & End-to-End Probe Verification

**Files:**
- Test: `src/utils/stateMachine/xbSemanticValidator.test.ts`

- [ ] **Step 1: Add semantic validator test for `IF_ELSE` in `src/utils/stateMachine/xbSemanticValidator.test.ts`**

```typescript
it('validates IF_ELSE blocks cleanly without XB_BLOCK_NOT_CODEGEN_CAPABLE error', () => {
  const diagnostics = validateXBridgesModel({
    nodes: [node('ifelse1', 'IF_ELSE')],
    edges: [],
  });
  expect(diagnostics.find((d) => d.code === 'XB_BLOCK_NOT_CODEGEN_CAPABLE')).toBeUndefined();
});
```

- [ ] **Step 2: Run all state machine vitest suites**

Run: `npx vitest run src/utils/stateMachine/`
Expected: PASS across all test files.

- [ ] **Step 3: Verify model JSON code generation using node / tsx**

Run: `npx tsx -e "import fs from 'fs'; import { generateMISRACCode } from './src/utils/stateMachineCodeGenerator'; const data = JSON.parse(fs.readFileSync('C:/Users/EL-Dawlia/Downloads/delay/New folder/statemachine-xbridges-master-batch2b-routing-probe.json', 'utf8')); const res = generateMISRACCode(data); console.log('Errors count:', res.errors.length); if (res.errors.length > 0) console.log(res.errors);"`
Expected: `Errors count: 0`

- [ ] **Step 4: Commit**

```bash
git add src/utils/stateMachine/xbSemanticValidator.test.ts
git commit -m "test(xb): verify IF_ELSE semantic validation and end-to-end code generation"
```
