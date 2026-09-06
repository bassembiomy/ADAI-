# OPM Standard Editor, Simulation, and Embedded Code Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Upgrade the OPM editor, connections, simulation, and embedded C generation while keeping the State Machine and X-Bridges engines completely separate and unchanged.

**Architecture:** Keep React Flow and the existing OPM editor boundary, add pure migration and port-contract helpers, and route every executable action through the canonical OPM compiler. Give OPM its own persisted tick configuration and deterministic scheduler, then qualify generated C99 against the TypeScript runtime through a strict host harness. The main State Machine/X-Bridges runtime and generator files are protected by an import/boundary test.

**Tech Stack:** React 18, TypeScript, `@xyflow/react`, Vitest, existing OPM canonical pipeline, generated C99 runtime, strict host compiler qualification, Electron/browser smoke verification.

## Global Constraints

- OPM isolation: all OPM-specific behavior lives behind `src/engine/opm` and `src/components/entropy`; shared engines remain untouched.
- Canonical model first: editor data is normalized into the executable OPM model before validation, simulation, or C generation.
- Fail closed: invalid direction, unsupported link semantics, invalid identifiers, unsupported expressions, resource overflow, or compiler absence blocks the affected action.
- Determinism: identical model, input events, and tick configuration produce identical TypeScript traces and C qualification output.
- Safe migrations: conversions preserve `id`, name, position, ports, and attributes whenever possible; incompatible execution fields are disabled or removed only after an explicit warning.
- OPM owns `tickMs`; the application State Machine tick remains outside OPM and is not used by OPM runtime or C generation.
- Generated C must be strict C99-oriented, bounded, identifier-safe, diagnosable, and accompanied by qualification evidence.
- Do not modify the State Machine runtime/generator or the X-Bridges runtime/block definitions/generator as part of this plan.

## File Map

| File | Responsibility |
| --- | --- |
| `src/components/entropy/OpmMigrations.ts` | Pure node/link conversion and migration warnings. |
| `src/components/entropy/OpmPortContracts.ts` | Port compatibility and multiplicity decisions shared by preview and commit. |
| `src/components/entropy/OpmSimulationConfig.ts` | OPM-only tick/limit validation and normalized configuration. |
| `src/components/entropy/EntropyTypes.ts` | Editor project persistence types and OPM selection/configuration contracts. |
| `src/components/entropy/EntropyWorkspace.tsx` | UI integration for selection, conversion, connection preview, OPM tick, simulation, and codegen status. |
| `src/components/entropy/OPMNodeComponents.tsx` | Consistent selected/firing visual states and keyboard-visible ports. |
| `src/components/entropy/OPMEdgeComponents.tsx` | Selected-link warm glow, markers, labels, and link editor badge. |
| `src/components/entropy/__tests__/opmMigrations.test.ts` | Conversion preservation, warnings, and refusal tests. |
| `src/components/entropy/__tests__/opmPortContracts.test.ts` | Port/link compatibility matrix and duplicate/multiplicity tests. |
| `src/components/entropy/__tests__/opmSelection.test.tsx` | Warm-light selection and focus behavior. |
| `src/components/entropy/__tests__/opmSimulationConfig.test.ts` | Tick bounds, persistence shape, and isolation tests. |
| `src/engine/opm/executableTypes.ts` | Canonical OPM execution configuration and diagnostics. |
| `src/engine/opm/semanticValidator.ts` | Strict executable model validation and diagnostics. |
| `src/engine/opm/runtime.ts` | Canonical deterministic runtime tick sequence. |
| `src/engine/opm/conformanceHarness.ts` | TypeScript/C snapshot comparison and qualification evidence. |
| `src/engine/opm/cGenerator.ts` | OPM-only C artifact and manifest generation. |
| `src/engine/opm/cRuntimeGenerator.ts` | Bounded C99 runtime API and diagnostics. |
| `src/engine/opm/cIr.ts` | Safe C identifier/literal/resource emission. |
| `src/engine/opm/__tests__/runtime.test.ts` | Runtime semantics and deterministic scheduler tests. |
| `src/engine/opm/__tests__/runtimeConformance.test.ts` | TypeScript/C parity tests. |
| `src/engine/opm/__tests__/cGenerator.test.ts` | Artifact, API, manifest, and resource-bound tests. |
| `src/engine/opm/__tests__/generatorBoundary.test.ts` | Import/source boundary test protecting main generators. |
| `src/App.tsx` | Persist/restore OPM config only; no edits to shared generator logic. |

