# SysML Diagram Interaction Review Repairs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair the six correctness and evidence defects found in the completed SysML diagram-interaction work so endpoint identity, owned features, Port constraints, UI workflows, and compliance claims are genuinely repository-backed.

**Architecture:** Remove caller-asserted semantic identity and resolve every relationship endpoint through an explicit semantic index spanning the SysML repository and supplied State Machine context. Replace ad hoc Block patches with gateway-owned atomic feature commands that validate staged repository state before commit. Wire the same commands into canvas and Model Explorer, then replace existence-only browser tests and self-declared compliance checks with observable semantic assertions.

**Tech Stack:** TypeScript, React, Vitest, Playwright, `SysmlRepository`, State Machine model adapters, `sysmlCommandGateway`, Model Explorer command bus.

## Global Constraints

- Preserve the approved design in `docs/superpowers/specs/2026-09-26-sysml-diagram-interaction-corrections-design.md`.
- A relationship endpoint exists only when its semantic ID resolves in an authoritative repository or explicitly supplied State Machine model; `sourceFamily` and ID text are never proof of existence.
- Canvas, Model Explorer, imports, scripts, and AI use the same validators and command contracts.
- Standard UML Port remains distinct from ProxyPort, FullPort, and legacy FlowPort.
- No invalid Port, Property, relationship, or presentation may be committed and then merely reported as a diagnostic.
- Owned-feature creation and optional presentation changes form one validated transaction and one undo entry.
- Missing types return `TYPE_NOT_FOUND`, existing candidates, and an explicit `CreateNewType` action; no caller silently creates a type.
- Compliance remains `PARTIAL` until executable semantic and browser evidence passes all four levels.
- Do not weaken existing Package Diagram, semantic identity, persistence, hierarchy, deletion, performance, or code-generation gates.

---

## File Map

| Path | Responsibility |
|---|---|
| `src/engine/sysml/semanticEndpointIndex.ts` (new) | Resolve canonical SysML and external State Machine endpoint IDs without trusting caller labels. |
| `src/services/sysmlCreationRules.ts` | Validate relationship existence and direction using the endpoint index. |
| `src/engine/sysml/validation.ts` | Validate persisted cross-domain relationship endpoints with supplied external identities. |
| `src/services/sysmlOwnedFeatureCommands.ts` | Build typed owned-feature intents, not malformed `updateElement` objects. |
| `src/services/sysmlCommandGateway.ts` | Execute atomic `createOwnedFeature` and validate staged state before commit. |
| `src/engine/sysml/validation/portRules.ts` | Resolve embedded Ports and validate nesting from repository data. |
| `src/features/modelExplorer/adapters/sysmlExplorerAdapter.ts` | Dispatch shared Port and Property feature commands. |
| `src/App.tsx` | Dispatch the shared commands from canvas and surface backend outcomes. |
| `tests/e2e/sysml-diagram-interaction-corrections.spec.ts` | Exercise real Port, Property, connector, TestCase, Satisfy, persistence, and Package activation workflows. |
| `src/engine/sysml/diagramInteractionCompliance.test.ts` | Run/verify mapped evidence rather than trusting JSON status strings. |
| `docs/sysml/compliance-evidence.json` | Correct authority and status after executable evidence exists. |

## Stable Interfaces

```ts
export interface ExternalSemanticEndpoint {
  id: string;
  name: string;
  family: 'state';
  ownerId?: string;
}

export interface SemanticEndpointContext {
  externalEndpoints?: ReadonlyMap<string, ExternalSemanticEndpoint>;
}

export type OwnedFeatureIntent =
  | { featureKind: 'port'; ownerBlockId: string; portKind: CanonicalPortKind; typeId?: string; name?: string }
  | { featureKind: 'property'; ownerBlockId: string; propertyKind: 'part' | 'reference' | 'value' | 'flow'; typeId: string; name?: string };

export type SysmlEditorCommand =
  | ExistingSysmlEditorCommand
  | { type: 'createOwnedFeature'; intent: OwnedFeatureIntent; diagramId?: string; presentation?: PresentationCoordinates };
```

