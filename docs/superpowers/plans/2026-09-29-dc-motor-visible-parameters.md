# DC Motor Visible Parameters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose the `Kt` torque constant and `B` viscous damping parameters in the V-Lab DC Motor property editor without changing existing simulation behavior.

**Architecture:** Extend the existing `dc_motor` catalog metadata because the generic V-Lab property editor already renders every catalog parameter and persists its value into node `params`. Retain the equation's current fallbacks so legacy models without these fields continue to run unchanged.

**Tech Stack:** TypeScript, React catalog-driven UI, Vitest

## Global Constraints

- `Kt` defaults to `0.05 N·m/A` and is labeled `Torque Const`.
- `B` defaults to `0.001 N·m·s/rad` and is labeled `Viscous Damping`.
- Existing saved models that omit `Kt` or `B` must retain the current runtime fallback behavior.
- Do not change equations, ports, or unrelated blocks.

---

## File Structure

- Modify `src/utils/vlabLibrary.test.ts`: verify the public DC Motor catalog metadata that drives the property editor.
- Modify `src/utils/vlabLibrary.ts`: add the two missing parameter definitions to the existing `dc_motor` block.

### Task 1: Expose DC Motor torque and damping parameters

**Files:**
- Modify: `src/utils/vlabLibrary.test.ts`
- Modify: `src/utils/vlabLibrary.ts`

**Interfaces:**
- Consumes: the existing `VLAB_LIBRARY` array and the generic property editor's catalog-driven parameter rendering.
- Produces: `dc_motor.params.Kt` and `dc_motor.params.B`, each with `{ value: number; unit: string; label: string }` metadata.

- [ ] **Step 1: Write the failing catalog test**

Add this test inside the existing `describe('VLab Library Search & Scoring', ...)` block in `src/utils/vlabLibrary.test.ts`:

```ts
it('exposes every DC Motor parameter used by the simulation equation', () => {
  const dcMotor = VLAB_LIBRARY.flatMap(domain => domain.blocks).find(block => block.id === 'dc_motor');

  expect(dcMotor?.params.Kt).toEqual({
    value: 0.05,
    unit: 'N-m/A',
    label: 'Torque Const'
  });
  expect(dcMotor?.params.B).toEqual({
    value: 0.001,
    unit: 'N-m-s/rad',
    label: 'Viscous Damping'
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
npx vitest run src/utils/vlabLibrary.test.ts --reporter=verbose
```

Expected: FAIL in `exposes every DC Motor parameter used by the simulation equation`; received values for `dcMotor.params.Kt` and `dcMotor.params.B` are `undefined`.

- [ ] **Step 3: Add the catalog parameter metadata**

In the `dc_motor.params` object in `src/utils/vlabLibrary.ts`, add `Kt` after `Ke` and `B` after `J`:

```ts
"Kt": {
  "value": 0.05,
  "unit": "N-m/A",
  "label": "Torque Const"
},
```

```ts
"B": {
  "value": 0.001,
  "unit": "N-m-s/rad",
  "label": "Viscous Damping"
}
```

Do not alter `src/engine/vlab/vlabEquations.ts`; its existing `params.Kt || Ke` and `params.B || params.damping || 0.001` fallbacks preserve compatibility for old models.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```powershell
npx vitest run src/utils/vlabLibrary.test.ts --reporter=verbose
```

Expected: PASS, including the new DC Motor parameter test.

- [ ] **Step 5: Run relevant regression checks**

Run:

```powershell
npx vitest run src/engine/vlab/vlab_full_certification.test.ts src/engine/vlab/whitebox_benchmarks/suites/electromechanical_whitebox.test.ts --reporter=verbose
npx tsc --noEmit
```

Expected: both Vitest files pass and TypeScript exits with code `0` without diagnostics.

- [ ] **Step 6: Review the final diff**

Run:

```powershell
git diff --check
git diff -- src/utils/vlabLibrary.ts src/utils/vlabLibrary.test.ts
```

Expected: no whitespace errors; the diff contains only the focused test and the `Kt`/`B` catalog metadata.

- [ ] **Step 7: Commit the implementation**

```powershell
git add -- src/utils/vlabLibrary.ts src/utils/vlabLibrary.test.ts
git commit -m "fix(vlab): expose DC motor torque and damping"
```
