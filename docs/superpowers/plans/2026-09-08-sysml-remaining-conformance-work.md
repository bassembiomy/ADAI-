# SysML BDD, IBD, Requirements, and RTM Remaining-Conformance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close every remaining lifecycle and qualification gap in ADIA's declared `OMG-SysML-1.6-ADIA` profile so BDD, IBD, Requirements, and RTM use one consistent semantic model and every claimed capability is proven through create/edit/render/save/load/delete/trace/report workflows.

**Architecture:** Keep `SysmlRepository` as the only semantic source of truth. Replace legacy-array-first mutations with commands against that repository, then derive temporary diagram view models for React. Add focused domain services for richer BDD, IBD, requirement-governance, and RTM workflows; qualify each service at engine, adapter, component, real-browser, persistence, and release levels.

**Tech Stack:** TypeScript 5, React 18, Vitest, Playwright (to add), existing SVG/reporting engine, existing canonical SysML engine.

## Global Constraints

- Normative target is OMG SysML 1.6, document `formal/19-11-01`, with the normative SysML XMI profile as the machine-readable reference.
- This plan does not claim full SysML-language conformance or SysML v2 equivalence; it qualifies the declared BDD/IBD/Requirements/RTM profile only.
- Every semantic element has one stable ID and one canonical owner; diagrams contain presentations/references, not duplicated semantic elements.
- Block definitions survive deletion of usages; deleting a BlockDefinition leaves non-owned usages unresolved and never deletes other BlockDefinitions.
- Recursive deletion follows composite ownership of usages only. Association, shared aggregation, dependency, allocation, generalization, connector, flow, and requirement relationships never cascade-delete peers.
- Every command performs validation, impact analysis, confirmation where material, atomic application, audit recording, evidence invalidation, and undo/redo support.
- A conformance row can become `supported` only when engine, UI, persistence, report, browser, and release-gate evidence all pass.
- Invalid or unresolved semantics fail closed for simulation, verification, report, export, and code generation.

## Verified baseline before this plan

- Canonical model, validators, deletion transactions, BDD/IBD/requirement/RTM engines, persistence, OPM loss diagnostics, RTM component, report/simulation gates, creation rules, and deletion impact confirmation already exist.
- Structured BDD property editing and complete property notation were added in commit `23d65b8`.
- `npm run test:sysml:release` currently proves 130 SysML tests, 73 reporting tests, and TypeScript compilation.
- The remaining work below is derived from `docs/SYSML_PROFILE_CONFORMANCE_MATRIX.md`; it must not be marked complete merely because the existing focused tests pass.

---

### Task 1: Make the canonical repository the only mutation and persistence authority

**Files:**
- Create: `src/services/sysmlCommandGateway.ts`
- Create: `src/services/sysmlCommandGateway.test.ts`
- Modify: `src/services/sysmlTransactionAdapter.ts`
- Modify: `src/App.tsx` (`updateBlock`, `updateRelationship`, `updatePart`, `updateConnector`, create/delete handlers, project save/load)
- Modify: `src/utils/adiaProjectPersistence.ts`
- Test: `src/services/reportModelConsistency.test.ts`

**Interfaces:**
- Consumes: `SysmlRepository`, `applyCommand`, `validateSysmlRepository`, existing legacy projection adapter.
- Produces: `executeSysmlCommand(state, command): SysmlCommandResult`, `projectLegacyDiagram(repo): LegacySysmlView`, and a project payload containing only canonical semantic data plus diagram presentation data.

- [ ] **Step 1: Write failing authority tests.** Assert that create/update/delete changes the canonical repository first, derives legacy arrays afterward, increments one revision, creates one audit record, supports undo/redo, and survives save/load without semantic drift. Include a test proving direct legacy-array mutation cannot enter a saved project.
- [ ] **Step 2: Run the focused tests.** Run `npx vitest run src/services/sysmlCommandGateway.test.ts src/services/reportModelConsistency.test.ts`; expect failures showing the gateway and canonical-only payload are missing.
- [ ] **Step 3: Implement the command contract.** Define:

```ts
export type SysmlEditorCommand =
  | { type: 'createElement'; element: SysmlElement }
  | { type: 'updateElement'; elementId: string; patch: Record<string, unknown> }
  | { type: 'deleteElements'; elementIds: string[]; confirmedImpactHash?: string }
  | { type: 'undo' }
  | { type: 'redo' };

export interface SysmlCommandResult {
  repository: SysmlRepository;
  view: LegacySysmlView;
  diagnostics: SysmlDiagnostic[];
  impact?: DeletionImpact;
  committed: boolean;
}
```

