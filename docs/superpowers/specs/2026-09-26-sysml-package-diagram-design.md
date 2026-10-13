# SysML v1.6 Package Diagram Design

**Date:** 2026-09-26  
**Status:** Approved  
**Scope:** First-class Package Diagram semantics, commands, persistence, projection, and Cameo-style interaction

## Objective

Add a dedicated Package Diagram to ADIA that organizes one canonical model through UML Package semantics reused by SysML v1.6. Every visible Package Diagram action must execute a repository command or return a stable diagnostic. No package, member, import, merge, dependency, or diagram symbol may exist only as frontend state.

## Normative and tooling authority

- Package Diagram usage in a SysML model is governed by `OMG_SYSML_1_6`, SysML v1.6 Clause 7, especially §§7.1–7.2, “Model Elements” and “Diagram Elements.”
- `Package`, `Model`, `PackageImport`, `ElementImport`, `PackageMerge`, `Dependency`, namespace visibility, aliases, and qualified naming originate from `UML_FOUNDATION`.
- Package folder notation, “Show Contents,” context-menu organization, relationship palette shortcuts, “Used By,” “Depends On,” and “Find in Diagrams” are `CAMEO_TOOLING` behaviors.
- ADIA transactions, diagnostics, undo records, migration adapters, compliance evidence files, and AI approval rules are `ADIA_EXTENSION` behaviors.
- Cameo behavior must not be reported as an OMG requirement unless the normative specification independently defines it.

Primary references:

- OMG SysML 1.6: <https://www.omg.org/spec/SysML/1.6/PDF>
- OMG UML foundation package semantics: <https://www.omg.org/spec/UML/ISO/19505-2/PDF>
- Cameo Package Diagram elements: <https://docs.nomagic.com/MT/2026x/magic-systems-of-systems-architect---cameo-enterprise-architecture/package-diagram-elements-272732696.html>
- Cameo dependency workflows: <https://docs.nomagic.com/MED/working-with-dependencies-243967630.html>

## Approved scope

The first release includes:

- a first-class `package` DiagramKind;
- semantic Model and nested Package ownership;
- display of existing packageable elements;
- Package Import with public `«import»` and private `«access»` notation;
- Element Import with visibility and optional alias;
- Package Merge;
- ordinary Dependency between legal packageable elements;
- package-content display, ownership movement, qualified names, and dependency/usage queries;
- complete repository, command, validation, undo, persistence, projection, UI, migration, and test support.

The first release excludes Profile creation/application and shared-project or external-library management. Disabled placeholders for these exclusions are not allowed. The domain boundaries must permit those capabilities to be added later without replacing Package, namespace, import, or presentation identity.

## Alternatives considered

### 1. Patch the BDD canvas with a package mode — rejected

This is the smallest UI change, but it would couple package semantics to BDD rendering and preserve local canvas mutation paths. It would not provide a reliable semantic foundation for imports, merges, namespace lookup, migration, or evidence.

### 2. First-class Package Diagram on the existing repository stack — selected

Extend the canonical SysML/UML repository, command gateway, capability policies, validators, normalized indexes, persistence schema, diagram projection, and thin React presentation. This preserves semantic identity and follows the repository-first migration already used by BDD, IBD, and Requirements diagrams.

### 3. Replace every diagram with a new generic framework first — rejected

A generalized diagram kernel could reduce future duplication, but replacing all diagram implementations would make this feature unnecessarily broad and risky. Shared primitives may be extracted only where Package Diagram needs them and existing behavior can remain stable.

## Semantic model

The repository is authoritative for semantic identity, metaclass, name, visibility, ownership, imports, merges, dependencies, and namespace lookup.

```text
Model
└── Package
    ├── Package
    ├── Block
    ├── Requirement
    ├── TestCase
    ├── ValueType
    ├── UseCase
    ├── other legal PackageableElements
    └── Diagram(kind = package)

PackageImport
├── importingNamespaceId
├── importedPackageId
└── visibility = public | private

ElementImport
├── importingNamespaceId
├── importedElementId
├── visibility = public | private
└── alias?

PackageMerge
├── mergingPackageId
└── mergedPackageId
```

Containment is represented once through `ownerId`. It is not duplicated as a semantic relationship. Package Diagram visual nesting is a presentation choice and never changes ownership by itself.

`PackageImport` uses `public` visibility for `«import»` and `private` visibility for `«access»`. Access is not a separate metaclass. `ElementImport` references one existing packageable element and may define an alias without renaming the imported element. `PackageMerge` references existing packages and does not copy or reparent their members.

Derived repository queries calculate qualified names, owned members, imported members, visible members, merge closure, dependencies, usages, and presentation locations. React components must not recreate namespace semantics.

## Diagram and presentation model

`DiagramKind` gains `package`. A Package Diagram is a semantic `Diagram` owned by a Model or Package. Its stable repository ID is the active diagram context; the literal string `package` is never used as a substitute diagram identity.

