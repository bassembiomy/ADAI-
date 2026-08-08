# Code Generator Safety, Correctness & Verifiability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve the safety, correctness, maintainability, and verifiability of the State Machine and X-Bridges code generators without breaking, removing, or changing any supported feature or semantic behavior.

**Architecture:** Integrate authoritative symbol tables and owner-state context pre-lowering into the semantic IR layer (`XBSemanticModel`). Enforce strict 7-stage verification gates including static AST symbol consistency checking (`usedDataMembers ⊆ declaredDataMembers`) and full host compiler compile & link syntax verification (`gcc -std=c11 -Wall -Wextra -Wpedantic`).

**Tech Stack:** TypeScript, C99/C11, Vitest, Node.js, GCC (host compiler harness).

## Global Constraints

- Preserve behavior before improving implementation.
- All fixes MUST be made to source generator / validator logic (`src/utils/stateMachine/*`), NEVER to generated artifacts.
- Generated C packages MUST compile and link cleanly under `gcc -std=c11 -Wall -Wextra -Wpedantic`.
- All existing supported features and tests MUST remain 100% passing across explicit verification levels (`UNIT_PASS`, `GENERATION_PASS`, `COMPILE_PASS`, `RUNTIME_PASS`, `DIFFERENTIAL_PASS`).

---

### Task 1: Fix Missing Mapping Auto-Repair and Diagnostic Handling

**Files:**
- Modify: `src/utils/stateMachine/smSemanticBuilder.ts:1250-1310`
- Modify: `src/utils/stateMachine/xbSemanticBuilder.ts:1320-1345`
- Test: `src/utils/stateMachine/smSemanticBuilder.test.ts:980-990`

**Interfaces:**
- Consumes: `XBPersistedModelV1`, `SMPersistedModel`
- Produces: Auto-repaired `XBSemanticMapping` entries attached to `XBSemanticModel.ir` when unbound Outport nodes are detected.

- [ ] **Step 1: Write the failing test case assertion update**

In `src/utils/stateMachine/smSemanticBuilder.test.ts`:
```ts
it('auto-repairs missing mapping when Outport smVarId is not bound in xBridgesModel.mappings (APP-XB-MAP-001)', () => {
  const fixture = createUnboundOutportFixture();
  const result = buildSemanticModel(fixture);
  expect(result.diagnostics.map(d => d.code)).not.toContain('XB_MAPPING_NOT_FOUND');
  expect(result.ir).toBeDefined();
  expect(result.ir!.states.a.xBridges!.mappings).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ sourceVariableId: 'unbound_var', blockId: 'out1' }),
    ]),
  );
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run src/utils/stateMachine/smSemanticBuilder.test.ts -t "auto-repairs missing mapping"`
Expected: FAIL with `TypeError: Cannot read properties of undefined (reading 'states')`

- [ ] **Step 3: Implement minimal auto-repair logic in semantic building**

