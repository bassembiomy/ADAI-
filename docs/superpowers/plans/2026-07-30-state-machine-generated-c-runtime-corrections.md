# State Machine Generated-C Runtime Corrections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **SUPERSEDED HISTORY TASK — DO NOT EXECUTE TASK 1:** The original Task 1
> required a transition to target the history-junction UUID directly. Official
> Stateflow semantics instead apply contained history when a transition
> reenters the owning state. Use
> `docs/STATE_MACHINE_CODE_GENERATION_CORRECTIONS.md` as the authoritative
> correction and regenerate Task 1 before implementation. Tasks 2–5 remain
> applicable.

**Goal:** Make history linkage, empty-layer validation, instance initialization, and generated verification reports safe and behaviorally accurate in the generic semantic C generator.

**Architecture:** Validate history connectivity before semantic IR construction, allocate active slots only to non-empty OR layers, and retain generated-C consistency checks as defense in depth. Initialize the complete caller-owned instance before entry actions, and derive report validation mode solely from recorded evidence.

**Tech Stack:** TypeScript, Vitest, generated ISO C99, GCC host compilation, semantic IR/interpreter differential harness.

## Global Constraints

- Preserve simulator/generated-C behavioral parity.
- Do not silently create transitions, select a history owner, or delete model elements.
- Do not change the public `SM_Init(ADIA_Instance_t *)` signature.
- Trace sinks are registered only after `SM_Init()`.
- Do not claim dynamic reachability unless executable evidence was recorded.
- Preserve all unrelated dirty-worktree changes and stage only task-owned hunks.
- Generated C must compile with `gcc -std=c99 -pedantic-errors -Wall -Wextra -Werror`.

## Architectural Review Addendum

The review of package `generated_code_1785409396761` is incorporated as
follows:

| Review finding | Requirement | Plan task | Generator-level correction |
|---|---|---:|---|
| History restore helpers exist but are unreachable | `REQ-GEN-HIS-001`, `REQ-GEN-HIS-002` | Replacement Task 1 required | Treat history as a feature of its owning state: reentry to the state restores the runtime-recorded child, first entry uses the default child, and explicit junction targets remain supported. |
| Empty child layer owned by `State_2` faults | `REQ-GEN-SAF-001`, `REQ-GEN-SAF-002` | 2 | Allocate no slot to an empty OR layer and emit constant `SM_Layer_Has_Children` metadata. This is deterministic O(1) validation and avoids the review patch's repeated runtime scan across every state. |
| `SM_Init()` leaves extension fields vulnerable | `REQ-GEN-INIT-001` | 3 | Emit `<string.h>` and clear the complete instance immediately after the null guard, then assign semantic non-zero/sentinel defaults before entry. |
| Static reachability appears beside unexecuted host gates | `REQ-GEN-REP-001`, `REQ-GEN-REP-002` | 4 | Display `Execution mode: STATIC_ANALYSIS_ONLY`, separate Static AST reachability from Dynamic executable reachability, and derive stronger modes only from recorded evidence. |

The direct C snippets in the review are treated as expected generated output,
not as files to patch manually. All corrections are made in the TypeScript
semantic analyzer and C/report templates so every future generated package
receives the fix.

---

### Task 1: Reject Unwired History Junctions

**Files:**
- Modify: `src/utils/stateMachine/smSemanticValidator.ts:655-684`
- Modify: `src/utils/stateMachine/smSemanticBuilder.test.ts`
- Create: `src/utils/stateMachine/smRuntimeCorrections.test.ts`

**Interfaces:**
- Consumes: `validateModelStructure(model: StateMachineModelV4): ModelDiagnostic[]`
- Produces: diagnostic code `HISTORY_INCOMING_TRANSITION_MISSING`

- [ ] **Step 1: Write failing semantic-validation tests**

Add these tests to `smSemanticBuilder.test.ts`:

```ts
it.each(['shallow', 'deep'] as const)(
  'rejects an unwired %s history junction',
  (kind) => {
    const model = historyFixture(kind);
    const historyId = `${kind}_history`;
    model.transitions = model.transitions.filter(
      (transition) => transition.targetId !== historyId,
    );
    for (const layer of model.layers) {
      layer.transitionIds = layer.transitionIds.filter(
        (transitionId) => model.transitions.some(
          (transition) => transition.id === transitionId,
        ),
      );
    }

    expect(diagnosticCodes(model)).toContain(
      'HISTORY_INCOMING_TRANSITION_MISSING',
    );
  },
);

it('accepts history reached from a decision junction', () => {
  const model = historyFixture('shallow');
  const restore = model.transitions.find(
    (transition) => transition.id === 'restore_workspace',
  )!;
  restore.targetId = 'history_decision';
  model.junctions.push({
    ...model.junctions[0],
    id: 'history_decision',
    name: 'history_decision',
    type: 'junction',
  });
  model.transitions.push({
    ...restore,
    id: 'decision_to_history',
    sourceId: 'history_decision',
    targetId: 'shallow_history',
    condition: '',
    order: restore.order + 1,
  });
  model.layers[0].junctionIds.push('history_decision');
  model.layers[0].transitionIds.push('decision_to_history');

  expect(diagnosticCodes(model)).not.toContain(
    'HISTORY_INCOMING_TRANSITION_MISSING',
  );
});
```

Add `historyFixture` to the existing fixture import.

- [ ] **Step 2: Add a compiled history-linkage characterization test**

Create `smRuntimeCorrections.test.ts` with a reusable real-C helper:

```ts
import { writeFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { createGeneratedCodeTestWorkspace } from '../generatedCodeTestWorkspace';
import { compileAndRunCProgram } from './smCHarness';
import { generateCArtifacts, renderCoreSource } from './smCGenerator';
import { flatOrFixture, historyFixture } from './smFixtures';
import { buildSemanticModel } from './smSemanticBuilder';
import type { SemanticModel } from './smSemanticModel';

const build = (model: ReturnType<typeof flatOrFixture>): SemanticModel => {
  const result = buildSemanticModel(model);
  if (result.ir === undefined) {
    throw new Error(`fixture failed to build: ${JSON.stringify(result.diagnostics)}`);
  }
  return result.ir;
};

const compileAndRun = (
  ir: SemanticModel,
  harnessSource: string,
  defines: readonly string[] = [],
): string => {
  const workspace = createGeneratedCodeTestWorkspace('runtime-corrections');
  try {
    for (const file of generateCArtifacts(ir).files) {
      if (file.name.endsWith('.c') || file.name.endsWith('.h')) {
        writeFileSync(join(workspace.directory, file.name), file.content);
      }
    }
    return compileAndRunCProgram({
      directory: workspace.directory,
      harnessSource,
      defines,
    }) ?? '';
  } finally {
    workspace.cleanup();
  }
};

describe('generated-C runtime corrections', { timeout: 60_000 }, () => {
  it.each(['shallow', 'deep'] as const)(
    'links a %s history transition to executable restoration',
    (kind) => {
      const ir = build(historyFixture(kind));
      const core = renderCoreSource(ir);
      expect(core).toContain('SM_Restore_State');
      const output = compileAndRun(ir, `#include "sm_core.h"
#include <stdio.h>
int main(void) {
    ADIA_Instance_t instance;
    (void)SM_Init(&instance);
    instance.data.select_a = true;
    (void)SM_Step(&instance, SM_TICK_MS);
    instance.data.select_a = false;
    instance.data.leave = true;
    (void)SM_Step(&instance, SM_TICK_MS);
    instance.data.leave = false;
    instance.data.go = true;
    (void)SM_Step(&instance, SM_TICK_MS);
    printf("%u\\n",
        instance.state_active[SM_ST_PARENT_A_IDX] ? 1U : 0U);
    return 0;
}
`);
      expect(output.trim()).toBe('1');
    },
  );
});
```

The compiled characterization tests should already pass; they prove
`REQ-GEN-HIS-001` is present when the graph is wired.

- [ ] **Step 3: Run the tests and verify RED**

Run:

```powershell
npx vitest run src/utils/stateMachine/smSemanticBuilder.test.ts src/utils/stateMachine/smRuntimeCorrections.test.ts -t "unwired|decision junction|history transition" --reporter=verbose
```

Expected: the shallow and deep unwired cases fail because the diagnostic is
absent; the decision-junction and compiled restoration cases pass.

- [ ] **Step 4: Add incoming-edge validation**

At the start of `validateHistory()` create:

```ts
const incomingTargetIds = new Set(
  model.transitions.map((transition) => transition.targetId),
);
```

