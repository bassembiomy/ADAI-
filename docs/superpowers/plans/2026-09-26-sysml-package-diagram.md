# SysML v1.6 Package Diagram Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a first-class, repository-backed SysML Package Diagram with UML package, import, merge, dependency, namespace, Cameo-style presentation, persistence, and validation behavior.

**Architecture:** Extend the live, persisted `SysmlRepository` (`src/engine/sysml/model.ts`) through `sysmlCommandGateway.ts`, the command path used by `App.tsx`, Model Explorer, undo, and project persistence. Keep `SysmlRepositoryV4` as a separate capability/migration boundary; do not create a second writable repository or implement this feature only there. Extend the live repository’s semantic diagram definitions, relationships, validators, persistence and projections, then add React integration after semantics are independently testable.

**Tech Stack:** TypeScript, React, Vitest, Playwright, existing SysML command gateway, normalized store, Model Explorer adapters, and project persistence.

## Global Constraints

- Package Diagram use in SysML is `OMG_SYSML_1_6`, Clause 7 §§7.1–7.2; UML Package, Model, import, merge, dependency, namespace, visibility, alias, and qualified-name semantics are `UML_FOUNDATION`.
- Folder notation, Show Contents interactions, context menus, palette shortcuts, Used By, Depends On, and Find in Diagrams are `CAMEO_TOOLING`; do not attribute tool behavior to OMG without normative support.
- Transactions, diagnostics, evidence records, migration behavior, and AI approval boundaries are `ADIA_EXTENSION`.
- No feature is enabled in the UI until it has a domain representation, command, validator, persistence mapping, projection, and automated semantic evidence.
- Every command caller (`ui`, `ai`, `import`, `migration`, and `script`) uses the same semantic rules; no caller silently creates a missing element or type.
- A diagram presentation references an existing semantic ID and stores presentation-only state. Containment is represented only by `ownerId`.
- `Show Contents` adds presentations of repository elements; it never creates, duplicates, or reparents semantic elements.
- `Remove from Diagram` deletes presentation state only. `Delete from Model` executes semantic deletion with impact analysis.
- Preserve existing BDD, IBD, Requirements, RTM, semantic identity, deletion, and code-generation isolation behavior.

---

## File Map