In `src/utils/stateMachine/xbSemanticBuilder.ts`:
Ensure auto-repaired mappings for Outport nodes with `smVarId` parameters are injected into `effectiveMappings` prior to validation checks, and ensure recoverable diagnostics do not block `ir` emission when `ir` is valid.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/stateMachine/smSemanticBuilder.test.ts -t "auto-repairs missing mapping"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/stateMachine/xbSemanticBuilder.ts src/utils/stateMachine/smSemanticBuilder.ts src/utils/stateMachine/smSemanticBuilder.test.ts
git commit -m "fix(statemachine): ensure auto-repair of unbound outport mappings populates semantic IR"
```

---

### Task 2: Authoritative Symbol Table and Owner State Resolution

**Files:**
- Modify: `src/utils/stateMachine/xbSemanticModel.ts:10-35`
- Modify: `src/utils/stateMachine/xbSemanticBuilder.ts:1280-1325`
- Modify: `src/utils/stateMachine/xbCGenerator.ts:400-450`
- Test: `src/utils/stateMachine/xbCGenerator.test.ts`

**Interfaces:**
- Consumes: `Map<string, SemanticVariableSymbol>`, `XBOwnerState`
- Produces: Safe `instance->data.<cIdentifier>` accesses and owner state timer accesses (`instance->state_timers[cIndexSymbol]`) in generated C code.

- [ ] **Step 1: Write failing unit test for UUID mapping and owner state index rendering**

In `src/utils/stateMachine/xbCGenerator.test.ts`:
```ts
it('renders authoritative cIdentifier and resolved owner state index macro', () => {
  const model = createXBSemanticModelWithOwnerStateAndUUIDMapping();
  const cCode = generateXBC99Code(model);
  expect(cCode).not.toContain('state_timers[0U]');
  expect(cCode).toContain('instance->state_timers[SM_ST_STATE_A_IDX]');
  expect(cCode).toContain('instance->data.target_var');
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run src/utils/stateMachine/xbCGenerator.test.ts -t "renders authoritative cIdentifier"`
Expected: FAIL

- [ ] **Step 3: Update xbCGenerator to consume resolved symbol and owner state index**

In `src/utils/stateMachine/xbCGenerator.ts`:
Replace sanitized fallback references (`instance->data.${sanitize(mapping.smVarId)}`) with `instance->data.${mapping.variable.cIdentifier}`. Replace fallback `state_timers[0U]` with `instance->state_timers[model.ownerState.cIndexSymbol]`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/stateMachine/xbCGenerator.test.ts -t "renders authoritative cIdentifier"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/stateMachine/xbSemanticModel.ts src/utils/stateMachine/xbSemanticBuilder.ts src/utils/stateMachine/xbCGenerator.ts src/utils/stateMachine/xbCGenerator.test.ts
git commit -m "feat(codegen): use authoritative variable symbols and owner state index macros in generated C"
```

---

### Task 3: Pre-lowering Step Parameters & Time Conversion Decoupling

**Files:**
- Modify: `src/utils/stateMachine/smTiming.ts:1-50`
- Modify: `src/utils/stateMachine/xbSemanticBuilder.ts:900-950`
- Modify: `src/utils/stateMachine/xbCGenerator.ts:500-550`
- Test: `src/utils/stateMachine/xbSemanticBuilder.test.ts`
- Test: `src/utils/stateMachine/xbCGenerator.test.ts`

**Interfaces:**
- Consumes: `convertTime()`, `alignRuntimeThreshold()`
- Produces: Pre-aligned `XBStepOperationParameters` operation in semantic IR and exact millisecond threshold checks in generated C code.

- [ ] **Step 1: Write failing test for Step pre-lowering**

In `src/utils/stateMachine/xbCGenerator.test.ts`:
```ts
it('emits exact millisecond comparison for pre-lowered Step operation', () => {
  const model = createModelWithStepBlock({ stepTimeSeconds: 0.3, initialValue: 0, finalValue: 5 });
  const cCode = generateXBC99Code(model);
  expect(cCode).toContain('(instance->state_timers[SM_ST_STATE_A_IDX] < 300U) ? 0.0 : 5.0');
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run src/utils/stateMachine/xbCGenerator.test.ts -t "emits exact millisecond comparison"`
Expected: FAIL

- [ ] **Step 3: Implement Step pre-lowering in xbSemanticBuilder and C renderer**

In `src/utils/stateMachine/xbSemanticBuilder.ts`:
Lower Step parameters into `stepParameters: { initialValue, finalValue, threshold: { milliseconds }, timerSource: { stateIndexSymbol } }`. In `xbCGenerator.ts`: Render comparison against pre-aligned threshold milliseconds.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/stateMachine/xbCGenerator.test.ts -t "emits exact millisecond comparison"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/stateMachine/smTiming.ts src/utils/stateMachine/xbSemanticBuilder.ts src/utils/stateMachine/xbCGenerator.ts src/utils/stateMachine/xbCGenerator.test.ts
git commit -m "feat(codegen): pre-lower Step block parameters into exact aligned millisecond thresholds"
```

---

### Task 4: Static AST Generated Symbol Consistency Checker

**Files:**
- Modify: `src/utils/stateMachine/smCGenerator.ts:1100-1180`
- Modify: `src/utils/stateMachine/smSemanticValidator.ts:300-350`
- Test: `src/utils/stateMachine/smCGenerator.test.ts`

**Interfaces:**
- Consumes: Rendered C AST / code string and declared `SM_Data_t` member set.
- Produces: Validation error `GEN_C_UNDECLARED_DATA_MEMBER` if `usedDataMembers ⊈ declaredDataMembers`.

- [ ] **Step 1: Write failing test for undeclared data member detection**

In `src/utils/stateMachine/smCGenerator.test.ts`:
```ts
it('detects and rejects undeclared data member access in generated C AST', () => {
  const malformedCCode = `instance->data.invalid_member = 1.0;`;
  const declaredMembers = new Set(['valid_member']);
  const diagnostics = validateGeneratedCSymbols(malformedCCode, declaredMembers);
  expect(diagnostics.map(d => d.code)).toContain('GEN_C_UNDECLARED_DATA_MEMBER');
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run src/utils/stateMachine/smCGenerator.test.ts -t "detects and rejects undeclared data member"`
Expected: FAIL

- [ ] **Step 3: Implement validateGeneratedCSymbols AST check**

In `src/utils/stateMachine/smCGenerator.ts`:
Implement AST / regex symbol consistency checker asserting `usedDataMembers ⊆ declaredDataMembers`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/stateMachine/smCGenerator.test.ts -t "detects and rejects undeclared data member"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/stateMachine/smCGenerator.ts src/utils/stateMachine/smSemanticValidator.ts src/utils/stateMachine/smCGenerator.test.ts
git commit -m "feat(codegen): add static AST symbol consistency validator for generated C code"
```

---

### Task 5: Full Compilation & Link Gate Infrastructure (`gcc -std=c11 -Wall -Wextra -Wpedantic`)

**Files:**
- Modify: `src/utils/stateMachine/smCHarness.ts:100-150`
- Test: `src/utils/stateMachine/smCGenerator.test.ts`
- Test: `src/utils/stateMachine/xbCGenerator.test.ts`

**Interfaces:**
- Consumes: Rendered C files (`sm_core.c`, `sm_xbridges.c`)
- Produces: Clean build and link verification result using `gcc -std=c11 -Wall -Wextra -Wpedantic`.

- [ ] **Step 1: Write failing test asserting zero compiler/linker warnings or errors**

In `src/utils/stateMachine/smCGenerator.test.ts`:
```ts
it('compiles and links generated C package cleanly with gcc -std=c11 -Wall -Wextra -Wpedantic', async () => {
  const cArtifacts = generateFullCModel(sampleModel);
  const result = await verifyHostCompileAndLink(cArtifacts);
  expect(result.success).toBe(true);
  expect(result.warnings).toHaveLength(0);
});
```

- [ ] **Step 2: Run test to verify failure/execution**

Run: `npx vitest run src/utils/stateMachine/smCGenerator.test.ts -t "compiles and links generated C package"`
Expected: FAIL if compilation or linking errors/warnings exist.

- [ ] **Step 3: Ensure full compilation and linking harness passes clean**

In `src/utils/stateMachine/smCHarness.ts`:
Ensure compiler flags `-std=c11 -Wall -Wextra -Wpedantic` are passed during compilation and linking of executable harness binary.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/stateMachine/smCGenerator.test.ts -t "compiles and links generated C package"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/stateMachine/smCHarness.ts src/utils/stateMachine/smCGenerator.test.ts
git commit -m "test(codegen): integrate mandatory host GCC compile & link gate for generated C packages"
```
