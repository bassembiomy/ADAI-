# SysML v1.6 Diagram Interaction Corrections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair BDD Port and Property authoring, IBD boundary connectors, Requirement Diagram TestCase and navigation behavior, State-to-Requirement Satisfy, and Package Diagram activation through one repository-backed SysML v1.6 command architecture.

**Architecture:** Extend the live `SysmlRepository` and `sysmlCommandGateway` first, then project those canonical entities into BDD, IBD, Requirement, and Package workspaces. Tree and canvas actions dispatch the same typed commands; React owns only transient tool selection and presentation interaction. Standard UML Port remains distinct from SysML ProxyPort, FullPort, and legacy FlowPort, while TestCase is the normative public concept and legacy VerificationCase storage is normalized behind the semantic boundary.

**Tech Stack:** TypeScript, React, Vitest, Playwright, existing SysML command gateway, normalized repository/persistence, Model Explorer adapters.

## Global Constraints

- Attribute Standard Port and Property foundations to `UML_FOUNDATION`; attribute Block, ProxyPort, FullPort, legacy FlowPort, Requirement, Satisfy, and TestCase semantics to `OMG_SYSML_1_6`.
- Attribute palette grouping, smart placement, explicit navigation, and last-active diagram behavior to `CAMEO_TOOLING`.
- Attribute stable diagnostics, command transactions, and legacy VerificationCase normalization to `ADIA_EXTENSION`.
- Never automatically stereotype a generic Port as ProxyPort or FullPort.
- Never silently create a missing type. Return `TYPE_NOT_FOUND`, compatible candidates, and an explicit `CreateNewType` action for UI, import, migration, script, and AI callers.
- Canvas creation must be atomic semantic creation plus presentation creation; failed validation commits neither.
- Diagram presentation state references canonical semantic IDs and never duplicates ownership or type semantics.
- Requirement Diagram Block double-click is a no-op; explicit context actions perform navigation.
- State is a legal Satisfy client and Requirement is the supplier. Reverse direction remains invalid.
- A Package Diagram is always activated by its persisted repository ID; the literal `package` is never used as a diagram identity.
- No enabled UI action may exist without a domain representation, command, validator, persistence mapping, projection, and automated semantic test.

---

## File Map

| Path | Responsibility |
|---|---|
| `src/engine/sysml/domain/ports.ts` | Canonical Standard/Proxy/Full/Flow Port distinctions. |
| `src/engine/sysml/model.ts` | Live persisted Port, Property, PortUsage, Connector, TestCase compatibility types. |
| `src/engine/sysml/validation/portRules.ts` | Repository-level ProxyPort, FullPort, nested-port, and legacy FlowPort rules. |
| `src/engine/sysml/ibd.ts` | Resolve context and part-occurrence ports; validate assembly/delegation connectors. |
| `src/engine/sysml/connectionPolicy.ts` | Legal Property, State, Requirement, Port, and Block relationship endpoints. |
| `src/engine/sysml/policy.ts` | Canonical relationship and connector policy dispatch. |
| `src/engine/sysml/validation.ts` | Whole-repository diagnostics after persistence/import. |
| `src/services/sysmlOwnedFeatureCommands.ts` (new) | Build typed, atomic Port/Property creation commands without React dependencies. |
| `src/services/sysmlIbdConnectorCommands.ts` (new) | Resolve occurrence endpoints and build connector create-and-present transactions. |
| `src/services/sysmlDiagramActivation.ts` (new) | Select exact Package Diagram IDs and return create/choose/open outcomes. |
| `src/services/sysmlCommandGateway.ts` | Execute feature, relationship, connector, TestCase, and presentation transactions. |
| `src/services/sysmlDiagramCreation.ts` | Normative TestCase create-and-present mapping and allowed diagram kinds. |
| `src/services/sysmlConnectionUi.ts` | Thin UI endpoint projection using canonical classifier results. |
| `src/services/sysmlProjectionState.ts` | Diagram-scoped projections for Port, Property, TestCase, and connector presentations. |
| `src/features/modelExplorer/modelExplorerCapabilities.ts` | Four Port choices and explicit navigation actions. |
| `src/features/modelExplorer/adapters/sysmlExplorerAdapter.ts` | Tree commands using the same builders as canvas commands. |
| `src/components/sysml/PortToolMenu.tsx` (new) | Compact Cameo-style Port tool selector. |
| `src/components/sysml/TypeSelectionPrompt.tsx` (new) | Existing-type selection and explicit CreateNewType action. |
| `src/components/sysml/IbdConnectorEndpoint.tsx` (new) | Semantic occurrence-port hit target and endpoint feedback. |
| `src/components/modelExplorer/AppModelExplorer.tsx` | Dispatch feature creation and explicit navigation intents. |
| `src/App.tsx` | Bridge active diagram/tool state to commands and projections; no semantic rules. |
| `docs/sysml/compliance-evidence.json` | Four-level authority and automated evidence records. |
| `tests/e2e/sysml-diagram-interaction-corrections.spec.ts` (new) | Browser release workflows for all reported defects. |