Inside the history-junction loop, after ownership validation, add:

```ts
if (!incomingTargetIds.has(junction.id)) {
  diagnostics.push(diagnostic(
    'HISTORY_INCOMING_TRANSITION_MISSING',
    `History junction '${junction.id}' requires at least one incoming transition.`,
    junction.id,
  ));
}
```

- [ ] **Step 5: Run the tests and verify GREEN**

Run:

```powershell
npx vitest run src/utils/stateMachine/smSemanticBuilder.test.ts src/utils/stateMachine/smRuntimeCorrections.test.ts --reporter=dot
```

Expected: all semantic-builder tests pass.

- [ ] **Step 6: Commit Task 1**

```powershell
git add -- src/utils/stateMachine/smSemanticValidator.ts src/utils/stateMachine/smSemanticBuilder.test.ts src/utils/stateMachine/smRuntimeCorrections.test.ts
git commit -m "fix(generator): reject unwired history junctions"
```

---

### Task 2: Remove Empty-Layer Slots and Prevent False Configuration Faults

**Files:**
- Modify: `src/utils/stateMachine/smSemanticBuilder.ts:95-111`
- Modify: `src/utils/stateMachine/smSemanticBuilder.test.ts`
- Modify: `src/utils/stateMachine/smCGenerator.ts:942-1084`
- Modify: `src/utils/stateMachine/smRuntimeCorrections.test.ts`

**Interfaces:**
- Consumes: `SemanticLayer.children`, `SemanticLayer.activeSlot`
- Produces: empty OR layers with `activeSlot === null`; generated `SM_Layer_Has_Children`

- [ ] **Step 1: Write the failing slot-allocation test**

Add:

```ts
it('does not allocate an active slot to an empty child layer', () => {
  const model = flatOrFixture();
  model.layers.push({
    ...model.layers[0],
    id: 'empty_leaf_layer',
    name: 'empty_leaf_layer',
    parentStateId: 'b',
    stateIds: [],
    transitionIds: [],
    junctionIds: [],
    decomposition: 'OR',
  });

  const result = buildSemanticModel(model);

  expect(result.diagnostics).toEqual([]);
  expect(result.ir!.layers.empty_leaf_layer.activeSlot).toBeNull();
  expect(result.ir!.activeSlotCount).toBe(1);
});
```

- [ ] **Step 2: Write the failing compiled-runtime test**

In `smRuntimeCorrections.test.ts`, build a flat OR model, attach the empty child
layer to state `b`, and execute:

```c
#include "sm_core.h"
#include "sm_safety.h"
#include <stdio.h>
int main(void) {
    ADIA_Instance_t instance;
    (void)SM_Init(&instance);
    instance.data.go = true;
    (void)SM_Step(&instance, SM_TICK_MS);
    instance.data.go = false;
    (void)SM_Step(&instance, SM_TICK_MS);
    printf("%u %u\n",
        SM_GetError(&instance) == SM_ERR_NONE ? 1U : 0U,
        instance.fault_latched ? 1U : 0U);
    return 0;
}
```

Assert:

```ts
expect(output.trim()).toBe('1 0');
```

Also assert the rendered safety source contains:

```ts
expect(safety).toContain('SM_Layer_Has_Children');
```

- [ ] **Step 3: Run the tests and verify RED**

Run:

```powershell
npx vitest run src/utils/stateMachine/smSemanticBuilder.test.ts src/utils/stateMachine/smRuntimeCorrections.test.ts -t "empty" --reporter=verbose
```

Expected: slot allocation reports `2`/non-null, and the runtime reaches
`SM_ERR_CONFIGURATION`.

- [ ] **Step 4: Stop allocating slots to empty OR layers**

Replace the allocator condition with:

```ts
if (layer.decomposition === 'OR' && layer.stateIds.length > 0) {
  slots.set(layerId, nextSlot);
  nextSlot += 1;
} else {
  slots.set(layerId, null);
}
```

- [ ] **Step 5: Add generated safety defense in depth**

In `renderSafetySource()`, emit:

```ts
'static const bool SM_Layer_Has_Children[SM_NUM_LAYERS] = {',
...layers.map((layer) =>
  `    [${layerMacro(layer)}] = ${layer.children.length > 0 ? 'true' : 'false'},`),
'};',
```

Change the configuration branch from:

```c
if (container_active) {
```

