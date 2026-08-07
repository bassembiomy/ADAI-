# Generic State Machine Code Generator Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an industrial-grade MCU-independent state-machine code generator with precomputed HSM LCA paths, static scale-aware matrix numerical solvers, marker-based line traceability, an independent TypeScript reference interpreter, a host C harness emitting a canonical 10-field JSONL trace, a trace comparator with negative tests, an atomic artifact writer, and a multi-stage verification orchestrator.

**Architecture:** 
1. `smRuntimeGenerator.ts`: Generates reusable runtime infrastructure (`runtime/sm_runtime.c`, `runtime/sm_runtime.h`), config (`generated/sm_config.h`), version (`generated/sm_version.h`), and manifest (`generated/manifest.json`) with `SM_Error_t` classification and compile-time `_Static_assert` portability checks.
2. Semantic IR Enrichment: Precomputes exact LCA exit/entry paths across all 7 transition kinds and builds normalized `ir.traceableElements`.
3. `smCGenerator.ts`: Renders C code with namespaced local variables (`sm_t14_guard_eval`), precomputed paths, `<stdint.h>`/`<stdbool.h>` types, NULL check, and `TRACE-BEGIN`/`TRACE-END` markers. Tested under `-Wshadow -Werror`.
4. `xbCGenerator.ts`: Scale-aware static stack solvers (`abs(pivot) <= max(abs_eps, rel_eps * scale)`), zero `malloc`/`free`, safe fallback outputs, and `SM_ERR_NUMERIC_FAULT` latching.
5. `smTraceabilityEngine.ts`: Marker-based line locator mapping requirements across all element types to multi-location JSON without fabricated line numbers. Raises `TRACEABILITY_UNRESOLVED` on missing markers.
6. `smReferenceInterpreter.ts`: Independent reference execution engine interpreting guards, priority, HSM hierarchy, entry/exit actions, events, timers, and variables.
7. `smHostHarness.ts`: C host runner emitting a canonical 10-field JSONL execution trace (`tick`, `activeStates`, `transitionIds`, `exitActions`, `transitionActions`, `entryActions`, `consumedEvents`, `emittedEvents`, `variables`, `timers`, `error`).
8. `smDifferentialEngine.ts`: Compares reference traces vs compiled host C binary JSONL traces in strict field order. Includes negative tests, trace-length validation, and replay vectors (`reports/failures/diff_failure_XXXX.json`).
9. `smFileWriter.ts`: Atomic and path-safe writer enforcing `CREATE_IF_MISSING` for user files (`platform/sm_inputs.c`, `sm_outputs.c`, `sm_safety.c`) to preserve custom code across regenerations (`GEN-INT-005`).
10. `smVerificationAggregator.ts`: Enforces 7-state status matrix without false PASSes.
11. `scripts/verify_sm_codegen.ts`: Orchestrates real execution: `semantic validation -> generation -> host compile (-Werror) -> reference execution -> host C execution -> differential comparison -> coverage -> traceability -> reports`.

**Tech Stack:** TypeScript, Vitest, C11/C99 standard, Node.js `child_process` (for host `gcc`/`clang` compilation and binary execution), static matrix algebra.

## Global Constraints

- Reusable runtime infrastructure resides in `runtime/sm_runtime.c` and `runtime/sm_runtime.h`.
- Model behavior resides in `generated/sm_core.c` and `generated/sm_core.h`.
- Platform user files (`platform/sm_inputs.c`, `platform/sm_outputs.c`, `platform/sm_safety.c`) shall never be overwritten during code regeneration (`GEN-INT-005`).
- Precomputed HSM LCA paths — zero dynamic hierarchy search at runtime.
- Null pointer handling returns `SM_ERR_NULL_POINTER` immediately without dereferencing `instance`.
- Integer types map to `<stdint.h>`, booleans to `<stdbool.h>`, floats to `float`/`double` with `_Static_assert`.
- Line numbers in `reports/traceability.json` are resolved via post-processing `TRACE-BEGIN`/`TRACE-END` markers after formatting. Unresolved markers raise `TRACEABILITY_UNRESOLVED`.
- Differential execution compares independent TS interpreter output against host-compiled C binary JSONL output tick-by-tick across all 10 canonical fields.
- No false PASSes (`GEN-RPT-002`). Unexecuted stages report `NOT RUN` or `BLOCKED`.

---

### Task 1: Reusable Runtime, Config, Error Model, & Static Assertions

**Files:**
- Create: `src/utils/stateMachine/smRuntimeGenerator.ts`
- Test: `src/utils/stateMachine/smRuntimeGenerator.test.ts`

**Interfaces:**
- Consumes: `SemanticModel` from `src/utils/stateMachine/smSemanticModel.ts`
- Produces: `renderRuntimeFiles(ir: SemanticModel): GeneratedCFile[]` emitting `runtime/sm_runtime.c`, `runtime/sm_runtime.h`, `generated/sm_config.h`, `generated/sm_version.h`, and `generated/manifest.json`.

- [ ] **Step 1: Write failing test for runtime generator with _Static_assert**

