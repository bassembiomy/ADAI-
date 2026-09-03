# OPM Code Generation and Modeling Correction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make OPM modeling, TypeScript simulation, and generated C implement one secure, deterministic, differentially verified execution contract.

**Architecture:** React Flow data crosses a strict editor boundary into a canonical normalized executable IR. The TypeScript runtime is the reference implementation, while C artifacts are generated from the same IR and must compile and reproduce machine-readable step snapshots before export is enabled.

**Tech Stack:** TypeScript 5, React 18, React Flow, Vitest, Electron IPC, Node `crypto`/`child_process`, C99, bundled w64devkit GCC, JSZip.

## Global Constraints

- Scope is OPM modeling, OPM simulation, and OPM C generation only; do not change V-Lab, State Machine, or X-Bridges behavior.
- Preserve all unrelated dirty-worktree changes. Stage and commit only the exact files named by each task.
- Before implementation, capture the currently untracked/modified OPM implementation in a reviewed OPM-only baseline commit, then create an isolated worktree from that commit with `superpowers:using-git-worktrees`.
- Use strict red-green-refactor TDD for every behavior change.
- Never copy raw editor strings into generated C identifiers, literals, expressions, preprocessor tokens, or comments.
- Generation must stop on schema, graph, semantic, or expression errors.
- The required strict C qualification gate must fail when the bundled compiler is unavailable; only explicitly local, non-release smoke commands may allow a skip.
- Export is allowed only when the current semantic SHA-256 fingerprint equals the verified artifact fingerprint.
- Preserve conceptual-only OPM diagrams, saved-project compatibility, and existing OPL behavior.
- Do not weaken a diagnostic, omit a conformance field, or add an allowlist merely to make a test pass.

---

## File Structure

### Compiler and runtime

- Modify `src/engine/opm/executableTypes.ts`: canonical values, enabled flags, diagnostics, runtime snapshot, and verification types.
- Modify `src/engine/opm/editorBoundaryTypes.ts`: persisted editor-boundary types only.
- Modify `src/engine/opm/schemaAdapter.ts`: strict boundary validation, canonicalization, connection validation, deterministic ordering.
- Modify `src/engine/opm/semanticValidator.ts`: execution graph, ownership, capacity, and causality validation.
- Modify `src/engine/opm/pipeline.ts`: compile only canonical fields and produce SHA-256 identity.
- Create `src/engine/opm/canonicalHash.ts`: browser-safe canonical JSON and synchronous SHA-256.
- Modify `src/engine/opm/runtime.ts`: canonical step semantics and machine-readable snapshots.
- Create `src/engine/opm/runtimeSemantics.ts`: shared phase names, status/diagnostic codes, numeric policy helpers, and deterministic ordering helpers.
- Modify `src/engine/opm/cIr.ts`: resolved C lvalues and type-correct expression rendering.
- Modify `src/engine/opm/cGenerator.ts`: artifact orchestration and manifest only.
- Create `src/engine/opm/cModelGenerator.ts`: model tables, typed storage, initialization, guards, and actions.
- Create `src/engine/opm/cRuntimeGenerator.ts`: bounded scheduler, queues, writes, transitions, diagnostics, trace, and public API.

### Qualification and security boundary

- Create `src/engine/opm/conformanceTypes.ts`: scenario and snapshot interchange format.
- Create `src/engine/opm/conformanceHarness.ts`: execute TypeScript scenarios and compare snapshots.
- Create `src/engine/opm/cHostHarness.ts`: write artifacts, invoke bundled GCC by argument array, execute harness, parse JSONL.
- Create `src/engine/opm/__tests__/adversarialBoundary.test.ts`.
- Create `src/engine/opm/__tests__/runtimeConformance.test.ts`.
- Replace `src/engine/opm/__tests__/hostCompilation.test.ts`.
- Replace `src/engine/opm/__tests__/goldenExecution.test.ts`.
- Extend `src/engine/opm/__tests__/cGenerator.test.ts`.
- Extend `src/engine/opm/__tests__/runtime.test.ts`.
- Create `src/security/opmCodeVerifier.cjs` and `src/security/opmCodeVerifier.test.cjs`.
- Modify `src/main.cjs` and `src/preload.cjs`: allowlisted OPM verification IPC.

### Modeling and UI

- Modify `src/components/entropy/OpmLinkRules.ts`: expose the production connection validator used by compiler and canvas.
- Modify `src/components/entropy/OpmExecutionPropertiesPanel.tsx`: complete typed editors.
- Modify `src/components/entropy/OpmTargetSettingsModal.tsx`: validated target settings.
- Modify `src/components/entropy/OpmSimulationEngine.ts`: canonical runtime facade only.
- Modify `src/components/entropy/OpmLiveTraceOverlay.tsx`: render actual runtime snapshot.
- Modify `src/components/entropy/OpmDiagnosticsBadge.tsx`: exact diagnostic navigation.
- Modify `src/components/entropy/EntropyWorkspace.tsx`: runtime ownership, link selection, verification lifecycle, preview, and export gating.
- Create `src/components/entropy/OpmCodeGenerationWorkspace.tsx`.
- Extend `src/components/entropy/__tests__/opmSimulationEngine.test.ts`.
- Replace `src/components/entropy/__tests__/executionPanels.test.tsx` with interaction tests.
- Extend `src/components/entropy/__tests__/traceOverlay.test.tsx`.
- Create `src/components/entropy/__tests__/opmCodeGenerationWorkspace.test.tsx`.