- [ ] **Step 4: Route every BDD/IBD/requirement/relationship mutation through `executeSysmlCommand`.** Remove semantic writes to `blocks`, `parts`, `relationships`, and `connectors`; retain them only as derived presentation state until React is decomposed.
- [ ] **Step 5: Make persistence canonical-only.** Save `sysmlRepository` plus coordinates/view preferences; on load, migrate legacy payloads once, validate them, and derive all editor arrays. Reject checksum/profile/schema failures without replacing the active model.
- [ ] **Step 6: Verify and commit.** Run the focused tests and `npm run test:sysml`; require zero failures. Commit `refactor(sysml): make canonical repository authoritative`.

### Task 2: Finish BDD feature, inheritance, port, and association-end workflows

**Files:**
- Modify: `src/engine/sysml/bdd.ts`
- Modify: `src/engine/sysml/bdd.test.ts`
- Create: `src/components/sysml/BlockFeatureEditor.tsx`
- Create: `src/components/sysml/BlockFeatureEditor.test.tsx`
- Create: `src/components/sysml/RelationshipEndEditor.tsx`
- Test: `src/components/sysml/RelationshipEndEditor.test.tsx`
- Modify: `src/App.tsx` BDD inspector and SVG projection
- Modify: `src/features/reporting/reportDiagrams.ts`

**Interfaces:**
- Consumes: `resolveInheritedFeatures`, `validateLegacyBlockProperties`, canonical definitions/ports/relationships.
- Produces: `validateAssociationEnds(repo, relationshipId)`, inherited-feature projections with origin IDs, and complete editable/rendered BDD notation.

- [ ] **Step 1: Add failing BDD tests.** Cover inherited properties/ports/operations/constraints, override conflicts, abstract and leaf rules, value type unit/dimension selection, full/proxy ports, conjugation, association-end role names, navigability, multiplicities, aggregation kind, and dependency/allocation stereotypes.
- [ ] **Step 2: Run RED.** Run `npx vitest run src/engine/sysml/bdd.test.ts src/components/sysml/BlockFeatureEditor.test.tsx src/components/sysml/RelationshipEndEditor.test.tsx`; expect failures for missing end/editor behavior.
- [ ] **Step 3: Implement association-end validation.** Require valid multiplicities, unique role names per classifier, legal navigability flags, and composition ownership at the diamond end. Return property-path diagnostics such as `relationships.<id>.targetMultiplicity`.
- [ ] **Step 4: Complete the BDD inspector.** Use typed selectors for ValueType/Block/Interface, explicit `value | part | reference | flow`, full/proxy port terminology, inherited-feature origin labels, read-only inherited rows, and explicit redefine/subset actions.
- [ ] **Step 5: Complete BDD rendering and reporting.** Render property modifiers, association end names/multiplicities/navigability, inherited compartments, abstract names, leaf markers, port kind/direction/conjugation, and allocation/dependency stereotypes from the same projection.
- [ ] **Step 6: Verify and commit.** Run BDD, component, report, and `npm run test:sysml` gates. Commit `feat(sysml): qualify complete bdd editing workflow`.

### Task 3: Finish canonical IBD ownership, boundary, binding, and item-flow workflows

**Files:**
- Modify: `src/engine/sysml/ibd.ts`
- Modify: `src/engine/sysml/ibd.test.ts`
- Create: `src/components/sysml/IbdConnectorEditor.tsx`
- Create: `src/components/sysml/IbdConnectorEditor.test.tsx`
- Modify: `src/App.tsx` IBD create/edit/navigation handlers
- Modify: `src/features/reporting/reportDiagrams.ts`
- Test: `src/features/reporting/reportDiagrams.ibd.test.ts`

**Interfaces:**
- Consumes: canonical PartUsage/PortUsage/ConnectorUsage, `validateConnector`, `resolvePortUsage`.
- Produces: `deriveIbdBreadcrumb(repo, contextId)`, `validateBindingConnector`, and item-flow labels including type, item-property, multiplicity, unit, and direction.

