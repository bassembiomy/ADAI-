# OPM Hybrid UX Upgrade Requirements

**Status:** Proposed for review  
**Scope:** OPM workspace UI, OPM blocks, connection links, selection feedback, and interaction flow  
**Audience:** Embedded engineers, system modelers, and new OPM users

## Product Goal

Make the OPM module feel simple on first use while preserving the precision required by engineering users. The default workspace shall expose only the most common actions. Advanced modeling, connection, simulation, and code-generation controls shall remain available through contextual inspectors and expandable panels.

## Design Principles

1. The canvas is the primary work surface; panels support the selected model element.
2. One interaction must have one clear visual result.
3. Warm amber identifies selection only; simulation activity, warnings, and errors use separate visual channels.
4. Invalid modeling actions are explained before they change the model.
5. Advanced controls are discoverable but do not compete with the diagram.
6. Existing OPM semantics, runtime behavior, and protected State Machine/X-Bridges engines remain unchanged.

## UX-01: Hybrid Workspace Layout

The workspace shall use three functional zones:

- **Primary toolbar:** selection, create Object, create Process, create State, create Link, undo/redo, save, and simulation controls.
- **Canvas:** the diagram, connection preview, minimap, zoom controls, and selection feedback.
- **Context panel:** properties and advanced actions for the selected node or link.

Secondary actions such as import, export, auto-layout, OPL synchronization, diagnostics, and code generation shall be grouped under named tabs or an Actions menu.

Acceptance criteria:

- A first-time user can identify the five primary modeling actions without opening a menu.
- No primary action is duplicated in multiple unrelated locations.
- The context panel opens only when an element is selected and can be collapsed without losing the selection.
- The layout remains usable at desktop widths of 1280px and above and at a reduced width of 1024px.
- The canvas never becomes unusably narrow because of an expanded advanced panel.

## UX-02: OPM Block Visual Language

Object, Process, State, and Requirement blocks shall have a shared visual system with type-specific differences.

Each block shall support:

- clear title and type indicator;
- physical/logical indicator where applicable;
- visible port count or state count when relevant;
- consistent padding, typography, corner radius, and minimum hit area;
- distinct visual states for default, hover, selected, active simulation, warning, error, and disabled.

Acceptance criteria:

- The block type is identifiable without opening the inspector.
- Text remains readable at the default zoom level.
- Long names truncate safely and remain available through a tooltip or inspector.
- A block has a minimum pointer target of 32px for interactive controls.
- Simulation activity does not reuse the selection glow or make the selected element ambiguous.

## UX-03: Warm Selection Feedback

Selecting any Object, Process, State, Requirement, or Link shall apply a consistent warm amber treatment.

For nodes, the treatment shall include a warm border, soft glow, readable selected label, and highlighted ports. For links, it shall include a warm path, marker, label/badge, and highlighted endpoint handles. The selected element shall be synchronized with the context panel.

Acceptance criteria:

- Selection is visible immediately after mouse, touch, or keyboard selection.
- The warm treatment is visible on dark and light display conditions and does not rely on color alone.
- Selected, hovered, actively simulating, warning, and error states are visually distinguishable.
- Selecting an element always opens or updates the matching inspector.
- After conversion, undo, redo, import, or model refresh, selection does not point to a stale element.
- Keyboard focus has an additional visible focus ring.

## UX-04: Smooth Connection Creation

Creating a connection shall provide continuous visual feedback from the selected source handle to the pointer and then to the candidate target handle.

The connection preview shall:

- use a smooth Bezier path;
- snap to compatible handles;
- show a positive state for valid targets;
- show a rejected state with a short reason for invalid targets;
- preserve the active semantic link type;
- avoid jitter when nodes move or the viewport is zoomed.

Acceptance criteria:

- The preview follows the pointer without visible lag during normal interaction.
- A valid connection can be completed only on a compatible target handle.
- Missing, reversed, duplicate, incompatible, or semantically invalid connections are rejected before model mutation.
- The same connection contract is used by preview validation and final commit.
- Escape, pointer cancellation, and clicking the canvas cancel an unfinished connection safely.

## UX-05: Link Presentation and Inspector

Each link shall show its semantic role through its label, line style, marker, and inspector. The renderer type shall remain an implementation detail and must not be replaced by the semantic role.

The Link Inspector shall show:

- link role;
- source and target names;
- source and target handles/ports;
- compatibility status;
- execution metadata when enabled;
- diagnostics and the action required to resolve them.

Acceptance criteria:

- A user can identify the semantic role of a selected link without reading raw data.
- Changing a link role validates the new role against both endpoint nodes and ports.
- Invalid role changes leave the original link unchanged and show a stable explanation.
- A valid role change updates the canvas and inspector together.
- Link labels and markers remain readable at normal zoom.

## UX-06: Block and Link Type Changes

The inspector shall provide a type selector for every convertible block and link. Conversion shall be staged when it may disable or remove incompatible data.

The confirmation state shall show:

- the current and requested type;
- affected properties, states, ports, or links;
- stable warning codes;
- Apply and Cancel actions.