### Persistence, scripts, and documentation

- Modify `src/engine/opm/persistence.ts` and `src/engine/opm/__tests__/persistence.test.ts`.
- Modify `package.json`: add complete OPM qualification commands.
- Modify `docs/guides/entropy_opm_embedded_c.md`: verified workflow and diagnostic behavior.

---

### Task 1: Establish Truthful Compiler-Boundary Gates

**Files:**
- Create: `src/engine/opm/__tests__/adversarialBoundary.test.ts`
- Modify: `src/engine/opm/__tests__/schemaAdapter.test.ts`
- Modify: `src/engine/opm/__tests__/normalization.test.ts`
- Modify: `src/engine/opm/__tests__/pipeline.test.ts`

**Interfaces:**
- Consumes: `compileExecutableOpm(nodes, edges, config)` and existing fixture helpers.
- Produces: a failing security/correctness gate that later tasks must satisfy.

- [ ] **Step 1: Add adversarial fixtures that demonstrate unsafe boundary behavior**

```ts
import { describe, expect, it } from 'vitest';
import { compileExecutableOpm } from '../pipeline';
import { generateOpmCArtifacts } from '../cGenerator';
import { makeApplianceFixture } from '../fixtures';

describe('OPM executable boundary', () => {
  it.each([
    ['bool', 'false'],
    ['int32', '0; injected_call()'],
    ['uint32', -1],
    ['float32', 'NaN'],
  ])('rejects non-canonical %s initial value %#', (kind, initialValue) => {
    const fixture = makeApplianceFixture();
    const object = fixture.nodes.find(node => node.data.type === 'object')!;
    object.data.objectExecution!.attributes[0] = {
      ...object.data.objectExecution!.attributes[0],
      type: { kind } as never,
      initialValue,
    };
    const result = compileExecutableOpm(fixture.nodes, fixture.edges, fixture.config);
    expect(result.model).toBeUndefined();
    expect(result.diagnostics.map(item => item.code)).toContain('OPM_INVALID_INITIAL_VALUE');
  });

  it('uses a resolved C identifier when stable ID and C name differ', () => {
    const fixture = makeApplianceFixture();
    const object = fixture.nodes.find(node => node.data.type === 'object')!;
    const attribute = object.data.objectExecution!.attributes[0];
    attribute.id = 'stable-id-with-dash';
    attribute.cIdentifier = 'safe_value';
    for (const node of fixture.nodes) {
      for (const assignment of node.data.processExecution?.assignments ?? []) {
        assignment.targetAttributeId = attribute.id;
      }
    }
    const compiled = compileExecutableOpm(fixture.nodes, fixture.edges, fixture.config);
    expect(compiled.diagnostics.filter(item => item.severity === 'error')).toEqual([]);
    const source = generateOpmCArtifacts(compiled.model!).files
      .find(file => file.name === 'opm_model.c')!.content;
    expect(source).toContain('instance->safe_value');
    expect(source).not.toContain('instance->stable-id-with-dash');
  });
});
```

- [ ] **Step 2: Add graph/settings cases**

Add table-driven cases for zero/negative/non-integer capacities, duplicate events and enum members, invalid enum initial values, hostile C identifiers, valid requirement structural links, invalid persisted procedural directions, and disabled process/link payloads. Assert exact diagnostic codes and source property paths.

- [ ] **Step 3: Run the boundary tests and verify RED**

Run:

```powershell
npx vitest run src/engine/opm/__tests__/adversarialBoundary.test.ts src/engine/opm/__tests__/schemaAdapter.test.ts src/engine/opm/__tests__/normalization.test.ts src/engine/opm/__tests__/pipeline.test.ts --reporter=verbose
```

Expected: failures proving malformed values compile, invalid persisted links are accepted, disabled behavior is lost, and assignment IDs leak into C.

- [ ] **Step 4: Commit only the failing tests**

```powershell
git add src/engine/opm/__tests__/adversarialBoundary.test.ts src/engine/opm/__tests__/schemaAdapter.test.ts src/engine/opm/__tests__/normalization.test.ts src/engine/opm/__tests__/pipeline.test.ts
git commit -m "test(opm): expose executable boundary violations"
```

---

### Task 2: Canonicalize Schema, Graph, Values, and Fingerprints

**Files:**
- Modify: `src/engine/opm/executableTypes.ts`
- Modify: `src/engine/opm/editorBoundaryTypes.ts`
- Modify: `src/engine/opm/schemaAdapter.ts`
- Modify: `src/engine/opm/semanticValidator.ts`
- Modify: `src/engine/opm/pipeline.ts`
- Modify: `src/components/entropy/OpmLinkRules.ts`
- Test: files from Task 1 plus `src/components/entropy/__tests__/opmLinkRules.test.ts`

