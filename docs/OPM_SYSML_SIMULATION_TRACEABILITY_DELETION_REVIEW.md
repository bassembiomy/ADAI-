# SysML / OPM, Simulation, Traceability, and Deletion Impact Review

**Review date:** 2026-09-08  
**Scope:** Entropy OPM editor and its SysML migration, OPM link rules, simulation runtime/UI, traceability views, and all element/link deletion paths.

## Executive conclusion

The implementation has a solid OPM foundation: a single model drives structure, behavior, requirements, and internal views; ISO 19450-style node/link rules exist; state and port deletion remove several dependent records; and OPM simulation is separated from the State Machine engine.

It is not yet deletion-safe or fully standard-conformant. The highest-risk issue is that deletion behavior depends on how deletion is initiated. Panel deletion, keyboard deletion, React Flow deletion, state deletion, and port deletion do not share one impact-analysis/cascade service. This can leave stale child references, stale executable/simulation state, stale selection, or inconsistent traceability after a model change.

## Standard baseline used

- ISO 19450 OPM concepts as represented by `OpmLinkRules.ts`: Objects, Processes, States, Requirements, and semantic links.
- Repository release requirements in `docs/superpowers/specs/2026-09-05-opm-standard-editor-engine-design.md` and `docs/superpowers/specs/2026-09-05-opm-standard-release-improvement-requirements.md`.
- SysML compatibility is treated as migration/interoperability, not as a second authored model: `OpmViewDeriver.ts` explicitly derives structure, internal, behavior, and requirements views from one OPM graph.

## What is already implemented

### Model and view consistency

- OPM nodes and edges are the canonical editable graph.
- Structure view derives aggregation/generalization relationships.
- Behavior view derives result/effect/consumption behavior around object states.
- Requirements view derives `satisfies`/`verifies` relationships.
- SysML-to-OPM import exists and reports warnings where no automatic OPM equivalent exists.
- OPL text can be regenerated from the graph and applied back after parsing.

### Link rules and connection handling

- Link-role rules exist for agent, instrument, consumption, result, effect, trigger, condition, aggregation, generalization, exhibition, satisfies, and verifies.
- Self-links and duplicate links are rejected.
- Source/target node existence is checked.
- Preview and final connection paths call the shared `validateOpmPortConnection` entry point.
- Edge deletion removes the selected edge and node deletion removes edges incident to deleted node IDs in the React Flow path.

### Simulation

- OPM has an independent simulation configuration (`tickMs`, `maxTicks`, `maxEventsPerTick`, deterministic ordering).
- Runtime state is held separately from React rendering through `simStateRef` and is reset/initialized through dedicated helpers.
- Simulation produces active-state, firing-process, traversed-link, trace, and diagnostic UI data.
- The OPM release requirements define a canonical tick order and fail-closed code-generation lifecycle.

### Existing deletion behavior

- Deleting a state removes the state node, removes it from the parent object's `data.states`, and removes incident edges.
- Removing a port removes its incident edges.
- Panel deletion removes the selected node and direct child nodes.
- React Flow node deletion removes directly deleted nodes, direct child nodes, and incident edges.
- Keyboard deletion cascades selected parent nodes to direct child states and removes edges touching the computed node set.
- Undo history is saved before the principal deletion paths.

## Gaps and required changes

### P0 — unify deletion semantics

**Evidence:** `EntropyWorkspace.tsx:1106-1113`, `EntropyWorkspace.tsx:2380-2393`, and keyboard deletion around `EntropyWorkspace.tsx:1595-1614` implement separate deletion logic.

Panel deletion removes direct children from `nodes`, but its edge filter only checks the selected node ID. Edges attached to child states can therefore remain dangling. The React Flow callback separately performs a direct-child cascade. This violates the single-model/integrity expectation.

**Required change:** create one pure `analyzeOpmDeletion` / `applyOpmDeletion` service and route panel, keyboard, React Flow, state, and port deletion through it. It must:

1. Resolve the complete descendant closure, not only one level.
2. Remove every edge whose source or target is removed.
3. Remove embedded state records from every owning object.
4. Remove or invalidate executable node/link records and simulation references.
5. Clear selected node/edge and close/focus affected inspectors.
6. Return an impact summary and stable diagnostics for the UI/audit log.
7. Save one coherent undo snapshot for the whole operation.

