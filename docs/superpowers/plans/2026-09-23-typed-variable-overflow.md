# Typed Variable Overflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make simulation, UI editing, model persistence, and generated C consistently honor each variable's declared type and per-variable `saturate`/`error` overflow policy.

**Architecture:** Add one typed-value utility that owns numeric limits, coercion, float handling, and overflow diagnostics. Extend `VariableDef` and semantic variables with a defaulted policy, route interpreter/UI/HIL assignment through the utility, and emit matching policy branches from the C generator.

**Tech Stack:** TypeScript, React, Vitest, generated MISRA-oriented C99/C11.

## Global Constraints

- Preserve existing persisted models by defaulting absent policy fields to `saturate`.
- Do not introduce silent modulo/wraparound behavior.
- Keep `float`/`single` as C `float` and `double` as C `double`.
- Do not change unrelated timer overflow behavior.

---

### Task 1: Add typed-value and overflow contracts

**Files:**
- Modify: `src/types/sm_types.ts`
- Create: `src/utils/stateMachine/smTypedValue.ts`
- Test: `src/utils/stateMachine/smTypedValue.test.ts`

**Interfaces:**
- Produce `VariableOverflowPolicy = 'saturate' | 'error'`.
- Produce `TypedValueResult = { value: number | boolean; overflowed: boolean; error?: string }`.
- Produce `coerceTypedValue(value, type, policy): TypedValueResult`.
- Produce `getTypeBounds(type): { min: number; max: number } | null`.

- [ ] **Step 1: Write failing tests** for every signed/unsigned integer width, negative unsigned input, `float`/`single` precision, `double` preservation, saturating bounds, and error results preserving a diagnostic.
- [ ] **Step 2: Run** `npx vitest run src/utils/stateMachine/smTypedValue.test.ts`; confirm the module/API failure.
- [ ] **Step 3: Implement** exact integer limits, truncation, `Math.fround` for `float`/`single`, finite-value checks, saturation, and error results without modulo operators.
- [ ] **Step 4: Run** the focused test and confirm it passes.
- [ ] **Step 5: Add** `overflowPolicy?: VariableOverflowPolicy` to `VariableDef`, documenting that missing values mean `saturate`.

### Task 2: Persist and migrate variable policies

**Files:**
- Modify: `src/utils/stateMachine/smModelMigration.ts`
- Modify: `src/utils/stateMachine/smSemanticModel.ts`
- Modify: `src/utils/stateMachine/smSemanticBuilder.ts`
- Test: `src/utils/stateMachine/smModelMigration.test.ts` or the nearest existing migration test file

- [ ] **Step 1: Add failing migration tests** proving old variables load with `overflowPolicy: 'saturate'` and explicit `error` survives migration.
- [ ] **Step 2: Run the focused migration test and verify failure.
- [ ] **Step 3: Normalize policies during migration and copy them into semantic variables.
- [ ] **Step 4: Run migration and semantic-builder tests.

### Task 3: Make interpreter assignments type- and policy-aware

**Files:**
- Modify: `src/utils/stateMachine/smInterpreter.ts`
- Modify: `src/utils/stateMachine/smAppAdapter.ts`
- Modify: `src/utils/stateMachine/smStandaloneRuntime.ts`
- Tests: `src/utils/stateMachine/smInterpreter.test.ts`, `src/utils/stateMachine/smDifferential.test.ts`

- [ ] **Step 1: Add failing tests** for action assignment and runtime input: saturation clamps and error leaves the previous value while surfacing a diagnostic/fault.
- [ ] **Step 2: Run the focused tests and confirm the current bitwise wrapping fails them.
- [ ] **Step 3: Replace direct coercion with `coerceTypedValue`, thread policy from each semantic variable, and route errors through the existing simulation error path.
- [ ] **Step 4: Add parity cases for all representative integer widths plus `float` and `double`.
- [ ] **Step 5: Run the focused interpreter/differential tests.

### Task 4: Update the variables panel and runtime editing

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/types/sm_types.ts`
- Test: Add or extend the closest App variable-panel test if available; otherwise cover pure handlers in a new focused utility test.

- [ ] **Step 1: Add failing handler tests** for editing an existing variable's type/policy, rejecting an incompatible initial/current value, and retaining the old variable on rejection.
- [ ] **Step 2: Add a type dropdown and overflow-policy dropdown to each existing variable row.
- [ ] **Step 3: Revalidate initial/current values and update them through the typed-value utility; show an error diagnostic without mutating on `error` overflow.
- [ ] **Step 4: Default newly created variables to `saturate` and persist the field in project state.
- [ ] **Step 5: Run focused UI/utility tests and `npx tsc --noEmit`.

### Task 5: Align generated C with simulation policy

**Files:**
- Modify: `src/utils/stateMachine/smCGenerator.ts`
- Modify: `src/utils/stateMachine/smCExpressions.ts`
- Modify: `src/utils/stateMachineCodeGenerator.ts`
- Tests: `src/utils/stateMachine/smCGenerator.test.ts`, `src/utils/stateMachine/smCGenerator.behavior.test.ts`

- [ ] **Step 1: Add failing generation tests** asserting `float`, `double`, and integer declarations, saturation branches, and error-policy branches.
- [ ] **Step 2: Run focused generator tests and confirm policy branches are absent.
- [ ] **Step 3: Emit type-specific bounds and guarded assignment helpers. Saturation assigns the bound; error leaves the old value and sets the existing runtime error status. Keep `float` and `double` distinct and check non-finite results.
- [ ] **Step 4: Ensure HIL read mappings use the same guarded assignment path.
- [ ] **Step 5: Run generator behavior tests and `npm run verify:sm:codegen`.

### Task 6: End-to-end parity and verification

**Files:**
- Modify: `src/utils/stateMachine/smDifferential.test.ts`
- Modify: `src/utils/stateMachine/smCGenerator.behavior.test.ts`
- Modify: `docs/superpowers/specs/2026-09-23-typed-variable-overflow-design.md` only if implementation decisions materially differ

- [ ] **Step 1: Add parity vectors** for in-range, lower/upper saturation, signed/unsigned overflow error, float precision, double precision, and non-finite floating results.
- [ ] **Step 2: Run the parity tests and confirm TypeScript and generated C agree.
- [ ] **Step 3: Run `npx tsc --noEmit`, the focused state-machine suite, and `npm run verify:sm:codegen`.
- [ ] **Step 4: Review `git diff`, verify no unrelated user changes were overwritten, and report any unsupported edge cases explicitly.

## Self-review

- The plan covers model storage, UI, interpreter, HIL, and C generation boundaries.
- Every behavior has a failing-test step before production changes.
- Existing models have an explicit default policy.
- Float/single/double behavior is specified separately from integer bounds.
- Timer overflow is explicitly excluded.