### Task 1: Replace Caller-Asserted State Existence with Authoritative Endpoint Resolution

**Files:**
- Create: `src/engine/sysml/semanticEndpointIndex.ts`
- Create: `src/engine/sysml/semanticEndpointIndex.test.ts`
- Modify: `src/services/sysmlCreationRules.ts:210`
- Modify: `src/services/sysmlCreationRules.test.ts`
- Modify: `src/engine/sysml/validation.ts:118`
- Modify: `src/engine/sysml/validation.test.ts`
- Modify: `src/services/sysmlConnectionUi.ts`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `SysmlRepository`, actual State Machine `states`, canonical relationship candidate.
- Produces: `resolveSemanticEndpoint(repo, id, context): ConnectionEndpoint | undefined` and context-aware relationship validation.

- [ ] **Step 1: Write failing forged-State tests.** Prove that family text and an ID containing `state` do not establish identity.

```ts
const forged = relationship('rel-forged', 'nonexistent-state-id', 'req-1', 'satisfy', {
  sourceFamily: 'state', targetFamily: 'requirement',
});
expect(validateCanonicalRelationshipCandidate(repo, forged, { externalEndpoints: new Map() }).codes)
  .toContain('MISSING_RELATIONSHIP_ENDPOINT');
```

- [ ] **Step 2: Write a valid external-State test.** Add `state-1` to `externalEndpoints`, create State → Requirement Satisfy, and assert validation succeeds. Remove the entry and assert the same candidate fails atomically.

- [ ] **Step 3: Run the focused tests and verify failure.**

Run: `npx vitest run src/engine/sysml/semanticEndpointIndex.test.ts src/services/sysmlCreationRules.test.ts src/engine/sysml/validation.test.ts`

Expected: FAIL because current validation trusts `sourceFamily` and ID substrings.

- [ ] **Step 4: Implement endpoint resolution.** Search repository top-level collections and nested Block properties/ports. Search State IDs only through `context.externalEndpoints`. Return the resolved family from the stored entity, never from candidate fields.

```ts
export function resolveSemanticEndpoint(
  repo: SysmlRepository,
  id: string,
  context: SemanticEndpointContext = {},
): ConnectionEndpoint | undefined {
  const external = context.externalEndpoints?.get(id);
  if (external) return external;
  return resolveRepositoryEndpoint(repo, id);
}
```

- [ ] **Step 5: Pass State context through all callers.** `App.tsx` builds a read-only map from the actual State Machine model. UI, gateway, import, script, and AI adapters either provide that context or receive `MISSING_RELATIONSHIP_ENDPOINT`; they may not manufacture a State family.

- [ ] **Step 6: Make repository validation cross-domain aware.** Extend validation input with external endpoint IDs for active integrated models. Persisted relationships without a resolvable external endpoint remain invalid and cannot be silently declared valid by `sourceFamily`.

- [ ] **Step 7: Run tests and commit.**

Run: `npx vitest run src/engine/sysml/semanticEndpointIndex.test.ts src/services/sysmlCreationRules.test.ts src/engine/sysml/validation.test.ts src/services/sysmlConnectionUi.test.ts`

Expected: PASS.

```powershell
git add src/engine/sysml/semanticEndpointIndex.ts src/engine/sysml/semanticEndpointIndex.test.ts src/services/sysmlCreationRules.ts src/services/sysmlCreationRules.test.ts src/engine/sysml/validation.ts src/engine/sysml/validation.test.ts src/services/sysmlConnectionUi.ts src/App.tsx
git commit -m "fix(sysml): resolve state relationship endpoints by identity"
```

### Task 2: Introduce Atomic, Validated Owned-Feature Gateway Commands

**Files:**
- Modify: `src/services/sysmlOwnedFeatureCommands.ts`
- Modify: `src/services/sysmlOwnedFeatureCommands.test.ts`
- Modify: `src/services/sysmlCommandGateway.ts:204`
- Modify: `src/services/sysmlCommandGateway.test.ts`
- Modify: `src/engine/sysml/model.ts`

**Interfaces:**
- Consumes: `OwnedFeatureIntent`, optional active diagram ID and feature presentation.
- Produces: gateway `createOwnedFeature` execution with pre-commit validation and one undo action.