---

### Task 1: Add pure OPM conversion and migration contracts

**Files:**
- Create: `src/components/entropy/OpmMigrations.ts`
- Modify: `src/components/entropy/EntropyTypes.ts`
- Create: `src/components/entropy/__tests__/opmMigrations.test.ts`

**Interfaces:**
- Produces `OpmMigrationWarning`, `convertOpmNodeType`, and `convertOpmEdgeType` for editor and properties-panel consumers.

- [ ] **Step 1: Write failing preservation and warning tests.**

    it('preserves common node fields and warns when state-only execution is disabled', () => {
      const result = convertOpmNodeType(statefulObject, 'opmProcess');
      expect(result.node.id).toBe(statefulObject.id);
      expect(result.node.position).toEqual(statefulObject.position);
      expect(result.node.data.name).toBe(statefulObject.data.name);
      expect(result.warnings.map(w => w.code)).toContain('OPM_STATE_DATA_DISABLED');
    });

    it('refuses a link conversion that violates endpoint direction', () => {
      const result = convertOpmEdgeType(invalidEdge, 'result');
      expect(result.edge).toEqual(invalidEdge);
      expect(result.warnings[0].code).toBe('OPM_LINK_CONVERSION_INVALID');
    });

- [ ] **Step 2: Run `npx vitest run src/components/entropy/__tests__/opmMigrations.test.ts`; verify the new symbols are missing.**
- [ ] **Step 3: Implement the pure migration API.** Preserve node ID, name, position, dimensions, ports, attributes, labels, endpoints, handles, and user metadata. Return the original value plus a stable warning when a conversion is not valid; never mutate input objects.
- [ ] **Step 4: Run the migration test; expected result is PASS with all preservation and warning assertions.**
- [ ] **Step 5: Commit with `git add src/components/entropy/OpmMigrations.ts src/components/entropy/EntropyTypes.ts src/components/entropy/__tests__/opmMigrations.test.ts && git commit -m "feat(opm): add safe block and link migrations"`.**

### Task 2: Enforce a shared port and connection contract

**Files:**
- Create: `src/components/entropy/OpmPortContracts.ts`
- Modify: `src/components/entropy/OpmLinkRules.ts`
- Modify: `src/components/entropy/EntropyWorkspace.tsx`
- Create: `src/components/entropy/__tests__/opmPortContracts.test.ts`

**Interfaces:**
- Produces `validateOpmPortConnection(nodes, edges, connection, linkType): OpmPortConnectionVerdict`.
- `OpmPortConnectionVerdict` contains `valid`, stable `code`, `reason`, and optional `sourcePort`/`targetPort`.

- [ ] **Step 1: Add failing matrix tests for direction, ownership, semantic role, data type, duplicate links, and multiplicity.**

    expect(validateOpmPortConnection(nodes, edges, connection, 'result').valid).toBe(true);
    expect(validateOpmPortConnection(nodes, edges, reverseConnection, 'result').code)
      .toBe('OPM_PORT_DIRECTION_INVALID');
    expect(validateOpmPortConnection(nodes, edges, duplicate, 'result').code)
      .toBe('OPM_DUPLICATE_CONNECTION');

- [ ] **Step 2: Run the focused port-contract test and verify the new contract fails.**
- [ ] **Step 3: Implement the compatibility matrix and make `validateOpmConnection` delegate to it for node-level checks.** Include source/target existence, handle ownership, source/target direction, link role, scalar type, and duplicate/multiplicity rules.
- [ ] **Step 4: Update `EntropyWorkspace` so connection preview and `onConnect` call the same function; rejected previews show the stable diagnostic and rejected connections never enter React Flow state.**
- [ ] **Step 5: Run `npx vitest run src/components/entropy/__tests__/opmPortContracts.test.ts src/components/entropy/__tests__/opmLinkRules.test.ts`; expected result is PASS.**
- [ ] **Step 6: Commit with `git add src/components/entropy/OpmPortContracts.ts src/components/entropy/OpmLinkRules.ts src/components/entropy/EntropyWorkspace.tsx src/components/entropy/__tests__/opmPortContracts.test.ts && git commit -m "feat(opm): enforce port-aware connection contracts"`.**

### Task 3: Integrate warm selection and safe type editing into the UI

