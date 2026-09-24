# BDD/IBD Property Usage Synchronization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make BDD properties and IBD usages synchronize bidirectionally using Cameo/SysML semantics.

**Architecture:** Add a pure reconciliation module for legacy `BlockData`/`PartData` projections. Route both `updateBlock` and `updatePart` through one transaction boundary, preserve usage identity/layout/connectors, and keep the canonical normalized SysML model authoritative where commands already exist.

**Tech Stack:** TypeScript, React, Vitest, existing SysML legacy adapter and normalized model services.

## Global Constraints

- `part` typed by Block maps to `composite` usage.
- `reference` typed by Block maps to `reference` usage.
- `value`, `flow`, and `constraint` properties do not create ordinary IBD part nodes.
- Synchronization must be idempotent and preserve layout/connectors for retained identities.
- Invalid/unresolved types remain diagnostics and must not silently create usages.
- All semantic mutations participate in existing undo/redo and deletion transactions.

### Task 1: Define the pure BDD/IBD reconciliation contract

**Files:**
- Create: `src/services/sysmlPropertyUsageSync.ts`
- Create: `src/services/sysmlPropertyUsageSync.test.ts`
- Modify: `src/types/sysml_types.ts` only if a stable property/usage identity field is required

**Interfaces:**
- Produce `reconcilePropertyUsages(blocks, parts, connectors, ownerBlockId): { blocks: BlockData[]; parts: PartData[]; connectors: ConnectorData[]; diagnostics: ...[] }`.
- Preserve an existing `PartData.id` when its property identity is known; otherwise use the property ID as the initial stable usage identity.
- Map `part` to `aggregation: 'composite'` and `reference` to `aggregation: 'reference'`.

- [ ] Write failing tests for part creation, reference creation, non-structural properties, idempotence, updates, and property deletion.
- [ ] Run `npx vitest run src/services/sysmlPropertyUsageSync.test.ts`; confirm failures describe the missing reconciliation behavior.
- [ ] Implement the smallest pure reconciliation functions with no React or state setters.
- [ ] Re-run the focused tests and confirm all pass.
- [ ] Commit with `git commit -m "feat: add BDD IBD property usage reconciliation"`.

### Task 2: Route legacy BDD mutations through reconciliation

**Files:**
- Modify: `src/App.tsx` around `updateBlock`, `updatePart`, `createPart`, and deletion application
- Modify: `src/services/sysmlPropertyRules.ts` only to remove or delegate overlapping one-way projection helpers
- Test: `src/services/sysmlPropertyUsageSync.test.ts` and relevant existing App/service tests

**Interfaces:**
- `updateBlock` must reconcile when `properties` changes, including add, edit, kind change, type change, multiplicity change, and removal.
- `updatePart` must reconcile the owning property and preserve geometry/connectors.
- Deletion must remove the paired property/usage and dependent connectors according to the existing deletion transaction.

- [ ] Add failing tests for BDD property edits producing the expected `PartData` and for removing a property removing only its paired usage.
- [ ] Run the focused test command and verify the failures are due to missing UI-bound reconciliation.
- [ ] Replace one-way callback updates with one transaction that updates blocks, parts, and connectors from the reconciler.
- [ ] Verify duplicate callbacks do not duplicate parts or properties.
- [ ] Run the focused service tests and the existing SysML suite.
- [ ] Commit with `git commit -m "feat: synchronize legacy BDD and IBD edits"`.

### Task 3: Align IBD rendering and editors with structural property kinds

**Files:**
- Modify: `src/App.tsx` IBD rendering and part properties panel
- Modify: `src/components/sysml/BlockPropertiesEditor.tsx` if labels/help need to distinguish structural kinds
- Test: `src/components/sysml/BlockPropertiesEditor.test.tsx`

**Interfaces:**
- Render composite and reference usages in the owning IBD context.
- Keep value, flow, and constraint properties out of the ordinary part-node renderer.
- Display aggregation/kind clearly and prevent invalid kind/type combinations through the existing adapter validation.

- [ ] Add failing component tests for kind/type mapping and structural-property UI behavior.
- [ ] Implement rendering/editor changes without changing connector endpoint rules.
- [ ] Run `npx vitest run src/components/sysml/BlockPropertiesEditor.test.tsx src/services/sysmlPropertyUsageSync.test.ts`.
- [ ] Commit with `git commit -m "feat: align BDD IBD property editors with SysML kinds"`.

### Task 4: Canonical adapter, persistence, and migration coverage

**Files:**
- Inspect and modify only the needed canonical adapter files: `src/engine/sysml/normalizedStore.ts`, `src/services/sysmlCommandGateway.ts`, `src/engine/sysml/persistence.ts`, and their tests
- Test: `src/engine/sysml/normalizedStore.test.ts`, `src/engine/sysml/persistence.test.ts`, `src/services/sysmlCommandGateway.test.ts`

**Interfaces:**
- Ensure normalized `PropertyDefinition` and `PartUsage` retain stable identity, owner, type, aggregation, and multiplicity through command application and reload.
- Legacy synchronization must not bypass canonical validation for newly introduced command paths.

- [ ] Add failing round-trip tests for part/reference properties and usages.
- [ ] Implement only missing serialization/adapter mappings; do not duplicate canonical validation in React.
- [ ] Run the focused canonical tests and confirm pass.
- [ ] Commit with `git commit -m "feat: preserve synchronized property usages in SysML persistence"`.

### Task 5: End-to-end regression and release verification

**Files:**
- Modify: `tests/e2e/sysml-bdd-ibd-requirements-rtm.spec.ts` or create a focused SysML E2E spec
- Test: all touched unit suites and `npm run test:sysml`

- [ ] Add an E2E flow: create Block A and Block B, add `drive: B` as a part property on A, enter A’s IBD, verify `drive: B`, edit it in IBD, return to BDD, verify the property, delete it, and verify both projections disappear.
- [ ] Add a reference-property flow and confirm it is not treated as composite.
- [ ] Run `npm run test:sysml`.
- [ ] Run the focused E2E test with `npx playwright test <file> --project=chromium`.
- [ ] Run `npx tsc --noEmit`; distinguish pre-existing unrelated errors from regressions.
- [ ] Review `git diff`, verify no unrelated files changed, and document any remaining diagnostics.

## Self-review

- Spec coverage: behavior, mapping, synchronization, UI, validation, persistence, deletion, and tests are covered by Tasks 1–5.
- Placeholder scan: no unresolved TODO/TBD steps are present.
- Type consistency: all tasks use `BlockData`, `PartData`, `ConnectorData`, and the named reconciliation contract consistently.
