# SysML 1.6 / Cameo — Remaining Coverage Implementation Plan

Author: planning model (Opus 5.5). Implementers: Sonnet 5.5 agents, one phase at a time, in order.
Scope: everything still missing after the 2026-10 conformance work, excluding the state machine and code generation (do not touch either).

| Phase | Item | Changes saved data |
|---|---|---|
| 1 | Unit and QuantityKind as real elements | adds definition kinds |
| 2 | Allocation everywhere + allocation matrix | no |
| 3 | Use Case diagram canvas | adds a diagram kind |
| 4 | View, Viewpoint, Stakeholder, «conform», «expose» | adds definition + relationship kinds |
| 5 | Activity diagram | adds a definition kind + diagram kind |
| 6 | Sequence diagram | adds a definition kind + diagram kind |
| 7 | Remove part usage records (format v5) + nested connector ends | **yes — format upgrade** |

---

## 0. Rules for every phase (read first)

### 0.1 Working environment
- Drive C: is full. Before any `node` command, in the same PowerShell call:
  `$t = Join-Path (Get-Location) 'node_modules\.cache\claude-tmp'; New-Item -ItemType Directory -Force $t | Out-Null; $env:TEMP=$t; $env:TMP=$t; $env:npm_config_cache=$t`
- Never use `npx`. Run tools directly and write output to a file in `$t`, then print only summaries:
  - typecheck: `node node_modules/typescript/bin/tsc --noEmit -p . *> "$t\tsc.txt"`
  - tests: `node node_modules/vitest/vitest.mjs run <paths> --no-file-parallelism --reporter=dot *> "$t\out.txt"` then `Select-String -Path "$t\out.txt" -Pattern 'Test Files  |      Tests  | FAIL '`
  - architecture: `node node_modules/tsx/dist/cli.mjs scripts/verify_sysml_architecture.ts *> "$t\arch.txt"`
- Delete `$t` at the end of the phase.
- Do **not** `git commit`, switch branches, stash, or create worktrees. Another session edits this working tree (especially `src/App.tsx` and some tests). Never revert changes you did not make.
- Files use mixed line endings (App.tsx and the gateway are CRLF). Prefer the Edit tool; never use PowerShell string replacement on TypeScript containing backticks or `${`.

### 0.2 Known pre-existing failures (not yours — do not "fix")
- `src/components/sysml/App.sysmlLabels.test.tsx` "renders a visible BDD block name" ×3
- `src/components/modelExplorer/AppModelExplorer.actions.test.tsx` diagram-context creation ×3
- `src/services/sysmlPresentationCommands.test.ts` "creates the missing IBD context presentation…"
- `src/engine/sysml/requirementsDiagramScope.appIntegration.test.ts`
- `src/components/vlab/vlabSymbols.test.tsx`
- AI tests that `rmSync` a temp dir (`engineeringIntelligence*`, `patternPromotionService`) fail only because of the temp redirect.
- `largeModelStress` / `largeModelBenchmarkGate` are timing tests; if they fail, rerun them alone with `--no-file-parallelism` before concluding anything.