- [ ] **Step 1: Write a failing command-shape test.** Assert builders return a typed `createOwnedFeature` command and never attach undeclared fields to `updateElement`.

```ts
expect(plan.command).toEqual({
  type: 'createOwnedFeature',
  intent: expect.objectContaining({ featureKind: 'port', ownerBlockId: 'vehicle' }),
  diagramId: 'bdd',
  presentation: expect.any(Object),
});
```

- [ ] **Step 2: Write failing atomicity tests.** Invalid ProxyPort type, invalid nested Port, missing diagram, and duplicate feature ID must leave repository revision, Block features, presentation map, patch history, and action stack unchanged.

- [ ] **Step 3: Write success/undo tests.** Successful Port or Property creation updates one Block, records optional diagram-keyed feature layout, creates one action-stack entry, and undo/redo restores the exact same feature ID.

- [ ] **Step 4: Run tests and verify failure.**

Run: `npx vitest run src/services/sysmlOwnedFeatureCommands.test.ts src/services/sysmlCommandGateway.test.ts`

Expected: FAIL because the builder currently emits `updateElement` with ignored `diagramId` and `presentation` properties.

- [ ] **Step 5: Make builders deterministic and side-effect free.** Accept or generate IDs through the shared repository ID service, return only the typed intent command, and remove `payload`, undeclared presentation fields, and `any` command casts.

- [ ] **Step 6: Validate staged repository state before commit.** Construct the candidate Block in memory, run ownership/type rules and `validateRepositoryPorts`, reject all error diagnostics, then create the semantic and presentation patches together. Do not commit first and return validation errors afterward.

- [ ] **Step 7: Ensure the presentation has a real consumer.** Store owned-feature border/row layout in the active diagram presentation's feature layout map. If no separate feature layout is required, omit presentation from the public command and document that the feature is projected through its owning Block; never accept and ignore presentation input.

- [ ] **Step 8: Run tests, typecheck, and commit.**

Run: `npx vitest run src/services/sysmlOwnedFeatureCommands.test.ts src/services/sysmlCommandGateway.test.ts src/engine/sysml/validation/portRules.test.ts`

Run: `npx tsc --noEmit`

Expected: PASS.

```powershell
git add src/services/sysmlOwnedFeatureCommands.ts src/services/sysmlOwnedFeatureCommands.test.ts src/services/sysmlCommandGateway.ts src/services/sysmlCommandGateway.test.ts src/engine/sysml/model.ts
git commit -m "fix(sysml): make owned feature creation atomic"
```

### Task 3: Wire Property Creation Through Canvas and Model Explorer

**Files:**
- Modify: `src/features/modelExplorer/modelExplorerCapabilities.ts`
- Modify: `src/features/modelExplorer/adapters/sysmlExplorerAdapter.ts:27`
- Modify: `src/features/modelExplorer/adapters/sysmlExplorerAdapter.test.ts`
- Modify: `src/components/sysml/BlockFeatureEditor.tsx`
- Modify: `src/components/sysml/BlockFeatureEditor.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/services/sysmlConnectionUi.test.ts`

**Interfaces:**
- Consumes: Task 2 `createOwnedFeature` command and existing Property-to-Block relationship picker.
- Produces: identical Part, Reference, Value, and Flow Property semantic creation from tree and canvas/editor paths.

- [ ] **Step 1: Write failing production-wiring tests.** Spy on command dispatch from `BlockFeatureEditor` and Model Explorer. Assert both emit `createOwnedFeature` with the same owner, kind, and selected existing type.

- [ ] **Step 2: Write type-selection tests.** Part/Reference candidates are Blocks; Value candidates are ValueTypes; missing type returns `TYPE_NOT_FOUND` with candidates and `CreateNewType`; cancel changes nothing.

- [ ] **Step 3: Write Property relationship tests.** Create a Property through each UI path, activate relationship mode, connect it to a Block, select Association/Dependency/Allocate explicitly, and assert the relationship endpoints use the Property semantic ID and Block semantic ID.

- [ ] **Step 4: Run tests and verify failure.**