| Path | Responsibility in this feature |
|---|---|
| `src/engine/sysml/model.ts` | Add `package` diagram kind and typed package import/merge relationship data to the live repository model. |
| `src/types/sysml_types.ts` | Extend serialized relationship data for package import, element import, merge, visibility, and alias. |
| `src/services/sysmlCommandGateway.ts` | Add package diagram creation/addition and shared transaction behavior for package semantics. |
| `src/services/sysmlCreationRules.ts` | Add package namespace and endpoint validation shared across command callers. |
| `src/engine/sysml/policy.ts` and `validation.ts` | Enforce package ownership, import, merge, and relationship constraints at the live semantic boundary. |
| `src/engine/sysml/domain/base.ts` | Existing Package and Model metaclasses; only extend if common namespace properties are required. |
| `src/engine/sysml/domain/relationships.ts` | Add typed PackageImport, ElementImport, and PackageMerge relationships; retain existing generic UML Dependency semantics. |
| `src/engine/sysml/domain/presentations.ts` | Add `package` to DiagramKind; keep diagram presentation references semantic-ID based. |
| `src/engine/sysml/domain/index.ts` | Export package relationship and namespace query types. |
| `src/engine/sysml/commands/types.ts` | Add explicit package diagram, Show Contents, import, merge, visibility, and dependency command contracts. |
| `src/engine/sysml/commands/elementCommands.ts` | Define Package Diagram allowed metaclasses and ensure create-and-present uses the same policy. |
| `src/engine/sysml/commands/relationshipCommands.ts` | Dispatch package relationship mutations through validators and normalized indexes. |
| `src/engine/sysml/commands/dispatcher.ts` | Route new transactions, enforce diagram compatibility, expose stable diagnostics and atomic state. |
| `src/engine/sysml/capabilities/ownershipPolicy.ts` | Keep legal Model/Package ownership and enforce cycle-safe moves. |
| `src/engine/sysml/capabilities/relationshipPolicy.ts` | Validate Dependency endpoints and package relationship endpoints/direction. |
| `src/engine/sysml/capabilities/packagePolicy.ts` (new) | Pure package import, element import, merge, visibility, and cycle validators. |
| `src/engine/sysml/services/packageQueries.ts` (new) | Qualified names, owned members, imports, visibility, dependencies, usages, merge closure, and presentation lookup. |
| `src/engine/sysml/normalizedStore.ts` | Index and project package relationships, ownership, and diagram presentations from the live repository. |
| `src/engine/sysml/persistence.ts` | Round-trip package diagram kind and relationship variants through existing project persistence. |
| `src/services/sysmlProjectionState.ts` and `projectLegacyDiagram` | Project package diagram contents and relationship labels without mutating semantic ownership. |
| `src/engine/sysml/compliance/types.ts` and package evidence module | Record authority and four-level evidence for each delivered semantic feature. |
| `src/features/modelExplorer/modelExplorerCapabilities.ts` | Advertise Package Diagram creation only for Model and Package nodes. |
| `src/features/modelExplorer/adapters/sysmlExplorerAdapter.ts` | Create/open semantic Package Diagrams, add/show/remove presentations, and return diagnostics. |
| `src/features/modelExplorer/modelExplorerTypes.ts` | Extend explorer commands only for missing intents; avoid frontend-owned semantic state. |
| `src/features/modelExplorer/modelDiagramRegistry.ts` | Resolve persisted diagrams by repository ID; remove synthetic fallback IDs for failed creation. |
| `src/components/modelExplorer/AppModelExplorer.tsx` | Surface supported Package Diagram creation and package commands through the command bus. |
| `src/features/sysml/packageDiagramProjection.ts` (new) | Project semantic packages, selected owned members, imports/merges/dependencies, and presentation bounds from the live repository. |
| `src/features/sysml/packageDiagramProjection.test.ts` (new) | Validate projection references and ensure presentation does not alter ownership. |
| `src/components/sysml/PackageDiagramWorkspace.tsx` (new) | Thin React workspace consuming projected semantic data and command callbacks. |
| `src/components/sysml/PackageDiagramWorkspace.test.tsx` (new) | UI behavior tests for palette, selection, notation, contexts, and diagnostics. |
| `src/components/sysml/PackageSymbol.tsx` (new) | Folder-tab Package/Model notation, semantic labels, compartments, selection and resize handles. |
| `src/components/sysml/PackageSymbol.test.tsx` (new) | Notation and semantic identity tests. |
| `src/components/sysml/PackagePropertiesPanel.tsx` (new) | Separate semantic properties from presentation properties. |
| `src/components/sysml/PackagePropertiesPanel.test.tsx` (new) | Verify edits dispatch commands and display backend results. |
| `src/App.tsx` | Register Package Diagram mode and bridge its active semantic diagram ID to existing workspace state; do not implement semantic rules inline. |
| `src/engine/sysml/packageDiagram.test.ts` (new) | Semantic package constraints, namespace queries, and command-level release scenarios. |
| `src/engine/sysml/packagePersistence.test.ts` (new) | Package Diagram save/load, migration, ID stability, and presentation round trips. |
| `src/services/sysmlCommandGateway.test.ts` | Gateway atomicity, undo/redo, stable IDs, and no-silent-creation cases. |
| `src/features/modelExplorer/adapters/sysmlExplorerAdapter.test.ts` | Tree command coverage and semantic diagram creation/open behavior. |
| `tests/e2e/sysml-package-diagram.spec.ts` (new) | Browser workflows from tree, palette, relationship tools, properties, persistence, and deletion. |
| `docs/sysml/compliance-evidence.json` | Add evidence entries only after semantic automated tests exist. |

`SysmlRepository` and `sysmlCommandGateway.ts` are the one writable semantic path for this feature. Do not write Package Diagram semantics to `SysmlRepositoryV4` unless a separate repository-wide migration moves all App persistence and commands to V4; that migration is out of scope.

## Interfaces Produced by the Plan

The implementation must converge on these stable domain/query signatures (names may change only with corresponding updates across all tasks):

```ts
export type PackageVisibility = 'public' | 'private';

export interface PackageImport extends Omit<SemanticRelationship, 'metaclass' | 'sourceId' | 'targetId'> {
  metaclass: 'PackageImport';
  sourceId: string;
  targetId: string;
  importingNamespaceId: string;
  importedPackageId: string;
  visibility: PackageVisibility;
}

export interface ElementImport extends Omit<SemanticRelationship, 'metaclass' | 'sourceId' | 'targetId'> {
  metaclass: 'ElementImport';
  importingNamespaceId: string;
  importedElementId: string;
  visibility: PackageVisibility;
  alias?: string;
}

export interface PackageMerge extends Omit<SemanticRelationship, 'metaclass' | 'sourceId' | 'targetId'> {
  metaclass: 'PackageMerge';
  mergingPackageId: string;
  mergedPackageId: string;
}

export interface PackageQueryService {
  getOwnedPackageableElements(packageId: string): SemanticElement[];
  getImportedMembers(namespaceId: string): PackageMemberReference[];
  getVisibleMembers(namespaceId: string): PackageMemberReference[];
  getPackageDependencies(packageId: string, recursive?: boolean): SemanticRelationship[];
  getElementUsages(elementId: string): SemanticRelationship[];
  getQualifiedName(elementId: string): string | null;
  getPresentationsForElement(elementId: string): DiagramPresentation[];
  getPackageMergeClosure(packageId: string): string[];
}

export interface PackageMemberReference {
  element: SemanticElement;
  visibleName: string;
  visibility: PackageVisibility;
  importedViaId?: string;
}
```

