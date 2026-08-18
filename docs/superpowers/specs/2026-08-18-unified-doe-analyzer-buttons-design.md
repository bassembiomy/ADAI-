# DOE Analyzer Button & UI Modernization Design

## 1. Problem Statement
The DOE Analyzer Pro window currently uses disparate button styles:
- Model execution buttons (`Run RSM`, `Run GMDH`, `Run Taguchi`) use harsh solid orange defaults with no coherent segmented container.
- Top actions (`Save`, `Upload Data`, `Report`, `Close`) have inconsistent padding, generic styling, and a plain red `Close` text button without standard icons.
- Deployment / Export buttons (`Export to V-Lab`, `Export to X-Bridges`) have clashing colors and awkward text wrapping.
- Plot Type selectors in the sidebar and over the 3D canvas use mismatched button heights, borders, and active state highlights.
- Table action buttons (`+ Factor`, `+ Row`) lack standard icons and consistent typography.

## 2. Proposed Architecture & Visual Tokens

### 2.1 Model Selector & Top Toolbar
- **Model Selector Segment**: Encapsulate `RSM`, `GMDH`, and `Taguchi` in a segmented container (`bg-[#18181c] border border-[#27272f] rounded-lg p-0.5`).
  - Active button: `bg-zinc-800 text-white font-semibold shadow-sm px-3 py-1 text-xs rounded-md`.
  - Inactive button: `text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40 px-3 py-1 text-xs rounded-md`.
- **Top Actions Group**:
  - Encapsulate `Save`, `Upload Data`, `Report`, and `Close` into a clean group pill (`bg-[#18181c] border border-[#27272f] rounded-lg p-1`).
  - Standardize with 13-14px icons (`Save`, `Upload`, `FileText`, `X`), `h-7 px-2.5 text-xs whitespace-nowrap`.
  - Close button: `text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-md`.

### 2.2 Model Deployment & Export Actions
- Unified deployment buttons in the sidebar:
  - `Export to X-Bridges`: `bg-[#18181c] hover:bg-sky-500/10 border border-sky-500/30 text-sky-400 hover:text-sky-300 h-7 text-xs font-medium rounded-md flex items-center justify-center gap-1.5`.
  - `Export to V-Lab`: `bg-[#18181c] hover:bg-purple-500/10 border border-purple-500/30 text-purple-400 hover:text-purple-300 h-7 text-xs font-medium rounded-md flex items-center justify-center gap-1.5`.
- Equation Header: Single-line export pills with consistent font-size controls (`A-` / `A+`).

### 2.3 Plot Type Selectors
- **Sidebar Plot Type Grid**: Segmented button grid with `h-7 text-xs whitespace-nowrap rounded-md`:
  - Active state: `bg-orange-500/15 border-orange-500/40 text-orange-400 font-semibold`.
  - Inactive state: `bg-[#141417] border border-[#27272f] text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50`.
- **Overlay Plot Controls on Canvas**: Floating glassmorphic pill capsule (`bg-[#111114]/90 backdrop-blur border border-[#27272f] rounded-lg p-1 flex gap-1 shadow-lg`).

### 2.4 Experiment Data Table Controls
- Table actions: `+ Factor` and `+ Row` buttons styled as `h-7 px-2.5 text-xs font-medium bg-[#141417] hover:bg-zinc-800 border border-[#27272f] text-zinc-300 hover:text-white rounded-md flex items-center gap-1.5`.

## 3. Files Modified
- [src/App.tsx](file:///g:/adia%20project/src/App.tsx): DOE Analyzer component (`DOEAnalyzerWorkspace` / DOE section ~lines 2510-3160 and `ManualEntryTable` ~lines 4740-4780).

## 4. Verification
- `npx tsc --noEmit` & vitest unit tests.
- Visual inspection of the DOE modal in the browser.
