# SysML Semantic Workflow and Palette Repairs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the remaining SysML semantic, workflow, compliance-evidence, persistence, and visual-consistency gaps identified in the review.

**Architecture:** Keep semantic mutations in `sysmlCommandGateway`, with all entry points producing the same typed commands. Validate staged repositories with the same external endpoint context used for command admission, and publish only atomic successful state transitions. Use one semantic-style resolver backed by ADIA CSS custom properties for tree, canvas, dialogs, edges, and restored presentations. Bind compliance claims to current machine-readable test results and verify user workflows through actual application persistence and reload.

**Tech Stack:** TypeScript, React, Vitest, Playwright, existing SysML repository and command gateway, existing CSS custom-property theme system.

## Global Constraints

- Follow `docs/superpowers/specs/2026-09-27-sysml-semantic-workflow-and-palette-repairs-design.md`.
- Preserve UML Port, SysML ProxyPort, FullPort, and legacy FlowPort as distinct semantic choices.
- No entry point silently selects the first candidate type or creates a type implicitly.
- Missing types return `TYPE_NOT_FOUND`, candidate elements, and an explicit `CreateNewType` action.
- State relationship endpoints resolve by actual stable semantic ID and remain available to every validation and persistence path.
- A command with an error diagnostic never mutates repository state, history, persistence, or projections.
- Colors are presentation metadata; semantic validation never uses color.
- Cameo interaction behavior is a tooling benchmark; do not describe it as an OMG SysML requirement.
- Preserve valid user presentation overrides and provide accessible text/icon indicators for errors and warnings.
- Do not weaken existing package-diagram, repository identity, hierarchy, deletion, code-generation, performance, or persistence gates.

---

## File Map

| File | Responsibility |
|---|---|
| `src/features/modelExplorer/adapters/sysmlExplorerAdapter.ts` | Convert tree actions into explicit typed feature commands; remove first-candidate fallbacks. |
| `src/features/modelExplorer/adapters/sysmlExplorerAdapter.test.ts` | Assert tree commands require explicit types and expose candidate/action data. |
| `src/components/modelExplorer/AppModelExplorer.tsx` | Carry selected type and pending feature intent through the type-selection interaction. |
| `src/components/sysml/TypeSelectionPrompt.tsx` | Shared accessible type chooser, empty state, explicit create-type action, and palette tokens. |
| `src/services/sysmlOwnedFeatureCommands.ts` | Validate explicit Port/Property type choices and build canonical commands. |
| `src/services/sysmlOwnedFeatureCommands.test.ts` | Type-choice and `TYPE_NOT_FOUND` command contract coverage. |
| `src/services/sysmlCommandGateway.ts` | Atomic ID checks, staged validation, contextual endpoint validation, and truthful commit results. |
| `src/services/sysmlCommandGateway.test.ts` | Collision rollback, State endpoint persistence, and command atomicity coverage. |
| `src/engine/sysml/validation.ts` | Validate cross-domain relationships using supplied endpoint context. |
| `src/engine/sysml/validation.test.ts` | Valid/invalid external State endpoint repository checks. |
| `src/App.tsx` | Share type-choice commands, project semantic styles, and expose complete relationship endpoint feedback. |
| `src/engine/sysml/semanticEndpointIndex.ts` | Existing canonical endpoint resolver; use it as the endpoint authority. |
| `src/engine/sysml/compliance/evidenceRegistry.ts` | Replace name-only registration with typed evidence-to-test mapping. |
| `src/engine/sysml/compliance/evaluator.ts` | Evaluate current run/revision test outcomes, not static registration. |
| `src/engine/sysml/diagramInteractionCorrections.test.ts` | Emit or assert machine-readable outcomes for mapped semantic cases. |
| `src/engine/sysml/diagramInteractionCompliance.test.ts` | Verify result artifact completeness and compliance downgrade on missing/failed evidence. |
| `docs/sysml/compliance-evidence.json` | Record provenance and four-level status from verified evidence. |
| `src/index.css` | Define semantic-role tokens in each supported theme. |
| `src/engine/sysml/semanticPresentationStyles.ts` (new) | Resolve semantic role and interaction state to CSS token-backed presentation styles. |
| `src/engine/sysml/semanticPresentationStyles.test.ts` (new) | Verify role mappings, custom overrides, and deterministic fallbacks. |
| `src/components/statemachine/StateRequirementTraceability.tsx` | Render State-to-Requirement relationship controls with shared palette tokens and accessible status. |
| `src/components/statemachine/StateRequirementTraceability.test.tsx` | Verify token use, endpoint labels, and error/warning text semantics. |
| `tests/e2e/sysml-diagram-interaction-corrections.spec.ts` | Test tree/canvas parity, real save/reload, semantic relationships, visual roles, and mandatory delete impact confirmation. |
| Existing Playwright fixtures and `src/engine/sysml/persistence.ts` APIs | Use the application save/hydration path in browser tests; do not substitute JSON round-tripping. |

