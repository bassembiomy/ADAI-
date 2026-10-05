# SysML Sequence Diagram — Model Integration Implementation Plan

Author: planning model (Opus 5.5). Implementers: Sonnet 5.5 agents, one phase at a time, in order.
Scope: connect the existing Sequence Diagram (Interaction) to every other part of the SysML model: structure (Blocks, parts, ports, connectors), operations and signals, use cases, activities, state machines, requirements and verification, the model tree, the property inspector, deletion/rename, and interchange. The basic editor itself already exists (Phase 6 of `2026-10-03-sysml-remaining-coverage.md`) and is **not** rebuilt here.

| Phase | Item | Changes saved data | Priority |
|---|---|---|---|
| 0 | Referential integrity: delete/rename never strands or blocks the model | no | **Critical — do first** |
| 1 | Lifelines ↔ structure: context Block, parts, ports, connectors | additive optional fields | High |
| 2 | Messages ↔ operations and signals (receptions, item flows) | additive optional fields | High |
| 3 | Interactions ↔ other behaviours: use cases, activities, `ref` frames | additive optional fields | High |
| 4 | Interactions ↔ state machines: state invariants, signal triggers | additive optional fields | Medium |
| 5 | Requirements, verification and traceability | no (policy only) + 1 optional field | High |
| 6 | Model tree, property inspector, navigation, where-used | no | High |
| 7 | Notation fidelity: lost/found messages, duration/time constraints, coregion | additive optional fields | Medium |
| 8 | Interchange and reports: PlantUML export, reports | no | Low |
| 9 | Operations and receptions as identified elements | **yes, format upgrade (v6)** | Medium (last) |

---

## 0. Rules for every phase (read first)

**§0 of `docs/superpowers/plans/2026-10-03-sysml-remaining-coverage.md` applies unchanged**: environment, no commits, no `npx`, the known pre-existing failures, the architecture rules, and the definition of done. Read it before starting. Additional rules for this plan:

1. **One source of legality.** Message/lifeline rules live only in `src/engine/sysml/interaction.ts`. The editor (`SequenceWorkspace.tsx`) and the command builders (`src/services/sysmlInteractionCommands.ts`) call `checkInteractionMessage` and friends; they never re-implement a rule. Relationship endpoint rules live only in `src/engine/sysml/connectionPolicy.ts`.
2. **Severity policy is load-bearing.** The gateway runs `validateSysmlRepository` on the *whole staged repository* for every mutation and rejects on **any** error (verified 2026-10-04, see §1.2). So a new rule may be an **error** only if the editor can prevent the violation at the moment it is created *and* every other command that could cause it (delete, rename, move) cleans it up or is rejected with guidance. Everything else is a **warning**.
3. **Every new optional field** gets: model type, validation, command builder, persistence round-trip test, `migrateV3ToV4` mapping (or an explicit "not mapped" note), and an explorer/inspector decision.
4. **State machine domain** (`src/types/sm_types.ts`, `src/utils/stateMachine/**`, code generators) is touched **only** in Phase 4 Task 4.3, and only with the additive field described there. Do not change code generation.

---

## 1. Current state (verified 2026-10-04)

### 1.1 What exists
- **Model:** `InteractionDefinition` in `src/engine/sysml/model.ts` has `lifelines` (`representsId` = Block or part/reference property), `messages` (6 sorts, `order`, `signatureId`, which is operation **text** for calls or a Signal id, plus `arguments`), and `fragments` (9 operators, operands with guards and `messageIds`, `coveredLifelineIds`). It is owned by the Model, a Package or a Block.
- **Rules:** `src/engine/sysml/interaction.ts` covers endpoints, unique order, reply pairing, signal existence, call operation against the receiving lifeline's Block (inherited operations included), nothing after delete, lifeline represents existence, and fragment coverage.
- **Editor:** `SequenceWorkspace.tsx` with layout in `src/features/sysml/sequenceDiagramView.ts`. Activation bars come from call/reply pairs, and «allocate» labels appear on lifelines.
- **Gateway:** a sequence diagram must be owned by an Interaction and always shows the whole Interaction (`sysmlCommandGateway.ts` ~2936, ~2954, ~3142).
- **Deletion cascade:** deleting an Interaction removes its diagrams and nested ids, and relationships ending on nested ids (`policy.ts` `classifyDeletionTarget`, `mutations.ts` ~237).
- **Endpoints:** nested lifeline/message/fragment ids resolve as relationship ends of family `interaction` (`semanticEndpointIndex.ts` ~82).
- **Capability entry** `seq.sequenceDiagram` in `src/engine/sysml/profile.ts` is `partial`, with an honest gap list.