### 0.3 Architecture rules (enforced by review)
1. **Repository first.** Every change to the model goes through `executeSysmlCommand` (`src/services/sysmlCommandGateway.ts`). No component mutates repository objects. The architecture script must stay green.
2. **Logic in pure modules, UI thin.** Semantics, validation, layout and projection go in `src/engine/sysml/**` or `src/features/sysml/**` as pure functions with unit tests. React components only render and dispatch.
3. **New diagrams are self-contained workspace components** in `src/components/sysml/`, mounted in `App.tsx` exactly like `PlantUmlWorkspace` (one `{diagramMode === 'x' && <XWorkspace … />}` block). Props: `repository`, `diagramId`, `diagramPresentations`, `onExecute(command) => SysmlCommandResult`, `onNavigate(elementId)`, `onSelect(ids)`. Keep each App.tsx edit small and localized.
4. **Prefer definition kinds over new collections.** New classifier-like elements (Unit, QuantityKind, View, Viewpoint, Stakeholder, Activity, Interaction) are new members of `SysmlDefinition` in `src/engine/sysml/model.ts` with `kind` added to `DEFINITION_KINDS`. That reuses existing routing, persistence, explorer tree, deletion and V4 plumbing. Nested content (activity nodes, lifelines, messages) lives in arrays on the definition, like `BlockDefinition.properties`.
5. **New relationship kinds** extend `SysmlRelationship['kind']`, then: `V4_RELATIONSHIP_METACLASS` (compile error until you do), `connectionPolicy.ts` (single source of endpoint legality — add a branch in `evaluateSysmlConnection` and in `validDiagram`), `edgeNotation.ts` keyword, `RELATIONSHIP_KIND_LABELS`. The test `capabilities/ruleTablesAgree.test.ts` must stay green.
6. **New diagram kinds** extend `DiagramKind` in `src/engine/sysml/domain/presentations.ts`, then: `allowedDiagramKinds` + `SYSML_DIAGRAM_KINDS` + `DIAGRAM_KIND_LABELS` (`src/features/modelExplorer/modelExplorerCapabilities.ts`), `diagramKindAbbreviation` (`src/features/sysml/diagramFrame.ts`), `DiagramMode` in `App.tsx`, and diagram activation/opening (`openExactDiagramById` → `setDiagramModeState`). Check `grep "diagramKind ===" src` for switch-like code that needs the new kind.
7. **Every new element kind must be checked against this list** (grep for an existing kind such as `'signal'` to find each place): `DEFINITION_KINDS`, `connectionPolicy.familyOfMetaclass` + `fromLegacyKind`, `domain/base.ts` `MetaclassKind`, `capabilities/catalog.ts`, `capabilities/ownershipPolicy.ts` (`OWNERSHIP_MATRIX`, `resolveSemanticElement`), `persistence/migrateV3ToV4.ts`, `modelExplorerFactories.ts` (factory), `sysmlExplorerAdapter.ts` (create branch, both kind maps, `EXECUTABLE_EXPLORER_KINDS`), `ModelTreeRow.getNodeKindIcon`, `validation/definitionRules.ts` (rules), `interchangeReport.ts` (nested ids that can be endpoints).
8. **Notation:** names via `sysmlObjectLabel` / `resolveSysmlReferenceLabel` — never render an internal id. Colours via existing CSS tokens (`var(--sysml-…)`), both themes.
9. **Undo:** each user action is one gateway command (use `batch` for multi-step, which merges into one undo step).
10. **Persistence:** every new field must survive `serializeRepository` → `loadRepository`. Write that test.

### 0.4 Definition of done (every phase)
- Typecheck exit 0; architecture script PASS.
- New pure-module tests + gateway round-trip test (create → undo → save/load) pass.
- Full run of `src/engine/sysml src/services src/features src/components` shows only the §0.2 failures.
- `src/engine/sysml/profile.ts`: the phase's capability entry updated honestly (`supported` only if fully done; otherwise `partial` with a precise limitation) and `profile.test.ts` updated.
- A short report: files changed, tests added, behaviour changes, anything deliberately left out.

---

## Phase 1 — Unit and QuantityKind as elements

**SysML 1.6 §8.3.2.10–11 (and QUDV, Annex E).** A ValueType may reference a Unit and a QuantityKind; a Unit references its QuantityKind.

Model (`model.ts`):
- `QuantityKindDefinition { kind: 'quantityKind'; symbol?: string; description?: string }`
- `UnitDefinition { kind: 'unit'; symbol: string; quantityKindId?: string }`
- `ValueTypeDefinition` gains optional `unitId?`, `quantityKindId?`. Keep the existing free-text `unit`/`dimension` for old files.

Rules (`validation/definitionRules.ts`):
- `unitId` must resolve to a Unit, `quantityKindId` to a QuantityKind (codes `MISSING_UNIT`, `MISSING_QUANTITY_KIND`).
- If a ValueType has both, the Unit's quantity kind (when set) must equal the ValueType's (`UNIT_QUANTITY_KIND_MISMATCH`, warning).
- Unit symbol non-empty; QuantityKind names unique per owner (normal duplicate-name rule covers it).

Load-time migration (idempotent, in `persistence.ts` next to the existing ones, reusing `rememberHash`/`carryBaselinesThroughMigration`): for a ValueType whose free-text `unit` matches an existing Unit's symbol or name, set `unitId`. Never create Units automatically; report how many were linked (`VALUE_TYPE_UNITS_LINKED`, info).

