# X-Bridges block copy with Simulink behaviour

Planner/tester: Opus. Executor: Sonnet. Acceptance tests: `src/components/xbridges/blockCopy.test.ts`.

## Reproduced defects (browser, before this work)
1. **Stuck right-drag.** After a right-drag copy is released, the next plain mouse move creates another copy that
   follows the pointer with no button pressed. Cause: two window listeners in separate effects; the first one's state
   update re-renders synchronously between listeners and removes the second (`handleUp`) before it runs, so the gesture
   refs are never cleared. The same effect can also create several copies during one fast drag (it checks a stale
   `rightClickDrag`).
2. Copies share their `data` objects (params, state, ports) with the original (shallow spread) — right-drag and Ctrl+V.
3. Copies keep the original's name; Simulink gives unique names (Gain → Gain1).
4. Right-drag copies only one block and no lines; Ctrl+drag does not copy; Escape does not cancel.
5. Repeated Ctrl+V pastes land on the same spot.
6. On Windows the context menu event comes after the right-button release; suppression ends at mouse-up.

## Simulink behaviour to follow
Right-drag a block (or Ctrl + left-drag) copies it — the whole selection when the dragged block is selected — with the
lines between copied blocks, and drops the copies where the mouse is released. Copies are independent and get unique
names. Esc during the drag cancels. Copy/paste behaves the same way for content; successive pastes are offset from one
another.

## Work packages
- **WP1 `src/components/xbridges/blockCopy.ts`** — `copyBlocks(nodes, edges, sourceIds, { offset })` and
  `uniqueBlockLabel(base, existing)` as the tests define: deep-cloned data (functions such as `onUpdate` kept by
  reference), unique ids (never repeated, even within one millisecond), unique labels when the original has one,
  internal edges copied with cloned data, subsystems copied with their descendants (children keep their positions,
  `parentId` remapped, only the top-level copies are offset and selected).
- **WP2 `src/components/xbridges/dragCopyController.ts`** — `createDragCopyController(host)`,
  `DRAG_COPY_THRESHOLD_PX` (6), `DragCopyHost` as the tests define. One state machine for pending → dragging → idle; copies
  are created once at the threshold; positions follow the pointer divided by the zoom; release (or a move with
  `buttons === 0`) drops; Escape restores the diagram; `contextMenu()` returns true while a gesture is pending/active and
  once more right after a drag ends.
- **WP3 workspace** (`XbridgesWorkspace.tsx`) — replace the two right-drag effects (`rightClickDrag`,
  `rightCopyGestureRef`, `pendingRightCopyNodeRef`, `isDraggingCopyRef`) and `handleNodeMouseDown` with the controller:
  window listeners registered once (stable refs, no dependency on gesture state), host bound to `setNodes`/`setEdges`,
  React Flow zoom, `saveHistory`-equivalent and the existing single save after the drop. Keep the 'copy' cursor while
  dragging. Make sure React Flow does not also move the original on Ctrl+left-drag. Ctrl+V uses `copyBlocks`; each
  successive paste of the same clipboard is offset by a further 40 px. Ctrl+C stores a deep snapshot so later edits of
  the original do not change what is pasted.
- **WP4 help** — update the X-Bridges help where copying is described (search `src/help` for right-drag / copy / paste)
  and keep `src/help` green, including `helpCoverage.test.ts` (use the repository's help tooling as before; revert edits
  it makes outside the files you change).

V-Lab (`src/components/vlab/VLabWorkspace.tsx`) uses the same gesture service; it is out of scope for this change.