**Files:**
- Modify: `src/components/entropy/OPMNodeComponents.tsx`
- Modify: `src/components/entropy/OPMEdgeComponents.tsx`
- Modify: `src/components/entropy/EntropyWorkspace.tsx`
- Create: `src/components/entropy/__tests__/opmSelection.test.tsx`

**Interfaces:**
- Consumes `convertOpmNodeType`, `convertOpmEdgeType`, and `validateOpmPortConnection`.
- Produces a selected-element properties flow with `Apply conversion` and `Cancel` behavior.

- [ ] **Step 1: Add failing renderer tests that assert selected node and selected edge include the shared warm-light classes/styles while firing/active styles remain distinguishable.**
- [ ] **Step 2: Run the focused UI test and verify it fails for any renderer that lacks the shared selection contract.**
- [ ] **Step 3: Add a shared `OPM_SELECTION_GLOW` style contract to both renderers.** Apply it to the node boundary, ports, edge path, marker, and badge. Add `aria-label`, keyboard focus styles, and a non-hover port label path.
- [ ] **Step 4: Add a selected-block type selector and selected-link type selector in `EntropyWorkspace`.** Stage the conversion result, render warnings, and only apply it after the user confirms. Revalidate all affected links after a block conversion and mark invalid links with diagnostics instead of silently changing semantics.
- [ ] **Step 5: Run `npx vitest run src/components/entropy/__tests__/opmSelection.test.tsx src/components/entropy/__tests__/executionPanels.test.tsx`; expected result is PASS.**
- [ ] **Step 6: Commit with `git add src/components/entropy/OPMNodeComponents.tsx src/components/entropy/OPMEdgeComponents.tsx src/components/entropy/EntropyWorkspace.tsx src/components/entropy/__tests__/opmSelection.test.tsx && git commit -m "feat(opm): add warm selection and safe type editing"`.**

### Task 4: Isolate and persist the OPM simulation configuration

**Files:**
- Create: `src/components/entropy/OpmSimulationConfig.ts`
- Modify: `src/components/entropy/EntropyTypes.ts`
- Modify: `src/components/entropy/OpmSimulationEngine.ts`
- Modify: `src/components/entropy/EntropyWorkspace.tsx`
- Modify: `src/App.tsx`
- Create: `src/components/entropy/__tests__/opmSimulationConfig.test.ts`

**Interfaces:**
- Produces `OpmSimulationConfig`, `DEFAULT_OPM_SIMULATION_CONFIG`, and `normalizeOpmSimulationConfig(input): OpmSimulationConfig`.
- `EntropyWorkspace` receives `opmConfig` and `onOpmConfigChange`; the application `tickMs` remains available to the main engine only.

- [ ] **Step 1: Write failing tests for valid tick persistence, invalid tick rejection, max limits, and global-tick isolation.**

    expect(normalizeOpmSimulationConfig({ tickMs: 25 }).tickMs).toBe(25);
    expect(() => normalizeOpmSimulationConfig({ tickMs: 0 })).toThrow('OPM_TICK_INVALID');
    expect(normalizeOpmSimulationConfig({ tickMs: Number.NaN }).tickMs).toBe(100);

- [ ] **Step 2: Run the focused config test and verify it fails.**
- [ ] **Step 3: Implement normalization with finite integer bounds, `maxTicks`, `maxEventsPerTick`, and deterministic ordering.**
- [ ] **Step 4: Refactor `OpmSimulationEngine` to accept the normalized config and advance simulated time by `config.tickMs`; remove any implicit dependency on the application tick.**
- [ ] **Step 5: Update `EntropyTypes`, `App.tsx` persistence/restore, and `EntropyWorkspace` controls so OPM config is saved under `executionConfig`/OPM project data without changing the State Machine generator inputs.**
- [ ] **Step 6: Run `npx vitest run src/components/entropy/__tests__/opmSimulationConfig.test.ts src/components/entropy/__tests__/opmSimulationEngine.test.ts src/engine/opm/__tests__/runtime.test.ts`; expected result is PASS.**
- [ ] **Step 7: Commit with `git add src/components/entropy/OpmSimulationConfig.ts src/components/entropy/EntropyTypes.ts src/components/entropy/OpmSimulationEngine.ts src/components/entropy/EntropyWorkspace.tsx src/App.tsx src/components/entropy/__tests__/opmSimulationConfig.test.ts && git commit -m "feat(opm): isolate configurable simulation timing"`.**