## Stable Interfaces

```ts
export type CanonicalPortKind = 'umlPort' | 'proxyPort' | 'fullPort' | 'flowPort';

export interface CreateOwnedPortIntent {
  ownerBlockId: string;
  portKind: CanonicalPortKind;
  typeId?: string;
  diagramId?: string;
  presentation?: PresentationCoordinates;
}

export interface CreateOwnedPropertyIntent {
  ownerBlockId: string;
  propertyKind: 'part' | 'reference' | 'value' | 'flow';
  typeId: string;
  diagramId?: string;
  presentation?: PresentationCoordinates;
}

export type PackageDiagramActivation =
  | { status: 'open'; diagramId: string }
  | { status: 'choose'; diagramIds: string[] }
  | { status: 'create'; ownerId: 'model' };
```

The gateway may implement create-and-present intents as a validated batch, but callers receive one committed result, one undo entry, and one diagnostic set.

### Task 1: Characterize the Reported Failures and Lock Semantic Authorities

**Files:**
- Create: `src/engine/sysml/diagramInteractionCorrections.test.ts`
- Modify: `src/engine/sysml/compliance/types.ts`
- Modify: `docs/sysml/compliance-evidence.json`
- Test: `src/engine/sysml/diagramInteractionCorrections.test.ts`

**Interfaces:**
- Consumes: current `SysmlRepository`, `executeSysmlCommand`, `evaluateSysmlConnection`, `createIbdConnector`.
- Produces: failing characterization fixtures and evidence IDs `SYSML-PORT-CREATE-001`, `SYSML-IBD-DELEGATION-001`, `SYSML-REQ-TESTCASE-001`, `SYSML-REQ-SATISFY-STATE-001`, `CAMEO-DIAGRAM-ACTIVATE-001`.

- [ ] **Step 1: Write failing semantic characterization tests.** Build one repository fixture containing an InterfaceBlock, context Block, part type, PartProperty, four Port kinds, State, Requirement, and TestCase. Assert Standard Port retains `umlPort`; ProxyPort without InterfaceBlock fails; boundary-to-part delegation succeeds; State → Requirement Satisfy succeeds; TestCase is stored and projected under one stable ID.

```ts
expect(createOwnedPort(repo, { ownerBlockId: 'vehicle', portKind: 'umlPort' }).element?.portKind)
  .toBe('umlPort');
expect(createOwnedPort(repo, { ownerBlockId: 'vehicle', portKind: 'proxyPort', typeId: 'vehicle' }).diagnostics[0].code)
  .toBe('INVALID_PROXY_PORT_TYPE');
expect(evaluateSysmlConnection({ relationshipKind: 'satisfy', source: state, target: requirement, diagram: 'statemachine' }).allowed)
  .toBe(true);
```

- [ ] **Step 2: Run the characterization test and verify the reported paths fail.**

Run: `npx vitest run src/engine/sysml/diagramInteractionCorrections.test.ts`

Expected: FAIL on missing owned-feature command, occurrence-aware connector resolution, or TestCase projection—not merely on rendering assertions.

- [ ] **Step 3: Add incomplete compliance records.** Record each authority and four levels as `PARTIAL`; do not mark any record compliant in this task.

- [ ] **Step 4: Commit the characterization boundary.**

```powershell
git add src/engine/sysml/diagramInteractionCorrections.test.ts src/engine/sysml/compliance/types.ts docs/sysml/compliance-evidence.json
git commit -m "test(sysml): characterize diagram interaction defects"
```

### Task 2: Implement Typed Owned Port and Property Commands

**Files:**
- Create: `src/services/sysmlOwnedFeatureCommands.ts`
- Create: `src/services/sysmlOwnedFeatureCommands.test.ts`
- Modify: `src/engine/sysml/model.ts`
- Modify: `src/engine/sysml/domain/ports.ts`
- Modify: `src/engine/sysml/validation/portRules.ts`
- Modify: `src/engine/sysml/validation/portRules.test.ts`
- Modify: `src/services/sysmlCommandGateway.ts`
- Modify: `src/services/sysmlCommandGateway.test.ts`

