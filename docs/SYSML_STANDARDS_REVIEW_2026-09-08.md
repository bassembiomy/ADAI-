# ADIA — SysML Standards, Simulation & Traceability Review
### Conformance audit of the structural model, deletion semantics, traceability matrix and simulation linkage

| | |
|---|---|
| **Date** | 2026-09-08 |
| **Branch / commit** | `arena/01a081f1-adai` @ `b725336` (merge of PR #14) |
| **Scope** | SysML BDD / IBD / Requirements model, deletion & cascade rules, Requirements Traceability Matrix (RTM), report generation, and the link (or absence of link) between the structural model and ADIA's simulation engines |
| **Reference model analysed** | `adia_project_unified_adia_corrected.json` (v2.4 ENGINE, "Smart Induction Coffee Heater — Clean BDD + Traceability") |
| **Standards baseline** | OMG SysML v1.6 (the profile ADIA implements) with OMG SysML v2.0 (final adoption 21 Jul 2025) as the forward target; ISO/PAS 19450 (OPM) for the ENTROPY module |
| **Method** | Static review of 20+ source files + executable probes of the shipped cascade/reconciliation code against the real project file. Dependency install (and therefore `vitest`) is unavailable in this sandbox — see §10. |

---

## 1. Executive summary

ADIA already has a **surprising amount of the right machinery**: a pure, well-tested SysML integrity service, a cascade-deletion engine wired to the live model, a model-reconciliation/diagnostics pass with a deterministic revision hash, a full report pipeline (BDD / requirements / IBD / state-machine / traceability diagrams, interactive drill-down, PDF + DOCX), an RTM window with XLSX export, and — uniquely — an ISO 19450 OPM model with derived SysML views and an executable simulator.

The problem is **not absence of features, it is absence of a single authority for the rules**. Three independent implementations of "what happens when you delete something" coexist, only one of them is wired to the UI, and the path users actually use (the Delete key) uses a *fourth*, non-cascading implementation. Concretely:

| # | Headline finding | Severity |
|---|---|---|
| **F-1** | **Two delete paths with different semantics.** The properties-panel "Delete Block" button cascades correctly; the **Delete key and Ctrl+X do not cascade at all** and leave orphaned parts/connectors that the diagnostics pass reports as *zero errors*. | **P0 — silent corruption** |
| **F-2** | **`sysmlIntegrityService.ts` (365 lines, fully unit-tested, incl. a 1000-element perf test) is dead code.** It is never imported by `App.tsx`. Every rule it encodes — impact preview, port direction, traceability endpoint semantics, requirement-ID uniqueness — is unenforced in the product. | **P0** |
| **F-3** | **No impact preview / confirmation for SysML deletes**, although one exists for states. Deleting the root block of the reference project silently destroys all **13 parts + 14 connectors** with a single toast. | **P0** |
| **F-4** | **Back-references are never cleaned.** Deleting requirement `REQ-M-001` leaves a stale ID in `Bottom Plastic Housing.satisfiedReqIds`; deleting a block/part leaves `interfaceRealizations` dangling. | **P1** |
| **F-5** | **The RTM does not read «satisfy» relationships.** Its "Satisfied By" column is computed from a denormalised `satisfiedReqIds` array, so ADIA has two independent sources of truth for the single most important traceability fact. | **P1** |
| **F-6** | **Requirement → test/verification traceability is a stub.** `smSemanticBuilder` hard-codes `requirementIds: []` for every state and transition, so generated C test suites print an empty `Requirements:` line. `«verify»` is used **0 times** in the reference project. | **P1** |
| **F-7** | **The structural model is not connected to any simulation engine.** BDD/IBD blocks feed nothing; the state-machine sim, V-Lab and X-Bridges are fed by the state-machine model, DOE results and per-state sub-models respectively. | **P1** |
| **F-8** | **The SysML → OPM importer emits links that violate OPM's own rules** (`satisfies` must start at a requirement; the importer emits block → requirement because SysML points the other way). | **P1** |

**Bottom line:** the deletion *algorithm* is 80 % correct and well tested in isolation; it is the **wiring, the second delete path, and the traceability/simulation linkage** that need work. The fix is mostly integration (one authority + one delete path + one preview), not new theory.

---

## 2. What already exists (inventory)

### 2.1 Domain model — `src/types/sysml_types.ts` (175 lines)

`PortData`, `ValuePropertyData`, `BlockData` (stereotypes `block | requirement | interface | valueType`; ports, properties, operations, constraints, `reqId`, `status`, `priority`, `risk`, `verificationMethod`, `assignedTo`, `satisfiedReqIds`, `layerId`, IBD frame geometry), `RelationshipData`, `PartData`, `ConnectorData`, `InterfaceRealizationData`, `DeletionImpact`, `ValidationResult`, plus the legacy `SysMLDiagramState` union types used by the integrity service.

**Strengths:** requirement-specific fields cover most of the INCOSE Guide-for-Writing-Requirements attribute set (ID, text, status, priority, risk, verification method, source, owner, satisfaction links). Value properties, constraints (parametric) and port kinds (`standard | flow | proxy`) are modelled.

### 2.2 The (unused) standards engine — `src/services/sysmlIntegrityService.ts` (365 lines) + 300-line test suite

| Function | Line | Purpose |
|---|---|---|
| `migrateSysMLState` | 15 | Legacy-schema hydration; defaults direction → `inout`, `parentPartId` → `null`, canonicalises `derive` → `deriveReqt` |
| `previewDeletionImpact` | 98 | Computes `affectedParts / affectedConnectors / affectedRelations` for block, port, part, requirement — with transitive part descent |
| `cascadeDeleteBlock` | 209 | Block, owned ports, typed/contained parts (transitively), their connectors and relations |
| `cascadeDeletePort` | 227 | Port, its connectors and relations, and its removal from the owning block |
| `cascadeDeletePart` | 246 | Part, nested descendant parts, their connectors and relations |
| `cascadeDeleteRequirement` | 260 | Requirement, its relations |
| `validateConnectorConnection` | 274 | Self-loop, missing port, duplicate connector, `out→out`, `in→in` |
| `validateTraceabilityRelation` | 311 | `satisfy` = Block/Part → Requirement; `deriveReqt` = Requirement → Requirement; `verify` = * → Requirement |
| `validateUniqueRequirementIds` | 348 | Global, case-insensitive REQ-ID uniqueness |

Tests cover schema hydration, each cascade, port direction, duplicate connectors, all three traceability rules, REQ-ID uniqueness and a **1 000-block / 2 000-port / 1 000-part performance budget (< 20 ms data-layer)**.

**This is exactly the semantics the standard requires. It is imported by nothing.**

### 2.3 The (wired) live cascade — `src/services/reportModelConsistency.ts` (355 lines)

* `cascadeDeleteReportElement` (line 43) — block / requirement / part / port, with transitive part descent via `parentPartId`, removal of owned ports, connectors and relationships. Used by `App.tsx:9296` (`deleteBlock`) and `App.tsx:9368` (`deletePart`).
* `reconcileReportModel` (line 174) — detects `DUPLICATE_ID`, `INVALID_CONTEXT`, `DANGLING_RELATIONSHIP`, `DANGLING_CONNECTOR`; removes dangling connections and reports them.
* `buildReportSnapshot` (line 325) — reconciles once and stamps a deterministic `rev_<hash>` from a canonical content signature (blocks, parts, relations, connectors, states, layers, transitions, junctions).

### 2.4 Reporting pipeline — `src/features/reporting/`

`reportSnapshot.ts`, `reportDiagrams.ts` (BDD, requirements, IBD, state-machine, traceability renderers; `DASHED_REL_TYPES` at line 61 correctly renders `satisfy/verify/refine/trace/derive*/dependency/allocation/binding` as dashed dependency edges), `reportDiagramLayout.ts`, `reportDiagramModel.ts`, `reportHierarchyEngine.ts` (BDD→IBD→sub-IBD→state-machine drill-down with breadcrumbs, zoom, pan and print CSS), `generateArchitectureReport.ts` (HTML), `exportReportToPdf.ts`, `exportReportToDocx.ts`, generators for the state-machine verification report and the motor-drive test report, `ReportViewerModal.tsx`.

Test coverage: `reportCompleteness` (no relationship is dropped across figure page boundaries), `reportConsistency.integration` (deleted requirement + connector never reach the report), `reportDiagrams.{sysml,ibd,sm,trace,xhmi}`, `reportHierarchyEngine`, `tabSwitchingConsistency`, `userScenario`.

### 2.5 UI — `src/App.tsx`

BDD / IBD / requirements diagram modes; port creation (standard/flow/proxy) with **type** compatibility on connect (`App.tsx:9567`); interface realizations; layer navigation (`enterBlock` / `enterRequirement` / `exitLayer` / `goToLayer` with `layerStack` + `layerPath`); 50-step undo/redo over `blocks, relationships, parts, connectors, interfaceRealizations, customStereotypes` + state-machine state; an RTM window (`App.tsx:829`) with status filter, hierarchy indentation and XLSX export; and a **`deleteConfirmState` dialog for state deletion only** (`App.tsx:9040`) showing descendant state/layer counts.

### 2.6 Simulation & verification estate

| Engine | Fed by | Notes |
|---|---|---|
| State-machine simulator (`startSimulation`, `App.tsx:8656`) | `states / transitions / variables / layers` | tick-based; HMI + Factory I/O output |
| OPM / ENTROPY simulator (`OpmSimulationEngine.ts`) | OPM nodes/edges (ISO 19450) | trigger/condition/enabler semantics, deterministic conflict resolution, animation detection |
| V-Lab (`src/components/vlab`) | DOE results (`handleExportToVLab`, `App.tsx:6536`) | Simulink-like physics blocks |
| X-Bridges (`src/components/xbridges`) | DOE results **or** per-state `state.xBridgesModel` sub-workspaces | control/Stateflow-like |
| HIL (`src/engine/hil`) | generated C + target packs | flash, telemetry, vector evidence |

Verification tooling: `smSemanticBuilder` → `smTraceabilityEngine` → `smTestManifest` / `smTestPlanBuilder` / `smCTestSuiteRenderer` / `smCoverageRunner` / `smDifferential`, evidence bundle + verification report. **Note:** the traceability hook exists (`TraceableElement.requirementIds`) but is hard-coded empty — see F-6.

---

## 3. Standards baseline used for this review

### 3.1 Requirement-relationship direction (SysML v1.6 §16)

All SysML requirement relationships are UML **dependencies**: the arrow points from the **client** (dependent) to the **supplier** (independent).

| Relationship | Client (source, tail) | Supplier (target, arrowhead) | ADIA reference project |
|---|---|---|---|
| `«satisfy»` | satisfying model element (Block / Part) | Requirement | **38/38 correct** (`block → requirement`) |
| `«verify»` | test case / verification element | Requirement | 0 instances |
| `«deriveReqt»` | **derived** requirement | **source** requirement | 0 instances |
| `«refine»` | refining model element | Requirement | 0 instances |
| `«trace»` | any | any | 0 instances |
| `«copy»` | copy | source requirement | **not modelled** |

> "As with other dependencies, the arrow direction points from the derived (client) requirement to the (supplier) requirement from which it is derived." — SysML v1.6, quoted in [Webel, *SysML-1.6 Figure 16-3*](https://www.webel.com.au/node/1451).
> "The arrow direction is opposite of what has typically been used for requirements flow-down." — [*Requirement Relationship*, ScienceDirect](https://www.sciencedirect.com/topics/computer-science/requirement-relationship).

**Consequence for ADIA:** the RTM builds its tree with `childrenMap[rel.sourceId].push(rel.targetId)` for `composition | derive | deriveReqt` (`App.tsx:853`, `App.tsx:11473`, `generateArchitectureReport.ts:103`). For `composition` (source = whole, target = part) that is right; **for `deriveReqt` it is inverted** — the standard says the source is the *child/derived* requirement. Today this is latent (0 `deriveReqt` in the reference model) but it will silently invert every requirement hierarchy the moment users start deriving requirements.

### 3.2 Deletion / ownership semantics (UML + SysML)

1. **Ownership implies deletion.** Deleting an element deletes everything it owns: a Block owns its ports, its value properties, its constraints and its nested/owned classifiers; a Part owns its nested parts.
2. **Typing implies invalidation.** A Part is *typed* by a Block. When the type is deleted, the instance has no definition — it must be deleted (or explicitly re-typed). SysML/UML provide no "typeless part".
3. **No dangling references.** Every relationship/connector that references a deleted element must be removed. A model that references a non-existent element is not well-formed.
4. **Dependencies are bidirectional bookkeeping.** Deleting a Requirement must delete its `satisfy / verify / deriveReqt / refine / trace / copy` dependencies *and* any denormalised back-pointers (e.g. `satisfiedReqIds`), then recompute coverage.
5. **Non-destructive by default for suppliers.** Deleting the *client* of a dependency (the block that satisfies) does **not** delete the requirement — but it does remove the satisfaction and must surface the now-uncovered requirement.
6. **Impact must be previewed.** Tooling practice (and the ADIA internal review BR-08) requires an impact preview before a destructive cascade; the operation must be atomic and undoable.
7. **SysML v2 direction.** v2 (KerML-based, [final adoption 21 Jul 2025](https://www.omg.org/news/releases/pr2025/07-21-25.htm)) replaces these stereotypes with first-class `satisfyRequirementUsage / verifyRequirementUsage / derivedRequirement` usages, and ships a standard API + conformance test suite. Anything built now should keep the v1 tokens behind one canonicalisation layer so a v2 mapping is a translation, not a rewrite.

---

## 4. The reference model as it stands (measured, not assumed)

Probe run against `adia_project_unified_adia_corrected.json`:

```
blocks 84 (block 46, requirement 38) | relationships 83 | parts 13 | connectors 14 | interfaceRealizations 0
relationship types: { satisfy: 38, composition: 45 }
satisfy direction:  "block -> requirement" × 38            ← conformant
requirements: 38 | duplicate reqIds: 0 | without reqId: 0
status: { Draft: 38 }                                       ← nothing approved or verified
verificationMethod: { Test: 23, Inspection: 13, Analysis: 2 }
coverage: «satisfy» relation 38/38 · satisfiedReqIds field 38/38 · orphan requirements 0
blocks carrying satisfiedReqIds: 29
ports: 28 total | with direction: 0 | with kind: 28
requirement layers: all 38 on 'root' (flat, no hierarchy)
IBD contexts: 1 (all 13 parts live in one block)
baseline reconcile: 0 dangling, 0 duplicate, 0 invalid-context   ← the file is clean
```

**Reading:** the file is internally consistent and its `satisfy` direction is standard-conformant — credit where due. But the model is **flat and shallow**: only 2 of the 13 relationship types in `RelationshipData['type']` are used; there is no requirement hierarchy, no verification linkage, no refinement to behaviour, and **port direction is never captured (0/28)**, which makes the entire SysML flow-port/connector-direction rule set unenforceable on real data.

---

## 5. Traceability: what works and what doesn't

### 5.1 What works
* RTM window with status filter, `«deriveReqt»/«derive»/composition` hierarchy indentation, "Links (Out)" from relationships, "Satisfied By", XLSX export (`App.tsx:829–1000`).
* Requirements diagram, BDD and a dedicated **traceability diagram** (`reportDiagrams.ts:344`) that merges blocks, requirements, relationships, states and transitions into one layered graph — a genuinely good feature.
* Deletion closure is verified by tests: after deleting a requirement or its satisfying block, the corresponding edge disappears from **all three** diagrams (`reportDiagrams.trace.test.ts:67–110`).
* The report prints a "Model Consistency Summary" with removed-connection and error counts.

### 5.2 What doesn't

| Ref | Finding | Evidence |
|---|---|---|
| **F-5** | RTM "Satisfied By" is computed **only** from `blocks/parts[].satisfiedReqIds`; the 38 `«satisfy»` relationships are ignored. Two sources of truth, maintained by two different UI gestures (draw a relation vs. tick boxes in the properties panel). They agree today (38/38 both ways) and will diverge silently. | `App.tsx:893`, `App.tsx:950` |
| **F-6** | Requirement → verification linkage is a stub: `smSemanticBuilder.ts:789,798` push `requirementIds: []`; `smCTestSuiteRenderer.ts:237` then emits `Requirements: ` (empty) in every generated test. `«verify»` count = 0. HIL evidence, V-Lab models and state-machine verification bundles carry no requirement IDs. | `src/utils/stateMachine/*` |
| **F-9** | No coverage/orphan analytics. The RTM shows status but never flags "uncovered requirement", "satisfying element deleted", or "requirement with no verification method". Status is a free-text-ish enum that is `Draft` for all 38 requirements and is never driven by an actual verification result. | `App.tsx:829–1000` |
| **F-10** | The generated PDF/DOCX report has a *requirements table* but **no RTM section** — no satisfaction matrix, no coverage %, no orphan list — even though the interactive HTML pipeline has all the ingredients. | `generateArchitectureReport.ts:79–135` |
| **F-11** | `deriveReqt` hierarchy direction is inverted (§3.1); `derive` and `deriveReqt` are two tokens for one concept and are handled ad hoc in three places instead of canonicalised once. | `App.tsx:853` (RTM), `App.tsx:11473` and `generateArchitectureReport.ts:103` (reports) |
| **F-12** | Relationship model applies UML association semantics to dependencies: `createRelationship` (`App.tsx:9317`) stamps `sourceMultiplicity: '1'` / `targetMultiplicity: '1'` on every relation, including `satisfy`/`verify`/`trace`, which have no multiplicities. `«allocate»` is spelled `allocation`; `«copy»` is missing; the integrity service uses the token `refines` while the type union uses `refine`. | `App.tsx:9317`, `sysml_types.ts:59`, `sysmlIntegrityService.ts:76` |
| **F-13** | No duplicate-relationship guard (the service prevents duplicate *connectors* only) and no `«satisfy»` validation at creation time — `createRelationship` performs no checks at all, so `requirement → block «satisfy»` (the wrong direction) is freely creatable. | `App.tsx:9317` |

---

## 6. Simulation linkage

| Link | Status | Detail |
|---|---|---|
| BDD Block → state-machine simulator | **None** | The simulator consumes `states/transitions/variables` only. |
| BDD Block / IBD Part → V-Lab | **None** | V-Lab is fed by DOE results (`handleExportToVLab`, `App.tsx:6536`). |
| BDD Block / IBD Part → X-Bridges | **None** | X-Bridges is fed by DOE results or `state.xBridgesModel` sub-workspaces (`App.tsx:6639`). |
| IBD connectors → simulation signal flow | **None** | Connectors are rendered and exported as diagrams; they are never executed. |
| Block `constraints` → parametric solver | **None** | `BlockData.constraints` is stored as free text and displayed; it is never parsed or solved. |
| Requirement → test/HIL evidence | **Stub** | `TraceableElement.requirementIds` hard-coded `[]` (F-6). |
| SysML → OPM → simulation | **One-shot import** | `SysmlToOpmImporter` converts once; subsequent edits/deletions in the SysML model do not propagate (F-8). |
| State → X-Bridges sub-model | **Works, cascade-unsafe** | Deleting a state discards its whole `xBridgesModel` with no warning. |

**Consequences:** deleting a block can never break a simulation (no link to break), but equally **no simulation result can be traced back to a block or requirement**. For a tool that generates C code, flashes hardware and produces verification reports, that missing edge is the single biggest traceability gap in the product.

`F-8` in detail: SysML `«satisfy»` points **block → requirement**; OPM `satisfies` (ISO 19450, per ADIA's own `OpmLinkRules.ts`) requires **requirement → object**. `SysmlToOpmImporter.RELATION_MAP` maps `satisfy → { link: 'satisfies' }` **without `flip`**, so every imported satisfaction link is born invalid against ADIA's own OPM validator. The same map correctly sets `flip: true` for `generalization` — so the omission looks like an oversight, not a decision.

---

## 7. Deletion semantics — required vs. implemented

### 7.1 The two live delete paths

| Path | Entry point | Cascade? | Confirms? | Cleans back-refs? |
|---|---|---|---|---|
| **A — panel button** "Delete Block" / "Delete Part" | `App.tsx:9296` / `9368` → `cascadeDeleteReportElement` | **Yes** (ports, typed/nested parts transitively, connectors, relationships) | No | No |
| **B — Delete key / Backspace, Ctrl+X** | `App.tsx:13254` → `deleteNonStateElements` (`App.tsx:8960`) | **No** — flat `filter` on the selected IDs only | No | No |
| **C — individual edge/connector deletes** | `deleteRelationship`, `deleteConnector`, `deleteInterfaceRealization` | N/A (single element) | No | N/A |
| **D — state delete** | `deleteStates` → `deleteConfirmState` dialog → `executeDeleteState` | **Yes** (states, layers, junctions, transitions, dependent blocks/parts/connectors/interfaceRealizations) | **Yes** — shows child-state and sub-layer counts | Partially |

Path **B** is the one users reach for. It is also the only one that leaves the model corrupt.

### 7.2 Measured divergence (reference project)

Deleting block **`Pot / Boiler Interface`**:

| | Parts | Connectors | Diagnostics after `reconcileReportModel` |
|---|---|---|---|
| Path A (panel button) | 13 → **12** | 14 → **13** | 0 |
| Path B (Delete key) | 13 → **13** (1 orphan part `pot_boiler` typed by a deleted block, still wired by 1 connector) | 14 → **14** | **0 — corruption is invisible** |

The same divergence repeats for every block that types a part (`Bridge Rectifier + HV DC Bus`: 3 orphan connectors; `AC Input + Protection`: 2; `Pot / Boiler Interface`: 1).

Deleting block **`Smart Induction Coffee Heater`** (the only IBD context):

```
parts 13 → 0   connectors 14 → 0   relationships 83 → 80
UI: a single "Deleted block: …" info toast. No confirmation, no impact summary.
```

Deleting requirement **`Housing Material REQ-M-001`**:

```
relationships removed: 1
blocks still holding satisfiedReqIds -> deleted requirement: 1  ["Bottom Plastic Housing"]
```

### 7.3 Conformance matrix

Legend: ✅ done · ⚠️ partial / one path only · ❌ missing

| Deleted element | Required by SysML/UML | Path A | Path B/D | Notes |
|---|---|---|---|---|
| **Block** | delete owned ports, value properties, constraints, nested classifiers | ⚠️ ports yes; `classes[]` nested ids not cleaned | ❌ | `BlockData.classes` keeps stale ids |
| | delete parts typed by or contained in it, transitively | ✅ | ❌ | F-1 |
| | delete its connectors & relationships | ✅ | ⚠️ relationships only | |
| | delete interface realizations bound to it | ❌ | ❌ | F-4 (latent: 0 in sample) |
| | remove it from other blocks' `satisfiedReqIds` | ❌ | ❌ | F-4 |
| | re-home or delete requirements whose `layerId` points at it | ❌ | ❌ | orphan layer risk |
| | reset navigation if it was the open IBD/requirement layer | ❌ | ❌ | G-11 |
| | preview impact + warn about newly-uncovered requirements | ❌ | ❌ | F-3 (states have it, blocks don't) |
| **Requirement** | delete its `satisfy/verify/deriveReqt/refine/trace/copy` dependencies | ✅ | ⚠️ | |
| | remove it from `satisfiedReqIds` of blocks/parts | ❌ | ❌ | F-4 — measured |
| | flag orphaned derived requirements | ❌ | ❌ | |
| **Part** | delete nested descendant parts | ✅ | ❌ | |
| | delete its connectors | ✅ | ❌ | |
| | delete its interface realizations | ❌ | ❌ | |
| | **keep** its type block | ✅ | ✅ | correct |
| **Port** | delete connectors on it, remove from owning block | ⚠️ correct logic exists in both `cascadeDeleteReportElement` and `cascadeDeletePort` | ❌ | **`deletePort` does not exist in the UI** — ports can be created but never deleted, so both implementations are unreachable |
| **Connector / Relationship** | delete only itself | ✅ | ✅ | |
| **State** | delete sub-states, sub-layers, junctions, transitions, dependent SysML elements, per-state X-Bridges model | ✅ with confirmation | | the one well-behaved path — use it as the pattern |
| **Variable** | unbind HMI components / transition actions referencing it | ❌ | ❌ | no `deleteVariable` exists at all |

---

## 8. Gap register

Severity: **P0** = data loss / silent corruption · **P1** = standards non-conformance or broken traceability · **P2** = quality/usability.

| ID | Area | Severity | Finding | Evidence | Required change |
|---|---|---|---|---|---|
| **G-01** | Deletion | P0 | Delete key / Ctrl+X bypass the cascade (`deleteNonStateElements`, flat filter) → orphan parts typed by deleted blocks, orphan connectors, **0 diagnostics** | measured, §7.2 | Route **all** deletions through one `deleteElements(ids)` API that calls the cascade engine; keep `deleteNonStateElements` only as a thin wrapper |
| **G-02** | Architecture | P0 | `sysmlIntegrityService` is dead code; two competing rule sets | `grep -rn sysmlIntegrityService src` → only a type comment | Create `src/services/sysmlAdapter.ts` (planned in 2026-08-09 review, never built) mapping `BlockData/PartData/ConnectorData/RelationshipData` ⇄ `SysMLDiagramState`; make the service the single authority; either delete the duplicate cascade in `reportModelConsistency` or re-express it as a thin delegate |
| **G-03** | Deletion UX | P0 | No impact preview/confirmation for blocks, parts, requirements; a single click can delete 13 parts + 14 connectors | §7.2 | Generalise `deleteConfirmState` into `DeletionImpactDialog` backed by `previewDeletionImpact`; show parts/connectors/relations/requirements affected; always `addToHistory()` first |
| **G-04** | Diagnostics | P1 | `reconcileReportModel` validates `part.blockId`, `parentBlockId`, `parentPartId` but **not `part.typeId` / `typeBlockId`** → orphan parts are never reported | `reportModelConsistency.ts:210–232`; measured (0 diagnostics on a corrupt model) | Add `INVALID_TYPE` / orphan-part detection; make the oracle produce a non-empty diagnostic for the §7.2 path-B state |
| **G-05** | Deletion | P1 | Back-references are never cleaned: `satisfiedReqIds` on delete of a requirement (measured), `interfaceRealizations` on delete of a block/part, `classes[]` nested ids, `layerId` on delete of a layer block | §7.2 | Extend the cascade to sweep all reverse indices |
| **G-06** | Traceability | P1 | RTM "Satisfied By" ignores `«satisfy»` relations; two sources of truth | `App.tsx:893,950` | Derive the RTM from relationships (canonical) and treat `satisfiedReqIds` as a legacy/derived cache; add a consistency check that fails loudly when they disagree |
| **G-07** | Validation | P1 | `createRelationship` performs **zero** validation; `validateTraceabilityRelation`, `validateConnectorConnection`, `validateUniqueRequirementIds` are never called | `App.tsx:9317` | Call the service on every create/update; surface `ValidationResult.reason` via `addError('error', …)` |
| **G-08** | Standards | P1 | `deriveReqt` hierarchy direction inverted in RTM and architecture report; `derive`/`deriveReqt` token duplication; no `«copy»`; `allocation` should be `«allocate»`; `refine`/`refines` mismatch | §3.1 | Canonicalise tokens on load (already implemented in `migrateSysMLState` — just call it); invert `deriveReqt` traversal; add `copy` |
| **G-09** | Ports | P1 | Port **direction is never captured** (0/28) so connector-direction rules cannot fire; **no way to delete a port** although `cascadeDeletePort` exists | measured; `grep deletePort` → none | Add direction to the port editor (default `inout`), enforce on connect, add "Delete port" using `cascadeDeletePort` |
| **G-10** | Deletion | P1 | `interfaceRealizations` not swept when a block/part/interface is deleted | `App.tsx:9296` never calls `setInterfaceRealizations` | Include in the cascade result |
| **G-11** | Navigation | P1 | Deleting the block that is the current layer leaves `currentLayerId`/`layerStack`/`layerPath` pointing at a deleted block; undo restores the model but not navigation state | `App.tsx:9296` vs `executeDeleteState` (which *does* fix navigation) | Mirror `pruneMultipleStatesHierarchy`'s navigation repair for the SysML layer; include navigation in the history snapshot |
| **G-12** | Validation | P1 | `performValidation` (`App.tsx:7959`) runs only on `states/transitions/junctions/variables` — the SysML model has **no live diagnostics at all** | `App.tsx:8400` | Add SysML checks (dangling refs, orphan parts, duplicate REQ IDs, uncovered requirements, direction violations) to the reactive validation effect |
| **G-13** | Reporting | P1 | PDF/DOCX reports contain no Requirements Traceability Matrix and no coverage/orphan statistics | `generateArchitectureReport.ts` | Add an RTM section: requirement × satisfying element × verification method × verification evidence, plus a coverage summary |
| **G-14** | Traceability | P1 | Requirement → test/verification chain is a stub (`requirementIds: []`); `«verify»` unused; HIL/V-Lab/SM evidence carries no REQ IDs | `smSemanticBuilder.ts:789,798` | Populate `requirementIds` from `«verify»`/`«satisfy»`/`«refine»` relations; stamp REQ IDs into test manifests, C test suites, HIL evidence bundles and the verification report |
| **G-15** | OPM interop | P1 | `SysmlToOpmImporter` emits `satisfies` in SysML direction (block → requirement), violating `OpmLinkRules` (requirement → object) | `SysmlToOpmImporter.ts:17–22`, `OpmLinkRules.ts` | Add `flip: true` for `satisfy`/`verify`; add a round-trip test asserting imported edges pass `validateOpmConnection` |
| **G-16** | Simulation | P1 | No structural→behavioural→simulation linkage; `BlockData.constraints` are never evaluated; IBD connectors are never executed | §6 | Decide and document: either (a) attach a state machine / V-Lab model to a Block via `«refine»`, or (b) state explicitly that BDD/IBD is documentation-only. Add a parametric solver for `constraints` or remove the field from the UI |
| **G-17** | UX / scale | P2 | Open items carried from the 2026-08-09 critical review: BR-06 (no canvas virtualisation for 55 MB / 48-tab projects), BR-09 (`customStereotypes` stored but unusable), BR-11 (no context menu / duplicate), BR-12 (no version/conformance panel) | `docs/superpowers/plans/2026-08-09-sysml-pdf-review-implementation-plan.md` | Schedule; add a SysML v1.6 / v2 conformance statement panel |
| **G-18** | Data model | P2 | Part ownership is ambiguous: `blockId` (IBD context in App + `reportHierarchyEngine`) vs `parentBlockId`/`typeBlockId` (context/type in the integrity service) vs `typeId` (type in App) | `App.tsx:9351`, `sysmlIntegrityService.ts:117`, `reportHierarchyEngine.ts:57` | Pick one canonical pair (`contextId`, `typeId`), migrate on load, update all three consumers |
| **G-19** | Safety | P2 | Deleting a state silently discards its `xBridgesModel`; deleting a variable has no path at all (no `deleteVariable`) | `App.tsx:9044` | Warn on state delete when a sub-simulation model exists; add variable deletion with cascade to HMI bindings and transition actions |

---

## 9. Change plan

### Phase 0 — stop the bleeding (P0, ~1 week)

1. **One delete path.** Add `deleteModelElements(ids: string[])` in `App.tsx`; make path A, path B (Delete key), Ctrl+X and the panel buttons all call it. Implement it as: `addToHistory()` → build `SysMLDiagramState` via the new adapter → `previewDeletionImpact` → confirm dialog → `cascadeDelete*` for each kind → sweep reverse indices (`satisfiedReqIds`, `interfaceRealizations`, `classes`, `layerId`) → repair navigation → apply atomically.
2. **Build the adapter** `src/services/sysmlAdapter.ts` (+ tests) and make `sysmlIntegrityService` the single authority; reduce `cascadeDeleteReportElement` to a delegate or delete it (keeping `reconcileReportModel` / `buildReportSnapshot`, which are report-specific and good).
3. **Generalise the confirmation dialog** from `deleteConfirmState` to all element kinds, using `previewDeletionImpact` for the counts.

*Acceptance:* the §7.2 scenario (delete a typed block with the keyboard) must end with **0 orphan parts** and a confirmation dialog listing the part and connector that will go with it.

### Phase 1 — close the diagnostics and traceability holes (P1, ~2–3 weeks)

4. Extend `reconcileReportModel` (`typeId`, reverse indices, requirement coverage) so corruption is *always* visible; wire the result into `performValidation` (G-04, G-12).
5. Reverse-index sweep in the cascade (G-05, G-10) + navigation repair (G-11).
6. RTM rewrite: read from relationships, cross-check the `satisfiedReqIds` cache, add coverage/orphan/verification columns (G-06, G-09-analytics).
7. Create-time validation for relationships, connectors and requirement IDs (G-07, G-13-partial); add port direction + port deletion (G-09, BR-02).
8. Token canonicalisation on load (`derive`→`deriveReqt`, `allocation`→`allocate`, add `copy`) and correct `deriveReqt` traversal (G-08).
9. Populate the requirement → test chain (G-14) and add an RTM section to the PDF/DOCX report (G-13).
10. Fix the OPM import direction and add the round-trip test (G-15).

### Phase 2 — architectural (P1/P2, ~1 quarter)

11. Decide and implement the structural→simulation linkage (G-16): block `«refine»` → state machine / V-Lab / X-Bridges model, with the link used by the traceability engine and the HIL evidence bundle.
12. Canonicalise part ownership fields (G-18) and back it with a migration.
13. Publish a SysML v1.6 conformance statement + a v2 migration map (KerML `satisfyRequirementUsage` etc.), then virtualise the canvas (BR-06), expose `customStereotypes` (BR-09), add a context menu (BR-11).

### Test-first requirements (TDD, per repo convention)

Every item needs a failing test first. Minimum new suite:

* `sysmlAdapter.test.ts` — round-trip mapping for all four collections.
* `deletePaths.parity.test.ts` — assert **identical** post-state for keyboard delete vs. panel delete vs. service cascade, for block / requirement / part / port, including reverse indices.
* `deletionOrphans.test.ts` — after any single delete, `reconcileReportModel` yields zero dangling/invalid/orphan diagnostics.
* `traceability.direction.test.ts` — table-driven over `satisfy / verify / deriveReqt / refine / trace / copy`.
* `rtm.consistency.test.ts` — relationship-derived coverage equals `satisfiedReqIds`-derived coverage.
* `opmImport.roundtrip.test.ts` — every imported edge passes `validateOpmConnection`.

---

## 10. Method, evidence and limitations

**How the measurements were produced.** Every number in §4 and §7.2 is regenerated by a committed audit script that loads the pure TypeScript services directly with Node 22's type stripping and runs them against the project file:

```bash
node --experimental-strip-types scripts/sysml_model_audit.mjs                    # reference project
node --experimental-strip-types scripts/sysml_model_audit.mjs path/to/other.json  # any .adia project
```

It prints the census, the SysML v1.6 direction verdict per relationship type, RTM coverage, the cascade-vs-flat deletion comparison with the resulting diagnostics, and the blast radius of deleting each IBD context block.

**Limitations.**

* `npm install` fails in this sandbox (`ECONNRESET` fetching `xlsx` from `cdn.sheetjs.com`, then a lockfile error). **The test suites were therefore reviewed statically, not executed.** The Phase-0 acceptance tests above must be run in CI (`npx vitest run src/services src/features/reporting`) before merging any fix.
* Line numbers refer to commit `b725336` and will drift; treat them as signposts.
* Findings about `interfaceRealizations` and `deriveReqt` are **latent** in the reference project (0 and 0 instances respectively) — they are code-level defects that will surface as soon as users exercise those features.

**Related prior work in-repo** (all still open unless noted):

* `docs/superpowers/plans/2026-08-07-sysml-architecture-update-plan.md` — created `sysmlIntegrityService` (done, but see G-02).
* `docs/superpowers/plans/2026-08-09-sysml-pdf-review-implementation-plan.md` — the BR-01…BR-12 critical review; **BR-01 is now partially closed** by `cascadeDeleteReportElement` (panel path only), BR-02/03/04/07/08/10/11/12 remain open, BR-06/09 not started, and the planned `sysmlAdapter.ts`, `DeletionImpactDialog.tsx`, `CustomStereotypePanel.tsx`, `SysMLVersionPanel.tsx` were never created.
* `docs/superpowers/plans/2026-08-31-bdd-ibd-interactive-drilldown.md`, `2026-08-14-report-diagram-rendering.md`, `2026-09-07-report-diagram-consistency.md` — reporting work that is complete and holding up well.

---

## 11. Standards references

* OMG SysML v1.6 — requirements relationships (§16): `satisfy`, `verify`, `deriveReqt`, `refine`, `trace`, `copy`; dependency client/supplier direction — [Webel commentary quoting SysML-1.6](https://www.webel.com.au/node/1451).
* Requirement relationship arrow direction and flow-down semantics — [ScienceDirect, *Requirement Relationship*](https://www.sciencedirect.com/topics/computer-science/requirement-relationship).
* OMG SysML v2.0 / KerML 1.0 / SysML v2 API — final adoption 21 July 2025 — [OMG press release](https://www.omg.org/news/releases/pr2025/07-21-25.htm).
* OMG issue tracker, SysML 1.6/1.7 RTF — `DeriveReqt` OCL client/supplier constraints, `getSatisfiedBy` derivation — [issues.omg.org](https://issues.omg.org/issues/spec/SysML/1.6).
* ISO/PAS 19450 (OPM) — link semantics implemented in `src/components/entropy/OpmLinkRules.ts` and `OpmSimulationEngine.ts`.
