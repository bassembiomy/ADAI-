# ADIA SysML Profile Conformance Matrix

Profile: `OMG-SysML-1.6-ADIA`  
Normative baseline: OMG SysML 1.6 / ISO/IEC 19514:2017  
SysML v2 semantic equivalence: unsupported; requires a separate versioned adapter.

`partial` means the concept has canonical semantics and tests but its complete create/edit/render/persist/delete/trace workflow is not yet release-qualified. `supported` is reserved for capabilities whose entire application lifecycle is proven by the release gate. This matrix intentionally does not claim conformance from notation alone.

| ID | Capability | Status | Implementation evidence | Automated evidence | Remaining limitation |
|---|---|---|---|---|---|
| SYSML-001 | BDD BlockDefinition | supported | `model.ts`, `bdd.ts`, `sysmlCommandGateway.ts` | `bdd.test.ts`, `sysmlConformance.test.ts`, `sysml-bdd-ibd-requirements-rtm.spec.ts`, `persistence.test.ts` | None; fully qualified. |
| SYSML-002 | BDD ValueType/unit/dimension | supported | `model.ts`, `bdd.ts`, `BlockPropertiesEditor.tsx` | `model.test.ts`, `bdd.test.ts`, `BlockPropertiesEditor.test.tsx`, `sysmlPropertyRules.test.ts`, `sysml-bdd-ibd-requirements-rtm.spec.ts`, `persistence.test.ts` | None; fully qualified. |
| SYSML-003 | BDD part property | supported | `model.ts`, `bdd.ts`, `BlockFeatureEditor.tsx` | `bdd.test.ts`, `BlockFeatureEditor.test.tsx`, `sysmlCommandGateway.test.ts`, `sysml-bdd-ibd-requirements-rtm.spec.ts`, `normalizedStore.test.ts` | None; fully qualified. |
| SYSML-004 | BDD reference property | supported | `model.ts`, `bdd.ts`, `BlockFeatureEditor.tsx`, `reportDiagrams.ts` | `bdd.test.ts`, `BlockFeatureEditor.test.tsx`, `reportDiagrams.sysml.test.ts`, `sysml-bdd-ibd-requirements-rtm.spec.ts`, `reportSnapshotAdapter.test.ts` | None; fully qualified. |
| SYSML-005 | BDD flow property | supported | `model.ts`, `bdd.ts`, `BlockFeatureEditor.tsx` | `bdd.test.ts`, `BlockFeatureEditor.test.tsx`, `sysmlCommandGateway.test.ts`, `sysml-bdd-ibd-requirements-rtm.spec.ts`, `normalizedStore.test.ts` | None; fully qualified. |
| SYSML-006 | BDD ports | supported | `model.ts`, `bdd.ts`, `BlockFeatureEditor.tsx` | `bdd.test.ts`, `ibd.test.ts`, `BlockFeatureEditor.test.tsx`, `sysmlCommandGateway.test.ts`, `sysml-bdd-ibd-requirements-rtm.spec.ts`, `normalizedStore.test.ts` | None; fully qualified. |
| SYSML-007 | BDD composition | supported | `bdd.ts`, `mutations.ts`, `sysmlTransactionAdapter.ts`, `RelationshipEndEditor.tsx`, `connectionPolicy.ts` | `mutations.test.ts`, `sysmlTransactionAdapter.test.ts`, `sysml-deletion-lifecycle.spec.ts`, `patches.test.ts`, `connectionPolicy.test.ts`, `sysml-connection-policy.spec.ts` | None; fully qualified. |
| SYSML-008 | BDD shared aggregation | supported | `bdd.ts`, `mutations.ts`, `RelationshipEndEditor.tsx` | `bdd.test.ts`, `mutations.test.ts`, `RelationshipEndEditor.test.tsx`, `sysmlCommandGateway.test.ts`, `sysml-bdd-ibd-requirements-rtm.spec.ts`, `normalizedStore.test.ts` | None; fully qualified. |
| SYSML-009 | BDD association | supported | `bdd.ts`, `RelationshipEndEditor.tsx` | `bdd.test.ts`, `RelationshipEndEditor.test.tsx`, `sysmlCreationRules.test.ts`, `sysml-bdd-ibd-requirements-rtm.spec.ts`, `normalizedStore.test.ts` | None; fully qualified. |
| SYSML-010 | BDD generalization | supported | `bdd.ts`, `validation.ts` | `bdd.test.ts`, `validation.test.ts`, `sysmlConformance.test.ts`, `sysml-bdd-ibd-requirements-rtm.spec.ts`, `persistence.test.ts` | None; fully qualified. |
| SYSML-011 | BDD dependency | supported | `bdd.ts`, `RelationshipEndEditor.tsx` | `bdd.test.ts`, `sysmlCreationRules.test.ts`, `sysml-bdd-ibd-requirements-rtm.spec.ts`, `persistence.test.ts` | None; fully qualified. |
| SYSML-012 | BDD allocation | supported | `bdd.ts`, `RelationshipEndEditor.tsx` | `bdd.test.ts`, `opmAdapter.test.ts`, `sysmlConformance.test.ts`, `sysml-bdd-ibd-requirements-rtm.spec.ts`, `persistence.test.ts` | None; fully qualified. |
| SYSML-013 | IBD PartUsage | supported | `model.ts`, `ibd.ts`, `sysmlCommandGateway.ts` | `ibd.test.ts`, `sysmlTransactionAdapter.test.ts`, `sysml-bdd-ibd-requirements-rtm.spec.ts`, `normalizedStore.test.ts` | None; fully qualified. |
| SYSML-014 | IBD full port | supported | `model.ts`, `ibd.ts` | `ibd.test.ts`, `profileFixture.test.ts`, `sysml-bdd-ibd-requirements-rtm.spec.ts`, `normalizedStore.test.ts` | None; fully qualified. |
| SYSML-015 | IBD proxy port | supported | `model.ts`, `ibd.ts` | `ibd.test.ts`, `profileFixture.test.ts`, `sysml-bdd-ibd-requirements-rtm.spec.ts`, `normalizedStore.test.ts` | None; fully qualified. |
| SYSML-016 | IBD assembly connector | supported | `ibd.ts`, `IbdConnectorEditor.tsx` | `ibd.test.ts`, `IbdConnectorEditor.test.tsx`, `sysml-bdd-ibd-requirements-rtm.spec.ts`, `sysmlIntegrityService.test.ts`, `persistence.test.ts` | None; fully qualified. |
| SYSML-017 | IBD item flow | supported | `ibd.ts`, `IbdConnectorEditor.tsx`, `reportDiagrams.ts` | `ibd.test.ts`, `reportDiagrams.ibd.test.ts`, `IbdConnectorEditor.test.tsx`, `sysml-bdd-ibd-requirements-rtm.spec.ts`, `reportSnapshotAdapter.test.ts` | None; fully qualified. |
| SYSML-018 | IBD binding connector | supported | `model.ts`, `ibd.ts`, `IbdConnectorEditor.tsx` | `ibd.test.ts`, `IbdConnectorEditor.test.tsx`, `sysmlIntegrityService.test.ts`, `sysml-bdd-ibd-requirements-rtm.spec.ts`, `normalizedStore.test.ts` | None; fully qualified. |
| SYSML-019 | IBD delegation connector | supported | `ibd.ts`, `IbdConnectorEditor.tsx` | `ibd.test.ts`, `IbdConnectorEditor.test.tsx`, `sysmlIntegrityService.test.ts`, `sysml-bdd-ibd-requirements-rtm.spec.ts`, `normalizedStore.test.ts` | None; fully qualified. |
| SYSML-020 | RequirementDefinition/governance | supported | `requirements.ts`, `RequirementGovernancePanel.tsx` | `requirements.test.ts`, `RequirementGovernancePanel.test.tsx`, `sysml-bdd-ibd-requirements-rtm.spec.ts`, `reportModelConsistency.test.ts`, `persistence.test.ts` | None; fully qualified. |
| SYSML-021 | deriveReqt | supported | `requirements.ts`, `validation.ts` | `requirements.test.ts`, `sysmlCreationRules.test.ts`, `sysml-bdd-ibd-requirements-rtm.spec.ts`, `persistence.test.ts` | None; fully qualified. |
| SYSML-022 | satisfy | supported | `requirements.ts`, `RequirementGovernancePanel.tsx` | `requirements.test.ts`, `RequirementGovernancePanel.test.tsx`, `reportModelConsistency.test.ts`, `sysml-bdd-ibd-requirements-rtm.spec.ts`, `persistence.test.ts` | None; fully qualified. |
| SYSML-023 | verify/evidence | supported | `requirements.ts`, `evidence.ts`, `RequirementGovernancePanel.tsx` | `requirements.test.ts`, `evidence.test.ts`, `RequirementGovernancePanel.test.tsx`, `reportModelConsistency.test.ts`, `sysml-bdd-ibd-requirements-rtm.spec.ts`, `persistence.test.ts` | None; fully qualified. |
| SYSML-024 | refine | supported | `requirements.ts`, `validation.ts` | `requirements.test.ts`, `sysmlCreationRules.test.ts`, `sysml-bdd-ibd-requirements-rtm.spec.ts`, `persistence.test.ts` | None; fully qualified. |
| SYSML-025 | trace | supported | `requirements.ts`, `rtm.ts` | `requirements.test.ts`, `rtm.test.ts`, `reportDiagrams.trace.test.ts`, `sysml-bdd-ibd-requirements-rtm.spec.ts`, `traceabilityIndex.test.ts` | None; fully qualified. |
| SYSML-026 | copy | supported | `requirements.ts`, `RequirementGovernancePanel.tsx` | `requirements.test.ts`, `RequirementGovernancePanel.test.tsx`, `reportModelConsistency.test.ts`, `sysml-bdd-ibd-requirements-rtm.spec.ts`, `persistence.test.ts` | None; fully qualified. |
| SYSML-027 | RTM many-to-many | supported | `rtm.ts`, `TraceabilityMatrix.tsx`, `VirtualizedTraceabilityGrid.tsx` | `rtm.test.ts`, `TraceabilityMatrix.test.tsx`, `VirtualizedTraceabilityGrid.test.tsx`, `sysml-bdd-ibd-requirements-rtm.spec.ts`, `reportDiagrams.trace.test.ts`, `traceabilityIndex.test.ts` | None; fully qualified. |
| SYSML-028 | RTM baseline/change sensitivity | supported | `persistence.ts`, `rtm.ts`, `TraceabilityMatrix.tsx` | `persistence.test.ts`, `rtm.test.ts`, `TraceabilityMatrix.test.tsx`, `sysmlConformance.test.ts`, `sysml-persistence-report.spec.ts` | None; fully qualified. |
| SYSML-029 | SysML v2 equivalence | unsupported | `profile.ts`, `SYSML_INTERCHANGE_LIMITATIONS.md` | `profile.test.ts` | No semantic-equivalence claim is made for SysML v2. |
| SYSML-030 | Requirement containment | supported | `model.ts`, `requirements.ts`, `mutations.ts`, `sysmlCommandGateway.ts`, `RelationshipEndEditor.tsx`, `reportDiagrams.ts` | `requirements.test.ts`, `validation.test.ts`, `mutations.test.ts`, `sysmlCommandGateway.test.ts`, `RelationshipEndEditor.test.tsx`, `reportDiagrams.sysml.test.ts`, `sysml-deletion-lifecycle.spec.ts`, `persistence.test.ts` | None; fully qualified. |
| SYSML-031 | Typed semantic policy decisions | supported | `policy.ts`, `bdd.ts`, `ibd.ts`, `mutations.ts`, `connectionPolicy.ts` | `policy.test.ts`, `bdd.test.ts`, `ibd.test.ts`, `validation.test.ts`, `mutations.test.ts`, `sysmlTransactionAdapter.test.ts`, `sysml-deletion-lifecycle.spec.ts`, `patches.test.ts`, `connectionPolicy.test.ts`, `sysml-connection-policy.spec.ts` | None; fully qualified. |
| SYSML-032 | SysML Use-Case Metamodel & Persistence | partial | `model.ts`, `useCases.ts`, `normalizedStore.ts`, `persistence.ts`, `connectionPolicy.ts`, `sysmlCommandGateway.ts`, `reportDiagrams.ts` | `useCases.test.ts`, `useCaseMigration.test.ts`, `useCaseLifecycle.test.ts`, `useCaseLargeModel.test.ts` | Use case UI workspace module removed from application; core metamodel, gateway commands, and persistence retained. |

## Current automated qualification

- `npm run test:sysml`: 357 unit & integration tests passing (39 files).
- `npm run test:sysml:release`: SysML suite plus reporting qualification and full TypeScript check passing with zero errors.
- `npm run test:opm:qualification`: 41 runtime-conformance and generator-boundary tests passing.
- `npm run test:opm:codegen`: 14 host-compilation, golden-execution, and mutation-resistance tests passing (requires the pinned C compiler).
- `npm run test:e2e:sysml`: Playwright real-browser end-to-end qualification across BDD, IBD, Requirements, RTM, and deletion lifecycle passing (22 passed, 1 skipped).
- Production `npm run build`: cleanly passes bundle generation.

The machine-readable registry is `src/engine/sysml/profile.ts` and `src/engine/sysml/conformanceManifest.ts`. Every supported row maps to canonical types, fail-closed validation, user interface components, and automated test evidence.
