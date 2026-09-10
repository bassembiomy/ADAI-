# SysML Conformance Review — Codex and Antigravity Changes

**Date:** 2026-09-08  
**Scope:** Native SysML model/services plus the Entropy OPM/SysML-derived BDD, IBD, Requirements, deletion, simulation, and traceability changes on branch `co-work`.

## Executive decision

The changes materially improve integrity, deletion consistency, runtime invalidation, and requirement coverage reporting. They do **not** yet justify claiming full SysML conformance or professional MBSE-tool completeness.

The principal reason is architectural: the delivered work implements an OPM editor with SysML-like derived views, while the expanded implementation plan requires a declared SysML profile and a canonical MBSE metamodel for block definitions, part usages, ports, connectors, item flows, requirements, verification cases, baselines, and trace links. Those expanded tasks remain unchecked and their planned files do not exist.

## Attribution

- The eight lifecycle commits `51cf2dc` through `a6e3b07` are authored and committed as **Antigravity**.
- Git contains no separate Codex-authored commit in this range. The conversation shows Codex created early versions of lifecycle/deletion files and the plan, but those working-tree changes were subsequently replaced or incorporated into Antigravity-authored commits. Exact line-level authorship between agents cannot be proven from the current Git metadata.
- The only current uncommitted files are unrelated HTML documentation files; the reviewed lifecycle implementation is committed.

## What is implemented and credible

- Canonical parent conflict detection, duplicate IDs, missing parents, orphan edges, invalid state owners, and structural cycle diagnostics.
- Port-handle existence, direction, type compatibility, duplicate connection, and basic multiplicity checks in the OPM editor.
- Shared transactional mutation/deletion paths in the OPM workspace.
- Deletion impact preview and incident-link cleanup.
- Runtime-state reconciliation and code-generation evidence invalidation after OPM model revisions.
- Requirement coverage states `uncovered`, `covered`, `verified`, `failed`, and `stale` for OPM requirement nodes.
- SysML import warnings and explicit unresolved/unsupported mapping records.
- Focused lifecycle verification: 58 tests passed across four suites; TypeScript completed with zero errors.

## Blocking findings

### P0-1: Composition semantics are not implemented in the delivered OPM model

The expanded plan requires an explicit `composition` semantic type and composition-only recursive deletion. The current OPM link union has no `composition`; `SysmlToOpmImporter` converts both SysML composition and aggregation to `aggregation`. The lifecycle validator detects cycles only over aggregation/generalization/containment, and the deletion engine traverses every React Flow parent/child containment relation rather than explicit composition edges.

**Required:** add composition as a first-class relationship with filled-diamond direction, one composite owner per part usage, acyclic ownership, multiplicity, recursive lifetime semantics, and tests proving ordinary aggregation/association/reference links never cascade-delete peers.

### P0-2: The native SysML integrity service is not integrated into production

`sysmlIntegrityService.ts` has useful migration, deletion, connector, and traceability helpers, but repository search finds no production caller. Its unit tests therefore validate isolated functions, not actual BDD/IBD/Requirements editor behavior.

**Required:** establish one production mutation gateway for native SysML state and route create/update/connect/delete/import/save/undo through it, or retire the duplicate native service and make a documented canonical adapter to the OPM lifecycle engine.

### P0-3: Native block deletion is semantically over-broad

`previewDeletionImpact` treats a part as affected when its `typeBlockId` matches the deleted block definition. Deleting a block definition can therefore delete every usage typed by that block, regardless of ownership. SysML definition deletion should be controlled separately from deletion of a composite part usage: usages may become invalid and require impact resolution, but must not silently be treated as owned children merely because they share a type.

**Required:** separate `BlockDefinition` deletion from `PartUsage` deletion. Cascade only through composition ownership; mark external usages as impacted/unresolved and require an explicit migration or deletion decision.

### P0-4: No canonical SysML profile or conformance statement exists

The plan says to declare the supported SysML version/profile, but no capability registry or conformance matrix exists. “All SysML specifications” is not a viable release claim without identifying SysML v1.x/ISO 19514 versus SysML v2 and listing supported, conceptual-only, imported-only, and unsupported constructs.

**Required:** implement `OpmProfileCapabilities`/equivalent and publish a normative conformance matrix tied to test IDs.

### P0-5: Full release verification currently fails

`npm run test:opm` fails 5 tests because the mandatory compiler is absent at `toolchains/w64devkit/w64devkit/bin/gcc.exe`. This prevents host compilation and TypeScript-versus-C differential qualification. The pasted report's claim that all OPM tests and qualification passed is not reproducible in the current workspace.