to:

```c
if (container_active && SM_Layer_Has_Children[layer_index]) {
```

Keep the inactive-slot check as a separate branch:

```c
} else if ((!container_active) && (active_slot >= 0)
    && (instance->active_states[(uint32_t)active_slot] != SM_NODE_INVALID)) {
```

History ownership validation remains outside this child-configuration branch.

- [ ] **Step 6: Run focused and existing corruption tests**

Run:

```powershell
npx vitest run src/utils/stateMachine/smSemanticBuilder.test.ts src/utils/stateMachine/smRuntimeCorrections.test.ts src/utils/stateMachine/smCGenerator.test.ts -t "empty|missing active children|history outside" --reporter=verbose
```

Expected: empty-layer tests pass and genuine OR/AND/history corruption tests
still pass.

- [ ] **Step 7: Commit Task 2 without unrelated generator hunks**

Inspect before staging:

```powershell
git diff -- src/utils/stateMachine/smCGenerator.ts
```

Temporarily remove only this pre-existing hunk before staging:

```ts
'#ifdef SM_TRACE_ENABLED',
'    instance->trace_sink = NULL;',
'#endif',
```

Then stage Task 2:

```powershell
git add -- src/utils/stateMachine/smSemanticBuilder.ts src/utils/stateMachine/smSemanticBuilder.test.ts src/utils/stateMachine/smRuntimeCorrections.test.ts
git add -- src/utils/stateMachine/smCGenerator.ts
git diff --cached --check
git commit -m "fix(generator): ignore empty child-layer slots"
```

Immediately restore the exact `trace_sink = NULL` hunk to the working tree for
Task 3. Do not reset the file.

---

### Task 3: Guarantee Safe Initialization and Trace Lifecycle

**Files:**
- Modify: `src/utils/stateMachine/smCGenerator.ts:1265-1350`
- Modify: `src/utils/stateMachine/smCHarness.ts:543-568`
- Modify: `src/utils/stateMachine/smRuntimeCorrections.test.ts`

**Interfaces:**
- Consumes: caller-owned `ADIA_Instance_t *instance`
- Produces: `SM_Init()` with a full clear before entry; post-init `SM_SetTraceSink()`

- [ ] **Step 1: Write the failing source-order test**

Add:

```ts
it('clears the complete instance before any initialization action', () => {
  const source = renderCoreSource(build(flatOrFixture()));
  const init = source.slice(
    source.indexOf('SM_Error_t SM_Init'),
    source.indexOf('SM_Error_t SM_Reset'),
  );
  const nullGuardEnd = init.indexOf('    }', init.indexOf('if (instance == NULL)'));
  const clearAt = init.indexOf('(void)memset(instance, 0, sizeof(*instance));');
  const firstEntryAt = init.indexOf('SM_Enter_Layer_Default');

  expect(source).toContain('#include <string.h>');
  expect(clearAt).toBeGreaterThan(nullGuardEnd);
  expect(clearAt).toBeLessThan(firstEntryAt);
  expect(init.slice(nullGuardEnd + 5, clearAt).trim()).toBe('');
});
```

- [ ] **Step 2: Write the failing trace-lifecycle runtime test**

Using the existing `compileAndRun()` helper, generate with
`SM_TRACE_ENABLED`, initialize storage to non-zero bytes, call `SM_Init()`,
register the sink, trigger one transition action, and assert one post-init
event:

```c
static unsigned trace_count;
static void trace_sink(const SM_TraceEvent_t *event) {
    if (event != NULL) {
        ++trace_count;
    }
}

int main(void) {
    ADIA_Instance_t instance;
    (void)memset(&instance, 0xA5, sizeof(instance));
    (void)SM_Init(&instance);
    SM_SetTraceSink(&instance, trace_sink);
    instance.data.go = true;
    (void)SM_Step(&instance, SM_TICK_MS);
    printf("%u %u\n",
        SM_GetError(&instance) == SM_ERR_NONE ? 1U : 0U,
        trace_count);
    return 0;
}
```

Assert initialization does not crash and `trace_count` reflects only the
post-init transition action.

- [ ] **Step 3: Run the tests and verify RED**

Run:

```powershell
npx vitest run src/utils/stateMachine/smRuntimeCorrections.test.ts -t "clears|trace lifecycle" --reporter=verbose
```