## Stable Interfaces

Retain the current `OwnedFeatureIntent` and `createOwnedFeature` gateway command as the mutation API. Add the following shared UI request/result shapes in a new `src/components/sysml/typeSelectionTypes.ts` module and export them from the SysML component barrel:

```ts
export interface TypeSelectionRequest {
  ownerId: string;
  featureKind: 'part' | 'reference' | 'value' | 'umlPort' | 'proxyPort' | 'fullPort' | 'flowPort';
  candidates: Array<{ id: string; name: string; metaclass: string }>;
  pendingName?: string;
}

export type TypeSelectionResult =
  | { status: 'selected'; typeId: string }
  | { status: 'createNewType'; metaclass: 'Block' | 'ValueType' | 'InterfaceBlock' }
  | { status: 'cancelled' };

export type SemanticPresentationRole =
  | 'block' | 'requirement' | 'state' | 'umlPort' | 'proxyPort' | 'fullPort' | 'flowPort'
  | 'requirementRelationship' | 'selection' | 'warning' | 'error';

export function semanticPresentationToken(role: SemanticPresentationRole): string;
```

The chooser never directly creates a type. A `createNewType` result dispatches the existing canonical type-creation command; successful type creation resumes the pending feature command with its new type ID. Cancellation dispatches nothing.

---

### Task 1: Remove Silent Type Selection from Model Explorer

**Files:**
- Modify: `src/features/modelExplorer/adapters/sysmlExplorerAdapter.ts`
- Modify: `src/features/modelExplorer/adapters/sysmlExplorerAdapter.test.ts`
- Modify: `src/components/modelExplorer/AppModelExplorer.tsx`
- Modify: `src/components/sysml/TypeSelectionPrompt.tsx`
- Test: `src/features/modelExplorer/adapters/sysmlExplorerAdapter.test.ts`, `src/components/modelExplorer/AppModelExplorer.actions.test.tsx`, and `src/components/sysml/TypeSelectionPrompt.test.tsx`

- [ ] **Step 1: Add failing tests for omitted type IDs.** For Part, Reference, Value, Proxy, Full, and Flow feature menu actions, assert the adapter returns a type-selection request with only compatible existing candidate IDs and does not dispatch a command. For Standard UML Port, assert it remains creatable without choosing a type.
- [ ] **Step 2: Add failing tests for empty candidates and cancellation.** Assert no repository/history mutation occurs; return `TYPE_NOT_FOUND`, candidate list `[]`, and an explicit `CreateNewType` choice for required types. Cancel must close the chooser without a command.
- [ ] **Step 3: Run focused tests.** Run `npx vitest run src/features/modelExplorer/adapters/sysmlExplorerAdapter.test.ts src/components/modelExplorer/AppModelExplorer.actions.test.tsx src/components/sysml/TypeSelectionPrompt.test.tsx`. Expected: the new assertions fail against current automatic defaults.
- [ ] **Step 4: Remove first-match fallbacks.** Remove `find(... ) ?? blockDefs[0]`, first Interface/Block/ValueType selection, and similar type inference from preflight and execute paths. Require a user-supplied type ID for typed Property and typed SysML Port commands.
- [ ] **Step 5: Route tree creation through the shared chooser.** Preserve the pending owner, feature kind, and name. On a chosen candidate, build and dispatch the existing `createOwnedFeature` command. On `CreateNewType`, dispatch canonical type creation and resume only after its committed result. On cancel or failure, clear the pending request without mutating the feature.
- [ ] **Step 6: Run focused tests.** Run the command from Step 3. Expected: all tests pass, with no implicit selection path.

