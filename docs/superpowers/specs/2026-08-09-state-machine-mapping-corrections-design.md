# State-Machine Mapping Corrections Design

**Date:** 2026-08-09  
**Status:** Approved for implementation planning

## Purpose

Correct the semantic state-machine C generator so layer identifiers, active-slot
identifiers, and state identifiers are never treated as interchangeable. The
same change set also removes empty generated child layers and prevents
unnecessary XBridges output conversions while preserving the existing
Step-to-Outport mapping repair.

The application-facing `generateMISRACCode()` facade already migrates input into
the immutable semantic model and renders through `smCGenerator.ts`. The retained
legacy renderer is reconciliation context only and is not an independent runtime
artifact path. Corrections therefore belong in semantic normalization and the
semantic C/XBridges emitters.

## Root Causes

1. The generated public `SM_GetActive()` API names its argument `group` but uses
   the value directly as an `active_states[]` index. The name permits callers to
   mistake a layer ID for an active-slot ID.
2. Layer-to-slot and state-to-slot tables exist only inside generated safety
   code. They are not shared by public query APIs and are not validated before
   state-machine entry.
3. AND-layer child states correctly have no exclusive active slot, but the
   public API lacks a state-specific activity query for `state_active[]`.
4. Empty non-root layer metadata survives into the semantic IR and generated C
   even when it contains no states, junctions, or transitions.
5. XBridges output publication always converts a native signal to `double` and
   then casts to the destination variable type. For matching `float32`/`float`
   storage this creates an unnecessary `float -> double -> float` path.

## Chosen Approach

Correct semantic normalization and generated templates at their source. Do not
post-process generated C, and do not introduce breaking public enum types in
this change.

Keep `SM_GetActive()` for one compatibility cycle as a documented deprecated
wrapper whose argument is explicitly an active-slot index. All generated tests,
documentation, and new integrations use the three unambiguous APIs.

## Semantic-Layer Normalization

A non-root layer is code-generation-empty when all of these collections are
empty:

- `stateIds`
- `junctionIds`
- `transitionIds`

Such a layer is omitted from the semantic hierarchy before stable layer indexes
and active slots are allocated. The persisted source model is not mutated. The
root layer is retained even when empty because it is the state machine's
structural entry container. Layers containing a junction or transition remain
meaningful and are retained even when they have no direct states.

Consequences:

- omitted layers do not contribute to `SM_NUM_LAYERS`;
- omitted layers receive no generated ID, slot, switch case, or empty entry
  helper;
- real OR layers receive one exclusive active slot;
- AND layers and empty root layers receive no exclusive active slot.

## Generated Mapping Metadata

Generate one shared internal mapping module containing:

```c
extern const uint32_t SM_State_Parent_Layer_Map[SM_NUM_STATES + 1U];
extern const int32_t SM_State_Active_Slot_Map[SM_NUM_STATES + 1U];
extern const SM_Node_t SM_Layer_Parent_State_Map[SM_NUM_LAYERS];
extern const int32_t SM_Layer_Active_Slot_Map[SM_NUM_LAYERS];
```

Index zero in state-indexed tables represents `SM_NODE_INVALID`. A slot value of
`-1` means the state or layer is intentionally not represented in
`active_states[]`. In particular, child states of an AND layer remain mapped to
`-1` and are tracked by `state_active[]`.

The mapping source contains a generated comment table listing each layer, its
active slot or `NONE`, and a note that parallel child states use
`state_active[]`. This is generated from the same ordered semantic layers as the
tables, preventing documentation drift.

## Public C Interface

The generated public header provides:

```c
SM_Node_t SM_GetActiveSlot(
    const ADIA_Instance_t *instance,
    uint32_t slot);

SM_Node_t SM_GetLayerActive(
    const ADIA_Instance_t *instance,
    uint32_t layer);

bool SM_IsStateActive(
    const ADIA_Instance_t *instance,
    SM_Node_t state);
```

`SM_GetActiveSlot()` checks for a null instance and verifies
`slot < SM_NUM_ACTIVE_SLOTS` before indexing `active_states[]`.

`SM_GetLayerActive()` checks the layer range, translates through
`SM_Layer_Active_Slot_Map`, rejects `-1`, and only then indexes
`active_states[]` using the translated slot.

`SM_IsStateActive()` checks the instance and the one-based state range before
reading `state_active[(uint32_t)state]`. This permits every child of an active
AND region to report `true` simultaneously.

