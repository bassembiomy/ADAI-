# ADIA SysML Module Bible

**Purpose:** normative design reference for the ADIA SysML BDD, IBD, Requirements, traceability, persistence, validation, and deletion modules.

**Profile target:** `OMG-SysML-1.6-ADIA` (SysML 1.6 / ISO/IEC 19514:2017 semantics, with explicitly documented ADIA extensions). SysML v2 equivalence is out of scope unless a separate versioned adapter is added.

## 1. Executive architecture decision

ADIA has two representations today:

| Representation | Authority | Main locations | Allowed responsibility |
|---|---|---|---|
| Canonical normalized SysML repository | Authoritative | `src/engine/sysml/model.ts`, `normalizedStore.ts`, `sysmlWorker.ts`, `sysmlCommandGateway.ts` | Identity, semantics, validation, persistence, mutation, evidence, and release gates |
| Legacy diagram projection/state | Non-authoritative adapter | `src/App.tsx`, `src/types/sysml_types.ts`, legacy BDD/IBD render paths | Interaction compatibility and visual projection only; never defines semantics |

The production rule is **one semantic decision, many projections**. New behavior must enter through the canonical repository or a typed adapter. Direct array filtering in UI code is permitted only for temporary view state and must not create, mutate, or delete model elements.

## 2. Domain vocabulary

### 2.1 Definitions versus usages

| Concept | Canonical type | Meaning | Lifetime |
|---|---|---|---|
| Block definition | `BlockDefinition` | Classifier/type with properties, ports, operations, constraints, supertypes | Independent model element |
| Part usage | `PartUsage` | Named occurrence/property typed by a block definition | Owned by its `ownerId`; lifetime depends on aggregation |
| Port definition | `PortDefinition` | Interaction point declared by a block definition | Inherited by specialized blocks |
| Port usage | `PortUsage` | Port occurrence owned by a part or block usage | Deleted with its owner |
| Value type | `ValueTypeDefinition` | Unit/dimension-bearing scalar classifier | Independent model element |
| Interface | `InterfaceDefinition` | Feature contract used by ports | Independent model element |
| Requirement | `RequirementDefinition` | Governed statement with identity, text, lifecycle, and evidence | Independent model element; containment is explicit |

Never infer a part usage from a block definition merely because `typeId` matches. Definition deletion can invalidate usages; only explicit composite ownership creates a deletion cascade.

### 2.2 Relationship families

| Family | Kinds | Source/target rule | Diagram |
|---|---|---|---|
| Classifier structure | `generalization`, `association`, `sharedAggregation`, `composition`, `dependency`, `allocation` | Definition-to-definition or definition-to-usage according to kind | BDD |
| Internal structure | `assembly`, `delegation`, `binding`, `itemFlow` connector usages | Port usages within one owning context | IBD |
| Requirements | `requirementContainment`, `deriveReqt`, `satisfy`, `verify`, `refine`, `trace`, `copy` | Governed typed links with direction and lifecycle rules | Requirement/RTM |

Generic `association` is not a substitute for `composition`, and a connector is not a relationship edge. They have different endpoint and deletion semantics.

## 3. Inheritance policy

Generalization is directed from specific classifier to general classifier. A specialized block inherits the applicable features of all reachable supertypes; it does not copy them into independent definitions. The inheritance resolver must:

1. Reject missing supertypes and cycles.
2. Reject specialization of an `isLeaf` block.
3. Preserve deterministic linearization for multiple inheritance.
4. Detect collisions by stable feature identity, name, and type.
5. Require explicit `redefinesId` or `subsetsId` for intentional overrides.
6. Prevent edits to inherited features through the child editor unless the edit is expressed as a redefinition.
7. Surface an inherited-feature origin path (`Child :: Parent :: Feature`) in properties and reports.

`isAbstract` blocks may be used as types but may not be instantiated as concrete part usages unless the user explicitly selects a specialization. `isLeaf` means no further generalization, not “cannot contain parts.”

### Inheritance decision matrix