**Interfaces:**
- Consumes: `CreateOwnedPortIntent`, `CreateOwnedPropertyIntent`, `resolveType`, `CreateNewTypeAction`, gateway batch and presentation commands.
- Produces: `buildCreateOwnedPortCommand(repo, intent): CommandBuildResult` and `buildCreateOwnedPropertyCommand(repo, intent): CommandBuildResult`.

- [ ] **Step 1: Write failing tests for all four Port kinds.** Assert canonical-to-live mapping is `umlPort → standard`, `proxyPort → proxy`, `fullPort → full`, `flowPort → flow`; assert generic Port has no SysML stereotype; assert ProxyPort requires an existing InterfaceBlock; assert tree and canvas intents build equivalent semantic patches.

- [ ] **Step 2: Write failing no-silent-type tests.** For a missing `typeId`, assert:

```ts
expect(result).toMatchObject({
  ok: false,
  diagnostics: [{ code: 'TYPE_NOT_FOUND' }],
  action: { kind: 'CreateNewType' },
});
expect(result.candidates.every(candidate => candidate.id in repo.definitions)).toBe(true);
```

- [ ] **Step 3: Run focused tests and verify failure.**

Run: `npx vitest run src/services/sysmlOwnedFeatureCommands.test.ts src/engine/sysml/validation/portRules.test.ts`

Expected: FAIL because no shared owned-feature builder exists and legacy factory fallback permits blank or fabricated typing.

- [ ] **Step 4: Implement pure command builders.** Resolve the owner as an existing Block; resolve the selected existing type; restrict ProxyPort candidates to InterfaceBlock; create one `PortDefinition` or `PropertyDefinition`; return a gateway batch that updates the owning Block and optionally adds the feature's presentation metadata. Do not mutate `repo` in the builder.

- [ ] **Step 5: Extend repository-level Port validation.** Ensure persisted/imported data diagnoses `PROXY_AND_FULL_PORT`, `INVALID_PROXY_PORT_TYPE`, `PROXY_PORT_TYPE_REQUIRED`, `INVALID_NESTED_PROXY_PORT`, and legacy FlowPort warnings without relying on UI state.

- [ ] **Step 6: Add gateway atomicity and undo tests.** A failed typed feature creates no feature and no presentation. A successful create-and-present operation adds exactly one owned feature and one undo entry; undo removes both and redo restores the same IDs.

- [ ] **Step 7: Run focused tests and typecheck.**

Run: `npx vitest run src/services/sysmlOwnedFeatureCommands.test.ts src/engine/sysml/validation/portRules.test.ts src/services/sysmlCommandGateway.test.ts`

Run: `npx tsc --noEmit`

Expected: PASS.

- [ ] **Step 8: Commit.**

```powershell
git add src/services/sysmlOwnedFeatureCommands.ts src/services/sysmlOwnedFeatureCommands.test.ts src/engine/sysml/model.ts src/engine/sysml/domain/ports.ts src/engine/sysml/validation/portRules.ts src/engine/sysml/validation/portRules.test.ts src/services/sysmlCommandGateway.ts src/services/sysmlCommandGateway.test.ts
git commit -m "feat(sysml): add typed owned feature commands"
```

### Task 3: Add Cameo-Style BDD Port and Property Canvas Tools

**Files:**
- Create: `src/components/sysml/PortToolMenu.tsx`
- Create: `src/components/sysml/PortToolMenu.test.tsx`
- Create: `src/components/sysml/TypeSelectionPrompt.tsx`
- Create: `src/components/sysml/TypeSelectionPrompt.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/features/modelExplorer/modelExplorerCapabilities.ts`
- Modify: `src/features/modelExplorer/adapters/sysmlExplorerAdapter.ts`
- Modify: `src/features/modelExplorer/adapters/sysmlExplorerAdapter.test.ts`

**Interfaces:**
- Consumes: Task 2 builders and gateway result diagnostics.
- Produces: transient `activeOwnedFeatureTool`, compact Port menu, explicit type selector, identical tree/canvas dispatch.

- [ ] **Step 1: Write component tests.** Assert the Port button exposes Standard UML Port, Proxy Port, Full Port, and Legacy Flow Port; Escape clears the active tool; selecting Proxy Port requires an InterfaceBlock choice; failed creation leaves the tool and repository unchanged while showing the gateway diagnostic.

