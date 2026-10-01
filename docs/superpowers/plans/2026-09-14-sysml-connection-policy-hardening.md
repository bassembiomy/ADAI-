# SysML Connection Policy Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Block invalid SysML connections and stereotype changes with actionable popup errors while keeping legacy/canonical validation consistent across BDD, IBD, requirements, persistence, and release tests.

**Architecture:** Add one pure endpoint-taxonomy/policy evaluator, then adapt legacy and canonical validators to it. UI creation, relationship editing, stereotype changes, and dropdown filtering call the same evaluator before any state/history mutation; imported legacy data is diagnosed but preserved.

**Tech Stack:** TypeScript, React, Vitest, existing SysML engine, existing application modal/error infrastructure, Playwright integration tests.

## Global Constraints

- Follow OMG SysML 1.6 / ISO/IEC 19514:2017 and the project’s explicit SysML v1.6 boundary; do not claim SysML v2 equivalence.
- Invalid new operations are completely blocked before state mutation and show a popup error.
- Existing resolvable invalid imported relationships are preserved and diagnosed, not silently deleted.
- Use the repository’s existing validation, gateway, persistence, and test conventions.
- Keep changes focused on connection-policy hardening; do not redesign diagram notation or migrate the whole UI to canonical state.

## Files and Responsibilities

- Create `src/engine/sysml/connectionPolicy.ts`: endpoint families, endpoint descriptors, relationship compatibility matrix, structured diagnostics, and pure evaluator.
- Create `src/engine/sysml/connectionPolicy.test.ts`: exhaustive table-driven policy matrix and cycle/diagnostic regressions.
- Modify `src/services/sysmlCreationRules.ts`: map legacy elements to endpoint descriptors and delegate relationship/connector compatibility to the central policy.
- Modify `src/services/sysmlCreationRules.test.ts`: legacy-policy parity and stereotype/relationship edge cases.
- Modify `src/engine/sysml/policy.ts`: canonical endpoint mapping, relationship admission integration, and removal of false cycle checks for association/dependency/allocation.
- Modify `src/engine/sysml/policy.test.ts`: canonical endpoint-family and cycle regressions.
- Modify `src/services/sysmlCommandGateway.ts` and `src/services/sysmlCommandGateway.test.ts`: ensure canonical create/update commands reject policy-invalid candidates with typed codes.
- Modify `src/components/sysml/RelationshipEndEditor.tsx`: expose only context-compatible relationship kinds and forward structured rejection details.
- Modify `src/components/sysml/RelationshipEndEditor.test.tsx`: dropdown filtering and defensive update tests.
- Modify `src/App.tsx` error-system state/rendering around `showErrorDialog`, `currentError`, and the existing error dialog at lines 5926 and 18136: render connection and stereotype-change popup content and restore focus on close.
- Modify `src/App.tsx`: use policy validation for canvas creation, relationship updates, stereotype changes, and popup invocation; ensure no history/state mutation occurs on rejection.
- Create `src/services/sysmlConnectionUi.test.ts`: pure UI-facing filtering/message tests; browser-level behavior is covered in `tests/e2e/sysml-connection-policy.spec.ts`.
- Modify `src/engine/sysml/persistence.ts`, `src/engine/sysml/validation.ts`, and their tests: preserve resolvable legacy relationships while reporting policy diagnostics.
- Modify `src/engine/sysml/conformanceManifest.ts` only if new test evidence rows are required; do not mark unsupported SysML v2 behavior as supported.
- Add/update Playwright scenarios under `tests/e2e/` for popup behavior and end-to-end blocked connections.

### Task 1: Build the central endpoint taxonomy and policy evaluator

**Files:**
- Create: `src/engine/sysml/connectionPolicy.ts`
- Test: `src/engine/sysml/connectionPolicy.test.ts`

**Interfaces:**
- Produces `SysmlEndpointFamily`, `ConnectionEndpoint`, `ConnectionPolicyDecision`, `ConnectionPolicyInput`, `classifyLegacyEndpoint`, `classifyCanonicalEndpoint`, and `evaluateSysmlConnection`.

- [ ] **Step 1: Write failing table-driven tests** for Block, InterfaceBlock, Interface, ValueType, Enumeration, Requirement, Verification Case, Part, Port, value parameter, and unknown endpoints across association, composition, shared aggregation, generalization, dependency, allocation, requirement relationships, binding, assembly, and delegation.
- [ ] **Step 2: Run the focused test file** with `npx vitest run src/engine/sysml/connectionPolicy.test.ts --reporter=verbose`; verify failures identify the missing evaluator and expected diagnostic codes.
- [ ] **Step 3: Implement the typed endpoint families and explicit compatibility matrix**. Composition/shared aggregation must be Block-family only; same-family generalization must be enforced; unknown custom stereotypes must be limited to dependency/allocation and eligible requirement traces/refines.
- [ ] **Step 4: Add structured diagnostics** with stable codes, source/target names and families, human-readable reason, and corrective action. Do not include UI imports or mutation.
- [ ] **Step 5: Run the focused tests** and verify every matrix row passes.
- [ ] **Step 6: Commit** with `git add src/engine/sysml/connectionPolicy.ts src/engine/sysml/connectionPolicy.test.ts && git commit -m "feat: add centralized SysML connection policy"`.

