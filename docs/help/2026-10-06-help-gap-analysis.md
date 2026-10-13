# ADIA Help gap analysis

Date: 2026-10-06. Status: initial source audit, before implementation.

## Evidence and scope

This audit reads the current working tree, including ongoing Sequence and V-Lab changes. Existing unrelated edits must be preserved. The inventory is a reproducible snapshot, not a new runtime registry or a claim of exhaustive semantic review.

- `src/HelpData.ts`: 25 topics across 11 categories; existing related-topic targets resolve.
- `src/App.tsx:4990`: HelpModal, topic navigation, registry-derived block reference and block search.
- `src/components/help/SoftwareArchitectureExplorer.tsx`: existing interactive architecture diagram.
- `src/engine/sysml/capabilities/catalog.ts`: 36 supported element/feature definitions with semantic authority labels.
- `src/features/modelExplorer/modelExplorerCapabilities.ts`: 24 relationship labels and 10 diagram kinds. This label list is not an exhaustive relationship inventory; Use Case and Interaction builders expose additional operations.
- `src/engine/xbridges/BlockDefinitions.ts`: 237 factory entries, all instantiated successfully for this audit. Entries include aliases and internal types; they are not necessarily 237 distinct palette blocks.
- `src/utils/xbridges/XbridgesLibrary.ts`: 212 palette entries, 211 unique type IDs.
- `src/utils/vlabLibrary.ts`: 248 component entries across 13 domains; all provide descriptions and equations.
- Source extraction scanned 720 production `.ts`, `.tsx`, and `.cjs` files, including 89 TSX files. It found 1,277 UI candidate sites in 75 files.

Machine-readable evidence:

- [Registry snapshot](audit/2026-10-06-registry-snapshot.json): topics, catalogs, message kinds, fragment operators, block metadata and anomalies.
- [UI candidates](audit/2026-10-06-ui-candidates.json): source path, line, control tag, available label, handler expression and Help attributes.

UI candidates include repeated, conditional, internal and dynamically labeled controls. One site is not necessarily one feature; a mapped menu can expose many features. Source line IDs are audit locators, not stable production feature IDs. Runtime reachability and semantic mappings remain to be reviewed. No defensible whole-application coverage percentage exists yet.

## Confirmed gaps

| Area | Current evidence | Required work |
| --- | --- | --- |
| Sequence | No dedicated Help topic; implemented SequenceWorkspace and interaction commands | Complete source-checked chapter, example, message/fragment/reference/property help, validation and repository explanation |
| Use Case | No dedicated Help topic; implemented UseCaseWorkspace and use-case commands | Actors, subjects/boundaries, association/include/extend/generalization, extension points, deletion and browser behavior |
| Model Browser / SysML | General Architecture topic, no complete catalog-derived command/property mapping | Map ownership, diagrams/presentations, parts, ports, properties, relationships, traceability, actions and inspector fields |
| Architecture accuracy | `architecture-guide` says Architecture is authored as OPM instead of separate SysML diagrams | Correct separation of native SysML editors and ENTROPY OPM; preserve OPM documentation |
| Software architecture | Existing explorer and a short two-section topic | Update the existing explorer/chapter with commands, repository, persistence, validation, AI and execution boundaries |
| State Machine | Four existing topics but no explicit complete repository/execution chapter | Verify migration, semantic model, simulation and generated runtime paths; cover action order, transition kinds/priority, timers, regions, errors and autostart |
| Code generation | Dedicated topic already exists | Expand pipeline, actual files/functions, X-Bridges integration and validation/error handling; verify supported target language and avoid claiming certification |
| AI | No dedicated chapter; planner, schemas, catalog, adapters and transactions exist | Describe actual routing, clarification, validation, commands, rollback/undo and supported/unsupported domains; distinguish typed transaction paths from legacy adapter routes |
| X-Bridges | Dynamic reference exists; 146 factory entries lack description, 173 lack equation | Author reviewed descriptions/behavior/examples from implementations; equation is optional for logical/stateful blocks, useful behavior explanations are mandatory |
| V-Lab | Five guides and dynamic catalog; metadata is present | Add per-component reviewed usage examples and port/parameter explanations; cover conserving versus directed/vector/composite ports and current solver boundaries |
| Other modules | DOE, HIL, OPM, reports, labs and industrial integration have varying existing material | Reconcile every reachable action, dialog, setting, import/export and workflow against actual implementation |
| Search | Block reference filters by search; topic categories list all topics regardless of search | Full-text topic/section search, results, no-results state and navigation to matched sections |
| Navigation | Categories and related links exist | Section table of contents, previous/next navigation, stable section anchors and contextual routing |
| Contextual Help | Main Help entry and OPM callback exist | Shared topic/context resolver, module entry points and precise action/property Help without global state changes to models |
| Shortcuts | Getting Started promises F1; exact F1 key matches were not found in inspected UI/service sources | Add and verify F1 routing or correct the claim; review other shortcut claims against handlers |
| Coverage | Tests check hard-coded guide keys and presence of transformed catalog fields | Registry-derived feature mappings, content/section integrity checks, UI inventory reconciliation, negative missing-feature tests and report generation |

## Catalog discrepancy

`COSEC` / Cosecant appears in the X-Bridges palette but has no matching factory key. The snapshot also lists factory entries absent from the palette. Do not invent working behavior or silently count these as successfully documented executable blocks. Resolve aliases/reachability using palette insertion and factory handling; retain evidence of any genuine implementation defect for targeted correction.

## Architecture constraints from inspected implementation

1. SysML interaction and use-case edits build domain commands for `sysmlCommandGateway`; semantic content and diagram presentation are separate.
2. `docs/sysml/SEQUENCE_DIAGRAM_SCOPE.md` explicitly documents a practical Interaction subset. Editable occurrence/execution specifications are absent; activation bars are inferred. Constraints are stored expressions, not evaluated timing semantics. PlantUML export omits some model data and is not full interchange.
3. State Machine code generation migrates a chart model, builds a validated semantic model and renders C artifacts. Its repository-isolation test deliberately supplies a poisoned SysML repository and expects no effect on generated code. Help must distinguish chart authority from the SysML repository; it must not imply every domain is already stored in one universal repository.
4. The generated state-machine package includes `sm_config.h`, `sm_mapping.c/h`, `sm_core.c/h`, `sm_safety.c/h`, `sm_user_logic.c/h`, and `mcal_dio.h`; X-Bridges files are conditional. Additional verification/HIL artifacts depend on options.
5. The AI orchestrator has typed transaction execution and legacy gateway paths. Document command/repository requirements and audit adapter integration; do not claim all routes already provide identical guarantees without verification.
6. Semantic authority metadata already distinguishes `OMG_SYSML_1_6`, `UML_FOUNDATION` and `ADIA_EXTENSION`. Reuse it rather than hand-maintaining a second classification.

## Verification baseline

`npx vitest run src/HelpData.test.ts src/components/help --no-file-parallelism`: 3 files, 12 tests passed on 2026-10-06. These checks establish only the existing Help baseline, not complete application coverage or the requested finished upgrade.

## Acceptance measurement

After implementation, report distinct registered features, documented features, missing mappings, missing/invalid content and coverage percentage. Report source-inventory reconciliation separately, including unregistered UI candidates and intentional exclusions. A chapter or registry row alone does not demonstrate useful documentation. The target is 100% of registered user-facing features with valid, useful topic/section mappings, plus no unexplained reachable UI gaps.