UI:
- Explorer: create Unit / QuantityKind (factories + adapter), icons.
- Inspector (`src/features/sysml/inspectorSchema.ts` / `SysmlPropertyPanel`): ValueType gets Unit and QuantityKind pickers (references, not free text); Unit gets symbol + QuantityKind picker.
- BDD value property rows show `{unit = symbol}` from the resolved Unit, falling back to the legacy text.

Tests: rules; migration links by symbol and is idempotent; persistence round-trip; explorer creation.

---

## Phase 2 — Allocation everywhere + allocation matrix

**SysML 1.6 Clause 15.** «allocate» is an abstraction from any NamedElement to any NamedElement; tools show it in matrices and in `allocatedFrom` / `allocatedTo` compartments.

Engine:
- `connectionPolicy.validDiagram`: `allocation` valid on `bdd`, `ibd`, `requirements`, `package`, and the new `activity`/`useCase` diagrams once they exist. Endpoint legality stays "any resolved named element except Package-to-itself"; self allocation rejected.
- New pure module `src/engine/sysml/allocation.ts`:
  - `allocatedTo(repo, id)`, `allocatedFrom(repo, id)` (names + kinds, sorted).
  - `buildAllocationMatrix(repo, { rowKinds, columnKinds })` → rows/columns/cells (cell = relationship ids), plus coverage counts (unallocated rows).
- Validation: duplicate allocate between the same pair (`DUPLICATE_RELATIONSHIP` already covers it — verify with a test).

UI:
- `src/components/sysml/AllocationMatrix.tsx`, opened like the RTM (`managedWindows` + `toggleWindow('allocation')`, button next to “RTM”). Row/column kind filters (default rows: activities/use cases/blocks; columns: blocks/parts). Clicking an empty cell creates «allocate» (gateway `createElement`); clicking a filled cell selects or deletes it (with the existing confirmation flow). Reuse `VirtualizedTraceabilityGrid` if it fits; otherwise a simple virtualised grid.
- BDD block symbol: optional compartments `allocatedFrom` / `allocatedTo` listing names (only when non-empty).

Tests: matrix projection; cell create/delete through gateway with undo; compartments text; policy now allows allocate on IBD.

---

## Phase 3 — Use Case diagram canvas

The engine exists (`src/engine/sysml/useCases.ts`, collections `actors`, `subjects`, `useCases`, `extensionPoints`, relationship kinds `useCaseAssociation`, `include`, `extend`, `useCaseGeneralization`, `useCaseSatisfy/Refine/Trace`).

- Diagram kind `useCase` (abbreviation `uc`), owned by Package/Model.
- Pure layout/projection module `src/features/sysml/useCaseDiagramView.ts`: from repository + diagram presentation → positioned actors (stick figure), subject rectangles (name at top), use cases (ellipses, extension points compartment), edges with notation:
  - association: solid line; include: dashed open arrow `«include»` (base → included); extend: dashed open arrow `«extend»` (extension → base) with the extension point name and condition note; generalization: hollow triangle; satisfy/refine/trace: dashed open arrow with keyword.
- `UseCaseWorkspace.tsx`: palette (Actor, Use Case, Subject, Extension Point on selected use case, the relationship tools), drag/move/resize through `updatePresentation`, double-click opens owned diagram, delete = remove from diagram (Delete key) / delete from model (explicit button, existing confirmation).
- Use cases placed inside a subject rectangle get `subjectId` set (same derived-nesting idea as `packageNestingLayout.ts`: geometry proposes, gateway command commits, confirm dialog).
- The gateway must accept use-case elements on `useCase` diagrams in `addToDiagram` and `createAndPresent`.
- Remove the Use Case rejection from Package Diagrams only if you also render them there; otherwise leave it.

Tests: view projection (notation per edge kind); extend requires an extension point (already validated — test via UI command builder); subject nesting; create/undo/persist.

---

## Phase 4 — View, Viewpoint, Stakeholder, «conform», «expose»

