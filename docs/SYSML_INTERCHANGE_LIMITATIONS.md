# SysML Interchange and Interoperability Limitations

**Profile Identifier:** `OMG-SysML-1.6-ADIA`  
**Normative Baseline:** OMG SysML 1.6 / ISO/IEC 19514:2017  
**Authority:** `SysmlRepository` (in `src/engine/sysml/model.ts`)  

This document specifies the normative boundaries, non-goals, and interchange diagnostic semantics for ADIA's SysML implementation.

---

## 1. Architectural Authority and Non-Divergence

1. **Single Source of Truth:**
   The canonical `SysmlRepository` data structure is the only mutation, serialization, and verification authority for SysML models within ADIA.
2. **Read-Only Projections:**
   Projections—including BDD diagram layouts, IBD views, Traceability Matrices (RTM), HTML/PDF architecture reports, and OPM graph transformations—are strictly read-only derivative views.
3. **No Silent Invalidation:**
   Edits cannot bypass the repository transaction layer (`src/services/sysmlCommandGateway.ts`). Mutations are atomic, validated fail-closed, and recorded in the audit trail.

---

## 2. SysML v2 Boundary and Non-Equivalence

1. **Explicit Boundary Claim:**
   The `OMG-SysML-1.6-ADIA` profile is strictly aligned with OMG SysML 1.6 (ISO/IEC 19514:2017).
2. **No SysML v2 Semantic Equivalence:**
   No claim of semantic equivalence is made for SysML v2 (KerML). SysML v2 features deep changes in metamodel foundation (everything is a feature/usage, temporal semantics, textual language).
3. **Adapter Required:**
   Interchange with SysML v2 systems requires an independent, versioned transformation adapter and cannot be achieved by lossless serialization of the 1.6 repository.

---

## 3. OPM (ISO 19450) Interoperability and Loss Diagnostics

ADIA provides explicit, loss-aware projection from SysML to Object-Process Methodology (OPM / ISO 19450) via `src/engine/sysml/opmAdapter.ts`. Native SysML models are never mutated by this projection.

Because OPM and SysML possess fundamentally different metamodels, the following constructs cannot be mapped losslessly and produce explicit diagnostic codes:

### 3.1 Structural and Compositional Semantics
| SysML Construct | OPM Projected Element | Mapping Status | Diagnostic Code | Limitation Description |
|---|---|---|---|---|
| `composition` relationship | Aggregation edge | `conceptual-only` | `OPM_COMPOSITION_OWNERSHIP_LOSS` | OPM aggregation expresses part-whole relationship but does not enforce exclusive composite lifecycle ownership or recursive cascade deletion. |
| `sharedAggregation` relationship | Aggregation edge | `conceptual-only` | `OPM_SHARED_AGGREGATION_LOSS` | OPM aggregation does not distinguish shared reference aggregation from composite aggregation. |
| `part` usage / `port` usage | None (contextual) | `unsupported` | `OPM_USAGE_UNSUPPORTED` | Usages are contextual roles within a defining block; OPM objects represent conceptual entities, not hierarchical usage contexts. |
| Block features (ops, constraints) | None | `conceptual-only` | `OPM_BLOCK_FEATURE_LOSS` | OPM objects do not natively encapsulate SysML feature compartments, multiplicity bounds, or typed properties. |

### 3.2 Internal Block Diagrams (IBD)
| SysML Construct | OPM Projected Element | Mapping Status | Diagnostic Code | Limitation Description |
|---|---|---|---|---|
| `assembly` connector | None | `unsupported` | `OPM_IBD_CONNECTOR_UNSUPPORTED` | IBD port-to-port connectors have no direct edge equivalent in OPM's object-process model. |
| `delegation` connector | None | `unsupported` | `OPM_IBD_CONNECTOR_UNSUPPORTED` | Boundary delegation crossing encapsulating block boundaries is specific to SysML/UML internal structures. |
| `binding` connector | None | `unsupported` | `OPM_IBD_CONNECTOR_UNSUPPORTED` | Value and equality binding across ports/properties is unmapped in OPM. |
| `itemFlow` | None | `unsupported` | `OPM_IBD_CONNECTOR_UNSUPPORTED` | Conveyed classifiers and flow properties along connectors have no OPM structural edge equivalent. |

### 3.3 Requirements Engineering and Governance
| SysML Construct | OPM Projected Element | Mapping Status | Diagnostic Code | Limitation Description |
|---|---|---|---|---|
| `requirement` definition | Requirement object node | `conceptual-only` | `OPM_REQUIREMENT_GOVERNANCE_LOSS` | Requirement metadata (ID, version, status lifecycle, risk, priority) is retained as visual metadata; OPM has no native requirement governance engine. |
| `satisfy` relationship | Satisfies edge | `conceptual-only` | `OPM_REQUIREMENT_RELATION_LOSS` | Conceptual projection only; does not carry suspect-link propagation or verification status in OPM. |
| `verify` relationship | Verifies edge | `conceptual-only` | `OPM_REQUIREMENT_RELATION_LOSS` | Conceptual projection only; does not link to automated execution evidence or test runs in OPM. |
| `deriveReqt`, `refine`, `copy` | None | `unsupported` | `OPM_RELATIONSHIP_UNSUPPORTED` | No equivalent structural link exists in standard OPM notation. |

