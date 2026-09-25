# Cameo Repository/Presentation Corrective Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Each task requires a failing regression test, implementation, focused verification, and review before proceeding.

**Goal:** Close the gaps found after the first repository/presentation migration so Model Explorer deletion, multi-diagram presentation state, all runtime SysML mutations, compliance reporting, and code-generation verification match the approved Cameo-style design.

**Architecture:** Keep `SysmlRepository` as the only semantic authority. Add diagram-scoped presentation records with stable IDs and bounds, propagate gateway results and impacts through the Explorer UI, and centralize legacy arrays as read-only projections refreshed only from committed canonical state.

**Tech Stack:** TypeScript, React 18, Vitest, Testing Library, Playwright, existing SysML command gateway and normalized store.

## Global Constraints

- One semantic element may have multiple diagram presentations without duplicated semantic identity.
- Each diagram presentation has a stable ID and diagram-specific geometry/display state.
- A material delete impact must reach the UI confirmation flow; no result or diagnostic may be discarded.
- Runtime SysML actions—including undo/redo, auto-layout, clipboard, port layout, property synchronization, and type creation—must use gateway commands.
- Legacy arrays may only be written by a single canonical projection/load boundary and may never write back into the repository.
- Architecture checks must not hide active runtime mutations behind a whole-file allowlist.
- Compliance evidence must use exactly one semantic authority per claim and reference real files, symbols, validators, persistence mappings, projections, and passing tests.
- Code-generation isolation work must not weaken mandatory code-generation acceptance gates.

---

### Task 1: Preserve Explorer Impacts and Display Every Command Result

**Files:**
- Modify: `src/features/modelExplorer/adapters/sysmlExplorerAdapter.ts`
- Modify: `src/features/modelExplorer/adapters/sysmlExplorerAdapter.test.ts`
- Modify: `src/components/modelExplorer/AppModelExplorer.tsx`
- Modify: `src/components/modelExplorer/AppModelExplorer.commands.test.tsx`
- Modify: `src/App.tsx`

**Required behavior:**

- `toExplorerResult` maps `SysmlCommandResult.impact` into all four `ExplorerImpact` arrays.
- If execution returns material impact after a clean adapter preflight, `AppModelExplorer` opens `MoveImpactDialog` instead of silently returning.
- Confirmed deletion uses the gateway-provided impact hash, not a hash of an empty adapter placeholder.
- `App` supplies `onCommandResult` and displays every diagnostic through `addError`.

- [ ] Add a failing adapter test that deletes a Block owning a PartProperty and asserts the first result is uncommitted with non-empty descendants/presentations.
- [ ] Add a failing component test that dispatches delete, receives material impact from execution, opens confirmation, confirms, and observes a committed second command.
- [ ] Map mutation impact fields explicitly:

```ts
function toExplorerImpact(impact?: MutationImpact): ExplorerImpact | undefined {
  if (!impact) return undefined;
  return {
    descendants: impact.deletedElementIds.filter(id => !impact.requestedElementIds.includes(id)),
    relationships: impact.deletedRelationshipIds,
    presentations: impact.deletedPresentationIds ?? [],
    invalidated: impact.unresolvedUsageIds,
  };
}
```

- [ ] Route both preflight and execution results through one `handleExplorerResult(result, command)` function that opens impact confirmation, stores clipboard payloads, updates selection, and forwards diagnostics.
- [ ] Wire `onCommandResult` in `App.tsx` to `addError`, preserving diagnostic severity and element ID.
- [ ] Run:

```bash
npx vitest run src/features/modelExplorer/adapters/sysmlExplorerAdapter.test.ts src/components/modelExplorer/AppModelExplorer.commands.test.tsx
npx tsc --noEmit
```

- [ ] Commit: `fix(explorer): propagate deletion impact and diagnostics`

### Task 2: Store Stable Diagram-Scoped Presentation Records