### 1.2 Verified defects (reproduced in a scratch gateway test)
| # | Action | Result | Severity |
|---|---|---|---|
| D1 | Delete a Block that a lifeline represents | Commits, but the lifeline keeps `representsId` → `MISSING_LIFELINE_REPRESENTS` error. **Every later edit anywhere in the model is then rejected** with that error. | Critical |
| D2 | Delete a Signal used by a signal message | Commits with `MISSING_MESSAGE_SIGNAL` error. Same lock-up as D1. | Critical |
| D3 | Rename/remove an operation called by a message (Block `operations` patch) | Rejected with `UNKNOWN_MESSAGE_OPERATION`. No rename propagation and no guidance to the user. | High |
| D4 | Delete a part/reference property that a lifeline represents | Same mechanism as D1 (not separately reproduced; covered by the D1 test pattern). | Critical |

### 1.3 Connection map (target state)
| Other model area | Link | Today | Phase |
|---|---|---|---|
| Block / part / reference | Lifeline `representsId` | stored, existence-checked; **breaks on delete** | 0, 1 |
| Context Block (Interaction owner) | Lifelines should be the owner's parts or the owner itself | not checked | 1 |
| Ports / connectors (IBD) | Message travels over a connector / via a port | none | 1 |
| Operations | Call message → operation of receiver | text match; **breaks on rename** | 0, 9 |
| Signals / receptions | Signal message → Signal; receiver should accept it | Signal existence only | 2 |
| Item flows | Signal message ↔ item flow conveyed on the realizing connector | none | 2 |
| Use cases | Interaction elaborates/realises a Use Case scenario | `behaviorArtifactIds` unused; UseCase cannot own an Interaction | 3 |
| Activities | Call behavior action invokes an Interaction | only Activities allowed | 3 |
| Other interactions | `ref` (InteractionUse) frames | none | 3 |
| State machine | State invariant on a lifeline; signal ↔ transition trigger | none | 4 |
| Requirements | «satisfy» / «verify» / «refine» / «trace» from an Interaction | «satisfy»/«verify» reject `interaction` | 5 |
| Verification cases | Interaction as the test behaviour | none | 5 |
| Allocation | Lifeline/message «allocate» to structure | lifeline label only | 5 |
| Model tree | Lifelines/messages/fragments under the Interaction | Interaction only | 6 |
| Property inspector | Edit lifeline/message/fragment | inline editors in the canvas only | 6 |
| Where-used | "Shown in Sequence Diagrams" for Block/part/operation/signal | none | 6 |
| PlantUML editor | Export Interaction → PlantUML text | separate, unconnected | 8 |

---

## Phase 0 — Referential integrity (critical)

**Goal:** no delete, rename or move leaves an Interaction with a dangling reference, and a dangling reference that already exists (old files, other sessions) never blocks unrelated edits.