| Operation | Allowed | Validation | User result | Delete impact |
|---|---:|---|---|---|
| Add child → parent generalization | Yes | Both are block definitions; no cycle; parent not leaf | Hollow-triangle BDD edge | None |
| Generalize from a part usage | No | Endpoint kind error | Explain “definitions only” | None |
| Specialize a leaf block | No | `LEAF_SPECIALIZATION` | Blocked with diagnostic | None |
| Instantiate abstract block | Conditional | Require concrete subtype selection | Choice dialog or blocked create | No cascade |
| Edit inherited property in child | No direct mutation | Require redefine/subset command | Create explicit override | Depends on new feature |
| Delete parent definition | Conditional | Analyze child definitions and typed usages | Impact preview; no silent child deletion | Children remain or explicit migration/delete |
| Delete child definition | Yes with impact | Remove generalization and inherited resolution | Confirm if usages/evidence affected | Usages become unresolved, not owned children |

## 4. BDD policy

BDD is the classifier and type system view. It owns definitions, generalizations, associations, dependency/allocation, value types, ports, and property declarations. It does not own a runtime connection between two port usages.

Creation and update commands must validate:

- qualified-name uniqueness;
- valid stereotype/kind;
- type existence;
- multiplicity syntax and `lower <= upper`;
- unit/dimension compatibility for value properties;
- composition ownership and one composite owner per part usage;
- relationship endpoint legality;
- abstract/leaf rules;
- property redefinition/subsetting constraints.

## 5. IBD policy

IBD is the internal structure of one context block. A part usage is typed by a block definition; a port usage references a port definition; a connector joins compatible port usages in the same context or crosses a boundary through delegation.

| Connector kind | Endpoints | Meaning | Deletion behavior |
|---|---|---|---|
| Assembly | Port usage ↔ port usage | Internal interaction between peer parts | Deleted if either endpoint or owner is deleted |
| Delegation | Boundary port ↔ nested port | Exposes or delegates a context interaction | Deleted if either endpoint or owner is deleted |
| Binding | Value/flow-compatible features | Equality/equivalence constraint | Deleted if either endpoint is deleted; revalidated on type change |
| Item flow | Connector annotation/typed conveyed item | Flow of an item classifier/property | Item flow is removed with connector, not with the classifier |

Port compatibility is directional: `in` accepts a source `out`/`inout`, `out` provides to a target `in`/`inout`, and `inout` is compatible only when the type and interface contract permit bidirectional use. Conjugation and interface feature compatibility must be explicit in the canonical model; legacy ports without those fields receive a migration diagnostic.

## 6. Requirements and traceability

Requirements are governed model elements, not decorative blocks. Status transitions are `draft → approved → implemented → verified`, with `failed`, `stale`, and `retired` as explicit states. `verified` requires a passed, current `VerificationEvidence` tied to a `VerificationCase`; manually setting the label cannot bypass evidence.

RTM is many-to-many and must expose direction, relationship kind, suspect state, baseline, owner, evidence, and impacted artifacts. Every cell must be navigable in both directions. Unsupported or unresolved imported links remain visible and cannot be silently downgraded to generic traceability.

## 7. Deletion and undo policy

Deletion is a transaction with preview, policy, confirmation, apply, validation, audit, and inverse patch. The closure is:

1. Explicit requested IDs.
2. Nested requirement descendants for requirement containment.
3. Composite part usages owned by deleted owners.
4. Ports owned by deleted definitions/usages.
5. Connectors whose owner or endpoints are deleted.
6. Relationships whose ID or endpoint is deleted.
7. Evidence invalidated by deleted requirements, verification cases, or affected requirements.

Shared aggregation, reference properties, association peers, and usages merely typed by a deleted definition are **impacts**, not automatic cascade children. They must be shown as unresolved and require an explicit resolution command.

### Deletion decision matrix