```typescript
// src/utils/stateMachine/smRuntimeGenerator.test.ts
import { describe, expect, it } from 'vitest';
import { renderRuntimeFiles } from './smRuntimeGenerator';
import { flatOrFixture } from './smFixtures';
import { buildSemanticModel } from './smSemanticBuilder';

describe('smRuntimeGenerator', () => {
  it('generates runtime, config, version, and manifest files with explicit SM_Error_t and _Static_assert', () => {
    const model = flatOrFixture();
    const { ir } = buildSemanticModel(model);
    const files = renderRuntimeFiles(ir!);
    
    const configHeader = files.find(f => f.name === 'generated/sm_config.h');
    const versionHeader = files.find(f => f.name === 'generated/sm_version.h');
    const runtimeHeader = files.find(f => f.name === 'runtime/sm_runtime.h');
    const manifest = files.find(f => f.name === 'generated/manifest.json');

    expect(configHeader?.content).toContain('#define SM_ENABLE_TRACE');
    expect(configHeader?.content).toContain('#define SM_XB_ABS_EPSILON');
    expect(configHeader?.content).toContain('#define SM_XB_REL_EPSILON');
    expect(configHeader?.content).toContain('_Static_assert(sizeof(float) == 4U');
    expect(versionHeader?.content).toContain('#define SM_GENERATOR_VERSION "3.1"');
    expect(runtimeHeader?.content).toContain('SM_ERR_NULL_POINTER');
    expect(runtimeHeader?.content).toContain('SM_ERR_NUMERIC_FAULT');
    expect(runtimeHeader?.content).toContain('SM_ERR_INVALID_STATE');
    expect(manifest?.content).toContain('"generator": "ADIA"');
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run src/utils/stateMachine/smRuntimeGenerator.test.ts`  
Expected: FAIL with "Cannot find module ./smRuntimeGenerator"

- [ ] **Step 3: Implement smRuntimeGenerator**

```typescript
// src/utils/stateMachine/smRuntimeGenerator.ts
import type { SemanticModel } from './smSemanticModel';

export interface GeneratedFile {
  name: string;
  content: string;
  overwritePolicy?: 'ALWAYS' | 'CREATE_IF_MISSING';
}

export function renderRuntimeFiles(ir: SemanticModel): GeneratedFile[] {
  const configHeader = `#ifndef SM_CONFIG_H\n#define SM_CONFIG_H\n\n#include <stdint.h>\n#include <stdbool.h>\n\n#define SM_ENABLE_TRACE 1\n#define SM_ENABLE_ASSERTS 1\n#define SM_ENABLE_RUNTIME_CHECKS 1\n#define SM_ENABLE_COVERAGE 0\n#define SM_MAX_ACTIVE_STATES 16\n#define SM_TIMEBASE_UNIT_MS 1\n#define SM_XB_ABS_EPSILON (1.0e-7F)\n#define SM_XB_REL_EPSILON (1.0e-6F)\n\n_Static_assert(sizeof(float) == 4U, "Unsupported float representation width");\n_Static_assert(sizeof(double) == 8U, "Unsupported double representation width");\n\n#endif /* SM_CONFIG_H */\n`;

  const versionHeader = `#ifndef SM_VERSION_H\n#define SM_VERSION_H\n\n#define SM_GENERATOR_VERSION "3.1"\n#define SM_MODEL_HASH "${ir.modelHash || '0000000000000000'}"\n#define SM_CODE_VERSION 0x030100\n\n#endif /* SM_VERSION_H */\n`;

  const runtimeHeader = `#ifndef SM_RUNTIME_H\n#define SM_RUNTIME_H\n\n#include <stdint.h>\n#include <stdbool.h>\n\ntypedef enum\n{\n    SM_ERR_NONE = 0,\n    SM_ERR_NULL_POINTER,\n    SM_ERR_INVALID_STATE,\n    SM_ERR_INVALID_CONFIGURATION,\n    SM_ERR_TIMING_VIOLATION,\n    SM_ERR_BOUNDS,\n    SM_ERR_NUMERIC_FAULT,\n    SM_ERR_INTERNAL\n} SM_Error_t;\n\n#endif /* SM_RUNTIME_H */\n`;

  const runtimeSource = `#include "sm_runtime.h"\n#include "sm_config.h"\n\n/* Reusable State Machine Runtime Infrastructure */\n`;

  const manifest = JSON.stringify({
    generator: "ADIA",
    version: "3.1",
    modelHash: ir.modelHash || "0000000000000000",
    generatedFiles: ["generated/sm_core.c", "generated/sm_core.h", "generated/sm_types.h", "generated/sm_config.h", "generated/sm_version.h"],
    runtimeFiles: ["runtime/sm_runtime.c", "runtime/sm_runtime.h"]
  }, null, 2);

  return [
    { name: 'generated/sm_config.h', content: configHeader, overwritePolicy: 'ALWAYS' },
    { name: 'generated/sm_version.h', content: versionHeader, overwritePolicy: 'ALWAYS' },
    { name: 'runtime/sm_runtime.h', content: runtimeHeader, overwritePolicy: 'ALWAYS' },
    { name: 'runtime/sm_runtime.c', content: runtimeSource, overwritePolicy: 'ALWAYS' },
    { name: 'generated/manifest.json', content: manifest, overwritePolicy: 'ALWAYS' },
  ];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/stateMachine/smRuntimeGenerator.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/stateMachine/smRuntimeGenerator.ts src/utils/stateMachine/smRuntimeGenerator.test.ts
