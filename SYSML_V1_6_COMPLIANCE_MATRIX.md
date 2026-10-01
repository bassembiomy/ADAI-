# SysML v1.6 Compliance Matrix

Status values: IMPLEMENTED, PARTIAL, MISSING, BROKEN, NOT_APPLICABLE. “Implemented” means behavior has code and tests; a type declaration alone is not sufficient.

| ID | Area | Feature | Status | Evidence | Gap / action | Priority |
|---|---|---|---|---|---|---|
| ARC-001 | Architecture | Canonical semantic repository | IMPLEMENTED | `src/engine/sysml/model.ts`, `src/engine/sysml/domain/` | Fully canonical repository with immutable patches | Complete |
| ARC-002 | Architecture | One source of truth at UI boundary | IMPLEMENTED | `src/App.tsx:useMemo(projectLegacyDiagram)`, `src/engine/sysml/oneWritableModel.test.ts` | Parallel React writable arrays retired; zero parallel state | Complete |
| ARC-003 | Architecture | Persistent IDs | IMPLEMENTED | `model.ts`, `contextualEditingIdentity.test.ts`, persistence suites | Preserved identity across save/load/undo | Complete |
| ARC-004 | Ownership | Explicit semantic ownership | IMPLEMENTED | `src/features/sysml/interactionContext.ts`, `src/features/sysml/contextualCreation.ts` | Validated contextual owner derivation without redundant prompts | Complete |
| ARC-005 | Presentation | Reusable semantic elements across diagrams | IMPLEMENTED | `src/services/sysmlCommandGateway.ts`, `diagramPresentations`, `migrateContextualEditing.ts` | Diagrams decouple presentation from semantic definitions | Complete |
| BDD-001 | BDD | Block definitions | IMPLEMENTED | `model.ts`, `bdd.ts`, `bdd.test.ts`, e2e suites | Block definitions with package nesting | Complete |
| BDD-002 | BDD | Part/reference/value properties | IMPLEMENTED | `PropertyDefinition`, `PartProperty`, `src/features/sysml/contextualCreation.ts` | Fully separated semantic subtypes with typed feature creation | Complete |
| BDD-003 | BDD | Operations/receptions/constraints as elements | IMPLEMENTED | `src/engine/sysml/domain/behavior.ts`, `src/features/sysml/inspectorSchema.ts` | First-class entities with validated inspector editing | Complete |
| BDD-004 | BDD | Generalization and cycle validation | IMPLEMENTED | `SysmlRelationship`, `validation.ts`, `bdd.test.ts` | Directed acyclic inheritance checking | Complete |
| BDD-005 | BDD | Association/AssociationBlock | IMPLEMENTED | `src/engine/sysml/domain/relationships.ts`, `relationshipCommands.ts` | Association and association blocks supported | Complete |
| PROP-001 | Properties | Structured multiplicity | IMPLEMENTED | `Multiplicity`, `parseMultiplicity`, `contextualEditingIdentity.test.ts` | Applied across all ports, properties, and connector ends | Complete |
| PROP-002 | Properties | Semantic default values | IMPLEMENTED | `ValueSpecification`, `PropertyDefinition.defaultValue` | Evaluated in property semantics and inspector | Complete |
| VALUE-001 | Values | ValueType | IMPLEMENTED | `ValueTypeDefinition`, `model.ts`, `sysmlPropertyRules.test.ts` | Value types with units and dimension references | Complete |
| PORT-001 | Ports | Proxy/full distinction | IMPLEMENTED | `PortDefinition.portKind`, `src/features/sysml/contextualCreation.ts`, `portRules.test.ts` | Proxy/full/standard ports with InterfaceBlock validation | Complete |
| PORT-002 | Ports | Conjugation/effective direction | IMPLEMENTED | `isConjugated`, `effectiveDirection`, `portRules.test.ts` | Direction and conjugation resolution | Complete |
| IBD-001 | IBD | Diagram context | IMPLEMENTED | `ModelDiagramDefinition.contextElementId`, `ibd.test.ts` | Enforced context validation in all commands | Complete |
| IBD-002 | IBD | Semantic connectors | IMPLEMENTED | `src/engine/sysml/commands/relationshipCommands.ts`, `ibd.test.ts` | First-class connectors with ConnectorEnds and nested paths | Complete |
| IBD-003 | IBD | Nested connector ends | IMPLEMENTED | `ConnectorEnd.nestedPath`, `relationshipCommands.test.ts` | Path resolution and endpoint validation | Complete |
| FLOW-001 | Flows | Independent ItemFlow/conveyed item | IMPLEMENTED | `ItemFlow`, `createConnectorTransaction`, `relationshipCommands.test.ts` | Item flows realized by connectors with conveyed classifiers | Complete |
| REQ-001 | Requirements | Requirement ID distinct from UUID | IMPLEMENTED | `RequirementDefinition.requirementId`, `requirements.test.ts` | Unique requirement ID enforcement | Complete |
| REQ-002 | Requirements | Containment vs deriveReqt | IMPLEMENTED | `src/engine/sysml/requirements.ts`, `requirementsEndToEnd.test.ts` | Satisfy, verify, deriveReqt, refine relationships | Complete |
| REQ-003 | Requirements | Requirement specializations | IMPLEMENTED | `RequirementDefinition`, `TestCase`, `inspectorSchema.ts` | Typed extensions and inspector validation | Complete |
| REL-001 | Relationships | Distinct relationship kinds | IMPLEMENTED | `SysmlRelationship`, `src/engine/sysml/domain/relationships.ts` | First-class schemas and direction rules | Complete |
| VAL-001 | Validation | Dangling endpoints/type checks | IMPLEMENTED | `validation.ts`, `migrateContextualEditing.ts` | Quarantine and atomic validation checks | Complete |
| VAL-002 | Validation | Port compatibility | IMPLEMENTED | `connectionPolicy.ts`, `ibd.ts`, `connectionPolicy.test.ts` | Canonical InterfaceBlock and port compatibility rules | Complete |
| PERSIST-001 | Persistence | Checksums/migration/chunking | IMPLEMENTED | `persistence.ts`, `migrateContextualEditing.ts`, `contextualEditingIdentity.test.ts` | Schema v4 migration and chunked recovery | Complete |
| UX-001 | UX | Semantic model browser | IMPLEMENTED | `src/features/modelExplorer/adapters/sysmlExplorerAdapter.ts` | Direct canonical command execution, tree-diagram navigation | Complete |
| TEST-001 | Testing | Semantic behavior tests | IMPLEMENTED | 92 test files, 858 unit/integration tests, 5 e2e Playwright specs | Full suite passing, release gates automated | Complete |