**Interfaces:**
- Produces: `CanonicalOpmValue`, enabled compiled elements, `resolvedTargetCIdentifier`, `validateOpmConnectionContract`, and a 64-character SHA-256 fingerprint.

- [ ] **Step 1: Define canonical compiler types**

```ts
export type CanonicalOpmValue = boolean | number | { enumId: string; memberId: string; cIdentifier: string };

export interface CompiledOpmAssignment {
  id: string;
  targetAttributeId: string;
  resolvedTargetCIdentifier: string;
  operator: OpmAssignmentOperator;
  expressionText: string;
  expressionIr: TypedExpressionIr;
  enabled: boolean;
  source: OpmSourceRef;
}

export interface CompiledOpmProcess {
  enabled: boolean;
  id: string;
  name: string;
  cIdentifier: string;
  physical: boolean;
  order: number;
  source: OpmSourceRef;
  activation: 'cyclic' | 'triggered' | 'both';
  inputAttributeIds: readonly string[];
  outputAttributeIds: readonly string[];
  guardText: string;
  guardIr?: TypedExpressionIr;
  assignments: readonly CompiledOpmAssignment[];
  priority: number;
  periodMs?: number;
  debounceMs: number;
  reentrancy: 'reject';
}

export interface CompiledOpmLink {
  enabled: boolean;
  id: string;
  type: string;
  sourceId: string;
  targetId: string;
  order: number;
  source: OpmSourceRef;
  guardText: string;
  guardIr?: TypedExpressionIr;
  eventId?: string;
  assignments: readonly CompiledOpmAssignment[];
  transition?: OpmTransitionRequest;
  priority: number;
  delayMs: number;
}
```

- [ ] **Step 2: Implement typed value and settings canonicalization**

Add pure functions in `schemaAdapter.ts`:

```ts
export function canonicalizeInitialValue(
  attribute: OpmAttribute,
  enums: readonly OpmEnumDefinition[],
  source: OpmSourceRef,
): { value?: CanonicalOpmValue; diagnostics: OpmDiagnostic[] };

export function validateTargetSettings(
  settings: unknown,
): { settings?: OpmTargetSettings; diagnostics: OpmDiagnostic[] };
```

Require finite integer `tickMs`, `eventQueueCapacity`, `maxStagedWrites`, `maxTransitions`, and `traceCapacity` in `1..65535`. Require finite representable scalar values, declared enum members, valid min/max ordering, unique sanitized identifiers, and non-empty hardware symbols matching `/^[A-Za-z_][A-Za-z0-9_]*$/`.

- [ ] **Step 3: Unify canvas and compiler connection validation**

Move the pure rule contract behind this exported function and call it from both `EntropyWorkspace.tsx` connection handling and `semanticValidator.ts`:

```ts
export interface OpmConnectionVerdict {
  valid: boolean;
  code?: string;
  reason?: string;
}

export function validateOpmConnectionContract(
  sourceKind: string,
  targetKind: string,
  linkType: string,
): OpmConnectionVerdict;
```

Structural requirement links remain valid normalization endpoints but never enter executable scheduling tables.

- [ ] **Step 4: Compile resolved identifiers and preserve enabled flags**

In `pipeline.ts`, resolve every assignment target through the attribute symbol table. Return a blocking `OPM_ASSIGNMENT_TARGET_UNKNOWN` diagnostic instead of creating a fallback literal IR. Copy `enabled` into compiled processes and links and exclude disabled behavior during semantic reachability/conflict analysis.

- [ ] **Step 5: Replace the short hash with browser-safe canonical SHA-256**

Create `canonicalHash.ts` with a deterministic serializer that recursively sorts object keys while preserving already normalized semantic arrays. Implement synchronous SHA-256 in pure TypeScript so `compileExecutableOpm` remains synchronous and works in the Vite renderer without importing Node built-ins:

```ts
export function canonicalJson(value: unknown): string;
export function sha256Hex(utf8Text: string): string;

export function computeModelFingerprint(payload: unknown): string {
  return sha256Hex(canonicalJson(payload));
}
```

Test `sha256Hex('abc')` against the published SHA-256 vector `ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad`. Assert the model fingerprint matches `/^[a-f0-9]{64}$/` and is unchanged by React Flow array order or plain-object property order.

- [ ] **Step 6: Run focused and full OPM tests**

Run the Task 1 command plus:

```powershell
npx vitest run src/engine/opm/__tests__/semanticValidator.test.ts src/components/entropy/__tests__/opmLinkRules.test.ts --reporter=verbose
npx tsc --noEmit
```

Expected: all pass with no TypeScript errors.

- [ ] **Step 7: Commit**

```powershell
git add src/engine/opm/executableTypes.ts src/engine/opm/editorBoundaryTypes.ts src/engine/opm/schemaAdapter.ts src/engine/opm/semanticValidator.ts src/engine/opm/pipeline.ts src/engine/opm/canonicalHash.ts src/components/entropy/OpmLinkRules.ts src/engine/opm/__tests__ src/components/entropy/__tests__/opmLinkRules.test.ts
git commit -m "fix(opm): secure the executable compiler boundary"
```