Run: `npx vitest run src/components/sysml/BlockFeatureEditor.test.tsx src/features/modelExplorer/adapters/sysmlExplorerAdapter.test.ts src/services/sysmlConnectionUi.test.ts`

Expected: FAIL because production never dispatches `buildCreateOwnedPropertyCommand`/`createOwnedFeature`.

- [ ] **Step 5: Replace local/ad hoc Property edits.** Route Block editor, canvas feature action, and tree menu through the shared command. Render the resulting Property from canonical projection only.

- [ ] **Step 6: Preserve explicit relationship choice.** Keep the legal-kind picker backend-derived; never default silently to Association when multiple kinds are legal. Failed relationship creation leaves the new Property intact but creates no relationship or edge.

- [ ] **Step 7: Run tests and commit.**

Run: `npx vitest run src/components/sysml/BlockFeatureEditor.test.tsx src/features/modelExplorer/adapters/sysmlExplorerAdapter.test.ts src/services/sysmlConnectionUi.test.ts src/services/sysmlCommandGateway.test.ts`

Expected: PASS.

```powershell
git add src/features/modelExplorer/modelExplorerCapabilities.ts src/features/modelExplorer/adapters/sysmlExplorerAdapter.ts src/features/modelExplorer/adapters/sysmlExplorerAdapter.test.ts src/components/sysml/BlockFeatureEditor.tsx src/components/sysml/BlockFeatureEditor.test.tsx src/App.tsx src/services/sysmlConnectionUi.test.ts
git commit -m "fix(sysml): route property workflows through canonical commands"
```

### Task 4: Validate Nested Ports from Persisted Repository Structure

**Files:**
- Modify: `src/engine/sysml/model.ts`
- Modify: `src/engine/sysml/validation/portRules.ts:101`
- Modify: `src/engine/sysml/validation/portRules.test.ts`
- Modify: `src/engine/sysml/validation.test.ts`
- Modify: `src/engine/sysml/persistence.test.ts`

**Interfaces:**
- Consumes: embedded Block Ports and `nestedPortPathIds` or explicit nested owner metadata.
- Produces: repository Port index used by `validateRepositoryPorts` and persistence/import validation.

- [ ] **Step 1: Write a failing persisted nesting test.** Create a ProxyPort parent and Standard Port child in a Block, persist/load them, and assert `INVALID_NESTED_PROXY_PORT` is reported independently of React.

- [ ] **Step 2: Write valid nesting tests.** ProxyPort inside ProxyPort with an InterfaceBlock type passes; missing parent ID returns `NESTED_PORT_PATH_INVALID`; cyclic paths are rejected; a top-level Standard Port remains valid.

- [ ] **Step 3: Run focused tests and verify failure.**

Run: `npx vitest run src/engine/sysml/validation/portRules.test.ts src/engine/sysml/validation.test.ts src/engine/sysml/persistence.test.ts`

Expected: FAIL because repository validation resolves only definitions and rewrites every Port owner to its Block.

- [ ] **Step 4: Build a repository Port index.** Index every embedded Port by ID before validation. Resolve parent Port IDs from explicit nesting data, preserve the containing Block separately, and pass both definitions and Ports through `PortValidationContext.getElement`.

```ts
const portsById = new Map(
  Object.values(repo.definitions)
    .filter(isBlockDefinition)
    .flatMap(block => block.ports.map(port => [port.id, { block, port }] as const)),
);
```

- [ ] **Step 5: Validate imported and updated Blocks before commit.** Reuse the same index and validator for gateway updates, persistence hydration, imports, scripts, and AI actions.

- [ ] **Step 6: Run tests and commit.**

Run: `npx vitest run src/engine/sysml/validation/portRules.test.ts src/engine/sysml/validation.test.ts src/engine/sysml/persistence.test.ts src/services/sysmlCommandGateway.test.ts`

Expected: PASS.

```powershell
git add src/engine/sysml/model.ts src/engine/sysml/validation/portRules.ts src/engine/sysml/validation/portRules.test.ts src/engine/sysml/validation.test.ts src/engine/sysml/persistence.test.ts
git commit -m "fix(sysml): validate persisted nested ports"
```