**SysML 1.6 §7.3.2.** View and Viewpoint are Class-based (not Packages).
- `ViewpointDefinition { kind: 'viewpoint'; stakeholderIds: string[]; concernIds: string[] (Comments/Requirements); purpose: string; languages: string[]; presentation: string[]; methodText?: string }`
- `StakeholderDefinition { kind: 'stakeholder'; concerns: string[] }`
- `ViewDefinition { kind: 'view'; viewpointId?: string (derived from «conform») }`
- Relationship kinds: `conform` (View → Viewpoint; SysML 1.6 makes it a Generalization — render as generalization triangle with `«conform»`), `expose` (View → any element; dashed open arrow `«expose»`).
- Rules: a View conforms to at most one Viewpoint (`MULTIPLE_VIEWPOINTS`); conform source must be View, target Viewpoint; expose source must be View.
- Explorer creation, inspector (purpose, languages, stakeholders picker), rendering on Package diagrams and BDDs as classifier boxes with `«view»` / `«viewpoint»` / `«stakeholder»` keyword and a compartment for viewpoint purpose/concerns.
- Package-diagram tools: add «conform» and «expose» to the relationship tool list (`packageRelationshipNotation.ts`).

Tests: policy agreement test extended; rules; rendering projection; persistence.

---

## Phase 5 — Activity diagram

**SysML 1.6 Clause 11 (UML activities).** Keep it to the Cameo core set.

Model: `ActivityDefinition { kind: 'activity'; parameters: ActivityParameter[]; nodes: ActivityNode[]; edges: ActivityEdge[]; partitions: ActivityPartition[] }`
- `ActivityNode.kind`: `action` (opaque/call-behavior with `behaviorId?`), `initial`, `activityFinal`, `flowFinal`, `decision`, `merge`, `fork`, `join`, `objectNode` (typed, `typeId`), `activityParameterNode` (bound to a parameter).
- Pins on actions: `pins: { id, name, direction: 'in'|'out', typeId }[]`.
- `ActivityEdge`: `controlFlow` | `objectFlow`, `sourceId`, `targetId` (node or pin), optional `guard`.
- `ActivityPartition`: `name`, `representsId?` (Block/part — this is allocation in swimlane form), `nodeIds`.

Rules (`src/engine/sysml/activity.ts`, pure): one initial node max per activity (warning if none); final nodes have no outgoing edges; initial has no incoming; decision has ≥2 outgoing with guards (warning if a guard is missing); fork/join arity; object flows only between object nodes/pins/parameter nodes and type-compatible (reuse `isSameOrSubtype`); control flows not into pins; call-behavior action’s behavior must exist; partition `representsId` must resolve.

UI: `ActivityWorkspace.tsx` with palette, swimlanes (vertical partitions), pins drawn on action borders, notation (rounded action, filled circle initial, bullseye final, diamond decision/merge, bar fork/join). Diagram kind `activity` (`act`), owned by an Activity (diagram context = the activity). Explorer can create Activity under Package/Block. «allocate» from actions/partitions to Blocks via Phase 2 tools.

Tests: rules per node kind; type checks on object flows; projection; create/undo/persist. No execution/simulation.

---

## Phase 6 — Sequence diagram

**SysML 1.6 Clause 12 (UML interactions).**

Model: `InteractionDefinition { kind: 'interaction'; lifelines: Lifeline[]; messages: Message[]; fragments: CombinedFragment[] }`
- `Lifeline { id, name, representsId? (part/reference property of the context Block, or a Block), }`
- `Message { id, name, sort: 'synchCall'|'asynchCall'|'asynchSignal'|'reply'|'createMessage'|'deleteMessage', sourceLifelineId, targetLifelineId, order: number, signatureId? (operation or signal), arguments?: string }`
- `CombinedFragment { id, operator: 'alt'|'opt'|'loop'|'par'|'break'|'critical'|'neg'|'seq'|'strict', operands: { guard?: string; messageIds: string[] }[], coveredLifelineIds }`

Rules (`src/engine/sysml/interaction.ts`): message endpoints exist; a reply follows a synchronous call between the same pair in reverse; signal messages reference a Signal; call messages reference an Operation of the target lifeline’s type (when typed); message `order` unique; fragment operands only contain messages covering covered lifelines; nothing after a delete message on that lifeline.

