# Design Document: State Machine Layer-Aware & Recursive Copy/Paste

**Date**: 2026-07-27  
**Status**: Approved  

---

## 1. Overview
In the ADIA State Machine Editor, users need the ability to select multiple elements (states, junctions, transitions, SysML/BDD requirement blocks) across any state machine layer, copy them, and paste them into any target layer while maintaining intact hierarchical state references, transitions, and nested sub-layers.

---

## 2. Requirements & Goals

### Functional Requirements
1. **Multi-Selection Copying**:
   - Copying (`Ctrl+C` / `Ctrl+X`) multiple selected elements must capture top-level selected items and recursively include all child states, transitions, junctions, and nested `Layer` structures belonging to any selected composite states.
2. **Layer-Aware Pasting**:
   - Pasting (`Ctrl+V`) into the currently active layer (`currentLayerId`) must set `parentId = currentLayerId` for all top-level pasted states and register top-level states, junctions, and transitions in `currentLayerId`.
3. **Recursive Sub-Layer Duplication**:
   - For composite states with sub-layers, clone the child `Layer` definitions, update `parentStateId`, and remap sub-states, sub-junctions, and sub-transitions.
4. **Transition & Connection Preservation**:
   - Remap `sourceId` and `targetId` for all transitions (top-level and nested) using the mapping of old-to-new UUIDs (`idMap`).
5. **Positioning**:
   - Apply a standard `+20px` offset to top-level states and junctions to visually distinguish pasted items, while retaining relative coordinates for nested internal sub-states.

---

## 3. Architecture & Design Details

### Data Structures
State Machine Clipboard Payload:
```ts
interface StateMachineClipboard {
  states: StateData[];
  junctions: JunctionData[];
  transitions: TransitionData[];
  layers: Layer[];
  blocks: BlockData[];
  relationships: RelationshipData[];
  parts: PartData[];
  connectors: ConnectorData[];
  interfaceRealizations: InterfaceRealizationData[];
  topLevelStateIds: string[];
  topLevelJunctionIds: string[];
  topLevelTransitionIds: string[];
}
```

### Flow & Logic

#### Copy Action (`Ctrl+C` / `Ctrl+X`)
1. Filter top-level selected items from `selectedIds`.
2. For each selected state `S`:
   - Recursively discover child layers `L` where `L.parentStateId === S.id`.
   - Gather all descendant states, junctions, transitions, and sub-layers.
3. Store top-level IDs separately from descendant IDs in the clipboard object to allow proper layer placement on paste.

#### Paste Action (`Ctrl+V`)
1. Create a `Map<string, string>` (`idMap`) mapping each original UUID to a newly generated `uuidv4()`.
2. For top-level states:
   - Assign `s.id = idMap.get(s.id)`.
   - Set `s.parentId = currentLayerId`.
   - Apply position offset `x: s.x + 20, y: s.y + 20`.
3. For descendant sub-states:
   - Assign `s.id = idMap.get(s.id)`.
   - Set `s.parentId = idMap.get(s.parentId) || s.parentId`.
   - Retain relative positions.
4. For cloned layers:
   - Assign `l.id = uuidv4()`.
   - Set `l.parentStateId = idMap.get(l.parentStateId)`.
   - Map `l.stateIds`, `l.junctionIds`, `l.transitionIds` through `idMap`.
5. For transitions:
   - Remap `sourceId = idMap.get(t.sourceId) || t.sourceId`.
   - Remap `targetId = idMap.get(t.targetId) || t.targetId`.
6. Append new states/junctions/transitions to global state, append top-level items to `currentLayerId`, and append cloned sub-layers to `layers`.
7. Set `selectedIds` to the newly created top-level element IDs.

---

## 4. Verification Plan

### Manual Verification
1. **Multi-element Copy/Paste on Same Layer**:
   - Select 2 states and a connecting transition. Press `Ctrl+C`, `Ctrl+V`. Verify new states are created with `+20px` offset and transition connects the new states.
2. **Copy/Paste Across Sub-Layers**:
   - Create a composite state `StateA` with sub-states `SubState1` and `SubState2`.
   - Copy `StateA`.
   - Navigate into a different layer or create `StateB` and enter it.
   - Press `Ctrl+V` inside the new layer.
   - Verify `StateA_copy` appears in the target layer and double-clicking `StateA_copy` reveals its cloned sub-states `SubState1_copy` and `SubState2_copy`.