### P0 — prevent stale runtime state after deletion

The simulation state is ref-based and initialized from the model, but deletion handlers do not visibly reconcile `objectActiveState`, `pendingEvents`, trace link IDs, firing process IDs, or generated execution artifacts. A deleted state or process can remain referenced by runtime data until reset or reinitialization.

**Required change:** after every structural mutation, invalidate the current simulation snapshot or reconcile it against surviving node/edge IDs. Prefer invalidation plus explicit reinitialize on next run. Clear live trace data and mark generated/verified artifacts stale because the model fingerprint changed.

### P0 — complete port-aware validation

**Evidence:** `OpmPortContracts.ts` checks node existence, self-links, duplicates, and node-level link roles, but returns no resolved ports and does not validate actual source/target handles, ownership, direction, semantic role, data type, or multiplicity.

**Required change:** validate omitted handles according to the documented default policy, and when handles are present verify:

- handle exists on the declared node;
- source handle is an output and target handle is an input;
- handle owner matches endpoint node;
- scalar/data type is compatible;
- semantic port role is compatible with link type;
- multiplicity and duplicate constraints are respected;
- conceptual-only versus executable compatibility is reported.

Return the resolved source/target port records and stable diagnostic codes.

### P0 — validate link conversion before mutation

**Evidence:** `handleConvertEdgeType` calls `convertOpmEdgeType` and applies the result; the shown production path does not revalidate the converted edge against node and port contracts before committing.

**Required change:** build the candidate edge, validate it through the same connection contract, and refuse invalid conversion without changing the original edge. Preserve renderer `edge.type = 'opmEdge'`, semantic `edge.data.type`, endpoints, handles, labels, condition text, and compatible execution metadata.

### P1 — preserve traceability as first-class model data

The requirements view derives requirement coverage from current edges, which is correct for live display, but there is no deletion-impact traceability record in the OPM editor. Deleting a requirement, satisfying/verifying link, process, object, state, or port should identify affected requirements, simulation scenarios, generated artifacts, and reports.

**Required change:** assign stable element IDs and maintain a model-impact index with rows such as:

| Deleted/changed element | Required affected records |
|---|---|
| Requirement | satisfies/verifies links, coverage status, reports, release evidence |
| Object/process | all incident links, child states, executable schema, simulation state, generated artifacts |
| State | parent state list, state transitions, active-state/runtime references, traces |
| Port | incident links, endpoint contracts, executable I/O mapping, diagnostics |
| Link | behavior/structure/requirement view row, traversed-link trace, executable mapping |

After mutation, stale references must be impossible or explicitly reported as errors; silent omission is not sufficient for engineering traceability.

### P1 — enforce element-kind semantics consistently

The implementation allows `requirement` in the general object-like category for several structural rules. This may be intentional for the product’s editor model, but it should be explicitly documented and tested against the chosen ISO profile. Requirements should normally be traced through `satisfies`/`verifies`; structural aggregation/generalization/exhibition involving requirements should be rejected unless the product profile explicitly permits it.

### P1 — deletion UX and safety

Deletion currently logs a warning but has no visible impact preview or confirmation for high-impact deletions. Add an impact dialog for deleting a parent object/process, requirement, or a node with executable mappings. Show counts of child elements, links, affected requirements, simulation artifacts, and generated evidence. Offer cancel, delete, and undo.

### P1 — tests needed

Add regression tests for:

- panel, keyboard, canvas, and programmatic deletion producing identical node/edge/model results;
- nested descendant cascade at depth 2+;
- child-state edges removed when deleting the parent;
- embedded `data.states` synchronized after every deletion route;
- active state, queued event, traversed link, and diagnostics references purged or invalidated;
- port deletion removing only links using that port and preserving unrelated links;
- missing/reversed/wrong-owner/wrong-type handles rejected;
- invalid link conversion leaving the original edge byte-for-byte unchanged;
- requirement coverage and traceability rows updating after node/link deletion;
- model edits invalidating codegen qualification and downloadable artifacts;
- undo/redo restoring the complete pre-delete graph and runtime invalidation state.

## Recommended implementation order

1. Extract a pure deletion impact/cascade service and use it from all UI routes.
2. Add model-reference integrity validation and runtime/artifact invalidation after mutations.
3. Complete port contract validation and return resolved ports.
4. Gate link conversion through the complete validator.
5. Add traceability impact rows, diagnostics, and high-impact deletion preview.
6. Add the regression matrix and run `npm run test:opm`, `npm run test:opm:qualification`, and `tsc --noEmit`.

