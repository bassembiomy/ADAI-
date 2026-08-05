# X-Bridges Code-Generation Assurance Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every enabled X-Bridges generated-C capability fail closed on incompatible wiring and carry executable strict-C99 evidence, including a deterministic regression of the supplied state-machine model.

**Architecture:** Strengthen the persisted-model validator at the edge boundary, then drive compiled-C conformance from executable case definitions whose coverage records are derived from the cases actually run. Keep the supplied JSON unchanged by reproducing its relevant state/X-Bridges structure in a repository fixture and applying an explicit test input.

**Tech Stack:** TypeScript 5, Vitest 4, generated static C99, host GCC, existing semantic interpreter/differential harness.

## Global Constraints

- Preserve the current state-machine and X-Bridges execution order.
- Keep `C:\Users\EL-Dawlia\Downloads\xv\statemachine-history-xbridges-timing-fixed.json` unchanged.
- Compile every required C conformance case with `-std=c99 -pedantic-errors -Wall -Wextra -Werror`.
- Unknown, incompatible, or under-evidenced embedded behavior must fail closed.
- Do not claim target compiler, MCU, HIL, WCET, MISRA, ISO 26262, or IEC 61508 qualification.
- Preserve unrelated user files and untracked worktree content.

---

### Task 1: Reject incompatible X-Bridges edges

**Files:**
- Modify: `src/utils/stateMachine/xbSemanticValidator.ts:332-525`
- Test: `src/utils/stateMachine/xbSemanticValidator.test.ts`

**Interfaces:**
- Consumes: existing `PortDescriptor`, `canonicalPortType`, and `validateXBModel` edge resolution.
- Produces: error diagnostic code `XB_EDGE_INCOMPATIBLE` before semantic IR generation.

- [ ] **Step 1: Add failing shape and dimension tests**

Add a helper that constructs a source and destination with explicit port contracts, then add tests equivalent to:

```ts
it.each([
  {
    name: 'different shapes',
    source: { shape: 'scalar' as const, dimensions: [] },
    target: { shape: 'vector' as const, dimensions: [2] },
  },
  {
    name: 'different vector lengths',
    source: { shape: 'vector' as const, dimensions: [2] },
    target: { shape: 'vector' as const, dimensions: [4] },
  },
  {
    name: 'different matrix dimensions',
    source: { shape: 'matrix' as const, dimensions: [2, 2] },
    target: { shape: 'matrix' as const, dimensions: [1, 4] },
  },
])('rejects edge ports with $name', ({ source, target }) => {
  expect(edgeCodes(source, target)).toContain('XB_EDGE_INCOMPATIBLE');
});
```

- [ ] **Step 2: Add failing numeric compatibility tests**

Cover direct `float32 -> boolean` rejection and `float32 ->
DATA_TYPE_CONVERSION(boolean)` acceptance. Assert that a dangling endpoint emits
only `XB_PORT_DANGLING`, not `XB_EDGE_INCOMPATIBLE`.

- [ ] **Step 3: Run the focused test and verify RED**

Run:

```powershell
npx vitest run src/utils/stateMachine/xbSemanticValidator.test.ts --reporter=verbose --maxWorkers=1
```

Expected: new incompatibility assertions fail because the validator currently
checks endpoint existence only.

- [ ] **Step 4: Implement exact edge compatibility**

After resolving both endpoint descriptors, compute:

```ts
const sameShape = source.shape === destination.shape;
const sameDimensions = source.dimensions.length === destination.dimensions.length
  && source.dimensions.every((value, index) => value === destination.dimensions[index]);
const sourceType = canonicalPortType(source.dataType);
const destinationType = canonicalPortType(destination.dataType);
const destinationNode = nodesById.get(edge.targetNodeId);
const explicitConversion = destinationNode?.type === 'DATA_TYPE_CONVERSION'
  || destinationNode?.type === 'NUMERIC_REPRESENTATION';
const sameNumericType = sourceType === null
  || destinationType === null
  || sourceType === destinationType
  || explicitConversion;
```

Emit one `XB_EDGE_INCOMPATIBLE` error containing both endpoint IDs, shapes,
dimensions, and canonical types when any condition fails. Continue driver-count
handling so diagnostics remain complete, but do not build semantic IR when the
error exists.

- [ ] **Step 5: Run the focused test and verify GREEN**

Run the command from Step 3. Expected: all validator tests pass.

- [ ] **Step 6: Run semantic builder regressions**

```powershell
npx vitest run src/utils/stateMachine/xbSemanticBuilder.test.ts src/utils/stateMachine/xbSemanticValidator.test.ts --reporter=verbose --maxWorkers=1
```

Expected: zero failures.

