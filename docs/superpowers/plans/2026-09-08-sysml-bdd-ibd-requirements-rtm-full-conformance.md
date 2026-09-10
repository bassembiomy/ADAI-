# SysML BDD, IBD, Requirements, and RTM Full-Conformance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a professional MBSE architecture module whose BDD, IBD, Requirements diagrams, lifecycle rules, and Requirements Traceability Matrix conform to the supported SysML profile and remain consistent through every model operation.

**Architecture:** Target OMG SysML v1.6 / ISO/IEC 19514-style BDD, IBD, and Requirements concepts because those are the diagrams currently implemented. Introduce one canonical, React-free SysML repository; make `App.tsx` a UI adapter and make Entropy OPM a validated projection/import adapter, never a competing source of truth. Derive every diagram and RTM cell from stable model IDs and revisioned evidence.

**Tech Stack:** TypeScript 5, React 18, `@xyflow/react`, Vitest, existing ADIA reporting/simulation/code-generation services.

## Global Constraints

- Supported normative baseline: OMG SysML 1.6 concepts used by BDD, IBD, and Requirements diagrams; document every supported, partial, and unsupported construct.
- SysML v2 is out of scope for semantic equivalence; provide only a future versioned adapter boundary.
- Native SysML repository is authoritative. OPM views/imports are projections with explicit loss/mapping diagnostics.
- Stable IDs never change on rename, move, layout, baseline, import merge, or diagram navigation.
- Definitions and usages are distinct: deleting a BlockDefinition does not silently delete unrelated PartUsages typed by it.
- Only composite ownership controls recursive lifetime deletion. Association, shared aggregation, dependency, allocation, flow, satisfy, verify, refine, trace, and deriveReqt never cascade-delete peers.
- All mutations are immutable transactions with pre-validation, impact preview, revision creation, undo/redo, and evidence invalidation.
- Invalid or unresolved models fail closed for simulation, reports, export, code generation, and verification.

---

## Canonical files

- Create `src/engine/sysml/model.ts` — canonical SysML repository types.
- Create `src/engine/sysml/profile.ts` — supported-profile capability registry.
- Create `src/engine/sysml/validation.ts` — cross-model validation and diagnostics.
- Create `src/engine/sysml/mutations.ts` — atomic commands, impact, delete, undo/redo.
- Create `src/engine/sysml/bdd.ts`, `ibd.ts`, `requirements.ts`, `rtm.ts` — domain validators/projections.
- Create `src/engine/sysml/persistence.ts` — schema-versioned JSON migration and deterministic export.
- Create `src/engine/sysml/opmAdapter.ts` — explicit SysML↔OPM mapping contract.
- Modify `src/App.tsx` — replace embedded SysML business rules with engine calls.
- Modify `src/types/sysml_types.ts` and `src/services/sysmlIntegrityService.ts` — compatibility aliases/delegation only.
- Modify `src/components/entropy/SysmlToOpmImporter.ts` — consume canonical adapter diagnostics.
- Create `src/components/sysml/TraceabilityMatrix.tsx` — professional RTM UI.
- Create `docs/SYSML_PROFILE_CONFORMANCE_MATRIX.md` — requirement-to-test release evidence.

## Core interfaces

```ts
export interface SysmlRepository {
  schemaVersion: 2;
  profileId: 'OMG-SysML-1.6-ADIA';
  revision: number;
  definitions: Record<string, BlockDefinition | ValueTypeDefinition | InterfaceDefinition>;
  usages: Record<string, PartUsage | PortUsage>;
  connectors: Record<string, ConnectorUsage>;
  relationships: Record<string, SysmlRelationship>;
  requirements: Record<string, RequirementDefinition>;
  verificationCases: Record<string, VerificationCase>;
  evidence: Record<string, VerificationEvidence>;
  baselines: Record<string, ModelBaseline>;
}

export type SysmlRelationshipKind =
  | 'association' | 'sharedAggregation' | 'composition' | 'generalization'
  | 'dependency' | 'allocation' | 'binding' | 'itemFlow'
  | 'deriveReqt' | 'satisfy' | 'verify' | 'refine' | 'trace' | 'copy';

export interface SysmlDiagnostic {
  code: string;
  severity: 'info' | 'warning' | 'error';
  elementId?: string;
  propertyPath?: string;
  message: string;
}
```