- [ ] **Step 2: Write Model Explorer parity tests.** For each Port kind, right-click a Block, execute the capability, choose an existing compatible type, and assert the resulting repository feature matches the equivalent canvas command.

- [ ] **Step 3: Run focused tests and verify failure.**

Run: `npx vitest run src/components/sysml/PortToolMenu.test.tsx src/components/sysml/TypeSelectionPrompt.test.tsx src/features/modelExplorer/adapters/sysmlExplorerAdapter.test.ts`

Expected: FAIL because BDD has no owned-feature placement tool or shared type-selection flow.

- [ ] **Step 4: Implement thin UI controls.** Store only tool choice and pending type selection in React. On Block click, dispatch the Task 2 command with the active persisted BDD ID and a border-relative presentation location. Keep the tool active after success and clear it on Escape or explicit cancel.

- [ ] **Step 5: Render owned features from canonical Block projections.** Port and Property rows/border symbols must derive names, types, directions, and semantic IDs from repository data. Do not append local `ports` or `properties` arrays after dispatch.

- [ ] **Step 6: Run component, explorer, and BDD regression tests.**

Run: `npx vitest run src/components/sysml src/features/modelExplorer/adapters/sysmlExplorerAdapter.test.ts src/services/sysmlProjectionState.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit.**

```powershell
git add src/components/sysml/PortToolMenu.tsx src/components/sysml/PortToolMenu.test.tsx src/components/sysml/TypeSelectionPrompt.tsx src/components/sysml/TypeSelectionPrompt.test.tsx src/App.tsx src/features/modelExplorer/modelExplorerCapabilities.ts src/features/modelExplorer/adapters/sysmlExplorerAdapter.ts src/features/modelExplorer/adapters/sysmlExplorerAdapter.test.ts
git commit -m "feat(sysml): add BDD owned feature tools"
```

### Task 4: Support Explicit Property-to-Block Relationships

**Files:**
- Modify: `src/engine/sysml/connectionPolicy.ts`
- Modify: `src/engine/sysml/connectionPolicy.test.ts`
- Modify: `src/engine/sysml/policy.ts`
- Modify: `src/services/sysmlConnectionUi.ts`
- Modify: `src/services/sysmlConnectionUi.test.ts`
- Modify: `src/services/sysmlCreationRules.ts`
- Modify: `src/services/sysmlCreationRules.test.ts`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: canonical owned Property IDs and `evaluateSysmlConnection`.
- Produces: Property endpoint family and legal Association, Dependency, and Allocate decisions; explicit relationship-kind selection.

- [ ] **Step 1: Write failing endpoint classification tests.** Resolve nested Block properties by semantic ID. Assert no Property is classified as `unknown`. Test Association, Dependency, and Allocate separately; do not infer relationship kind from a drag gesture.

- [ ] **Step 2: Write failing atomic rejection tests.** Missing Property or Block IDs return `MISSING_RELATIONSHIP_ENDPOINT`; invalid Association endpoints return `INCOMPATIBLE_RELATIONSHIP_ENDPOINTS`; repository and presentation counts remain unchanged.

- [ ] **Step 3: Run focused tests and verify failure.**

Run: `npx vitest run src/engine/sysml/connectionPolicy.test.ts src/services/sysmlConnectionUi.test.ts src/services/sysmlCreationRules.test.ts`

- [ ] **Step 4: Add a `property` endpoint family and canonical lookup.** Resolve `PropertyDefinition` by searching Block-owned feature arrays and preserve its owner Block ID and type ID. Permit only relationships whose normative endpoint rules accept the selected Property.

- [ ] **Step 5: Add explicit canvas relationship selection.** Starting a connection from a Property presents legal backend-derived choices. Dispatch `createAndPresent` only after the user chooses Association, Dependency, or Allocate. The resulting edge references the Property's canonical ID.

- [ ] **Step 6: Test persistence and rename propagation.** Save/reload the relationship; rename the Property or Block; assert all presentations resolve new names while relationship IDs and endpoints remain unchanged.

- [ ] **Step 7: Commit.**

```powershell
git add src/engine/sysml/connectionPolicy.ts src/engine/sysml/connectionPolicy.test.ts src/engine/sysml/policy.ts src/services/sysmlConnectionUi.ts src/services/sysmlConnectionUi.test.ts src/services/sysmlCreationRules.ts src/services/sysmlCreationRules.test.ts src/App.tsx
git commit -m "feat(sysml): connect owned properties through semantic relationships"
```

### Task 5: Implement Occurrence-Aware IBD Boundary Connectors

**Files:**
- Create: `src/services/sysmlIbdConnectorCommands.ts`
- Create: `src/services/sysmlIbdConnectorCommands.test.ts`
- Create: `src/components/sysml/IbdConnectorEndpoint.tsx`
- Create: `src/components/sysml/IbdConnectorEndpoint.test.tsx`
- Modify: `src/engine/sysml/ibd.ts`
- Modify: `src/engine/sysml/ibd.test.ts`
- Modify: `src/services/sysmlCommandGateway.ts`
- Modify: `src/services/sysmlCommandGateway.test.ts`
- Modify: `src/services/sysmlProjectionState.ts`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: context Block ID, boundary `PortUsage`, PartProperty occurrence ID, typed Block Port definition ID.
- Produces: `resolveIbdEndpoint(repo, contextId, occurrenceId, portDefinitionId)` and `buildCreateIbdConnectorCommand(repo, intent)`.

- [ ] **Step 1: Write failing IBD endpoint tests.** Create a context Block boundary Port, PartProperty, part type Port, and occurrence `PortUsage`. Assert the endpoint resolver distinguishes the boundary Port from the same Port definition used by a part occurrence.

- [ ] **Step 2: Write connector matrix tests.** Assert boundary-to-part accepts delegation, part-to-part accepts assembly where directions are compatible, boundary-to-boundary assembly is rejected, cross-context endpoints return `ENDPOINT_OUTSIDE_IBD_CONTEXT`, and duplicate connectors return `DUPLICATE_CONNECTOR`.

- [ ] **Step 3: Run focused tests and verify failure.**

Run: `npx vitest run src/engine/sysml/ibd.test.ts src/services/sysmlIbdConnectorCommands.test.ts`

Expected: FAIL where the current renderer or command path treats boundary hit targets as visual coordinates instead of semantic Port usages.

- [ ] **Step 4: Implement occurrence-aware endpoint resolution.** A context boundary endpoint uses `ownerId === contextBlockId`; an internal endpoint uses `ownerId === partUsageId` and resolves its definition through the part's `typeId`. Never connect directly to a dotted-frame SVG node or a Part box ID.

- [ ] **Step 5: Implement atomic connector creation and presentation.** Validate through `createIbdConnector`, commit one `ConnectorUsage`, add one connector presentation to the active Block-ID IBD context, and return one undo action.

- [ ] **Step 6: Render semantic hit targets.** `IbdConnectorEndpoint` receives `{ usageId, definitionId, ownerOccurrenceId }`, displays valid/invalid hover feedback, and dispatches IDs only. The dotted boundary remains presentation-only.

- [ ] **Step 7: Add persistence, undo/redo, and browser-independent projection tests.** Save/reload preserves connector owner and endpoint usage IDs; projection renders the edge after reload; undo removes it; redo restores the same ID.

- [ ] **Step 8: Commit.**

```powershell
git add src/services/sysmlIbdConnectorCommands.ts src/services/sysmlIbdConnectorCommands.test.ts src/components/sysml/IbdConnectorEndpoint.tsx src/components/sysml/IbdConnectorEndpoint.test.tsx src/engine/sysml/ibd.ts src/engine/sysml/ibd.test.ts src/services/sysmlCommandGateway.ts src/services/sysmlCommandGateway.test.ts src/services/sysmlProjectionState.ts src/App.tsx
git commit -m "feat(sysml): connect IBD boundary and occurrence ports"
```

### Task 6: Correct Requirement Diagram Block and TestCase Behavior

**Files:**
- Modify: `src/services/sysmlDiagramCreation.ts`
- Modify: `src/services/sysmlDiagramCreation.test.ts`
- Modify: `src/engine/sysml/services/requirementNormalization.ts`
- Modify: `src/engine/sysml/services/requirementNormalization.test.ts`
- Modify: `src/services/sysmlProjectionState.ts`
- Modify: `src/engine/sysml/requirementsDiagramScope.ts`
- Modify: `src/engine/sysml/requirementsDiagramScope.test.ts`
- Modify: `src/features/modelExplorer/adapters/sysmlExplorerAdapter.ts`
- Modify: `src/features/modelExplorer/adapters/sysmlExplorerAdapter.test.ts`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `DiagramCreationKind = 'TestCase'`, legacy `VerificationCase`, active Requirement Diagram ID.
- Produces: one canonical TestCase identity, create-and-present transaction, no-op Block double-click, explicit navigation capabilities.

- [ ] **Step 1: Write failing TestCase identity tests.** Canvas creation must add exactly one TestCase semantic record and one Requirement Diagram presentation. Tree creation plus Add to Diagram must produce the same counts. Assert no Block surrogate with stereotype `testCase` is created.

- [ ] **Step 2: Write failing interaction tests.** Double-click a Requirement Diagram Block and assert active diagram, current layer, selection, repository revision, and presentation state do not change. Assert `Open in BDD` and `Open IBD` explicit actions change only navigation state.

- [ ] **Step 3: Run focused tests and verify failure.**

Run: `npx vitest run src/services/sysmlDiagramCreation.test.ts src/engine/sysml/requirementsDiagramScope.test.ts src/features/modelExplorer/adapters/sysmlExplorerAdapter.test.ts`

- [ ] **Step 4: Normalize public TestCase semantics.** Make `TestCase` the public domain/projection kind. Keep legacy `verificationCases` persistence only behind normalization until a versioned migration removes it. Mark the legacy adapter `ADIA_EXTENSION` in evidence and comments.

- [ ] **Step 5: Project and render TestCase presentations.** Include TestCase in diagram-scoped blocks/symbols with semantic ID, normative stereotype label, movement/removal/deletion behavior, and relationship endpoints. Rendering must read canonical repository data after every command.

- [ ] **Step 6: Remove implicit Requirement Block drill-down.** In `renderBlocks`, stop calling `enterRequirement` or `enterBlock` when `diagramMode === 'requirements'`. Add explicit Model Explorer/context actions that resolve the canonical Block and target diagram.

- [ ] **Step 7: Test save/reload, remove versus delete, and undo.** Removing a TestCase presentation preserves the TestCase; deleting from model removes its Verify relationships and all presentations after impact confirmation; undo restores exact IDs.

- [ ] **Step 8: Commit.**

```powershell
git add src/services/sysmlDiagramCreation.ts src/services/sysmlDiagramCreation.test.ts src/engine/sysml/services/requirementNormalization.ts src/engine/sysml/services/requirementNormalization.test.ts src/services/sysmlProjectionState.ts src/engine/sysml/requirementsDiagramScope.ts src/engine/sysml/requirementsDiagramScope.test.ts src/features/modelExplorer/adapters/sysmlExplorerAdapter.ts src/features/modelExplorer/adapters/sysmlExplorerAdapter.test.ts src/App.tsx
git commit -m "fix(sysml): normalize TestCase requirement presentations"
```

### Task 7: Fix State-to-Requirement Satisfy Across Every Caller

**Files:**
- Modify: `src/engine/sysml/connectionPolicy.ts`
- Modify: `src/engine/sysml/connectionPolicy.test.ts`
- Modify: `src/services/sysmlConnectionUi.ts`
- Modify: `src/services/sysmlConnectionUi.test.ts`
- Modify: `src/services/sysmlCreationRules.ts`
- Modify: `src/services/sysmlCreationRules.test.ts`
- Modify: `src/components/statemachine/StateRequirementTraceability.tsx`
- Modify: `src/engine/sysml/services/requirementNormalization.test.ts`

**Interfaces:**
- Consumes: canonical and legacy State endpoints, Requirement endpoints, Satisfy creation command.
- Produces: one endpoint classifier that returns family `state` consistently for all callers.

- [ ] **Step 1: Reproduce the exact diagnostic.** Add a test using a UUID State and Requirement equivalent to the reported workflow. Pass it through UI endpoint resolution and gateway creation, and assert the current path returns `INVALID_SATISFY_DIRECTION` before the fix.

- [ ] **Step 2: Add caller-parity tests.** Exercise State Machine canvas, Requirement Diagram, Model Explorer, import adapter, script command, and AI tool adapter. Each must accept State → Requirement and reject Requirement → State without changing state.

- [ ] **Step 3: Implement canonical State classification.** Resolve States before legacy Block fallback, preserve family `state` through `resolveUiConnectionEndpoint`, and ensure `validateCanonicalRelationshipCandidate` uses the same classifier instead of reconstructing a narrower family.

- [ ] **Step 4: Improve diagnostics.** Keep code `INVALID_SATISFY_DIRECTION`; include resolved source and target families and corrective text: `Connect the State to the Requirement, not the Requirement to the State.`

- [ ] **Step 5: Run relationship and traceability tests.**

Run: `npx vitest run src/engine/sysml/connectionPolicy.test.ts src/services/sysmlConnectionUi.test.ts src/services/sysmlCreationRules.test.ts src/engine/sysml/services/requirementNormalization.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit.**

