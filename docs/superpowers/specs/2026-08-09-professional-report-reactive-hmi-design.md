# Professional Report Generation and Reactive HMI Design

**Date:** 2026-08-09

**Status:** Approved

**Scope:** Report-generation workflow, generated engineering report, reactive HMI workspace, embedded report HMI, and shared chart presentation

## 1. Objective

Redesign ADIA's report-generation and reactive HMI experiences as a cohesive, professional engineering interface. The generated report must be formal, light, and print-ready. Its embedded interactive HMI must use a dark, high-contrast operations-console visual language. Engineering data, SysML diagrams, state-machine diagrams, analysis results, and charts must remain readable on screen and in print.

The redesign must preserve existing project data and saved-file compatibility. Presentation logic may derive summaries and chart-ready series, but it must not mutate or fabricate engineering data.

## 2. Selected Direction

The selected visual direction is an operations console with restrained cyan accents, strong live-status visibility, and dense but readable telemetry. This direction applies to the reactive HMI and the embedded interactive simulator.

The report uses a complementary formal document style:

- White print-oriented pages with dark navy text and restrained cyan accents.
- Clear document identity, revision metadata, section numbering, and table of contents.
- Professional typography, spacing, captions, legends, and evidence tables.
- A contained dark HMI figure and interactive simulator that remain visually distinct from the report body.
- Print rules that remove interactive controls while keeping the HMI, diagrams, charts, labels, and legends legible.

## 3. Architecture

The redesign will extract the current report and HMI responsibilities from the monolithic application surface into focused modules. Exact file boundaries may follow existing repository conventions, but the responsibilities must remain separate.

### 3.1 Report modules

- **Report configuration:** Collect project name, author, revision, document identifier, and included sections. Validate required metadata and show the report's expected contents before generation.
- **Report view-model builder:** Derive factual report summaries, diagram inputs, tables, and chart series from the authoritative project model.
- **Report document composer:** Assemble the report's numbered sections, captions, warnings, tables, diagrams, charts, interactive HMI, and simulation runtime into self-contained HTML.
- **Report presentation theme:** Provide screen and print styles, typography, page-break policies, diagram framing, table formatting, badges, and chart tokens.
- **Report section renderers:** Keep requirements, BDD, IBD, state-machine, X-Bridges, HMI, verification, and appendix rendering independently understandable and testable.

### 3.2 HMI modules

- **Workspace shell:** Own the toolbar, Edit/Run mode, connection and simulation status, component palette, canvas, and inspector layout.
- **Component canvas:** Render and manipulate HMI components while preserving current position, size, binding, and behavior semantics.
- **Properties inspector:** Edit component metadata, variable bindings, ranges, presentation, thresholds, and chart signal configuration.
- **Telemetry history:** Maintain bounded runtime history for chartable signals and reset it safely when the project or runtime changes.
- **Signal pinning:** Store an optional ordered list of pinned signal identifiers. Resolve automatic defaults when that list is empty or invalid.
- **Operations widgets:** Render professional numeric displays, trend charts, gauges, controls, lamps, status indicators, and event history.

### 3.3 Shared chart modules

- Provide screen and print chart themes with stable semantic colors.
- Format values, units, timestamps, axes, legends, tooltips, and thresholds consistently.
- Compute safe domains for empty, single-point, constant, invalid, and differently scaled series.
- Keep report chart preparation independent from the runtime chart renderer so static print charts do not depend on browser interaction.

## 4. Compatibility and Data Ownership

Existing project models remain authoritative. The presentation layer reads requirements, blocks, parts, connectors, states, transitions, junctions, variables, layers, HMI components, X-Bridges data, and available telemetry without changing those objects.

Existing `hmiComponents` files must continue to load. New signal-pinning settings are optional. When no valid pinned signals are present, the system chooses sensible defaults from numeric variables already bound to visible HMI components, followed by other numeric variables in deterministic project order. Non-numeric variables are not selected for trend charts by default.

The generated report remains self-contained. It must not require a network connection to display project data, diagrams, static charts, or the embedded simulator.

## 5. Report Generation Workflow

The current basic dialog becomes a professional report configuration panel.

### 5.1 Metadata

The panel includes:

- Project name.
- Author or responsible engineer.
- Document revision.
- Optional document identifier.
- Generation date, populated automatically and displayed read-only.

Project name and author are required. Whitespace-only values are invalid. The user receives precise field-level guidance before generation.

### 5.2 Section selection

The panel presents the available sections with counts or availability states. Sections with no project data remain selectable but are clearly marked. The default selection includes every section with available data plus the executive summary and document metadata.

### 5.3 Preview and generation