A diagram presentation stores only:

- presentation ID;
- diagram ID;
- referenced semantic element or relationship ID;
- bounds, z-order, routing, style, pin state, and visible compartments.

Package symbols may be collapsed or expanded and may show selected owned members. Multiple symbols on multiple diagrams may reference one Package. Rename and ownership changes are resolved from the repository without rewriting or duplicating semantic elements.

## Commands and transaction boundaries

All Package Diagram mutations use the common command gateway:

```text
Tree / Palette / Canvas
        ↓
Application command
        ↓
Capability and ownership policy
        ↓
Semantic validator
        ↓
Atomic repository transaction
        ↓
Persistence and indexes
        ↓
Diagram projection
        ↓
React presentation
```

The feature requires explicit commands for:

- creating a Package Diagram;
- creating a Package in the repository;
- atomically creating and presenting a Package;
- displaying an existing packageable element;
- showing or hiding package contents as presentations;
- creating Package Import, Element Import, Package Merge, and Dependency;
- changing Package Import or Element Import visibility;
- moving an element to a new semantic owner;
- removing a presentation;
- deleting a semantic element after impact analysis.

Canvas creation atomically creates one semantic element and one presentation, or neither. Tree creation creates one semantic element only. “Add to Diagram” creates only a presentation. “Show Contents” queries existing owned elements and creates missing presentations only. A semantic move is a separate command requiring ownership and cycle validation.

Undo and redo operate on committed transactions and preserve semantic and presentation IDs. Imports, merges, scripts, migration adapters, and AI agents use the same gateway and receive no privileged creation path.

## Validation and diagnostics

Repository-level validation runs independently of React and enforces:

- a Package cannot own itself;
- containment cannot form a cycle;
- Package Merge endpoints are Packages and cannot be identical;
- circular merge chains are diagnosed;
- Package Import targets a Package and begins at a supported Namespace;
- Element Import targets an existing PackageableElement and begins at a supported Namespace;
- import and merge commands never change semantic ownership;
- equivalent duplicate imports and merges are diagnosed;
- imported names participate in namespace ambiguity diagnostics;
- a semantic relationship can exist without a presentation;
- a presentation cannot exist without its semantic subject;
- a relationship presentation requires displayed valid endpoints;
- unsupported metaclasses are rejected for Package Diagrams;
- missing semantic references are never synthesized.

Stable diagnostics include:

- `ELEMENT_NOT_FOUND`
- `TYPE_NOT_FOUND`
- `INVALID_DIAGRAM_ELEMENT`
- `PACKAGE_IMPORT_TARGET_NOT_PACKAGE`
- `PACKAGE_MERGE_ENDPOINT_NOT_PACKAGE`
- `ELEMENT_IMPORT_TARGET_NOT_PACKAGEABLE`
- `SELF_OWNERSHIP_CYCLE`
- `OWNERSHIP_CYCLE`
- `PACKAGE_MERGE_CYCLE`
- `DUPLICATE_IMPORT`
- `DUPLICATE_PACKAGE_MERGE`
- `AMBIGUOUS_IMPORTED_NAME`

Rejected commands leave repository, indexes, history, and presentation state unchanged.

## Repository queries

The backend provides focused query services equivalent to:

- `getOwnedPackageableElements(packageId)`;
- `getImportedMembers(namespaceId)`;
- `getVisibleMembers(namespaceId)`;
- `getPackageDependencies(packageId, recursive)`;
- `getElementUsages(elementId)`;
- `getQualifiedName(elementId)`;
- `getPresentationsForElement(elementId)`;
- `getPackageMergeClosure(packageId)`.

These queries support Show Contents, Used By, Depends On, qualified-name display, dependency analysis, reporting, and future external-library integration.

## Cameo-style user interaction

The Model Explorer offers `Create Diagram > Package Diagram` for a Model or Package. The created diagram appears as a repository-owned tree item and opens by its semantic diagram ID.

The Package Diagram palette exposes only implemented actions:

- Package;
- Model;
- Dependency;
- Package Import;
- Access;
- Element Import;
- Package Merge;
- Comment;
- Constraint;
- Rationale.

Access is a tooling shortcut for private Package Import. Profile controls are absent from this release.

A Package symbol supports standard folder-tab notation, semantic name, optional qualified name, movement, resize, collapsed or expanded contents, selected content compartments, multiple presentations, and presentation-specific display settings.

Package context menus support:

- Open Specification;
- Rename;
- Add to Diagram;
- Remove from Diagram;
- Show Contents;
- Hide Contents;
- Select Contents;
- Create Owned Element;
- Create Package Diagram;
- Move to Package;
- Used By;
- Depends On;
- Find in Diagrams;
- Delete from Model.

Show Contents supports direct contents, packages only, packageable elements, and recursive contents. It never creates semantic elements. Dropping a symbol visually inside a Package does not reparent it; `Move to Package` performs a semantic transaction after impact analysis.