---

### Task 3: Correct the Canonical TypeScript Runtime

**Files:**
- Create: `src/engine/opm/runtimeSemantics.ts`
- Create: `src/engine/opm/__tests__/runtimeConformance.test.ts`
- Modify: `src/engine/opm/runtime.ts`
- Modify: `src/engine/opm/executableTypes.ts`
- Modify: `src/engine/opm/__tests__/runtime.test.ts`

**Interfaces:**
- Produces: `OpmStepSnapshot`, `OpmRuntimeDiagnostic`, and runtime APIs used by UI and C parity.

- [ ] **Step 1: Add failing causality, capacity, numeric, waiting, and reset tests**

```ts
it('does not execute a result-link assignment when its source process did not fire', () => {
  const runtime = createOpmRuntime(modelWithGuardedResultLink(false));
  const result = stepOpmRuntime(runtime, 10);
  expect(result.values.output).toBe(0);
  expect(result.traversedLinkIds).toEqual([]);
});

it('rejects a failed expression without committing a fabricated zero', () => {
  const runtime = createOpmRuntime(modelWithDivisionByZero());
  const result = stepOpmRuntime(runtime, 10);
  expect(result.values.output).toBe(7);
  expect(result.diagnostics.map(item => item.code)).toContain('OPM_EXPR_DIV_ZERO');
});

it('reports waiting while a triggered process has no event', () => {
  const result = stepOpmRuntime(createOpmRuntime(triggeredModel()), 10);
  expect(result.lifecycle).toBe('waiting');
  expect(result.finished).toBe(false);
});
```

Also cover max staged writes, max transitions, trace capacity, `rejectNewest`, `dropOldest`, diagnostic/wrap/saturate numeric policy, state exit-before-entry order, delayed-transition staleness diagnostics, duplicate FIFO events, and complete reset.

- [ ] **Step 2: Verify RED**

```powershell
npx vitest run src/engine/opm/__tests__/runtime.test.ts src/engine/opm/__tests__/runtimeConformance.test.ts --reporter=verbose
```

- [ ] **Step 3: Define the stable result contract**

```ts
export type OpmRuntimeLifecycle = 'ready' | 'running' | 'waiting' | 'finished' | 'faulted';

export interface OpmStepSnapshot {
  stepIndex: number;
  timeMs: number;
  status: OpmRuntimeStatus;
  lifecycle: OpmRuntimeLifecycle;
  values: Readonly<Record<string, boolean | number | string>>;
  activeStates: Readonly<Record<string, string>>;
  queuedEventIds: readonly string[];
  stateTimersMs: Readonly<Record<string, number>>;
  processTimersMs: Readonly<Record<string, number>>;
  firedProcessIds: readonly string[];
  blockedProcessIds: readonly string[];
  traversedLinkIds: readonly string[];
  committedWriteIds: readonly string[];
  transitions: readonly CommittedTransition[];
  diagnostics: readonly OpmDiagnostic[];
}
```

- [ ] **Step 4: Implement fail-closed phased execution**

In `runtimeSemantics.ts`, centralize stable sorting, bounded push, typed numeric coercion, and diagnostic codes. In `runtime.ts`, require a fired source process before activating process-originating links, preserve an immutable snapshot for evaluation, stop failed expressions from staging writes, enforce all configured capacities, consume only accepted events, and return a complete snapshot.

- [ ] **Step 5: Run runtime, pipeline, and type tests**

```powershell
npx vitest run src/engine/opm/__tests__/runtime.test.ts src/engine/opm/__tests__/runtimeConformance.test.ts src/engine/opm/__tests__/pipeline.test.ts --reporter=verbose
npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```powershell
git add src/engine/opm/runtimeSemantics.ts src/engine/opm/runtime.ts src/engine/opm/executableTypes.ts src/engine/opm/__tests__/runtime.test.ts src/engine/opm/__tests__/runtimeConformance.test.ts
git commit -m "fix(opm): enforce canonical runtime semantics"
```

---

### Task 4: Generate a Complete Bounded C Runtime

**Files:**
- Create: `src/engine/opm/cModelGenerator.ts`
- Create: `src/engine/opm/cRuntimeGenerator.ts`
- Modify: `src/engine/opm/cGenerator.ts`
- Modify: `src/engine/opm/cIr.ts`
- Modify: `src/engine/opm/__tests__/cGenerator.test.ts`
- Modify: `src/engine/opm/__tests__/examples.test.ts`

**Interfaces:**
- Consumes: canonical `ExecutableOpmModel` and `runtimeSemantics` codes/order.
- Produces: the existing artifact names plus complete `OPM_GetDiagnostics()` and deterministic scheduler behavior.

- [ ] **Step 1: Add structural generator tests that fail on the sequential runtime**

```ts
it('emits bounded scheduler state and diagnostics API', () => {
  const files = generateOpmCArtifacts(applianceModel).files;
  const header = file(files, 'opm_runtime.h');
  const source = file(files, 'opm_runtime.c');
  expect(header).toContain('const OPM_Diagnostics_t *OPM_GetDiagnostics');
  expect(source).toContain('OPM_EvaluateEligibility');
  expect(source).toContain('OPM_ResolveWriteConflicts');
  expect(source).toContain('OPM_CommitTransitions');
  expect(source).toContain('OPM_RunStateActions');
});