Package relationships must be representable without corrupting existing source/target indexes. `Dependency` remains a generic UML relationship; imports and merges retain their dedicated metaclasses and explicit endpoint roles. Derived `«import»`/`«access»` labels come from `visibility`.

## Task 1: Lock Domain Diagram and Package Relationship Semantics

**Files:**
- Modify: `src/engine/sysml/domain/relationships.ts`
- Modify: `src/engine/sysml/domain/presentations.ts`
- Modify: `src/engine/sysml/domain/index.ts`
- Test: `src/engine/sysml/domain/packageDiagramMetamodel.test.ts` (new)

**Interfaces:**
- Consumes: existing `SemanticElement`, `SemanticRelationship`, `Diagram`, and `DiagramKind`.
- Produces: `DiagramKind` includes `package`; exported `PackageImport`, `ElementImport`, `PackageMerge`, and `PackageVisibility` types.

- [ ] **Step 1: Write metamodel tests for package DiagramKind and package relationship roles.** Assert all three dedicated relationship metaclasses, endpoint role fields, visibility values, optional alias, and the package DiagramKind literal.
- [ ] **Step 2: Run `npx vitest run src/engine/sysml/domain/packageDiagramMetamodel.test.ts`; confirm failure on missing declarations.**
- [ ] **Step 3: Add the typed unions and interfaces.** Add relationship metaclasses `PackageImport`, `ElementImport`, and `PackageMerge`; add their explicit endpoint properties; define visibility as `'public' | 'private'`; add `'package'` to `DiagramKind`; export public types from `domain/index.ts`. Keep generic `Dependency` unchanged.
- [ ] **Step 4: Run the new metamodel test and existing domain type tests.** Run `npx vitest run src/engine/sysml/domain/packageDiagramMetamodel.test.ts src/engine/sysml/domain/metamodelV4.test.ts src/engine/sysml/domain/completeMetamodel.test.ts`; expect all pass.
- [ ] **Step 5: Commit the domain slice.** `git add src/engine/sysml/domain/relationships.ts src/engine/sysml/domain/presentations.ts src/engine/sysml/domain/index.ts src/engine/sysml/domain/packageDiagramMetamodel.test.ts; git commit -m "feat(sysml): model package diagram relationships"`.

## Task 2: Add Package Relationship Constraints and Namespace Queries

**Files:**
- Create: `src/engine/sysml/capabilities/packagePolicy.ts`
- Create: `src/engine/sysml/capabilities/packagePolicy.test.ts`
- Create: `src/engine/sysml/services/packageQueries.ts`
- Create: `src/engine/sysml/services/packageQueries.test.ts`
- Modify: `src/engine/sysml/capabilities/relationshipPolicy.ts`
- Modify: `src/engine/sysml/capabilities/ownershipPolicy.ts` only if cycle checks need a shared owner capability.

**Interfaces:**
- Consumes: package interfaces from Task 1 and the live `SysmlRepository` normalized indexes.
- Produces: pure `validatePackageImport`, `validateElementImport`, `validatePackageMerge`, `validatePackageOwnershipMove`; `createPackageQueryService(repo)` implementing all `PackageQueryService` methods.

- [ ] **Step 1: Write failing semantic tests.** Cover import target must be Package, element import target must exist and be packageable, self-merge, merge cycles, ownership cycles, duplicate equivalent imports, public/private imported-member lookup, alias lookup, qualified names from actual owner chain, recursive dependency query, usages, presentations, and merge closure.
- [ ] **Step 2: Run `npx vitest run src/engine/sysml/capabilities/packagePolicy.test.ts src/engine/sysml/services/packageQueries.test.ts`; verify failures identify absent modules/contracts.**
- [ ] **Step 3: Implement pure package policy validators.** Each returns `{ allowed: boolean; code?: string; message?: string }`; validators do not mutate the repository. Return the stable spec diagnostics `PACKAGE_IMPORT_TARGET_NOT_PACKAGE`, `ELEMENT_IMPORT_TARGET_NOT_PACKAGEABLE`, `PACKAGE_MERGE_ENDPOINT_NOT_PACKAGE`, `PACKAGE_MERGE_CYCLE`, `SELF_OWNERSHIP_CYCLE`, `OWNERSHIP_CYCLE`, and `DUPLICATE_IMPORT`.
- [ ] **Step 4: Implement indexed package queries.** Build `createPackageQueryService(repo)` and use `indexes.byOwner`, `byType`, endpoint indexes, and presentation indexes when available. For qualified names, walk owner IDs with a visited set and return `null` on a missing element or cycle. Imported members must honor visibility/alias and avoid duplicate element IDs.
- [ ] **Step 5: Run package policy and query tests; expect all pass.**
- [ ] **Step 6: Commit.** `git add src/engine/sysml/capabilities/packagePolicy.ts src/engine/sysml/capabilities/packagePolicy.test.ts src/engine/sysml/services/packageQueries.ts src/engine/sysml/services/packageQueries.test.ts src/engine/sysml/capabilities/relationshipPolicy.ts; git commit -m "feat(sysml): validate and query package semantics"`.

