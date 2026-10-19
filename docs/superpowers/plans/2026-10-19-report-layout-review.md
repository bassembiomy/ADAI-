# Report layout review: no overlaps, nothing outside the A4 page

Planner and reviewer: Opus (main session). Executors: Sonnet subagents, one work package (WP) each.

## Goal
Every figure in the generated system report (package, use case, requirements, BDD, IBD, activity,
sequence, parametric, state machine, traceability, X-Bridges, HMI) and every HMI section (static HMI
design picture, interactive HMI simulator, dashboard, event log) must:
1. have no overlapping text, no text over node borders, and no edge crossing through a node it does not connect to;
2. keep everything drawn inside its own viewBox;
3. fit within the A4 content width (210mm - 2 x 15mm page margin = 180mm, about 680 CSS px) and within one page height,
   both on screen (iframe preview) and in print / PDF;
4. stay legible: no figure scaled down so far that its text renders below about 6pt.

## Pipeline (where things are)
- `src/features/reporting/systemReport/buildSystemReport.ts` assembles the HTML; CSS in `reportStyles.ts`.
- Diagram renderers: `reportDiagrams.ts`, `reportDiagrams.sysml.ts`; layout `reportDiagramLayout.ts`;
  geometry helpers `reportSvgGeometry.ts`; test reader `figureGeometry.testutil.ts`.
- HMI sections are built inline in `src/App.tsx` (search `renderHmiSVG` and `Interactive System Prototype`, ~line 11708-12030)
  using `src/features/hmi/hmiReport.ts`. The report is shown in an iframe `srcDoc` (`App.tsx` ~4484) and printed from there.

## Known defects found during planning
- D1: the HMI design SVG has fixed `width`/`height` attributes and sits outside `figure.report-figure`, so
  `max-width:100%` never applies: a wide HMI runs off the page.
- D2: the interactive simulator canvas `#portable-hmi-canvas` has a fixed pixel width and height, with
  components absolutely positioned. Nothing scales it to the page: it overflows on screen and in print.
- D3: no test checks the rendered report in a real browser. Existing geometry tests use estimated text widths.

## Work packages
- WP1: move the HMI design and interactive prototype section builders out of `App.tsx` into
  `src/features/reporting/hmiReportSections.ts`, fix D1 and D2, add unit tests.
- WP2: browser audit harness (`scripts/report-audit/`): builds full reports for the fixture plus the real projects
  (`MR_PLD_ECU.adia`, `inductance_heater.adia`), renders them in Chromium at A4 width and in print to PDF,
  and measures real overlaps and overflows with `getBBox` / `getBoundingClientRect`. Writes JSON and PNG/PDF output.
- WP3+: fixes for each defect class the audit reports, assigned by the planner after reading the audit.
- Final: planner reruns the audit and the reporting tests; zero findings is the exit criterion.

## Status
- WP1 done (commit "Fit HMI report sections to the A4 page"). WP2 done (commit "Add a Chromium audit ...").
  Run: `node scripts/report-audit/run.mjs [case]`; `REPORT_AUDIT_OUT=<dir>` writes elsewhere.

## Audit findings after WP1 (planner, 2026-10-19)
- F1 BDD: stacked multiplicity labels ("1" over "1") — 67 in MR-PLD Figure 2, 1 in Figure 3, 6 in Figure 4.
- F2 BDD view 1 of 7 (MR-PLD) is 1182px tall in print, taller than a portrait page (979px).
- F3 Requirements (stress): the «satisfy» edge label crosses node REQ-004's border.
- F4 Legibility: wide figures scale below 8px effective font in print: MR-PLD IBD MR_PLD_ECU 4.8px, IBD Actros 6.2px,
  IBD OM501LA 7.1px, sequence "Engine start and drive" 5.5px, state machine Root 5.0px and Powered 3.7px,
  inductance heater state machine Root 4.7px, BDD view 1 7.5px; stress IBDs and state machine about 7.4px.
- F5 HMI: widget labels wider than the widget overlap neighbours and run outside the viewBox (raw variable ids
  such as `→ 6178d014-...` are printed); MR-PLD HMI picture and simulator print at about 4px effective font.
- F6 Traceability table (stress) overflows the page by 65px: long unbroken ids do not wrap.
- F7 (outside scope, reported to the user) inductance_heater.adia: `loadCanonicalSysmlProject` throws in
  `migrateV3ToV4.sortRecord` because the flat legacy file is tagged `schemaVersion: 4`.

## Page-fit rule (planner decision)
Print content box: portrait 180mm x 259mm (680 x 979 px); landscape 267mm x 177mm (1009 x 669 px).
A figure is legible when (min font in user units) x (rendered scale) >= 8px.
- `wrapFigure` measures the scale a figure gets on a portrait page; if that drops the text below 8px and a landscape
  page gives a larger scale, it marks the figure `report-figure-wide`, which prints on a named landscape page
  (`page: wide`). On screen the figure still fits the column (max-width:100%).
- Renderers must keep figures compact enough to be legible on the page they land on: wrap long layered rows, split big views,
  and never rely on scaling below 8px. HMI pictures follow the same rule; their full text also appears in the component list.

## Work packages, phase A (parallel, separate files)
- WP3: the page-fit rule in `reportDiagramModel.wrapFigure` + CSS (`reportStyles.ts`) + audit awareness of landscape
  figures + F6 table wrapping.
- WP4: F1, F2, F3 in the BDD and requirements renderers (`reportDiagrams.ts`, BDD and requirements functions only).
- WP7: F5 in `src/features/hmi/hmiReport.ts` and `hmiReportSections.ts`.
## Phase B
- WP5: F4 for state machines and sequence diagrams. WP6: F4 for IBDs.