it('never renders a stable ID as an assignment lvalue', () => {
  expect(file(generated.files, 'opm_model.c')).toContain('instance->safe_value');
  expect(file(generated.files, 'opm_model.c')).not.toContain('stable-id-with-dash');
});
```

Assert no heap calls, exact configured array bounds, no raw label/comment injection, unknown-event validation, both FIFO overflow policies, enabled tables, and type-correct integer/float operations.

- [ ] **Step 2: Verify RED**

```powershell
npx vitest run src/engine/opm/__tests__/cGenerator.test.ts src/engine/opm/__tests__/examples.test.ts --reporter=verbose
```

- [ ] **Step 3: Split orchestration from emitters**

Keep `generateOpmCArtifacts(model)` as the public entry point. Make it call:

```ts
export function generateOpmModelFiles(model: ExecutableOpmModel): GeneratedOpmFile[];
export function generateOpmRuntimeFiles(model: ExecutableOpmModel): GeneratedOpmFile[];
```

`cGenerator.ts` owns deterministic file order and manifest construction only.

- [ ] **Step 4: Generate canonical model tables**

Emit typed attribute fields, canonical initialization literals, active-state tables, process/link metadata, guards, action evaluators that return status, and source-to-generated trace tables. Use `resolvedTargetCIdentifier` for every lvalue.

- [ ] **Step 5: Generate the bounded scheduler**

Implement C functions corresponding one-to-one with the TypeScript phases: input sampling, timer advancement, activation, snapshot evaluation, staging, capacity checking, conflict resolution, atomic commit, state actions, event consumption, output publication, trace, and diagnostics. `OPM_Step` returns the highest-severity status produced by the step and never commits a failed expression as zero.

- [ ] **Step 6: Run generator tests and TypeScript checks**

```powershell
npx vitest run src/engine/opm/__tests__/cGenerator.test.ts src/engine/opm/__tests__/examples.test.ts --reporter=verbose
npx tsc --noEmit
```

- [ ] **Step 7: Commit**

```powershell
git add src/engine/opm/cGenerator.ts src/engine/opm/cModelGenerator.ts src/engine/opm/cRuntimeGenerator.ts src/engine/opm/cIr.ts src/engine/opm/__tests__/cGenerator.test.ts src/engine/opm/__tests__/examples.test.ts
git commit -m "fix(opm): generate the canonical bounded C runtime"
```

---

### Task 5: Add Mandatory C Compilation and Differential Parity

**Files:**
- Create: `src/engine/opm/conformanceTypes.ts`
- Create: `src/engine/opm/conformanceHarness.ts`
- Create: `src/engine/opm/cHostHarness.ts`
- Replace: `src/engine/opm/__tests__/hostCompilation.test.ts`
- Replace: `src/engine/opm/__tests__/goldenExecution.test.ts`
- Modify: `src/engine/opm/fixtures.ts`

**Interfaces:**
- Produces: `runTypescriptScenario`, `compileAndRunOpmCScenario`, and `compareOpmSnapshots`.

- [ ] **Step 1: Define shared conformance records**

```ts
export interface OpmScenarioStep {
  deltaMs: number;
  inputValues?: Record<string, boolean | number | string>;
  dispatchEventIds?: string[];
  resetBeforeStep?: boolean;
}

export interface OpmConformanceScenario {
  name: string;
  model: ExecutableOpmModel;
  steps: readonly OpmScenarioStep[];
}

