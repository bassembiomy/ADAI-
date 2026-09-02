# Entropy OPM Embedded C Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the existing Entropy OPM editor with backward-compatible executable metadata, one typed deterministic execution model, C99 embedded-code generation, strict host verification, and dedicated authoring/diagnostic UI.

**Architecture:** Keep React Flow data at the editor boundary and introduce a React-free compiler/runtime package in `src/engine/opm`. A thin adapter accepts persisted editor records and produces stable normalized tables; validation and the expression compiler produce the only model consumed by both the TypeScript runtime and C generator. Focused React components under `src/components/entropy/executable` edit metadata and present diagnostics, simulation traces, generated files, and export/HIL actions without translating OPM into the State Machine model.

**Tech Stack:** TypeScript 5.4, React 18, `@xyflow/react` 12, Vitest 4, JSZip 3, generated C99, Node host-compilation tests using the repository's generated-code temp-workspace utility.

## Global Constraints

- Preserve existing `entropyNodes`, `entropyEdges`, OPL parsing/generation, examples, SysML migration, and conceptual simulation behavior.
- Executable metadata is optional; old diagrams normalize to `executionEnabled: false` and remain valid.
- Supported values are exactly `bool`, `int32`, `uint32`, `float32`, and generated enumerations.
- Reject arbitrary C, pointers, recursion, dynamic memory, unbounded strings, and unbounded collections.
- `OPM_Step()` uses snapshot evaluation, staged writes, explicit priority, stable normalized order, conflict detection, then deterministic commit.
- `OPM_DispatchEvent()` writes to a generated-capacity FIFO; overflow behavior is a generated setting.
- Generated code is C99, fixed-width, statically allocated, warning-clean under `-std=c99 -Wall -Wextra -Werror -pedantic` (or the equivalent available compiler flags on Windows).
- Expression text is parsed into typed IR and is never interpolated directly into C.
- Errors block generation; warnings remain in editor output and `opm_manifest.json`.
- Run `npx vitest run src/components/entropy src/engine/opm` after every task that touches shared Entropy types.
- Run `npx tsc --noEmit -p tsconfig.json` before every commit. Passing Vitest with a failing typecheck is not acceptable.
- Treat persisted project JSON as untrusted input. Missing or malformed optional execution fields must produce source-linked diagnostics and must never throw.
- Apply executable link defaults only to `agent`, `instrument`, `consumption`, `result`, `effect`, `trigger`, and `condition`; structural and requirement-traceability links never receive executable payloads.
- Preserve the user's unrelated VLab working-tree edits. Do not reset, clean, stage, commit, reformat, or otherwise modify them.
- Do not weaken, skip, delete, or broaden an existing test to make a gate pass.
- Do not run `git add` or `git commit` when executing through Gemini/Antigravity. The reviewing orchestrator owns commits.

## Gemini/Antigravity Execution Contract

This plan is deliberately explicit for a fast implementation model with no conversation history. Execute exactly one numbered task per delegation. Before editing, read this header, that task in full, every interface it consumes, and the current versions of all listed files. Do not infer missing fields or rename an interface for convenience. If repository reality conflicts with the plan, stop and report the exact conflict instead of inventing a second architecture.

For every task, use this loop:

1. Record `git status --short` and distinguish pre-existing VLab/spec changes from task-owned changes.
2. Add the named failing behavior tests without changing existing assertions.
3. Run the exact focused command and capture the expected failure reason.
4. Implement only the task's production scope.
5. Run the focused tests, the shared Entropy suite when types changed, and TypeScript checking.
6. Inspect `git diff --check` and `git status --short`; leave all task work uncommitted.
7. Report changed files, test counts, typecheck result, deviations, and open decisions.

The orchestrator reviews test edits before trusting green output, reads the complete diff, reruns the gates independently, and either requests a delta correction or commits the task. A later task must not be started until the preceding task has passed this review gate.

Current baseline on branch `entropy-opm-embedded-c`: commit `68076f5` partially implemented Task 1 but fails `npx tsc --noEmit -p tsconfig.json`, applies executable metadata to every edge type, skips edges with absent `data`, and can throw on partial persisted payloads. Task 1 below repairs that baseline; it is not greenfield scaffolding. The untracked design specification and unrelated VLab modifications predate delegated execution and are out of scope.

## File Structure

```text
src/engine/opm/
  executableTypes.ts       persisted execution schema, normalized model, diagnostics, settings
  editorBoundaryTypes.ts   React-free structural input accepted from the editor adapter
  schemaAdapter.ts         defaults, migration, persisted editor records -> normalized model
  expressionLexer.ts       bounded tokenizer with source ranges
  expressionParser.ts      precedence parser and assignment-row expression AST
  expressionCompiler.ts    name resolution, type checking, constant folding, typed expression IR
  semanticValidator.ts     graph, scheduling, transition, conflict, reachability validation
  runtime.ts               canonical TypeScript step/event semantics
  cIr.ts                   embedded-C intermediate representation
  cGenerator.ts            deterministic artifact renderers and traceability manifest
  pipeline.ts              validate/compile/generate facade used by UI and tests
  fixtures.ts              representative appliance model shared by engine tests
  __tests__/               focused unit, compile, runtime, and parity tests
src/components/entropy/executable/
  AssignmentRowsEditor.tsx ordered typed assignments
  ObjectExecutionInspector.tsx
  StateExecutionInspector.tsx
  ProcessExecutionInspector.tsx
  LinkExecutionInspector.tsx
  ExecutionDiagnosticsPanel.tsx
  TransitionPreviewPanel.tsx
  ValueWatchPanel.tsx
  OpmCodegenPanel.tsx
  __tests__/               component interaction tests
src/components/entropy/
  EntropyTypes.ts           optional executable metadata on nodes/edges
  OpmSimulationEngine.ts    compatibility facade delegating executable models to engine/opm/runtime
  OPMNodeComponents.tsx     diagnostic badges
  OPMEdgeComponents.tsx     diagnostic badges and active-flow state
  EntropyWorkspace.tsx      inspector, simulation, navigation, codegen composition
src/App.tsx                 preserve executable data through existing project save/load path
src/HelpData.ts             executable OPM workflow help
```

## Canonical Persisted Contracts