### Task 5: Harden canonical OPM runtime semantics and diagnostics

**Files:**
- Modify: `src/engine/opm/executableTypes.ts`
- Modify: `src/engine/opm/semanticValidator.ts`
- Modify: `src/engine/opm/runtime.ts`
- Modify: `src/components/entropy/OpmSimulationEngine.ts`
- Modify: `src/engine/opm/__tests__/runtime.test.ts`
- Modify: `src/engine/opm/__tests__/runtimeConformance.test.ts`

**Interfaces:**
- `stepOpmRuntime(runtime, input): OpmStepResult` remains the only canonical execution entry point.
- `OpmStepResult` contains post-step snapshot, fired/blocked process IDs, diagnostics delta, and simulated time.

- [ ] **Step 1: Add failing tests for exact tick ordering: input latch, event dispatch, guard/enabler evaluation, deterministic conflict resolution, staged writes, trace emission, and time increment.**
- [ ] **Step 2: Add failing tests for event overflow, transition conflict, write conflict, invalid initial states, and max-tick termination with stable diagnostic codes.**
- [ ] **Step 3: Run the runtime tests and verify the missing ordering/diagnostics assertions fail.**
- [ ] **Step 4: Implement the explicit scheduler sequence and bounded diagnostics in the canonical runtime; keep the React adapter as a presentation adapter only.**
- [ ] **Step 5: Run the runtime and existing mutation-resistance suites; expected result is PASS with deterministic repeated-run snapshots.**
- [ ] **Step 6: Commit with `git add src/engine/opm src/components/entropy/OpmSimulationEngine.ts && git commit -m "feat(opm): harden deterministic runtime semantics"`.**

### Task 6: Strengthen embedded-oriented OPM C artifacts

**Files:**
- Modify: `src/engine/opm/cIr.ts`
- Modify: `src/engine/opm/cRuntimeGenerator.ts`
- Modify: `src/engine/opm/cGenerator.ts`
- Modify: `src/engine/opm/executableTypes.ts`
- Modify: `src/engine/opm/__tests__/cGenerator.test.ts`

**Interfaces:**
- `generateOpmCArtifacts(model): { files: GeneratedOpmFile[]; manifest: OpmManifest }` remains OPM-only.
- The manifest adds `modelFingerprint`, `generatorVersion`, `tickMs`, resource limits, strict compiler flags, and qualification status.

- [ ] **Step 1: Add failing tests for public API names (`OPM_Init`, `OPM_Reset`, `OPM_Step`, `OPM_DispatchEvent`), fixed-width types, bounded arrays, identifier rejection, and manifest fields.**
- [ ] **Step 2: Run `npx vitest run src/engine/opm/__tests__/cGenerator.test.ts`; verify the new artifact assertions fail.**
- [ ] **Step 3: Implement bounded C IR emission using fixed-width types, safe identifiers, deterministic symbols, compile-time limits, and explicit diagnostics counters.**
- [ ] **Step 4: Add target configuration hooks without introducing a dependency on State Machine/X-Bridges generator modules.**
- [ ] **Step 5: Add fail-closed resource checks for nodes, states, processes, links, events, and generated text size; return diagnostics instead of emitting partial artifacts.**
- [ ] **Step 6: Run the generator test and strict compile fixture; expected result is PASS with no warnings under `-std=c99 -pedantic-errors -Wall -Wextra -Werror`.**
- [ ] **Step 7: Commit with `git add src/engine/opm/cIr.ts src/engine/opm/cRuntimeGenerator.ts src/engine/opm/cGenerator.ts src/engine/opm/executableTypes.ts src/engine/opm/__tests__/cGenerator.test.ts && git commit -m "feat(opm): harden bounded embedded C artifacts"`.**

### Task 7: Add TypeScript/C qualification and generator-boundary gates