## Task 3: Add Command Transactions for Package Imports, Merges, and Show Contents

**Files:**
- Modify: `src/engine/sysml/commands/types.ts`
- Modify: `src/engine/sysml/commands/relationshipCommands.ts`
- Modify: `src/engine/sysml/commands/elementCommands.ts`
- Modify: `src/engine/sysml/commands/dispatcher.ts`
- Create: `src/engine/sysml/commands/packageCommands.test.ts`
- Modify: `src/engine/sysml/normalizedStore.ts`

**Interfaces:**
- Consumes: validators and query service from Task 2.
- Produces: commands `CreatePackageImport`, `CreateElementImport`, `CreatePackageMerge`, `UpdateImportVisibility`, and `ShowPackageContents`; stable atomic behavior through `dispatchSysmlCommand`.

- [ ] **Step 1: Write failing command tests for each create/update path.** Assert valid records update semantic relationship collections and all indexes; invalid endpoints leave the original repository reference/revision untouched; undo/redo restores the same semantic and presentation IDs.
- [ ] **Step 2: Write failing Show Contents transaction tests.** Direct mode includes only direct owned packageable members; recursive mode includes nested package members; existing presentations are retained and not duplicated; ownership remains unchanged; one command revision covers the presentation batch; undo removes only new presentations.
- [ ] **Step 3: Run `npx vitest run src/engine/sysml/commands/packageCommands.test.ts`; verify the new command types fail to compile or dispatch.**
- [ ] **Step 4: Define command payloads.** Use endpoint IDs and stable relationship IDs; `ShowPackageContents` includes `diagramId`, `packageId`, `mode: 'direct' | 'packages' | 'packageable' | 'recursive'`, and presentation bounds policy.
- [ ] **Step 5: Implement command handlers on a cloned next state.** Validate diagram kind, element/relationship existence, endpoint metaclasses, duplicate semantics, import visibility, cycles, and presentation IDs before committing. Index relationship source/target/type and each created presentation. Return affected IDs and stable diagnostics.
- [ ] **Step 6: Add package relationship types to allowed Package Diagram subjects and dependency presentation rules.** Ensure elements may be semantic repository members without being presented; relationship presentation requires both endpoints on that diagram.
- [ ] **Step 7: Run command tests plus `npx vitest run src/engine/sysml/commands/dispatcher.test.ts src/engine/sysml/commands/createAndPresent.test.ts src/engine/sysml/commands/packageCommands.test.ts`; expect all pass.**
- [ ] **Step 8: Commit.** `git add src/engine/sysml/commands/types.ts src/engine/sysml/commands/relationshipCommands.ts src/engine/sysml/commands/elementCommands.ts src/engine/sysml/commands/dispatcher.ts src/engine/sysml/commands/packageCommands.test.ts src/engine/sysml/normalizedStore.ts; git commit -m "feat(sysml): add package diagram transactions"`.

## Task 4: Make Package Diagram Creation and Tree Capabilities Repository-Backed

**Files:**
- Modify: `src/features/modelExplorer/modelExplorerCapabilities.ts`
- Modify: `src/features/modelExplorer/adapters/sysmlExplorerAdapter.ts`
- Modify: `src/features/modelExplorer/modelDiagramRegistry.ts`
- Modify: `src/components/modelExplorer/AppModelExplorer.tsx`
- Modify: `src/features/modelExplorer/adapters/sysmlExplorerAdapter.test.ts`
- Modify: `src/components/modelExplorer/AppModelExplorer.commands.test.tsx`
- Modify: `src/features/modelExplorer/modelDiagramRegistry.test.ts`

**Interfaces:**
- Consumes: package command transactions from Task 3.
- Produces: Package Diagram create/open capabilities on Model and Package nodes; diagram tree entries backed by repository `Diagram` IDs; add/remove/show contents tree intents that call commands.