export interface OpmConformanceResult {
  snapshots: readonly OpmStepSnapshot[];
  stdout: string;
}
```

- [ ] **Step 2: Write a real differential test and verify RED**

Run at least 100 steps covering cyclic activation, dispatched events, timeout, delayed transition, conflict, reset, queue boundaries, overflow, I/O, and reversed model order. Compare every snapshot field, using exact comparison for integer/bool/enum/state/IDs and float32-bit comparison for `float32` values.

```ts
const expected = runTypescriptScenario(scenario);
const actual = compileAndRunOpmCScenario(scenario);
expect(compareOpmSnapshots(expected.snapshots, actual.snapshots)).toEqual([]);
```

Expected initially: mismatch because the current host harness does not emit semantic snapshots.

- [ ] **Step 3: Implement bundled compiler discovery without shell command construction**

```ts
export function resolveRequiredOpmCompiler(repoRoot: string): string {
  const bundled = path.join(repoRoot, 'toolchains', 'w64devkit', 'w64devkit', 'bin', 'gcc.exe');
  if (process.platform === 'win32' && fs.existsSync(bundled)) return bundled;
  const configured = process.env.ADIA_OPM_CC;
  if (configured && fs.existsSync(configured)) return configured;
  throw new Error('OPM qualification compiler is unavailable');
}
```

Invoke with `execFileSync(compiler, args, { cwd })`. Never interpolate paths into a shell string.

- [ ] **Step 4: Generate and parse JSONL snapshots**

The C harness prints one JSON object per accepted or rejected step with the exact `OpmStepSnapshot` fields. Parse strictly: reject extra non-empty stdout, missing fields, duplicate step indexes, non-finite numbers, or invalid IDs.

- [ ] **Step 5: Replace the misleading tests**

The strict host test must fail, not return success, when compiler discovery or execution fails. The golden test must compare actual C execution rather than file count or source substrings.

- [ ] **Step 6: Run qualification tests**

```powershell
npx vitest run src/engine/opm/__tests__/hostCompilation.test.ts src/engine/opm/__tests__/goldenExecution.test.ts --reporter=verbose
```

Expected: bundled GCC compiles with `-std=c99 -pedantic-errors -Wall -Wextra -Werror`; all snapshots match.

- [ ] **Step 7: Commit**

```powershell
git add src/engine/opm/conformanceTypes.ts src/engine/opm/conformanceHarness.ts src/engine/opm/cHostHarness.ts src/engine/opm/fixtures.ts src/engine/opm/__tests__/hostCompilation.test.ts src/engine/opm/__tests__/goldenExecution.test.ts
git commit -m "test(opm): require generated C differential parity"
```

---

### Task 6: Unify the Modeling UI with the Canonical Runtime

**Files:**
- Modify: `src/components/entropy/OpmSimulationEngine.ts`
- Modify: `src/components/entropy/EntropyWorkspace.tsx`
- Modify: `src/components/entropy/OpmLiveTraceOverlay.tsx`
- Modify: `src/components/entropy/OpmDiagnosticsBadge.tsx`
- Modify: `src/components/entropy/__tests__/opmSimulationEngine.test.ts`
- Modify: `src/components/entropy/__tests__/traceOverlay.test.tsx`

**Interfaces:**
- Consumes: `OpmStepSnapshot` and canonical runtime APIs.
- Produces: one persistent runtime controller and exact diagnostic navigation callback.

- [ ] **Step 1: Add failing facade and UI behavior tests**

Test that a waiting process does not stop simulation, event dispatch reaches the canonical queue, reset clears the canonical runtime, runtime diagnostics reach logs, HUD values come from the latest snapshot, traversed links animate, and a failed step preserves the prior committed display.

```ts
expect(result.state.lifecycle).toBe('waiting');
expect(result.state.finished).toBe(false);
expect(result.snapshot.values.counter).toBe(3);
expect(result.snapshot.traversedLinkIds).toContain('result-link');
```

- [ ] **Step 2: Verify RED**

```powershell
npx vitest run src/components/entropy/__tests__/opmSimulationEngine.test.ts src/components/entropy/__tests__/traceOverlay.test.tsx --reporter=verbose
```

- [ ] **Step 3: Replace split conceptual/executable state for enabled models**

Expose a facade:

```ts
export interface OpmSimulationController {
  compile(nodes: AppNode[], edges: AppEdge[], config: OpmExecutionConfig): CompileOpmResult;
  step(deltaMs?: number): OpmStepSnapshot;
  dispatchEvent(eventId: string): OpmDispatchResult;
  reset(): OpmStepSnapshot;
  getSnapshot(): OpmStepSnapshot;
}
```

Conceptual-only diagrams may retain the existing animation simulator. Once executable behavior is enabled, all state/event/process controls use this controller.

- [ ] **Step 4: Drive workspace visuals from snapshots**

Store the latest snapshot, not reconstructed initial values. Pass actual `values`, `activeStates`, `firedProcessIds`, `traversedLinkIds`, `timeMs`, `stepIndex`, and diagnostics to canvas and HUD components. Remove the rule that `firedProcessIds.length === 0` implies completion.

- [ ] **Step 5: Implement exact diagnostic navigation**

Use one callback:

```ts
type NavigateToOpmDiagnostic = (source: OpmSourceRef) => void;
```

It selects either node or edge by `elementId`, opens the executable inspector, and focuses a control carrying `data-opm-path={source.propertyPath}`.

- [ ] **Step 6: Run tests and commit**

```powershell
npx vitest run src/components/entropy/__tests__/opmSimulationEngine.test.ts src/components/entropy/__tests__/traceOverlay.test.tsx --reporter=verbose
npx tsc --noEmit
git add src/components/entropy/OpmSimulationEngine.ts src/components/entropy/EntropyWorkspace.tsx src/components/entropy/OpmLiveTraceOverlay.tsx src/components/entropy/OpmDiagnosticsBadge.tsx src/components/entropy/__tests__/opmSimulationEngine.test.ts src/components/entropy/__tests__/traceOverlay.test.tsx
git commit -m "fix(opm): drive modeling UI from canonical runtime"
```

---

### Task 7: Complete Typed Executable Modeling Editors

**Files:**
- Modify: `src/components/entropy/OpmExecutionPropertiesPanel.tsx`
- Modify: `src/components/entropy/OpmTargetSettingsModal.tsx`
- Modify: `src/components/entropy/EntropyWorkspace.tsx`
- Replace: `src/components/entropy/__tests__/executionPanels.test.tsx`

**Interfaces:**
- Produces: typed control updates and reachable object/state/process/link/canvas inspectors.

- [ ] **Step 1: Replace component-instantiation tests with interaction tests**

Using the repository's React test renderer pattern, exercise adding/editing/reordering/disabling/deleting attributes and assignments; editing typed Boolean/numeric/enum values; selecting legal references; configuring state entry/exit actions; configuring link transition/event/delay; editing event/enum tables; and rejecting invalid settings.

Assert that selecting an edge produces:

```ts
expect(screen.getByTestId('link-execution-inspector')).toBeDefined();
```

Assert display-name edits do not copy raw text into `cIdentifier` and Boolean `false` remains a Boolean.

- [ ] **Step 2: Verify RED**

```powershell
npx vitest run src/components/entropy/__tests__/executionPanels.test.tsx --reporter=verbose
```

- [ ] **Step 3: Implement typed reusable rows**

Within `OpmExecutionPropertiesPanel.tsx`, introduce focused internal components with explicit props:

```ts
interface AssignmentRowsProps {
  value: readonly OpmAssignment[];
  writableAttributes: readonly OpmAttributeOption[];
  onChange(next: OpmAssignment[]): void;
}