Task 1 must define these names once in `src/engine/opm/executableTypes.ts`; later tasks extend behavior but do not rename or duplicate them:

```typescript
export type OpmScalarType =
  | { kind: 'bool' | 'int32' | 'uint32' | 'float32' }
  | { kind: 'enum'; enumId: string };

export interface OpmEnumMember { id: string; displayName: string; cIdentifier: string; value: number; }
export interface OpmEnumDefinition { id: string; displayName: string; cIdentifier: string; members: OpmEnumMember[]; }
export interface OpmEventDefinition { id: string; displayName: string; cIdentifier: string; }
export interface OpmHardwareMapping { direction: 'input' | 'output'; symbol: string; }

export interface OpmAttribute {
  id: string;
  displayName: string;
  cIdentifier: string;
  type: OpmScalarType;
  initialValue: boolean | number | string;
  minimum?: number;
  maximum?: number;
  overflow: 'diagnostic' | 'wrap' | 'saturate';
  access: 'readOnly' | 'readWrite';
  persistent: boolean;
  hardwareMapping?: OpmHardwareMapping;
}

export interface OpmAssignment {
  id: string;
  targetAttributeId: string;
  operator: '=' | '+=' | '-=' | '*=' | '/=';
  expression: string;
  enabled: boolean;
}

export interface OpmObjectExecution { enabled: boolean; attributes: OpmAttribute[]; }
export interface OpmStateExecution {
  enabled: boolean;
  initial: boolean;
  terminal: boolean;
  entryAssignments: OpmAssignment[];
  exitAssignments: OpmAssignment[];
  timeoutMs?: number;
  timeoutEventId?: string;
}
export interface OpmProcessExecution {
  enabled: boolean;
  activation: 'cyclic' | 'triggered' | 'both';
  inputAttributeIds: string[];
  outputAttributeIds: string[];
  guard: string;
  assignments: OpmAssignment[];
  priority: number;
  periodMs?: number;
  debounceMs: number;
  reentrancy: 'reject';
}
export interface OpmTransitionRequest {
  ownerObjectId: string;
  sourceStateId?: string;
  targetStateId: string;
}
export interface OpmLinkExecution {
  enabled: boolean;
  guard: string;
  eventId?: string;
  assignments: OpmAssignment[];
  transition?: OpmTransitionRequest;
  priority: number;
  delayMs: number;
}
export interface OpmExecutionConfig {
  version: 1;
  events: OpmEventDefinition[];
  enums: OpmEnumDefinition[];
  settings: OpmTargetSettings;
}
```

Use stable IDs for references; display names and C identifiers are never references. Missing execution payloads mean conceptual-only. The default config contains empty event/enum tables and `DEFAULT_OPM_TARGET_SETTINGS`. Persist `entropyExecutionConfig` beside `entropyNodes` and `entropyEdges` in both `entropy.json` and unified project data; this is an additive field, not a second project file.

## Canonical Compiler and Runtime Contracts

Task 2 defines the normalized records below. They contain no React Flow fields such as position, selection, handles, width, or style.

```typescript
export interface OpmSourceRef { elementId: string; propertyPath: string; start?: number; end?: number; }
export interface OpmDiagnostic {
  code: string;
  severity: 'error' | 'warning';
  message: string;
  source: OpmSourceRef;
}
export interface OpmSymbol {
  id: string;
  kind: 'object' | 'state' | 'process' | 'attribute' | 'event' | 'enum' | 'enumMember' | 'link';
  displayName: string;
  cIdentifier: string;
  source: OpmSourceRef;
}
export interface OpmCompilationInput {
  executionEnabled: boolean;
  settings: OpmTargetSettings;
  objects: readonly NormalizedOpmObject[];
  states: readonly NormalizedOpmState[];
  processes: readonly NormalizedOpmProcess[];
  links: readonly NormalizedOpmLink[];
  events: readonly OpmEventDefinition[];
  enums: readonly OpmEnumDefinition[];
  symbols: Readonly<Record<string, OpmSymbol>>;
  sourceByNormalizedId: Readonly<Record<string, OpmSourceRef>>;
}
export interface NormalizeOpmResult { input?: OpmCompilationInput; diagnostics: OpmDiagnostic[]; }
```

`NormalizedOpmObject`, `NormalizedOpmState`, `NormalizedOpmProcess`, and `NormalizedOpmLink` contain their stable `id`, resolved owner/endpoints, normalized execution payload, stable `order`, and source reference. Arrays are sorted by persisted ID using ordinal comparison; `order` is the resulting zero-based index. Freeze normalized records in development/tests so runtime code cannot mutate compiler input.

Task 3 defines expression results without sentinel constants:

```typescript
export type OpmExpectedType =
  | { kind: 'exact'; type: OpmScalarType }
  | { kind: 'boolean' }
  | { kind: 'numeric' }
  | { kind: 'anyScalar' };
export interface OpmExpressionScope { symbols: Readonly<Record<string, OpmValueSymbol>>; }
export interface ExpressionCompileResult { ir?: TypedExpressionIr; diagnostics: OpmDiagnostic[]; }
export function compileOpmExpression(
  text: string,
  expected: OpmExpectedType,
  scope: OpmExpressionScope,
  source: OpmSourceRef,
): ExpressionCompileResult;
```

Task 4 produces an immutable `ExecutableOpmModel`. Raw expression strings may remain only as source metadata for diagnostics; runtime and generator behavior must consume typed IR fields exclusively.

Task 5 exposes mutation only through an opaque runtime instance:

```typescript
export interface OpmRuntime { readonly modelFingerprint: string; }
export function createOpmRuntime(model: ExecutableOpmModel): OpmRuntime;
export function dispatchOpmEvent(runtime: OpmRuntime, eventId: string): 'accepted' | 'overflow' | 'unknownEvent';
export function stepOpmRuntime(runtime: OpmRuntime, deltaMs: number): OpmStepResult;
export function resetOpmRuntime(runtime: OpmRuntime): void;
```

`OpmStepResult` is a read-only snapshot containing values by attribute ID, active states by object ID, consumed event IDs, fired and blocked process IDs, traversed link IDs, staged and committed writes, transitions, diagnostics, and ordered trace records. The UI may display this result but must not feed edited result data back into the runtime.

---

### Task 1: Repair and Complete the Backward-Compatible Schema