### Task 0.1 — Deletion impact includes interaction references
**Files:** `src/engine/sysml/policy.ts` (`classifyDeletionTarget`), `src/engine/sysml/mutations.ts`, `src/engine/sysml/interaction.ts`, tests in `src/engine/sysml/interactionIntegrity.test.ts` (new).
- [ ] Add `interactionReferencesTo(repo, ids: Set<string>)` in `interaction.ts`. It returns `{ interactionId, lifelineIds[], messageIds[] }` for lifelines whose `representsId` is in `ids`, and messages whose `signatureId` is a deleted Signal id. Include part/reference **property ids** of a deleted Block, because a Block's properties die with it.
- [ ] `MutationImpact` gains `affectedInteractionElementIds: string[]` (lifeline/message ids). `impactSeverity`/`requiresDeletionConfirmation` treat a non-empty list as "needs review", so the user sees "2 lifelines in Startup will lose their type".
- [ ] When the deletion commits, the staged repository **clears** the reference rather than deleting the lifeline/message: `representsId` is removed and the lifeline keeps its name; `signatureId` is removed and the message stays. This matches Cameo: the lifeline survives untyped. Add `sequence` to `affectedDiagramKinds`.
- [ ] Tests: D1, D2 and D4 from §1.2. Each commits, leaves no error diagnostics, and a following unrelated `updateElement` commits.

### Task 0.2 — Operation rename/remove propagation
**Files:** `src/services/sysmlPropertyCommands.ts` (or the place that builds Block `operations` patches; find it with `grep -n "operations:" src/services`), `src/engine/sysml/interaction.ts`, tests.
- [ ] Pure helper `planOperationChange(repo, blockId, before: string[], after: string[])`. It pairs removed/added signatures by position (a rename is the same index with a changed text) and returns the message `signatureId` rewrites needed in every Interaction whose receiving lifeline's Block is the Block or a subtype of it (`effectiveSupertypeIds`).
- [ ] A rename becomes one `batch`: the Block patch plus each Interaction patch, so it is one undo step.
- [ ] A removal is rejected with an actionable diagnostic naming the messages ("`enable` is called by message 1 in Startup — remove or retarget that message first"), or, if the user confirms in the inspector, clears those `signatureId`s in the same batch.
- [ ] Tests: renaming `enable(on: Boolean)` → `enableOutput(on: Boolean)` commits and rewrites `m1.signatureId`; undo restores both; removal without confirmation returns the guidance diagnostic.

### Task 0.3 — Pre-existing errors must not block unrelated commands (gateway policy)
**Files:** `src/services/sysmlCommandGateway.ts` (each `stagedValidation` site: createOwnedFeature, createElement, updateElement, moveElements, createDiagram, deleteElements). Add one shared helper.
- [ ] Add `introducedErrors(before: SysmlDiagnostic[], after: SysmlDiagnostic[])`, keyed by `code|elementId|propertyPath`. A command is rejected only for errors that are **new** in the staged repository. Cache the baseline validation per `revision` so validation does not run twice per command.
- [ ] Results still report all diagnostics (warnings plus old errors) so the UI can show them.
- [ ] Tests: load a repository that already has a dangling lifeline → unrelated rename commits; a command that creates a *new* error is still rejected.
- **Decision gate:** this changes a gateway-wide contract. Implement behind a single exported constant `REJECT_ONLY_INTRODUCED_ERRORS = true` and list it in the phase report so the owner can veto it. Tasks 0.1 and 0.2 are required regardless.

### Task 0.4 — Move/re-own keeps lifelines valid
- [ ] Moving an Interaction to another owner (`moveElements`) re-runs the Phase 1 context check (warnings only) and keeps the Sequence Diagram `contextElementId`. Test: move between a Package and a Block.

**Profile:** extend the `seq.sequenceDiagram` limitation: remove nothing yet, add "deleting a represented element or used signal clears the reference".

---

## Phase 1 — Lifelines ↔ structure

**Goal:** a sequence diagram describes the parts of a real system context and the connectors between them, as in Cameo.

### Task 1.1 — Context Block rules (warnings)
**Files:** `src/engine/sysml/interaction.ts`, tests.
- [ ] `interactionContextBlock(repo, interaction)`: the owning Block if the owner is a Block, else `undefined`.
- [ ] Warning `LIFELINE_OUTSIDE_CONTEXT` when a context Block exists and a lifeline represents neither that Block (self) nor one of its part/reference properties (inherited included), nor a nested part reachable through a property path (`resolvePartLike`).
- [ ] Never an error. A Package-owned Interaction may represent any Block or part.