The compatibility API is retained as:

```c
/* Deprecated: use SM_GetActiveSlot(). The argument is an active-slot ID. */
SM_Node_t SM_GetActive(
    const ADIA_Instance_t *instance,
    SM_Group_t slot);
```

Its implementation delegates to `SM_GetActiveSlot()` and never interprets the
argument as a layer ID.

## Mapping Validation and Initialization

Generate `SM_Validate_Mapping_Configuration()` in the internal mapping module.
It validates static metadata before the root configuration is entered:

1. every layer slot is `-1` or in `[0, SM_NUM_ACTIVE_SLOTS)`;
2. every state slot is `-1` or in `[0, SM_NUM_ACTIVE_SLOTS)`;
3. every state parent-layer index is in `[0, SM_NUM_LAYERS)`;
4. every layer parent state is `SM_NODE_INVALID` or a valid one-based state;
5. a state with a non-negative slot uses the same slot as its parent layer;
6. a state whose parent layer has no exclusive slot also has slot `-1`.

`SM_Init()` clears the instance, initializes sentinel values, runs mapping
validation, and returns `SM_ERR_CONFIGURATION` without entering the root layer
if the metadata is inconsistent. Valid generated metadata returns
`SM_ERR_NONE`; runtime configuration consistency checks continue to run after
normal entry and stepping.

No mapping validation path indexes `active_states[]`, `state_active[]`, or a
mapping table before the relevant identifier range is established.

## XBridges Output Type Conversion

Preserve the existing Step/Outport repair:

- infer an Outport mapping from `parameters.smVarId` when the JSON `mappings`
  array is empty;
- publish the Outport's resolved output signal rather than an unrelated input
  field.

Output assignment generation compares the resolved native source signal type
with the destination state-machine variable type:

- `float32 -> float`, `float64 -> double`, and `boolean -> bool`: emit direct
  native assignment with no cast;
- differing native types: emit one explicit cast directly to the destination
  C type;
- fixed-point or real-world sidecar values: retain the required conversion
  expression, followed by at most one destination cast;
- integer conversions retain explicit destination-width casts and existing
  overflow policy.

For a matching Step/Outport float mapping, the expected generated form is:

```c
instance->data.xb3_integrator_output =
    instance->xb_state.XB3_Integrator_Out_out;
```

It must not contain an intermediate cast to `double`.

## Error Handling

- Null slot/layer queries return `SM_NODE_INVALID`.
- Out-of-range slot/layer queries return `SM_NODE_INVALID`.
- Null, invalid, or out-of-range state queries return `false`.
- A valid layer without an exclusive slot returns `SM_NODE_INVALID`; callers
  query its states with `SM_IsStateActive()`.
- Invalid static mapping metadata causes `SM_Init()` to return
  `SM_ERR_CONFIGURATION` before state entry.

## Verification Strategy

Use test-driven changes and watch each new test fail for the intended missing
behavior before production edits.

Generator-output tests verify:

- all three explicit declarations and implementations;
- deprecated `SM_GetActive()` delegates to `SM_GetActiveSlot()`;
- the layer API uses `SM_Layer_Active_Slot_Map` and never indexes with `layer`;
- parallel state mappings remain `-1`;
- generated mapping documentation is accurate;
- empty non-root layers are absent from semantic counts and generated code;
- identical XBridges source/destination types generate no redundant cast.

Compiled-C runtime tests verify:

- slot 0 and slot 1 return the expected OR states;
- slots 2 and 3 safely return `SM_NODE_INVALID` when only two slots exist;
- valid and invalid layer IDs behave safely;
- both parallel child states report active simultaneously;
- invalid state IDs return `false`;
- valid mapping metadata initializes with `SM_ERR_NONE`;
- deliberately corrupted generated mapping fixtures return
  `SM_ERR_CONFIGURATION` before entry;
- OR and AND transition behavior remains correct.

Strict generated-C verification uses C99 with warnings promoted to errors,
including `-Wall`, `-Wextra`, `-Wconversion`, and `-Werror` when the selected
host compiler supports them. The focused XBridges suite, state-machine semantic
suite, compiled behavior suite, snapshots, TypeScript checking, and application
build remain regression gates.

## Acceptance Criteria

The change is complete when all twelve Definition-of-Done items in the supplied
requirements pass, the Step-to-Outport auto-mapping test remains green, the
matching float assignment contains no `double` conversion, and unrelated dirty
worktree changes remain preserved.
