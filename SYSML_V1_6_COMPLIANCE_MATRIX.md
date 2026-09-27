# SysML v1.6 Compliance Matrix

Status values: IMPLEMENTED, PARTIAL, MISSING, BROKEN, NOT_APPLICABLE. “Implemented” means behavior has code and tests; a type declaration alone is not sufficient.

| ID | Area | Feature | Status | Evidence | Gap / action | Priority |
|---|---|---|---|---|---|---|
| ARC-001 | Architecture | Canonical semantic repository | IMPLEMENTED | `src/engine/sysml/model.ts:116-136` | Continue migration of UI writes | P0 |
| ARC-002 | Architecture | One source of truth at UI boundary | PARTIAL | `src/App.tsx:6140-6202` | Remove parallel React semantic arrays | P0 |
| ARC-003 | Architecture | Persistent IDs | IMPLEMENTED | `model.ts:8-26`; persistence tests | Add global collision diagnostics | P1 |
| ARC-004 | Ownership | Explicit semantic ownership | PARTIAL | `model.ts:8-24` | Normalize owner/type rules for all metaclasses | P1 |
| ARC-005 | Presentation | Reusable semantic elements across diagrams | PARTIAL | `sysmlCommandGateway.ts`; `diagramPresentations` | Promote presentations to typed repository entities | P1 |
| BDD-001 | BDD | Block definitions | IMPLEMENTED | `model.ts:19`; `bdd.ts`; BDD tests | Add specialized metaclasses | P1 |
| BDD-002 | BDD | Part/reference/value properties | PARTIAL | `PropertyDefinition.kind`; `PartUsage` | Split semantic property subtypes and feature ownership | P1 |
| BDD-003 | BDD | Operations/receptions/constraints as elements | MISSING | `BlockDefinition.operations/constraints` are strings | Add Operation, Parameter, Reception, Constraint | P1 |
| BDD-004 | BDD | Generalization and cycle validation | IMPLEMENTED | `SysmlRelationship`; `validation.ts`; tests | Add inherited feature resolution coverage | P1 |
| BDD-005 | BDD | Association/AssociationBlock | PARTIAL | relationship kind includes association; no AssociationBlock | Add association-end and association-block entities | P1 |
| PROP-001 | Properties | Structured multiplicity | IMPLEMENTED | `Multiplicity`; `parseMultiplicity` | Apply consistently to all new metaclasses | P2 |
| PROP-002 | Properties | Semantic default values | PARTIAL | `defaultValue?: string` | Add ValueSpecification union | P1 |
| VALUE-001 | Values | ValueType | PARTIAL | `ValueTypeDefinition` | Add QuantityKind and Unit entities | P1 |
| PORT-001 | Ports | Proxy/full distinction | PARTIAL | `PortDefinition.kind` | Add explicit FlowPort and InterfaceBlock semantics | P1 |
| PORT-002 | Ports | Conjugation/effective direction | PARTIAL | `isConjugated`, direction fields | Add recursive/nested effective-direction service | P1 |
| IBD-001 | IBD | Diagram context | IMPLEMENTED | `ModelDiagramDefinition.contextElementId` | Enforce context validation in all commands | P1 |
| IBD-002 | IBD | Semantic connectors | PARTIAL | `ConnectorUsage` | Replace port-only endpoints with ConnectorEnd/path | P1 |
| IBD-003 | IBD | Nested connector ends | MISSING | no endpoint path entity | Add resolved path and path validation | P1 |
| FLOW-001 | Flows | Independent ItemFlow/conveyed item | PARTIAL | `itemFlowId` only | Add ItemFlow entity and classifier references | P1 |
| REQ-001 | Requirements | Requirement ID distinct from UUID | IMPLEMENTED | `RequirementDefinition.requirementId` | Add uniqueness rule | P1 |
| REQ-002 | Requirements | Containment vs deriveReqt | IMPLEMENTED | relationship kinds and requirements tests | Add broader relationship endpoint matrix | P2 |
| REQ-003 | Requirements | Requirement specializations | PARTIAL | generic requirement + status metadata | Add typed extensions/TestCase/Rationale | P1 |
| REL-001 | Relationships | Distinct relationship kinds | IMPLEMENTED/PARTIAL | `SysmlRelationship.kind` | Separate endpoint schemas and direction rules | P1 |
| VAL-001 | Validation | Dangling endpoints/type checks | IMPLEMENTED | `validation.ts`, quarantine in persistence | Expand for new metaclasses | P1 |
| VAL-002 | Validation | Port compatibility | IMPLEMENTED/PARTIAL | `connectionPolicy.ts`, `ibd.ts` | Base checks on canonical InterfaceBlock flow features | P1 |
| PERSIST-001 | Persistence | Checksums/migration/chunking | IMPLEMENTED | `persistence.ts` | Add presentation entity migration | P2 |
| UX-001 | UX | Semantic model browser | PARTIAL | `unifiedModelExplorerProjection.ts` | Make browser repository-native, not adapter-native | P1 |
| TEST-001 | Testing | Semantic behavior tests | IMPLEMENTED/PARTIAL | `src/engine/sysml/*.test.ts`; 513 passing | Add missing metaclass and multi-diagram cases | P1 |