```powershell
git add src/engine/sysml/connectionPolicy.ts src/engine/sysml/connectionPolicy.test.ts src/services/sysmlConnectionUi.ts src/services/sysmlConnectionUi.test.ts src/services/sysmlCreationRules.ts src/services/sysmlCreationRules.test.ts src/components/statemachine/StateRequirementTraceability.tsx src/engine/sysml/services/requirementNormalization.test.ts
git commit -m "fix(sysml): accept state satisfaction relationships"
```

### Task 8: Make Package Diagram Activation Deterministic

**Files:**
- Create: `src/services/sysmlDiagramActivation.ts`
- Create: `src/services/sysmlDiagramActivation.test.ts`
- Modify: `src/features/modelExplorer/modelDiagramRegistry.ts`
- Modify: `src/features/modelExplorer/modelDiagramRegistry.test.ts`
- Modify: `src/components/modelExplorer/AppModelExplorer.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: repository diagrams and optional last-active Package Diagram ID.
- Produces: `resolvePackageDiagramActivation(repo, lastActiveId): PackageDiagramActivation`.

- [ ] **Step 1: Write zero/one/many activation tests.** Zero diagrams returns `{ status: 'create', ownerId: 'model' }`; one returns its exact ID; many with valid last-active returns that ID; many without one returns sorted candidate IDs; stale last-active IDs are ignored.

- [ ] **Step 2: Run focused tests and verify failure.**

Run: `npx vitest run src/services/sysmlDiagramActivation.test.ts src/features/modelExplorer/modelDiagramRegistry.test.ts`

- [ ] **Step 3: Implement the pure resolver.** Filter `repo.diagrams` by `diagramKind === 'package'`; never synthesize `package`. Sort chooser candidates by name then ID for deterministic behavior.

- [ ] **Step 4: Wire application activation.** The Package Diagram button opens the resolved ID, opens a chooser for many candidates, or exposes `Create Package Diagram` for zero candidates. Creation dispatches `createDiagram`, consumes the returned diagram ID, and opens it only after commit.

- [ ] **Step 5: Preserve failure state.** A rejected creation/open command leaves `diagramMode`, `activePackageDiagramId`, selected elements, and active presentation unchanged while displaying the backend diagnostic.

- [ ] **Step 6: Test tree double-click.** Double-clicking each Package Diagram node opens that exact semantic ID and restores independent presentation bounds.

- [ ] **Step 7: Commit.**

```powershell
git add src/services/sysmlDiagramActivation.ts src/services/sysmlDiagramActivation.test.ts src/features/modelExplorer/modelDiagramRegistry.ts src/features/modelExplorer/modelDiagramRegistry.test.ts src/components/modelExplorer/AppModelExplorer.tsx src/App.tsx
git commit -m "fix(sysml): activate persisted package diagrams"
```

### Task 9: Add End-to-End Workflows and Compliance Evidence

**Files:**
- Create: `tests/e2e/sysml-diagram-interaction-corrections.spec.ts`
- Create: `src/engine/sysml/diagramInteractionCompliance.test.ts`
- Modify: `docs/sysml/compliance-evidence.json`
- Modify: `src/engine/sysml/conformanceManifest.ts`
- Modify: `src/engine/sysml/semanticIdentityReleaseGate.test.ts`

**Interfaces:**
- Consumes: completed Tasks 2–8.
- Produces: automated four-level evidence and browser release gates.

- [ ] **Step 1: Add BDD Port browser workflows.** Create an InterfaceBlock and Block; create Standard, Proxy, Full, and legacy Flow Ports from canvas and tree; verify one semantic feature per action, correct kind/type, border presentation, rename propagation, save/reload, and missing-type rejection.

- [ ] **Step 2: Add Property and IBD workflows.** Create a typed Property on a BDD, choose an explicit legal relationship to a Block, open the context IBD, and connect a dotted-boundary Port to a PartProperty Port. Assert relationship/connector persistence and stable endpoint IDs.

- [ ] **Step 3: Add Requirement workflows.** Present an existing Block, double-click it and assert no navigation; use explicit navigation; create TestCases from tree and canvas; move and remove a TestCase presentation; verify semantic TestCase count remains correct.

- [ ] **Step 4: Add State Satisfy workflow.** Create a State and Requirement, add Satisfy State → Requirement, assert the edge and repository relationship, attempt reverse direction, and assert `INVALID_SATISFY_DIRECTION` with no second relationship.

- [ ] **Step 5: Add Package activation workflows.** Verify create action when none exists, direct open when one exists, exact tree-node open when multiple exist, and independent presentation restoration.

- [ ] **Step 6: Complete evidence records.** For every feature, provide authority, specification section, implementation file, domain type, command, validator, persistence mapping, projection, automated test, four level statuses, and overall status. Keep any failed level `PARTIAL`.

- [ ] **Step 7: Run browser and compliance tests.**

Run: `npx playwright test tests/e2e/sysml-diagram-interaction-corrections.spec.ts --project=chromium`

Run: `npx vitest run src/engine/sysml/diagramInteractionCompliance.test.ts src/engine/sysml/semanticIdentityReleaseGate.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit.**

