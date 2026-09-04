# OPM Focused Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port OpenCode’s OPM runtime and embedded-C improvements onto current `main`, complete the missing APIs, connect the UI, and produce a verified reviewable PR.

**Architecture:** Start from `origin/main` and import only OPM-specific source/tests. The normalized executable model is the boundary between the Entropy React Flow editor, the semantic validator, the deterministic runtime, and the bounded C-generation pipeline. EntropyWorkspace owns the controller and renders the OPM execution/code-generation surfaces; engine modules remain React-independent.

**Tech Stack:** TypeScript, React, React Flow, Vite, Vitest, Node.js security tests, Electron/Vite build.

## Global Constraints

- Never merge `entropy-opm-embedded-c` wholesale; it contains unrelated history.
- Preserve invalid/non-finite failures as structured diagnostics; never silently convert them to zero.
- Keep generated C bounded by the existing target limits and verify generated artifacts before persistence/export.
- Keep current `main` behavior outside OPM unchanged.
- Run tests before each commit; do not claim completion without fresh passing output.

---

### Task 1: Import the canonical OPM engine boundary

**Files:**
- Create from reviewed OpenCode commit `b7d8c1e`: `src/engine/opm/executableTypes.ts`, `schemaAdapter.ts`, `semanticValidator.ts`, `runtimeSemantics.ts`, `runtime.ts`, `pipeline.ts`, `canonicalHash.ts`, `cIr.ts`, `cGenerator.ts`, `cGeneratorTypes.ts`, `cModelGenerator.ts`, `cRuntimeGenerator.ts`, `cHostHarness.ts`, `conformanceHarness.ts`, `conformanceTypes.ts`, `fixtures.ts`, `persistence.ts`.
- Create: `src/engine/opm/expressionCompiler.ts`.
- Test: `src/engine/opm/__tests__/expressions.test.ts`, `normalization.test.ts`, `semanticValidator.test.ts`, `runtime.test.ts`, `runtimeConformance.test.ts`, `pipeline.test.ts`, `cGenerator.test.ts`, `cModelGenerator.test.ts`, `cRuntimeGenerator.test.ts`, `hostCompilation.test.ts`, `goldenExecution.test.ts`, `mutationResistance.test.ts`, `persistence.test.ts`, `examples.test.ts`, `adversarialBoundary.test.ts`.

**Interfaces:**
- `schemaAdapter.ts` exports `withExecutableDefaults`, `adaptOpmDiagram`, `normalizeOpmModel`, `sanitizeCIdentifier`, and `createDefaultOpmTargetSettings`.
- `expressionCompiler.ts` exports `compileOpmExpression`, `OpmExpressionScope`, `OpmValueSymbol`, and `TypedExpressionIr`.
- `runtime.ts` exports the deterministic executable-model step API used by the controller and conformance harness.

- [ ] **Step 1: Copy the engine tests only and run them.**

  Run: `npx vitest run src/engine/opm/__tests__/expressions.test.ts src/engine/opm/__tests__/normalization.test.ts`

  Expected: FAIL because the engine files are not present on `main`.

- [ ] **Step 2: Import the engine implementation from `b7d8c1e` without importing unrelated files.**

  Run: `git checkout b7d8c1e -- src/engine/opm/canonicalHash.ts src/engine/opm/cGenerator.ts src/engine/opm/cGeneratorTypes.ts src/engine/opm/cHostHarness.ts src/engine/opm/cIr.ts src/engine/opm/cModelGenerator.ts src/engine/opm/cRuntimeGenerator.ts src/engine/opm/conformanceHarness.ts src/engine/opm/conformanceTypes.ts src/engine/opm/executableTypes.ts src/engine/opm/fixtures.ts src/engine/opm/persistence.ts src/engine/opm/pipeline.ts src/engine/opm/runtime.ts src/engine/opm/runtimeSemantics.ts src/engine/opm/schemaAdapter.ts src/engine/opm/semanticValidator.ts`

- [ ] **Step 3: Implement the minimal expression compiler required by the imported interfaces.**

  Support numeric literals, identifiers from the supplied scope, parentheses, unary `+/-`, arithmetic `+ - * /`, exponentiation `^`, and bounded calls to `min`, `max`, and `abs`. Reject unknown identifiers, unsupported calls, malformed syntax, division by zero, and non-finite results with stable diagnostics. Return a typed IR plus an evaluator; do not use `eval` or `Function`.

- [ ] **Step 4: Export the missing adapter/default APIs and align types.**

  Add `normalizeOpmModel` as the immutable adapter used by `pipeline.ts`, `sanitizeCIdentifier` as the single identifier sanitizer, and `createDefaultOpmTargetSettings` as the validator’s default configuration. Keep `adaptOpmDiagram` backward-compatible.

- [ ] **Step 5: Run the engine tests.**

  Run: `npx vitest run src/engine/opm/__tests__`

  Expected: all OPM engine tests pass with zero failures.

- [ ] **Step 6: Commit the engine slice.**

  Run: `git add src/engine/opm && git commit -m "feat(opm): add canonical executable engine and bounded compiler"`

### Task 2: Add the OPM simulation and editor UI contracts

**Files:**
- Create from reviewed OpenCode commit `b7d8c1e`: `src/components/entropy/OpmLinkRules.ts`, `OpmSimulationEngine.ts`, `OpmDiagnosticsBadge.tsx`, `OpmLiveTraceOverlay.tsx`, `OpmExecutionPropertiesPanel.tsx`, `OpmTargetSettingsModal.tsx`.
- Modify: `src/components/entropy/EntropyWorkspace.tsx`.
- Test: matching `src/components/entropy/__tests__/opmLinkRules.test.ts`, `opmSimulationEngine.test.ts`, `executionPanels.test.tsx`, `traceOverlay.test.tsx`.