**Files:**
- Modify: `src/engine/opm/conformanceHarness.ts`
- Modify: `src/engine/opm/cHostHarness.ts`
- Create: `src/engine/opm/__tests__/generatorBoundary.test.ts`
- Modify: `src/engine/opm/__tests__/runtimeConformance.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces a release command `npm run test:opm:qualification` that fails when the compiler is unavailable, C output differs from TypeScript, or OPM imports a protected main-engine generator.

- [ ] **Step 1: Add failing boundary tests that scan OPM source imports and reject imports from State Machine/X-Bridges generator paths.**
- [ ] **Step 2: Add failing qualification cases for model fingerprint mismatch, extra stdout, duplicate step index, non-finite values, compiler absence, and C/TypeScript snapshot divergence.**
- [ ] **Step 3: Run the focused qualification tests and verify the missing gates fail.**
- [ ] **Step 4: Implement the boundary scan and strict conformance assertions using argument-vector process execution only; preserve fail-closed compiler resolution.**
- [ ] **Step 5: Add the package script: `"test:opm:qualification": "vitest run src/engine/opm/__tests__/runtimeConformance.test.ts src/engine/opm/__tests__/generatorBoundary.test.ts src/engine/opm/__tests__/cGenerator.test.ts --reporter=verbose"`.**
- [ ] **Step 6: Run `npm run test:opm:qualification`; expected result is PASS when the required compiler is available and a clear failure when it is not.**
- [ ] **Step 7: Commit with `git add src/engine/opm/conformanceHarness.ts src/engine/opm/cHostHarness.ts src/engine/opm/__tests__/generatorBoundary.test.ts src/engine/opm/__tests__/runtimeConformance.test.ts package.json && git commit -m "test(opm): gate C qualification and generator isolation"`.**

### Task 8: Integrate release UX and verify the complete user flow

**Files:**
- Modify: `src/components/entropy/OpmCodeGenerationWorkspace.tsx`
- Modify: `src/components/entropy/OpmDiagnosticsBadge.tsx`
- Modify: `src/components/entropy/OpmExecutionPropertiesPanel.tsx`
- Modify: `src/components/entropy/EntropyWorkspace.tsx`
- Create: `src/components/entropy/__tests__/opmReleaseFlow.test.tsx`
- Modify: `docs/superpowers/specs/2026-09-05-opm-standard-editor-engine-design.md`

**Interfaces:**
- The codegen workspace exposes lifecycle states `draft`, `generated`, `verified`, and `failed` tied to the current canonical model fingerprint.
- The diagnostics badge navigates to the exact node/edge/property path that blocked simulation or generation.

- [ ] **Step 1: Add a failing release-flow test covering selection, conversion warning, valid/invalid connection, tick edit, simulation, model invalidation, generation, and qualification status.**
- [ ] **Step 2: Run `npx vitest run src/components/entropy/__tests__/opmReleaseFlow.test.tsx`; verify the end-to-end state transitions fail.**
- [ ] **Step 3: Connect the existing properties panel, diagnostics badge, simulation controls, and codegen workspace to the canonical model fingerprint and OPM-specific configuration.**
- [ ] **Step 4: Disable download/export until validation and qualification are successful for the current fingerprint; show exact remediation text for failures.**
- [ ] **Step 5: Run the focused UI suite and the full OPM suite; expected result is PASS.**
- [ ] **Step 6: Run the browser smoke flow against the dev server: open OPM, select a block and transition, confirm warm light, attempt an invalid connection, convert a block with warning, change OPM tick, run one simulation tick, generate C, and verify qualification status.**
- [ ] **Step 7: Run the final verification commands.**

    npx tsc --noEmit
    npx vitest run src/components/entropy/__tests__ src/engine/opm/__tests__
    npm run build
    npm run test:opm:qualification

    Expected result: type-check, focused tests, build, and qualification all pass; no file under the protected State Machine/X-Bridges generator paths is modified.

- [ ] **Step 8: Commit with `git add src/components/entropy docs/superpowers/specs/2026-09-05-opm-standard-editor-engine-design.md && git commit -m "feat(opm): complete standard editor release flow"`.**

## Final Review Checklist

- [ ] Every selected OPM block and transition has the same warm-light selection treatment.
- [ ] Block conversion preserves common data and requires confirmation for incompatible fields.
- [ ] Transition conversion preserves endpoints and is rejected when the port contract is invalid.
- [ ] Connection preview and connection commit use the same validator.
- [ ] OPM tick is persisted, validated, and independent from the application State Machine tick.
- [ ] TypeScript runtime and C runtime produce matching deterministic snapshots.
- [ ] C artifacts are bounded, strict-C99 compatible, target-configurable, and accompanied by a manifest.
- [ ] Code generation fails closed on validation, compiler, identifier, expression, or resource errors.
- [ ] OPM codegen imports no State Machine/X-Bridges generator implementation.
- [ ] The protected main generator files have no diff in the final PR.