interface TypedValueEditorProps {
  type: OpmScalarType;
  value: boolean | number | string;
  enumOptions: readonly OpmEnumDefinition[];
  onChange(value: boolean | number | string): void;
}
```

Use stable generated IDs, accessible labels, and `data-opm-path` on every diagnostic target.

- [ ] **Step 4: Make all selection types reachable**

Build `currentSelection` from selected node or selected edge. Pass the relevant execution payload and write changes immutably back to the matching element. Provide event/enum editing on canvas selection.

- [ ] **Step 5: Validate target settings before save**

Render inline errors returned by `validateTargetSettings`; disable Save and Export while errors exist.

- [ ] **Step 6: Run tests and commit**

```powershell
npx vitest run src/components/entropy/__tests__/executionPanels.test.tsx src/engine/opm/__tests__/schemaAdapter.test.ts --reporter=verbose
npx tsc --noEmit
git add src/components/entropy/OpmExecutionPropertiesPanel.tsx src/components/entropy/OpmTargetSettingsModal.tsx src/components/entropy/EntropyWorkspace.tsx src/components/entropy/__tests__/executionPanels.test.tsx
git commit -m "feat(opm): complete typed executable modeling editors"
```

---

### Task 8: Add Verified Generation, Preview, and Export Gating

**Files:**
- Create: `src/components/entropy/OpmCodeGenerationWorkspace.tsx`
- Create: `src/components/entropy/__tests__/opmCodeGenerationWorkspace.test.tsx`
- Create: `src/security/opmCodeVerifier.cjs`
- Create: `src/security/opmCodeVerifier.test.cjs`
- Modify: `src/main.cjs`
- Modify: `src/preload.cjs`
- Modify: `src/components/entropy/EntropyWorkspace.tsx`
- Modify: `src/engine/opm/persistence.ts`
- Modify: `src/engine/opm/__tests__/persistence.test.ts`

**Interfaces:**
- Produces: `opm-verify-generated-c` IPC and fingerprint-bound `OpmArtifactLifecycle`.

- [ ] **Step 1: Add lifecycle and security tests**

```ts
export type OpmArtifactLifecycle =
  | { state: 'edited' | 'validated' }
  | { state: 'generated'; fingerprint: string; files: GeneratedOpmFile[] }
  | { state: 'verifying'; fingerprint: string; files: GeneratedOpmFile[] }
  | { state: 'verified'; fingerprint: string; files: GeneratedOpmFile[]; evidence: OpmVerificationEvidence }
  | { state: 'failed'; fingerprint: string; files: GeneratedOpmFile[]; errors: string[] };