---

## 4. Round-Trip Assessment Guarantee

1. **Fail-Safe Round-Trip Detection:**
   The `assessOpmRoundTripLoss` function inspects all elements in a repository against the projection mappings. Any model containing composition, usages, connectors, or non-generalization relationships will return `lossless: false` with complete diagnostic lists.
2. **Prohibition of Lossy Overwrites:**
   Exporting or projecting to OPM is strictly one-directional. OPM models cannot overwrite the canonical SysML repository.

---

## 5. Persistence Format and Integrity

1. **Envelope Format:**
   Native persistence uses the `ADIA-SysML` format with `schemaVersion: 2` and
   `profileId: OMG-SysML-1.6-ADIA`. Legacy array payloads (`blocks`/`parts`/
   `relationships`/`connectors`) are migrated to this schema on import
   (`migrated: true`, `migrateLegacy` audit entry); semantic IDs are preserved
   verbatim and never regenerated.
2. **Deterministic Serialization:**
   `serializeRepository` canonicalizes every collection in sorted-id order and
   serializes with sorted keys (`stableStringify`), so two serializations of
   the same repository are byte-identical. `toRepository` (normalized store)
   emits the same sorted order. Checksums are computed over the canonical form.
3. **Checksum Verification:**
   Every serialized model envelope includes an SHA-256 hash of its canonical JSON representation. Tampered or truncated payloads fail validation on load (`PERSISTENCE_CHECKSUM_MISMATCH`).
4. **Immutable Baselines:**
   Model baselines (`ModelBaseline`) freeze element hashes and are protected against in-place mutations.

---

## 6. Interchange Loss Reporting and Endpoint Quarantine (Task 7)

1. **Single Report Surface:**
   `src/engine/sysml/interchangeReport.ts` is the only interchange-report
   authority. Every import and every lossy projection returns an
   `InterchangeReport` (`lossless`, `lossEntries`, `unresolvedEndpoints`,
   `quarantinedRelationshipIds`, `quarantinedConnectorIds`, `diagnostics`).
   `loadRepository` and `loadCanonicalSysmlProject` always populate it;
   projections never silently drop a construct.
2. **Legacy Migration Losses (explicit, never silent):**
   Unknown legacy relationship kinds are carried as `trace` plus
   `LEGACY_RELATIONSHIP_KIND_UNSUPPORTED` (warning + loss entry). Unknown
   connector kinds are defaulted plus `LEGACY_CONNECTOR_KIND_UNSUPPORTED`.
   Requirement-to-requirement `composition` is carried as
   `requirementContainment` plus `LEGACY_REQUIREMENT_COMPOSITION_MIGRATED`
   (info + loss entry). Legacy connectors with empty endpoints are
   quarantined plus `LEGACY_CONNECTOR_ENDPOINT_UNRESOLVED`.
3. **Unresolved Endpoints (reject-or-quarantine, no generic associations):**
   Any relationship/connector whose endpoint does not resolve to a canonical
   element (including `partId::portId` pairs) is stripped from the live
   repository into `quarantinedRelationshipIds` / `quarantinedConnectorIds`
   with `UNRESOLVED_ENDPOINT` (error). Usages, verification links, and
   evidence with dangling references stay in place and fail closed with the
   same code. Import `valid` is `false` while quarantine is non-empty.
4. **Legacy-Projection Losses:**
   `assessLegacyProjectionLoss` reports `INTERCHANGE_EVIDENCE_NOT_PROJECTED`,
   `INTERCHANGE_BASELINE_NOT_PROJECTED`, `INTERCHANGE_ARTIFACT_NOT_PROJECTED`,
   `INTERCHANGE_PORT_USAGE_CONTEXT_LOSS`,
   `INTERCHANGE_INHERITANCE_PROJECTION_LOSS`, and
   `INTERCHANGE_VERIFICATION_LINK_LOSS`. Gateway
   `projectLegacyViewWithInterchangeReport` returns the unchanged view plus
   this report.
5. **OPM-Projection Losses:**
   `assessOpmInterchangeLoss` wraps `projectSysmlToOpm` so every
   `conceptual-only` / `unsupported` mapping becomes a loss entry
   (`OPM_COMPOSITION_OWNERSHIP_LOSS`, `OPM_SHARED_AGGREGATION_LOSS`,
   `OPM_USAGE_UNSUPPORTED`, `OPM_IBD_CONNECTOR_UNSUPPORTED`,
   `OPM_REQUIREMENT_GOVERNANCE_LOSS`, `OPM_REQUIREMENT_RELATION_LOSS`,
   `OPM_RELATIONSHIP_UNSUPPORTED`, ...). `generalization` remains the only
   lossless `mapped` edge. Gateway `projectOpmWithInterchangeReport` returns
   the projection plus this report.