```powershell
git add tests/e2e/sysml-diagram-interaction-corrections.spec.ts src/engine/sysml/diagramInteractionCompliance.test.ts docs/sysml/compliance-evidence.json src/engine/sysml/conformanceManifest.ts src/engine/sysml/semanticIdentityReleaseGate.test.ts
git commit -m "test(sysml): gate corrected diagram interactions"
```

### Task 10: Final Regression, Performance, and Code-Generation Validation

**Files:**
- Modify only files needed to repair a failing in-scope regression.
- Review: `docs/superpowers/specs/2026-09-26-sysml-diagram-interaction-corrections-design.md` and all files above.

**Interfaces:**
- Consumes: complete implementation and evidence.
- Produces: release-ready verified branch with no enabled presentation-only action.

- [ ] **Step 1: Run TypeScript and architecture gates.**

Run: `npx tsc --noEmit`

Run: `npm run test:sysml:architecture`

Expected: both exit 0 with no new direct-mutation exceptions.

- [ ] **Step 2: Run the complete SysML suite.**

Run: `npm run test:sysml`

Expected: all tests pass, including Port, IBD, Requirement, TestCase, hierarchy, deletion, persistence, Package Diagram, and semantic identity suites.

- [ ] **Step 3: Run release and performance gates.**

Run: `npm run test:sysml:release-gate`