- [ ] **Step 1: Add failing IBD tests.** Cover nested typed parts, inherited ports, full/proxy ports, conjugated direction, assembly/delegation rules, context-boundary ports, connector end ownership, binding only between compatible value/constraint parameters, item-flow type/unit/dimension compatibility, and definition deletion producing unresolved—not deleted—usages.
- [ ] **Step 2: Run RED.** Run `npx vitest run src/engine/sysml/ibd.test.ts src/components/sysml/IbdConnectorEditor.test.tsx src/features/reporting/reportDiagrams.ibd.test.ts`; expect missing binding/boundary/item-property behavior.
- [ ] **Step 3: Implement endpoint semantics.** Represent connector ends as `{ usageId, portId?, parameterId? }`; reject cross-context connectors unless one end is a context boundary port and kind is delegation; require compatible directions after conjugation.
- [ ] **Step 4: Implement binding and flow detail.** Binding connectors accept value properties or constraint parameters with compatible value types/dimensions. Item flows select a conveyed classifier and optional item property with multiplicity; validate direction and units.
- [ ] **Step 5: Complete IBD UI/navigation.** Add context breadcrumb, definition↔usage navigation, nested-part drilldown, boundary-port creation, typed endpoint pickers, and non-color diagnostics. Persist every action through Task 1's gateway.
- [ ] **Step 6: Complete render/report parity.** Both canvas and report must show context frame, part `name: Type [multiplicity]`, port kind/direction/conjugation, connector kind, and item-flow arrow/label.
- [ ] **Step 7: Verify and commit.** Run focused tests and `npm run test:sysml`. Commit `feat(sysml): qualify complete ibd connector workflow`.

### Task 4: Complete requirement baselines, suspect links, copy synchronization, and evidence history

**Files:**
- Modify: `src/engine/sysml/requirements.ts`
- Modify: `src/engine/sysml/requirements.test.ts`
- Modify: `src/engine/sysml/evidence.ts`
- Create: `src/components/sysml/RequirementGovernancePanel.tsx`
- Create: `src/components/sysml/RequirementGovernancePanel.test.tsx`
- Modify: `src/App.tsx` requirement inspector

**Interfaces:**
- Produces: `createRequirementBaseline`, `reviewSuspectLink`, `synchronizeRequirementCopy`, `listEvidenceHistory`, and guarded lifecycle transitions.

- [ ] **Step 1: Write failing governance tests.** Prove immutable baseline creation, semantic baseline diff, suspect propagation from changed supplier/source, explicit accept/reject/revalidate review, copy text synchronization with local metadata preservation, copy-cycle rejection, evidence history retention, and `verified` rejection without current passed evidence.
- [ ] **Step 2: Run RED.** Run `npx vitest run src/engine/sysml/requirements.test.ts src/components/sysml/RequirementGovernancePanel.test.tsx`; expect missing workflow operations.
- [ ] **Step 3: Implement governed operations.** Each operation returns a repository transaction and audit record; copy synchronization updates text/source version only, marks downstream links suspect, and invalidates affected evidence.
- [ ] **Step 4: Build governance UI.** Add baseline create/compare/protect controls, suspect queue with rationale and decision, copy synchronization preview, generic trace rationale, and evidence timeline with verification case, method, result, timestamp, artifact, and model revision.
- [ ] **Step 5: Qualify relationship direction and notation.** Exercise `deriveReqt`, `satisfy`, `verify`, `refine`, `trace`, and `copy` from both toolbar and property editor; canvas/report must use the same stereotype and source/target semantics.
- [ ] **Step 6: Verify and commit.** Run focused tests and `npm run test:sysml`. Commit `feat(sysml): complete requirement governance workflows`.

### Task 5: Finish RTM change-set controls, scalable rendering, and navigation

**Files:**
- Modify: `src/engine/sysml/rtm.ts`
- Modify: `src/engine/sysml/rtm.test.ts`
- Modify: `src/components/sysml/TraceabilityMatrix.tsx`
- Modify: `src/components/sysml/TraceabilityMatrix.test.tsx`
- Create: `src/components/sysml/VirtualizedTraceabilityGrid.tsx`
- Test: `src/components/sysml/VirtualizedTraceabilityGrid.test.tsx`

**Interfaces:**
- Produces: `buildRtmChangeSet(repo, fromBaselineId, toRevision)`, windowed row/column rendering, and stable source/target navigation events.

