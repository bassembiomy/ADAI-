# X-Bridges: diagnostics pop-up on run and status bar

Planner/tester: Opus. Executor: Sonnet.
Acceptance tests: `src/components/xbridges/diagnostics/xbDiagnostics.test.tsx`; keep `src/help` (incl. helpCoverage)
and `src/components/xbridges` green.

## Today
- Diagnostics appear only in the small floating "DIAG" panel; it opens on a compile error but shows the raw message,
  not what it means or what to do.
- Runtime diagnostics raised while running (DIVIDE_BY_ZERO, MATH_DOMAIN_ERROR, LOGIC_NAN_INPUT, NUMERICAL_INSTABILITY,
  BLOCK_RUNTIME_FAULT, ALGEBRAIC_LOOP_NOT_CONVERGED) never reach the UI when the run is on the main thread (only the worker
  path forwards `res.diagnostics`).
- There is no status bar.

## Target behaviour
- **Pop-up on run.** When a run starts (configuration, compile) or while it runs, every diagnostic that was not already
  shown in this run appears in a pop-up at the top right of the canvas: counts, up to three items with code, message
  and meaning, "+N more", **View all** (opens the status-bar list) and **Dismiss**. Errors use `role="alert"` and stay until
  dismissed; warnings/info only use `role="status"` and hide after 8 s.
- **Status bar** along the bottom of the canvas, always visible (`role="status"`, name "X-Bridges status bar"): run status
  (Idle, Running, Paused, Stopped, Failed), simulation time `t = 1.250 s`, solver, stop time, fixed step, and problem
  counts ("1 error", "2 warnings", or "No problems"). A **Problems** toggle (`aria-expanded`) opens the list
  (`role="list"`, name "Problems"), errors first; each row shows severity, code, message, the meaning from the help
  reference, **Show block** (selects and reveals the block; only when the diagnostic names blocks) and **Help** (opens the
  X-Bridges Simulation or Code Generation chapter at its diagnostics section).
- Meanings come from `XBRIDGES_SIMULATION_DIAGNOSTIC_GUIDANCE` / `XBRIDGES_EMBEDDED_DIAGNOSTIC_GUIDANCE` with the
  `Error: `/`Warning: `/`Info: ` prefix removed; a code without an entry says it has no help entry yet.

## Work packages

### WP1 — model (`src/components/xbridges/diagnostics/xbDiagnosticsModel.ts`)
`describeDiagnostic`, `countDiagnostics`, `mergeDiagnostics`, `newDiagnostics` as the tests define. Identity of a
diagnostic: code + sorted blockIds + message.

### WP2 — `XbridgesStatusBar.tsx`, WP3 — `XbridgesDiagnosticPopup.tsx`
Props as the tests use them. Styling consistent with the workspace (dark theme tokens used in XbridgesWorkspace.tsx;
error red, warning amber, info slate). Layout must not cover the React Flow controls or the minimap; the list is
scrollable with a sensible max height.

### WP4 — workspace integration (`src/components/xbridges/XbridgesWorkspace.tsx`, `src/App.tsx`)
- Diagnostics for a run: reset at run start; accumulate configuration, compile (main thread and worker), worker step
  diagnostics, and the main-thread `engine.diagnostics` (read them on the throttled UI update and when the run ends) —
  merge, never drop earlier items of the run. They stay after a stop.
- Pop-up shows `newDiagnostics(alreadyAnnounced, current)`; Dismiss and auto-hide clear it; View all expands the status bar.
- Status: Idle before the first run, Running, Paused, Stopped (stop time reached or user stop), Failed (an error ended or
  prevented the run). Time is the simulation time.
- Show block: select the block on the canvas and bring it into view (React Flow `fitView` on the node or equivalent).
- Help: new optional prop `onOpenHelp(topicId, sectionId)`; App passes its existing `handleOpenHelp`.
- The toolbar "DIAG" button now toggles the status-bar problem list; remove the duplicate floating list.

### WP5 — help
Document the pop-up and status bar in the `xbridges-simulation` chapter (`errors` section) and give the new controls
help entries through the repository's help tooling so `src/help/helpCoverage.test.ts` stays green (0 unreviewed).
