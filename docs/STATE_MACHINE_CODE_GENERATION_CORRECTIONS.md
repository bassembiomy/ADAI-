# ADIA State-Machine Code-Generation Corrections

## Document Status

**Status:** Implemented and verified on 2026-07-30.

**Scope:** Generic state-machine semantic analysis, generated C99 runtime,
safety validation, initialization, and generated verification reports.

**Reference behavior:** MATLAB/Simulink Stateflow-style hierarchical execution,
including OR/AND decomposition, internal transitions, shallow history, deep
history, and deterministic initialization.

## Objectives

The generator must:

1. Produce generated C behavior that matches application simulation.
2. Restore shallow and deep history on reentry to the containing state, while
   also supporting explicit transitions to the history junction.
3. Avoid false safety faults when leaf states have empty child-layer metadata.
4. Initialize caller-owned runtime storage before entry or trace actions.
5. Clearly distinguish static analysis from executed runtime verification.
6. Apply corrections in the generator, not by manually editing generated C.

---

## Correction 1: Stateflow-Compatible History Entry

### Observed Problem

Generated `sm_core.c` contains:

- `history_states`
- `deep_history`
- history-recording logic
- `SM_Restore_State_*()` helper functions

In the reviewed generated package, the restore helpers are referenced only by
unused-function casts inside `SM_Init()`:

```c
(void)SM_Restore_State_1;
(void)SM_Restore_State_2;
```

The model has a valid transition from `State_2` to the containing state
`State_1`, but the generator enters `State_1` through its default child instead
of applying the history feature contained by `State_1`.

### Root Cause

The generator currently restores history only when a transition directly
targets the history-junction UUID. That is incomplete for Stateflow-compatible
semantics. A history junction belongs to a containing state and records that
state's active substate. When a transition reenters the containing state, the
state must use its history configuration automatically. Directly targeting the
history junction remains valid for explicit inner-transition behavior, but it
is not required for ordinary reentry.

### Required Generator Corrections

#### REQ-GEN-HIS-001: Containing-State History Binding

When a transition targets a state that owns a shallow or deep history junction,
semantic normalization must mark the destination as history-aware:

```ts
transition.targetId === historyOwnerState.id
historyOwnerState.childLayerIds contains historyJunction.layerId
```

The semantic route must retain both:

```ts
destinationStateId: historyOwnerState.id
destinationKind: 'history'
destinationJunctionId: historyJunction.id
```

The C emitter must then:

1. Exit the current configuration while recording history.
2. Enter the containing state.
3. Restore the recorded child configuration.
4. Use shallow restoration for `$H$`.
5. Use recursive descendant restoration for `$H^*$`.
6. Use the layer's normal default entry if no history has been recorded yet.

The generic restoration path must use the runtime-recorded child. It must not
hard-code a compile-time child or parent as though the saved configuration were
known during generation.

Expected generated behavior:

```c
/* Transition actions and owner entry occur first. */
SM_Enter_Deep_Owner(instance);

/* Restore the actual recorded child of the history layer. */
if (instance->history_states[HISTORY_SLOT] == SM_ST_CHILD_A) {
    SM_Enter_Deep_Child_A(instance);
} else if (instance->history_states[HISTORY_SLOT] == SM_ST_CHILD_B) {
    SM_Enter_Deep_Child_B(instance);
} else {
    SM_Enter_Layer_Default_HistoryLayer(instance);
}
```

Deep history must restore the recorded descendant configuration through the
existing `SM_Restore_State_*()` helpers.

#### REQ-GEN-HIS-002: Stateflow-Compatible Linkage Validation

The generator must not require:

```ts
transition.targetId === historyJunction.id
```

as a condition for using history. A history junction is linked when its
containing state is a valid transition destination. Explicit transitions to the
junction are also supported.

`HISTORY_JUNCTION_UNWIRED` must therefore be removed as a blocking diagnostic.
Validation must instead enforce unambiguous ownership: the junction must belong
to exactly one non-root child layer whose `parentStateId` is the containing
state. A completely unreachable containing state can use the existing
unreachable-state analysis rather than a history-specific generation error.

For the supplied JSON:

```json
{
  "id": "trans-3",
  "sourceId": "state-2",
  "targetId": "state-1",
  "condition": "x == 3"
}
```

is already the correct Stateflow-style transition. The history junction's
`parentId` must be repaired from the child `State_6` UUID to `"state-1"`.

### Verification

- Transition to a containing state with shallow history: restored.
- Transition to a containing state with deep history: restored.
- First entry with no recorded history: default child entered.
- Direct transition to shallow/deep history: accepted and restored.
- Decision-junction route to history: accepted and restored.
- Shallow history: restores only the direct child.
- Deep history: restores all recorded nested OR and AND regions.
- Simulator and compiled-C traces must match frame by frame.