### Task 5: Replace Shallow Browser Checks with Behavioral Workflows

**Files:**
- Modify: `tests/e2e/sysml-diagram-interaction-corrections.spec.ts`
- Modify: `tests/e2e/sysml-repository-presentation.spec.ts`

**Interfaces:**
- Consumes: completed Tasks 1–4 and existing browser helpers.
- Produces: non-conditional release workflows that fail when controls or semantic changes are absent.

- [ ] **Step 1: Replace the Port existence check.** Create all four Port kinds from the canvas and tree, select existing compatible types, assert exact canonical feature counts/kinds, test ProxyPort wrong-type rejection, reload, and verify stable IDs.

- [ ] **Step 2: Replace the IBD navigation check.** Create context/part Ports, connect boundary-to-part delegation and part-to-part assembly, assert connector IDs and endpoint usages in the repository projection, reload, then verify the connectors remain visible.

- [ ] **Step 3: Add the complete Property workflow.** Create a typed Property, connect it to a Block through an explicitly chosen legal relationship, and verify endpoints, rename propagation, undo/redo, and reload.

- [ ] **Step 4: Add TestCase behavior.** Create TestCases from tree and canvas, assert exactly one semantic record per action, move and remove one presentation, confirm repository preservation, then delete with impact confirmation and undo.

- [ ] **Step 5: Make Satisfy assertions mandatory.** Remove `count()`, `isVisible()`, and `isEnabled()` branches that skip behavior. Create State → Requirement Satisfy and assert repository/edge state; attempt reverse direction and assert visible `INVALID_SATISFY_DIRECTION` with unchanged relationship count.

- [ ] **Step 6: Cover Package activation zero/one/many cases.** Assert explicit zero-diagram creation behavior, direct one-diagram opening, chooser or exact tree opening for multiple diagrams, and independent presentation restoration.

- [ ] **Step 7: Run the browser suite repeatedly.**

Run: `npx playwright test tests/e2e/sysml-diagram-interaction-corrections.spec.ts tests/e2e/sysml-repository-presentation.spec.ts --project=chromium --repeat-each=2`

Expected: every scenario executes its semantic assertions twice; no workflow conditionally skips its core action.

- [ ] **Step 8: Commit.**

```powershell
git add tests/e2e/sysml-diagram-interaction-corrections.spec.ts tests/e2e/sysml-repository-presentation.spec.ts
git commit -m "test(sysml): exercise corrected diagram workflows"
```

### Task 6: Recalculate Compliance from Executable Evidence

**Files:**
- Modify: `src/engine/sysml/diagramInteractionCompliance.test.ts`
- Modify: `src/engine/sysml/compliance/evaluator.ts`
- Modify: `src/engine/sysml/compliance/evaluator.test.ts`
- Modify: `docs/sysml/compliance-evidence.json`
- Modify: `src/engine/sysml/conformanceManifest.ts`

**Interfaces:**
- Consumes: semantic test manifests and Task 5 browser evidence.
- Produces: evidence records that cannot become `COMPLIANT` from self-declared JSON status alone.

- [ ] **Step 1: Write a failing false-evidence test.** A JSON record containing four `PASS` strings but referencing an absent test ID or nonexistent exported evidence case must evaluate as `PARTIAL`, even if the test file exists.

- [ ] **Step 2: Define executable evidence IDs.** Each semantic test exports or registers stable case IDs such as `PORT_PROXY_WRONG_TYPE_REJECTED`, `STATE_SATISFY_REAL_ID_REQUIRED`, and `IBD_BOUNDARY_DELEGATION_PERSISTS`. The evaluator requires the expected IDs for each compliance level.

- [ ] **Step 3: Separate authority records.** Split Standard UML Port evidence to `UML_FOUNDATION`; keep ProxyPort/FullPort/FlowPort evidence under `OMG_SYSML_1_6`; keep palette and activation behavior under `CAMEO_TOOLING`; retain legacy VerificationCase mapping under `ADIA_EXTENSION`.

- [ ] **Step 4: Recalculate status.** Mark each level `PASS` only when its semantic evidence case is registered and passing. A missing relationship, constraint, persistence, or projection case forces overall `PARTIAL`.