**Files:**
- Modify: `src/engine/opm/executableTypes.ts`
- Create: `src/engine/opm/editorBoundaryTypes.ts`
- Modify: `src/engine/opm/schemaAdapter.ts`
- Modify: `src/engine/opm/__tests__/schemaAdapter.test.ts`
- Modify: `src/components/entropy/EntropyTypes.ts`
- Modify: `src/components/entropy/EntropyWorkspace.tsx` (accept controlled execution config and config-change callback)
- Modify: `src/App.tsx:6797`, `src/App.tsx:6995`, `src/App.tsx:7804`, `src/App.tsx:7939`, `src/App.tsx:16001`

**Interfaces:**
- Consumes: the canonical persisted contracts above and the existing `OPMNodeData`, `OPMEdgeData`, `AppNode`, and `AppEdge` editor types.
- Produces: `OpmScalarType`, enum/event definitions, execution payloads, `OpmExecutionConfig`, `OpmTargetSettings`, `OpmDiagnostic`, and a preliminary `AdaptedOpmDiagram`.
- Produces: `createDefaultOpmExecutionConfig()`, `withExecutableDefaults(nodes, edges)`, `withElementExecutableDefaults(nodes, edges, elementId)`, and `adaptOpmDiagram(nodes, edges, config)`.
- `editorBoundaryTypes.ts` defines structural `OpmEditorNode` and `OpmEditorEdge` shapes without importing React or `@xyflow/react`; `AppNode` and `AppEdge` must be structurally assignable to them.

- [ ] **Step 1: Preserve the current failure evidence**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected before repair: FAIL with `TS2532` at existing `schemaAdapter.test.ts` accesses to optional edge data. Do not silence this using `as`, `any`, or non-null assertions; make assertions optional-data-safe.

- [ ] **Step 2: Replace the partial schema with the canonical persisted contracts**

Implement the complete interfaces from `Canonical Persisted Contracts`. Keep all execution fields optional on editor node/edge data. Add `entropyExecutionConfig?: OpmExecutionConfig` to the project persistence shape. Default factories must return fresh arrays and objects; never export a mutable singleton that consumers can mutate.

- [ ] **Step 3: Write failing migration, edge classification, malformed-data, and serialization tests**

```typescript
it('keeps a legacy conceptual diagram valid and disabled', () => {
  const result = adaptOpmDiagram(legacyNodes, legacyEdges, createDefaultOpmExecutionConfig());
  expect(result.model.executionEnabled).toBe(false);
  expect(result.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
});

it('round-trips executable metadata without changing OPL fields', () => {
  const upgraded = withExecutableDefaults(legacyNodes, legacyEdges);
  upgraded.nodes[0].data.objectExecution!.attributes.push({
    id: 'temperature', displayName: 'Temperature', cIdentifier: 'temperature',
    type: { kind: 'float32' }, initialValue: 20, overflow: 'diagnostic',
    access: 'readWrite', persistent: false,
  });
  expect(JSON.parse(JSON.stringify(upgraded)).nodes[0].data.objectExecution?.attributes[0].id)
    .toBe('temperature');
  expect(upgraded.nodes[0].data.name).toBe(legacyNodes[0].data.name);
});

it.each(['aggregation', 'generalization', 'exhibition', 'satisfies', 'verifies'] as const)(
  'does not attach execution metadata to %s links', linkType => {
    const edge = makeEdge({ type: linkType });
    const upgraded = withExecutableDefaults([], [edge]);
    expect(upgraded.edges[0].data?.linkExecution).toBeUndefined();
  },
);

it('creates data and execution defaults for a procedural edge with no data', () => {
  const edge = makeEdge({ type: 'trigger', data: undefined });
  const upgraded = withExecutableDefaults([], [edge]);
  expect(upgraded.edges[0].data?.linkExecution?.enabled).toBe(true);
});

it('returns a diagnostic instead of throwing for a partial persisted payload', () => {
  const node = makeObject({ objectExecution: { enabled: true } as unknown as OpmObjectExecution });
  expect(() => adaptOpmDiagram([node], [], createDefaultOpmExecutionConfig())).not.toThrow();
  expect(adaptOpmDiagram([node], [], createDefaultOpmExecutionConfig()).diagnostics)
    .toContainEqual(expect.objectContaining({ code: 'OPM_SCHEMA_REQUIRED_FIELD' }));
});
```

- [ ] **Step 4: Run the focused tests and confirm behavioral failures**

Run: `npx vitest run src/engine/opm/__tests__/schemaAdapter.test.ts`
Expected: FAIL because the current helper marks structural links executable, skips edges without data, and assumes required nested fields exist.

- [ ] **Step 5: Implement safe defaults and schema adaptation**

Use an explicit procedural-link predicate:

```typescript
const PROCEDURAL_LINK_TYPES = new Set([
  'agent', 'instrument', 'consumption', 'result',
  'effect', 'trigger', 'condition',
]);

function isProceduralLink(edge: OpmEditorEdge): boolean {
  const type = edge.data?.type ?? edge.type;
  return typeof type === 'string' && PROCEDURAL_LINK_TYPES.has(type);
}
```

Clone inputs without mutating them. For a procedural edge with no `data`, create `{ type: resolvedType, linkExecution: defaultLinkExecution() }`. Never attach new executable payloads to structural/traceability links; if imported input already contains one, preserve it in the cloned persistence view so round trips do not destroy user data, exclude it from executable output, and return `OPM_EXECUTION_ON_NON_PROCEDURAL_LINK`. Validate arrays and scalar discriminants with type guards before iterating. Emit `OPM_SCHEMA_REQUIRED_FIELD`, `OPM_SCHEMA_INVALID_TYPE`, or `OPM_SCHEMA_INVALID_VALUE` with the exact element and property path. Do not throw for JSON-shaped input.

`withExecutableDefaults` upgrades every eligible element for the one-time whole-diagram enable command. `withElementExecutableDefaults` upgrades only the matching object/state/process/procedural edge and leaves every other element byte-for-byte unchanged; inspectors must use the element-scoped helper.

- [ ] **Step 6: Preserve nodes, edges, and execution config through project save/load**

