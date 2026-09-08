# OPM BDD/IBD/Requirements Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the lifecycle of every OPM/SysML-derived component consistent across BDD, IBD, and Requirements views, including creation, containment, linking, simulation, persistence, deletion, undo/redo, and evidence invalidation.

**Architecture:** Keep `nodes` and `edges` as the single canonical editor model. Add pure lifecycle/integrity services that validate and transform complete model snapshots; route every UI mutation through those services. Treat BDD, IBD, Requirements, simulation, traceability, and code-generation reports as projections or evidence tied to the current model fingerprint.

**Tech Stack:** React 18, TypeScript, `@xyflow/react`, Vitest, existing OPM editor/runtime/code-generation modules.

## Global Constraints

- Preserve State Machine and X-Bridges runtime/generator behavior.
- Preserve React Flow renderer type `opmEdge`; store semantic link type in `edge.data.type`.
- OPM simulation remains independent from the application State Machine tick.
- Invalid models must fail closed for simulation, export, code generation, and verification.
- Every diagnostic must include a stable code, severity, message, element ID, and property path when applicable.
- Do not silently repair ambiguous containment, orphan edges, or unresolved SysML connectors.
- SysML composition must be distinct from shared aggregation, association, dependency, flow, and behavioral links.
- Every mutation must be undoable as one atomic model transaction.
- The implementation must explicitly declare which SysML version/profile is supported. Do not mix SysML v1.x/UML notation assumptions with SysML v2 semantics without an adapter and documented mapping.
- Diagram views are projections of one canonical model; no diagram may become a competing source of truth.
- A professional MBSE workflow requires stable IDs, baselines, change impact, bidirectional navigation, completeness checks, and auditable verification evidence.

---

## File map

**Create:**

- `src/components/entropy/OpmModelLifecycle.ts` — canonical containment, reference integrity, BDD/IBD/requirements lifecycle validation, and model mutation helpers.
- `src/components/entropy/OpmDeletionImpact.ts` — deletion closure, impact analysis, cascade application, and invalidation payloads.
- `src/components/entropy/OpmTraceabilityModel.ts` — requirement coverage/status and affected-element traceability rows.
- `src/components/entropy/__tests__/OpmModelLifecycle.test.ts` — lifecycle and integrity tests.
- `src/components/entropy/__tests__/OpmDeletionImpact.test.ts` — deletion cascade and impact tests.

**Modify:**

- `src/components/entropy/EntropyTypes.ts` — add lifecycle metadata, diagnostics, and invalidation types.
- `src/components/entropy/OpmPortContracts.ts` — implement complete endpoint/port validation.
- `src/components/entropy/OpmLinkRules.ts` — make requirement/structure policy explicit and testable.
- `src/components/entropy/OpmMigrations.ts` — validate candidate conversions before returning an applicable result.
- `src/components/entropy/EntropyWorkspace.tsx` — route creation, conversion, deletion, import, OPL apply, port edits, undo/redo, and simulation invalidation through shared services.
- `src/components/entropy/OpmViewDeriver.ts` — surface invalid references/cycles and derive lifecycle-aware BDD, IBD, and Requirements projections.
- `src/components/entropy/SysmlToOpmImporter.ts` — preserve explicit SysML mapping status for unsupported/unmapped connectors.
- `src/components/entropy/OpmCodeGenerationWorkspace.tsx` — invalidate artifact lifecycle on every model revision and expose stale evidence.
- `src/components/entropy/SmartShowPanel.tsx` — show lifecycle diagnostics and requirement status.
- `src/components/entropy/__tests__/opmReleaseFlow.test.tsx` and related OPM tests — cover end-to-end mutation behavior.
- `docs/OPM_SYSML_SIMULATION_TRACEABILITY_DELETION_REVIEW.md` — mark findings as resolved as implementation lands.

## SysML coverage target

The plan must implement and verify the following professional MBSE coverage. Unsupported concepts must be represented as `unsupported` or `conceptual-only` with a visible diagnostic; they must not be silently dropped.