### Task 2: Integrate legacy creation and canonical policy validation

**Files:**
- Modify: `src/services/sysmlCreationRules.ts`
- Modify: `src/services/sysmlCreationRules.test.ts`
- Modify: `src/engine/sysml/policy.ts`
- Modify: `src/engine/sysml/policy.test.ts`

**Interfaces:**
- Consumes `evaluateSysmlConnection` and endpoint classification from Task 1.
- Produces legacy/canonical validation results with matching primary codes.

- [ ] **Step 1: Add failing parity tests** asserting that equivalent legacy and canonical Block→ValueType composition, Block→ValueType generalization, ValueType→ValueType generalization, Requirement→Block association, and unknown-stereotype structural links return identical validity and primary diagnostic codes.
- [ ] **Step 2: Add failing cycle regressions** proving reciprocal association, dependency, and allocation are allowed while composition, generalization, requirement containment, deriveReqt, and copy cycles remain rejected.
- [ ] **Step 3: Run `npx vitest run src/services/sysmlCreationRules.test.ts src/engine/sysml/policy.test.ts --reporter=verbose`** and confirm the new tests fail.
- [ ] **Step 4: Replace `endpointKind`’s non-requirement collapse** with central endpoint-family mapping and route BDD/requirements checks through the policy evaluator.
- [ ] **Step 5: Restrict canonical composition to Block-family endpoints** and generalization to compatible families; remove `association`, `dependency`, and `allocation` from canonical cycle detection.
- [ ] **Step 6: Run the focused tests** and verify legacy/canonical parity.
- [ ] **Step 7: Commit** with `git add src/services/sysmlCreationRules.ts src/services/sysmlCreationRules.test.ts src/engine/sysml/policy.ts src/engine/sysml/policy.test.ts && git commit -m "fix: align legacy and canonical SysML connection rules"`.

### Task 3: Harden canonical command admission and persistence diagnostics

**Files:**
- Modify: `src/services/sysmlCommandGateway.ts`
- Test: `src/services/sysmlCommandGateway.test.ts`
- Modify: `src/engine/sysml/persistence.ts`
- Test: `src/engine/sysml/persistence.test.ts`
- Modify: `src/engine/sysml/validation.ts`
- Test: `src/engine/sysml/validation.test.ts`

**Interfaces:**
- Consumes canonical policy diagnostics from Tasks 1–2.
- Produces typed command failures and post-load validation diagnostics without destructive repair.

- [ ] **Step 1: Write failing gateway tests** for create/update rejection of invalid aggregation, cross-family generalization, and Requirement structural relationships; assert no repository mutation.
- [ ] **Step 2: Write failing persistence tests** for preserving a resolvable invalid relationship with a diagnostic and quarantining only missing-endpoint relationships.
- [ ] **Step 3: Run focused gateway/persistence/validation tests** and confirm the failures.
- [ ] **Step 4: Route relationship create/update admission through the central policy before staged repository mutation.** Preserve existing typed diagnostics for duplicates, missing endpoints, self-links, ownership, direction, type, unit, and context.
- [ ] **Step 5: Extend repository validation to report policy-invalid resolvable relationships** while leaving them present in the loaded model.
- [ ] **Step 6: Run focused tests and verify mutation remains unchanged after rejected commands.**
- [ ] **Step 7: Commit** with `git add src/services/sysmlCommandGateway.ts src/services/sysmlCommandGateway.test.ts src/engine/sysml/persistence.ts src/engine/sysml/persistence.test.ts src/engine/sysml/validation.ts src/engine/sysml/validation.test.ts && git commit -m "fix: enforce SysML connection policy at command and load boundaries"`.

### Task 4: Add popup error presentation and relationship-choice filtering

**Files:**
- Modify `src/App.tsx` existing error dialog and error-system state around lines 5926 and 18136.
- Modify: `src/components/sysml/RelationshipEndEditor.tsx`
- Modify: `src/components/sysml/RelationshipEndEditor.test.tsx`

**Interfaces:**
- Consumes structured policy diagnostics.
- Produces a reusable popup with title, relationship, endpoint families, reason, corrective action, and focus restoration.

