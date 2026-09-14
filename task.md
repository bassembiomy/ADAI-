# Task: SysML Connection Policy Hardening

- [x] Task 1: Build the central endpoint taxonomy and policy evaluator
  - [x] Step 1: Write table-driven tests for Block, InterfaceBlock, Interface, ValueType, Enumeration, Requirement, Verification Case, Part, Port, value parameter, and unknown endpoints across relationships.
  - [x] Step 2: Run focused test file `src/engine/sysml/connectionPolicy.test.ts`.
  - [x] Step 3: Implement typed endpoint families and compatibility matrix (`src/engine/sysml/connectionPolicy.ts`).
  - [x] Step 4: Add structured diagnostics with stable codes, endpoint families, reason, and corrective action.
  - [x] Step 5: Run tests and verify all matrix rows pass.
  - [x] Step 6: Commit centralized SysML connection policy (`e66dfb0`).

- [x] Task 2: Integrate legacy creation and canonical policy validation
  - [x] Step 1: Parity tests between legacy and canonical relationship validation.
  - [x] Step 2: Cycle regressions for reciprocal association/dependency/allocation vs composition/generalization cycles.
  - [x] Step 3: Run creation rules and policy tests.
  - [x] Step 4: Map legacy endpoints to endpoint descriptors and delegate to central policy (`src/services/sysmlCreationRules.ts`).
  - [x] Step 5: Canonical policy endpoint mapping and relationship admission (`src/engine/sysml/policy.ts`).
  - [x] Step 6: Run tests and verify legacy/canonical parity.
  - [x] Step 7: Commit legacy and canonical alignment (`f492842`, `d085bb6`, `78949d7`).

- [x] Task 3: Harden canonical command admission and persistence diagnostics
  - [x] Step 1: Gateway tests for rejection of invalid aggregation and cross-family links.
  - [x] Step 2: Persistence tests for preserving resolvable invalid relationships while reporting diagnostics.
  - [x] Step 3: Run gateway, persistence, and validation tests.
  - [x] Step 4: Route create/update relationship admission through central policy in `src/services/sysmlCommandGateway.ts`.
  - [x] Step 5: Extend repository validation to report policy diagnostics on load without deleting invalid links (`src/engine/sysml/persistence.ts`, `src/engine/sysml/validation.ts`).
  - [x] Step 6: Verify mutation remains unchanged after rejected commands.
  - [x] Step 7: Commit command and load boundary hardening (`6c627fe`).

- [x] Task 4: Add popup error presentation and relationship-choice filtering
  - [x] Step 1: Component tests for filtered choices, rejection callback payloads, popup content, and focus restoration.
  - [x] Step 2: Run component tests `src/components/sysml/RelationshipEndEditor.test.tsx` and `SysmlConnectionErrorDetails.test.tsx`.
  - [x] Step 3: Implement reusable popup presentation using existing modal conventions (`src/components/sysml/SysmlConnectionErrorDetails.tsx`).
  - [x] Step 4: Add helper `filterRelationshipKinds` to filter choices by endpoint family and diagram context.
  - [x] Step 5: Keep defensive validation on programmatic/stale updates.
  - [x] Step 6: Run component tests and verify accessibility and focus behavior.
  - [x] Step 7: Commit popup error presentation and filtering (`b077954`, `8c9cc52`).

- [x] Task 5: Integrate blocked behavior into canvas creation, editing, and stereotype changes
  - [x] Step 1: Write UI tests for Block→ValueType composition rejection, canvas selection flow, and stereotype changes.
  - [x] Step 2: Run UI tests (`src/services/sysmlConnectionUi.test.ts`).
  - [x] Step 3: Update `createRelationship` in `src/App.tsx` to evaluate policy before history/state mutation and trigger popup on failure.
  - [x] Step 4: Update `updateRelationship` in `src/App.tsx` to preserve current relationship on failure.
  - [x] Step 5: Update `updateBlock` in `src/App.tsx` to project stereotype change and reject if any connected relationship becomes invalid.
  - [x] Step 6: Update canvas selection flow to filter relationship kinds and avoid defaulting to association when illegal.
  - [x] Step 7: Run UI tests and verify atomic rejection without history writes.
  - [x] Step 8: Commit editor connection blocking (`8053ade`).

- [x] Task 6: Add end-to-end and release-gate coverage
  - [x] Step 1: Add Playwright scenarios creating Block and ValueType elements, attempting illegal composition, asserting popup text, and verifying no relationship appears (`tests/e2e/sysml-connection-policy.spec.ts`).
  - [x] Step 2: Add legacy-project scenario loading an invalid resolvable relationship and confirming preservation with diagnostics.
  - [x] Step 3: Run focused browser command `npx playwright test tests/e2e/sysml-connection-policy.spec.ts` (all 4 passed).
  - [x] Step 4: Run complete SysML suite with `npm run test:sysml` (42 test files, 435 tests passing).
  - [x] Step 5: Run TypeScript validation with `npx tsc --noEmit` (0 errors).
  - [x] Step 6: Run release gate with `npm run test:sysml:release` (SysML + Reporting + TypeScript, all passed).
  - [x] Step 7: Record evidence paths and supported behavior in `src/engine/sysml/conformanceManifest.ts` and `docs/SYSML_PROFILE_CONFORMANCE_MATRIX.md`.
  - [x] Step 8: Commit end-to-end coverage (`c428ffb`).

- [x] Task 7: Final verification and handoff
  - [x] Step 1: Run `git diff --check` and `git status --short`.
  - [x] Step 2: Run `npm run test:sysml` and `npx tsc --noEmit` from final tree.
  - [x] Step 3: Run Playwright connection policy scenarios.
  - [x] Step 4: Inspect final diff for clean boundaries and consistency.
  - [x] Step 5: Summarize changed files, tests run, and commit history for handoff.