Run: `npx vitest run src/engine/sysml/largeModelStress.test.ts src/services/sysmlIntegrityService.test.ts --no-file-parallelism`

Expected: all repository gates pass within existing thresholds.

- [ ] **Step 4: Run all affected browser workflows.**

Run: `npx playwright test tests/e2e/sysml-diagram-interaction-corrections.spec.ts tests/e2e/sysml-repository-presentation.spec.ts --project=chromium`

Expected: all scenarios pass with one worker.

- [ ] **Step 5: Verify code-generation isolation.**

Run: `npm run verify:repository-codegen-isolation`

Expected: repository-isolation and golden tests pass. If the extended generated-C pipeline reports unavailable sanitizer, static-analysis, MISRA, or physical-target gates, record those environment limitations separately; do not label that extended gate passed.

- [ ] **Step 6: Inspect the final change set.**

Run: `git diff --check`

Run: `git status --short`

Confirm every enabled Port, Property, Connector, TestCase, Satisfy, navigation, and Package activation action maps to a backend command and an automated test.

- [ ] **Step 7: Commit validation repairs, if any.** Stage only in-scope files and use `fix(sysml): repair diagram interaction regressions`.

## Plan Self-Review

- **Spec coverage:** Tasks 2–3 cover four Port kinds, type selection, tree/canvas parity, and no silent creation. Task 4 covers Property relationships. Task 5 covers dotted-boundary-to-Part Port connectors. Task 6 covers Requirement Block no-op and TestCase visibility. Task 7 covers the exact Satisfy error. Task 8 covers Package Diagram activation. Tasks 9–10 provide compliance and release evidence.
- **Authority separation:** UML, SysML, Cameo tooling, and ADIA extensions are recorded independently; no Cameo interaction is represented as normative SysML.
- **Four-level compliance:** Task 1 starts incomplete evidence and Task 9 may mark compliance only after semantic automation exists.
- **Type consistency:** `CanonicalPortKind`, owned-feature intents, Package activation outcomes, and stable diagnostics remain consistent across domain, gateway, explorer, and React tasks.
- **Layering:** Semantic types and validators precede command builders; command builders precede projections and UI; E2E and compliance evidence follow implementation.
- **No-silent-creation:** Missing types and endpoints are rejected for every caller, including AI and import paths, with no privileged bypass.