### Task 2: Make Canvas Port and Property Creation Use the Same Type Workflow

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/sysml/TypeSelectionPrompt.tsx`
- Modify: `src/services/sysmlOwnedFeatureCommands.ts`
- Modify: `src/services/sysmlOwnedFeatureCommands.test.ts`
- Test: `src/components/modelExplorer/AppModelExplorer.commands.test.tsx`, `src/components/sysml/TypeSelectionPrompt.test.tsx`, and `src/services/sysmlOwnedFeatureCommands.test.ts`

- [ ] **Step 1: Add failing UI tests for each canvas Port kind.** Standard Port creates an untyped UML Port; ProxyPort offers only InterfaceBlock candidates; FullPort and FlowPort require explicit compatible candidates. Assert choosing no type cannot create a typed feature.
- [ ] **Step 2: Add failing tree/canvas parity tests for typed Properties.** For Part, Reference, and Value Properties, assert each surface presents the same candidate IDs and both dispatch equivalent `OwnedFeatureIntent` values after selection.
- [ ] **Step 3: Run focused component tests.** Run `npx vitest run src/services/sysmlOwnedFeatureCommands.test.ts src/components/sysml/TypeSelectionPrompt.test.tsx src/components/modelExplorer/AppModelExplorer.commands.test.tsx`. Expected: failures expose canvas bypass/default behavior.
- [ ] **Step 4: Build candidates from semantic repository definitions.** Use explicit compatibility predicates already used by domain validators. Do not treat names, diagram family, or type ordering as compatibility evidence.
- [ ] **Step 5: Reuse the chooser and command builder.** Toolbar and canvas context actions produce the same pending request and canonical gateway command as Model Explorer. Standard Port remains the explicit no-type exception.
- [ ] **Step 6: Run focused tests.** Run the command from Step 3. Expected: tree and canvas produce equivalent semantic intents and cancellation leaves repository state unchanged.

### Task 3: Enforce Atomic Owned-Feature IDs and Validation

**Files:**
- Modify: `src/services/sysmlCommandGateway.ts`
- Modify: `src/services/sysmlCommandGateway.test.ts`
- Modify: `src/services/sysmlOwnedFeatureCommands.ts`

- [ ] **Step 1: Add failing duplicate-ID tests.** Submit `createOwnedFeature` with a new feature ID and a `usageId` already present in `repo.usages`; assert rejection, unchanged repository, unchanged undo/redo stacks, and `committed: false`. Repeat with a feature ID colliding with a different repository namespace.
- [ ] **Step 2: Add failing staged-validation test.** Construct an intent whose staged result violates a repository invariant; assert no store, history, presentation, or projection mutation occurs.
- [ ] **Step 3: Run focused tests.** Run `npx vitest run src/services/sysmlCommandGateway.test.ts src/services/sysmlOwnedFeatureCommands.test.ts`. Expected: collision/rollback cases fail before the fix.
- [ ] **Step 4: Check all semantic IDs before staging.** Check generated and caller-provided feature and usage IDs against every canonical repository collection and nested feature namespace. Return stable `DUPLICATE_SEMANTIC_ID` or `DUPLICATE_USAGE_ID` diagnostics before assigning staged records.
- [ ] **Step 5: Validate the complete staged repository.** Run full repository validation and Port/property constraints before updating the store or history. If any error exists, return `committed: false` with original revision and state. Only then apply repository, presentation, persistence, and one undo entry.
- [ ] **Step 6: Run focused tests.** Run the command from Step 3. Expected: all rollback and successful single-transaction cases pass.

### Task 4: Preserve State Endpoint Context Across Every Validation Boundary

**Files:**
- Modify: `src/services/sysmlCommandGateway.ts`
- Modify: `src/engine/sysml/validation.ts`
- Modify: `src/engine/sysml/validation.test.ts`
- Modify: `src/services/sysmlCommandGateway.test.ts`
- Modify: `src/engine/sysml/sysmlWorker.ts` where integrated State context is available
- Modify: `src/engine/sysml/persistence.ts` only if hydration needs the same endpoint context supplied by the active application model

- [ ] **Step 1: Add a failing post-commit validation regression.** Create a valid State-to-Requirement relationship with `externalEndpoints`, then execute an unrelated repository mutation. Assert returned validation has no `MISSING_RELATIONSHIP_ENDPOINT` and the original relationship endpoints are unchanged.
- [ ] **Step 2: Add failing undo/redo and hydration cases.** Assert context is passed when validating the resulting repository after undo and redo and when the application supplies hydrated repository plus current State endpoints.
- [ ] **Step 3: Run focused tests.** Run `npx vitest run src/engine/sysml/semanticEndpointIndex.test.ts src/engine/sysml/validation.test.ts src/services/sysmlCommandGateway.test.ts`. Expected: post-mutation checks fail under existing omitted-context calls.
- [ ] **Step 4: Centralize context selection.** Resolve one `endpointContext` per gateway operation from explicit call context or state context and pass it to preflight, staged validation, post-commit validation, undo, redo, and diagnostics. Do not invent endpoint records from caller-provided family labels.
- [ ] **Step 5: Keep persistence authoritative.** Persist relationship IDs and endpoint IDs only. During hydration, resolve external endpoints against the active State Machine model; report missing endpoints when no integrated State exists. Do not persist stale copies of State elements in SysML repository storage.
- [ ] **Step 6: Run focused tests.** Run the command from Step 3. Expected: valid links stay valid across later mutation, undo/redo, and hydration with context; missing external endpoints remain diagnosed.

### Task 5: Bind Compliance Claims to Actual Test Results

**Files:**
- Modify: `src/engine/sysml/compliance/evidenceRegistry.ts`
- Modify: `src/engine/sysml/compliance/evaluator.ts`
- Modify: `src/engine/sysml/diagramInteractionCorrections.test.ts`
- Modify: `src/engine/sysml/diagramInteractionCompliance.test.ts`
- Modify: `docs/sysml/compliance-evidence.json`
- Modify: Vitest configuration or a focused evidence reporter only if the current runner cannot emit a machine-readable case-result artifact

- [ ] **Step 1: Add failing evaluator tests.** Evaluate evidence as missing, skipped, failed, passed on another revision, and passed for the current revision. Only the final case may satisfy executable evidence.
- [ ] **Step 2: Run focused compliance tests.** Run `npx vitest run src/engine/sysml/diagramInteractionCorrections.test.ts src/engine/sysml/diagramInteractionCompliance.test.ts`. Expected: current registry-only evaluator accepts non-executed cases and fails the new tests.
- [ ] **Step 3: Define evidence records.** Each evidence ID maps to a concrete test file and full test name, authority, specification section, ADIA implementation/domain type/command/validator/persistence/projection locations, and test result identity. Preserve the four-level evaluation structure.
- [ ] **Step 4: Emit and consume run results.** Capture actual pass/skip/fail outcomes plus source revision and run ID from the test runner. Make the evaluator fail closed if an outcome is absent, stale, skipped, failed, or points to a missing test.
- [ ] **Step 5: Regenerate compliance statuses.** Mark `COMPLIANT` only at the supported levels with current passing evidence; keep others `PARTIAL` or `NON_COMPLIANT` and identify the unmet evidence.
- [ ] **Step 6: Run focused tests.** Run the command from Step 2 and assert deliberately failed/missing evidence cannot yield `COMPLIANT`.

### Task 6: Add a Central Semantic Presentation Style Resolver

**Files:**
- Create: `src/engine/sysml/semanticPresentationStyles.ts`
- Create: `src/engine/sysml/semanticPresentationStyles.test.ts`
- Modify: `src/index.css`
- Modify: `src/App.tsx`
- Modify: `src/components/statemachine/StateRequirementTraceability.tsx`
- Modify: related State traceability and SysML diagram component tests

- [ ] **Step 1: Add failing role mapping tests.** Verify every role in `SemanticPresentationRole` maps to one CSS custom property and unknown/absent customization resolves deterministically by role.
- [ ] **Step 2: Add failing override tests.** A valid user presentation override takes precedence for the presentation only; it must not change the semantic role or another diagram's presentation.
- [ ] **Step 3: Run focused style tests.** Run `npx vitest run src/engine/sysml/semanticPresentationStyles.test.ts src/components/statemachine/StateRequirementTraceability.test.tsx`. Expected: missing resolver/tokens fail initially.
- [ ] **Step 4: Define theme tokens in `src/index.css`.** Add light and dark values for standard Port, ProxyPort, FullPort, FlowPort, Requirement relationship, selection, warning, and error roles. Reuse existing block blue, requirement neutral, State orange, application orange focus, amber warning, and red error families.
- [ ] **Step 5: Add resolver and replace workflow hard-codes.** Implement `semanticPresentationToken(role)` and consume it for BDD/IBD Port symbols, tree feature glyphs, type-selection dialog, State traceability controls, connection previews/errors, and committed relationship projections. Keep selected State styling and user overrides intact.
- [ ] **Step 6: Add accessible non-color status.** Pair warning/error token colors with visible labels/icons and accessible names; ensure contrast in light and dark themes.
- [ ] **Step 7: Run focused style tests.** Run the command from Step 3. Expected: all roles resolve and UI components reference semantic tokens.

### Task 7: Complete Browser-Level Semantic Workflows and Real Reload Coverage

**Files:**
- Modify: `tests/e2e/sysml-diagram-interaction-corrections.spec.ts`
- Modify: existing Playwright fixtures/helpers responsible for application save, restart/reload, and project re-open
- Modify: `src/App.tsx` only where stable accessible selectors or missing user-facing behavior are required

- [ ] **Step 1: Replace in-memory JSON reload assertions.** Use the app's normal save flow, reload the browser page, reopen the saved project, and assert semantic IDs, feature IDs, type IDs, presentation IDs, and diagram references are stable.
- [ ] **Step 2: Make Port type coverage explicit.** Create Standard, Proxy, Full, and legacy Flow Ports from both tree and canvas. Assert selected type IDs; assert wrong-type candidates are disabled/rejected; assert no choice/cancel creates no feature; assert `CreateNewType` is a separate explicit action.
- [ ] **Step 3: Add State-to-Requirement persistence workflow.** Create Requirement and State, create the legal Satisfy relationship, assert source/target IDs and projection, make an unrelated mutation, save, reload, and verify the same one relationship remains valid and visible. Attempt reverse direction and assert structured endpoint diagnostics.
- [ ] **Step 4: Add Property relationship workflow.** Create typed Part Properties and target Blocks, create each supported Association/Dependency/Allocate relationship through its explicit tool, assert endpoint IDs, rename endpoints, undo, redo, save, reload, and verify no duplicated semantic definitions/usages/relationships.
- [ ] **Step 5: Make TestCase impact confirmation mandatory.** Remove the optional 500 ms check. Assert the impact dialog appears whenever dependencies/presentations exist; cancel and verify no mutation; repeat and confirm, then verify deletion and undo restoration.
- [ ] **Step 6: Verify visual roles in both themes.** Assert computed or SVG presentation styles use the semantic token roles for Requirement, State, each Port kind, valid relationship, selection, warning, and error. Verify tree and canvas presentations use consistent roles and reload preserves valid overrides.
- [ ] **Step 7: Run the focused browser suite.** Run `npx playwright test tests/e2e/sysml-diagram-interaction-corrections.spec.ts`. Expected: all required workflows execute without conditional assertions for mandatory behavior.

### Task 8: Run Release Gates and Reconcile the Existing Repair Checklist

**Files:**
- Modify: `docs/superpowers/plans/2026-09-26-sysml-diagram-interaction-review-repairs.md`
- Modify: `docs/sysml/compliance-evidence.json` if evidence statuses change after final run
- Modify: only source files implicated by failing gates

- [ ] **Step 1: Map old checklist items to completed tasks.** For each unchecked item in the prior repair plan, record the new task/step that fulfills it or explicitly mark it superseded by the approved specification. Do not check a box based only on implementation presence.
- [ ] **Step 2: Run TypeScript validation.** Run `npx tsc --noEmit`. Expected: exit code 0.
- [ ] **Step 3: Run focused semantic suites.** Run `npx vitest run src/engine/sysml/semanticEndpointIndex.test.ts src/services/sysmlOwnedFeatureCommands.test.ts src/services/sysmlCommandGateway.test.ts src/engine/sysml/validation/portRules.test.ts src/engine/sysml/diagramInteractionCompliance.test.ts`. Expected: all tests pass.
- [ ] **Step 4: Run repository and feature release gates.** Run `npx vitest run src/engine/sysml/repositoryFirstTreeReleaseGate.test.ts src/engine/sysml/repositoryPresentationReleaseGate.test.ts src/engine/sysml/requirementsDiagramScope.appIntegration.test.ts src/engine/sysml/diagramInteractionCorrections.test.ts`. Expected: all tests pass without relaxing assertions.
- [ ] **Step 5: Run browser and code-generation gates.** Run `npx playwright test tests/e2e/sysml-diagram-interaction-corrections.spec.ts`, `npm run test:sysml:release-gate`, and `npm run verify:repository-codegen-isolation`. Expected: browser workflows persist and reopen canonical IDs; generated outputs remain unchanged except for intentional semantic traceability fixes.
- [ ] **Step 6: Review final evidence and diff.** Confirm every compliance status cites current test results and that `git diff --check` reports no whitespace errors. Confirm unrelated user changes remain untouched.
- [ ] **Step 7: Mark plan completion accurately.** Check only the old checklist steps demonstrated by code and passing gates; leave any blocked feature explicitly partial with its reason. Record test commands and commit references in the final implementation handoff.

## Completion Gate

The repair is complete only when all Tasks 1–8 pass, no creation workflow has a first-candidate fallback, State relationships remain valid after unrelated mutation and real reload, usage-ID collisions leave all state unchanged, compliance uses current passing test results, required TestCase impact confirmation is non-optional, and all affected UI surfaces use the centralized palette tokens.