- [ ] **Step 1: Add failing RTM tests.** Generate at least 10,000 requirements and 10,000 traced elements; assert deterministic rows/cells, baseline diff, changed-only filter, all nine statuses, keyboard navigation, accessible status text, CSV parity, and bounded rendered DOM rows.
- [ ] **Step 2: Run RED.** Run `npx vitest run src/engine/sysml/rtm.test.ts src/components/sysml/TraceabilityMatrix.test.tsx src/components/sysml/VirtualizedTraceabilityGrid.test.tsx`; expect missing change-set/windowing behavior.
- [ ] **Step 3: Implement baseline/change-set projection.** Compare semantic hashes, classify added/changed/deleted/unresolved targets, and expose old/new revision and evidence freshness without mutating repository state.
- [ ] **Step 4: Implement two-axis virtualization.** Keep headers sticky, render overscan windows, preserve stable row/cell IDs, and expose screen-reader status summaries independent of color.
- [ ] **Step 5: Complete navigation/export parity.** Double-click/Enter opens the exact requirement or supplier in its owning diagram; filters and sort order must produce byte-equivalent CSV and visible rows.
- [ ] **Step 6: Verify and commit.** Run focused tests with a performance assertion below 2 seconds in CI and `npm run test:sysml`. Commit `feat(sysml): qualify scalable baseline-aware rtm`.

### Task 6: Add real-browser end-to-end qualification

**Files:**
- Modify: `package.json`
- Create: `playwright.config.ts`
- Create: `tests/e2e/sysml-bdd-ibd-requirements-rtm.spec.ts`
- Create: `tests/e2e/sysml-deletion-lifecycle.spec.ts`
- Create: `tests/e2e/sysml-persistence-report.spec.ts`

**Interfaces:**
- Produces: `npm run test:sysml:e2e` and trace/screenshot artifacts on failure.

- [ ] **Step 1: Add Playwright and the failing smoke flow.** Create a model through visible controls: ValueType, whole Block, two reusable part types, typed composite part usages, full/proxy ports, assembly/delegation/item-flow connectors, six requirement relation kinds, verification evidence, and RTM filters.
- [ ] **Step 2: Run RED.** Run `npm run test:sysml:e2e`; expect failures at the first unimplemented UI path, not selector timeouts caused by inaccessible controls.
- [ ] **Step 3: Add deletion lifecycle scenarios.** Delete the whole BlockDefinition and assert connected BlockDefinitions survive, owned composite usages are removed, unrelated usages become unresolved, impact confirmation names all effects, cancellation changes nothing, confirmation is one undoable revision, and RTM/report update atomically.
- [ ] **Step 4: Add persistence/report scenarios.** Save, reload, compare semantic repository hashes, create/protect/compare baselines, verify suspect/evidence status, export RTM CSV, and generate report diagrams with matching notation/counts.
- [ ] **Step 5: Stabilize accessibility selectors.** Use roles/names/test IDs tied to semantic IDs; do not use sleeps. Capture Playwright trace, screenshot, and console log on failure.
- [ ] **Step 6: Verify and commit.** Run `npm run test:sysml:e2e` twice from clean app starts. Commit `test(sysml): add browser conformance qualification`.

### Task 7: Add normative model fixtures and interchange diagnostics

**Files:**
- Create: `src/engine/sysml/fixtures/representative-profile.json`
- Create: `src/engine/sysml/profileFixture.test.ts`
- Modify: `src/engine/sysml/opmAdapter.test.ts`
- Create: `docs/SYSML_INTERCHANGE_LIMITATIONS.md`

**Interfaces:**
- Produces: one version-controlled representative model containing every claimed construct and deterministic import/export diagnostics.

- [ ] **Step 1: Build the fixture test first.** Assert every `SYSML_PROFILE` capability except explicitly unsupported SysML v2 has at least one fixture element and one lifecycle assertion ID.
- [ ] **Step 2: Run RED.** Run `npx vitest run src/engine/sysml/profileFixture.test.ts`; expect missing fixture coverage.
- [ ] **Step 3: Add the fixture.** Include inheritance, association ends, composition/shared aggregation, nested parts, ports, all connector kinds, item flows, governed requirements, all six requirement relationships, verification cases/evidence, two baselines, and RTM states.
- [ ] **Step 4: Qualify loss diagnostics.** Round-trip canonical JSON exactly; for OPM projection require a diagnostic for every non-equivalent concept and prohibit importing a lossy projection over canonical data.
- [ ] **Step 5: Document interoperability boundaries.** State supported schema/profile versions, migration behavior, canonical JSON guarantees, OPM losses, and that generic UML/SysML XMI interchange is not claimed until a dedicated XMI adapter is implemented and qualified.
- [ ] **Step 6: Verify and commit.** Run fixture, persistence, and OPM adapter tests. Commit `test(sysml): add normative representative model fixture`.

### Task 8: Turn the conformance matrix into an executable release manifest

**Files:**
- Modify: `src/engine/sysml/profile.ts`
- Create: `src/engine/sysml/conformanceManifest.ts`
- Create: `src/engine/sysml/conformanceManifest.test.ts`
- Modify: `scripts/verify_sysml_release.ts`
- Modify: `docs/SYSML_PROFILE_CONFORMANCE_MATRIX.md`