- [ ] **Step 7: Commit the validation unit**

```powershell
git add src/utils/stateMachine/xbSemanticValidator.ts src/utils/stateMachine/xbSemanticValidator.test.ts
git commit -m "fix(xb): reject incompatible embedded signal edges"
```

---

### Task 2: Make compiled-C capability evidence executable

**Files:**
- Create: `src/utils/stateMachine/xbCConformanceCases.ts`
- Create: `src/utils/stateMachine/xbDeclaredCConformance.test.ts`
- Modify: `src/utils/stateMachine/xbCapabilities.test.ts`
- Modify: `src/utils/stateMachine/xbCGenerator.test.ts`
- Modify if evidence requires narrowing: `src/utils/stateMachine/xbCapabilities.ts`

**Interfaces:**
- Produces `XB_EXECUTABLE_C_CONFORMANCE_CASES`, an immutable array of executable case descriptors.
- Produces `executedCConformanceCoverage()`, derived only from those descriptors.
- Consumes existing semantic operation/signal types, `createXBRuntime`, `stepXBState`, `generateCArtifacts`, and strict GCC helpers.

- [ ] **Step 1: Define executable case descriptors without changing production behavior**

Use a discriminated interface:

```ts
export interface XBExecutableCConformanceCase {
  readonly id: string;
  readonly conformanceCaseId: typeof XB_C_CONFORMANCE_CASE_IDS[number];
  readonly blockType: string;
  readonly inputShapes: readonly XBSignalShape[];
  readonly outputShapes: readonly XBSignalShape[];
  readonly run: () => void;
}
```

The `run` function must construct semantic IR, compute interpreter or analytical
expectations, generate the production C package, compile it strictly, execute
the harness, and assert the result. Shared helpers may construct scalar, vector,
and 2x2 matrix signals, but must not bypass production emitters.

- [ ] **Step 2: Add failing coverage linkage tests**

Replace the current metadata-to-metadata assertion with a comparison against
coverage derived from `XB_EXECUTABLE_C_CONFORMANCE_CASES`:

```ts
const records = executedCConformanceCoverage()
  .filter((entry) => entry.blockType === type);
expect(new Set(records.flatMap((entry) => entry.inputShapes)))
  .toEqual(new Set(capability.inputShapes ?? capability.shapes));
expect(new Set(records.flatMap((entry) => entry.outputShapes)))
  .toEqual(new Set(capability.outputShapes ?? capability.shapes));
```

- [ ] **Step 3: Run the capability test and verify RED**

```powershell
npx vitest run src/utils/stateMachine/xbCapabilities.test.ts --reporter=verbose --maxWorkers=1
```

Expected: under-evidenced trig, discontinuity, routing, and bitwise declarations
fail coverage.

- [ ] **Step 4: Add all trigonometric/hyperbolic executable cases**

Create one strict-C case per block:

```ts
const trigCases = [
  ['SIN', 0.5, Math.sin],
  ['COS', 0.5, Math.cos],
  ['TAN', 0.5, Math.tan],
  ['COT', 0.5, (x: number) => 1 / Math.tan(x)],
  // SEC, COSEC, inverse, hyperbolic, and inverse-hyperbolic variants
] as const;
```

Use domain-safe inputs for inverse functions and compare with tolerance
appropriate for float32. Every case ID is `T10-C99-TRIGONOMETRY` and every case
is independently compiled or combined into a generated package whose harness
prints every output and whose descriptor records every executed block.

- [ ] **Step 5: Add Boolean and bitwise executable cases**

Cover `AND`, `OR`, `NOT`, `NAND`, `NOR`, `XOR`, `BitwiseAND`, `BitwiseOR`,
`BitwiseXOR`, `BitwiseNOT`, `ShiftLeft`, and `ShiftRight`. Include zero/nonzero
truth inputs, negative bit patterns where defined by the helpers, and bounded
shift counts. Compare every compiled result with the interpreter.

- [ ] **Step 6: Add discontinuity executable traces**

Add scalar cases for `SATURATION` and `DEADZONE`, plus multi-tick traces for
`RATE_LIMITER` and `RELAY`. Assert both published outputs and retained state so
the case proves lifecycle behavior.

- [ ] **Step 7: Add routing cases and narrow impossible capability shapes**

Execute `SWITCH` and `IF_ELSE` for scalar, length-3 vector, and 2x2 matrix data.
Execute MUX concatenation and DEMUX partitioning only for valid fixed-size
contracts. If the persisted port model cannot express a meaningful scalar or
matrix MUX/DEMUX contract without coercion, update their `inputShapes` and
`outputShapes` declarations to the exact supported vector contracts and make the
validator reject the broader forms.