### Task 1.2 — Lifeline picker driven by the context
**Files:** `src/services/sysmlInteractionCommands.ts` (new `listLifelineCandidates(repo, interactionId)`), `SequenceWorkspace.tsx` (use it).
- [ ] Candidates are ordered as: self, context parts/references (with `: Type`), then other Blocks. Each row uses `sysmlObjectLabel`. Command builders reject unknown ids with a diagnostic.

### Task 1.3 — Create a sequence diagram from structure
**Files:** `src/services/sysmlInteractionCommands.ts` (`buildCreateInteractionFromContextCommand`), model-tree context menu (`sysmlExplorerAdapter.ts` create branch), IBD canvas context menu (the existing IBD right-click menu in `App.tsx`, small localized edit).
- [ ] On a Block or IBD selection, "New Sequence Diagram" creates, in one `batch`, an Interaction owned by the Block, a sequence diagram owned by it, and one lifeline per selected part (or all parts if none are selected).
- [ ] Tests: the batch is one undo step; lifelines are typed; the diagram opens (`openExactDiagramById`).

### Task 1.4 — Messages over connectors and ports
**Files:** `model.ts` (`InteractionMessage.connectorId?: string`, `viaPortId?: string`), `interaction.ts`, `sysmlInteractionCommands.ts`, `sequenceDiagramView.ts` (label suffix), tests.
- [ ] Warning `MESSAGE_WITHOUT_CONNECTOR` when both lifelines represent parts of the same context Block and no connector in that context links them (directly, or through ports of those parts). Reuse the IBD connector resolution in `src/engine/sysml/partOccurrences.ts` / connector helpers; do not write a second path resolver.
- [ ] Error `MESSAGE_CONNECTOR_MISMATCH` only when `connectorId` is set and does not connect the two represented parts. The editor can prevent it by offering only matching connectors.
- [ ] Deleting a connector clears `connectorId`, through the Phase 0 mechanism: add connectors to `interactionReferencesTo`.
- [ ] Inspector field "Connector" is a select of the legal connectors.

**Profile:** limitation updated ("lifelines are checked against the context Block; messages may name the connector they travel over").

---

## Phase 2 — Messages ↔ operations and signals

### Task 2.1 — Receptions (additive)
**Files:** `model.ts` (`BlockDefinition.receptions?: string[]`, Signal ids), Block inspector + Block compartment rendering on BDD (`«signal»`-style "receptions" compartment; find the operations compartment renderer and mirror it), `interaction.ts`, `validation/definitionRules.ts`, persistence test, `migrateV3ToV4.ts` (map to V4 `Reception` elements if the V4 domain has them — it does: `classifiers.ts` `Reception`).
- [ ] Warning `SIGNAL_NOT_RECEIVED` when a signal message's receiving lifeline is typed by a Block (or supertype) that has receptions but none for that Signal. A Block with no receptions at all is not warned, so old models stay quiet.
- [ ] Deleting a Signal clears it from `receptions` (Phase 0 helper).

### Task 2.2 — Operation and signal pickers on the message
**Files:** `SequenceWorkspace.tsx`, `sysmlInteractionCommands.ts`.
- [ ] Call messages: a dropdown of `blockOperations(receiverBlock)`. Signal messages: Signals the receiver receives first, then all Signals. "New operation…" / "New signal…" create the element and set the message in one `batch`.

### Task 2.3 — Item flows
**Files:** `interaction.ts`, tests.
- [ ] When a signal message has `connectorId` (Task 1.4) and that connector realises item flows (`itemFlows` with `realizingRelationshipId`), warn `SIGNAL_NOT_CONVEYED` if no item flow conveys the message's Signal (or a supertype).

