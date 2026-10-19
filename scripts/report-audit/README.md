# Report layout audit

Builds the real system report HTML and measures it in headless Chromium (overlaps, paper overflow, legibility).

    node scripts/report-audit/run.mjs              # build + audit all cases
    node scripts/report-audit/run.mjs mr_pld_ecu   # one case (fixture | mr_pld_ecu | inductance_heater | stress)
    npx tsx scripts/report-audit/build.ts          # build only
    node scripts/report-audit/audit.mjs [case]     # audit only (uses out/<case>.html)
    node scripts/report-audit/audit.mjs --selftest # validates the detectors on selftest.html

Output in `scripts/report-audit/out/` (git-ignored): `<case>.html`, `<case>.audit.json`, `<case>.pdf` (A4),
`<case>.screen.png`, `<case>.print.png`.

Modes: screen (viewport 900px) and print (viewport 680px = 180 mm A4 content width, print media, plus `page.pdf`).
Defect classes: paper overflow (+ clipped containers, document scrollWidth), figure taller than a page (979px),
legibility (< 8px effective font), and in each svg: `text-overlap`, `text-crosses-node-border`, `text-over-node`,
`edge-through-node`, `outside-viewbox`, `node-overlap` (geometry in svg user units, ink boxes shrunk 15% vertically).

`build.ts` reproduces `handleGenerateReport` of `src/App.tsx`; the HMI sections come from
`src/features/reporting/hmiReportSections.ts`, as in the app. Set `REPORT_AUDIT_OUT=<dir>` to write elsewhere.
Uses the Chromium in `$PLAYWRIGHT_BROWSERS_PATH` (default /opt/pw-browsers); never installs anything.