UI: `SequenceWorkspace.tsx` — lifeline heads + dashed lines, messages ordered vertically (drag to reorder changes `order`), arrows by sort (filled head sync, open async, dashed reply), execution specification bars derived from call/reply pairs, combined fragments as labelled frames. Diagram kind `sequence` (`sd`), owned by an Interaction; Interaction owned by Block or Package.

Tests: rules; ordering commands; projection; persistence.

---

## Phase 7 — Remove part usage records (format v5) and nested connector ends

This is the decision-D1 completion. Design is fixed; do not improvise.

Target model:
- A part is only `BlockDefinition.properties[i]` (`kind: 'part' | 'reference'`). `PartUsage` records disappear from `repo.usages`.
- `PortUsage` records disappear. A port on a part is identified by a **property path**: `PropertyPath = string[]` of property ids starting under the context Block, e.g. `['vehicle.engine', 'engine.crankshaft']`, plus the port id.
- `ConnectorUsage` ends become `sourceEnd/targetEnd: ConnectorEnd { path: string[]; portId?: string }` (path `[]` + portId = boundary port; path non-empty + no portId = part end). This is SysML «nestedConnectorEnd» (propertyPath). Keep `ParametricEnd` as is.
- IBD presentations are keyed by **path string** `path.join('/')` (plus `#portId` for port layouts) instead of usage ids.

Engine work:
1. `src/engine/sysml/connectorEnds.ts` — resolve a path against the context Block through property types (respecting inheritance via `effectiveSupertypeIds`), resolve port on the last part’s type (`findPortDefinition`), compute effective direction with conjugation along the path. Replace `resolvePortUsage`/`resolveConnectorEnd` users in `ibd.ts`.
2. Validation as today (context, kinds, direction, typing, duplicates, delegation rules) but on paths; nested ends allowed at any depth for assembly/binding; delegation still needs boundary ↔ direct inner port (depth 1).
3. `projectLegacyDiagram` keeps producing `PartData`/`ConnectorData` for the App IBD by **deriving** parts from properties (`id = path string`), so the IBD UI keeps working; update `sysmlIbdConnectorCommands.ts` to build paths.
4. Nested parts on an IBD: render a part’s own parts inside its symbol (one level by default, “show nested parts” toggle), so nested ends are clickable.
5. Delete `sysmlPropertyUsageSync.ts` and `services/partUsageSync.ts` usage once nothing reads usages; keep the drift report for migration diagnostics.

Format v5 upgrade (`src/engine/sysml/persistence/migrateV3ToV5.ts`, called from `loadRepository`):
- Run the existing load-time normalisations first (supertypes, requirement ownership, part reconcile).
- Map every PartUsage → its property id (via `propertyId`), every PortUsage → `{ path, portId }`.
- Part usages owned by part usages (nested instances): add the nested property to the owner part’s **type** if absent; if two parts of the same type had different nested contents, create a specialised subtype, retype the part, and report (`NESTED_PART_TYPE_SPECIALISED`).
- Rewrite connectors to `ConnectorEnd`s, rekey IBD presentations, relationships whose ends were usage ids (satisfy/allocate from a part) are rewritten to the property id.
- `schemaVersion: 5`; loader accepts 2/3/4/5; save always writes 5.
- **Backup:** before upgrading, keep the original JSON alongside (`<name>.v3-backup.json` via the project-file layer — find the save path in `src/projectFiles/`) and show an upgrade report dialog listing every change by name. Never upgrade silently.
- Baselines: carry hashes through (`carryBaselinesThroughMigration` pattern, keyed by new ids).

Tests: migration fixtures (flat parts, nested instances, divergent nested contents, connectors with all end kinds, presentations, baselines, satisfy-from-part); round-trip v5; nested assembly connector two levels deep validates and renders; old files load and upgrade exactly once.

Ship order inside Phase 7: (a) connectorEnds module + validation on paths behind both representations, (b) projection from properties, (c) migration + v5 save, (d) delete usage code, (e) nested-part rendering.

---

## Not in this plan
- ConstraintBlock inspector and Parametric canvas (engine exists; recommended next after Phase 3 — same workspace pattern, uses `buildCreateParametricBindingCommand`).
- Activity execution, timing diagrams, SysML v2.