### Task 2.4 — Arguments vs parameters (text level)
- [ ] Parse the operation signature's parameter list (`name: Type` pairs, already validated by `sysmlPropertyRules.ts` `OPERATION`). Warn `ARGUMENT_COUNT_MISMATCH` when `arguments` has a different number of comma-separated items. Typed checking waits for Phase 9.

---

## Phase 3 — Interactions ↔ other behaviours

### Task 3.1 — Use Case scenarios
**Files:** `capabilities/ownershipPolicy.ts` (`UseCase: [..., 'Interaction', 'Activity']`), `useCases.ts`, `sysmlExplorerAdapter.ts` (create Interaction under a Use Case), `UseCaseWorkspace.tsx` (double-click opens the scenario), `diagramTreeContext.ts` (`resolveCanvasSymbolDiagramTargets` already prefers `diagramReferences`).
- [ ] An Interaction owned by a Use Case is its scenario. Populate `UseCaseDefinition.behaviorArtifactIds` through the same command, and create a `DiagramReference { role: 'elaborates', sourceElementId: useCaseId, diagramId }` so the Use Case symbol navigates to the sequence diagram.
- [ ] A lifeline may represent an **Actor** of that Use Case (`representsId` may now be an actor id). Extend `lifelineBlock`/existence checks so that actors are valid but untyped for operation checks.
- [ ] Warning `SCENARIO_ACTOR_NOT_ASSOCIATED` when a lifeline represents an Actor that has no `useCaseAssociation` with the owning Use Case.
- [ ] Deleting a Use Case cascades to owned Interactions (extend the owned-behaviour cascade in `classifyDeletionTarget`, which already handles Block-owned Activities/Interactions).

### Task 3.2 — Activities call Interactions
**Files:** `src/engine/sysml/activity.ts` (line ~208: accept `kind === 'interaction'`), activity workspace picker, tests.
- [ ] `MISSING_CALLED_BEHAVIOR` only if the behaviour is neither an Activity nor an Interaction. The action label shows the Interaction name. Double-click navigates to its sequence diagram.

### Task 3.3 — Interaction use (`ref` frame)
**Files:** `model.ts` (`InteractionUse { id; refersToId; coveredLifelineIds: string[]; order: number; arguments?: string }` in `InteractionDefinition.uses?: InteractionUse[]`), `interaction.ts` (`interactionNestedIds` includes uses), `sequenceDiagramView.ts`, `SequenceWorkspace.tsx`, `sysmlInteractionCommands.ts`, tests.
- [ ] Rules: `refersToId` is an existing Interaction (error, editor-preventable); no reference cycle across Interactions (error); covered lifelines exist (error); `order` shares the message position space (unique across messages and uses).
- [ ] Rendering: a frame labelled `ref` with the referenced Interaction name spanning the covered lifelines. Double-click opens the referenced diagram.
- [ ] Deleting a referenced Interaction: impact lists the `ref` frames (Phase 0 mechanism), and commit removes those uses.

---

## Phase 4 — Interactions ↔ state machines

The state machine lives outside the SysML repository; its states are already exposed to the SysML side as external endpoints of family `state` (`App.tsx` `externalEndpointContext`). All links are stored on the **SysML side**.

### Task 4.1 — State invariants on lifelines
**Files:** `model.ts` (`StateInvariant { id; lifelineId; stateId; afterOrder: number }` in `InteractionDefinition.stateInvariants?`), `interaction.ts`, layout and canvas, command builders, tests.
- [ ] The invariant renders as a rounded box on the lifeline at its position. `stateId` resolves through `SemanticEndpointContext`; the name comes from the context.
- [ ] Unknown `stateId` → **warning** (`STATE_INVARIANT_UNRESOLVED`), never an error, because the state machine can change without a SysML command.

### Task 4.2 — Signal messages documented as triggers (read-only check)
- [ ] Pure helper `signalTriggerCoverage(interaction, stateMachineSnapshot)`. For each signal message received by a lifeline that has state invariants, report whether a transition leaving the invariant state names that signal in its `condition` text (case-insensitive token match). Show the result as information in the inspector, not as a diagnostic.