Keep `entropyNodes` and `entropyEdges` as persistence keys and add `entropyExecutionConfig` to the same JSON object. Replace their `any[]` state annotations with `AppNode[]` and `AppEdge[]`; do not add a second project file or strip unknown node/edge data. Load missing config through `createDefaultOpmExecutionConfig()` without writing execution metadata into legacy nodes/edges. Add regression assertions for standalone `entropy.json` and unified project JSON round trips, unknown field preservation, and legacy files with no config.

- [ ] **Step 7: Run the complete Task 1 gate and leave changes for review**

Run: `npx vitest run src/engine/opm/__tests__/schemaAdapter.test.ts src/components/entropy --reporter=verbose`
Expected: PASS with the new state-node, structural-link, no-edge-data, malformed-payload, and round-trip cases listed separately.

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: PASS with no `TS2532` errors.

Run: `git diff --check`
Expected: no output.

Reviewer commit after approval: `fix(opm): complete executable schema and migration`

---

### Task 2: Deterministic Normalization and Source-Linked Diagnostics

**Files:**
- Modify: `src/engine/opm/schemaAdapter.ts`
- Create: `src/engine/opm/__tests__/normalization.test.ts`
- Create: `src/engine/opm/fixtures.ts`

**Interfaces:**
- Consumes: `OpmEditorNode[]`, `OpmEditorEdge[]`, and `OpmExecutionConfig` from Task 1.
- Produces: `normalizeOpmModel(nodes, edges, config): NormalizeOpmResult`.
- `OpmCompilationInput` contains sorted `objects`, `states`, `processes`, `links`, `events`, `enums`, `symbols`, and `sourceByNormalizedId` tables.

- [ ] **Step 1: Write failing normalization tests**

```typescript
it('normalizes independently of React Flow array order', () => {
  const a = normalizeOpmModel(applianceNodes, applianceEdges, settings);
  const b = normalizeOpmModel([...applianceNodes].reverse(), [...applianceEdges].reverse(), settings);
  expect(b).toEqual(a);
});

it('sanitizes symbols and reports collisions at both sources', () => {
  const result = normalizeOpmModel(nodesWithNames('fan-speed', 'fan speed'), [], settings);
  expect(result.diagnostics.map(d => d.code)).toContain('OPM_SYMBOL_COLLISION');
  expect(result.diagnostics.filter(d => d.code === 'OPM_SYMBOL_COLLISION')).toHaveLength(2);
});
```

- [ ] **Step 2: Run and observe deterministic-order failures**

Run: `npx vitest run src/engine/opm/__tests__/normalization.test.ts`
Expected: FAIL until stable sorting, reference resolution, and symbol registration exist.

- [ ] **Step 3: Implement normalization rules**

Resolve state ownership from top-level `node.parentId` first and `node.data.parentId` second; diagnose disagreement rather than guessing. Verify all endpoints, sanitize identifiers with `[^A-Za-z0-9_] -> _`, prefix identifiers beginning with digits, reserve C99 keywords and all `OPM_` public names, then collision-check case-sensitively. Use ordinal code-unit sorting (`left.id < right.id ? -1 : left.id > right.id ? 1 : 0`) rather than locale-sensitive ordering. Sort every table by stable persisted ID, using source array index only to diagnose duplicate IDs. Emit source paths such as `processExecution.guard`, `linkExecution.assignments[2].expression`, and `stateExecution.timeoutMs`.

- [ ] **Step 4: Add graph/default coverage**

Tests must assert missing endpoints, duplicate IDs, orphan states, invalid ownership, executable metadata on structural links, generated enum member collisions, and unchanged display labels.

- [ ] **Step 5: Verify and commit**

Run: `npx vitest run src/engine/opm/__tests__/normalization.test.ts`
Expected: PASS.

Commit: `feat(opm): normalize executable diagrams deterministically`

---

### Task 3: Restricted Expression Parser and Typed IR

**Files:**
- Create: `src/engine/opm/expressionLexer.ts`
- Create: `src/engine/opm/expressionParser.ts`
- Create: `src/engine/opm/expressionCompiler.ts`
- Create: `src/engine/opm/__tests__/expressions.test.ts`

**Interfaces:**
- Produces: `parseOpmExpression(text): ParseResult<ExpressionAst>`.
- Produces: `compileOpmExpression(text, expectedType, scope, source): ExpressionCompileResult`.
- Intrinsics in release one: `abs`, `min`, `max`, and `clamp`; all operands and results are statically typed.

- [ ] **Step 1: Write parser/type failures first**

```typescript
it.each([
  ['1 + 2 * 3', 'add'], ['(1 + 2) * 3', 'multiply'],
  ['temperature.value < target.value && fan.enabled', 'and'],
])('parses %s with typed precedence', (text, rootOp) => {
  expect(compileOpmExpression(text, { kind: 'anyScalar' }, scope, source).ir?.op).toBe(rootOp);
});

it.each([
  ['missing + 1', 'OPM_EXPR_UNKNOWN_REFERENCE'],
  ['fan.enabled + 1', 'OPM_EXPR_TYPE_MISMATCH'],
  ['system("erase")', 'OPM_EXPR_UNKNOWN_INTRINSIC'],
  ['2147483648', 'OPM_EXPR_INTEGER_OVERFLOW'],
])('rejects %s', (text, code) => {
  expect(compileOpmExpression(text, { kind: 'anyScalar' }, scope, source).diagnostics[0].code).toBe(code);
});
```

- [ ] **Step 2: Run and confirm missing modules**

Run: `npx vitest run src/engine/opm/__tests__/expressions.test.ts`
Expected: FAIL because the expression modules do not exist.

- [ ] **Step 3: Implement the bounded grammar**

Tokenize booleans, decimal/hex integers, finite decimal floats, identifiers joined by `.`, parentheses, commas, unary `! - +`, arithmetic, comparisons, `&&`, and `||`. Use recursive descent precedence `or -> and -> equality -> comparison -> additive -> multiplicative -> unary -> primary`. Every token and AST node carries `[start,end)`. Reject semicolons, braces, brackets, casts, address operators, increment/decrement, comments, and tokens longer than 128 characters.

- [ ] **Step 4: Implement type resolution and constant folding**

Resolve references only from the supplied normalized scope. Permit numeric promotion only when lossless under the declared target; comparisons return `bool`; enum equality requires the same enum; division by a folded zero is an error. Represent typed IR as literal, reference, unary, binary, and intrinsic variants—never as raw C text. Add tests for each operator, all scalar types, enum members, invalid casts, read-only assignment targets, source ranges, NaN/Infinity rejection, and intrinsic arity.