**Interfaces:**
- `OpmSimulationEngine.ts` exports `createOpmSimulationController`, `createSimulationState`, `initializeSimulation`, and `stepSimulation`.
- `OpmLinkRules.ts` exports `validateOpmConnection`.
- `EntropyWorkspace` renders the execution properties panel, target settings modal, diagnostics badge, and live trace overlay using the controller state.

- [ ] **Step 1: Copy the UI tests and run them.**

  Run: `npx vitest run src/components/entropy/__tests__/opmLinkRules.test.ts src/components/entropy/__tests__/opmSimulationEngine.test.ts src/components/entropy/__tests__/executionPanels.test.tsx src/components/entropy/__tests__/traceOverlay.test.tsx`

  Expected: FAIL because the OPM controller/UI contract is absent on `main`.

- [ ] **Step 2: Import the narrowly scoped UI files from `b7d8c1e`.**

  Run: `git checkout b7d8c1e -- src/components/entropy/OpmLinkRules.ts src/components/entropy/OpmSimulationEngine.ts src/components/entropy/OpmDiagnosticsBadge.tsx src/components/entropy/OpmLiveTraceOverlay.tsx src/components/entropy/OpmExecutionPropertiesPanel.tsx src/components/entropy/OpmTargetSettingsModal.tsx`

- [ ] **Step 3: Wire the controller and diagnostics into EntropyWorkspace.**

  Use the existing `nodes`, `edges`, and selected-node state. Validate a proposed connection before adding it. Render the panels only within the Entropy workspace, pass typed callbacks, and preserve existing OPM diagram editing behavior.

- [ ] **Step 4: Run the UI tests and commit.**

  Run: `npx vitest run src/components/entropy/__tests__/opmLinkRules.test.ts src/components/entropy/__tests__/opmSimulationEngine.test.ts src/components/entropy/__tests__/executionPanels.test.tsx src/components/entropy/__tests__/traceOverlay.test.tsx`

  Expected: all selected UI tests pass.

  Commit: `git add src/components/entropy && git commit -m "feat(opm): connect deterministic simulation and diagnostics UI"`

### Task 3: Integrate code generation and security verification

**Files:**
- Create from reviewed OpenCode commit `b7d8c1e`: `src/components/entropy/OpmCodeGenerationWorkspace.tsx`, `src/security/opmCodeVerifier.cjs`.
- Test: `src/components/entropy/__tests__/opmCodeGenerationWorkspace.test.tsx`, `src/security/opmCodeVerifier.test.cjs`.
- Modify: `package.json` only if required to expose dedicated OPM commands; do not remove existing scripts.

**Interfaces:**
- `OpmCodeGenerationWorkspace` accepts the current graph and execution configuration, calls `compileExecutableOpm`, shows diagnostics, and permits export only after verification.
- The security verifier accepts only the generated allowlisted filenames, bounded file sizes, and fixed compiler options.

- [ ] **Step 1: Add the code-generation/security tests and run them.**

  Run: `npx vitest run src/components/entropy/__tests__/opmCodeGenerationWorkspace.test.tsx`; then `node src/security/opmCodeVerifier.test.cjs`

  Expected: the UI test fails until the workspace is connected; the Node security test is run separately and must not be collected by Vitest.

- [ ] **Step 2: Import the code-generation workspace and verifier.**

  Run: `git checkout b7d8c1e -- src/components/entropy/OpmCodeGenerationWorkspace.tsx src/security/opmCodeVerifier.cjs src/security/opmCodeVerifier.test.cjs`

- [ ] **Step 3: Render the code-generation entry point from EntropyWorkspace.**

  Pass the same graph/configuration used by the simulation controller. Display compiler diagnostics inline and block export when compilation or security verification fails.

- [ ] **Step 4: Run both test paths and commit.**

  Run: `npx vitest run src/components/entropy/__tests__/opmCodeGenerationWorkspace.test.tsx`; `node src/security/opmCodeVerifier.test.cjs`

  Commit: `git add src/components/entropy src/security package.json package-lock.json; git commit -m "feat(opm): add verified embedded C generation workspace"`

### Task 4: Full integration verification and PR preparation

**Files:**
- Modify: `package.json` and `docs/guides/entropy_opm_embedded_c.md` only if needed for reproducible commands/documentation.

- [ ] **Step 1: Add one end-to-end smoke test for Entropy UI integration.**

  Assert that the workspace renders the OPM execution/code-generation entry points and that a valid fixture can compile through the same path used by the UI.

- [ ] **Step 2: Run the complete verification set.**

  Run: `npx vitest run src/engine/opm src/components/entropy/__tests__/*opm* src/components/entropy/__tests__/executionPanels.test.tsx src/components/entropy/__tests__/traceOverlay.test.tsx`; `node src/security/opmCodeVerifier.test.cjs`; `npx tsc --noEmit`; `npm run build`

  Expected: zero test/type/build failures. Audit notices may remain as warnings, but no audit command may alter dependencies.

- [ ] **Step 3: Review the final diff.**

  Run: `git diff --check origin/main...HEAD`; `git diff --stat origin/main...HEAD`; `git status --short`

  Confirm only OPM files, tests, focused configuration, and documentation are included; no unrelated stale-branch history or generated artifacts are present.

- [ ] **Step 4: Commit documentation/verification evidence.**

  Commit: `git add docs package.json package-lock.json`; `git commit -m "docs(opm): record focused integration verification"` when files changed.

- [ ] **Step 5: Push and open a focused PR only after verification passes.**

  Run: `git push -u origin codex/opm-focused-integration`

  Open a PR against `main` with the test/build evidence and explicitly note that the original 465-commit branch was not merged.