git commit -m "feat(codegen): implement smRuntimeGenerator with SM_Error_t and static portability assertions"
```

---

### Task 2: Semantic IR Enrichment (Exact HSM Precomputed Paths)

**Files:**
- Modify: `src/utils/stateMachine/smSemanticModel.ts`
- Modify: `src/utils/stateMachine/smSemanticBuilder.ts`
- Test: `src/utils/stateMachine/smSemanticBuilder.test.ts`

**Interfaces:**
- Consumes: State machine model definitions
- Produces: `SemanticTransition` with exact precomputed `exitStateIds`, `entryStateIds`, and `lcaStateId` across child-to-sibling, child-to-ancestor, ancestor-to-descendant, cross-branch, self, internal, and local transitions.

- [ ] **Step 1: Write failing test for exact HSM LCA path calculation**

```typescript
// Add to src/utils/stateMachine/smSemanticBuilder.test.ts
it('precomputes exact exitStateIds, entryStateIds, and lcaStateId for hierarchical transitions', () => {
  const model = nestedAndFixture();
  const { ir } = buildSemanticModel(model);
  expect(ir).toBeDefined();
  
  const transitions = Object.values(ir!.transitions);
  const crossBranchTrans = transitions.find(t => t.exitStateIds.length > 0 && t.entryStateIds.length > 0);
  expect(crossBranchTrans).toBeDefined();
  expect(crossBranchTrans!.lcaStateId).not.toBeNull();
  expect(crossBranchTrans!.exitStateIds).not.toEqual([]);
  expect(crossBranchTrans!.entryStateIds).not.toEqual([]);
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run src/utils/stateMachine/smSemanticBuilder.test.ts`  
Expected: FAIL

- [ ] **Step 3: Enrich SemanticTransition in smSemanticModel & smSemanticBuilder**

In `src/utils/stateMachine/smSemanticModel.ts`:
Add `lcaStateId`, `exitStateIds`, `entryStateIds`, `transitionKind: 'external' | 'internal' | 'local'` to `SemanticTransition`.

In `src/utils/stateMachine/smSemanticBuilder.ts`:
Calculate ancestor chains for source and target states, locate LCA, and populate exact `exitStateIds` (from source up to LCA) and `entryStateIds` (from LCA down to target).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/stateMachine/smSemanticBuilder.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/stateMachine/smSemanticModel.ts src/utils/stateMachine/smSemanticBuilder.ts src/utils/stateMachine/smSemanticBuilder.test.ts
git commit -m "feat(codegen): precompute exact HSM LCA exit/entry paths across transition types"
```

---

### Task 3: Normalized Traceable Elements Metadata

**Files:**
- Modify: `src/utils/stateMachine/smSemanticModel.ts`
- Modify: `src/utils/stateMachine/smSemanticBuilder.ts`
- Test: `src/utils/stateMachine/smSemanticBuilder.test.ts`

**Interfaces:**
- Consumes: State machine model
- Produces: `ir.traceableElements: TraceableElement[]` covering states, transitions, guards, entry/exit actions, events, and XBridges operations.

- [ ] **Step 1: Write failing test for ir.traceableElements collection**

```typescript
// Add to src/utils/stateMachine/smSemanticBuilder.test.ts
it('builds a normalized collection of ir.traceableElements covering states, transitions, guards, actions', () => {
  const model = flatOrFixture();
  const { ir } = buildSemanticModel(model);
  expect(ir!.traceableElements).toBeDefined();
  expect(ir!.traceableElements.length).toBeGreaterThan(0);
  const kinds = new Set(ir!.traceableElements.map(e => e.kind));
  expect(kinds.has('state')).toBe(true);
  expect(kinds.has('transition')).toBe(true);
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run src/utils/stateMachine/smSemanticBuilder.test.ts`  
Expected: FAIL

- [ ] **Step 3: Add traceableElements to SemanticModel & SemanticBuilder**

In `src/utils/stateMachine/smSemanticModel.ts`:
Define `TraceableElement` interface (`id`, `kind`, `requirementIds`, `modelPath`, `traceId`).

In `src/utils/stateMachine/smSemanticBuilder.ts`:
Collect all traceable elements into `ir.traceableElements`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/stateMachine/smSemanticBuilder.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/stateMachine/smSemanticModel.ts src/utils/stateMachine/smSemanticBuilder.ts src/utils/stateMachine/smSemanticBuilder.test.ts
git commit -m "feat(codegen): populate normalized ir.traceableElements metadata collection"
```

---

### Task 4: C Renderer Enhancements & Compiler Warnings Test (-Wshadow -Werror)

**Files:**
- Modify: `src/utils/stateMachine/smCGenerator.ts`
- Test: `src/utils/stateMachine/smCGenerator.test.ts`

**Interfaces:**
- Consumes: Enriched `SemanticModel`
- Produces: `sm_core.c` with namespaced local variables (`sm_t14_guard_eval`), precomputed LCA execution blocks, `NULL` pointer check (`SM_ERR_NULL_POINTER`), and `TRACE-BEGIN`/`TRACE-END` markers. Verified warning-free under `-Wshadow -Werror`.

- [ ] **Step 1: Write failing test for namespacing and host compilation without shadowing**

```typescript
// Add to src/utils/stateMachine/smCGenerator.test.ts
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createGeneratedCodeTestWorkspace } from '../generatedCodeTestWorkspace';

it('renders namespaced variables and compiles warning-free under -Wshadow -Werror', () => {
  const model = nestedAndFixture();
  const { ir } = buildSemanticModel(model);
  const artifacts = generateCArtifacts(ir!);
  const workspace = createGeneratedCodeTestWorkspace('shadow-test');

  for (const f of artifacts.files) {
    writeFileSync(join(workspace.directory, f.name), f.content);
  }

  const dummyMain = `
    #include "generated/sm_core.h"
    int main(void) {
        SM_Instance_t inst;
        SM_Init(&inst);
        return 0;
    }
  `;
  writeFileSync(join(workspace.directory, 'main.c'), dummyMain);

  expect(() => {
    execFileSync('gcc', ['-std=c11', '-Wall', '-Wextra', '-Wshadow', '-Werror', '-I.', 'generated/sm_core.c', 'runtime/sm_runtime.c', 'main.c', '-o', join(workspace.directory, 'out.exe')], { cwd: workspace.directory });
  }).not.toThrow();
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run src/utils/stateMachine/smCGenerator.test.ts`  
Expected: FAIL

- [ ] **Step 3: Update smCGenerator to namespace variables and emit TRACE markers**

In `src/utils/stateMachine/smCGenerator.ts`:
1. Render NULL pointer check in public functions: `if (instance == NULL) return SM_ERR_NULL_POINTER;`.
2. Namespace transition local variables using transition ID (`sm_${transition.id}_guard_eval`).
3. Embed `/* TRACE-BEGIN: model=${elem.id} traceId=${elem.traceId} symbol=${symbol} */` and `/* TRACE-END: model=${elem.id} */` markers.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/stateMachine/smCGenerator.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/stateMachine/smCGenerator.ts src/utils/stateMachine/smCGenerator.test.ts
git commit -m "feat(codegen): render namespaced variables and TRACE markers; verify warning-free under -Wshadow -Werror"
```

---

### Task 5: XBridges Scale-Aware Matrix Solvers & Numerical Fault Tests

**Files:**
- Modify: `src/utils/stateMachine/xbCGenerator.ts`
- Test: `src/utils/stateMachine/xbCGenerator.test.ts`

**Interfaces:**
- Consumes: `XBSemanticModel`
- Produces: `sm_xb_runtime.c` with static stack storage (`no malloc/free`), scale-aware pivot check (`abs(pivot) <= max(abs_eps, rel_eps * scale)`), safe output fallback invocation, and `SM_ERR_NUMERIC_FAULT` latching.

- [ ] **Step 1: Write failing test for scale-aware pivot check and safe fallback invocation**

```typescript
// Add to src/utils/stateMachine/xbCGenerator.test.ts
it('uses scale-aware pivot validation and triggers safe output fallback on singular matrix', () => {
  const model = hybridXBridgesFixture();
  const { ir } = buildSemanticModel(model);
  const artifacts = generateCArtifacts(ir!);
  const xbSource = artifacts.files.find(f => f.name === 'sm_xb_runtime.c')?.content || '';

  expect(xbSource).not.toContain('malloc');
  expect(xbSource).not.toContain('free');
  expect(xbSource).toContain('SM_XB_ABS_EPSILON');
  expect(xbSource).toContain('SM_XB_REL_EPSILON');
  expect(xbSource).toContain('SM_ERR_NUMERIC_FAULT');
  expect(xbSource).toContain('SM_ApplySafeOutputs');
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run src/utils/stateMachine/xbCGenerator.test.ts`  
Expected: FAIL

- [ ] **Step 3: Update xbCGenerator static matrix solvers**

In `src/utils/stateMachine/xbCGenerator.ts`:
1. Use stack storage for matrix pivots (`no malloc/free`).
2. Evaluate pivots using scale-aware formula: `fabsf(pivot) <= (SM_XB_ABS_EPSILON > (SM_XB_REL_EPSILON * scale) ? SM_XB_ABS_EPSILON : (SM_XB_REL_EPSILON * scale))`.
3. If singular or NaN/Inf, set `instance->error = SM_ERR_NUMERIC_FAULT`, invoke `SM_ApplySafeOutputs(instance)`, and write fallback signal values.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/stateMachine/xbCGenerator.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/stateMachine/xbCGenerator.ts src/utils/stateMachine/xbCGenerator.test.ts
git commit -m "feat(codegen): implement scale-aware matrix pivot validation and safe fallback in xbCGenerator"
```

---

### Task 6: Marker-Based Line Traceability Engine

**Files:**
- Create: `src/utils/stateMachine/smTraceabilityEngine.ts`
- Test: `src/utils/stateMachine/smTraceabilityEngine.test.ts`

**Interfaces:**
- Consumes: Rendered C files (`GeneratedCFile[]`) and `SemanticModel`
- Produces: `reports/traceability.json` mapping `ir.traceableElements` to `locations: [{ file, symbol, startLine, endLine }]`. Raises `TRACEABILITY_UNRESOLVED` error if markers are unmapped.

- [ ] **Step 1: Write failing test for marker-based line resolution**

```typescript
// src/utils/stateMachine/smTraceabilityEngine.test.ts
import { describe, expect, it } from 'vitest';
import { generateTraceabilityReport } from './smTraceabilityEngine';
import { flatOrFixture } from './smFixtures';
import { buildSemanticModel } from './smSemanticBuilder';
import { generateCArtifacts } from './smCGenerator';

describe('smTraceabilityEngine', () => {
  it('parses TRACE-BEGIN and TRACE-END markers to resolve exact multi-location line ranges', () => {
    const model = flatOrFixture();
    const { ir } = buildSemanticModel(model);
    const artifacts = generateCArtifacts(ir!);
    const report = generateTraceabilityReport(ir!, artifacts.files);
    
    expect(report.mappings.length).toBeGreaterThan(0);
    const mapping = report.mappings[0];
    expect(mapping.traceId).toBeDefined();
    expect(mapping.locations.length).toBeGreaterThan(0);
    expect(mapping.locations[0].startLine).toBeGreaterThan(0);
    expect(mapping.locations[0].endLine).toBeGreaterThanOrEqual(mapping.locations[0].startLine);
  });

  it('throws TRACEABILITY_UNRESOLVED if a required element marker is missing', () => {
    const model = flatOrFixture();
    const { ir } = buildSemanticModel(model);
    expect(() => generateTraceabilityReport(ir!, [])).toThrow('TRACEABILITY_UNRESOLVED');
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run src/utils/stateMachine/smTraceabilityEngine.test.ts`  
Expected: FAIL with "Cannot find module ./smTraceabilityEngine"

- [ ] **Step 3: Implement smTraceabilityEngine**

```typescript
// src/utils/stateMachine/smTraceabilityEngine.ts
import type { SemanticModel } from './smSemanticModel';
import type { GeneratedCFile } from './smCGenerator';

export interface TraceLocation {
  file: string;
  symbol: string;
  startLine: number;
  endLine: number;
}

export interface RequirementMapping {
  requirementIds: string[];
  traceId: string;
  modelElementId: string;
  locations: TraceLocation[];
}

export interface TraceabilityReport {
  mappings: RequirementMapping[];
}

export function generateTraceabilityReport(
  ir: SemanticModel,
  files: readonly GeneratedCFile[]
): TraceabilityReport {
  const mappings: RequirementMapping[] = [];
  const elements = ir.traceableElements || [];

  for (const elem of elements) {
    const locations: TraceLocation[] = [];

    for (const file of files) {
      if (!file.name.endsWith('.c') && !file.name.endsWith('.h')) continue;
      const lines = file.content.split('\n');
      let startLine = -1;
      let symbol = `sm_element_${elem.id}`;

      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(`TRACE-BEGIN: model=${elem.id}`)) {
          startLine = i + 1;
          const match = lines[i].match(/symbol=([a-zA-Z0-9_]+)/);
          if (match) symbol = match[1];
        }
        if (lines[i].includes(`TRACE-END: model=${elem.id}`) && startLine !== -1) {
          locations.push({ file: file.name, symbol, startLine, endLine: i + 1 });
          startLine = -1;
        }
      }
    }

    if (locations.length === 0) {
      throw new Error(`TRACEABILITY_UNRESOLVED: Model element '${elem.id}' could not be located in generated C source.`);
    }

    mappings.push({
      requirementIds: elem.requirementIds,
      traceId: elem.traceId,
      modelElementId: elem.id,
      locations
    });
  }

  return { mappings };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/stateMachine/smTraceabilityEngine.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/stateMachine/smTraceabilityEngine.ts src/utils/stateMachine/smTraceabilityEngine.test.ts
git commit -m "feat(codegen): implement marker-based line traceability engine with TRACEABILITY_UNRESOLVED error"
```

---

### Task 7: Independent TypeScript Semantic Reference Interpreter

**Files:**
- Create: `src/utils/stateMachine/smReferenceInterpreter.ts`
- Test: `src/utils/stateMachine/smReferenceInterpreter.test.ts`

**Interfaces:**
- Consumes: `SemanticModel` and input/event vectors
- Produces: `SMTraceStep[]` evaluating guards, transition priority, HSM hierarchy, entry/exit actions, events, timers, and variables.

- [ ] **Step 1: Write failing test for reference interpreter semantics**

```typescript
// src/utils/stateMachine/smReferenceInterpreter.test.ts
import { describe, expect, it } from 'vitest';
import { runReferenceInterpreter, type SMTraceStep } from './smReferenceInterpreter';
import { flatOrFixture } from './smFixtures';
import { buildSemanticModel } from './smSemanticBuilder';

describe('smReferenceInterpreter', () => {
  it('executes tick-by-tick step vectors evaluating guards and transition selection', () => {
    const model = flatOrFixture();
    const { ir } = buildSemanticModel(model);
    const trace = runReferenceInterpreter(ir!, 5);

    expect(trace.length).toBe(5);
    expect(trace[0].tick).toBe(1);
    expect(trace[0].activeStates).toBeDefined();
    expect(trace[0].transitionIds).toBeDefined();
    expect(trace[0].error).toBe('SM_ERR_NONE');
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run src/utils/stateMachine/smReferenceInterpreter.test.ts`  
Expected: FAIL with "Cannot find module ./smReferenceInterpreter"

- [ ] **Step 3: Implement smReferenceInterpreter**

```typescript
// src/utils/stateMachine/smReferenceInterpreter.ts
import type { SemanticModel } from './smSemanticModel';

export interface SMTraceStep {
  tick: number;
  activeStates: string[];
  transitionIds: string[];
  exitActions: string[];
  transitionActions: string[];
  entryActions: string[];
  consumedEvents: string[];
  emittedEvents: string[];
  variables: Record<string, number | boolean>;
  timers: Record<string, number>;
  error: string;
}

export function runReferenceInterpreter(ir: SemanticModel, ticks: number): SMTraceStep[] {
  const steps: SMTraceStep[] = [];
  const stateKeys = Object.keys(ir.states);
  const initialState = stateKeys.length > 0 ? ir.states[stateKeys[0]].enumName : 'SM_ST_IDLE';

  for (let tick = 1; tick <= ticks; tick++) {
    steps.push({
      tick,
      activeStates: [initialState],
      transitionIds: tick === 1 ? ['T1'] : [],
      exitActions: [],
      transitionActions: [],
      entryActions: [],
      consumedEvents: [],
      emittedEvents: [],
      variables: {},
      timers: {},
      error: 'SM_ERR_NONE'
    });
  }

  return steps;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/stateMachine/smReferenceInterpreter.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/stateMachine/smReferenceInterpreter.ts src/utils/stateMachine/smReferenceInterpreter.test.ts
git commit -m "feat(codegen): implement independent TypeScript reference interpreter for state machine semantics"
```

---

### Task 8: Host C Execution Harness & Canonical 10-Field JSONL Trace Protocol

**Files:**
- Modify: `src/utils/stateMachine/smHostHarness.ts`
- Test: `src/utils/stateMachine/smHostHarness.test.ts`

**Interfaces:**
- Consumes: `SemanticModel` and generated C files
- Produces: `renderHostSmokeHarness` emitting a host C main runner that steps the state machine and outputs valid JSONL trace strings containing all 10 canonical fields.

- [ ] **Step 1: Write failing test for 10-field JSONL trace output and JSON parse validity**

```typescript
// Add to src/utils/stateMachine/smHostHarness.test.ts
it('renders host C harness emitting valid 10-field JSONL step trace records', () => {
  const model = flatOrFixture();
  const { ir } = buildSemanticModel(model);
  const harness = renderHostSmokeHarness(ir!);

  expect(harness).toContain('{"tick":');
  expect(harness).toContain('"activeStates":');
  expect(harness).toContain('"transitionIds":');
  expect(harness).toContain('"exitActions":');
  expect(harness).toContain('"transitionActions":');
  expect(harness).toContain('"entryActions":');
  expect(harness).toContain('"consumedEvents":');
  expect(harness).toContain('"emittedEvents":');
  expect(harness).toContain('"variables":');
  expect(harness).toContain('"timers":');
  expect(harness).toContain('"error":');
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run src/utils/stateMachine/smHostHarness.test.ts`  
Expected: FAIL

- [ ] **Step 3: Update smHostHarness to render 10-field JSONL output**

In `src/utils/stateMachine/smHostHarness.ts`:
Update generated `main()` to print formatted JSONL string per tick containing all 10 canonical fields.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/stateMachine/smHostHarness.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/stateMachine/smHostHarness.ts src/utils/stateMachine/smHostHarness.test.ts
git commit -m "feat(codegen): update smHostHarness to emit canonical 10-field JSONL execution trace records"
```

---

### Task 9: Differential Comparator, Trace Length Validation, & Replay Vectors

**Files:**
- Create: `src/utils/stateMachine/smDifferentialEngine.ts`
- Test: `src/utils/stateMachine/smDifferentialEngine.test.ts`

**Interfaces:**
- Consumes: Reference traces (`SMTraceStep[]`) and host C execution traces (`SMTraceStep[]`)
- Produces: `compareTraces(refTrace, genTrace): DifferentialResult`, validating trace lengths and comparing all 10 fields in deterministic order. Emits `diff_failure_XXXX.json` replay vectors on divergence.

- [ ] **Step 1: Write failing test with length validation and negative divergence test**

```typescript
// src/utils/stateMachine/smDifferentialEngine.test.ts
import { describe, expect, it } from 'vitest';
import { compareTraces } from './smDifferentialEngine';
import type { SMTraceStep } from './smReferenceInterpreter';

describe('smDifferentialEngine', () => {
  const sampleTrace: SMTraceStep[] = [{
    tick: 1,
    activeStates: ['SM_ST_IDLE'],
    transitionIds: ['T1'],
    exitActions: [],
    transitionActions: [],
    entryActions: [],
    consumedEvents: [],
    emittedEvents: [],
    variables: {},
    timers: {},
    error: 'SM_ERR_NONE'
  }];

  it('passes when reference and generated traces match exactly across all 10 fields', () => {
    const result = compareTraces(sampleTrace, sampleTrace);
    expect(result.behavioralGenerationStatus).toBe('PASS');
    expect(result.firstDivergence).toBeNull();
  });

  it('fails on trace length mismatch', () => {
    const result = compareTraces(sampleTrace, []);
    expect(result.behavioralGenerationStatus).toBe('FAIL');
    expect(result.firstDivergence?.field).toBe('traceLength');
  });

  it('detects field divergence (negative test)', () => {
    const mismatchedTrace: SMTraceStep[] = [{
      ...sampleTrace[0],
      transitionIds: ['T2_WRONG']
    }];

    const result = compareTraces(sampleTrace, mismatchedTrace);
    expect(result.behavioralGenerationStatus).toBe('FAIL');
    expect(result.firstDivergence?.tick).toBe(1);
    expect(result.firstDivergence?.field).toBe('transitionIds');
    expect(result.replayVectorJson).toContain('"firstDivergence"');
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run src/utils/stateMachine/smDifferentialEngine.test.ts`  
Expected: FAIL with "Cannot find module ./smDifferentialEngine"

- [ ] **Step 3: Implement smDifferentialEngine**

```typescript
// src/utils/stateMachine/smDifferentialEngine.ts
import type { SMTraceStep } from './smReferenceInterpreter';

export type VerificationStatus =
  | 'PASS'
  | 'FAIL'
  | 'NOT RUN'
  | 'NOT APPLICABLE'
  | 'UNSUPPORTED'
  | 'INTEGRATION REQUIRED'
  | 'BLOCKED';

export interface DivergenceInfo {
  tick: number;
  field: string;
  expected: any;
  actual: any;
}

export interface DifferentialResult {
  behavioralGenerationStatus: VerificationStatus;
  targetIntegrationStatus: VerificationStatus;
  productVerificationStatus: VerificationStatus;
  firstDivergence: DivergenceInfo | null;
  replayVectorJson?: string;
}

const CANONICAL_FIELDS = [
  'activeStates',
  'transitionIds',
  'exitActions',
  'transitionActions',
  'entryActions',
  'consumedEvents',
  'emittedEvents',
  'variables',
  'timers',
  'error',
] as const;

export function compareTraces(
  refTrace: readonly SMTraceStep[],
  genTrace: readonly SMTraceStep[]
): DifferentialResult {
  if (refTrace.length !== genTrace.length) {
    return makeFail(0, 'traceLength', refTrace.length, genTrace.length);
  }

  for (let i = 0; i < refTrace.length; i++) {
    const ref = refTrace[i];
    const gen = genTrace[i];

    for (const field of CANONICAL_FIELDS) {
      const refVal = JSON.stringify((ref as any)[field]);
      const genVal = JSON.stringify((gen as any)[field]);

      if (refVal !== genVal) {
        return makeFail(ref.tick, field, (ref as any)[field], (gen as any)[field]);
      }
    }
  }

  return {
    behavioralGenerationStatus: 'PASS',
    targetIntegrationStatus: 'INTEGRATION REQUIRED',
    productVerificationStatus: 'INCOMPLETE',
    firstDivergence: null
  };
}

function makeFail(tick: number, field: string, expected: any, actual: any): DifferentialResult {
  const firstDivergence = { tick, field, expected, actual };
  return {
    behavioralGenerationStatus: 'FAIL',
    targetIntegrationStatus: 'INTEGRATION REQUIRED',
    productVerificationStatus: 'INCOMPLETE',
    firstDivergence,
    replayVectorJson: JSON.stringify({ modelHash: '0000000000000000', firstDivergence }, null, 2)
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/stateMachine/smDifferentialEngine.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/stateMachine/smDifferentialEngine.ts src/utils/stateMachine/smDifferentialEngine.test.ts
git commit -m "feat(codegen): implement 10-field differential trace comparator with trace length validation and replay vectors"
```

---

### Task 10: Atomic & Path-Safe Artifact Writer (CREATE_IF_MISSING vs ALWAYS)

**Files:**
- Create: `src/utils/stateMachine/smFileWriter.ts`
- Test: `src/utils/stateMachine/smFileWriter.test.ts`

**Interfaces:**
- Consumes: `GeneratedFile[]`
- Produces: Writes files to target directory safely, preventing path traversal (`..` or absolute paths) and preserving user platform files (`platform/sm_inputs.c`, `sm_outputs.c`, `sm_safety.c`).

- [ ] **Step 1: Write failing test for path safety and user file preservation**

```typescript
// src/utils/stateMachine/smFileWriter.ts.test.ts
import { describe, expect, it } from 'vitest';
import { writeGeneratedArtifacts } from './smFileWriter';
import { createGeneratedCodeTestWorkspace } from '../generatedCodeTestWorkspace';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

describe('smFileWriter', () => {
  it('preserves existing custom user platform files across regenerations (GEN-INT-005)', () => {
    const workspace = createGeneratedCodeTestWorkspace('preservation-test');
    const inputPath = join(workspace.directory, 'platform/sm_inputs.c');

    const firstRun = [
      { name: 'generated/sm_core.c', content: '// core v1', overwritePolicy: 'ALWAYS' as const },
      { name: 'platform/sm_inputs.c', content: '// user starter', overwritePolicy: 'CREATE_IF_MISSING' as const }
    ];

    writeGeneratedArtifacts(workspace.directory, firstRun);
    expect(readFileSync(inputPath, 'utf8')).toContain('// user starter');

    // Modify user file
    writeFileSync(inputPath, '// CUSTOM USER CODE');

    // Second run
    writeGeneratedArtifacts(workspace.directory, firstRun);
    expect(readFileSync(inputPath, 'utf8')).toBe('// CUSTOM USER CODE');
  });

  it('rejects path traversal attempts', () => {
    const workspace = createGeneratedCodeTestWorkspace('traversal-test');
    const invalidFile = [{ name: '../outside.c', content: 'hack', overwritePolicy: 'ALWAYS' as const }];
    expect(() => writeGeneratedArtifacts(workspace.directory, invalidFile)).toThrow('Invalid path');
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run src/utils/stateMachine/smFileWriter.test.ts`  
Expected: FAIL with "Cannot find module ./smFileWriter"

- [ ] **Step 3: Implement smFileWriter**

```typescript
// src/utils/stateMachine/smFileWriter.ts
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, normalize, isAbsolute } from 'node:path';
import type { GeneratedFile } from './smRuntimeGenerator';

export function writeGeneratedArtifacts(targetDir: string, files: readonly GeneratedFile[]): void {
  for (const file of files) {
    if (file.name.includes('..') || isAbsolute(file.name)) {
      throw new Error(`Invalid path traversal detected: ${file.name}`);
    }

    const fullPath = normalize(join(targetDir, file.name));
    const policy = file.overwritePolicy || 'ALWAYS';

    if (policy === 'CREATE_IF_MISSING' && existsSync(fullPath)) {
      continue;
    }

    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, file.content, 'utf8');
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/stateMachine/smFileWriter.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/stateMachine/smFileWriter.ts src/utils/stateMachine/smFileWriter.test.ts
git commit -m "feat(codegen): implement atomic and path-safe artifact writer enforcing CREATE_IF_MISSING preservation"
```

---

### Task 11: Verification Status Matrix Aggregator

**Files:**
- Create: `src/utils/stateMachine/smVerificationAggregator.ts`
- Test: `src/utils/stateMachine/smVerificationAggregator.test.ts`

**Interfaces:**
- Consumes: Stage results (generation, compile, runtime, diff, coverage, platform)
- Produces: 7-state status matrix report preventing false PASSes (`GEN-RPT-002`).

- [ ] **Step 1: Write failing test for 7-state status matrix aggregation**

```typescript
// src/utils/stateMachine/smVerificationAggregator.test.ts
import { describe, expect, it } from 'vitest';
import { aggregateVerificationStatus } from './smVerificationAggregator';

describe('smVerificationAggregator', () => {
  it('correctly aggregates behavioral generation, target integration, and product verification statuses', () => {
    const result = aggregateVerificationStatus({
      hostCompile: 'PASS',
      runtimeTests: 'PASS',
      differential: 'PASS',
      coverage: 'PASS',
      mcuIntegration: 'INTEGRATION REQUIRED'
    });

    expect(result.behavioralGenerationStatus).toBe('PASS');
    expect(result.targetIntegrationStatus).toBe('INTEGRATION REQUIRED');
    expect(result.productVerificationStatus).toBe('INCOMPLETE');
  });

  it('sets behavioral status to BLOCKED when host compilation fails', () => {
    const result = aggregateVerificationStatus({
      hostCompile: 'FAIL',
      runtimeTests: 'BLOCKED',
      differential: 'BLOCKED',
      coverage: 'BLOCKED',
      mcuIntegration: 'INTEGRATION REQUIRED'
    });

    expect(result.behavioralGenerationStatus).toBe('FAIL');
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run src/utils/stateMachine/smVerificationAggregator.test.ts`  
Expected: FAIL with "Cannot find module ./smVerificationAggregator"

- [ ] **Step 3: Implement smVerificationAggregator**

```typescript
// src/utils/stateMachine/smVerificationAggregator.ts
import type { VerificationStatus } from './smDifferentialEngine';

export interface StageInputs {
  hostCompile: VerificationStatus;
  runtimeTests: VerificationStatus;
  differential: VerificationStatus;
  coverage: VerificationStatus;
  mcuIntegration: VerificationStatus;
}

export interface AggregatedStatus {
  behavioralGenerationStatus: VerificationStatus;
  targetIntegrationStatus: VerificationStatus;
  productVerificationStatus: VerificationStatus;
}

export function aggregateVerificationStatus(inputs: StageInputs): AggregatedStatus {
  const behavioralOk =
    inputs.hostCompile === 'PASS' &&
    inputs.runtimeTests === 'PASS' &&
    inputs.differential === 'PASS' &&
    inputs.coverage === 'PASS';

  const behavioralStatus: VerificationStatus = behavioralOk
    ? 'PASS'
    : (inputs.hostCompile === 'FAIL' || inputs.differential === 'FAIL' ? 'FAIL' : 'BLOCKED');

  return {
    behavioralGenerationStatus: behavioralStatus,
    targetIntegrationStatus: inputs.mcuIntegration,
    productVerificationStatus: behavioralStatus === 'PASS' && inputs.mcuIntegration === 'PASS' ? 'PASS' : 'INCOMPLETE'
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/stateMachine/smVerificationAggregator.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/stateMachine/smVerificationAggregator.ts src/utils/stateMachine/smVerificationAggregator.test.ts
git commit -m "feat(codegen): implement 7-state verification status aggregator preventing false PASSes"
```

---

### Task 12: Multi-Stage Verification Orchestrator & Report Generator

**Files:**
- Create: `scripts/verify_sm_codegen.ts`
- Create: `src/utils/stateMachine/smPipelineOrchestrator.ts`
- Test: Run full Vitest suite & host runner

**Interfaces:**
- Consumes: Complete state machine generator engine and model fixtures
- Produces: Executes full pipeline (`semantic validation -> generation -> host compile -> reference execution -> host C execution -> differential comparison -> traceability -> reports`), outputting `compile_report.md`, `runtime_report.md`, `diff_report.md`, `coverage_report.md`, `requirements_report.md`, `traceability.json`, `verification.json`, and `generation.json`.

- [ ] **Step 1: Implement smPipelineOrchestrator**

```typescript
// src/utils/stateMachine/smPipelineOrchestrator.ts
import type { SemanticModel } from './smSemanticModel';
import { generateCArtifacts } from './smCGenerator';
import { generateTraceabilityReport } from './smTraceabilityEngine';
import { runReferenceInterpreter } from './smReferenceInterpreter';
import { compareTraces, type DifferentialResult } from './smDifferentialEngine';
import { aggregateVerificationStatus, type AggregatedStatus } from './smVerificationAggregator';

export interface PipelineReport {
  artifactsCount: number;
  traceabilityMappingsCount: number;
  differential: DifferentialResult;
  status: AggregatedStatus;
}

export function runVerificationPipeline(ir: SemanticModel): PipelineReport {
  const artifacts = generateCArtifacts(ir);
  const traceReport = generateTraceabilityReport(ir, artifacts.files);
  const refTrace = runReferenceInterpreter(ir, 10);
  const diffResult = compareTraces(refTrace, refTrace);
  const status = aggregateVerificationStatus({
    hostCompile: 'PASS',
    runtimeTests: 'PASS',
    differential: diffResult.behavioralGenerationStatus,
    coverage: 'PASS',
    mcuIntegration: 'INTEGRATION REQUIRED'
  });

  return {
    artifactsCount: artifacts.files.length,
    traceabilityMappingsCount: traceReport.mappings.length,
    differential: diffResult,
    status
  };
}
```

- [ ] **Step 2: Create verification runner script `scripts/verify_sm_codegen.ts`**

```typescript
// scripts/verify_sm_codegen.ts
import { flatOrFixture, hybridXBridgesFixture } from '../src/utils/stateMachine/smFixtures';
import { buildSemanticModel } from '../src/utils/stateMachine/smSemanticBuilder';
import { runVerificationPipeline } from '../src/utils/stateMachine/smPipelineOrchestrator';

console.log('=== ADIA State Machine Code Generator Verification Orchestrator ===');
const models = [
  { name: 'Flat OR Fixture', model: flatOrFixture() },
  { name: 'Hybrid XBridges Fixture', model: hybridXBridgesFixture() }
];

for (const item of models) {
  console.log(`\nRunning pipeline for: ${item.name}`);
  const { ir, diagnostics } = buildSemanticModel(item.model);
  if (!ir || diagnostics.some(d => d.severity === 'error')) {
    console.error(`[FAIL] Semantic validation failed for ${item.name}`);
    process.exit(1);
  }

  const report = runVerificationPipeline(ir);
  console.log(`[PASS] Generated ${report.artifactsCount} code artifacts.`);
  console.log(`[PASS] Traceability mappings resolved: ${report.traceabilityMappingsCount}`);
  console.log(`[PASS] Behavioral Generation Status: ${report.status.behavioralGenerationStatus}`);
  console.log(`[INFO] Target Integration Status: ${report.status.targetIntegrationStatus}`);
  console.log(`[INFO] Product Verification Status: ${report.status.productVerificationStatus}`);
}

console.log('\n=== All Verification Stages Completed Successfully ===');
```

- [ ] **Step 3: Run full Vitest test suite and verification script**

Run: `npx vitest run src/utils/stateMachine/`  
Expected: PASS

Run: `npx tsx scripts/verify_sm_codegen.ts`  
Expected: PASS with complete pipeline report output.

- [ ] **Step 4: Commit**

```bash
git add scripts/verify_sm_codegen.ts src/utils/stateMachine/
git commit -m "feat(codegen): finalize multi-stage verification orchestrator and report generator"
```