- [ ] **Step 5: Verify and commit**

Run: `npx vitest run src/engine/opm/__tests__/expressions.test.ts`
Expected: PASS.

Commit: `feat(opm): compile restricted expressions to typed IR`

---

### Task 4: Semantic Validation and Executable Compilation Pipeline

**Files:**
- Create: `src/engine/opm/semanticValidator.ts`
- Create: `src/engine/opm/pipeline.ts`
- Create: `src/engine/opm/__tests__/semanticValidator.test.ts`
- Create: `src/engine/opm/__tests__/pipeline.test.ts`

**Interfaces:**
- Produces: `validateExecutableOpm(input): OpmDiagnostic[]`.
- Produces: `compileExecutableOpm(nodes, edges, config): { model?: ExecutableOpmModel; diagnostics: OpmDiagnostic[] }`.
- Generation is allowed only when `model` exists and no diagnostic has severity `error`.

- [ ] **Step 1: Write blocking semantic cases**

```typescript
it.each([
  ['two initial states', twoInitialStates(), 'OPM_STATE_MULTIPLE_INITIAL'],
  ['no initial state', noInitialState(), 'OPM_STATE_INITIAL_REQUIRED'],
  ['cross-owner transition', crossOwnerTransition(), 'OPM_TRANSITION_OWNER_MISMATCH'],
  ['equal-priority write conflict', equalPriorityWrites(), 'OPM_WRITE_CONFLICT'],
  ['unreachable target', unreachableState(), 'OPM_STATE_UNREACHABLE'],
])('blocks %s', (_name, fixture, code) => {
  const result = compileExecutableOpm(fixture.nodes, fixture.edges, fixture.config);
  expect(result.model).toBeUndefined();
  expect(result.diagnostics.map(d => d.code)).toContain(code);
});
```

- [ ] **Step 2: Run and confirm failures**

Run: `npx vitest run src/engine/opm/__tests__/semanticValidator.test.ts src/engine/opm/__tests__/pipeline.test.ts`
Expected: FAIL because semantic validation and the facade are absent.

- [ ] **Step 3: Compile all executable behavior**

Compile guards, process action rows, state entry/exit rows, link assignments, timer expressions, event bindings, and transition requests into immutable typed IR. Validate activation mode, positive periods, debounce, non-reentrant release-one policy, writable targets, endpoint/link compatibility, one initial state per executable stateful object, reachable states/processes, queue and staging capacities, unique priorities where writes overlap, and finite delays. Structural links remain metadata and cannot carry executable actions.

- [ ] **Step 4: Define severity policy**

Errors: malformed schema, missing references, expression/type failures, capacity below statically-required minimum, ambiguous writes/transitions, invalid ownership, and unsupported features. Warnings: conceptual-only elements, unreachable non-terminal elements, unused values/events, generated-name rewrites, and target-specific MISRA deviations. Sort diagnostics by source element ID, property path, start offset, then code.

- [ ] **Step 5: Verify and commit**

Run: `npx vitest run src/engine/opm/__tests__/semanticValidator.test.ts src/engine/opm/__tests__/pipeline.test.ts`
Expected: PASS.

Commit: `feat(opm): validate and compile executable OPM models`

---

### Task 5: Canonical TypeScript Runtime and Existing Simulator Compatibility

**Files:**
- Create: `src/engine/opm/runtime.ts`
- Create: `src/engine/opm/__tests__/runtime.test.ts`
- Modify: `src/components/entropy/OpmSimulationEngine.ts`
- Modify: `src/components/entropy/__tests__/opmSimulationEngine.test.ts`

**Interfaces:**
- Produces: `createOpmRuntime(model)`, `dispatchOpmEvent(runtime, eventId)`, `stepOpmRuntime(runtime, deltaMs)`, and `resetOpmRuntime(runtime)` with the signatures in `Canonical Compiler and Runtime Contracts`.
- `OpmStepResult` exposes committed values/states, staged writes, fired/blocked processes, traversed links, transitions, diagnostics, and ordered trace records.

- [ ] **Step 1: Write phase-order and conflict tests**

```typescript
it('uses one committed snapshot and commits only after all eligible processes evaluate', () => {
  const runtime = createOpmRuntime(snapshotFixture.model);
  const first = stepOpmRuntime(runtime, 10);
  expect(first.trace.map(t => t.phase)).toEqual([
    'sampleInputs', 'advanceTimers', 'activate', 'evaluate', 'stage',
    'resolveConflicts', 'commit', 'stateActions', 'publishOutputs',
  ]);
  expect(first.values.counter).toBe(1);
});

it('queues events until the next step and applies rejectNewest overflow', () => {
  const runtime = createOpmRuntime(queueFixture.model);
  expect(dispatchOpmEvent(runtime, 'door_open')).toBe('accepted');
  expect(dispatchOpmEvent(runtime, 'door_close')).toBe('overflow');
  expect(stepOpmRuntime(runtime, 10).firedProcessIds).toEqual(['open_door']);
});
```

- [ ] **Step 2: Run and confirm the runtime is absent**