### BDD / block-definition coverage

- Block definitions with stable qualified names and unique IDs.
- Value types, units, dimensions, default values, and typed value properties.
- Part properties and explicit composite ownership, including multiplicity and ordered/unordered semantics.
- Shared/reference properties distinguished from composition.
- Flow properties and interface/provided/required port typing.
- Block attributes, operations, parameters, constraints, and documentation.
- Generalization/specialization with acyclic inheritance and inherited-feature resolution.
- Associations, aggregations, compositions, dependencies, allocations, and their direction/end metadata.
- Abstract blocks, leaf/final restrictions, derived properties, and redefinition/subsetting where supported by the selected profile.
- BDD-to-IBD realization: every typed part, port, connector, and item flow must resolve to a valid definition or produce a diagnostic.

### IBD / internal-block coverage

- Part usages typed by blocks, including nested part ownership and multiplicity.
- Full ports with direction, conjugation, interface/type, item type, and owner.
- Connectors with source/target port identity, role, multiplicity, and item-flow metadata.
- Item flows/flows with direction, conveyed item type, and compatibility with connected ports.
- Binding connectors for value/property equality where supported.
- Delegation/connectors crossing a block boundary with explicit boundary ports.
- Allocation/dependency links between behavior, structure, and implementation elements.
- No dangling connectors, cross-boundary links without ports, duplicate incompatible connections, or containment cycles.
- IBD navigation from a part to its definition and back from the definition to all usages.

### Requirements-diagram coverage

- Stable requirement ID, name, text, namespace, source, rationale, owner, priority, risk, status, version, and baseline.
- Requirement relationships: `deriveReqt`, `satisfy`, `verify`, `refine`, `trace`, `copy`, and containment as allowed by the selected SysML profile.
- Verification method, verification case/test ID, result, evidence URI/reference, execution timestamp, and responsible owner.
- Requirement decomposition and derived-requirement parent/child integrity.
- No duplicate requirement IDs, missing requirement text, invalid relationship direction, orphan requirements, or unverifiable “verified” status.
- Change impact from a requirement to affected blocks, parts, ports, connectors, behaviors, tests, artifacts, and baselines.

### Traceability-matrix coverage

- A canonical many-to-many matrix generated from the model, never manually duplicated.
- Rows and columns for requirements, blocks/parts, ports/connectors, behaviors, simulation scenarios, verification cases, generated artifacts, and evidence.
- Relationship type, direction, source ID, target ID, status, baseline, version, owner, and evidence for every matrix cell.
- Bidirectional navigation from any cell to the source diagram element and target artifact.
- Completeness metrics: uncovered requirements, unverified requirements, orphan implementations, orphan tests, stale evidence, unresolved mappings, and suspect links.
- Matrix filters by baseline, status, subsystem, owner, risk, verification method, and change set.
- Export/import with stable IDs and deterministic ordering; imported matrices must be validated against the canonical model.
- Change-impact highlighting after create, edit, convert, connect, disconnect, delete, import, and restore.

## Data contracts

Use these contracts consistently across tasks:

```ts
export type OpmDiagnosticSeverity = 'info' | 'warning' | 'error';

export interface OpmLifecycleDiagnostic {
  code: string;
  severity: OpmDiagnosticSeverity;
  message: string;
  elementId?: string;
  propertyPath?: string;
}

export interface OpmModelSnapshot {
  nodes: AppNode[];
  edges: AppEdge[];
}

export interface OpmLifecycleReport {
  valid: boolean;
  diagnostics: OpmLifecycleDiagnostic[];
  orphanNodeIds: string[];
  orphanEdgeIds: string[];
  structuralCycleIds: string[][];
  conflictingContainmentIds: string[];
}

export interface OpmModelMutationResult {
  snapshot: OpmModelSnapshot;
  diagnostics: OpmLifecycleDiagnostic[];
  invalidatesSimulation: boolean;
  invalidatesEvidence: boolean;
}
```