| Target | Default action | Confirmation | Cascade | Required postcondition |
|---|---|---:|---|---|
| Diagram presentation only | Remove presentation | No | None | Semantic element remains discoverable |
| Relationship | Remove relationship | No | None | Endpoints remain; indexes revalidate |
| Connector | Remove connector | No | Its item flow annotation | No dangling port references |
| Port usage/definition | Remove port | Yes if connectors exist | Connectors using it | No connector has missing endpoint |
| Composite part usage | Remove usage | Yes if nested content/evidence exists | Composite descendants, owned ports/connectors | No orphan owned usage |
| Shared/reference part usage | Remove usage | Yes if trace/evidence exists | Its connectors only | Shared peers remain |
| Block definition | Block if concrete usages exist | Yes | Relationships and owned declared features | Typed usages become explicit unresolved impacts |
| Requirement | Remove containment subtree | Yes unless leaf/unreferenced | Descendant requirements, affected evidence/links | No invalid RTM cells; audit record exists |
| Protected baseline | Reject | N/A | None | Explain baseline protection and required clone |

## 8. Cameo and Papyrus reference decisions

| Reference behavior | Evidence | ADIA decision |
|---|---|---|
| Inheritance is a classifier hierarchy, not copied text | Cameo inheritance documentation describes generalization as classifier subsumption and exposes an inheritance tree | Adopt: canonical supertypes plus resolved inherited view |
| BDD and IBD have different jobs | Papyrus documents BDD as relationships among blocks and IBD as properties/connectors inside a block | Adopt: separate endpoint validators and editors |
| Ports are interaction points and connectors are edges between ports | Papyrus SysML tutorial explicitly distinguishes ports and connectors in IBD | Adopt: first-class `PortUsage` and `ConnectorUsage` |
| Relation maps support structural/requirement decomposition and analysis | Cameo relation-map documentation describes structure, requirement containment, and derivation maps | Adapt: RTM and diagnostics should expose navigable impact/decomposition maps |
| Tool persistence separates semantic model from notation metadata | Papyrus project structure separates UML model, notation, and diagram metadata | Adopt: preserve canonical semantics separately from coordinates/presentations |

Sources: [Cameo Systems Modeler documentation](https://docs.nomagic.com/display/CSM2021xR1/Cameo%2BSystems%2BModeler%2BDocumentation), [Cameo generalization](https://docs.nomagic.com/spaces/CCMP190SP1/pages/36332714/Generalization), [Cameo relation maps](https://docs.nomagic.com/MT/2026x/magic-cyber-systems-engineer---cameo-systems-modeler/predefined-relation-maps-272732373.html), [Papyrus SysML user tutorial](https://eclipse.dev/papyrus/components/sysml/0.10.0/user/tuto1-createsysmlproject.html), [Papyrus SysML diagram modules](https://eclipse.dev/papyrus/components/sysml/0.8.1/org.eclipse.papyrus.sysml14.diagram/).

## 9. Production release gates

Mass production requires all of the following:

- canonical mutation gateway coverage for create, edit, connect, delete, import, save, and undo/redo;
- zero structural validation errors on representative and generated large models;
- deterministic schema migration and loss report for legacy projections;
- 10k+ element benchmark with bounded render/validation latency;
- deletion preview and inverse patch evidence for every cascade class;
- BDD/IBD/Requirements/RTM browser tests with no console errors;
- export/import round trip with stable IDs and explicit loss diagnostics;
- requirement verification evidence and protected-baseline policy;
- audit trail entries for all semantic changes;
- release manifest that distinguishes `supported`, `partial`, `imported-only`, and `unsupported`.

## 10. Current gap summary

The canonical engine already contains the key types (`BlockDefinition`, `PartUsage`, `PortDefinition`, `PortUsage`, `ConnectorUsage`, governed requirements, evidence, baselines, audit trail), inheritance-cycle checks, composition-aware deletion, and conformance evidence. The remaining production risk is integration: duplicated legacy mutation paths in `App.tsx`, incomplete UI parity for typed semantics, and the need to make unresolved definition usages and deletion impacts explicit in the user workflow. The implementation plan addresses those gaps in release-safe increments.
