# ADIA SysML release review (2026-10-19)

Final pre-release review of ADIA's SysML modelling against SysML v1.6 / UML 2.5 and Cameo behaviour.
It checks one rule throughout: every UI element must be backed by repository data and gateway commands.
That means nothing is drawn or editable without being stored, and nothing is stored that no screen shows.

## Method

- **Plan.** The planner/reviewer split the application into six audit areas:
  1. package / BDD / diagram frames;
  2. IBD;
  3. requirements;
  4. use case / sequence / activity;
  5. state machine;
  6. model tree / property panels / persistence.
- **Audit.** Six read-only executors audited one area each and reported findings with code evidence.
- **Verify.** The planner checked the key findings in the code. Executor reports were treated as claims, not facts.
- **Fix.** Six fix packages (F1–F6) were implemented by executors on separate branches, test-first. The planner reviewed every diff, merged it and ran the full suite.

## Diagram frame (the "pkg [Model] … boundary")

The frame on a package diagram is not specific to any model. ADIA draws a derived SysML Annex A diagram frame. It is never stored, and its header is built from the diagram's own record:

`kind [context metaclass] context name [diagram name]`

The diagram record supplies the kind, the owner/context and the name.

Before the review the frame looked model-specific for two reasons:
- it was drawn only for package diagrams;
- on a new, empty diagram it sat under the floating canvas toolbar, so its header was hidden.

After F1:
- Every BDD, requirements, package and IBD diagram gets the same frame. Use case, sequence and activity diagrams already had one.
- An empty diagram's frame is anchored below the toolbar.
- The context metaclass covers every definition kind.
- The header follows the owner when the diagram is moved or the owner is renamed.

A user cannot "create" a frame, and does not need to: Cameo draws it in the same way.

## Fixed