## Final status

**Current maturity:** strong prototype / partial standard release.

**Already made:** canonical OPM graph, derived SysML-like views, core ISO-style link rules, independent simulation configuration/runtime, basic deletion cascades, undo history, and live execution tracing.

**Must change before claiming standard-compliant deletion and traceability:** unified cascade behavior, complete port validation, runtime/artifact invalidation, conversion revalidation, deletion impact reporting, and regression coverage across every deletion route.

## BDD / IBD / Requirements lifecycle audit

The three views are correctly intended to be projections of one OPM model, but the full component lifecycle is only partially enforced.

### Lifecycle that should be guaranteed

```text
create/import → classify → place/contain → connect → validate
    → derive BDD/IBD/requirements views → simulate/verify
    → save/export → edit/convert → revalidate
    → delete/cascade → invalidate runtime/evidence → undo/restore
```

### Current assessment

| Lifecycle stage | Status | Assessment |
|---|---|---|
| Create object/process/requirement/state | Implemented | Canvas creation creates typed nodes and default ports; states receive a parent object. |
| Import SysML BDD/IBD/requirements | Implemented with limits | Blocks and requirements are imported; mapped requirement links are retained; unmapped IBD connectors produce warnings. |
| BDD structural lifecycle | Partial | Aggregation/generalization are derived, but structure derivation only roots object nodes and does not provide a general integrity check for missing endpoints, cycles, or invalid requirement containment. |
| IBD internal lifecycle | Partial | Internal view derives process links, but there is no complete ownership/port/connector lifecycle validation and no explicit orphan-port/orphan-connector diagnostic. |
| Requirements lifecycle | Partial | Requirement nodes and satisfies/verifies links are supported; coverage is live-derived, but requirement identity, verification status, baseline, and deletion impact are not persisted as an auditable lifecycle record. |
| Convert type | Partial | Conversion helpers exist and preserve common data, but production conversion must revalidate all affected BDD/IBD/requirement links before commit. |
| Simulate/verify | Implemented for OPM runtime | Independent OPM simulation and diagnostics exist; structural edits are not consistently reconciled with runtime references. |
| Save/reload/OPL round trip | Implemented with risk | OPL and project save paths exist, but round-trip integrity should reject orphan edges and conflicting `parentId` versus `data.parentId`. |
| Delete/cascade | Not yet correct | Deletion routes differ and can leave stale child links, embedded state records, runtime references, or evidence. |
| Undo/redo | Partial | Graph snapshots are saved, but runtime state, artifact lifecycle, and traceability impact state are not part of the same transaction. |

### Specific lifecycle findings

1. **BDD containment is not authoritative enough.** Nodes carry both React Flow `parentId` and `data.parentId` in different code paths. A lifecycle validator must choose one canonical containment field, synchronize the other, and report conflicts.
2. **BDD structure can become invalid silently.** `deriveStructureView` filters roots and follows structural edges, but does not report missing endpoints or cycles. A malformed structure can therefore disappear from the view instead of becoming a blocking diagnostic.
3. **IBD connectors are not fully represented as first-class lifecycle objects.** SysML connectors that have no direct OPM equivalent are warned during import, but the user needs an explicit mapping state: mapped, conceptual-only, unsupported, or unresolved.
4. **Requirements can be created under the active container.** The creation path assigns `activeParentId` to all created node kinds. The selected SysML/OPM profile should explicitly decide whether requirements may be contained in a block/BDD context; otherwise requirements must be root-scoped and the editor must reject or warn on containment.
5. **Requirement coverage is not versioned.** The live requirements view correctly reports “nothing satisfies this requirement yet,” but it does not preserve baseline, verification result, verification method, evidence, or change history when a requirement or target changes.
6. **Cross-view synchronization is derived but not guarded.** BDD, IBD, and requirement views update from `nodes`/`edges`, which is good, but there is no shared integrity gate before rendering, simulation, export, or code generation.
7. **Deletion is the lifecycle break point.** A parent deletion should remove all child parts/states, structural and behavioral links, requirement links, ports, simulation references, trace entries, and generated evidence—or block the action with an impact report. Current code does not guarantee this uniformly.