Run: `npx vitest run src/engine/opm/__tests__/runtime.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the ten deterministic phases**

Use generated-capacity arrays and indices rather than unbounded queues during stepping. Saturate timers at `UINT32_MAX`; activate cyclic, condition, and queued-event processes; sort by descending explicit priority then normalized order; evaluate against a frozen snapshot; stage assignments/transitions; reject equal-priority conflicts; commit winners; execute exits before entries in normalized state order; publish mapped outputs last. Higher numeric priority wins. Delayed transitions become bounded timer records and non-reentrant processes cannot activate twice in one step.

- [ ] **Step 4: Preserve conceptual simulation**

Keep the existing exported facade. When no executable metadata is enabled, retain current ISO-link state simulation and its existing test results. When execution is enabled and compilation succeeds, adapt `OpmStepResult` into `OpmSimTickResult`; compilation errors return simulator error logs without modifying states.

- [ ] **Step 5: Verify and commit**

Run: `npx vitest run src/engine/opm/__tests__/runtime.test.ts src/components/entropy/__tests__/opmSimulationEngine.test.ts`
Expected: PASS.

Commit: `feat(opm): add deterministic executable runtime`

---

### Task 6: Embedded-C IR, Artifacts, Manifest, and Strict Host Verification

**Files:**
- Create: `src/engine/opm/cIr.ts`
- Create: `src/engine/opm/cGenerator.ts`
- Create: `src/engine/opm/__tests__/cGenerator.test.ts`
- Create: `src/engine/opm/__tests__/hostCompilation.test.ts`
- Reuse: `src/utils/generatedCodeTestWorkspace.ts`

**Interfaces:**
- Produces: `lowerOpmToC(model): OpmCProgram`.
- Produces: `generateOpmCArtifacts(model): { files: GeneratedOpmFile[]; manifest: OpmManifest }`; settings come only from the compiled model so callers cannot generate with settings different from those validated.
- `GeneratedOpmFile` is `{ name: string; content: string }`.

- [ ] **Step 1: Write artifact and safety tests**

```typescript
it('generates the complete deterministic package', () => {
  const result = generateOpmCArtifacts(applianceModel);
  expect(result.files.map(f => f.name)).toEqual([
    'opm_types.h', 'opm_config.h', 'opm_model.h', 'opm_model.c',
    'opm_runtime.h', 'opm_runtime.c', 'opm_io.h', 'opm_io.c',
    'opm_trace.h', 'opm_trace.c', 'main_example.c', 'opm_manifest.json',
  ]);
  expect(result.files.map(f => f.content).join('\n')).not.toMatch(/\b(malloc|calloc|realloc|free)\s*\(/);
});

it('emits the public instance API exactly once', () => {
  const header = file('opm_runtime.h');
  expect(header).toContain('void OPM_Init(OPM_Instance_t *instance);');
  expect(header).toContain('OPM_Status_t OPM_Step(OPM_Instance_t *instance, uint32_t delta_ms);');
  expect(header).toContain('OPM_Status_t OPM_DispatchEvent(OPM_Instance_t *instance, OPM_EventId_t event_id);');
});
```

- [ ] **Step 2: Run and confirm generator absence**

Run: `npx vitest run src/engine/opm/__tests__/cGenerator.test.ts`
Expected: FAIL.

- [ ] **Step 3: Lower typed IR and render C99**

Map values to `bool`, `int32_t`, `uint32_t`, `float`, or generated enum types. Render expressions only from typed IR with explicit parentheses and checked/saturating helpers selected from target settings. Generate fixed arrays for values, states, FIFO events, timers, staged writes, transitions, diagnostics, and trace records. Emit guards/actions as `static` functions, an instance-based public API, weak/default I/O hooks, optional trace functions, and no function pointers, VLAs, heap calls, recursion, or compiler extensions.

- [ ] **Step 4: Generate deterministic traceability metadata**

Create a canonical JSON manifest with generator version, SHA-256 model fingerprint, settings, ordered symbol map, diagnostic list, requirements, and source-element-to-file/function mapping. Test that reversed React Flow inputs produce byte-identical files and that every executable source ID occurs in the manifest and a generated trace comment.

- [ ] **Step 5: Strictly compile and execute a smoke harness**

Using `createGeneratedCodeTestWorkspace('opm')`, write all files, discover `cc`, `gcc`, or `clang`, compile all `.c` files with strict C99 warnings as errors, run the executable, and assert its printed value/state trace. If no compiler is installed, mark only the compilation suite skipped with the discovery reason; generator tests must still run.

- [ ] **Step 6: Verify and commit**

Run: `npx vitest run src/engine/opm/__tests__/cGenerator.test.ts src/engine/opm/__tests__/hostCompilation.test.ts`
Expected: PASS, or host compilation explicitly SKIP only when no supported compiler exists.

Commit: `feat(opm): generate and verify static C99 packages`

---

### Task 7: Differential Runtime Qualification

**Files:**
- Create: `src/engine/opm/__tests__/runtimeParity.test.ts`
- Modify: `src/engine/opm/fixtures.ts`

**Interfaces:**
- Consumes: `stepOpmRuntime`, `generateOpmCArtifacts`.
- Produces: a canonical JSON-lines trace format used by TypeScript and the compiled host harness.

- [ ] **Step 1: Add the appliance-controller end-to-end fixture**

The fixture must include bool/int32/uint32/float32/enum values, input/output mappings, cyclic and event activation, condition and trigger links, entry/exit actions, a delayed transition, debounce, priority resolution, queue overflow, a terminal state, and at least one warning that does not block generation.

- [ ] **Step 2: Write parity assertions**

Dispatch the same timed event vector to both runtimes for 100 steps. Compare after every step: value bit patterns (float via serialized IEEE-754 bytes), active state IDs, consumed event IDs, fired process IDs, committed write source IDs, transitions, and runtime diagnostic codes. Seed ordering from stable IDs; do not compare timestamps or generated filesystem paths.

- [ ] **Step 3: Run the differential test and fix only semantic mismatches**

Run: `npx vitest run src/engine/opm/__tests__/runtimeParity.test.ts --reporter=verbose`
Expected: PASS with 100 matching steps.

- [ ] **Step 4: Run the engine suite and commit**

Run: `npx vitest run src/engine/opm`
Expected: PASS (compiler-dependent test may be explicitly skipped as described in Task 6).

Commit: `test(opm): qualify TypeScript and generated C parity`

---

### Task 8: Dedicated Executable Inspectors and Assignment Rows

**Files:**
- Create: `src/components/entropy/executable/AssignmentRowsEditor.tsx`
- Create: `src/components/entropy/executable/ObjectExecutionInspector.tsx`
- Create: `src/components/entropy/executable/StateExecutionInspector.tsx`
- Create: `src/components/entropy/executable/ProcessExecutionInspector.tsx`
- Create: `src/components/entropy/executable/LinkExecutionInspector.tsx`
- Create: `src/components/entropy/executable/__tests__/inspectors.test.tsx`
- Modify: `src/components/entropy/EntropyWorkspace.tsx:205`, `src/components/entropy/EntropyWorkspace.tsx:1266`

**Interfaces:**
- Every inspector receives typed execution data, valid normalized references, diagnostics, and `onChange(next)`.
- `AssignmentRowsEditor` receives `rows`, `targets`, `scope`, and `onChange`; it never accepts raw C.

- [ ] **Step 1: Write interaction tests**

Test enable/disable execution, adding/reordering/removing attributes and assignments, type-aware initial values, min/max and access, I/O mapping, initial/terminal state selection, entry/exit rows, timeout event, process activation/guard/period/debounce/priority/reentrancy, link guard/event/transition/delay, and filtering invalid targets from selectors. Assert that expression diagnostics use `aria-invalid` and visible inline text.

- [ ] **Step 2: Run and confirm components are absent**

Run: `npx vitest run src/components/entropy/executable/__tests__/inspectors.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement controlled, type-specific editors**

Use stable row IDs and immutable updates. Numeric inputs must reject non-finite values; enum initial values use a member selector; bool uses a checkbox; identifiers show sanitized previews but preserve display names. Assignment rows render `Target | Operator | Typed value or expression` and support add, move up/down, enable, and remove. Completion lists only names from the compiled scope.

- [ ] **Step 4: Compose inspectors in the workspace**

Track `selectedEdge` alongside `selectedNode`, clear one when selecting the other, and render exactly one inspector based on node/edge kind. The per-inspector enable action calls `withElementExecutableDefaults(nodes, edges, selectedElementId)` and saves through the existing controlled workspace update path; the whole-diagram setup command alone may call `withExecutableDefaults`. Keep conceptual name, states, attributes, ports, zoom, and delete controls operational.

- [ ] **Step 5: Verify and commit**

Run: `npx vitest run src/components/entropy/executable/__tests__/inspectors.test.tsx src/components/entropy`
Expected: PASS.

Commit: `feat(opm): add executable behavior inspectors`

---

### Task 9: Diagnostics Navigation, Simulation Feedback, and Value Watch

**Files:**
- Create: `src/components/entropy/executable/ExecutionDiagnosticsPanel.tsx`
- Create: `src/components/entropy/executable/TransitionPreviewPanel.tsx`
- Create: `src/components/entropy/executable/ValueWatchPanel.tsx`
- Create: `src/components/entropy/executable/__tests__/executionFeedback.test.tsx`
- Modify: `src/components/entropy/OPMNodeComponents.tsx`
- Modify: `src/components/entropy/OPMEdgeComponents.tsx`
- Modify: `src/components/entropy/EntropyWorkspace.tsx:824`, `src/components/entropy/EntropyWorkspace.tsx:1586`

**Interfaces:**
- `focusDiagnostic(diagnostic)` selects its element, opens its inspector section, and focuses the control matching `propertyPath`.
- Preview rows contain trigger, guard result, reads, staged writes, exited/entered states, and higher-priority competitor.

- [ ] **Step 1: Write feedback/navigation tests**

Assert error borders and text, node/edge error badges, diagnostic click-to-focus, active process/link/state classes, previous/current/pending values, transition competitor text, and preservation of the current conceptual simulator view when execution is disabled.

- [ ] **Step 2: Implement diagnostic indexing**

Memoize compilation from nodes/edges/settings, group diagnostics by element ID, decorate render data with error/warning counts, and expose `data-property-path` on every executable control. Diagnostic selection calls React Flow `setCenter`, selects the node or edge, selects the corresponding inspector section, then focuses the exact path after render.

- [ ] **Step 3: Connect canonical step results to UI**

Replace executable-mode calls to the legacy tick logic with `stepOpmRuntime`. Apply only committed state/value changes to the display; use staged writes solely in the preview/watch panels. Animate `firedProcessIds`, `traversedLinkIds`, and committed transitions for one tick. Reset reconstructs runtime state from the currently compiled model.

- [ ] **Step 4: Verify and commit**

Run: `npx vitest run src/components/entropy/executable/__tests__/executionFeedback.test.tsx src/components/entropy src/engine/opm`
Expected: PASS.

Commit: `feat(opm): surface executable diagnostics and traces`

---

### Task 10: Code-Generation Workspace, Archive Export, and HIL Contract

**Files:**
- Create: `src/components/entropy/executable/OpmCodegenPanel.tsx`
- Create: `src/components/entropy/executable/__tests__/OpmCodegenPanel.test.tsx`
- Modify: `src/components/entropy/EntropyWorkspace.tsx:214`, `src/components/entropy/EntropyWorkspace.tsx:1586`
- Create: `src/utils/opmGeneratedCodeVerifier.cjs`
- Create: `src/utils/opmGeneratedCodeVerifier.test.cjs`
- Modify: `src/main.cjs` (register one narrow `opm-verify-generated-c` IPC handler)
- Modify: `src/preload.cjs` only if the existing allowlist blocks the new invoke channel
- Modify: `src/engine/hil/hilTypes.ts`
- Modify: `src/components/hil/HILWorkspace.tsx`

**Interfaces:**
- `OpmCodegenPanel` receives nodes, edges, `OpmExecutionConfig`, `onConfigChange(next)`, and `onHilHandoff(package)`.
- Add `OpmHilPackage` containing generated files, manifest, I/O symbols, fingerprint, and verification status; it carries artifacts only and never State Machine IR.
- `verifyOpmGeneratedCode(payload)` accepts generated filenames/content plus the manifest fingerprint, writes only to a fresh generated-code temporary directory, invokes the discovered host compiler with the Task 6 strict flags, runs the harness with a bounded timeout, and returns `{ ok, compiler, stdout, stderr, exitCode }` without accepting caller-supplied paths or commands.

- [ ] **Step 1: Write workflow tests**

Assert validation before generation, disabled generation/download on errors, editable tick/capacity/numeric policies, deterministic file preview, warnings retained, ZIP names/content, manifest preview, host-verification status, and HIL handoff containing the generated I/O contract and model fingerprint.

- [ ] **Step 2: Implement panel states**

Use explicit `edit`, `validated`, `generated`, `verified`, and `failed` states. Any diagram/settings change invalidates artifacts and verification. Generate via `compileExecutableOpm` then `generateOpmCArtifacts`. ZIP with the existing `jszip` dependency as `entropy_opm_<fingerprint-prefix>.zip`. Do not claim host verification in the browser unless the narrow Electron IPC returns a successful result; otherwise label it “Not run”. The IPC validates an allowlist of the 12 generated filenames, rejects path separators, shell metacharacters, unknown fields, oversized content, and fingerprint mismatch, and never passes renderer strings to a shell.

- [ ] **Step 3: Add the HIL boundary**

Handoff only after successful generation. Populate available HIL signals from manifest I/O entries and keep existing HIL configuration unchanged until the user accepts the import. Reject packages whose fingerprint differs from the previewed artifact set.

- [ ] **Step 4: Mount the workspace tab**

Extend `rightTab` with `'executable' | 'codegen'`; add inspector/diagnostics and codegen tabs next to Sim Control, OPL, and Smart Show. Keep the generic State Machine `CodeGenerationDialog` and its `generatedFiles` state untouched.

- [ ] **Step 5: Verify and commit**

Run: `npx vitest run src/components/entropy/executable src/components/hil src/engine/opm`
Expected: PASS.

Run: `node src/utils/opmGeneratedCodeVerifier.test.cjs && npm run test:security`
Expected: PASS, including rejection of traversal filenames, arbitrary compiler commands, oversized payloads, and manifest mismatches.

Commit: `feat(opm): add code generation and HIL handoff workspace`

---

### Task 11: Regression, Help, and Release Gate

**Files:**
- Create: `src/engine/opm/__tests__/e2eAppliance.test.ts`
- Modify: `src/HelpData.ts:119`
- Modify: `docs/XBRIDGES_EMBEDDED_CODEGEN.md` only if it currently claims all embedded generation routes through State Machine; otherwise leave it unchanged.

- [ ] **Step 1: Add the release-gate end-to-end test**

Load the legacy smart-home OPM example and prove OPL output is unchanged. Load the executable appliance fixture, compile it, simulate the event vector, generate all files, strictly compile/run the host harness when a compiler is available, and compare its trace to TypeScript. Assert no generated file contains editor expression strings verbatim, heap APIs, VLA syntax, or unresolved source IDs.

- [ ] **Step 2: Update user help**

Document enabling executable behavior, scalar types, guards and assignments, activation/timing, validation severity, simulation preview/value watch, generated API/artifacts, strict host verification, ZIP export, HIL handoff, and the meaning of “MISRA-oriented” (template discipline, not certification).

- [ ] **Step 3: Run focused and repository gates**

Run: `npx vitest run src/components/entropy src/engine/opm src/components/hil`
Expected: PASS.

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: PASS.

Run: `npm run build`
Expected: PASS. If dependency audit or Electron packaging requires external access/tooling, record that exact environmental failure while retaining the successful TypeScript, Vitest, and Vite evidence.

- [ ] **Step 4: Manual acceptance pass**

Open a legacy Entropy project; verify unchanged OPL/editing/simulation. Enable execution on an object/process/link; enter invalid and valid typed expressions; navigate diagnostics; run cyclic/event/timer transitions; inspect pending/committed values; generate and preview all 12 artifacts; download ZIP; and confirm HIL signal import is opt-in.

- [ ] **Step 5: Commit**

Commit: `docs(opm): document executable modeling and release gate`

---

## Self-Review

**Spec coverage:** Task 1 covers the complete optional persisted schema, global execution config, safe legacy migration, and both save formats. Tasks 2–4 cover deterministic normalization, restricted expressions, validation, and immutable executable IR. Tasks 5 and 7 establish one deterministic runtime and TypeScript/C parity. Task 6 produces every required C artifact, public API, static capacity, traceability, and strict compilation. Tasks 8–10 provide dedicated inspectors, assignments/transitions, diagnostics/navigation, simulation feedback, value watch, code preview/export, secure host verification, and HIL handoff. Task 11 protects OPL/legacy diagrams and defines the release gate.

**Boundary check:** No task converts OPM to State Machine IR. The only reused utilities are JSZip, the generated-code temp workspace, compiler discovery patterns, and the HIL package boundary.

**Type consistency:** `OpmExecutionConfig` is persisted, edited, and passed to compilation as one object. Stable IDs—not labels or C symbols—join persisted and normalized records. `OpmDiagnostic.source` is used by compiler and UI navigation; `ExecutableOpmModel` is the sole input to both runtime and C lowering; `OpmStepResult` feeds preview/watch/animation and parity; `GeneratedOpmFile` is shared by preview, ZIP, host compilation, and HIL handoff. Generator settings come from `ExecutableOpmModel` and cannot diverge after validation.

**Placeholder scan:** The plan contains no deferred requirements or unnamed implementation work. Every task has exact files, interfaces, test intent, verification commands, and a commit boundary.

## Antigravity Delegation Brief Template

Create a fresh brief for exactly one numbered task. Replace `N` and the task title, but do not paste the entire plan into the command line; direct the implementer to read this file from disk.

```xml
<task>
Implement Task N, "TASK TITLE", from docs/superpowers/plans/2026-09-02-entropy-opm-embedded-c.md.
Read the plan header, Global Constraints, Gemini/Antigravity Execution Contract, canonical contracts, and Task N before editing. The current branch is entropy-opm-embedded-c. Preserve all pre-existing VLab changes and the untracked design spec. Implement only Task N and stop for orchestrator review; do not begin Task N+1.
</task>

<verification_loop>
Run the focused commands listed in Task N and fix failures caused by Task N.
Always run: npx tsc --noEmit -p tsconfig.json
Always run: git diff --check
When shared Entropy types change, run: npx vitest run src/components/entropy src/engine/opm
Confirm git status distinguishes pre-existing files from Task N files.
</verification_loop>

<action_safety>
Do not run git add, git commit, git reset, git checkout, git clean, or branch-changing commands.
Do not modify unrelated VLab files, weaken tests, accept arbitrary C, interpolate expressions into generated C, or route OPM through State Machine IR.
Do not add dependencies unless Task N explicitly names one.
</action_safety>

<structured_output_contract>
Report exactly: (1) behavior implemented, (2) files touched, (3) focused test counts and expected initial failures observed, (4) TypeScript and diff-check outcomes, (5) deviations or decisions requiring review. Leave all Task N edits uncommitted.
</structured_output_contract>
```

The orchestrator must compare `git status --short` before and after delegation, inspect untracked files directly, review tests before implementation code, rerun every gate, and commit only Task N files. If rework is needed, resume the same Antigravity conversation with a delta brief naming only the failed requirement and its evidence.