**Interfaces:**
- Produces: `verifyConformanceManifest(results): ConformanceReport`; each capability lists required engine, UI, persistence, report, E2E, and interoperability evidence IDs.

- [ ] **Step 1: Write a failing completeness test.** Reject a capability marked `supported` if any evidence category is absent, stale, skipped, or failed; reject Markdown status that differs from the registry.
- [ ] **Step 2: Run RED.** Run `npx vitest run src/engine/sysml/conformanceManifest.test.ts`; expect missing manifest verifier.
- [ ] **Step 3: Implement executable evidence mapping.** Store test IDs and current result timestamps in generated release output, but keep source capability metadata deterministic and version-controlled.
- [ ] **Step 4: Generate the matrix.** Replace stale manual counts/limitations with generated status, exact test IDs, implementation paths, profile clause, and remaining limitation. Never promote SysML v2 or unqualified interchange.
- [ ] **Step 5: Verify and commit.** Run the manifest test and `npm run test:sysml:release`. Commit `chore(sysml): enforce evidence-backed conformance claims`.

### Task 9: Final release qualification and professional-tool acceptance

**Files:**
- Modify: `package.json`
- Modify: `scripts/verify_sysml_release.ts`
- Modify: `docs/SYSML_PROFILE_CONFORMANCE_MATRIX.md`
- Create: `docs/SYSML_RELEASE_REPORT.md`

**Interfaces:**
- Produces: one `npm run test:sysml:full-release` command and an evidence-backed release report.

- [ ] **Step 1: Define the aggregate gate.** Chain unit/component/reporting tests, TypeScript, production build, three real-browser suites, canonical fixture verification, OPM adapter tests, compiled-C OPM qualification, and conformance-manifest verification. Any skip or missing executable is a failure.
- [ ] **Step 2: Restore and pin the required compiler.** Provision `toolchains/w64devkit/w64devkit/bin/gcc.exe`, record its version and SHA-256 in the release report, and make the verifier reject a different or missing binary.
- [ ] **Step 3: Run all gates.** Run `npm run test:sysml:full-release`; expected result is zero failures, zero skipped mandatory tests, zero TypeScript errors, successful production build, and a generated evidence result for every non-unsupported capability.
- [ ] **Step 4: Perform the acceptance audit.** For each matrix row, inspect engine behavior, visible UI workflow, saved/reloaded semantics, deletion/lifecycle behavior, report notation, RTM effect, and automated evidence. Keep any row `partial` if even one category lacks proof.
- [ ] **Step 5: Produce the release report.** Record commit, profile ID/version, normative source, environment, test counts, durations, fixture hash, compiler hash, known limitations, and exact scope of the conformance claim.
- [ ] **Step 6: Commit.** Commit `test(sysml): complete profile release qualification`. Do not merge the PR without explicit user confirmation.

## Requirement-to-task coverage

| Required outcome | Tasks |
|---|---|
| One model shared by BDD, IBD, Requirements, RTM | 1 |
| Complete BDD editing/rendering/inheritance | 2 |
| Correct composition definition/usage lifecycle | 1, 3, 6 |
| Complete IBD parts/ports/connectors/flows | 3 |
| Governed requirement relationships and lifecycle | 4 |
| Canonical scalable baseline-aware RTM | 5 |
| Persistence, reports, simulation/export fail-closed consistency | 1, 6, 9 |
| Real user-flow qualification | 6 |
| Standards fixture/interoperability boundaries | 7 |
| Honest evidence-backed conformance status | 8, 9 |

## Final acceptance criteria

- All four views derive from the same repository revision and stable IDs.
- Creating, editing, connecting, moving, deleting, undoing, redoing, saving, loading, baselining, reporting, and tracing cannot create silent divergence.
- BDD definitions and IBD usages have correct distinct lifecycles; composition cascades only through owned usage containment.
- Every BDD/IBD notation and semantic rule in the declared profile is editable, validated, persisted, rendered, and reported consistently.
- Every governed requirement relationship has correct direction, change propagation, baseline handling, and evidence lifecycle.
- RTM is deterministic, many-to-many, baseline/change-aware, scalable, accessible, exportable, and bidirectionally navigable.
- The complete browser scenario and deletion scenario pass from a clean application state.
- No capability is labeled `supported` without all required evidence categories; unsupported SysML v2 and unimplemented XMI interoperability remain explicitly outside the claim.
- `npm run test:sysml:full-release` passes with no skipped mandatory checks.
