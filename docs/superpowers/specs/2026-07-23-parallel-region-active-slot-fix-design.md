# Parallel Region Active Slot Fix

## Problem

When a layer contains parallel (AND-decomposed) states across multiple regions, the code generator assigns all sibling states the same `active_states[]` array index. Only the last-entered state is tracked; the others are overwritten and become invisible to exit logic, history restoration, and `SM_GetActive`.

### Root Cause

In `generateMISRACCode`, the `layerIndexMap` assigns one index per layer. `SM_Enter_State_Shallow` writes `active_states[parentLayerIdx] = state` for every state in that layer. For exclusive (OR) layers this is correct (only one state is active). For parallel (AND) layers with multiple regions, all regions overwrite the same slot.

### Impact

- Parallel states in non-last regions become unreachable after initialization
- Exit sequences for overwritten states never fire
- History restoration fails for parallel layers
- `SM_GetActive` returns only the last-entered region's state

## Design

### Core Fix: Region-Expanded Active Slot Mapping

Introduce two new maps alongside the existing `layerIndexMap`:

```typescript
// Maps stateId → its active_states[] slot index (region-aware)
const stateActiveSlotMap = new Map<string, number>();

// Maps layerId → its primary active_states[] slot
const layerActiveSlotMap = new Map<string, number>();

let totalActiveSlots = 0;
```

**Slot assignment algorithm:**

```
For each layer (sorted):
  Record layerActiveSlotMap[layer.id] = totalActiveSlots
  
  If layer is parallel (all states have isParallel=true):
    Group states by regionId
    For each unique region:
      Assign slot = totalActiveSlots++
      Map all states in that region → slot
  Else (exclusive layer):
    Assign slot = totalActiveSlots++
    Map all states in layer → slot
```

**`SM_NUM_LAYERS`** is set to `totalActiveSlots` (expanded count). For models without parallel states, this equals `sortedLayers.length` (backward compatible).

### Affected Code Sites

All changes are in `src/utils/stateMachineCodeGenerator.ts`.

| Site | Function | Change |
|------|----------|--------|
| L117-118 | Index setup | Add `stateActiveSlotMap`, `layerActiveSlotMap`, `totalActiveSlots` |
| L1237-1238 | `SM_Exit_State` recursive child exit | Use `layerActiveSlotMap` |
| L1251 | `SM_Exit_State` history save | Use `stateActiveSlotMap` |
| L1254-1261 | `SM_Exit_State` clear slot | Use `stateActiveSlotMap`; allow clear for parallel regions (each has own slot) |
| L1277-1281 | `SM_Enter_State_Shallow` | Use `stateActiveSlotMap` |
| L1349 | `SM_Enter_Layer_N` history | Use `layerActiveSlotMap` |
| L1591 | `SM_Step_Layer_N` switch | Use `layerActiveSlotMap` |
| L1717 | `SM_GetActive` | Use region-aware slots |
| SM_NUM_LAYERS define | sm_config.h | Set to `totalActiveSlots` |

### Genericity Requirements

The generator must handle any combination of:

1. **Arbitrary nesting depth**: A parallel state can contain child layers, which can contain further parallel or exclusive states, to arbitrary depth.
2. **Mixed decomposition**: A parent state can have both exclusive and parallel child layers.
3. **Any number of regions**: A parallel layer can have 2, 3, or N distinct `regionId` values.
4. **Internal transitions**: `type === 'internal'` or `isInternal === true` transitions must not emit exit/entry sequences regardless of layer type or nesting level.
5. **History junctions**: Per-region history restoration for parallel layers; per-layer for exclusive layers.

### Backward Compatibility

- **Non-parallel models**: Zero change. Each exclusive layer gets 1 slot, identical to current behavior.
- **Existing tests**: All 31 tests in `stateMachineCodeGenerator.test.ts` continue to pass.
- **Array sizing**: `active_states[]` and `history_states[]` grow only when parallel regions exist.

### Deadlock States

The 4 deadlock states identified in the analysis (State_2, State_5_1, State_6_1, State_6_2) are a **model design issue**. The generator's deadlock detection (REQ-V-01) correctly flags them. They require outgoing transitions in the model to resolve.

## Verification Plan

### Automated Tests

1. **New test**: Multi-region parallel model (3+ regions, nested child layers) verifying:
   - Each region's `active_states[]` slot is distinct
   - No `SM_Exit_State`/`SM_Enter_State` calls for internal transitions
   - Child layers of parallel states step correctly
   - `SM_NUM_LAYERS` equals expanded slot count

2. **Regression**: All existing 31 tests pass unchanged.

3. **avr-gcc compilation**: Verify generated C compiles cleanly.

### Manual Verification

- User generates code from their multi-region model and verifies parallel states are independently tracked.