- [ ] **Step 1: Add failing explorer tests.** Creating a Package Diagram under Model and Package produces persisted semantic Diagram records with kind `package`; illegal owners are rejected; failed creation returns a diagnostic and never fabricates `diag-${Date.now()}`; the same diagram opens by repository ID after adapter reconstruction.
- [ ] **Step 2: Add failing tree operation tests.** Add to Diagram uses existing semantic IDs; Show Contents leaves semantic collections unchanged; Remove from Diagram removes only relevant presentations.
- [ ] **Step 3: Run `npx vitest run src/features/modelExplorer/adapters/sysmlExplorerAdapter.test.ts src/features/modelExplorer/modelDiagramRegistry.test.ts src/components/modelExplorer/AppModelExplorer.commands.test.tsx`; verify failures.**
- [ ] **Step 4: Add `'package'` to diagram labels and Model/Package diagram capability mappings.** Do not add it to BDD-only virtual pillars unless the UI owner scope explicitly permits the operation.
- [ ] **Step 5: Route tree create/open/add/remove/show commands through the existing adapter and command bus.** Remove synthetic success IDs on command failure; return a structured diagnostic to the menu surface.
- [ ] **Step 6: Run the focused explorer tests and existing tree persistence tests; expect all pass.**
- [ ] **Step 7: Commit.** `git add src/features/modelExplorer/modelExplorerCapabilities.ts src/features/modelExplorer/adapters/sysmlExplorerAdapter.ts src/features/modelExplorer/modelDiagramRegistry.ts src/components/modelExplorer/AppModelExplorer.tsx src/features/modelExplorer/adapters/sysmlExplorerAdapter.test.ts src/components/modelExplorer/AppModelExplorer.commands.test.tsx src/features/modelExplorer/modelDiagramRegistry.test.ts; git commit -m "feat(model-explorer): create package diagrams from repository"`.

## Task 5: Add Persistence, Migration, and Canonical Projection Support

**Files:**
- Modify: `src/engine/sysml/persistence.ts`
- Modify: `src/engine/sysml/persistence/migrateV3ToV4.ts`
- Modify: `src/engine/sysml/normalizedStore.ts`
- Modify: `src/services/sysmlProjectionState.ts`
- Create: `src/engine/sysml/packagePersistence.test.ts`
- Modify: `src/engine/sysml/persistence.test.ts`
- Modify: `src/engine/sysml/mutations.ts` only if package impact records are not captured by generic entity operations.

**Interfaces:**
- Consumes: Task 1 semantic types and Task 3 repository commands.
- Produces: deterministic save/load for package diagram entities, all package relationship kinds, bounds, routing, visibility, aliases, and member compartment flags; migration preserves earlier package presentations without inventing new package diagrams.

- [ ] **Step 1: Write failing canonical round-trip tests.** Serialize and reload one Package Diagram with nested Packages, Blocks, Requirements, imports, merge, dependencies, multiple presentations, visibility, aliases, and compartments; deep equality of IDs/ownership/endpoints/diagram references is required.
- [ ] **Step 2: Write failing migration tests from schema v2/v3 and V4 legacy snapshots.** Existing Packages and BDD/Requirements Package presentations survive with IDs; no `package` Diagram is synthesized; unresolved endpoints return diagnostics/quarantine records.
- [ ] **Step 3: Run `npx vitest run src/engine/sysml/packagePersistence.test.ts src/engine/sysml/persistence.test.ts src/engine/sysml/migrateV3ToV4.test.ts`; verify current persistence drops or rejects new entities.**
- [ ] **Step 4: Add versioned fields/relationship serialization with backward-compatible defaults.** Preserve current schema readers; if a version bump is necessary, add an explicit one-step migration and keep old checksum validation valid for old envelopes.
- [ ] **Step 5: Extend normalized projection/index cache invalidation.** Package rename, ownership move, import/merge mutation, and presentation update invalidate only dependent package query/projection entries.
- [ ] **Step 6: Run persistence, migration, normalized store, and projection tests; expect all pass.**
- [ ] **Step 7: Commit.** `git add src/engine/sysml/persistence.ts src/engine/sysml/persistence/migrateV3ToV4.ts src/engine/sysml/normalizedStore.ts src/services/sysmlProjectionState.ts src/engine/sysml/packagePersistence.test.ts src/engine/sysml/persistence.test.ts src/engine/sysml/mutations.ts; git commit -m "feat(sysml): persist package diagram semantics"`.

## Task 6: Implement the Package Diagram Projection and Rendering Components

**Files:**
- Create: `src/features/sysml/packageDiagramProjection.ts`
- Create: `src/features/sysml/packageDiagramProjection.test.ts`
- Create: `src/components/sysml/PackageSymbol.tsx`
- Create: `src/components/sysml/PackageSymbol.test.tsx`
- Create: `src/components/sysml/PackageDiagramWorkspace.tsx`
- Create: `src/components/sysml/PackageDiagramWorkspace.test.tsx`
- Create: `src/components/sysml/PackagePropertiesPanel.tsx`
- Create: `src/components/sysml/PackagePropertiesPanel.test.tsx`
- Modify: `src/types/sysml_types.ts` only for view model projection types.

