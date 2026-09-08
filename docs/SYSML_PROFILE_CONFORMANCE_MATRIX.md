# ADIA SysML Profile Conformance Matrix

Profile: `OMG-SysML-1.6-ADIA`  
Normative baseline: OMG SysML 1.6 / ISO/IEC 19514:2017  
SysML v2 semantic equivalence: unsupported; requires a separate versioned adapter.

`partial` means the concept has canonical semantics and tests but its complete create/edit/render/persist/delete/trace workflow is not yet release-qualified. `supported` is reserved for capabilities whose entire application lifecycle is proven by the release gate. This matrix intentionally does not claim conformance from notation alone.

| ID | Capability | Status | Implementation evidence | Automated evidence | Remaining limitation |
|---|---|---|---|---|---|
| SYSML-001 | BDD BlockDefinition | partial | `model.ts`, `bdd.ts`, native editor | `bdd.test.ts`, `sysmlConformance.test.ts` | Canonical repository is not yet the sole project-save source of truth. |
| SYSML-002 | BDD ValueType/unit/dimension | partial | `model.ts`, `bdd.ts`, `BlockPropertiesEditor.tsx` | `model.test.ts`, `bdd.test.ts`, `BlockPropertiesEditor.test.tsx` | Canonical repository is not yet the sole editor mutation source. |
| SYSML-003 | BDD part property | partial | `model.ts`, `bdd.ts`, `BlockPropertiesEditor.tsx` | `bdd.test.ts`, `sysmlPropertyRules.test.ts` | Native BDD still projects through legacy property records. |
| SYSML-004 | BDD reference property | partial | `model.ts`, `bdd.ts`, `BlockPropertiesEditor.tsx`, report renderer | `bdd.test.ts`, `BlockPropertiesEditor.test.tsx`, `reportDiagrams.sysml.test.ts` | Real-browser create/edit/save/load qualification remains. |
| SYSML-005 | BDD flow property | partial | `model.ts`, `bdd.ts`, `BlockPropertiesEditor.tsx` | `bdd.test.ts`, `sysmlPropertyRules.test.ts` | Flow-property direction and conjugation UI remain incomplete. |
| SYSML-006 | BDD ports | partial | `model.ts`, `bdd.ts`, native port editor | `bdd.test.ts`, `ibd.test.ts` | Full/proxy terminology migration in legacy projects remains. |
| SYSML-007 | BDD composition | partial | `bdd.ts`, `mutations.ts`, `sysmlTransactionAdapter.ts`, native impact confirmation | `mutations.test.ts`, `sysmlTransactionAdapter.test.ts` | Real-browser cascade/cancel/undo qualification remains. |
| SYSML-008 | BDD shared aggregation | partial | `bdd.ts`, `mutations.ts` | `bdd.test.ts`, `mutations.test.ts` | Native usage ownership editor remains incomplete. |
| SYSML-009 | BDD association | partial | `bdd.ts`, native relationship editor | `bdd.test.ts`, `sysmlCreationRules.test.ts` | Association-end property editor remains limited. |
| SYSML-010 | BDD generalization | partial | `bdd.ts`, `validation.ts` | `bdd.test.ts`, `validation.test.ts` | Inherited-feature compartments are not yet rendered from canonical projection. |
| SYSML-011 | BDD dependency | partial | `bdd.ts`, native relationship editor | `bdd.test.ts`, `sysmlCreationRules.test.ts` | Dependency stereotype/property detail remains limited. |
| SYSML-012 | BDD allocation | partial | `bdd.ts`, native relationship editor | `bdd.test.ts`, `opmAdapter.test.ts` | Allocation tables and activity views are outside this profile slice. |
| SYSML-013 | IBD PartUsage | partial | `model.ts`, `ibd.ts`, native IBD editor | `ibd.test.ts`, `sysmlTransactionAdapter.test.ts` | Canonical nested-part editing is not yet the persistent UI source. |
| SYSML-014 | IBD full port | partial | `model.ts`, `ibd.ts` | `ibd.test.ts` | Legacy UI calls full ports “standard”. |
| SYSML-015 | IBD proxy port | partial | `model.ts`, `ibd.ts`, native port editor | `ibd.test.ts` | Interface-feature editing remains limited. |
| SYSML-016 | IBD assembly connector | partial | `ibd.ts`, `sysmlCreationRules.ts` | `ibd.test.ts`, `sysmlCreationRules.test.ts` | Browser interaction qualification remains. |
| SYSML-017 | IBD item flow | partial | `ibd.ts`, typed item-flow selector | `ibd.test.ts`, `sysmlCreationRules.test.ts` | Item-property multiplicity is not yet shown on connector labels. |
| SYSML-018 | IBD binding connector | partial | `model.ts`, connector-kind editor | `ibd.test.ts`, `sysmlCreationRules.test.ts` | Constraint-parameter endpoints remain incomplete. |
| SYSML-019 | IBD delegation connector | partial | `ibd.ts`, connector-kind editor | `ibd.test.ts`, `sysmlCreationRules.test.ts` | Full boundary-navigation browser test remains. |
| SYSML-020 | RequirementDefinition/governance | partial | `requirements.ts`, requirement editor | `requirements.test.ts`, `sysmlConformance.test.ts` | Baseline management UI remains. |
| SYSML-021 | deriveReqt | partial | `requirements.ts`, relationship rules | `requirements.test.ts`, `sysmlCreationRules.test.ts` | Browser direction interaction test remains. |
| SYSML-022 | satisfy | partial | `requirements.ts`, relationship rules | `requirements.test.ts`, `sysmlCreationRules.test.ts` | Suspect-link review UI remains. |
| SYSML-023 | verify/evidence | partial | `requirements.ts`, `evidence.ts`, verification-case editor | `requirements.test.ts`, `evidence.test.ts` | Evidence history UI and external test ingestion remain. |
| SYSML-024 | refine | partial | `requirements.ts`, relationship rules | `requirements.test.ts`, `sysmlCreationRules.test.ts` | Browser navigation qualification remains. |
| SYSML-025 | trace | partial | `requirements.ts`, `rtm.ts` | `requirements.test.ts`, `rtm.test.ts` | Generic trace rationale UI remains. |
| SYSML-026 | copy | partial | `requirements.ts`, native relationship editor | `requirements.test.ts`, `sysmlCreationRules.test.ts` | Copy synchronization policy UI remains. |
| SYSML-027 | RTM many-to-many | partial | `rtm.ts`, `TraceabilityMatrix.tsx` | `rtm.test.ts`, `TraceabilityMatrix.test.tsx`, `sysmlBrowserFlow.test.tsx` | True browser automation and large-model virtualization remain. |
| SYSML-028 | RTM baseline/change sensitivity | partial | `persistence.ts`, `rtm.ts`, `evidence.ts` | `persistence.test.ts`, `rtm.test.ts`, `evidence.test.ts` | Baseline/change-set controls remain to be surfaced. |
| SYSML-029 | SysML v2 equivalence | unsupported | Versioned profile boundary | `profile.test.ts` | No SysML v2 semantic-equivalence claim is made. |

## Current automated qualification

- `npm run test:sysml`: 130 tests passed on 2026-09-08.
- `npm run test:sysml:release`: 130 SysML tests and 73 reporting tests plus TypeScript passed on 2026-09-08; rerun before merge.
- Production `npm run build`: passed; dependency-audit and bundle-size warnings remain separate concerns.
- OPM compiled-C qualification remains blocked until the pinned GCC toolchain is restored at `toolchains/w64devkit/w64devkit/bin/gcc.exe`.

The machine-readable registry is `src/engine/sysml/profile.ts`. A row moves to `supported` only after its remaining limitation is removed and the complete application workflow is exercised by `test:sysml:release`.
