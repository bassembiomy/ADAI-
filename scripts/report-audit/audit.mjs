/* Audits scripts/report-audit/out/<case>.html in headless Chromium. Usage: node audit.mjs [case ...] [--selftest] */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const out = process.env.REPORT_AUDIT_OUT ? resolve(process.env.REPORT_AUDIT_OUT) : resolve(here, 'out');
const require = createRequire(resolve(root, 'package.json'));
const { chromium } = require('playwright-core');
const inpage = readFileSync(resolve(here, 'inpage.js'), 'utf8');

const PRINT_W = 680;                 // 180 mm = A4 210 mm - 2 x 15 mm margins, in CSS px (680.3)
const PRINT_FIGURE_MAX_H = 979;      // 259 mm printable page height (portrait figure incl. caption)
const WIDE_BOX = { width: 987, height: 599 }; // landscape usable svg box for report-figure-wide figures
const SCREEN_W = 900;

function findChrome() {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  if (!existsSync(base)) return undefined;
  for (const d of readdirSync(base).filter(n => /^chromium-\d+$/.test(n)).sort().reverse()) {
    const p = resolve(base, d, 'chrome-linux/chrome');
    if (existsSync(p)) return p;
  }
  return undefined;
}

async function open(browser, file, media, width) {
  const ctx = await browser.newContext({ viewport: { width, height: media === 'print' ? 1123 : 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.emulateMedia({ media });
  await page.goto(pathToFileURL(file).href, { waitUntil: 'load' });
  await page.waitForTimeout(400);
  await page.addScriptTag({ content: inpage });
  return { ctx, page };
}

export async function auditFile(browser, file, name, { pdf = true, shots = true } = {}) {
  const result = { case: name, modes: {} };
  for (const [mode, width] of [['screen', SCREEN_W], ['print', PRINT_W]]) {
    const { ctx, page } = await open(browser, file, mode === 'print' ? 'print' : 'screen', width);
    const opts = { maxFigureH: PRINT_FIGURE_MAX_H, minFontPx: 8, wide: WIDE_BOX, print: mode === 'print' };
    const layout = await page.evaluate(o => window.__audit.layout(o), opts);
    result.modes[mode] = layout;
    if (mode === 'print') result.svg = await page.evaluate(() => window.__audit.svgs());
    if (shots) await page.screenshot({ path: resolve(out, `${name}.${mode}.png`), fullPage: true });
    if (pdf && mode === 'print') await page.pdf({ path: resolve(out, `${name}.pdf`), format: 'A4', printBackground: true, preferCSSPageSize: true });
    await ctx.close();
  }
  return result;
}

const group = (items, keyFn) => { const m = new Map(); for (const i of items) { const k = keyFn(i); (m.get(k) ?? m.set(k, []).get(k)).push(i); } return m; };

export function summarize(r, per = 3) {
  const lines = [];
  lines.push(`=== ${r.case} ===`);
  for (const mode of ['screen', 'print']) {
    const m = r.modes[mode];
    lines.push(`[${mode}] .report content width ${m.content.width}px; document overflow: ${m.docOverflow ? `YES (scrollWidth ${m.docScrollWidth} > ${m.docClientWidth})` : 'no'}`);
    lines.push(`  paper-overflow elements: ${m.overflow.length}`);
    for (const o of m.overflow.slice(0, 8)) lines.push(`    +${o.overflowPx}px  ${o.path}  [section: ${o.section}]${o.text ? `  "${o.text}"` : ''}  (${o.offendingDescendants} offending descendants)`);
    if (m.clipped.length) { lines.push(`  clipped/scrolling containers: ${m.clipped.length}`); for (const c of m.clipped.slice(0, 5)) lines.push(`    ${c.path} scrollWidth ${c.scrollWidth} > ${c.clientWidth} [section: ${c.section}]`); }
    if (mode === 'print') {
      lines.push(`  visible fixed/sticky elements (overlap content on every printed page): ${(m.fixedElements || []).length}`);
      for (const f of m.fixedElements || []) lines.push(`    ${f.position}  ${f.path}  "${f.text}"`);
      lines.push(`  figures taller than a page (${PRINT_FIGURE_MAX_H}px): ${m.figuresTooTall.length}`);
      for (const f of m.figuresTooTall) lines.push(`    ${f.heightPx}px [${f.orientation}, limit ${f.limitPx}]  ${f.caption}  [section: ${f.section}]`);
    }
    lines.push(`  illegible figures (<8px effective font): ${m.legibility.length}`);
    for (const f of m.legibility) lines.push(`    ${f.effectiveFontPx}px [${f.orientation}] (min font ${f.minFontUser} x scale ${f.scale})  ${f.caption}  e.g. "${f.text}"`);
  }
  lines.push(`[svg geometry] total defects: ${r.svg.length}`);
  const byCap = group(r.svg, d => d.caption);
  for (const [cap, ds] of byCap) {
    const byCls = group(ds, d => d.cls);
    lines.push(`  ${cap}  [${ds[0].section}]`);
    for (const [cls, list] of byCls) {
      lines.push(`    ${cls}: ${list.length}`);
      for (const d of list.slice(0, per)) lines.push(`      - ${d.detail}  ${JSON.stringify(Object.fromEntries(Object.entries(d).filter(([k]) => !['cls', 'caption', 'section', 'detail'].includes(k))))}`);
    }
  }
  return lines.join('\n');
}

async function selftest(browser) {
  const r = await auditFile(browser, resolve(here, 'selftest.html'), 'selftest', { pdf: false, shots: false });
  const count = (cap, cls) => r.svg.filter(d => d.caption.startsWith(cap) && d.cls === cls).length;
  const expect = [
    ['CLEAN', 'text-overlap', 0], ['CLEAN', 'text-crosses-node-border', 0], ['CLEAN', 'text-over-node', 0], ['CLEAN', 'edge-through-node', 0], ['CLEAN', 'outside-viewbox', 0], ['CLEAN', 'node-overlap', 0],
    ['DEFECTS', 'text-overlap', 1], ['DEFECTS', 'text-crosses-node-border', 1], ['DEFECTS', 'edge-through-node', 1], ['DEFECTS', 'outside-viewbox', 1], ['DEFECTS', 'node-overlap', 1],
  ];
  let bad = 0;
  for (const [cap, cls, n] of expect) { const got = count(cap, cls); const ok = got === n; if (!ok) bad++; console.log(`${ok ? 'PASS' : 'FAIL'} ${cap} ${cls}: expected ${n}, got ${got}`); }
  const wide = r.modes.print.overflow.length === 1 && r.modes.print.overflow[0].overflowPx > 100;
  console.log(`${wide ? 'PASS' : 'FAIL'} paper overflow: expected 1 (wide div), got ${r.modes.print.overflow.length}`); if (!wide) bad++;
  const leg = r.modes.print.legibility.length === 1;
  console.log(`${leg ? 'PASS' : 'FAIL'} legibility: expected 1 tiny figure, got ${r.modes.print.legibility.length}`); if (!leg) bad++;
  if (bad) { console.log('\n' + summarize(r, 10)); process.exitCode = 1; } else console.log('selftest OK');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const browser = await chromium.launch({ executablePath: findChrome(), args: ['--no-sandbox'] });
  try {
    if (args.includes('--selftest')) await selftest(browser);
    else {
      const names = args.length ? args : readdirSync(out).filter(f => f.endsWith('.html')).map(f => f.replace(/\.html$/, ''));
      for (const n of names) {
        const r = await auditFile(browser, resolve(out, `${n}.html`), n);
        writeFileSync(resolve(out, `${n}.audit.json`), JSON.stringify(r, null, 1));
        console.log(summarize(r) + '\n');
      }
    }
  } finally { await browser.close(); }
}