**Interfaces:**
- Consumes: package query service, normalized semantic repository, diagram presentations, and package commands.
- Produces: pure `projectPackageDiagram(repository, diagramId)` returning presented packageable nodes, presented relationships, resolved semantic labels, bounds, visible contents, and diagnostics; React components receive projected state and command callbacks only.

- [ ] **Step 1: Write projection tests.** Verify only active-diagram presentations appear; multiple presentations resolve one semantic ID; names and qualified names resolve from current repository state; visual nesting does not change ownerId; imported elements are marked as referenced and cannot be edited as owned members through the symbol; missing IDs surface diagnostics instead of placeholders.
- [ ] **Step 2: Run `npx vitest run src/features/sysml/packageDiagramProjection.test.ts`; verify failure.**
- [ ] **Step 3: Implement the pure projection.** Resolve elements and relationships from repository IDs; apply `DiagramPresentation` bounds, routing, visibility, and z-order; query visible members only when `visibleCompartments` requests them.
- [ ] **Step 4: Write PackageSymbol tests for folder-tab notation, Model vs Package label, semantic ID attributes, selected compartments, and selection callbacks.**
- [ ] **Step 5: Implement PackageSymbol and property panel.** Every edit invokes a command callback; separate Semantic and Presentation sections; no text field silently changes only component state.
- [ ] **Step 6: Write workspace tests for palette enablement, selection, relationship tool endpoint feedback, Show Contents, remove presentation, and failed command diagnostics.**
- [ ] **Step 7: Implement PackageDiagramWorkspace as a renderer and command dispatcher.** It must not create IDs or mutate repository-shaped local arrays. Use existing diagram canvas interaction utilities only through explicit callbacks.
- [ ] **Step 8: Run projection and component tests; expect all pass.**
- [ ] **Step 9: Commit.** `git add src/features/sysml/packageDiagramProjection.ts src/features/sysml/packageDiagramProjection.test.ts src/components/sysml/PackageSymbol.tsx src/components/sysml/PackageSymbol.test.tsx src/components/sysml/PackageDiagramWorkspace.tsx src/components/sysml/PackageDiagramWorkspace.test.tsx src/components/sysml/PackagePropertiesPanel.tsx src/components/sysml/PackagePropertiesPanel.test.tsx src/types/sysml_types.ts; git commit -m "feat(sysml): render semantic package diagrams"`.

