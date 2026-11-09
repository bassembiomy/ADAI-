# Copy like Simulink in every canvas, and resizable panels

Planner/tester: Opus. Coding: Sonnet (copy, panel wiring), Haiku (ResizablePanel component).
Acceptance tests: `src/components/common/canvasCopy.test.ts`, `src/components/common/ResizablePanel.test.tsx`, and the
existing `src/components/xbridges/blockCopy.test.ts`, `src/utils/stateMachineClipboard.test.ts`.

## Findings
| Canvas | Copy today |
|---|---|
| X-Bridges | Fixed (shared controller, `blockCopy.ts`, `dragCopyController.ts`) |
| V-Lab | Same two-listener right-drag as X-Bridges had (stuck gesture, stray copies). Ctrl+V: shallow `data`, `data` keeps no new id, no lines, same +40 every paste, same labels |
| OPM (ENTROPY) | Ctrl+C deep copy; Ctrl+V +35 every paste, same names; no right-drag / Ctrl+drag copy |
| State Machine | Right-drag clones only the dragged states: a composite state loses its children, transitions between copied states are lost, names become `Name_copy`; no Ctrl+drag, no Esc. Ctrl+C/Ctrl+V uses `stateMachineClipboard.ts`, which already copies children, layers and internal transitions |
| SysML diagrams | Right-drag goes through the model command `buildSysmlCloneElementsCommand` (gateway) — unchanged |

Panels: only HIL (`ResizableSplitPane`) and OPM (`OpmDockShell`) resize. The application shell (Hierarchy 256 px,
Variables 288 px, Properties 352 px, Scope 224 px) and the X-Bridges (Library 275 px, Properties 320 px, Problems list)
and V-Lab (Library 288 px, Properties) panels have fixed sizes.

## Work packages

### WP1 (Sonnet) — shared copy module
Move `src/components/xbridges/blockCopy.ts` and `dragCopyController.ts` to `src/components/common/canvasCopy/`; keep the
X-Bridges paths as re-exports (the X-Bridges tests import them). Add node shapes: `XBRIDGES_NODE_SHAPE` (label
`data.label`, nesting `data.parentId`, default), `VLAB_NODE_SHAPE` (same fields; params may be `{ value }` objects),
`OPM_NODE_SHAPE` (label `data.name`, nesting the React Flow node `parentId` and `data.parentId`). `copyBlocks(…, { shape })`
and `DragCopyHost.shape` select it. Unique names, deep clone (functions by reference), descendants of a copied container,
internal lines only — for every shape.

### WP2 (Sonnet) — V-Lab and OPM
- V-Lab (`src/components/vlab/VLabWorkspace.tsx`): replace the right-drag effects (`rightCopyGestureRef`,
  `rightClickDrag`…, `beginRightDragCopy` import) with the controller exactly like X-Bridges (window listeners registered
  once, capture-phase mousedown for right-drag and Ctrl+left-drag, Esc, context-menu suppression, one history entry, one
  save). Ctrl+C keeps a deep snapshot of the selection and its internal lines; Ctrl+V uses `copyBlocks` with cascading
  40 px offsets. Keep the existing "Ctrl+C with nothing selected toggles the panels" behaviour.
- OPM (`src/components/entropy/EntropyWorkspace.tsx`): add right-drag / Ctrl+drag copy with the controller
  (`OPM_NODE_SHAPE`), and make Ctrl+V use `copyBlocks` (unique names, cascading offsets). Keep OPM semantics: copying an
  object copies its states; links are copied only when both ends are copied; respect OPM's own history/save functions.

### WP3 (Sonnet) — State Machine canvas (`src/App.tsx`)
`src/utils/stateMachineDragCopy.ts`: `dragCopyStates(model, sourceIds, { layerId, drop })` built on
`createStateMachineClipboard` / `pasteStateMachineClipboard`, returning the full new `states`, `junctions`, `transitions`,
`layers` and `newTopLevelStateIds`, with unique names within the target layer (Name → Name1) and the top-left of the
copied group at `drop`. The right-drag in App.tsx uses it (states and junctions of the State Machine; the SysML branch is
unchanged). Add Ctrl+left-drag on a state, Esc to cancel, and keep a drag outline/preview if one exists. Pasting with
Ctrl+V gets unique names too if `pasteStateMachineClipboard` does not already provide them (check its test first).

### WP4 (Haiku) — `src/components/common/ResizablePanel.tsx`
As the tests define: props `id`, `label`, `edge` ('left' | 'right' | 'top' | 'bottom' — the edge the handle is on),
`defaultSize`, `minSize`, `maxSize`, optional `onSizeChange`, `className`, `style`, any `data-*`; renders the panel with
`width` (left/right) or `height` (top/bottom) in px and a handle (`role="separator"`, `aria-label="Resize {label}"`,
`aria-orientation` vertical for left/right, horizontal for top/bottom, `aria-valuenow/min/max`, `tabIndex 0`,
`style.cursor` col-resize / row-resize, 6 px hit area on that edge, a visible highlight on hover/drag in the app theme).
Mouse down + window mousemove/mouseup; clamped; `document.body.style.cursor` and `user-select: none` while dragging;
double-click restores the default; ArrowLeft/Right (vertical) or ArrowUp/Down (horizontal) step 16 px, Shift 64 px; size
stored under `adia.panel.{id}` in localStorage inside try/catch.

### WP5 (Sonnet, after WP4) — apply panels
Wrap the docked panels with `ResizablePanel` and these ids: `shell.hierarchy`, `shell.variables`, `shell.properties`,
`shell.scope` (App.tsx or a shell component), `xbridges.library`, `xbridges.properties`, `xbridges.problems`,
`vlab.library`, `vlab.properties`. Keep collapse buttons working (collapsed panels hide the handle). Canvas areas must
re-measure (React Flow fits the new space). Help: describe resizing panels and copying in each module's help; keep
`src/help` green with the help tooling.