---

## Correction 2: False Configuration Fault on Leaf States

### Observed Problem

The reviewed model contains an empty OR child layer owned by `State_2`.

The generator allocates an active slot to the empty layer:

```c
SM_Layer_Parent_Map[layer] = SM_ST_STATE_2;
SM_Layer_Active_Slot_Map[layer] = 2;
```

The layer has no child states, so its active slot remains
`SM_NODE_INVALID`. On the next tick, `SM_Validate_State_Consistency()` treats
the empty slot as RAM/configuration corruption and latches
`SM_ERR_CONFIGURATION`.

### Root Cause

The semantic slot allocator gives every OR layer an active slot, including OR
layers with zero children. Generated safety validation then assumes every
active OR container must have an active direct child.

### Required Generator Corrections

#### REQ-GEN-SAF-001: Empty-Layer Safety Guard

Generated safety code must contain constant child-presence metadata:

```c
static const bool SM_Layer_Has_Children[SM_NUM_LAYERS] = {
    [SM_LYR_ROOT_IDX] = true,
    [SM_LYR_EMPTY_STATE_2_LAYER_IDX] = false
};
```

Child-configuration validation must run only for non-empty layers:

```c
if (container_active && SM_Layer_Has_Children[layer_index]) {
    if (active_slot >= 0) {
        active_node = instance->active_states[(uint32_t)active_slot];
        if ((active_node == SM_NODE_INVALID)
            || ((uint32_t)active_node > SM_NUM_STATES)
            || (!SM_Is_Direct_Layer_Child(layer_index, active_node))
            || (!instance->state_active[(uint32_t)active_node])) {
            return SM_ERR_CONFIGURATION;
        }
    } else {
        /* Validate every child of an AND layer. */
    }
}
```

This generated constant map is preferred over scanning every state during
every safety check.

#### REQ-GEN-SAF-002: Empty-Layer Slot Optimization

The semantic allocator must allocate an active slot only when an OR layer has
at least one state:

```ts
if (layer.decomposition === 'OR' && layer.stateIds.length > 0) {
  slots.set(layer.id, nextSlot);
  nextSlot += 1;
} else {
  slots.set(layer.id, null);
}
```

Consequences:

- Empty OR layers use no active-state RAM slot.
- `SM_NUM_ACTIVE_SLOTS` excludes empty layers.
- Leaf states do not require nonexistent active children.
- Valid non-empty OR and AND configuration checks remain strict.

### Verification

1. Initialize the state machine.
2. Transition into `State_2`.
3. Execute another tick.
4. Confirm:

```c
SM_GetError(&instance) == SM_ERR_NONE
instance.fault_latched == false
```

Additional corruption tests must still prove:

- Missing child in a non-empty OR layer is rejected.
- Missing child in an AND region is rejected.
- A child with an inactive parent is rejected.
- Invalid shallow/deep history ownership is rejected.

---

## Correction 3: Deterministic Instance Initialization

### Observed Problem

`SM_Init()` initializes fields and arrays individually. If the instance is
stack/heap garbage and tracing is enabled, an early trace action can observe an
uninitialized `trace_sink`.

Manual field initialization also risks missing future fields added to
`ADIA_Instance_t`.

### Required Generator Correction

#### REQ-GEN-INIT-001: Complete Memory Clear

Generated `sm_core.c` must include:

```c
#include <string.h>
```

After the null guard, the first state-changing instruction in `SM_Init()` must
be:

```c
SM_Error_t SM_Init(ADIA_Instance_t *instance)
{
    if (instance == NULL) {
        return SM_ERR_NULL_INSTANCE;
    }

    (void)memset(instance, 0, sizeof(*instance));

    /* Explicit semantic defaults follow. */
}
```

After `memset`, the generator must still explicitly assign values whose
semantic representation is not necessarily zero:

- `SM_NODE_INVALID` active/history slots
- variable initial values
- error status
- timers
- state activity flags
- deep-history flags
- fault latch
- trace sink

When tracing is enabled:

```c
instance->trace_sink = NULL;
```

must execute before root-state entry.

### Trace Lifecycle

Tracing is registered after initialization:

```c
ADIA_Instance_t instance;

(void)SM_Init(&instance);
SM_SetTraceSink(&instance, trace_sink);
```

`SM_Init()` intentionally discards any callback previously stored in
uninitialized caller memory. Initial entry actions are not sent to an external
trace callback.

### Verification

- Fill the entire instance with `0xA5`.
- Compile with `SM_TRACE_ENABLED`.
- Call `SM_Init()` without registering a sink.
- Confirm no crash or hard fault.
- Register a sink after initialization.
- Trigger a transition action.
- Confirm later actions reach the registered sink.
- Inspect generated source to prove `memset` occurs before entry/action calls.

