/** Print-grade stylesheet for the system report (A4, navy headings, orange accent). */
export const SYSTEM_REPORT_CSS = `
:root { --navy:#0b3445; --ink:#1f2933; --muted:#64748b; --rule:#d5dde5; --band:#f3f6f9; --accent:#f97316; --ok:#15803d; --warn:#b45309; --bad:#b91c1c; --info:#075985; }
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin:0; background:#e9edf1; color:var(--ink); font-family:'Segoe UI','Helvetica Neue',Arial,sans-serif; font-size:10.5pt; line-height:1.5; }
.report { max-width:210mm; margin:24px auto; background:#fff; padding:18mm 16mm 22mm; box-shadow:0 2px 14px rgba(15,23,42,.18); }
h1,h2,h3,h4,h5,h6 { color:var(--navy); line-height:1.25; break-after:avoid; page-break-after:avoid; }
h2 { font-size:17pt; margin:0 0 12px; padding-bottom:6px; border-bottom:2px solid var(--navy); break-before:page; page-break-before:always; }
h3 { font-size:13pt; margin:22px 0 8px; border-bottom:1px solid var(--rule); padding-bottom:3px; }
h4 { font-size:11.5pt; margin:20px 0 6px; }
h5 { font-size:10.5pt; margin:16px 0 6px; }
h6 { font-size:10pt; margin:14px 0 4px; }
.sec-no { color:var(--accent); font-variant-numeric:tabular-nums; margin-right:.35em; }
h2.appendix-h, h2.first { break-before:auto; page-break-before:auto; }
p { margin:6px 0 10px; }
code { overflow-wrap:anywhere; word-break:break-word; font-family:Consolas,'Courier New',monospace; font-size:.92em; background:var(--band); padding:0 3px; border-radius:2px; }
a { color:#0a5a8a; }
.muted { color:var(--muted); }
.not-modelled { color:var(--muted); font-style:italic; padding:8px 12px; border:1px dashed var(--rule); background:#fafbfc; }
.path-line { overflow-wrap:anywhere; color:var(--muted); font-size:9.5pt; margin:0 0 8px; }
.path-line a { text-decoration:none; }

/* cover */
.cover { min-height:245mm; display:flex; flex-direction:column; justify-content:center; break-after:page; page-break-after:always; border-left:8px solid var(--accent); padding-left:18mm; }
.cover .kicker { color:var(--accent); font-weight:700; letter-spacing:.12em; text-transform:uppercase; font-size:10pt; }
.cover h1 { font-size:30pt; margin:6px 0 4px; border:0; color:var(--navy); }
.cover .subtitle { font-size:15pt; color:var(--muted); margin-bottom:32px; }
.cover table.meta { border-collapse:collapse; font-size:10.5pt; }
.cover table.meta th { text-align:left; color:var(--muted); font-weight:600; padding:4px 24px 4px 0; background:none; border:0; }
.cover table.meta td { padding:4px 0; border:0; }
.cover .classification { margin-top:40px; display:inline-block; border:1.5px solid var(--navy); color:var(--navy); padding:3px 14px; font-weight:700; letter-spacing:.1em; }

/* front matter */
.front { break-after:page; page-break-after:always; }
.front h2 { break-before:auto; page-break-before:auto; }
.toc, .lof, .lot { list-style:none; padding:0; margin:0; font-size:10pt; }
.toc li { padding:1px 0; }
.toc a, .lof a, .lot a, .report-figure-caption, .req-text, .scenario-head { overflow-wrap:anywhere; word-break:break-word; }
.toc a, .lof a, .lot a { text-decoration:none; color:var(--ink); }
.toc a:hover, .lof a:hover, .lot a:hover { color:#0a5a8a; }
.toc-no { display:inline-block; min-width:3.2em; color:var(--accent); font-variant-numeric:tabular-nums; }
.toc-l2 { font-weight:700; margin-top:5px; }
.toc-l3 { padding-left:1.2em; }
.toc-l4 { padding-left:2.4em; font-size:9.5pt; }
.toc-l5 { padding-left:3.6em; font-size:9.5pt; }
.toc-l6 { padding-left:4.8em; font-size:9.5pt; }
.lof li, .lot li { padding:1px 0; }

/* tables */
table.data { width:100%; table-layout:auto; border-collapse:collapse; margin:10px 0 16px; font-size:9.5pt; }
table.data caption { caption-side:top; text-align:left; font-size:9.5pt; color:var(--navy); padding:0 0 4px; break-after:avoid; page-break-after:avoid; }
table.data th, table.data td { overflow-wrap:anywhere; word-break:break-word; }
table.data th { background:var(--navy); color:#fff; text-align:left; font-weight:600; padding:5px 7px; border:1px solid var(--navy); vertical-align:bottom; }
table.data td { padding:4px 7px; border:1px solid var(--rule); vertical-align:top; }
table.data tbody tr:nth-child(even) td { background:var(--band); }
table.data thead { display:table-header-group; }
table.data tr { break-inside:avoid; page-break-inside:avoid; }
table.data td.num { text-align:right; font-variant-numeric:tabular-nums; }
.req-text { color:var(--muted); font-size:9pt; margin-top:2px; }
.tag { display:inline-block; background:var(--band); border:1px solid var(--rule); border-radius:3px; padding:0 5px; font-size:8.5pt; }
.tag-accent { background:var(--accent); border-color:var(--accent); color:#fff; }
table.summary { width:auto; min-width:55%; }
table.summary td.num { font-weight:700; }

/* figures */
figure.report-figure { margin:14px 0 18px; padding:10px; border:1px solid var(--rule); background:#fff; break-inside:avoid; page-break-inside:avoid; text-align:center; }
figure.report-figure svg { max-width:100%; height:auto; }
figure.report-figure a.diagram-node:hover rect { stroke:var(--accent); stroke-width:2; cursor:pointer; }
.report-figure-caption { margin-top:8px; font-size:9pt; color:var(--muted); text-align:center; }
.report-figure-caption strong { color:var(--navy); }
.report-figure-omitted { margin:6px 0 0; padding:5px 8px; font-size:8.5pt; color:var(--warn); background:#fffbeb; border:1px solid #fde68a; text-align:left; }
.report-figure-empty { color:var(--muted); font-style:italic; }

/* badges and status */
.badge { display:inline-block; padding:1px 7px; border-radius:10px; font-size:8.5pt; font-weight:700; white-space:nowrap; border:1px solid transparent; }
.badge-ok { background:#dcfce7; color:#14532d; border-color:#86efac; }
.badge-info { background:#e0f2fe; color:#075985; border-color:#7dd3fc; }
.badge-warn { background:#fef3c7; color:#92400e; border-color:#fcd34d; }
.badge-bad { background:#fee2e2; color:#991b1b; border-color:#fca5a5; }
.badge-muted { background:#eef1f4; color:#475569; border-color:#cbd5e1; }
.ev { font-size:8.5pt; font-weight:700; }
.ev-passed { color:var(--ok); } .ev-failed { color:var(--bad); } .ev-none { color:var(--muted); font-weight:400; }

/* RTM */
.rtm-cards { display:flex; flex-wrap:wrap; gap:8px; margin:8px 0 12px; }
.rtm-card { flex:1 1 22%; min-width:90px; border:1px solid var(--rule); border-top:3px solid var(--navy); padding:6px 10px; background:#fff; break-inside:avoid; }
.rtm-card-ok { border-top-color:var(--ok); } .rtm-card-warn { border-top-color:#d97706; } .rtm-card-bad { border-top-color:var(--bad); }
.rtm-card-value { font-size:17pt; font-weight:700; color:var(--navy); }
.rtm-card-label { font-size:8.5pt; color:var(--muted); text-transform:uppercase; letter-spacing:.06em; }
.rtm-meta { font-size:9pt; color:var(--muted); }
.rtm-legend { font-size:9pt; border:1px solid var(--rule); padding:8px 10px; background:var(--band); break-inside:avoid; }
.rtm-legend-item { display:block; margin-top:3px; }
table.rtm-table { font-size:8.5pt; }
table.rtm-grid td { text-align:center; padding:3px 4px; }
table.rtm-grid td:first-child { text-align:left; min-width:34mm; }
table.rtm-grid th { font-weight:600; font-size:8pt; vertical-align:bottom; text-align:center; }
table.rtm-grid th:first-child { text-align:left; }
.grid-col { display:block; writing-mode:vertical-rl; transform:rotate(180deg); margin:0 auto; max-height:34mm; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.grid-col small { display:block; opacity:.7; font-weight:400; }
.glyph { display:inline-block; min-width:1.35em; padding:0 3px; margin:0 1px; border-radius:3px; font-weight:700; font-size:8.5pt; color:#fff; background:var(--navy); }
.glyph-S { background:#15803d; } .glyph-V { background:#0369a1; } .glyph-R { background:#7c3aed; } .glyph-D { background:#b45309; } .glyph-T { background:#64748b; }

/* analysis (state machine) */
.analysis-error { color:var(--bad); font-weight:700; }
.analysis-ok { color:#166534; background:#f0fdf4; border:1px solid #bbf7d0; padding:6px 10px; border-radius:3px; font-size:9.5pt; }
.scenario-card { border:1px solid var(--rule); border-radius:4px; padding:10px 12px; margin:12px 0; background:#fafbfc; break-inside:avoid-page; }
.scenario-head { font-weight:700; color:var(--navy); border-bottom:1px solid var(--rule); padding-bottom:4px; margin-bottom:6px; }
.scenario-id { float:right; font-weight:400; color:var(--muted); }
.consistency-summary { background:#eff6ff; border:1px solid #bfdbfe; color:#1e3a8a; padding:10px 14px; border-radius:4px; margin:10px 0; font-size:9.5pt; }
.doc-control .sig { height:30px; border-bottom:1px solid var(--ink); }
.glossary-sym { text-align:center; width:34mm; }

/* HMI design list (supplied by the app) */
.item { margin:0 0 8px; }
.item-header { font-weight:700; }
.props { color:var(--muted); margin-left:10px; font-size:9.5pt; }

@page { size:A4; margin:18mm 15mm 20mm; @bottom-right { content:"Page " counter(page) " of " counter(pages); font-size:8pt; color:#64748b; } }
@page wide { size:A4 landscape; margin:15mm 15mm 18mm; @bottom-right { content:"Page " counter(page) " of " counter(pages); font-size:8pt; color:#64748b; } }
figure.report-figure.report-figure-wide, .report-wide-page { page:wide; }
@media print {
  body { background:#fff; font-size:10pt; }
  .report { max-width:none; margin:0; padding:0; box-shadow:none; }
  a { color:inherit; text-decoration:none; }
  figure.report-figure { border-color:#cbd5e1; }
  figure.report-figure svg { height:auto; max-width:100%; max-height:230mm; }
  figure.report-figure.report-figure-wide svg { max-height:150mm; }
  .hmi-sim-container { break-inside:auto; }
}
@media screen and (max-width: 800px) { .report { margin:0; padding:14px; } .cover { padding-left:10px; } }
`;

/** Escape arbitrary text for use inside a double-quoted CSS string (backslashes, quotes, newlines, control chars). */
export function cssString(text: string): string {
  const body = text
    .replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, ' ')
    .replace(/[\\"]/g, (c) => '\\' + c)
    .replace(/</g, '\\3c ');
  return `"${body}"`;
}

/** Running footer (document id / project) in the @bottom-left margin box of both page types; the page counter sits at @bottom-right. */
export function printFooterCss(text: string): string {
  const box = `@bottom-left { content:${cssString(text)}; font-size:8pt; color:#64748b; }`;
  return `@page { ${box} }\n@page wide { ${box} }`;
}
