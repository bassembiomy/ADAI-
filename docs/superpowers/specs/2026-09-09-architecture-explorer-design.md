# ADIA Architecture Explorer Design

## Goal

Add a read-only, interactive in-app page that explains ADIA's software architecture, the data types used across the system, when those data types are used, and the mechanisms that reduce freezing, crashing, unsafe execution, and invalid project state.

## Scope

The page will be implemented as a new architecture-explorer view within the existing React/Vite application. It will not alter existing editor, simulation, persistence, HIL, or code-generation behavior.

The content is grounded in the existing repository architecture reference (`docs/architecture-diagram.html`) and current module boundaries.

## User experience

The page is opened from the existing Help & Documentation modal as a dedicated Help topic named “Software Architecture Explorer”. The Help topic includes a short introduction and an action that switches the modal into the full interactive explorer view. The page/view opens with a title, short explanation, legend, and controls for search, reset, and protection-overlay mode. The main area contains a layered architecture diagram. Each layer contains compact, clickable component cards.

Selecting a card opens an inspector panel containing:

- Component responsibility.
- Representative source/module location.
- Data types handled or emitted.
- When those data types are used.
- Relevant safeguards against freezing, crashing, corruption, or unsafe execution.

The protection-overlay mode visually emphasizes safety mechanisms and draws the user’s attention to the paths that protect the application. Search filters layers and cards by component name, data type, or protection term. The layout must remain usable on narrower screens by stacking the inspector below the diagram. Existing Help topic navigation remains available, and closing Help returns to the same editor state.

## Architecture content

The overview will use six layers:

1. Shell and entry: Electron, React app shell, UI toolkit, AI assistants.
2. Editor workspaces: SysML, State Machine, VLab, X-Bridges, HIL, Entropy/OPM, and DOE.
3. Integrity, persistence, and reporting: validation, cascade consistency, snapshots, `.adia` files, and exports.
4. Simulation and code-generation engines: VLab, X-Bridges, state-machine C generation, OPM C generation, DOE/GMDH, embedded/HIL generation, target packs, and toolchains.
5. HIL, targets, and external gateways: build/flash, policy gates, gateways/twins, and delivery formats.
6. Cross-cutting concerns: security, verification, and build/release.

Arrows between layers describe the canonical flow: edit → guard → snapshot/report → execute → deploy/observe → telemetry feedback.

## Data-type taxonomy

The inspector and legend will explain these categories:

- Domain model objects: blocks, ports, parts, connectors, relationships, states, transitions, junctions, OPM objects/processes, and lab models. Used while editing and rendering engineering diagrams.
- Runtime values: booleans, signed/unsigned integers, floating-point values, matrices, solver states, and simulation outputs. Used during simulation ticks, expressions, and control execution.
- Persisted project data: unified payloads, snapshots, migration inputs, and `.adia`/JSON content. Used for save/load, import/export, recovery, and report assembly.
- Telemetry and time-series data: serial frames, scope samples, traces, and HIL observations. Used during live simulation and hardware-in-the-loop monitoring.
- Generated artifacts: C source, runtime bundles, ELF/build evidence, HTML, PDF, DOCX, XLSX, and ZIP outputs. Used in code generation, verification, reporting, and delivery.
- Validation and safety results: error items, diagnostics, integrity findings, policy decisions, and verification reports. Used to block invalid or unsafe operations and present recovery guidance.

## Freeze/crash protection content

The protection view will group safeguards by failure mode:

- Invalid input and malformed files: input validation, JSON import validation, migration, sanitization, and safe parsing.
- Dangling or inconsistent model references: integrity services, cascade deletion, reconciliation, snapshots, and unsaved-change guards.
- Expensive or runaway work: bounded scope history, guarded simulation lifecycle, FPS monitoring, cancellation/reset controls, and separated engine boundaries where applicable.
- Runtime exceptions: React error boundary/global error panel, operation-error reporting, defensive defaults, and recoverable session reset.
- Unsafe expressions or generated code: restricted globals, generated-code verification, OPM verification, toolchain hash verification, and test gates.
- Unsafe hardware actions: deny-by-default HIL build/flash/probe policies, pin validation, recipes, environment checks, and trace comparison.
- Release regressions: TypeScript/Vite build checks, SAST/security scans, domain test suites, golden vectors, and zero-G CI.

## Visual design

Use the existing ADIA dark visual language: charcoal/navy surfaces, orange for primary interaction, cyan for data flow, green for verified protections, amber for policy-gated areas, and red only for failure states. Cards should use concise labels and icons, with enough contrast for technical reading. The diagram must avoid relying on color alone; labels and icons communicate status as well.

## Technical design

Create a focused React component and data model rather than adding architecture content directly into the already-large `App.tsx`. Add a typed `software-architecture` entry to `HelpData` and extend the existing `HelpModal` to render/open the explorer view for that topic. Architecture layers, cards, data types, and protections will be declared as typed static data so the renderer, Help entry, search, inspector, and overlay share one source of truth.

Interactions are local React state only. No network requests, persistence mutations, or runtime engine execution are required. Links to source locations may be displayed as repository paths but do not need to open files unless existing app navigation supports it.

## Verification

Verify with TypeScript compilation and the existing Vite build. Manually check: Help entry visibility, opening from Help, returning to other Help topics, initial rendering, card selection, inspector content, search filtering, protection overlay, reset behavior, narrow viewport stacking, and absence of changes to existing workspaces.

## Out of scope

- Replacing the existing static architecture HTML.
- Live process telemetry or performance instrumentation.
- Editing architecture metadata from the UI.
- New backend services or database storage.
- Changes to simulation, codegen, HIL, or security behavior.