### Task 1: Establish canonical containment and lifecycle integrity

**Files:** Create `src/components/entropy/OpmModelLifecycle.ts`; modify `EntropyTypes.ts`; test `OpmModelLifecycle.test.ts`.

- [ ] Write tests for canonical parent resolution, duplicate IDs, missing parent nodes, conflicting `node.parentId`/`node.data.parentId`, orphan edges, invalid state ownership, and structural cycles.
- [ ] Run `npx vitest run src/components/entropy/__tests__/OpmModelLifecycle.test.ts`; confirm new tests fail.
- [ ] Implement `getCanonicalParentId`, `normalizeContainment`, and `validateOpmModelLifecycle` using immutable snapshots. Canonicalize only when both fields agree or one is absent; return an error for disagreement.
- [ ] Add structural cycle detection over aggregation/generalization edges and reject edges whose endpoints do not exist.
- [ ] Add an explicit `composition` semantic relationship for whole-to-part ownership. Require each part to have at most one composite owner and reject composition cycles.
- [ ] Keep composition separate from ordinary/shared aggregation: only composition establishes recursive ownership and deletion dependency.
- [ ] Require state nodes to reference an existing Object owner and synchronize the owner’s `data.states` list.
- [ ] Run the focused test file and require all tests to pass.
- [ ] Commit with `feat(opm): add canonical lifecycle integrity validation`.

### Task 1A: Define the supported SysML profile and canonical MBSE metamodel

**Files:** Create `src/components/entropy/OpmMbseMetamodel.ts`, `src/components/entropy/OpmProfileCapabilities.ts`, and tests in `src/components/entropy/__tests__/OpmMbseMetamodel.test.ts`; modify `EntropyTypes.ts`.

- [ ] Write failing tests for stable IDs, qualified names, namespaces, profile capability flags, multiplicities, units, typed properties, ports, connectors, requirements, verification cases, baselines, and evidence references.
- [ ] Declare the supported baseline explicitly (for example, SysML v1.x-compatible diagram concepts plus the product’s ISO 19450 OPM profile) and encode unsupported features as capabilities rather than pretending they are supported.
- [ ] Add canonical types for `BlockDefinition`, `PartUsage`, `PortDefinition`, `Connector`, `ItemFlow`, `ValueType`, `Requirement`, `VerificationCase`, `EvidenceReference`, `Baseline`, and `TraceLink`.
- [ ] Define qualified-name and stable-ID rules that survive rename, move, import, export, and copy/paste.
- [ ] Add multiplicity parsing/validation (`lower`, `upper`, ordered, unique) and unit/value-type compatibility contracts.
- [ ] Run the focused tests and commit with `feat(opm): define supported sysml mbse metamodel`.

### Task 1B: Implement BDD semantics and definition/usage consistency

**Files:** Create `src/components/entropy/OpmBddValidator.ts`; modify `OpmModelLifecycle.ts`, `OpmLinkRules.ts`, `OpmViewDeriver.ts`; test `OpmBddValidator.test.ts` and `opmViewDeriver.test.ts`.

- [ ] Test block definitions, abstract/leaf restrictions, inheritance cycles, duplicate features, composition ownership, multiplicity, shared aggregation, associations, allocations, and invalid endpoints.
- [ ] Implement BDD validation for definitions, properties, ports, operations, constraints, value types, units, inheritance, and relationship direction.
- [ ] Resolve inherited/redefined features and report conflicts with source element and property path.
- [ ] Validate that every IBD part is typed by a valid BDD block and every typed port resolves to a definition.
- [ ] Derive a BDD projection that exposes definition-versus-usage distinctions and invalidity diagnostics rather than hiding malformed elements.
- [ ] Commit with `feat(opm): enforce bdd definition and typing semantics`.

### Task 1C: Implement IBD parts, ports, connectors, flows, and boundaries

**Files:** Create `src/components/entropy/OpmIbdValidator.ts`; modify `OpmPortContracts.ts`, `OpmViewDeriver.ts`, `SysmlToOpmImporter.ts`; test `OpmIbdValidator.test.ts` and importer/port tests.