The primary action generates a preview using the same document composition path as export. The preview provides print or save-to-PDF through the browser or Electron print path already used by the application. Generation failures remain in the dialog and do not discard entered metadata.

## 6. Report Structure

The report uses deterministic numbering and includes sections only when selected. Numbering is recalculated after selection so there are no gaps.

1. Cover and document control.
2. Executive engineering summary.
3. Requirements analysis and requirements diagrams.
4. SysML BDD diagrams and block inventory.
5. SysML IBD diagrams, ports, connectors, and interface inventory.
6. State-machine diagrams and behavioral analysis.
7. X-Bridges or control-model diagrams when available.
8. HMI design, bindings, and configuration completeness.
9. Interactive system prototype when HMI data exists.
10. Verification evidence, warnings, and derived test scenarios.
11. Appendices and detailed inventories where necessary.

The table of contents and section headings reflect the actual selected sections.

## 7. Engineering Summaries and Charts

The executive summary derives its metrics from available project data and may include:

- Requirement totals and status distribution.
- Requirement relationship or verification coverage.
- BDD block and relationship counts.
- IBD part, port, connector, and interface counts.
- State, transition, junction, layer, hierarchy, and parallel-region counts.
- Diagnostic and risk counts grouped by severity.
- HMI component and binding-completeness counts.
- X-Bridges model counts when present.

Charts must state their quantity and units. Important values are directly labeled when practical. Legends are retained only when multiple series or categories require them. Charts use print-safe colors with adequate grayscale contrast and never rely on color alone.

Telemetry trend charts are included only when runtime samples exist. If no samples are available, the report shows a formal statement that no runtime samples were recorded; it does not synthesize example data.

## 8. SysML and State-Machine Diagrams

### 8.1 Requirements diagrams

Requirements diagrams show requirement identity, title, status, verification state, and relevant relationships. Large models are divided into logical views with clear continuation captions.

### 8.2 BDD diagrams

BDD output shows blocks, stereotypes, value or property summaries where available, and typed relationships. A legend explains relationship notation used in the figure.

### 8.3 IBD diagrams

IBD output shows the owning block context, internal parts, ports, connectors, and available interface labels. Frames and captions identify the context of each diagram.

### 8.4 State-machine diagrams

The report renders every state-machine layer separately. Diagrams include states, parent states, terminal or safe-state semantics, junctions, transitions, guards, actions, hierarchy, history semantics, and parallel regions when present.

State-machine sections also include factual analysis already produced by the application's semantic analysis pipeline:

- Critical paths.
- Unreachable states.
- Deadlock, race, boundary, and corner-case diagnostics.
- Derived test scenarios and expected outcomes.
- Structural counts and hierarchy summaries.

Analysis that could not run because semantic validation failed is described as unavailable; it is never represented as passing evidence.

### 8.5 Diagram readability policy

Report diagrams use independent presentation coordinates and do not mutate canvas positions. Labels, nodes, and edges must remain readable at the target print width. Large diagrams are split by semantic context, layer, hierarchy, or logical grouping rather than reduced below readable text size. Each split view includes a caption, view identifier, element count, and relevant cross-reference.

## 9. Reactive HMI Workspace

### 9.1 Workspace composition

The HMI workspace uses the selected dark operations-console design and contains:

- A top toolbar with dashboard identity, Edit/Run mode, runtime or connection state, sample rate, and principal actions.
- A component palette and pinned-signal list.
- A responsive canvas with restrained grid treatment.
- A properties inspector for the selected component or chart.
- Clear empty, disconnected, paused, warning, and alarm states.

### 9.2 Edit mode

Edit mode preserves current component creation, dragging, resizing, deletion, and variable-binding behavior. Selection handles and boundaries are visible only while editing. Layout operations must not write runtime values.

### 9.3 Run mode

Run mode removes editing affordances and enables safe component interaction. It displays live runtime status and updates bound widgets without obscuring labels or units. Controls remain keyboard accessible and expose their active or pressed state.

### 9.4 Pinned telemetry

Users can choose and order important numeric signals. The trend chart displays pinned series with:

- Quantity and unit labels.
- A readable time axis.
- Stable per-series identity.
- A wrapping legend with series visibility controls.
- Cross-series hover values at the same time position.
- Optional warning or alarm thresholds when configured.
- Adjustable recent-history windows.
- Pause or resume of chart motion without pausing the underlying simulation.

When differently scaled series would make a shared axis misleading, the UI separates them into compatible groups or small multiples instead of compressing one series into an unreadable line.

## 10. Embedded Interactive HMI

The report's interactive simulator uses the same operations-console visual rules as the workspace while remaining self-contained. It includes:

- Run or pause, step, and reset actions.
- HMI controls and bound readouts.
- Active-state and variable dashboard.
- Pinned telemetry trends when runtime history is available in the embedded session.
- Event history with timestamps and clear transition or runtime-error entries.

In print, controls are hidden or rendered as non-interactive evidence labels. The dark simulator is framed and captioned as an engineering figure with sufficient contrast.

## 11. Empty, Warning, and Failure States

- Empty selected report sections show a deliberate `No data available for this section` message.
- Broken references are collected into a report-generation warning summary while valid sections still render.
- Invalid numeric samples are excluded from plotted domains and counted in a data-quality note.
- Missing units are displayed as unitless rather than guessed.
- A single valid sample is rendered as a labeled point with a safe padded domain.
- Constant-value series receive a padded vertical domain so the line remains visible.
- Invalid pinned identifiers are ignored and replaced through deterministic default resolution.
- Telemetry subscriptions and timers are cleaned up when components are removed, projects change, previews close, or runtimes reset.
- Generation failures keep the configuration dialog open and preserve user input.

## 12. Responsive and Print Behavior

The report preview supports desktop and narrow widths without overlapping titles, tables, diagrams, charts, or controls. Wide engineering tables may use contained horizontal scrolling on screen, but print output must use wrapping, column selection, or landscape page treatment appropriate to the section.

Print output must:

- Use formal light styling.
- Remove navigation and interactive-only controls.
- Preserve chart legends, axes, labels, and units.
- Avoid splitting headings from their following content.
- Avoid splitting small figures, diagram captions, and critical table rows.
- Repeat table headings when supported.
- Assign intentional page breaks before major engineering sections.
- Keep the dark HMI figure within page bounds without shrinking labels below readable size.

## 13. Testing Strategy

### 13.1 Unit tests

- Report metric derivation.
- Deterministic section numbering and selection.
- Metadata validation and escaping.
- Signal default selection and invalid-pin recovery.
- Value, unit, timestamp, and axis formatting.
- Chart domain handling for empty, single-point, constant, invalid, and multi-scale series.
- Compatibility with existing HMI project data that has no pinning settings.

### 13.2 Component tests

- Report configuration validation and retained input after failure.
- Section selection and availability states.
- Edit/Run mode behavior.
- Signal pinning, ordering, visibility toggles, and empty states.
- HMI controls, status indicators, and chart interactions.
- Cleanup when changing projects or unmounting runtime surfaces.

### 13.3 Integration and document tests

- Generate a self-contained report from representative requirements, BDD, IBD, state-machine, X-Bridges, HMI, and telemetry fixtures.
- Assert the presence and ordering of selected sections, captions, warnings, and diagram content.
- Verify the embedded simulator initializes from the authoritative migrated state-machine model.
- Confirm generated HTML does not require network resources for project evidence.

### 13.4 Visual verification

- Inspect report preview and HMI at desktop and narrow widths.
- Render representative report pages to PDF or page images.
- Verify cover, table of contents, summaries, tables, SysML diagrams, state-machine diagrams, charts, HMI figure, page breaks, and legends.
- Confirm print and screen themes retain readable contrast and do not clip content.

### 13.5 Regression gate

Run the relevant unit and component tests, the project TypeScript check, and the production build. Existing report semantics, project import compatibility, HMI component behavior, and state-machine analysis must remain intact.

## 14. Out of Scope

- Changing authoritative SysML, state-machine, X-Bridges, or HMI model semantics.
- Inventing telemetry or verification results when evidence is absent.
- Replacing the existing project file format with a new mandatory schema.
- Adding remote report hosting, collaborative review, or cloud data storage.
- Rebuilding unrelated application workspaces.

## 15. Acceptance Criteria

The design is complete when:

1. The report configuration UI is formal, validates metadata, and clearly communicates included sections.
2. The generated report is self-contained, light, print-ready, and professionally structured.
3. Requirements, BDD, IBD, state-machine, and available X-Bridges diagrams are readable and correctly captioned.
4. State-machine analysis and test evidence distinguish successful analysis from unavailable or failed validation.
5. Engineering summaries and static charts are factual, labeled, and readable in print.
6. The reactive HMI uses the approved dark operations-console design in both workspace and embedded report contexts.
7. Users can configure pinned numeric signals, and deterministic defaults appear when no valid pins exist.
8. Live charts expose units, axes, legends, aligned hover values, thresholds, and safe behavior for difficult datasets.
9. Existing project files without new presentation settings continue to load and behave correctly.
10. Automated checks and visual print verification pass without regressions in touched behavior.