### Task 4.3 — Optional explicit trigger link (decision gate)
- [ ] Only after owner sign-off: add `TransitionData.triggerSignalId?: string` (additive; code generators ignore it), a picker in the transition inspector, and replace the text match in 4.2 with the id. If not approved, skip the task and record that in the profile.

---

## Phase 5 — Requirements, verification and traceability

### Task 5.1 — Relationship policy
**Files:** `connectionPolicy.ts` (`SATISFY_SOURCE_FAMILY` and `VERIFY_SOURCE_FAMILY` add `'interaction'`; `validDiagram` keeps sequence diagrams free of drawn requirement edges), `capabilities/ruleTablesAgree.test.ts` must stay green, tests.
- [ ] An Interaction, or a nested lifeline/message (family `interaction` via `semanticEndpointIndex`), can be the client of «satisfy», «verify», «refine», «trace» and «allocate» created from the requirements/RTM diagrams and from the Interaction's inspector "Traceability" section.

### Task 5.2 — Interaction as a test case
**Files:** `model.ts` (`VerificationCase.behaviorId?: string`), verification-case inspector, `validation/definitionRules.ts`, tests.
- [ ] A verification case may name the Interaction that is its test procedure. Warning `VERIFICATION_BEHAVIOR_MISSING` if `behaviorId` does not resolve to an Activity or Interaction. Phase 0 deletion clears it.

### Task 5.3 — Allocation of messages
- [ ] «allocate» from a message to a connector or item flow is legal (policy already allows any → any for allocation). Render `«allocate» <name>` under the message label, mirroring the existing lifeline allocation label in `sequenceDiagramView.ts` (`allocationNamesByElement`).

### Task 5.4 — Traceability views
- [ ] The RTM / traceability report generator includes Interactions and nested elements as clients. Find the generator with `grep -rn "satisfy" src/features/reporting src/features/sysml`. Rows are named `Interaction ▸ message 3: enable(on)` via `messageSentence`.

---

## Phase 6 — Model tree, inspector, navigation, where-used

### Task 6.1 — Nested content in the tree
**Files:** `src/features/modelExplorer/unifiedModelExplorerProjection.ts`, `ModelTreeRow.tsx` (icons for `lifeline`, `message`, `fragment`, `interactionUse`, `stateInvariant`), tests.
- [ ] Under each Interaction show: Lifelines (`name : Type`), Messages in `order` (`3: enable(on)`), Fragments (`alt [guard]`), `ref` uses. Mark them `readOnly` for drag-drop; rename and delete go through `sysmlInteractionCommands` builders.
- [ ] The sequence diagram node stays under the Interaction. Do not apply the diagram-grouping move (2026-10-04) to nested interaction content, because it already sits under its owner.

### Task 6.2 — Inspector for nested elements
**Files:** `src/features/sysml/inspectorSchema.ts` (new `buildInteractionElementSchema` resolved from the **V3** repository via `findInteractionElement`, because `migrateV3ToV4` keeps only ids), `App.tsx` right panel: when `selectedIds[0]` is a nested interaction id, render `SysmlPropertyPanel` with that schema (small localized edit next to the other `SysmlPropertyPanel` branches), `sysmlCommandAdapter.ts` (route the new command types to the interaction builders).
- [ ] Lifeline fields: name, represents (Phase 1.2 picker). Message fields: name, sort, operation/signal (Phase 2.2), arguments, connector (Phase 1.4), position. Fragment fields: operator, operands and guards.
- [ ] Every edit is one gateway command, and deletes use `dispatchInspectorCommand` so they go through the deletion review.