Expected: source-order test fails because `memset` is absent; runtime test is
not accepted as sufficient until source ordering passes.

- [ ] **Step 4: Emit the complete clear**

Add to the generated include list:

```ts
'#include <string.h>',
```

Immediately after the null guard in `SM_Init()` emit:

```ts
'    (void)memset(instance, 0, sizeof(*instance));',
```

Retain the explicit trace assignment before root entry:

```ts
'#ifdef SM_TRACE_ENABLED',
'    instance->trace_sink = NULL;',
'#endif',
```

This existing local hunk is in scope for Issue 3 only after the new tests prove
its ordering and behavior.

- [ ] **Step 5: Register differential tracing after initialization**

In the generated harness ordering, replace:

```c
SM_SetTraceSink(&instance, trace_sink);
SM_Init(&instance);
```

with:

```c
SM_Init(&instance);
SM_SetTraceSink(&instance, trace_sink);
```

Do not introduce a second initialization API.

- [ ] **Step 6: Run initialization, trace, and differential tests**

Run:

```powershell
npx vitest run src/utils/stateMachine/smRuntimeCorrections.test.ts src/utils/stateMachine/smDifferential.test.ts --reporter=dot
```

Expected: all tests pass with no host crash and simulator/C frames remain
equivalent.

- [ ] **Step 7: Commit Task 3**

```powershell
git add -- src/utils/stateMachine/smRuntimeCorrections.test.ts src/utils/stateMachine/smCHarness.ts
git add -- src/utils/stateMachine/smCGenerator.ts
git diff --cached --check
git commit -m "fix(generator): clear instances before state entry"
```

---

### Task 4: Distinguish Static and Dynamic Verification Evidence

**Files:**
- Modify: `src/utils/stateMachine/smReports.ts`
- Modify: `src/utils/stateMachine/smReports.test.ts`
- Update: `src/utils/__snapshots__/stateMachineCodeGenerator.golden.test.ts.snap`

**Interfaces:**
- Consumes: `VerificationEvidence`
- Produces: `ValidationMode = 'VALIDATION_FAILED' | 'DYNAMIC_EXECUTION_VERIFIED' | 'STATIC_ANALYSIS_ONLY'`

- [ ] **Step 1: Write failing report-mode tests**

Add:

```ts
it('labels the default package as static analysis only', () => {
  const rendered = renderTestingReport(analyzedUnreachableFixture());

  expect(rendered).toContain('Execution mode: STATIC_ANALYSIS_ONLY');
  expect(rendered).toContain('Static AST reachability: 66.7%');
  expect(rendered).toContain('Dynamic executable reachability: NOT RUN');
});

it('reports dynamic verification only after host compile and runtime pass', () => {
  const rendered = renderTestingReport(analyzedUnreachableFixture(), {
    structural: 'pass',
    semantic: 'pass',
    hostCompile: 'pass',
    hostRuntime: 'pass',
    differential: 'not-run',
    embeddedCompile: 'not-run',
    targetHardware: 'pending',
  });

  expect(rendered).toContain('Execution mode: DYNAMIC_EXECUTION_VERIFIED');
  expect(rendered).toContain('Dynamic executable reachability: PASS');
});

it('reports a failed mode when any recorded evidence fails', () => {
  const rendered = renderTestingReport(analyzedUnreachableFixture(), {
    structural: 'pass',
    semantic: 'pass',
    hostCompile: 'fail',
    hostRuntime: 'not-run',
    differential: 'not-run',
    embeddedCompile: 'not-run',
    targetHardware: 'pending',
  });

  expect(rendered).toContain('Execution mode: VALIDATION_FAILED');
});
```

- [ ] **Step 2: Run the report tests and verify RED**

Run:

```powershell
npx vitest run src/utils/stateMachine/smReports.test.ts --reporter=verbose
```

Expected: three new assertions fail because validation mode and reachability
distinction are absent.

- [ ] **Step 3: Add evidence-derived report modes**

Add:

```ts
export type ValidationMode =
  | 'VALIDATION_FAILED'
  | 'DYNAMIC_EXECUTION_VERIFIED'
  | 'STATIC_ANALYSIS_ONLY';

const validationMode = (
  evidence: VerificationEvidence,
): ValidationMode => {
  if (Object.values(evidence).includes('fail')) {
    return 'VALIDATION_FAILED';
  }
  if (evidence.hostCompile === 'pass' && evidence.hostRuntime === 'pass') {
    return 'DYNAMIC_EXECUTION_VERIFIED';
  }
  return 'STATIC_ANALYSIS_ONLY';
};

const dynamicReachabilityLabel = (
  evidence: VerificationEvidence,
): string =>
  evidence.hostCompile === 'fail' || evidence.hostRuntime === 'fail'
    ? 'FAIL'
    : evidence.hostCompile === 'pass' && evidence.hostRuntime === 'pass'
      ? 'PASS'
      : 'NOT RUN';
```

At the top of `renderTestingReport()` output add:

```md
## Summary

- Execution mode: ${validationMode(report.evidence)}
- Static AST reachability: ${section.reachabilityPercent.toFixed(1)}%
- Dynamic executable reachability: ${dynamicReachabilityLabel(report.evidence)}
```

Rename the structural section's existing `State reachability` label to
`Static AST reachability`.

- [ ] **Step 4: Run report tests and update the intentional snapshot**

```powershell
npx vitest run src/utils/stateMachine/smReports.test.ts --reporter=dot
npx vitest run src/utils/stateMachineCodeGenerator.golden.test.ts -u
```

Expected: report tests and two golden tests pass; only report wording changes
in the snapshot.

- [ ] **Step 5: Commit Task 4**

```powershell
git add -- src/utils/stateMachine/smReports.ts src/utils/stateMachine/smReports.test.ts src/utils/__snapshots__/stateMachineCodeGenerator.golden.test.ts.snap
git diff --cached --check
git commit -m "fix(reports): distinguish static and dynamic reachability"
```

---

### Task 5: Full Regression, Review, and Handoff

**Files:**
- Update: `src/generated/stateMachineRuntimeBundle.ts`
- Verify: all Task 1–4 files

**Interfaces:**
- Consumes: verified semantic generator and generated runtime
- Produces: rebuilt embedded runtime bundle and final evidence

- [ ] **Step 1: Rebuild the runtime bundle**

```powershell
npm run build:sm-runtime
```

Expected: exit 0 and only the intentional bundled generator change.

- [ ] **Step 2: Run the full state-machine suite**

```powershell
npx vitest run src/utils/stateMachine src/utils/stateMachineCodeGenerator.test.ts src/utils/stateMachineCodeGenerator.phase2.test.ts src/utils/stateMachineCodeGenerator.behavior.test.ts src/utils/stateMachineCodeGenerator.golden.test.ts src/utils/smAnalysisEngine.test.ts --reporter=dot
```

Expected: all tests pass.

- [ ] **Step 3: Run HIL and TypeScript gates**

```powershell
npx vitest run src/engine/hil --reporter=dot
npx tsc --noEmit
```

Expected: all HIL tests pass and TypeScript exits 0.

- [ ] **Step 4: Run generated strict-C99 and differential focus**

```powershell
npx vitest run src/utils/stateMachine/smRuntimeCorrections.test.ts src/utils/stateMachine/smDifferential.test.ts src/utils/stateMachine/smStandaloneRuntime.test.ts --reporter=dot
```

Expected: all compiled runtime and frame-parity tests pass.

- [ ] **Step 5: Inspect scope and request review**

```powershell
git diff --check -- src/utils/stateMachine src/utils/stateMachineCodeGenerator.ts src/utils/__snapshots__/stateMachineCodeGenerator.golden.test.ts.snap src/generated/stateMachineRuntimeBundle.ts
git status --short
git log --oneline 8375b93..HEAD
```

Confirm that unrelated `BlockDefinitions`, model-migration, scratch, icon, and
local generator-test changes remain unstaged unless explicitly incorporated by
a Task 1–4 test and reviewed.

- [ ] **Step 6: Commit the rebuilt bundle if it changed**

```powershell
git add -- src/generated/stateMachineRuntimeBundle.ts
git commit -m "build(state-machine): refresh corrected runtime bundle"
```

If `git diff --exit-code -- src/generated/stateMachineRuntimeBundle.ts`
returns 0, skip this commit.

- [ ] **Step 7: Perform final independent review**

Review the range `8375b93..HEAD` against all eight requirement IDs, with
Critical/Important findings blocking completion. Re-run affected focused tests
after any correction, then repeat the full verification gate.