| Pkg | Severity | Finding | Fix |
|---|---|---|---|
| F2 | blocker | The requirement property panel wrote `reqId` / `description` / `verificationMethod` and capitalised enums as stray keys. ID and text edits reverted on the canvas. | Edits map to `requirementId` / `text` / `owner`. Enums are stored lowercase. Fields with no model data were removed. |
| F2 | major | The requirement status lifecycle (e.g. Verified needs passing evidence) was enforced only in one panel. | Enforced in the gateway for every edit path. |
| F2 | major | Double-clicking a requirement entered an always-empty layer. Every requirements diagram showed all requirements. | No drill-down; nested requirements stay on the diagram with containment lines. A diagram shows its own presented set. |
| F2 | minor | TestCase "Status" wrote a field that is never read. | Removed. The TestCase method now writes `VerificationCase.method`. |
| F1 | major | The IBD connector inspector wrote projection-shaped stray keys. Item-flow edits never reached `itemFlowId`. The Label field had no model field. | `buildConnectorUpdateCommand` maps the editor value to real `ConnectorUsage` fields. Label removed. Inspector Source/Target are read-only. |
| F1 | major | The "Nested Classes / Parts" textarea stored nothing. Operations and constraints were silently cut to 2 on the canvas. | Textarea and compartment removed (parts are real parts). All features are drawn. |
| F1 | major | Changing a port kind left `portKind` and stereotypes stale and skipped the proxy/full typing rule. A full port accepted an InterfaceBlock. | Kind fields change together. The typing gate runs on kind/type edits. Full port = Block / ValueType. |
| F1 | minor | Port multiplicity was stored but had no editor. IBD frame geometry was lost on a mixed update. Debug logging remained. | Multiplicity field added; geometry kept; logging removed. Requirement compartments use `id = "…"` / `text = "…"`. |
| F3 | major | `moveElements` refused enumeration, signal, constraint block, unit, quantity kind, actor and use case moves, which creation allowed. Use case / actor / subject moves silently did nothing. | Moves use the single ownership policy (the one creation uses), and those elements really move. |
| F3 | major | A qualified-name `namespace` went stale on move or package rename. Type resolution and duplicate-name checks used it. | Recomputed in the same transaction. The panel Namespace field is read-only. |
| F3 | major | Deleting a block left its IBD as a ghost diagram. Parts typed by a deleted definition kept a dangling type. | The delete cascades owned/contextualised diagrams, which also appear in the impact preview. Dangling types are cleared (undoable). |
| F3 | major | Value properties and activity partitions could not be renamed, retyped or deleted (`ELEMENT_NOT_FOUND`). | Every block property kind is handled. |
| F3 | minor | `createDiagram` accepted any owner for bdd/ibd/req/rtm. A block-owned BDD created packages inside a block. The "New" menu listed every type twice. | Owner rules added. Creation resolves to the nearest package. Menu de-duplicated; unsupported entries are disabled with a reason. |
| F4 | blocker | The History dropdown created its H/H* junction in the parent region, so neither the simulator nor Generate C/H saw it. | The junction is created in the state's own region. The dropdown is derived from it. Junction/transition deletion is undoable. |
| F4 | major | The "Internal / Local" flag was allowed on any transition; on a sibling target the semantic builder rejects it. | Enabled only for self or descendant targets. |
| F4 | minor | A region with only some parallel states gave no diagnostic. Explorer-created states, transitions and junctions differed from canvas-created ones. Internal-transition syntax was checked only for `[guard]` lines. | Validate error added. Explorer defaults match the canvas; one region per state. Every line is parsed. |
| F5 | blocker | "Save modules → Unified project file" wrote the raw repository, and reopening lost all diagram content. | It uses the main Save payload. |
| F5 | major | Tree rows for ports and properties selected the owning block. Elements whose only children are relationships could not expand (137 of 330 relationships unreachable in MR_PLD). Lifelines and messages were missing in the lazy tree. | Rows select the feature itself. Relationships and interaction content are projected. |
| F5 | major | Ctrl/Shift multi-select and "Open Specification" were not wired. Delete on an element not on the canvas skipped the impact review. Open kept the previous project's safety mode and settings. | Wired. The gateway impact review is used for deletion. Open resets absent fields. Menu keyboard navigation follows display order. |
| F6 | major | Deleting several messages or activity nodes at once restored earlier deletions (stale repository). | One batch planned against an evolving snapshot, as one undo step. |
| F6 | major | Actor generalization was read from a field no UI writes. | Derived from the `useCaseGeneralization` relationships the diagram creates. |
| F6 | major | Combined fragments could cover non-member messages. | `FRAGMENT_NOT_CONTIGUOUS` in the builder and the validator. |
| F6 | minor | The use case subject was a bare rectangle. Use case description and call-message operation had no field in the inspector. Untyped lifelines raised no diagnostic. | "Subject (Block)" writes `realizedByBlockId`; the boundary shows the Block name. Description and Operation fields added. `LIFELINE_UNTYPED` warning added. |

## Documented deviations (kept for this release)

- **Transition priority is outer-first.** ADIA uses the Stateflow convention. UML/Cameo give inner transitions priority. The simulator and Generate C/H agree.
- **No completion transitions.** A transition without a trigger is guard-polled. A composite's unguarded outgoing transition does not wait for its regions' final states.
- **Not expressible in ADIA:**
  - Activity: send-signal, accept-event and streaming actions.
  - Operations: a call message references an operation by its signature text.
  - Ports: interface-owned ports.
  - Parametrics: there is no parametric canvas.
- **Tree pillars.** The tree groups top-level packages under Structural / Behavior / Parametric / Requirements pillars, chosen by content. Cameo lists them directly under the Model.

## Open items

- `onRevealInContainment` ("Reveal in Tree") has no App implementation; it selects only.
- `src/help` live-UI coverage has 70 unreviewed controls. They belong to the TRM simulation panels (ScenarioEditor, SimVerificationPanel, RequirementAssignmentsPanel, traceability simulation) and predate this review. They need help bindings before the help gate passes.
- Pre-existing environment test failures:
  - no avr-gcc / host C toolchain;
  - Node `*.test.cjs` suites under vitest;
  - Playwright performance specs;
  - App.sysmlLabels "exports legacy requirement links" (xlsx is now loaded lazily).