- [ ] **Step 5: Run compliance tests.**

Run: `npx vitest run src/engine/sysml/compliance/evaluator.test.ts src/engine/sysml/diagramInteractionCompliance.test.ts src/engine/sysml/conformanceManifest.test.ts`

Expected: PASS, with deliberately incomplete fixtures evaluating as `PARTIAL` or `NON_COMPLIANT`.

- [ ] **Step 6: Commit.**

```powershell
git add src/engine/sysml/diagramInteractionCompliance.test.ts src/engine/sysml/compliance/evaluator.ts src/engine/sysml/compliance/evaluator.test.ts docs/sysml/compliance-evidence.json src/engine/sysml/conformanceManifest.ts
git commit -m "fix(sysml): bind compliance claims to executable evidence"
```

### Task 7: Final Regression and Release Review

**Files:**
- Modify only in-scope files required to repair failures.
- Review all files listed in Tasks 1–6.

**Interfaces:**
- Consumes: completed repair implementation.
- Produces: verified branch without the six reviewed defects.

- [ ] **Step 1: Run TypeScript and architecture checks.**

Run: `npx tsc --noEmit`

Run: `npm run test:sysml:architecture`

Expected: both exit 0 with no new allowlisted direct mutations.

- [ ] **Step 2: Run the full SysML suite.**

Run: `npm run test:sysml`

Expected: all test files pass, including owned features, nested Ports, relationship identity, connectors, TestCase, Package activation, persistence, and compliance.

- [ ] **Step 3: Run release and identity gates.**

Run: `npm run test:sysml:release-gate`

Run: `npx vitest run src/engine/sysml/semanticIdentityReleaseGate.test.ts src/engine/sysml/repositoryFirstTreeReleaseGate.test.ts src/engine/sysml/repositoryPresentationReleaseGate.test.ts --reporter=verbose`

Expected: PASS.

- [ ] **Step 4: Run performance checks in isolation.**

Run: `npx vitest run src/engine/sysml/largeModelStress.test.ts src/services/sysmlIntegrityService.test.ts --no-file-parallelism`

Expected: 26 tests pass within existing thresholds.

- [ ] **Step 5: Run full browser workflows.**

Run: `npx playwright test tests/e2e/sysml-diagram-interaction-corrections.spec.ts tests/e2e/sysml-repository-presentation.spec.ts --project=chromium`

Expected: all workflows pass without conditional suppression of required assertions.

- [ ] **Step 6: Run code-generation isolation.**

Run: `npm run verify:repository-codegen-isolation`

Expected: golden and repository-isolation tests pass. Record unavailable sanitizer, MISRA, static-analysis, or target hardware gates separately.

- [ ] **Step 7: Inspect the final diff.**

Run: `git diff --check`

Run: `git status --short`

Confirm there is no substring-based identity, ignored command property, post-commit validation error, unused production feature builder, conditional E2E core path, or self-declared compliance status.

- [ ] **Step 8: Request fresh code review.** Review from this plan's base commit through final HEAD against both the original design and this repair plan. Resolve every High and Important finding before merge.

## Plan Self-Review

- **Finding coverage:** Task 1 fixes forged/dangling State endpoints. Tasks 2–3 fix ignored presentation fields, post-commit validation, and unused Property commands. Task 4 fixes repository-level nested ProxyPort validation. Task 5 replaces shallow E2E checks. Task 6 replaces self-declared compliance.
- **Atomicity:** Tasks 1, 2, and 4 require validation before mutation and unchanged repository/history/presentations on rejection.
- **Authority:** Task 6 separates Standard UML Port, SysML Port stereotypes, Cameo tooling, and ADIA legacy mapping.
- **No silent creation:** Missing State IDs, types, owners, diagrams, and relationship endpoints all reject through authoritative lookup.
- **Type consistency:** `SemanticEndpointContext`, `OwnedFeatureIntent`, and `createOwnedFeature` are defined once and consumed consistently across tasks.
- **No unrelated scope:** Package semantics beyond activation, new diagram types, and repository-wide V4 migration remain outside this repair plan.