---

## Correction 4: Static and Dynamic Verification Reporting

### Observed Problem

The generated report can display:

```text
Semantic IR validation: PASS
State reachability: 100.0%
Host compilation: NOT RUN
Host runtime: NOT RUN
```

The reachability value is static graph reachability, not evidence that the
generated binary executed successfully.

### Required Generator Corrections

#### REQ-GEN-REP-001: Separate Reachability Modes

The testing report must show:

```text
Static AST reachability: <percentage>
Dynamic executable reachability: <PASS | FAIL | NOT RUN>
```

Static reachability remains derived from the validated semantic IR.

Dynamic executable reachability is based only on recorded host execution
evidence. It must not copy the static percentage.

#### REQ-GEN-REP-002: Explicit Execution Mode

Default generated packages must show:

```text
Execution mode: STATIC_ANALYSIS_ONLY
```

Execution mode is selected as follows:

```text
VALIDATION_FAILED
    Any recorded evidence category explicitly failed.

DYNAMIC_EXECUTION_VERIFIED
    Host compilation and host runtime both passed.

STATIC_ANALYSIS_ONLY
    Host compilation or host runtime was not executed.
```

No unqualified `PASS` badge may represent a package whose generated binary was
not executed.

### Verification

- Default generation: `Execution mode: STATIC_ANALYSIS_ONLY`.
- Default generation: `Dynamic executable reachability: NOT RUN`.
- Host compile/runtime pass: `DYNAMIC_EXECUTION_VERIFIED`.
- Any explicit failed evidence: `VALIDATION_FAILED`.
- Static reachability percentage remains identical across the testing and
  static-metrics reports because both use one semantic-analysis result.

---

## Files to Correct in the Generator

| Generator component | Source file | Correction |
|---|---|---|
| Semantic history validation | `src/utils/stateMachine/smSemanticValidator.ts` | Validate ownership without requiring a direct incoming edge |
| Semantic transition builder | `src/utils/stateMachine/smSemanticBuilder.ts` | Convert entry to a history-owning state into a history-aware route |
| Semantic slot allocation | `src/utils/stateMachine/smSemanticBuilder.ts` | Do not allocate empty OR-layer slots |
| Generated C safety template | `src/utils/stateMachine/smCGenerator.ts` | Emit child-presence metadata and guard empty layers |
| Generated C initialization template | `src/utils/stateMachine/smCGenerator.ts` | Emit `memset` before state entry |
| Differential C harness | `src/utils/stateMachine/smCHarness.ts` | Register trace sink after initialization |
| Testing report generator | `src/utils/stateMachine/smReports.ts` | Separate static/dynamic evidence and execution mode |

## Test Files

| Test file | Coverage |
|---|---|
| `smSemanticBuilder.test.ts` | History connectivity and empty-layer allocation |
| `smCGenerator.test.ts` | Real compiled-C history, leaf-state, initialization, strict consistency, and C99 behavior |
| `smModelMigration.test.ts` | Safe repair of legacy history-parent metadata |
| `smInterpreter.test.ts` | Simulator handling of empty-layer history observations |
| `smReports.test.ts` | Execution mode and reachability wording |
| `smDifferential.test.ts` | Simulator/generated-C frame parity |
| `smStandaloneRuntime.test.ts` | Standalone runtime behavior |
| `src/engine/hil/*.test.ts` | Driver integration and HIL compilation |

## Verification Record

The implemented generator was verified on 2026-07-30 with:

- 240/240 state-machine generator, interpreter, report, strict-C, and
  differential tests passing.
- 30/30 HIL and driver-integration tests passing.
- TypeScript compilation passing with `npx tsc --noEmit`.
- The supplied `statemachine-history.json` migrated with no semantic
  diagnostics and matched generated C for all 8 executed frames.
- The final supplied-model frame restored `State_6` under `State_1` with
  `SM_ERR_NONE`.

## Final Acceptance Criteria

The correction is complete only when:

1. Reentry to a history-owning state restores history without directly targeting the junction UUID.
2. Explicit shallow/deep history targets also restore correctly in compiled C.
3. `State_2` remains active across the next tick without a configuration
   fault.
4. Empty OR layers consume no active slot.
5. Genuine state/slot corruption is still detected.
6. `SM_Init()` clears the entire structure before any entry/trace action.
7. Reports default to `STATIC_ANALYSIS_ONLY`.
8. Static and dynamic reachability are clearly separated.
9. Simulator and generated-C traces match.
10. Strict C99, HIL, TypeScript, and full state-machine tests pass.

## Implementation Rule

Do not patch delivered `sm_core.c`, `sm_safety.c`, or
`sm_testing_report.md` manually. Correct the semantic engine and templates,
then regenerate the application package.
