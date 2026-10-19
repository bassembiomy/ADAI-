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