- [ ] Test typed parts, nested ownership, boundary crossings, conjugated ports, connector endpoint ownership, item-flow direction, binding compatibility, multiplicity, and unresolved SysML connectors.
- [ ] Implement explicit port records with owner, direction, interface/type, item type, conjugation, multiplicity, and semantic role.
- [ ] Implement connector records with source/target port IDs, owner context, link kind, item-flow metadata, and mapping status.
- [ ] Reject direct part-to-part links where a boundary port is required; reject connectors with missing or wrong-owner ports.
- [ ] Preserve unsupported SysML constructs as explicit mapping records and warnings.
- [ ] Add navigation from IBD part/port/connector to BDD definition and reverse usage index.
- [ ] Commit with `feat(opm): implement ibd connector and boundary semantics`.

### Task 2: Complete port and link contract validation

**Files:** Modify `OpmPortContracts.ts`, `OpmLinkRules.ts`; test `opmLinkRules.test.ts`, `opmPortsLinks.test.tsx`, and a new focused section in `OpmModelLifecycle.test.ts`.

- [ ] Add failing tests for missing handles, handle on the wrong node, input used as source, output used as target, incompatible scalar types, duplicate same-port links, multiplicity overflow, and conceptual-only/executable incompatibility.
- [ ] Run the focused tests and confirm failures.
- [ ] Implement resolved `sourcePort` and `targetPort` lookup, ownership/direction checks, semantic role checks, type compatibility, and multiplicity checks in `validateOpmPortConnection`.
- [ ] Ensure both preview and `onConnect` consume the same verdict without adding rejected edges.
- [ ] Make the requirement structural-link policy explicit: allow only the profile-approved requirement relationships and reject unsupported requirement aggregation/generalization with a stable code.
- [ ] Add tests proving composition is valid only in the configured whole-to-part direction and is not interchangeable with aggregation or behavioral links.
- [ ] Run `npm test` equivalent focused Vitest commands and confirm pass.
- [ ] Commit with `feat(opm): enforce resolved port and link contracts`.

### Task 3: Make BDD, IBD, and Requirements projections lifecycle-aware

**Files:** Modify `OpmViewDeriver.ts`, `SmartShowPanel.tsx`, `SysmlToOpmImporter.ts`; test `opmViewDeriver.test.ts`, `sysmlToOpmImporter.test.ts`.

- [ ] Add failing tests proving BDD reports structural cycles/orphan edges, IBD reports unresolved endpoint/port mappings, and Requirements distinguishes uncovered, covered, verified, failed, and stale.
- [ ] Add an importer mapping field with values `mapped`, `conceptual-only`, `unsupported`, or `unresolved`; preserve warning diagnostics and source connector IDs.
- [ ] Update structure derivation to return diagnostics instead of silently dropping malformed nodes.
- [ ] Update internal derivation to use validated endpoints and expose connector mapping state.
- [ ] Add requirement trace derivation based on explicit status/evidence fields, while retaining live `satisfies`/`verifies` coverage.
- [ ] Render lifecycle diagnostics and requirement status in Smart Show with element navigation.
- [ ] Run the focused view/import tests.
- [ ] Commit with `feat(opm): make BDD IBD and requirements projections auditable`.

### Task 3A: Implement professional requirements and verification lifecycle

**Files:** Create `src/components/entropy/OpmRequirementsModel.ts`; modify `OpmTraceabilityModel.ts`, `OpmViewDeriver.ts`, `SmartShowPanel.tsx`; test `OpmRequirementsModel.test.ts`.

