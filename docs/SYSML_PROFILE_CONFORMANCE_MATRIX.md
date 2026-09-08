# ADIA SysML Profile Conformance Matrix

Profile: `OMG-SysML-1.6-ADIA`  
Normative baseline: OMG SysML 1.6 / ISO/IEC 19514:2017  
SysML v2 semantic equivalence: unsupported; requires a separate versioned adapter.

Status meanings: `partial` means the concept is tracked but its complete create/edit/validate/render/persist/delete/trace/test lifecycle is not yet qualified. A row changes to `supported` only after the release test named in `profile.ts` passes with implementation evidence.

| Domain | Capabilities | Current status | Evidence |
|---|---|---|---|
| BDD | blocks, value types, part/reference/flow properties, ports, composition, shared aggregation, association, generalization, dependency, allocation | partial | `src/engine/sysml/profile.test.ts` |
| IBD | part usages, full/proxy ports, connectors, item flows, binding and delegation connectors | partial | `src/engine/sysml/profile.test.ts` |
| Requirements | requirement, deriveReqt, satisfy, verify, refine, trace, copy | partial | `src/engine/sysml/profile.test.ts` |
| RTM | many-to-many matrix and baselines | partial | `src/engine/sysml/profile.test.ts` |
| Interchange | SysML v2 | unsupported | `SYSML-029` |

The machine-readable source of truth is `src/engine/sysml/profile.ts`. This document must be updated by the release qualification task; it must never claim support based on rendering alone.
