# State Machine Generated-C Runtime Corrections Design

## Goal

Correct history linkage, empty-layer consistency validation, initialization
safety, and verification-report wording in the generic semantic C generator
while preserving simulator/generated-C behavioral parity.

## Scope

This change covers:

- `REQ-GEN-HIS-001`: reentry to a state containing history restores its prior
  substate configuration.
- `REQ-GEN-HIS-002`: history ownership is validated without requiring a
  transition to target the junction UUID directly.
- `REQ-GEN-SAF-001`: active empty child layers do not cause configuration
  faults.
- `REQ-GEN-SAF-002`: empty child layers consume no active-state slot.
- `REQ-GEN-INIT-001`: `SM_Init()` clears the complete instance before state
  entry or tracing.
- `REQ-GEN-REP-001`: reports separate static graph reachability from dynamic
  executable reachability.
- `REQ-GEN-REP-002`: skipped host execution produces
  `STATIC_ANALYSIS_ONLY`, never an unqualified pass.

The change does not silently create transitions, select a history owner, or
delete user model elements. Invalid graph connectivity remains visible to the
user as a semantic diagnostic.

## Current Findings

The structured generator already normalizes an explicit transition whose final
destination is a shallow or deep history junction and emits layer restoration
through `renderRestoreLayer()`. It does not yet apply history when a transition
targets the containing state. Stateflow treats history as a feature of that
state: on first activation the default child is entered, while later
reactivation resumes the recorded substate configuration.

The supplied model also contains an empty OR child layer owned by leaf
`State_2`. The semantic allocator gives that empty layer an active slot.
Generated consistency validation consequently requires a child in a layer that
has no children, producing `SM_ERR_CONFIGURATION`.

`SM_Init()` currently initializes individual fields and can initialize
`trace_sink` only near the end. Entry actions can therefore observe
uninitialized instance storage in generation variants that trace earlier.

The testing report labels structural reachability but does not provide a
single, prominent validation-mode result.

## Architecture

### 1. History graph validation and execution

`smSemanticValidator.ts` will validate that every `history` or `deep-history`
junction belongs to exactly one non-root child layer and that the layer's
parent state is its unambiguous owner. It will not require an incoming
transition whose `targetId` equals the junction ID.

The semantic builder will use the existing route representation both for an
explicit junction destination and for reentry to a state that owns history:

- `destinationKind: 'history'`
- `destinationJunctionId: <junction ID>`
- junction ownership resolves the layer being restored

The C transition renderer will continue to enter the owner path and invoke
`renderRestoreLayer()` for the destination layer. The emitted restoration path
must contain reachable calls to `SM_Restore_State_<RecordedChild>()`, with
shallow history restoring the direct child and deep history restoring the full
recorded descendant configuration. This is the current generator's generic
equivalent of binding the transition directly to a Stateflow history target;
it avoids incorrectly restoring a compile-time parent when the recorded child
is a runtime value.

Tests will inspect emitted C and execute real compiled shallow/deep history
models. They will cover containing-state reentry, explicit history targets,
first-entry default fallback, and ownership errors.

### 2. Empty-layer slot allocation and runtime validation

An OR layer receives an active slot only when it has at least one state child.
An empty OR layer receives `activeSlot: null`, does not increment
`activeSlotCount`, and cannot require an active child. State `activeSlot`
values continue to describe the containing non-empty layer.

Generated safety code will also emit a layer-child-presence map/helper and
guard child-configuration checks with it. This provides defense in depth for
models migrated from earlier schemas:

- Active, non-empty OR layer: exactly one valid direct active child.
- Active, non-empty AND layer: every direct child active.
- Active, empty layer: no child assertion.
- Inactive layer with an allocated slot: slot must be invalid.
- History/deep-history ownership checks remain unchanged.

The semantic allocation change prevents wasted RAM and the generated guard
prevents false corruption faults even if an empty layer reaches the renderer.

### 3. Deterministic instance initialization

Generated `sm_core.c` will include `<string.h>`. After the null-instance guard,
the first state-changing operation in `SM_Init()` will be:

```c
memset(instance, 0, sizeof(*instance));
```

Explicit initialization will still assign enum sentinels such as
`SM_NODE_INVALID`, variable initial values, error state, timers, history, and
other values whose semantic initial value is not guaranteed by an all-zero
byte representation.

When tracing is enabled, `trace_sink` will be explicitly assigned `NULL` after
the clear and before any entry action. Callers register tracing only after
initialization:

```c
SM_Init(&instance);
SM_SetTraceSink(&instance, trace_sink);
```

Initial entry actions are deliberately not delivered to an externally supplied
trace callback. This avoids reading or attempting to preserve a callback from
uninitialized caller memory.

### 4. Verification report modes

The testing report will use separate fields:

- `Static AST reachability`: percentage and reachable/unreachable state IDs
  derived from validated semantic IR.
- `Dynamic executable reachability`: evidence status from host execution or
  differential traces; it is `NOT RUN` when no executable evidence exists.

The report execution mode is derived from recorded evidence:

- `VALIDATION_FAILED` if any recorded evidence category explicitly fails.
- `DYNAMIC_EXECUTION_VERIFIED` only when host compilation and host runtime both
  pass.
- `STATIC_ANALYSIS_ONLY` otherwise.

The generated package displays `Execution mode: STATIC_ANALYSIS_ONLY` by
default because code generation itself does not execute the host binary. No
static reachability percentage is described as runtime proof.

## Error Handling

- A history junction does not require an incoming transition to its own UUID.
  Invalid or ambiguous ownership produces a semantic error and no generated
  package.
- Existing history ownership errors remain separate diagnostics.
- Null `SM_Init()` calls continue to return `SM_ERR_NULL_INSTANCE` without
  calling `memset`.
- Empty layers do not cause runtime faults merely because they contain no
  state.
- Genuine slot/state mismatches continue to return `SM_ERR_CONFIGURATION`.

## Compatibility

- No public model schema change is required.
- Existing valid history models preserve their current simulator and C
  behavior.
- The public `SM_Init()` signature remains unchanged.
- Trace registration before `SM_Init()` is no longer supported; initialization
  intentionally clears the callback.
- Reports gain explicit mode labels without removing the detailed evidence
  table.

## Test Strategy

Tests are added before production changes and must fail for the expected
missing behavior.

1. Semantic validator:
   - Accept reentry through a containing state without targeting the history
     UUID.
   - Accept explicit and decision-chain history targets.
   - Reject ambiguous or invalid history ownership.

2. Semantic builder:
   - Allocate no active slot for an empty OR child layer.
   - Preserve allocation for non-empty OR layers and AND semantics.

3. Generated safety runtime:
   - Enter a leaf state that owns an empty layer.
   - Execute the following tick.
   - Assert `SM_ERR_NONE` and no latched fault.
   - Continue rejecting corrupted non-empty OR/AND configurations.

4. History runtime:
   - Compile and execute shallow and deep restoration fixtures.
   - Assert the generated transition path reaches restoration code.
   - Compare frames with the interpreter.

5. Initialization:
   - Inspect source ordering: null guard, `memset`, then all other instance
     writes and entry calls.
   - Fill an instance with non-zero bytes, call `SM_Init()`, and run with
     `SM_TRACE_ENABLED` without registering a sink.
   - Register a sink after initialization and verify later actions are traced.

6. Reports:
   - Default package contains `STATIC_ANALYSIS_ONLY`.
   - Static and dynamic reachability are distinct.
   - Passing host compile/runtime evidence produces
     `DYNAMIC_EXECUTION_VERIFIED`.
   - Any explicit failed evidence produces `VALIDATION_FAILED`.

7. Regression:
   - Run the full semantic generator, interpreter/C differential, strict-C99,
     HIL compile/runtime, TypeScript, and runtime-bundle suites.

## Preservation Constraints

The workspace already contains unrelated modified files, including local edits
in `smCGenerator.ts`, its tests, and model-migration files. Implementation must
inspect and preserve those edits, stage only the corrections described here,
and never reset or clean the worktree.