## Task 7: Integrate the Workspace and Cameo-Style Actions in the Application

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/features/modelExplorer/modelExplorerCapabilities.ts`
- Modify: `src/components/modelExplorer/AppModelExplorer.tsx`
- Modify: `src/features/modelExplorer/modelExplorerTypes.ts` only for necessary explicit intents.
- Create: `src/components/sysml/packageDiagramAppIntegration.test.tsx`

**Interfaces:**
- Consumes: projection and components from Task 6; persisted semantic diagram records from Task 4.
- Produces: openable Package Diagram mode bound to active semantic diagram ID; palette and context menu actions that invoke repository commands and display command diagnostics.

- [ ] **Step 1: Write integration tests.** Creating a Package Diagram from a Package tree node opens that exact ID; opening another diagram restores its own presentations; creating a Package on-canvas creates one semantic Package and one presentation atomically; tree Add to Diagram reuses ID; Show Contents makes presentations only; Remove from Diagram preserves model data.
- [ ] **Step 2: Run `npx vitest run src/components/sysml/packageDiagramAppIntegration.test.tsx`; verify current App has no `package` mode.**
- [ ] **Step 3: Add the first-class diagram route and mode.** Resolve active `Diagram` from repository; pass repository, diagram ID, projected data, dispatch callback, and result callback to PackageDiagramWorkspace.
- [ ] **Step 4: Wire palette and context actions to commands.** Expose only Package, Model where supported, Dependency, Package Import, Access, Element Import, Package Merge, Comment, Constraint, and Rationale after each corresponding path is complete.
- [ ] **Step 5: Wire selection and properties.** On failed command, preserve selected semantic ID and display diagnostic; on success, select returned affected semantic/presentation IDs.
- [ ] **Step 6: Run App integration, Model Explorer, and diagram creation tests; expect all pass.**
- [ ] **Step 7: Commit.** `git add src/App.tsx src/features/modelExplorer/modelExplorerCapabilities.ts src/components/modelExplorer/AppModelExplorer.tsx src/features/modelExplorer/modelExplorerTypes.ts src/components/sysml/packageDiagramAppIntegration.test.tsx; git commit -m "feat(app): open repository package diagrams"`.

## Task 8: Add Deletion Impact, Move, Copy/Paste, Undo, and AI/Import Parity

**Files:**
- Modify: `src/engine/sysml/commands/elementCommands.ts`
- Modify: `src/engine/sysml/commands/relationshipCommands.ts`
- Modify: `src/engine/sysml/commands/dispatcher.ts`
- Modify: `src/features/modelExplorer/adapters/sysmlExplorerAdapter.ts`
- Modify: `src/services/sysmlCommandGateway.ts`
- Modify: relevant `*.test.ts` files adjacent to each modified module.

**Interfaces:**
- Consumes: semantic commands from Tasks 2–3 and persistent identities from Task 5.
- Produces: package-aware impact results for Move/Delete, atomic cascade behavior, import/merge identity remapping on copy/paste, and consistent source-policy behavior.

- [ ] **Step 1: Write failing delete impact tests.** Deleting a Package reports owned descendants, imports, merges, dependencies, presentations, and namespace lookups; cancel leaves the exact state unchanged; confirm removes impacted entities transactionally; undo restores exact IDs.
- [ ] **Step 2: Write failing move/copy tests.** Moving a Package/member validates no cycles, updates owner indexes and qualified-name query results, and preserves presentations; copy/paste remaps every nested semantic and relationship reference without copying presentations from unrelated diagrams.
- [ ] **Step 3: Write caller parity tests.** For `ui`, `ai`, `import`, `migration`, and `script`, unknown target IDs yield the same missing-reference diagnostic and state hash is unchanged.
- [ ] **Step 4: Run focused command/gateway/explorer tests; confirm failures.**
- [ ] **Step 5: Implement transaction impact and remapping through shared command helpers.** Do not implement separate AI/import semantic mutations. Apply command source only for audit provenance; validators are shared.
- [ ] **Step 6: Run focused suites and semantic identity release gate; expect all pass.**
- [ ] **Step 7: Commit.** `git add src/engine/sysml/commands src/features/modelExplorer/adapters/sysmlExplorerAdapter.ts src/services/sysmlCommandGateway.ts; git commit -m "feat(sysml): preserve package identity across lifecycle actions"`.

## Task 9: Add Compliance Provenance and Four-Level Evidence

**Files:**
- Create: `src/engine/sysml/packageDiagramCompliance.ts`
- Create: `src/engine/sysml/packageDiagramCompliance.test.ts`
- Modify: `docs/sysml/compliance-evidence.json`
- Modify: `src/engine/sysml/conformanceManifest.ts` if the project manifest is the authoritative generated index.

**Interfaces:**
- Consumes: compliance types from `src/engine/sysml/compliance/types.ts` and verified tests from prior tasks.
- Produces: evidence records naming authority, SysML/UML section, domain type, command, validator, persistence mapping, projection, and tests for Package, PackageImport, ElementImport, PackageMerge, Package Diagram, and Show Contents.

- [ ] **Step 1: Write an evidence test that rejects `COMPLIANT` when any level or evidence field is missing.** Verify Cameo-only behaviors carry `CAMEO_TOOLING` and PackageImport semantics carry `UML_FOUNDATION` with SysML Clause 7 usage noted separately.
- [ ] **Step 2: Run `npx vitest run src/engine/sysml/packageDiagramCompliance.test.ts`; verify failure with missing evidence entries.**
- [ ] **Step 3: Add per-feature evidence records.** Use exact test and source paths created earlier. Keep incomplete or unimplemented capabilities `PARTIAL` or absent from the enabled catalog.
- [ ] **Step 4: Run compliance evaluator and package evidence tests; expect complete evidence to pass, incomplete fixture to fail.**
- [ ] **Step 5: Commit.** `git add src/engine/sysml/packageDiagramCompliance.ts src/engine/sysml/packageDiagramCompliance.test.ts src/engine/sysml/conformanceManifest.ts docs/sysml/compliance-evidence.json; git commit -m "docs(sysml): add package diagram compliance evidence"`.

## Task 10: Add End-to-End Workflows and Performance Gates

**Files:**
- Create: `tests/e2e/sysml-package-diagram.spec.ts`
- Modify: `src/engine/sysml/largeModelBenchmarkGate.test.ts`
- Modify: `src/engine/sysml/architectureGuards.test.ts` only to enforce repository and UI layering.
- Modify: package diagram unit tests only for defects found by these gates.

**Interfaces:**
- Consumes: all semantic, persistence, projection, UI, and command paths from Tasks 1–9.
- Produces: release evidence for tree/canvas parity, package relationships, save/reload, delete/move, and package-scale projection.

- [ ] **Step 1: Add browser identity workflow.** Create `CommonTypes`; create Package Diagrams A/B; present the same Package in both plus a BDD; rename it; assert one semantic ID and three presentations all display the new name.
- [ ] **Step 2: Add Show Contents workflow.** Create package-owned Block and Requirement in tree, show direct contents, assert no semantic count increase, remove one symbol, and verify repository element remains.
- [ ] **Step 3: Add relationship workflows.** Create public import, private access, Element Import alias, Package Merge, and Dependency; assert notation, repository records, properties, and reload behavior.
- [ ] **Step 4: Add rejection and deletion workflows.** Attempt invalid import/merge endpoints and ownership cycle; assert visible diagnostics and unchanged repository; exercise remove symbol versus confirmed model deletion and undo.
- [ ] **Step 5: Add large model benchmark fixture.** Generate 500 Packages, 2,000 packageable elements, and 1,000 dependencies; project and query the active diagram through existing benchmark harness; assert repository benchmark thresholds and bounded visible node count under viewport culling.
- [ ] **Step 6: Run focused browser test.** Run `npx playwright test tests/e2e/sysml-package-diagram.spec.ts`; expect every workflow to pass.
- [ ] **Step 7: Run semantic identity, architecture, persistence, and large-model gates.** Run `npx vitest run src/engine/sysml/packageDiagram.test.ts src/engine/sysml/packagePersistence.test.ts src/engine/sysml/packageDiagramCompliance.test.ts src/engine/sysml/semanticIdentityReleaseGate.test.ts src/engine/sysml/architectureGuards.test.ts src/engine/sysml/largeModelBenchmarkGate.test.ts`; expect all pass.
- [ ] **Step 8: Commit.** `git add tests/e2e/sysml-package-diagram.spec.ts src/engine/sysml/largeModelBenchmarkGate.test.ts src/engine/sysml/architectureGuards.test.ts; git commit -m "test(sysml): gate package diagram repository workflows"`.

## Task 11: Final Compatibility and Release Validation

**Files:**
- Modify only files required to repair failures from this task; do not update unrelated generated artifacts.
- Review: all files listed above and `docs/superpowers/specs/2026-09-26-sysml-package-diagram-design.md`.

**Interfaces:**
- Consumes: complete implementation and all earlier task evidence.
- Produces: verified release state with no enabled presentation-only features and no regression to existing SysML workflows.

- [ ] **Step 1: Run type check.** Run `npx tsc --noEmit`; expect exit code 0.
- [ ] **Step 2: Run package semantic, persistence, command, query, projection, and compliance tests.** Run `npx vitest run src/engine/sysml/domain/packageDiagramMetamodel.test.ts src/engine/sysml/capabilities/packagePolicy.test.ts src/engine/sysml/services/packageQueries.test.ts src/engine/sysml/commands/packageCommands.test.ts src/engine/sysml/packagePersistence.test.ts src/features/sysml/packageDiagramProjection.test.ts src/engine/sysml/packageDiagramCompliance.test.ts`; expect all pass.
- [ ] **Step 3: Run affected existing regression suites.** Run `npm run test:sysml`; expect no regressions in repository identity, ports, ownership, requirements, diagrams, or migrations.
- [ ] **Step 4: Run Package Diagram browser workflows and existing repository presentation E2E.** Run `npx playwright test tests/e2e/sysml-package-diagram.spec.ts tests/e2e/sysml-repository-presentation.spec.ts`; expect both suites pass in configured browser projects.
- [ ] **Step 5: Run architecture and code-generation isolation gates.** Run `npm run test:sysml:architecture` and `npm run verify:repository-codegen-isolation`; record any environment-provided sanitizer/target limitations separately from semantic correctness and do not mark the overall gate passed if the command exits nonzero.
- [ ] **Step 6: Inspect final diff and evidence.** Run `git diff --check`, inspect `git status --short`, and confirm each enabled palette/context-menu action maps to one command and one test path.
- [ ] **Step 7: Commit any validation repairs in a focused commit.** Use a message describing the fixed failing behavior; do not bundle unrelated workspace changes.

## Plan Self-Review

- **Spec coverage:** Domain authority and package semantics (Tasks 1–2, 9); command transactions and constraints (Task 3); Model Explorer, creation, and open-by-ID (Task 4); persistence/migration/normalized projection (Task 5); folder notation, properties, and workspace (Task 6); app integration and tree/canvas parity (Task 7); deletion, hierarchy, copy/paste, undo, and AI/import parity (Task 8); compliance (Task 9); identity, Show Contents, relationships, rejection, scale, and regression gates (Tasks 10–11).
- **No-silent-creation:** Task 3 rejects missing IDs; Task 4 removes fabricated diagram IDs; Task 5 migrates without synthetic Package Diagrams; Task 8 asserts source parity.
- **Layering:** Backend types, queries, commands, validation, indexes, persistence, projection, and UI have explicit file boundaries. `App.tsx` only selects the active repository diagram and bridges callbacks.
- **Type consistency:** Package visibility is `PackageVisibility`; command transactions return `CommandResult`; package queries return `SemanticElement[]`, `SemanticRelationship[]`, `DiagramPresentation[]`, and nullable qualified names as specified above.
- **Known sequencing constraint:** Palette relationship actions must not be exposed before their matching semantic command, validation, persistence, projection, and tests are complete. Tasks 6–7 must obey this progressive enablement.
