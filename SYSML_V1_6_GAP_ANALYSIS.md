# SysML v1.6 Gap Analysis

## Executive summary

Status: **PARTIAL / NOT RELEASE-COMPLIANT**. ADIA has a serious semantic foundation and extensive tests, but the supplied definition of done is not met because the application still exposes and mutates legacy diagram-shaped state alongside the canonical repository.

## Critical gaps

1. **Two active models (P0).** `src/App.tsx` owns `blocks`, `parts`, `connectors`, and `relationships` arrays while also owning `sysmlStore`/`canonicalSysmlRepository`. This violates the single authoritative repository rule and leaves merge ordering and stale projection behavior as correctness risks.
2. **Presentation persistence is not a first-class repository collection (P1).** `SysmlRepository` has `diagrams`, but presentation coordinates and membership are carried through gateway state/serialized side channels rather than typed semantic `DiagramPresentation` entities.
3. **Feature metamodel is compressed (P1).** `BlockDefinition.operations` and `constraints` are strings; `PropertyDefinition` combines value/part/reference/flow kinds; `InterfaceDefinition` is the only interface-like definition. Operations, constraints, FlowProperty, ConstraintProperty, Signal, Enumeration, DataType, QuantityKind, Unit, AssociationBlock, and property-specific types are not represented as distinct semantic elements.
4. **Connector endpoints are usage IDs, not general nested connector ends (P1).** `ConnectorUsage` has `sourcePortId`/`targetPortId`; nested path semantics and arbitrary legal connectable properties are not modeled as explicit endpoint/path objects.
5. **Item flow is incomplete (P1).** `itemFlowId` exists, but the repository has no `ItemFlow`/conveyed-item collection; legacy connectors also keep `itemFlow` as display text.
6. **Requirement specialization is under-modeled (P1).** Requirements and relationships exist, but extended requirement property families and explicit TestCase/Rationale/Comment semantic types are not all first-class SysML elements.

## Area summary

| Area | Status | Evidence |
|---|---|---|
| Repository identity/ownership | PARTIAL | `model.ts:8-26`, `model.ts:116-136` |
| Definition vs usage | IMPLEMENTED/PARTIAL | `model.ts:17-24`; legacy `sysml_types.ts:32-105` remains active |
| BDD | PARTIAL | `engine/sysml/bdd.ts`; compressed feature types |
| IBD | PARTIAL | `engine/sysml/ibd.ts`; endpoint model is port-ID specific |
| Ports/flows | PARTIAL | `model.ts:18`, no explicit FlowProperty/FlowPort/InterfaceBlock metaclasses |
| Requirements/traceability | IMPLEMENTED/PARTIAL | `model.ts:26-39`, `requirements.ts`, `rtm.ts` |
| Validation | IMPLEMENTED/PARTIAL | `validation.ts`; missing metaclass-specific rules |
| Persistence | IMPLEMENTED | `persistence.ts` checksum, migration, chunk transactions |
| Model browser | IMPLEMENTED/PARTIAL | `unifiedModelExplorerProjection.ts`; projections still bridge legacy state |
| Presentation separation | PARTIAL | gateway coordinates/presentation state; no repository presentation entity |
| Tests | IMPLEMENTED for current scope | 52 files / 513 tests passed |

## Recommended migration

Make the canonical repository the only mutation target, introduce typed feature/endpoint/presentation entities, then delete legacy merge paths after migration and compatibility tests prove parity.