- [ ] Test requirement identity, text, hierarchy, derive/containment rules, satisfy/verify/refine/trace direction, verification methods, evidence, baselines, status transitions, and duplicate IDs.
- [ ] Implement status transitions: `draft → approved → implemented → verified`, with `stale`, `failed`, and `retired` branches. Do not allow `verified` without a valid verification case and evidence.
- [ ] Implement requirement decomposition and derived-requirement integrity, including cycle prevention and parent deletion impact.
- [ ] Preserve source requirement metadata during SysML import and OPL round trips.
- [ ] Render requirement metadata, verification status, missing evidence, owners, risk, and change impact.
- [ ] Commit with `feat(opm): add requirements and verification lifecycle`.

### Task 3B: Build the canonical traceability matrix

**Files:** Create `src/components/entropy/OpmTraceabilityMatrix.ts`, `src/components/entropy/OpmTraceabilityMatrixView.tsx`; modify `OpmTraceabilityModel.ts`, `SmartShowPanel.tsx`; test `OpmTraceabilityMatrix.test.ts` and `traceabilityMatrixView.test.tsx`.

- [ ] Write failing tests for many-to-many links, matrix completeness, orphan/uncovered/suspect/stale rows, baseline filtering, bidirectional navigation, deterministic export, and model mutation impact.
- [ ] Implement `buildOpmTraceabilityMatrix(snapshot, config): OpmTraceabilityMatrix` from canonical nodes, edges, simulation scenarios, verification cases, artifacts, and evidence.
- [ ] Implement cell status rules: `covered`, `verified`, `failed`, `uncovered`, `stale`, `suspect`, `orphan`, and `unsupported`.
- [ ] Include stable source/target IDs, relationship type, baseline, version, owner, evidence IDs, and diagnostics in every row/cell.
- [ ] Implement filters, sorting, subsystem grouping, risk grouping, and navigation to both endpoints.
- [ ] Ensure the matrix is regenerated after every model revision and cannot become a manually divergent second model.
- [ ] Commit with `feat(opm): add canonical mbse traceability matrix`.

### Task 4: Add unified deletion impact and cascade service

**Files:** Create `OpmDeletionImpact.ts`; test `OpmDeletionImpact.test.ts`.

- [ ] Write failing tests for deleting an Object, Process, State, Requirement, Port, Link, and nested descendants.
- [ ] Write explicit composition tests: deleting a whole deletes its composed part recursively; deleting a shared-aggregation/association peer does not delete the connected element; deleting a part removes its ownership edge without deleting the whole.
- [ ] Test that all deletion routes produce the same resulting snapshot, including direct and transitive descendants, embedded `data.states`, incident edges, requirement coverage, and mapping records.
- [ ] Implement `analyzeOpmDeletion(snapshot, selection)` returning closure IDs, affected links, affected requirements, affected simulation IDs, and evidence invalidation reasons.
- [ ] Compute the deletion closure by traversing only outgoing `composition` ownership edges. Do not traverse aggregation, association, dependency, flow, satisfies, verifies, result, effect, trigger, or condition links as ownership edges.
- [ ] Implement `applyOpmDeletion(snapshot, impact)` as a pure immutable operation.
- [ ] Purge all removed IDs from embedded state lists and reject any remaining references.
- [ ] Return stable diagnostics and an impact summary suitable for confirmation UI and audit logs.
- [ ] Run the focused deletion tests.
- [ ] Commit with `feat(opm): centralize deletion impact and cascade rules`.

### Task 4A: Add composition-aware lifecycle and change impact

**Files:** Modify `OpmDeletionImpact.ts`, `OpmModelLifecycle.ts`, `OpmTraceabilityModel.ts`; test `OpmDeletionImpact.test.ts` and `OpmTraceabilityMatrix.test.ts`.

- [ ] Test deletion of a composed whole, composed part, shared aggregate, association endpoint, requirement, verification case, connector, and port.
- [ ] Traverse deletion ownership only through explicit `composition` links; never cascade through shared aggregation, association, dependency, flow, satisfies, verifies, result, effect, trigger, or condition links.
- [ ] Calculate affected BDD definitions/usages, IBD parts/ports/connectors, requirements, tests, evidence, simulation scenarios, generated artifacts, and traceability cells.
- [ ] Require confirmation for high-impact deletion and block deletion when the selected profile requires controlled change management or baseline protection.
- [ ] Commit with `feat(opm): add composition and mbse change impact semantics`.

