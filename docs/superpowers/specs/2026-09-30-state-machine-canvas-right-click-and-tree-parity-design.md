# State Machine Canvas Right-Click & Tree Creation Parity Design

## 1. Overview
In ADIA, the State Machine diagram workspace has traditionally supported three core elements from the canvas toolbar:
1. **State**: Standard state with entry, during, exit actions, timers, and priority.
2. **Junction**: Decision point for conditional transitions.
3. **X-Bridges State**: Continuous-time dynamic block subsystem state.

State configuration (such as marking a state as the initial/autostart state, terminal state, or configuring shallow/deep history) is handled directly via **State Properties** (`autostart: boolean`, `isTerminal: boolean`, `historyType: 'none' | 'shallow' | 'deep'`). These properties map deterministically to the ADIA MISRA C:2012 / ISO C99 code generator (`stateMachineCodeGenerator.ts`).

Recent additions to the Cameo-style Model Explorer tree introduced UML/SysML pseudostates (`initial`, `choice`, `fork`, `join`, `terminate`, `entry-point`, `exit-point`, `history`, `deep-history`, `final`) into the creation capabilities when right-clicking on a State Machine Diagram or Region. These pseudostates do not have C code generation counterparts and diverge from what users can create via the workspace toolbar.

This design restores exact parity between:
- The items available when right-clicking on the State Machine Diagram row in the Model Explorer tree.
- The items available when right-clicking on the State Machine Diagram canvas in the workspace.
- The items that can be compiled to C code.

---

## 2. Requirements & Scope

### 2.1 Creation Menu Pruning (Tree & Context Menu)
* **Delete Unused Pseudostates**: Remove `initial`, `choice`, `fork`, `join`, `terminate`, `entry-point`, `exit-point`, `history`, `deep-history`, and `final` from the allowed children list for State Machine diagrams and regions in `stateMachineExplorerAdapter.ts`.
* **Retain Only C-Codable Elements**:
  * `state` -> Label: **State**
  * `junction` -> Label: **Junction**
  * `xBridgesState` -> Label: **X-Bridges State**

### 2.2 State Machine Canvas Right-Click Context Menu
* In `src/App.tsx`, intercept right-click (`onContextMenu`) on `#adia-diagram-canvas` when `diagramMode === 'statemachine'`.
* Prevent the default browser context menu and open a dark-themed canvas context menu anchored at the cursor position `(e.clientX, e.clientY)`.
* Offer three creation actions matching the toolbar buttons:
  * **Add State**
  * **Add Junction**
  * **Add X-Bridges State**
* Clicking an action converts the screen coordinates to canvas world coordinates `(worldX, worldY)` taking `uiZoom`, `view.offsetX`, `view.offsetY`, and `view.scale` into account:
  * `Add State`: invokes `createState(worldX, worldY)`
  * `Add Junction`: invokes `createJunction(worldX, worldY)`
  * `Add X-Bridges State`: invokes `createXBridgesState(worldX, worldY)`
* Context menu closes on outside click, item selection, or pressing Escape.

### 2.3 State Properties Preservation
* Initial state designation remains an intrinsic property of a State (`autostart: true`), editable from the right-side properties panel and the state context menu ("Set as Initial / Autostart").
* History designation (`none`, `shallow`, `deep`) remains an intrinsic property of composite states.
* C code generation logic remains untouched and fully compatible, without adding synthetic pseudostates to the code generation pipeline.

---

## 3. Architecture & Component Changes

### 3.1 `src/features/modelExplorer/adapters/stateMachineExplorerAdapter.ts`
* Update `STATE_MACHINE_CHILDREN`:
  ```typescript
  const STATE_MACHINE_CHILDREN: Record<string, readonly string[]> = {
    stateMachine: ['region'],
    region: [
      'state',
      'junction',
      'xBridgesState',
    ],
    state: ['region'],
  };
  ```
* In `capabilities()`:
  * When resolving capabilities for a region or diagram, only return `state`, `junction`, and `xBridgesState`.
* In `executeCommand()` for `createElement`:
  * Add support for `command.elementKind === 'xBridgesState'`, instantiating an X-Bridges state with `isXBridges: true` and default solver settings.
  * Retain `state` and `junction` handling.

### 3.2 `src/features/modelExplorer/modelExplorerCapabilities.ts`
* Update `BASE_ELEMENT_KIND_LABELS`:
  * Map `xBridgesState` to `'X-Bridges State'`.

### 3.3 `src/App.tsx`
* Add canvas context menu state:
  ```typescript
  const [canvasContextMenu, setCanvasContextMenu] = useState<{
    x: number;
    y: number;
    worldX: number;
    worldY: number;
  } | null>(null);
  ```
* In `onContextMenu` of `#adia-diagram-canvas`:
  * If `diagramMode === 'statemachine'`, compute `worldX` and `worldY`, then set `canvasContextMenu`.
* Render a floating context menu with:
  * "Add State"
  * "Add Junction"
  * "Add X-Bridges State"

---

## 4. Verification & Testing Plan

### 4.1 Adapter & Capability Unit Tests
* **Tree capabilities parity test**: Ensure `smAdapter.capabilities(['root'])` returns only `state`, `junction`, `xBridgesState`, and `stateMachine` diagram creation; verifies that pseudostates like `initial`, `choice`, `fork`, `join`, `terminate` are NOT returned.
* **X-Bridges creation test**: Ensure executing `createElement` with `xBridgesState` creates a valid `StateData` with `isXBridges: true`.

### 4.2 Canvas Context Menu Tests
* Test that right-clicking on `#adia-diagram-canvas` in State Machine mode displays the context menu with the 3 items.
* Test that clicking each item calls the respective creation function (`createState`, `createJunction`, `createXBridgesState`) with proper world coordinates.

### 4.3 C Code Generation Golden Verification
* Run existing test suites (`npm test -- src/utils/stateMachineCodeGenerator.golden.test.ts` and `npm test -- src/components/modelExplorer`) to ensure zero regressions in C code generation and Model Explorer behaviors.