Relationship tools validate endpoints before committing. Invalid endpoints display a diagnostic and create neither semantic relationship nor line. Removing a relationship from one diagram removes only its presentation. Deleting it from the model removes the semantic relationship and every presentation after impact confirmation.

The properties panel separates semantic and presentation data. Semantic fields include name, owner, qualified name, visibility, imports, merges, and owned-member count. Presentation fields include coordinates, size, z-order, routing, and visible compartments.

## Persistence and migration

The versioned project schema persists Package Diagrams, package relationships, relationship visibility and aliases, semantic ownership, and all presentation data. Save/load round trips preserve semantic IDs, relationship IDs, diagram IDs, ownership, and presentation references.

Migration from earlier projects:

- preserves existing Package identities and ownership;
- preserves Package presentations on BDD and Requirements diagrams;
- does not convert those presentations into Package Diagrams;
- creates no Package, import, merge, dependency, or type silently;
- rebuilds derived indexes and qualified names;
- reports unresolved references with stable diagnostics.

## Deletion and hierarchy behavior

`Remove from Diagram` and `Delete from Model` remain separate operations.

- Removing a Package symbol preserves the Package, its contents, relationships, and other presentations.
- Deleting a Package from the model calculates owned descendants, imports, merges, dependencies, typed references, and affected diagrams.
- Material deletion requires confirmation and executes transactionally.
- Undo restores semantic and presentation identities.
- Moving a Package or member validates legal ownership and containment cycles, then refreshes qualified names and affected namespace queries.

## Four-level compliance evidence

Every compliance definition declares authority and contains evidence for:

1. **Element:** the semantic entity exists;
2. **Properties:** normative properties are represented correctly;
3. **Relationships:** legal endpoint, direction, and ownership semantics work;
4. **Constraints:** invalid configurations are rejected or diagnosed.

Example evidence record:

```text
SYSML-PKG-IMPORT-001
Feature: Public Package Import
Authority: UML_FOUNDATION
SysML usage: OMG_SYSML_1_6
Tool interaction: CAMEO_TOOLING
Domain: PackageImport
Command: CreatePackageImport
Validator: PackageImportEndpointRule
Persistence: packageImports mapping
Projection: PackageDiagramProjection
Automated test: package-import.semantic.test.ts
Element: PASS
Properties: PASS
Relationships: PASS
Constraints: PASS
Overall: COMPLIANT
```

No capability receives `COMPLIANT` status without automated semantic evidence. A rendered control or passing screenshot is insufficient.

## Verification and release gates

### Semantic identity

Create Package `CommonTypes`; display it on two Package Diagrams and one BDD; rename it to `SharedTypes`. The repository must contain one Package and three presentations, all resolving `SharedTypes`.

### Show Contents

Create Package `VehicleArchitecture`, owned Block `Vehicle`, and owned Requirement `REQ-001`; show direct contents. No semantic counts or ownership change. Undo removes only the added presentations.

### Public and private imports

Create `Consumer «import» PublicTypes` and `Consumer «access» InternalTypes`. The repository contains two PackageImport entities with public and private visibility; namespace queries and notation honor that visibility.

### Element Import

Create ValueType `Mass` in `PublicTypes` and import it into `Consumer`. The repository contains one `Mass`; its owner remains `PublicTypes`; `Consumer` resolves it through the import.

### Package Merge

Create `Extension «merge» Base`. The repository contains one directed merge; merge closure is queryable; no member is copied or reparented.

### Invalid operations

Package Import targeting a Block, self-merge, merge cycle, containment cycle, unsupported symbol, missing endpoint, and AI request for an unknown type must fail atomically with the expected diagnostic.

### Tree and canvas parity

Tree and palette creation use the same factory, ownership policy, validators, persistence, indexes, projection, rename, delete, copy/paste, and undo systems. The only intended difference is whether a presentation is included in the creation transaction.

### Delete behavior

Removing a Package presentation preserves the model. Model deletion reports complete impact, removes affected semantic and presentation records only after confirmation, and can be undone with stable identities.

### Scale

A Package Diagram with 500 Packages, 2,000 packageable elements, and 1,000 dependencies must meet the repository’s existing large-model performance thresholds through normalized indexes, projection caching, and viewport culling.

### Regression

BDD, IBD, Requirements, RTM, semantic identity, deletion, code-generation isolation, architecture, and compliance release gates remain green.

## Definition of done

The feature is complete only when:

- Package Diagram is a first-class semantic diagram kind;
- every enabled UI action reaches a backend command and persisted repository effect;
- semantic validation passes independently of the UI;
- undo/redo, save/load, migration, projection, reporting, and deletion behavior are tested;
- tree and canvas end-to-end workflows pass;
- identity and rename propagation gates pass;
- compliance evidence identifies authority, specification section, domain type, command, validator, persistence mapping, projection, and automated test;
- unsupported future features are absent or visibly disabled with a reason;
- no silent semantic creation exists in UI, imports, migration, scripts, or AI workflows.