**Files:**
- Modify: `src/services/sysmlCommandGateway.ts`
- Modify: `src/services/sysmlCommandGateway.test.ts`
- Modify: `src/engine/sysml/normalizedStore.ts`
- Modify: `src/engine/sysml/normalizedStore.test.ts`
- Modify: `src/engine/sysml/persistence.ts`
- Modify: `src/engine/sysml/persistence.test.ts`
- Modify: `src/engine/sysml/projection/canonicalProjections.ts`
- Modify: `src/engine/sysml/repositoryPresentationReleaseGate.test.ts`

**Interfaces:**

```ts
export interface DiagramElementPresentation {
  id: string;
  diagramId: string;
  semanticElementId: string;
  bounds: PresentationCoordinates;
  portLayouts?: Record<string, { side: 'top' | 'right' | 'bottom' | 'left'; offset: number }>;
}

export interface DiagramPresentation {
  elementIds: string[];
  presentations: Record<string, DiagramElementPresentation>;
}
```

The `presentations` map is keyed by semantic ID because ADIA currently allows one symbol per semantic element per diagram. Its record carries the stable presentation ID. Existing `elementIds` remains as a compatibility index until all consumers use records.

- [ ] Add a failing test that places `blk-motor` at `(10,20)` on Requirements and `(400,500)` on BDD, moves only the BDD presentation, serializes/reloads, and asserts both positions and one semantic Block remain.
- [ ] Generate stable presentation IDs on first add and preserve them on geometry updates and persistence round trips.
- [ ] Change `updatePresentation` to require `diagramId`; reject missing diagram context with `DIAGRAM_NOT_FOUND`.
- [ ] Make projections resolve diagram-scoped bounds first. Legacy global coordinates are read only during migration and converted into each diagram presentation record.
- [ ] Ensure remove-from-diagram removes only the targeted presentation record, while delete-from-model removes every record referencing deleted semantic IDs.
- [ ] Ensure create-and-present undo/redo restores both the semantic element and exact presentation record in one logical action.
- [ ] Run:

```bash
npx vitest run src/services/sysmlCommandGateway.test.ts src/engine/sysml/normalizedStore.test.ts src/engine/sysml/persistence.test.ts src/engine/sysml/repositoryPresentationReleaseGate.test.ts
npx tsc --noEmit
```

- [ ] Commit: `refactor(sysml): scope presentation state by diagram`