### Task 1: Freeze the profile and capability matrix

**Files:** Create `src/engine/sysml/profile.ts`, `src/engine/sysml/profile.test.ts`, `docs/SYSML_PROFILE_CONFORMANCE_MATRIX.md`.

**Produces:** `SYSML_PROFILE`, `getCapability(id)`, and test-linked conformance rows.

- [ ] Write a failing test asserting profile ID/version and explicit status for every BDD, IBD, requirement, and RTM concept listed in this plan.
- [ ] Run `npx vitest run src/engine/sysml/profile.test.ts`; expect missing-module failure.
- [ ] Implement the immutable capability registry with `supported | partial | unsupported`, normative reference, diagnostic code, and test ID.
- [ ] Generate the Markdown matrix deterministically from the registry.
- [ ] Run the test; expect pass. Commit: `feat(sysml): define supported sysml 1.6 profile`.

### Task 2: Introduce the canonical metamodel and stable identity

**Files:** Create `src/engine/sysml/model.ts`, `src/engine/sysml/model.test.ts`; modify `src/types/sysml_types.ts`.

**Produces:** `SysmlRepository`, typed definitions/usages/connectors/relationships, `QualifiedName`, `Multiplicity`.

- [ ] Test stable IDs, namespaces, qualified names, multiplicity `[lower..upper]`, ordered/unique flags, units, dimensions, and JSON round-trip.
- [ ] Implement distinct BlockDefinition, PartUsage, PortDefinition/Usage, ValueType, Interface, Connector, ItemFlow, Requirement, VerificationCase, Evidence, and Baseline types.
- [ ] Add `parseMultiplicity(text)` rejecting malformed, negative, or lower-greater-than-upper bounds.
- [ ] Make legacy types compatibility aliases/adapters rather than a second schema.
- [ ] Run `npx vitest run src/engine/sysml/model.test.ts`; expect pass. Commit: `feat(sysml): add canonical mbse metamodel`.

### Task 3: Build the repository-wide validation gate

**Files:** Create `src/engine/sysml/validation.ts`, `src/engine/sysml/validation.test.ts`.

**Produces:** `validateSysmlRepository(repo): SysmlValidationReport`.

- [ ] Test duplicate IDs/qualified names, missing references, containment cycles, inheritance cycles, multiple composite owners, invalid multiplicity, and invalid relationship direction.
- [ ] Implement indexed validation returning stable diagnostics with exact element/property locations.
- [ ] Add `canSimulate`, `canExport`, `canReport`, and `canVerify` gates based on error classes.
- [ ] Run focused tests; expect pass. Commit: `feat(sysml): add fail-closed repository validation`.

### Task 4: Complete BDD semantics

**Files:** Create `src/engine/sysml/bdd.ts`, `src/engine/sysml/bdd.test.ts`; modify BDD selectors/rendering in `src/App.tsx`.

**Produces:** `deriveBddView`, `validateBlockDefinition`, `resolveInheritedFeatures`.

- [ ] Test blocks, value types/units, value/part/reference/flow properties, operations, constraints, ports, associations, composition, shared aggregation, generalization, dependency, allocation, multiplicities, abstract/leaf, redefinition, and subsetting.
- [ ] Implement inheritance resolution with cycle/conflict diagnostics and definition-versus-usage navigation.
- [ ] Render correct relationship notation and compartments from the projection.
- [ ] Run BDD tests and reporting snapshot tests; expect pass. Commit: `feat(sysml): implement complete bdd semantics`.

### Task 5: Enforce composition lifecycle and safe deletion

**Files:** Create `src/engine/sysml/mutations.ts`, `src/engine/sysml/mutations.test.ts`; replace deletion logic in `src/services/sysmlIntegrityService.ts` and `src/App.tsx`.

**Produces:** `analyzeMutation`, `applyCommand`, `deleteElements`, `undo`, `redo`.

