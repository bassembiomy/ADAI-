# Workspace Tab/Canvas Parity and Canvas Drilldown Design

## Goal

Keep the upper workspace tab highlight and the rendered canvas in exact agreement, including after repeatedly closing tabs, and support professional model navigation by double-clicking canvas symbols that own or reference diagrams.

## Interaction Contract

- Exactly one visible workspace tab is active whenever at least one tab remains.
- The active tab is the source of truth for the canvas. Activating a tab must load that tab's workspace or exact diagram before the UI presents it as selected.
- Closing the active tab activates the nearest surviving neighbor: prefer the tab now occupying the closed tab's index, otherwise use the preceding tab.
- Closing inactive tabs does not change the active tab or canvas.
- When only one tab remains, its canvas must be rendered; a highlighted State Machine tab may never leave a Requirements canvas visible.
- Double-clicking a canvas symbol that owns or explicitly references a diagram opens and activates that exact diagram in the upper tab strip.
- If the destination diagram is already open, reuse and activate its existing tab instead of creating a duplicate.
- Double-clicking a symbol without an owned or referenced diagram remains local: select it and expose its properties without changing tabs.
- Single-click remains selection-only.

## Architecture

Introduce one workspace-tab activation path and route tab clicks, close fallbacks, and diagram drilldown through it. The activation path accepts a typed workspace target, updates the appropriate canvas navigation state, and updates the unified active-tab state as one user-level operation.

Existing exact-diagram opening logic remains responsible for validating diagram IDs and setting diagram-specific context. Workspace-file activation remains responsible for loading module state. The centralized activation path coordinates those existing mechanisms; it does not replace the canonical SysML repository or duplicate model data.

Tab closing derives the next active tab from the current ordered, unified visible tab sequence. It invokes the same activation path used by direct clicks. This removes the current split update in which the visual active tab can change while the canvas mode remains stale.

Canvas components expose a double-click navigation callback with an element identifier. Resolution is semantic and deterministic: navigate only when the element has a unique owned diagram or explicit diagram reference. The existing exact-ID opener then provides tab deduplication and activation.

## Error and Edge Handling

- Unknown, deleted, or stale diagram IDs are rejected without adding a tab or changing the current canvas.
- An element with no navigable diagram performs no navigation.
- If multiple diagrams are associated without a designated target, do not guess; preserve the current view. A future chooser can address that case separately.
- Closing the final visible tab may retain or recreate the product's required default State Machine workspace, but the resulting highlighted tab and canvas must be synchronized.

## Verification

Add regression coverage that:

1. Opens a Requirements diagram, closes tabs until State Machine is the last highlighted tab, and asserts that the State Machine canvas is rendered.
2. Closes an active middle tab and confirms the nearest neighbor is both highlighted and rendered.
3. Double-clicks an element with an owned diagram and confirms the exact diagram tab is opened and its canvas rendered.
4. Double-clicks the same element again and confirms no duplicate tab is created.
5. Double-clicks an element without a diagram and confirms the active tab/canvas do not change.
6. Preserves the existing invariant that only one tab has `aria-selected="true"`.

## Scope

This change covers workspace navigation consistency and diagram drilldown only. It does not redesign the property editor, add a multi-diagram chooser, or alter model ownership semantics.