**Required:** restore/provision the pinned bundled toolchain or configure the approved compiler path, then rerun the complete OPM release gate and retain compiler/version/flags evidence.

## Major functional gaps

### BDD

- No distinct canonical `BlockDefinition` and `PartUsage` metamodel.
- No qualified names/namespaces or stable identity policy across move/copy/import.
- No formal value-type/unit/dimension compatibility engine.
- No complete property semantics: derived, ordered/unique multiplicity, redefinition, subsetting, read-only, default/value constraints.
- No inheritance feature resolution, abstract/final/leaf restrictions, or redefinition conflict diagnostics.
- Associations, dependencies, allocations, compositions, and shared aggregation are not all represented in the OPM semantic link model.
- BDD derivation is an aggregation/generalization tree, not a complete SysML BDD projection.

### IBD

- SysML connectors are explicitly left unresolved during import.
- No canonical connector object in the OPM editor with owning context, source/target part usage, source/target port, conveyed item, and connector kind.
- No full/proxy port semantics, interface typing, conjugation, provided/required features, or item-flow compatibility.
- No delegation connector, assembly connector, boundary-crossing, or binding-connector semantics.
- No definition-to-usage and usage-to-definition navigation/index.
- `deriveInternalView` is process-centric OPM input/output display; it is not a SysML Internal Block Diagram model.

### Requirements

- OPM link types include only `satisfies` and `verifies`; `deriveReqt`, `refine`, `trace`, and `copy` are absent or inconsistently named (`refines` is checked in traceability code but is not in the link-type union).
- Requirement direction is inconsistent between native SysML (`block/part → requirement`) and OPM (`requirement → object/process`). An adapter policy is needed instead of accepting both directions in derived views.
- No governed lifecycle `draft → approved → implemented → verified`, plus stale/failed/retired transitions.
- No required verification case/test identity and evidence requirement before assigning `verified` in the view; explicit status can currently override evidence.
- No requirement hierarchy/decomposition cycle validation, baseline protection, version history, change approval, or suspect-link handling.

### Traceability matrix

- `OpmTraceabilityModel` is a requirement-centric list, not the planned many-to-many traceability matrix.
- Missing columns/entities: BDD definitions, IBD usages, ports, connectors, behaviors, simulation scenarios, verification cases, generated artifacts, evidence, owner, baseline, version, and relationship direction.
- Missing cell states: suspect, orphan, unsupported, and unresolved.
- Missing filters, deterministic export/import, bidirectional cell navigation, baseline comparison, and change-set impact highlighting.
- State-machine C-source traceability is separate and is not joined to SysML/OPM requirement evidence.

### Lifecycle and persistence

- Native SysML and OPM remain parallel models/services without a proven lossless round trip.
- SysML migration currently discards substantial block metadata and reduces ports/connectors/relations.
- No end-to-end test covers the expanded professional fixture requested in Task 9.
- No baseline-aware undo/redo, protected-baseline mutation gate, or auditable change record.
- No model interchange qualification (XMI/API mapping) for the selected SysML profile.

## Test evidence from this review

- Focused SysML/OPM lifecycle suites: **58/58 passed**.
- TypeScript static check: **passed, zero errors**.
- Complete `npm run test:opm`: **failed — 5 failures, 347 passes**.
- Failure cause: mandatory bundled GCC unavailable, so host C compilation and differential parity are unqualified.

## Recommended completion order

1. Declare the supported SysML version/profile and create the capability/conformance matrix.
2. Choose and enforce one canonical MBSE metamodel; make native SysML and OPM adapters explicit.
3. Implement definition-versus-usage semantics and first-class composition.
4. Correct deletion to cascade only through composed part ownership and treat typed usages as impacts, not automatic children.
5. Implement full BDD semantics and validators.
6. Implement first-class IBD parts, ports, connectors, item flows, delegation, and bindings.
7. Implement complete requirement relationships, lifecycle, verification cases, evidence, and baselines.
8. Build the true many-to-many traceability matrix and change-impact engine.
9. Add persistence/interchange and professional end-to-end tests.
10. Restore the mandatory C toolchain and pass all release/qualification gates.

## Final assessment

The delivered work should be described as **an improved OPM lifecycle and SysML-migration foundation**, not a fully SysML-conformant MBSE tool. The original eight tasks are largely represented, but expanded Tasks 1A, 1B, 1C, 3A, 3B, 4A, and 9 remain substantially incomplete.