```

Test that semantic edits invalidate verification; layout-only edits do not; stale, failed, or never-verified artifacts cannot download; and a matching verified fingerprint can download.

Security tests must reject unknown filenames, duplicate filenames, path traversal, oversized files/package, non-string content, renderer-supplied compiler path/flags, and requests over the rate limit.

- [ ] **Step 2: Verify RED**

```powershell
npx vitest run src/components/entropy/__tests__/opmCodeGenerationWorkspace.test.tsx src/engine/opm/__tests__/persistence.test.ts --reporter=verbose
node src/security/opmCodeVerifier.test.cjs
```

- [ ] **Step 3: Implement the allowlisted verifier**

`opmCodeVerifier.cjs` accepts only the exact OPM artifact names and bounded UTF-8 content, writes into a fresh temporary directory, invokes the bundled compiler using fixed flags and argument arrays, runs the conformance executable with a timeout, and returns structured evidence. It never accepts a path, executable, flag, or output destination from the renderer.

- [ ] **Step 4: Register secure IPC**

Add `opm-verify-generated-c` to `ALLOWED_INVOKE_CHANNELS`. Register one `ipcMain.handle` that applies role permission and rate limiting before calling the verifier.

- [ ] **Step 5: Implement the generation workspace**

Show validation diagnostics, artifact tabs, manifest, compiler output, parity result, and fingerprint. Disable Verify unless generation matches the current fingerprint. Disable Download/HIL handoff unless lifecycle state is `verified` with the same fingerprint.

- [ ] **Step 6: Persist safe metadata only**

Persist execution configuration and optional verification metadata `{ fingerprint, verifiedAt, toolchainVersion, status }`; regenerate artifact content after load. Never trust a persisted `verified` status without recomputing the current fingerprint.

- [ ] **Step 7: Run tests and commit**

```powershell
npx vitest run src/components/entropy/__tests__/opmCodeGenerationWorkspace.test.tsx src/engine/opm/__tests__/persistence.test.ts --reporter=verbose
node src/security/opmCodeVerifier.test.cjs
npx tsc --noEmit
git add src/components/entropy/OpmCodeGenerationWorkspace.tsx src/components/entropy/__tests__/opmCodeGenerationWorkspace.test.tsx src/security/opmCodeVerifier.cjs src/security/opmCodeVerifier.test.cjs src/main.cjs src/preload.cjs src/components/entropy/EntropyWorkspace.tsx src/engine/opm/persistence.ts src/engine/opm/__tests__/persistence.test.ts
git commit -m "feat(opm): gate export on verified generated artifacts"
```

---

### Task 9: Add Release Commands, Mutation Resistance, and Documentation

**Files:**
- Create: `src/engine/opm/__tests__/mutationResistance.test.ts`
- Modify: `package.json`
- Modify: `docs/guides/entropy_opm_embedded_c.md`

**Interfaces:**
- Produces: `test:opm`, `test:opm:codegen`, and `test:opm:release` commands.

- [ ] **Step 1: Add mutation-resistance tests**

Build explicit wrong-runtime variants for scheduler order, process-link causality, event consumption, lvalue identifier mapping, transition priority, exit/entry ordering, and omitted fingerprint fields. Each mutant must produce at least one differential mismatch:

```ts
expect(compareOpmSnapshots(reference, runMutant('reverse-priority'))).not.toEqual([]);
expect(compareOpmSnapshots(reference, runMutant('uncoupled-result-link'))).not.toEqual([]);
expect(fingerprintWithoutEvents).not.toBe(canonicalFingerprint);
```

- [ ] **Step 2: Add complete scripts**

```json
{
  "test:opm": "vitest run src/engine/opm src/components/entropy/__tests__ --reporter=verbose",
  "test:opm:codegen": "vitest run src/engine/opm/__tests__/hostCompilation.test.ts src/engine/opm/__tests__/goldenExecution.test.ts src/engine/opm/__tests__/mutationResistance.test.ts --reporter=verbose",
  "test:opm:release": "npm run test:opm && npm run test:opm:codegen && node src/security/opmCodeVerifier.test.cjs && tsc --noEmit"
}
```

Preserve existing scripts unchanged.

- [ ] **Step 3: Document the verified workflow**

Document modeling validation, canonical simulation, diagnostic navigation, compiler requirements, verification states, fingerprint invalidation, preview, export rules, and recovery from failed compilation/parity.

- [ ] **Step 4: Run the complete release gate**

```powershell
npm run test:opm:release
npm run build
```

Expected: zero failed/skipped OPM qualification tests, strict bundled-GCC execution succeeds, TypeScript passes, and the production build exits zero.

- [ ] **Step 5: Inspect the final diff for scope and generated artifacts**

```powershell
git status --short
git diff --check
git diff --stat HEAD~8..HEAD
```

Expected: no V-Lab, State Machine, or X-Bridges source changes; no compiler binaries, temporary workspaces, generated executables, or ZIP files are staged.

- [ ] **Step 6: Commit**

```powershell
git add package.json docs/guides/entropy_opm_embedded_c.md src/engine/opm/__tests__/mutationResistance.test.ts
git commit -m "test(opm): add verified release qualification gate"
```

---

## Final Review Checklist

- [ ] Run `npm run test:opm:release` from a clean process with the bundled compiler present.
- [ ] Run `npm run build`.
- [ ] Confirm the strict host compilation test contains no unconditional return or silent skip.
- [ ] Confirm the golden test executes C and compares every snapshot field.
- [ ] Confirm all generated assignment lvalues use resolved C identifiers.
- [ ] Confirm disabled elements cannot appear in eligible execution tables.
- [ ] Confirm result/effect links cannot execute without their source process.
- [ ] Confirm waiting is distinct from finished.
- [ ] Confirm all configured capacities and overflow policies have boundary tests.
- [ ] Confirm diagnostics navigate to nodes and edges and exact property paths.
- [ ] Confirm the HUD displays live runtime values rather than editor initial values.
- [ ] Confirm export is blocked for edited, generated-only, failed, or stale artifacts.
- [ ] Confirm conceptual OPM, OPL, import, and persistence regressions pass.
- [ ] Request independent code review using `superpowers:requesting-code-review`.
- [ ] Use `superpowers:verification-before-completion` before claiming readiness.
- [ ] Use `superpowers:finishing-a-development-branch` to choose merge, PR, retention, or cleanup.
