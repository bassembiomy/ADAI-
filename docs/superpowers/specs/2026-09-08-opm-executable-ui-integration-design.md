# OPM Executable UI Integration & Visual Styling Design

- **Date:** 2026-09-08
- **Topic:** Integration of OPM Executable Properties (Link Guards, State Behaviors, and Typed Object Attributes) into the OPM Inspector UI with ADAI Glassmorphic Visual Styling
- **Status:** Approved

---

## 1. Overview & Problem Statement
The OPM (Entropy) workspace in ADAI provides ISO 19450 conceptual modeling and is backed by an embedded execution engine (`src/engine/opm/`). An execution properties implementation exists in `src/components/entropy/OpmExecutionPropertiesPanel.tsx`, but it was unmounted. As a result:
- When a **Link** is selected, the right panel only shows `Link ID` and `Link Role`. Users cannot enter guard conditions, triggers, delays, or state transitions.
- When a **State** is selected, the panel only shows its `Name`. Users cannot specify `Initial State`, `Terminal State`, `Timeout (ms)`, `Entry Actions`, or `Exit Actions`.
- When an **Object** is selected, attributes are plain string key-value pairs rather than typed executable variables (`bool`, `int32`, `uint32`, `float32`, `enum`).
- When a **Process** is selected, users cannot configure execution activation, guard conditions, or action assignments.

This design specifies the complete integration of executable fields directly into the existing `OpmRightPanelContent` inspector cards (Option A: Unified Contextual Sections), restyled to match the exact glassmorphic visual identity and color language of ADAI.

---

## 2. Visual Theme & Styling Guidelines ("ADAI Identity")

All newly integrated inspector sections adhere to ADAI's design system:
- **Card Containers:** `bg-[#16161a]/95 backdrop-blur-md border border-white/10 rounded-xl shadow-xl p-3.5`
- **Sub-cards & Collapsible Blocks:** `bg-[#111115] border border-white/5 rounded-lg overflow-hidden`
- **Input Fields & Dropdowns:** `bg-[#0e0e11] border border-white/10 rounded-lg px-2.5 py-1.5 text-white text-xs font-mono focus:border-orange-500 focus:outline-none`
- **Labels & Headers:** `text-[10px] text-gray-400 uppercase font-bold tracking-wider`
- **Monospace Expression Inputs:** Code-friendly styling with placeholder cues (e.g. `ready == true && temp < 100`)
- **Accent Color Hierarchy:**
  - **Sky Blue (`#38bdf8` / `text-sky-400` / `border-sky-500`):** Links, procedural connections, and Processes
  - **Amber / Orange (`#f97316` / `#fbbf24` / `text-orange-400`):** States, transitions, timeouts, and entry/exit actions
  - **Emerald Green (`#10b981` / `text-emerald-400` / `border-emerald-500`):** Objects, typed attributes, and variables

---

## 3. UI Component Distribution

### 3.1 Link Inspector (Selected Edge)
When an edge is selected, `OpmRightPanelContent` renders:
1. **Link Header & Role:**
   - Link ID display.
   - Link Role selector dropdown (`consumption`, `result`, `effect`, `agent`, `instrument`, `trigger`, `condition`, `aggregation`, etc.).
2. **Execution & Guard Section:**
   - **Guard Expression (`guard`):** Text input for boolean logic (e.g., `temp >= 100 && ready == true`).
   - **Event Trigger (`eventId`):** Select dropdown populated from `executionConfig.events` (or `-- none --`).
   - **Timing & Priority:** 2-column grid containing **Delay (ms)** and **Priority** numeric inputs.
3. **State Transition Section:**
   - **Owner Object ID (`transition.ownerObjectId`):** Text input (or auto-suggested object ID).
   - **Target State ID (`transition.targetStateId`):** Destination state activated when the link fires.
   - **Source State ID (`transition.sourceStateId`):** Optional source state filter.
4. **Action Assignments Table:**
   - List of staged assignments (`=`, `+=`, `-=`, `*=`, `/=`).
   - `+ Add Assignment` button to append variable mutations directly to the link.

### 3.2 State Inspector (Selected State Node)
When a state node is selected, `OpmRightPanelContent` renders:
1. **State Header & Flags:**
   - State Name input.
   - Initial State toggle checkbox (with amber badge indicator).
   - Terminal State toggle checkbox.
2. **Timeout Settings:**
   - 2-column grid: **Timeout Duration (ms)** numeric input and **Timeout Event** select dropdown.
3. **Behavior Script Blocks:**
   - **Entry Actions (`entryAssignments`):** Collapsible section with assignment rows executed upon state entry.
   - **Exit Actions (`exitAssignments`):** Collapsible section with assignment rows executed upon state exit.
   - Inline add/delete/edit with target attribute selector, operator, and expression.

### 3.3 Object Inspector & Variables (Selected Object Node)
When an object is selected, `OpmRightPanelContent` upgrades the Attributes card to a typed variable manager:
1. **Typed Attributes / Variables:**
   - List of defined attributes showing:
     - Display name + generated C identifier (`cIdentifier`).
     - Type selector (`float32`, `int32`, `uint32`, `bool`, `enum`).
     - Initial value editor (checkbox for boolean, numeric input for scalars, member selector for enums).
     - Access mode (`readWrite` / `readOnly`) and overflow policy (`wrap`, `saturate`, `diagnostic`).
     - Move Up / Move Down buttons for reordering.
     - Delete button.
   - `+ Add Variable` button creating a new typed attribute with unique stable ID.

### 3.4 Process Inspector (Selected Process Node)
When a process node is selected:
1. **Activation Mode:** Select dropdown for `cyclic`, `triggered`, or `both`.
2. **Period (ms) & Priority:** 2-column numeric inputs.
3. **Guard Expression:** Expression controlling process execution.
4. **Action Assignments:** Staged writes executed when the process fires.

---

## 4. Architecture & Data Binding

- **State Storage:**
  - Node executable payload is stored on `node.data.execution` (`OpmObjectExecution`, `OpmStateExecution`, `OpmProcessExecution`).
  - Edge executable payload is stored on `edge.data.execution` (`OpmLinkExecution`).
  - Diagram-level events and enums are stored on `activeOpmConfig.executionConfig` (`OpmExecutionConfig`).
- **Callbacks:**
  - `EntropyWorkspace` supplies `onUpdateSelectionExecution` to update the active node or edge in `nodes` / `edges` state.
  - Updates automatically trigger history recording (`saveHistory`) and flow into simulation / code generation pipelines.
- **Diagnostics Integration:**
  - Controls carry `data-opm-path` attributes to preserve source-linked diagnostics focus.

---

## 5. Testing & Validation Strategy

1. **Unit & Component Tests:**
   - Add/update interaction tests in `src/components/entropy/__tests__/` verifying that selecting a link renders guard, event, and transition inputs.
   - Verify that selecting a state renders initial/terminal checkboxes, timeout inputs, and entry/exit assignment rows.
   - Verify that adding/updating an attribute or guard dispatches the updated execution payload to `onUpdateNodeProp` / `onUpdateSelectionExecution`.
2. **Visual & Styling Conformance:**
   - Ensure all inputs, cards, and buttons use ADAI palette classes (`bg-[#16161a]`, `border-white/10`, `text-orange-400`, `text-sky-400`, `text-emerald-400`).
3. **Regression Testing:**
   - Run existing test suites (`npm test src/components/entropy/` and `npm test src/engine/opm/`) to ensure no breaking changes in simulation, link rules, or compilation.
