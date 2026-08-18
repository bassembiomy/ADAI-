# ADIA Top Toolbar & Header UI Modernization and Unification

## 1. Problem Statement & Motivation
The current top toolbar in ADIA contains essential controls (diagram modes, simulation controls, code generation, project I/O, engineering tools like PID/DOE/HMI, and integrations like Factory I/O & 3DEXPERIENCE). However, it suffers from several visual and UX inconsistencies:
- **Color Clutter**: Each button has a different arbitrary color scheme (orange, pink, blue, emerald, indigo, sky blue, grey), creating a jarring "rainbow" effect with no clear hierarchy.
- **Awkward Text Wrapping**: Narrow button dimensions cause text like `Generate C/H`, `Save As`, `Export Modules`, `HMI Panel`, `PID Tuner`, `DOE (RSM)`, `Factory I/O` to wrap awkwardly into two lines.
- **Disorganized Spacing**: Buttons are scattered across random dividers with mixed icon sizes, varying heights, and inconsistent hover states.
- **Weak Hierarchy**: Primary actions (Run/Pause, Generate C/H, Save) blend in with secondary utilities.

## 2. Proposed Architecture & Visual Design System

### 2.1 Unified Color & Surface Tokens
- **Toolbar Surface**: Deep neutral dark `#111114` with a clean bottom border `#222228`.
- **Segmented Group Containers**: Subtle dark container pill `bg-[#18181c] border border-[#27272f] rounded-lg p-1 flex items-center gap-1`.
- **Button Sizing & Typography**: Standardized `h-7 px-2.5 text-xs font-medium whitespace-nowrap flex items-center gap-1.5 rounded-md transition-all duration-150`.
- **Visual Hierarchy**:
  - **Primary Simulation**: Emerald green `bg-emerald-600 hover:bg-emerald-500 text-white font-semibold shadow-sm` for Start; Crimson `bg-rose-600 hover:bg-rose-500 text-white` for Pause.
  - **Primary Code Generation**: Warm amber/orange accent `bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 border border-orange-500/30`.
  - **Standard Tools & Project Actions**: Cohesive dark neutral `bg-transparent hover:bg-white/5 text-zinc-300 hover:text-white border border-transparent hover:border-zinc-700/50`.
  - **Active / Connected Indicators**: Crisp small status dots (e.g. Factory I/O connected indicator, AI validating spinner).

### 2.2 Semantic Groupings

```
[ ADIA + Project Name ] | [ Diagram Mode Switcher ] | [ Simulation & Validation ] | [ Code Gen & File ] | [ Engineering Tools & Gateways ] | [ Status & Help ]
```

1. **Brand & Asset Group**:
   - `(+)` New workspace asset button with smooth hover scale.
   - `ADIA` branding + clean inline editable project name pill + version badge.

2. **Diagram Mode Switcher**:
   - Segmented tab bar containing `State Machine`, `SysML BDD`, `Requirements`, `SysML IBD`, `X-Bridges`, `V-Lab`, `HIL`, `ENTROPY OPM`.
   - Active tab: `bg-zinc-800 text-zinc-100 shadow-sm font-medium`.
   - Inactive tabs: `text-zinc-400 hover:text-zinc-200`.

3. **Simulation & Validation Group**:
   - Tick rate input badge: `Tick: [ 20 ] ms`.
   - Controls: `Start/Pause`, `Step`, `Reset`.
   - Verification: `Validate` (Check syntax), `AI Check` (with clean spinner).
   - Safety Mode checkbox pill.

4. **Code Generation & Project I/O Group**:
   - `Generate C/H` (Highlighted action).
   - Project actions: `Save`, `Save As`, `Open`, `Export`, `Report` with consistent icons and single-line labels.

5. **Engineering Tools & Gateways Group**:
   - Unified secondary group:
     - `HMI Panel` (with display icon)
     - `PID Tuner` (with gauge/curve icon)
     - `DOE (RSM)` (with chart/matrix icon)
     - `Factory I/O` (with gateway badge/dot)
     - `3DEXPERIENCE` (with cloud icon)

6. **System Status & Help**:
   - Status indicators: Monospace indicators for `RUNNING/STOPPED`, `Time`, `States`, `Vars`.
   - `Help` button.

## 3. Implementation Plan Overview
1. Update [App.tsx](file:///g:/adia%20project/src/App.tsx) top toolbar header section (lines ~15170 to 15490).
2. Standardize button classes, icon sizing (`14px`), single-line formatting (`whitespace-nowrap`), and semantic grouping wrappers.
3. Test locally in the browser with `npm run dev` to verify responsive behavior, clean spacing, and no text wrapping.

## 4. Verification
- Verify toolbar renders seamlessly across window widths.
- Ensure all onClick handlers, modal toggles, and shortcuts retain 100% functionality.
- Confirm zero visual text wrapping or misaligned icons.