### Task 5: Route every editor mutation through lifecycle services

**Files:** Modify `EntropyWorkspace.tsx`; test `opmShortcuts.test.tsx`, `opmRightPanelContent.test.tsx`, `opmReleaseFlow.test.tsx`.

- [ ] Add failing integration tests for panel delete, React Flow delete, keyboard delete, state delete, port delete, link delete, OPL apply, SysML import, and conversion.
- [ ] Replace separate deletion implementations with one `commitModelMutation` path that saves history once, validates the result, updates nodes/edges, clears invalid selections, and reports impact.
- [ ] Apply the same path to node/edge conversions and refuse invalid candidate conversions without partial mutation.
- [ ] Ensure requirements are root-scoped unless the selected profile explicitly allows containment; warn/block consistently.
- [ ] Ensure OPL apply and SysML import validate before replacing the current graph.
- [ ] Run the integration tests and verify identical behavior for all deletion routes.
- [ ] Commit with `refactor(opm): route editor mutations through lifecycle transaction`.

### Task 6: Invalidate runtime, traces, artifacts, and evidence atomically

**Files:** Modify `EntropyWorkspace.tsx`, `OpmCodeGenerationWorkspace.tsx`, `OpmTraceabilityModel.ts`; test simulation, codegen, and release-flow suites.

- [ ] Add failing tests showing deletion/editing of a referenced element clears active state, queued events, traversed link IDs, firing IDs, trace entries, and requirement evidence.
- [ ] Add a model revision/fingerprint update at the shared mutation boundary.
- [ ] Reset or reconcile `simStateRef` against surviving IDs; prefer invalidation and explicit reinitialize before the next run.
- [ ] Reset code-generation lifecycle to `draft` for every model revision and block download/HIL export until re-verification.
- [ ] Mark affected requirement rows `stale` when evidence or target elements change.
- [ ] Keep undo/redo snapshots atomic for graph plus revision/evidence invalidation state.
- [ ] Run OPM simulation and lifecycle tests.
- [ ] Commit with `feat(opm): invalidate runtime and verification evidence on model changes`.

### Task 7: Add deletion impact UX and diagnostics navigation

**Files:** Modify `OpmRightPanelContent.tsx`, `SmartShowPanel.tsx`, `OpmLiveTraceOverlay.tsx`, `EntropyWorkspace.tsx`; test relevant UI suites.

- [ ] Add tests for high-impact deletion preview, cancel, delete, undo, and navigation from each diagnostic to its node, edge, port, or requirement.
- [ ] Show impact counts for children, links, requirements, runtime references, and generated evidence before deleting high-impact elements.
- [ ] Display stable lifecycle diagnostics with severity and source element.
- [ ] Keep cancellation side-effect free; confirm the action commits exactly one undoable mutation.
- [ ] Run UI tests and a browser smoke test covering BDD, IBD, Requirements, link creation, simulation, deletion, undo, and codegen gating.
- [ ] Commit with `feat(opm): add lifecycle impact review and diagnostics UX`.

### Task 8: Release verification and documentation closure

**Files:** Modify OPM tests and `docs/OPM_SYSML_SIMULATION_TRACEABILITY_DELETION_REVIEW.md`; optionally add `docs/OPM_LIFECYCLE_CONFORMANCE_MATRIX.md`.

- [ ] Add one end-to-end fixture that creates/imports a model, derives all three views, simulates it, saves/reloads it, deletes every component kind, undoes each mutation, and checks integrity after every step.
- [ ] Run `npm run test:opm`.
- [ ] Run `npm run test:opm:qualification`.
- [ ] Run `npx tsc --noEmit`.
- [ ] Run the browser smoke flow and record any environment limitations explicitly.
- [ ] Update the review report with resolved items, remaining risks, test commands, and evidence.
- [ ] Commit with `test(opm): close BDD IBD requirements lifecycle release gate`.