- [ ] Test whole deletion recursively deletes only composed PartUsages; shared/reference/associated elements survive; definition deletion reports typed usages as impacts rather than deleting them.
- [ ] Test ports/connectors/relationships, requirement links, runtime references, reports, and evidence are removed or marked stale atomically.
- [ ] Implement confirmation impact including affected diagrams, requirements, tests, artifacts, and baselines.
- [ ] Route every native SysML mutation through one transaction gateway.
- [ ] Run mutation and existing integrity tests; expect pass. Commit: `refactor(sysml): enforce composition-aware lifecycle transactions`.

### Task 6: Complete IBD part, port, connector, and flow semantics

**Files:** Create `src/engine/sysml/ibd.ts`, `src/engine/sysml/ibd.test.ts`; modify IBD operations/rendering in `src/App.tsx`.

**Produces:** `deriveIbdView`, `validateConnector`, `resolvePortUsage`, `validateItemFlow`.

- [ ] Test typed/nested parts, inherited ports, full/proxy ports, direction, conjugation, interface compatibility, assembly/delegation connectors, binding connectors, item flows, boundary crossing, and multiplicity.
- [ ] Reject dangling endpoints, wrong ownership context, incompatible conveyed types/units, invalid direction, duplicate connector, and direct cross-boundary links without delegation ports.
- [ ] Add definition↔usage and connector↔port bidirectional navigation.
- [ ] Run IBD and reporting tests; expect pass. Commit: `feat(sysml): implement complete ibd semantics`.

### Task 7: Complete Requirements semantics and governance

**Files:** Create `src/engine/sysml/requirements.ts`, `src/engine/sysml/requirements.test.ts`; modify requirement UI in `src/App.tsx`.

**Produces:** `validateRequirement`, `transitionRequirementStatus`, `deriveRequirementView`.

- [ ] Test unique requirement ID, text, namespace, source, rationale, owner, risk, priority, version, baseline, hierarchy, and relation directions.
- [ ] Implement `deriveReqt`, `satisfy`, `verify`, `refine`, `trace`, `copy`, containment, and cycle rules.
- [ ] Enforce `draft → approved → implemented → verified`, with failed/stale/retired states; verified requires a passed VerificationCase and current evidence.
- [ ] Add suspect-link propagation after requirement or supplier changes.
- [ ] Run requirement tests; expect pass. Commit: `feat(sysml): implement governed requirements lifecycle`.

### Task 8: Build the canonical RTM engine

**Files:** Create `src/engine/sysml/rtm.ts`, `src/engine/sysml/rtm.test.ts`.

**Produces:** `buildTraceabilityMatrix(repo, filters)`, `computeCoverageMetrics`, `exportRtmCsv`.

- [ ] Test many-to-many rows/cells spanning requirements, blocks, parts, ports, connectors, behaviors, simulations, verification cases, artifacts, evidence, owners, versions, and baselines.
- [ ] Implement statuses `covered`, `verified`, `failed`, `uncovered`, `stale`, `suspect`, `orphan`, `unsupported`, `unresolved`.
- [ ] Implement deterministic sorting/export and filters for baseline, subsystem, owner, risk, status, method, and change set.
- [ ] Run RTM tests; expect pass. Commit: `feat(sysml): add canonical requirements traceability matrix`.

### Task 9: Deliver professional RTM UI and navigation

**Files:** Create `src/components/sysml/TraceabilityMatrix.tsx`, `TraceabilityMatrix.test.tsx`; modify RTM window in `src/App.tsx`.

**Produces:** virtualized matrix, filters, metrics, export, bidirectional navigation, impact highlighting.

- [ ] Test cell rendering/status text, keyboard navigation, filters, source/target focus, CSV export, and stale/suspect change highlighting.
- [ ] Connect UI exclusively to `buildTraceabilityMatrix`; remove duplicated matrix calculations from `App.tsx`.
- [ ] Ensure accessible non-color status and diagnostic navigation.
- [ ] Run component tests; expect pass. Commit: `feat(sysml): deliver professional rtm workspace`.

### Task 10: Versioned persistence, baselines, and audit trail