- [ ] **Step 8: Execute every descriptor as a Vitest case**

```ts
describe('declared X-Bridges strict-C99 conformance', { timeout: 120_000 }, () => {
  it.each(XB_EXECUTABLE_C_CONFORMANCE_CASES)(
    '$conformanceCaseId $blockType $id',
    (testCase) => testCase.run(),
  );
});
```

Remove or rewrite the misleading SIN-only test title in
`xbCGenerator.test.ts`; no test may claim block types it does not instantiate.

- [ ] **Step 9: Run executable coverage and verify GREEN**

```powershell
npx vitest run src/utils/stateMachine/xbCapabilities.test.ts src/utils/stateMachine/xbDeclaredCConformance.test.ts --reporter=verbose --maxWorkers=1 --testTimeout=120000
```

Expected: every declared case executes, strict compilation succeeds, and
capability coverage has no missing type or shape.

- [ ] **Step 10: Run existing generator regressions**

```powershell
npx vitest run src/utils/stateMachine/xbCGenerator.test.ts --reporter=verbose --maxWorkers=1 --testTimeout=120000
```

Expected: zero failures.

- [ ] **Step 11: Commit executable conformance evidence**

```powershell
git add src/utils/stateMachine/xbCConformanceCases.ts src/utils/stateMachine/xbDeclaredCConformance.test.ts src/utils/stateMachine/xbCapabilities.ts src/utils/stateMachine/xbCapabilities.test.ts src/utils/stateMachine/xbCGenerator.test.ts
git commit -m "test(xb): execute every declared C conformance case"
```

---

### Task 3: Add the supplied-model differential regression

**Files:**
- Modify: `src/utils/stateMachine/smFixtures.ts`
- Modify: `src/utils/stateMachine/smDifferential.test.ts`

**Interfaces:**
- Produces `historyXBridgesTimingFixture(): StateMachineModelV4`.
- Consumes `runInterpreterTrace`, `compileAndRunCTrace`, and `compareSemanticTraces`.

- [ ] **Step 1: Add a fixture reproducing the supplied model's relevant behavior**

The fixture must contain the root `State_1`/`State_2` OR decomposition, nested
history/timed cycling, parallel children, variables `x`, `y`, `z`,
`p1_active`, `p2_active`, `s`, `xb_input`, and `xb_output`, and the embedded
`Inport -> GAIN(2) -> INTEGRATOR_DISCRETE(Ts=0.1) -> Outport` graph. Use tick
100 ms, Euler step 10 ms, reset memory, and escalating numeric faults.

- [ ] **Step 2: Add a failing natural-reachability assertion**

Run 30 normal ticks and assert that `State_2` is never active and `xb_output`
remains zero. This documents the supplied model rather than changing it.

- [ ] **Step 3: Add the explicit-stimulus differential test**

Build steps with `{ kind: 'step', inputs: { x: 1 } }` followed by six ordinary
steps. Assert:

```ts
expect(compareSemanticTraces(interpreter, compiledC)).toBeNull();
expect(interpreter.map((frame) => frame.data.xb_output)).toEqual([
  0, 0, 0, 0.20000000298023224, 0.4000000059604645,
  0.6000000238418579, 0.800000011920929,
]);
```

Also assert `State_2` entry, `x = 3` at the threshold tick, and return to
`State_1` on the following tick.

- [ ] **Step 4: Run the focused differential test**

```powershell
npx vitest run src/utils/stateMachine/smDifferential.test.ts -t "supplied history X-Bridges timing" --reporter=verbose --maxWorkers=1 --testTimeout=120000
```

Expected: strict C compiles and the two traces match exactly under canonical
trace comparison.

- [ ] **Step 5: Commit the model regression**

```powershell
git add src/utils/stateMachine/smFixtures.ts src/utils/stateMachine/smDifferential.test.ts
git commit -m "test(codegen): cover supplied history xbridges model"
```

---

### Task 4: Synchronize documentation and stabilize measured timeouts

**Files:**
- Modify: `docs/XBRIDGES_EMBEDDED_CODEGEN.md`
- Create: `src/utils/stateMachine/xbEmbeddedCodegenDocs.test.ts`
- Modify: `src/utils/stateMachine/smCGenerator.test.ts:161`
- Modify: `src/utils/stateMachine/xbInterpreter.test.ts:1028`

**Interfaces:**
- Documentation continues to name `xbCapabilities.ts` as authoritative.
- The docs test checks stable capability-family markers and rejects known stale claims.

- [ ] **Step 1: Add a failing documentation consistency test**