### Task 9: Full MBSE conformance matrix and end-to-end qualification

**Files:** Create `src/components/entropy/__tests__/opmMbseEndToEnd.test.ts`, `docs/OPM_SYSML_MBSE_CONFORMANCE_MATRIX.md`; modify test scripts and lifecycle review documentation.

- [ ] Create a fixture containing block definitions, inheritance, value types/units, composed parts, shared references, ports, connectors, item flows, bindings, requirements, derived requirements, satisfy/verify/refine/trace links, simulation scenarios, verification cases, artifacts, and baselines.
- [ ] Assert that BDD, IBD, Requirements, and Traceability Matrix projections all resolve to the same stable IDs and qualified names.
- [ ] Exercise create, rename, move, type conversion, connect, disconnect, simulate, verify, save, reload, import, export, delete, composition cascade, non-composition preservation, undo, redo, and baseline comparison.
- [ ] Assert that every invalid mutation is rejected before commit and every valid mutation updates all affected projections and evidence.
- [ ] Assert that model edits invalidate simulation traces, verification evidence, generated artifacts, and matrix cells according to impact rules.
- [ ] Run `npm run test:opm`, `npm run test:opm:qualification`, `npx tsc --noEmit`, and the browser smoke flow.
- [ ] Record the supported SysML profile, implemented constructs, unsupported constructs, diagnostics, and evidence in the conformance matrix.
- [ ] Commit with `test(opm): qualify full mbse diagram and traceability lifecycle`.

## Acceptance criteria

- Every BDD, IBD, and Requirements element has one canonical identity and valid ownership/containment.
- Composition is explicitly distinguishable from shared aggregation and ordinary relationships; only composed parts are recursively deleted with their whole.
- No orphan edge, orphan state, structural cycle, conflicting parent field, or unresolved required mapping can pass the lifecycle gate.
- All deletion entry points produce identical cascades and one undoable transaction.
- Deletion cannot leave stale runtime, trace, requirement, generated-artifact, or verification references.
- Invalid links and conversions are rejected before mutation with actionable diagnostics.
- Requirements show explicit coverage/evidence status, not only link presence.
- Save/reload and OPL round trips preserve lifecycle integrity.
- `npm run test:opm`, `npm run test:opm:qualification`, and `npx tsc --noEmit` pass.

## Self-review coverage

- Canonical containment and BDD integrity: Task 1.
- IBD port/connector contracts: Task 2 and Task 3.
- Requirements coverage and traceability: Task 3 and Task 6.
- Full BDD block semantics: Tasks 1A and 1B.
- Full IBD parts/ports/connectors/flows: Tasks 1A and 1C.
- Professional requirements and verification lifecycle: Task 3A.
- Canonical traceability matrix: Task 3B.
- Composition-only recursive deletion and change impact: Task 4A.
- Unified deletion and child/edge cascade: Task 4 and Task 5.
- Composition-specific ownership and deletion semantics: Tasks 1, 2, and 4.
- Simulation/runtime invalidation: Task 6.
- Code-generation/verification invalidation: Task 6.
- UX, diagnostics, undo/redo, and browser verification: Tasks 5, 7, and 8.
- Protected State Machine/X-Bridges boundaries: Global Constraints and Task 8 release verification.

## Professional MBSE definition of done

The work is complete only when the selected SysML profile is documented and every supported BDD, IBD, Requirements, and traceability construct has:

1. A canonical data contract and stable identity.
2. Creation/import behavior.
3. Editing/conversion behavior.
4. Validation and stable diagnostics.
5. Projection into the correct diagram/view.
6. Bidirectional navigation and change impact.
7. Simulation/verification behavior where applicable.
8. Persistence and deterministic round trip.
9. Deletion/cascade semantics appropriate to ownership type.
10. Undo/redo behavior.
11. Traceability-matrix representation.
12. Automated tests and release evidence.

No feature may be labeled “supported” based only on rendering. It must pass the complete lifecycle and conformance matrix.