**Files:** Create `src/engine/sysml/persistence.ts`, `persistence.test.ts`; modify project save/load in `src/App.tsx`.

**Produces:** `serializeRepository`, `loadRepository`, `createBaseline`, `compareBaselines`, `ModelChangeRecord`.

- [ ] Test deterministic save/load, legacy migration without metadata loss, tamper diagnostics, baseline immutability, diff, and audit records.
- [ ] Persist model revision, schema/profile version, relationships, verification evidence, and unresolved mappings.
- [ ] Block edits to protected baselines; create a new revision/change record instead.
- [ ] Run persistence tests; expect pass. Commit: `feat(sysml): add baselines and auditable persistence`.

### Task 11: Make OPM interoperability explicit and loss-aware

**Files:** Create `src/engine/sysml/opmAdapter.ts`, `opmAdapter.test.ts`; modify `SysmlToOpmImporter.ts` and Entropy integration.

**Produces:** `projectSysmlToOpm`, `assessOpmRoundTripLoss`.

- [ ] Test composition remains distinguishable, all unmapped IBD/requirement concepts retain source IDs/status, and no unsupported construct is silently converted.
- [ ] Replace composition→aggregation conversion with explicit conceptual mapping and loss diagnostic unless OPM ownership equivalence is proven.
- [ ] Make native SysML authoritative after projection; do not overwrite it from lossy OPM data.
- [ ] Run adapter and Entropy tests; expect pass. Commit: `fix(sysml): make opm interoperability loss-aware`.

### Task 12: Integrate reports, simulation, verification, and generated artifacts

**Files:** Modify `src/features/reporting/reportDiagrams.ts`, `reportHierarchyEngine.ts`, `generateArchitectureReport.ts`; create `src/engine/sysml/evidence.test.ts`.

**Produces:** end-to-end links from requirement to model element to simulation/test to generated artifact/source trace.

- [ ] Test reports use canonical projections and current evidence only.
- [ ] Join state-machine/C trace IDs and simulation scenarios to requirement verification cases.
- [ ] Invalidate evidence/artifacts when any traced semantic fingerprint changes; layout-only edits remain valid.
- [ ] Run reporting, simulation, codegen, and evidence tests; expect pass. Commit: `feat(sysml): integrate mbse verification evidence`.

### Task 13: End-to-end conformance and release qualification

**Files:** Create `src/engine/sysml/sysmlConformance.test.ts`, `src/components/sysml/sysmlBrowserFlow.test.tsx`; update `package.json` and `docs/SYSML_PROFILE_CONFORMANCE_MATRIX.md`.

**Produces:** `test:sysml`, `test:sysml:release`, evidence-linked conformance report.

- [ ] Build one representative model containing every supported BDD/IBD/Requirements/RTM construct.
- [ ] Exercise create, rename, move, connect, convert, delete, composition cascade, non-composition preservation, undo/redo, baseline, save/load, OPM projection, simulation, verification, RTM, report, and export.
- [ ] Add browser verification for diagram notation, navigation, impact confirmation, matrix filters, and evidence status.
- [ ] Restore the pinned GCC required by OPM qualification and run `npm run test:opm` without skips.
- [ ] Run `npm run test:sysml:release`, `npm run test:opm:qualification`, and `npx tsc --noEmit`; require zero failures.
- [ ] Update every conformance row with implementation file, test ID, result, and known limitation. Commit: `test(sysml): qualify bdd ibd requirements and rtm release`.

## Release acceptance criteria

- Every supported profile capability maps to canonical types, validation, UI behavior, persistence, tests, and conformance evidence.
- BDD and IBD share definitions/usages without duplication or stale copies.
- Composition is first-class and is the only relationship producing recursive part deletion.
- All six core requirement relationships have correct direction and lifecycle impact.
- “Verified” is impossible without current passed evidence.
- RTM is canonical, many-to-many, baseline-aware, navigable, filterable, exportable, and change-sensitive.
- Native SysML and OPM cannot silently diverge or lose unsupported semantics.
- Full SysML, OPM, TypeScript, reporting, browser, and compiled-C gates pass.