Read `docs/XBRIDGES_EMBEDDED_CODEGEN.md` and assert that it contains family
markers for extended Boolean/bitwise, routing, trigonometric/hyperbolic, and
discontinuity support. Assert that the stale sentence listing switches/muxes and
extended logic as unsupported is absent.

- [ ] **Step 2: Run the docs test and verify RED**

```powershell
npx vitest run src/utils/stateMachine/xbEmbeddedCodegenDocs.test.ts --reporter=verbose --maxWorkers=1
```

Expected: failure against the current stale matrix.

- [ ] **Step 3: Update the capability matrix and assurance wording**

List the enabled families from `xbCapabilities.ts`, describe any narrowed
MUX/DEMUX contract from Task 2, and retain the host-only/target/HIL disclaimer.
Do not describe metadata registration alone as executable evidence.

- [ ] **Step 4: Stabilize the two measured timeout cases**

Change the block-library default test to use a static top-level import when the
module has no isolation requirement. Give the missing-active-child C generator
test an explicit 120-second timeout. Do not add retries or global timeout
inflation.

- [ ] **Step 5: Run focused documentation and timeout tests**

```powershell
npx vitest run src/utils/stateMachine/xbEmbeddedCodegenDocs.test.ts src/utils/stateMachine/xbInterpreter.test.ts src/utils/stateMachine/smCGenerator.test.ts -t "documentation|instantiates Batch 1|rejects missing active children" --reporter=verbose --maxWorkers=1 --testTimeout=120000
```

Expected: zero failures or timeouts.

- [ ] **Step 6: Commit documentation and timeout changes**

```powershell
git add docs/XBRIDGES_EMBEDDED_CODEGEN.md src/utils/stateMachine/xbEmbeddedCodegenDocs.test.ts src/utils/stateMachine/smCGenerator.test.ts src/utils/stateMachine/xbInterpreter.test.ts
git commit -m "docs(xb): align embedded support and test budgets"
```

---

### Task 5: Run the complete host assurance gate

**Files:**
- Verify only; modify earlier task files only if a failure reveals a root cause.

**Interfaces:**
- Consumes every deliverable from Tasks 1-4.
- Produces fresh completion evidence and a residual target/HIL limitations list.

- [ ] **Step 1: Run X-Bridges semantic and compiled-C suites**

```powershell
npx vitest run src/utils/stateMachine/xbCapabilities.test.ts src/utils/stateMachine/xbSemanticValidator.test.ts src/utils/stateMachine/xbSemanticBuilder.test.ts src/utils/stateMachine/xbInterpreter.test.ts src/utils/stateMachine/xbCGenerator.test.ts src/utils/stateMachine/xbDeclaredCConformance.test.ts src/utils/stateMachine/xbEmbeddedCodegenDocs.test.ts --reporter=verbose --maxWorkers=1 --testTimeout=120000
```

- [ ] **Step 2: Run integrated state-machine and X-Bridges suites**

```powershell
npx vitest run src/utils/stateMachine/smCGenerator.test.ts src/utils/stateMachine/smXBridgesAppIntegration.test.ts src/utils/stateMachine/smDifferential.test.ts --reporter=verbose --maxWorkers=1 --testTimeout=120000
```

- [ ] **Step 3: Run TypeScript verification**

```powershell
npx tsc --noEmit
```

- [ ] **Step 4: Check only the files changed by this plan**

```powershell
git diff --check HEAD~4 -- src/utils/stateMachine docs/XBRIDGES_EMBEDDED_CODEGEN.md
git status --short
```

Unrelated pre-existing untracked files are reported but not changed, staged, or
deleted.

- [ ] **Step 5: Review acceptance criteria against fresh output**

Confirm zero failed or skipped required cases, zero TypeScript errors, strict
C99 compilation in every executable case, exact supplied-model parity, updated
documentation, and explicit separation from target/HIL qualification.

- [ ] **Step 6: Commit any verification-only correction separately**

Only if verification required an additional code or test correction:

```powershell
git add src/utils/stateMachine/xbSemanticValidator.ts src/utils/stateMachine/xbSemanticValidator.test.ts src/utils/stateMachine/xbCapabilities.ts src/utils/stateMachine/xbCapabilities.test.ts src/utils/stateMachine/xbCConformanceCases.ts src/utils/stateMachine/xbDeclaredCConformance.test.ts src/utils/stateMachine/smFixtures.ts src/utils/stateMachine/smDifferential.test.ts src/utils/stateMachine/xbEmbeddedCodegenDocs.test.ts src/utils/stateMachine/smCGenerator.test.ts src/utils/stateMachine/xbInterpreter.test.ts docs/XBRIDGES_EMBEDDED_CODEGEN.md
git commit -m "fix(xb): close assurance verification regression"
```