Acceptance criteria:

- Cancel leaves nodes, links, metadata, and selection unchanged.
- Apply changes the model only after the user confirms.
- Conversion preserves IDs and compatible metadata.
- A converted block keeps valid existing relationships or marks affected relationships with diagnostics.
- A converted link remains rendered as an OPM link and stores its semantic role in the semantic data field.

## UX-07: Contextual Advanced Controls

The default inspector shall show common properties first. Advanced sections shall be expandable for:

- ports and port types;
- states and state execution;
- process execution;
- link execution;
- diagnostics and source navigation;
- simulation configuration;
- C generation and qualification.

Acceptance criteria:

- Common name/type properties appear before advanced configuration.
- Opening one advanced section does not unexpectedly close unrelated user input.
- Advanced controls have labels, helper text, validation messages, and keyboard access.
- The panel remembers expanded sections during the current workspace session.

## UX-08: OPM Simulation Controls

Simulation controls shall be visually separated from modeling controls. The OPM simulation tick shall be editable in an OPM-specific configuration area and shall not silently change the State Machine tick.

The simulation area shall expose, at minimum:

- Run/Pause;
- Step;
- Reset;
- OPM tick in milliseconds;
- max ticks;
- max events per tick;
- current simulation time and status;
- diagnostics and trace access.

Acceptance criteria:

- Invalid values are rejected with an inline message and the previous valid value remains active.
- OPM and State Machine tick values can differ in the same session.
- The selected block/link remains visually distinguishable while simulation is running.
- A failed simulation step does not partially update the displayed model.

## UX-09: Code Generation Flow

Code generation shall be presented as a guided engineering flow:

1. Validate model.
2. Generate C artifacts.
3. Review diagnostics and manifest.
4. Verify host compile/runtime/parity.
5. Download or export only after successful verification.

Acceptance criteria:

- The Generate button is disabled or fails visibly when blocking diagnostics exist.
- Generated artifacts are labeled pending until qualification succeeds.
- Empty or partially generated artifact sets cannot be downloaded.
- The panel shows model fingerprint, OPM tick, resource limits, compiler flags, and qualification status.
- Code-generation errors navigate to the relevant block, link, or property where a source path exists.

## UX-10: Diagnostics and Feedback

The workspace shall use consistent inline and global feedback:

- amber for warnings and confirmation-required actions;
- red for rejected actions and blocking errors;
- blue/neutral for information;
- green for successful completed actions;
- warm amber glow exclusively for selection.

Acceptance criteria:

- Every rejected modeling action gives a reason within the active context.
- Notifications do not disappear before a user can read them or open the related diagnostic.
- Diagnostics include stable code, severity, element ID, and property path when available.
- Selecting a diagnostic focuses the corresponding control or shows a visible fallback message.

## UX-11: Accessibility and Keyboard Interaction

The complete modeling flow shall be usable without a mouse.

Required keyboard behaviors:

- Delete: delete selected element after confirmation where needed;
- Ctrl/Cmd+Z and Ctrl/Cmd+Y: undo/redo;
- Escape: cancel connection, conversion, or open confirmation;
- Enter: confirm focused action;
- Tab/Shift+Tab: traverse toolbar, canvas actions, and inspector controls.

Acceptance criteria:

- All buttons and selectors have accessible names.
- Focus order follows the visual workflow.
- Focus remains visible against the dark workspace.
- Color contrast meets WCAG AA for text and essential controls.
- Status is not communicated by color alone; labels, icons, or text are also used.

## UX-12: Performance and Stability

The UI shall remain smooth for normal engineering models and shall avoid unnecessary whole-canvas updates.

Acceptance criteria:

- Selecting one element does not recreate unrelated blocks or links.
- Dragging a block does not cause visible link flicker.
- Connection preview remains responsive while the canvas contains at least 100 nodes and 200 links.
- Inspector updates do not reset viewport zoom, pan, or expanded sections.
- No browser console errors occur during selection, conversion, connection, simulation, or code generation.

## Protected Boundaries

This UX upgrade shall not modify the semantics or implementation of the existing State Machine or X-Bridges runtime and code-generation engines. OPM simulation and OPM C generation remain separate modules and communicate through explicit OPM contracts only.

## Required Verification

The implementation shall include:

- unit tests for selection-state derivation, conversion staging, port validation, and configuration validation;
- component tests for node selection, link selection, inspector synchronization, and confirmation cancel/apply;
- interaction tests for valid and invalid connection creation;
- an end-to-end browser smoke flow covering selection, warm feedback, conversion, connection, simulation, diagnostics, and code generation;
- TypeScript, OPM test, C qualification, and production-build checks;
- a boundary test proving that protected State Machine/X-Bridges generator and runtime paths remain untouched.

## Definition of Done

The UX upgrade is ready when a new user can create and connect a small OPM model without guidance, an embedded engineer can inspect and qualify the generated C artifacts without leaving the OPM flow, every selection and rejected action is understandable, and all acceptance criteria above pass without changing protected engines.