### Task 6.3 — Navigation and where-used
**Files:** new `src/engine/sysml/services/interactionQueries.ts`, Block/part/operation/signal inspectors, tests.
- [ ] `whereUsedInInteractions(repo, elementId)` returns `{ interactionId, diagramIds, elementIds }` for Blocks, parts, Signals, operations (signature text) and connectors.
- [ ] Inspector section "Shown in Sequence Diagrams" lists them; clicking opens the diagram and selects the lifeline/message (`onSelect`).
- [ ] Canvas double-click: lifeline → represented element; call message → owning Block's operation (opens the BDD/inspector); signal message → Signal; `ref` frame → referenced diagram.

---

## Phase 7 — Notation fidelity (closes `profile.ts` gaps)

Each item is model + rule + layout + canvas + command + test + persistence.
- [ ] **Lost/found messages:** `sourceLifelineId`/`targetLifelineId` may be the sentinel `'@lost'`/`'@found'`. Draw them with a filled circle end. Reply pairing ignores them.
- [ ] **Duration and time constraints:** `InteractionDefinition.constraints?: { id; kind: 'duration' | 'time'; fromOrder: number; toOrder?: number; expression: string }[]`. Draw them as a bracket with `{expr}`. Text only; no evaluation.
- [ ] **Coregion / general ordering:** deferred. Record them in the profile as not supported.
- [ ] **Nested fragments by drawing:** dropping a fragment inside another adds its messages to the enclosing operand. The command builder keeps `FRAGMENT_MESSAGE_NOT_COVERED` satisfied by also extending `coveredLifelineIds`.
- [ ] **Execution bars for asynchronous calls** (until the next message from the receiver), behind a layout flag so existing tests stay stable.

---

## Phase 8 — Interchange and reports

- [ ] `src/features/plantuml/adapters/sysmlInteractionToPlantUml.ts`: a pure export of an Interaction to PlantUML text. It maps participants (actor for Actor-represented lifelines), `->`/`->>`/`-->` by sort, `create`/`destroy`, `alt/opt/loop/par/break/critical` groups with guards, and `ref over`. A unit test snapshots the text.
- [ ] Menu "Export to PlantUML" on the sequence canvas opens the existing PlantUML workspace with the text. Import from PlantUML is **out of scope** (lossy).
- [ ] The report generator gains a "Scenarios" section: each Interaction with its message list (`messageSentence`) and its trace links. Reuse the existing report SVG/diagram embedding used for other SysML diagrams.

---

## Phase 9 — Operations and receptions as identified elements (format v6)

Do this last: it changes saved data. It removes the text-matching weakness behind D3 and Phase 2.4.
- [ ] `BlockDefinition.operations` becomes `OperationDefinition[]` (`{ id; name; parameters: { name; typeId; direction }[]; returnTypeId?; isQuery? }`), and `receptions` becomes `ReceptionDefinition[]` (`{ id; signalId }`).
- [ ] Migration `migrateV5ToV6`: parse each signature string, generate stable ids (`op:<blockId>:<index>`), and rewrite every call message `signatureId` from text to the operation id, resolving through the receiver's Block and supertypes. Unresolvable text stays as `legacySignature` with a warning.
- [ ] Every reader of `operations` (`grep -rn "\.operations" src`) moves to a helper `operationLabel(op)`. The BDD compartment, explorer, inspector and code paths keep rendering the same text.
- [ ] Rules switch from `operationMatches` text to id equality, add typed argument checking, and drop the Phase 0.2 rename propagation, because ids make it unnecessary.
- [ ] Persistence: v5 files load and upgrade; v6 saves; a round-trip test; `interchangeReport.ts` knows the new nested ids.

---

## Verification checklist (whole plan)
- §1.2 defects D1–D4 have regression tests and stay fixed.
- `seq.sequenceDiagram` in `profile.ts` lists exactly what remains unsupported after the last completed phase.
- Each phase's report states which decision gates (0.3, 4.3) were taken or skipped.
- A real-browser check of the sequence canvas (the profile notes it was never done): create from an IBD selection, add messages with operation pickers, delete a represented part, rename an operation, open the scenario from a Use Case, and export to PlantUML.