### Required lifecycle controls

- Add `validateOpmModelLifecycle(nodes, edges)` before simulation, export, and persistence.
- Enforce canonical containment and endpoint integrity for every BDD/IBD element.
- Detect structural cycles, orphan nodes, orphan edges, duplicate identities, invalid state ownership, and unresolved SysML mappings.
- Maintain requirement status (`uncovered`, `covered`, `verified`, `failed`, `stale`) from explicit evidence rather than link presence alone.
- Treat every edit, conversion, link change, port change, and deletion as a model revision that invalidates simulation traces and verification/code-generation evidence.
- Make deletion, undo, and redo restore or invalidate graph, runtime, trace, requirement evidence, and artifact lifecycle together.
- Add end-to-end tests that create one model, derive all three views, simulate it, save/reload it, delete each component kind, undo, and assert all three views and diagnostics remain consistent.

---

## Resolution and Verification Status (2026-09-08)

All planned lifecycle integrity controls and unified deletion mechanisms are fully implemented and verified.

### Status of Findings

| Item | Status | Resolution Detail |
|---|---|---|
| **P0 — Unify deletion semantics** | **RESOLVED** | Centralized in `OpmDeletionImpact.ts` via `analyzeOpmDeletion` and `applyOpmDeletion`. All deletion entry points (canvas, keyboard, panel, state delete, port delete) route through `commitModelMutation`. Cascades compute transitive descendant closures and remove all incident links. |
| **P0 — Prevent stale runtime state** | **RESOLVED** | Model revisions increment at the shared mutation boundary. `reconcileSimulationState` purges dead element references from `objectActiveState`, `pendingEvents`, `lastChangeTick`, `lastLoggedBlock`, and `trace`. Code-generation state resets to `draft` on every revision, gating download/HIL export. |
| **P0 — Complete port-aware validation** | **RESOLVED** | Implemented in `OpmPortContracts.ts` and `OpmLinkRules.ts`. Validates handle existence, directionality (inputs cannot source, outputs cannot target), endpoint ownership, type compatibility, multiplicity limits, and conceptual vs executable compatibility. |
| **P0 — Validate link conversion** | **RESOLVED** | `handleConvertEdgeType` and `handleConvertNodeType` validate candidate snapshots through `validateOpmPortConnection` and `validateOpmModelLifecycle` before committing, failing closed without canvas mutation. |
| **P1 — Preserve traceability as first-class model data** | **RESOLVED** | Added `OpmTraceabilityModel.ts` and `deriveOpmTraceabilityModel`. Tracks requirements with statuses `uncovered`, `covered`, `verified`, `failed`, and `stale` (when model revision outdates evidence). |
| **P1 — Enforce element-kind semantics** | **RESOLVED** | Requirements are restricted to `satisfies`/`verifies` relationships. Structural links (aggregation/generalization/exhibition) are strictly restricted between objects, rejecting requirements with code `OPM_REQUIREMENT_STRUCTURAL_LINK_INVALID`. Requirements are root-scoped. |
| **P1 — Deletion UX and safety** | **RESOLVED** | High-impact deletions trigger a confirmation warning card in `OpmRightPanelContent` displaying cascaded child, link, requirement, and simulation impact counts. Cancellation is side-effect free. |
| **P1 — End-to-end regression tests** | **RESOLVED** | Added `OpmLifecycleReleaseGate.test.ts`, `OpmModelLifecycle.test.ts`, `OpmDeletionImpact.test.ts`, `OpmTraceabilityAndInvalidation.test.ts`, `OpmDeletionUxAndDiagnostics.test.tsx`, and `opmEditorLifecycleIntegration.test.ts`. |

### Verification Evidence

- **Unit & Component Suites:** 30 test files passed (191 tests):
  `npx vitest run src/components/entropy/__tests__/` (100% pass)
- **OPM Qualification Suite:** 3 test files passed (41 tests):
  `npm run test:opm:qualification` (100% pass, zero boundary leaks)
- **TypeScript Static Verification:**
  `npx tsc --noEmit` (0 errors)
- **Environment Limitations:**
  `goldenExecution.test.ts` and `hostCompilation.test.ts` require the bundled GCC compiler toolchain (`toolchains/w64devkit/w64devkit/bin/gcc.exe`), which is absent on this Windows dev host; all pure TS/React qualification and conformance suites pass completely.