- [ ] **Step 1: Write failing component tests** for filtered relationship choices, invalid-update callback payloads, popup content, and focus restoration.
- [ ] **Step 2: Run the focused component tests** with `npx vitest run src/components/sysml/RelationshipEndEditor.test.tsx --reporter=verbose` and confirm failures.
- [ ] **Step 3: Implement a reusable popup presentation** using the project’s existing modal conventions. Avoid `window.alert`; preserve the error log entry separately.
- [ ] **Step 4: Add a pure helper** that filters relationship kinds by endpoint families and diagram context; hide binding from generic BDD choices and hide requirement relations when endpoint direction is invalid.
- [ ] **Step 5: Keep defensive validation on programmatic/stale updates** so a hidden invalid choice cannot mutate state.
- [ ] **Step 6: Run the component tests** and verify accessibility labels and focus behavior.
- [ ] **Step 7: Commit** with `git add src/App.tsx src/components/sysml/RelationshipEndEditor.tsx src/components/sysml/RelationshipEndEditor.test.tsx src/services/sysmlConnectionUi.test.ts && git commit -m "feat: show actionable SysML connection errors"`.

### Task 5: Integrate blocked behavior into canvas creation, editing, and stereotype changes

**Files:**
- Modify: `src/App.tsx`
- Test: `src/services/sysmlConnectionUi.test.ts` for pure filtering/message behavior; `tests/e2e/sysml-connection-policy.spec.ts` for browser state and popup behavior.

**Interfaces:**
- Consumes the central evaluator and popup from Tasks 1 and 4.
- Produces atomic canvas/editor/stereotype behavior with no history or state mutation on rejection.

- [ ] **Step 1: Write failing UI tests** for Block→ValueType composition rejection, no default association when no legal relationship exists, invalid relationship-kind update, and changing a composed Block to ValueType.
- [ ] **Step 2: Run the focused UI tests** and confirm the state mutation assertions fail.
- [ ] **Step 3: Update `createRelationship`** to evaluate endpoint families before `addToHistory` and state setters; invoke the popup with the structured diagnostic on failure.
- [ ] **Step 4: Update `updateRelationship`** to evaluate proposed kind/endpoints and preserve the current relationship on failure.
- [ ] **Step 5: Update `updateBlock`** to project the candidate stereotype, validate every connected relationship atomically, and reject the stereotype change if any relationship becomes invalid.
- [ ] **Step 6: Update canvas selection flow** so it filters legal relationship kinds and does not silently default to association for an illegal pair.
- [ ] **Step 7: Run the focused UI tests** and verify history is not written before rejected operations.
- [ ] **Step 8: Commit** with `git add src/App.tsx src/services/sysmlConnectionUi.test.ts tests/e2e/sysml-connection-policy.spec.ts && git commit -m "fix: block invalid SysML connections in the editor"`.

### Task 6: Add end-to-end and release-gate coverage

**Files:**
- Modify/create: `tests/e2e/*` focused SysML scenario file.
- Modify: `package.json` only if a focused test script is required.
- Modify: `docs/SYSML_PROFILE_CONFORMANCE_MATRIX.md` or `src/engine/sysml/conformanceManifest.ts` only if the new evidence paths must be recorded.

**Interfaces:**
- Consumes the completed policy, command, persistence, and UI behavior from Tasks 1–5.
- Produces browser-level evidence and release documentation for the hardened rules.

- [ ] **Step 1: Add Playwright scenarios** that create Block and ValueType elements, attempt illegal composition, assert the popup text, and verify no relationship appears; add a valid ValueType property workflow and a valid Block composition workflow.
- [ ] **Step 2: Add a legacy-project scenario** that loads an invalid resolvable relationship, shows its diagnostic, and confirms it is preserved until edited/deleted.
- [ ] **Step 3: Run the focused browser command** `npm run test:e2e:sysml -- --grep "connection policy|ValueType|invalid relationship"` and fix only test-environment issues surfaced by the run.
- [ ] **Step 4: Run the complete SysML suite** with `npm run test:sysml`.
- [ ] **Step 5: Run TypeScript validation** with `npx tsc --noEmit`.
- [ ] **Step 6: Run the release gate** with `npm run test:sysml:full-release` if the local toolchain is available.
- [ ] **Step 7: Record evidence paths and supported behavior** in the conformance matrix without claiming additional SysML-v2 support.
- [ ] **Step 8: Commit** with `git add tests/e2e package.json docs/SYSML_PROFILE_CONFORMANCE_MATRIX.md src/engine/sysml/conformanceManifest.ts && git commit -m "test: cover SysML connection policy end to end"`.

### Task 7: Final verification and handoff

**Files:**
- No source changes unless verification exposes a failure; fix the smallest root cause and add a regression test in the owning task’s files.

- [ ] **Step 1: Run `git diff --check` and `git status --short`.**
- [ ] **Step 2: Run `npm run test:sysml` and `npx tsc --noEmit` again from the final tree.**
- [ ] **Step 3: Run the applicable Playwright connection-policy scenarios.**
- [ ] **Step 4: Inspect the final diff for accidental broad changes, unresolved placeholders, and any path/type mismatch between policy adapters.**
- [ ] **Step 5: Summarize changed files, tests run, known limitations, and commit hashes for handoff.**