### Task 3: Remove Active Runtime Legacy Mutations

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/services/sysmlCommandGateway.ts`
- Modify: `src/services/sysmlCommandGateway.test.ts`
- Modify: `scripts/verify_sysml_architecture.ts`
- Modify: `src/engine/sysml/architectureGuards.test.ts`

**Required migration points:**

1. `reconcileAllPropertyUsages` effect: remove array mutation; reconciliation occurs inside the repository command that changes a property/type.
2. SysML undo/redo: call gateway `undo`/`redo`; legacy snapshot undo remains state-machine-only.
3. Requirements auto-layout: send a gateway batch of diagram-scoped `updatePresentation` commands.
4. IBD port dragging: update diagram presentation `portLayouts`, never Block/Part semantics.
5. Keyboard SysML paste: dispatch repository copy/paste commands; keep `pasteStateMachineClipboard` restricted to state-machine mode.
6. Property “create definition” action: create the definition and update the usage through one atomic gateway batch.
7. New/load/import/restore: load canonical repository first, then refresh projections through one named projection function.
8. Missing type UX: use canonical `CreateNewTypeAction.actionKind`, render an explicit Create New Type action, and dispatch its semantic creation only after the user invokes it. Remove the unused `GatewayCreateNewTypeAction.type` alias.

- [ ] Add failing architecture tests for each active runtime pattern above.
- [ ] Introduce one `applyCanonicalSysmlResult(result)` function containing the only permitted projection setters (`setBlocks`, `setRelationships`, `setParts`, `setConnectors`).
- [ ] Replace every active runtime setter with gateway dispatch and remove the broad `src/App.tsx` direct-mutation allowlist.
- [ ] Add a component/service test proving `TYPE_NOT_FOUND` shows candidates and a visible Create New Type action, while no type exists before that action is invoked.
- [ ] Keep a narrow allowlist only for the named canonical projection function and legacy import adapter, with exact symbol names and expiry conditions.
- [ ] Make the architecture CLI fail when active runtime mutations are allowlisted or when the App-wide allowlist returns.
- [ ] Run:

```bash
npm run test:sysml:architecture
npm run test:sysml
npx tsc --noEmit
```

Expected architecture result: zero active-runtime violations; any remaining notices identify only the exact projection/import boundary, not the entire `App.tsx` file.

- [ ] Commit: `refactor(sysml): remove runtime legacy mutation paths`

### Task 4: Restore Code-Generation Gate Integrity

**Files:**
- Modify: `src/utils/stateMachine/smVerificationAggregator.ts`
- Modify: `src/utils/stateMachine/smVerificationAggregator.test.ts`
- Modify: `src/utils/stateMachineCodeGenerator.repositoryIsolation.test.ts`
- Review and retain only proven fixes in: `src/utils/stateMachine/smTestPlanBuilder.ts`, `src/utils/stateMachine/smToolRunner.ts`, `scripts/verify_sm_codegen.ts`

- [ ] Add a failing acceptance test proving a mandatory sanitizer result of `NOT_RUN` cannot produce `accepted: true`.
- [ ] Remove the sanitizer bypass from `deriveAcceptance`; unsupported sanitizer tooling must remain visible as `NOT_RUN` and block the verified release decision unless a separately documented policy explicitly changes that requirement.
- [ ] Expand the isolation test to exercise semantic rename plus presentation add/move/remove, and assert generator artifacts remain identical because the state-machine generator receives only its state-machine semantic input.
- [ ] Verify every unrelated codegen change from commit `321a8b0` has a focused regression test; revert changes that merely altered expectations to make the verifier pass.
- [ ] Run:

```bash
npx vitest run src/utils/stateMachine/smVerificationAggregator.test.ts src/utils/stateMachineCodeGenerator.repositoryIsolation.test.ts src/utils/stateMachineCodeGenerator.golden.test.ts
npm run verify:sm:codegen
```

- [ ] Commit: `fix(codegen): preserve mandatory verification gates`

### Task 5: Correct Compliance Evidence and End-to-End Coverage

**Files:**
- Modify: `docs/sysml/compliance-evidence.json`
- Modify: `tests/e2e/sysml-repository-presentation.spec.ts`
- Modify: `tests/e2e/sysml-requirements-existing-block.spec.ts`
- Create: `tests/e2e/sysml-tree-delete-impact.spec.ts`

- [ ] Replace combined authorities such as `OMG SysML 1.6 / Cameo ...` with exactly one of `OMG_SYSML_1_6`, `UML_FOUNDATION`, `CAMEO_TOOLING`, or `ADIA_EXTENSION`.
- [ ] Remove references to nonexistent files/symbols and identify exact real command, validator, persistence mapping, projection, and automated tests.
- [ ] Downgrade any claim lacking four-level automated semantic evidence to `PARTIAL` or `NON_COMPLIANT`; promote it only after the cited tests pass.
- [ ] Add browser coverage for:
  - independent positions of one Block on Requirements and BDD;
  - deleting a Block with an owned PartProperty and relationship through impact confirmation;
  - visible diagnostics for a rejected tree action;
  - remove-from-diagram preserving the other presentation and semantic element.
- [ ] Run:

```bash
npm run test:sysml:release
npm run test:sysml:architecture
npm run test:sysml:release-gate
npm run verify:repository-codegen-isolation
npx playwright test tests/e2e/sysml-repository-presentation.spec.ts tests/e2e/sysml-requirements-existing-block.spec.ts tests/e2e/sysml-tree-delete-impact.spec.ts --reporter=line
npx tsc --noEmit
```

- [ ] Commit: `test(sysml): prove corrected repository presentation lifecycle`

## Completion Evidence

- [ ] One semantic Block can retain different positions on Requirements and BDD after save/reload.
- [ ] Tree deletion with material impact opens confirmation and commits after approval.
- [ ] Every rejected tree action displays its diagnostic.
- [ ] No active runtime SysML mutation is hidden by an App-wide allowlist.
- [ ] Mandatory code-generation gates remain mandatory.
- [ ] Every compliance claim cites real, passing evidence and a single authority.
- [ ] The full release commands above pass from the final commit.
