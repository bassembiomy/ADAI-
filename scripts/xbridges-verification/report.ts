// Generates docs/xbridges-verification/report.md from the verification ledger (plan section 8, WP-23).
// Run: npx tsx scripts/xbridges-verification/report.ts
// The report has no timestamp: the same ledger gives the same bytes.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const dir = join(root, 'docs', 'xbridges-verification');

interface Finding { id: string; severity: string; gate: string; status: string; summary: string; plan_ref?: string }
interface Wp { id: string; title: string; status: string; exec?: string; deps?: string[] }
interface Decision { id: string; date: string; topic: string; decision: string }
interface Ledger {
  plan: string; baseline: string; wps: Wp[]; findings: Finding[]; decisions: Decision[];
  blocks: Record<string, { category: string; gates: Record<string, string> }>;
  notes_for_later_wps?: { wp: string; note: string }[];
}

const L = JSON.parse(readFileSync(join(dir, 'ledger.json'), 'utf8')) as Ledger;
const esc = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');
const SEV = ['S1', 'S2', 'S3', 'S4'];
const SEV_TEXT: Record<string, string> = {
  S1: 'wrong number in simulation or generated C',
  S2: 'crash, stop, freeze or silent no-op',
  S3: 'diagnostic, UI or convention deviation',
  S4: 'documentation',
};
const open = L.findings.filter((f) => f.status === 'open');
const closedOrMerged = L.findings.filter((f) => f.status !== 'open');

const out: string[] = [];
out.push('# X-Bridges verification report');
out.push('');
out.push(`Generated from \`docs/xbridges-verification/ledger.json\` by \`scripts/xbridges-verification/report.ts\`. Plan: \`${L.plan}\`. Baseline: \`${L.baseline}\`.`);
out.push('');
out.push('## Summary');
out.push('');
const done = L.wps.filter((w) => w.status === 'done').length;
out.push(`- Work packages: ${done} done of ${L.wps.length}; ${L.wps.filter((w) => w.status === 'in_progress').length} in progress; ${L.wps.filter((w) => w.status === 'todo').length} to do.`);
out.push(`- Findings: ${open.length} open, ${closedOrMerged.length} closed, merged or superseded. No fix has been made yet (fixes are WP-21).`);
for (const s of SEV) out.push(`  - ${s} (${SEV_TEXT[s]}): ${open.filter((f) => f.severity === s).length} open`);
const openDecisions = L.decisions.filter((d) => /^OPEN/i.test(d.decision));
out.push(`- Decisions recorded: ${L.decisions.length}; open: ${openDecisions.length}${openDecisions.length ? ` (${openDecisions.map((d) => d.id).join(', ')})` : ''}.`);
out.push('');

if (openDecisions.length) {
  out.push('## Open decisions');
  out.push('');
  for (const d of openDecisions) out.push(`- **${d.id} - ${d.topic}.** ${d.decision}`);
  out.push('');
}

out.push('## Work packages');
out.push('');
out.push('| WP | Title | Status | Executor / verifier |');
out.push('| --- | --- | --- | --- |');
for (const w of L.wps) out.push(`| ${w.id} | ${esc(w.title)} | ${w.status} | ${esc(w.exec ?? '')} |`);
out.push('');

out.push('## Gate coverage per block');
out.push('');
const gates = ['V1', 'V2', 'V3', 'V4', 'V5', 'V6', 'V7', 'V8', 'G'];
const bucket = (v: string) => (v.startsWith('pass') ? 'pass' : v.startsWith('fail') ? 'fail' : v.startsWith('n/a') ? 'n/a' : 'other');
out.push('| Gate | pass | fail | n/a | todo / pending / other |');
out.push('| --- | --- | --- | --- | --- |');
const blocks = Object.values(L.blocks);
for (const g of gates) {
  const c = { pass: 0, fail: 0, 'n/a': 0, other: 0 } as Record<string, number>;
  for (const b of blocks) c[bucket(String(b.gates[g] ?? 'todo'))]++;
  out.push(`| ${g} | ${c.pass} | ${c.fail} | ${c['n/a']} | ${c.other} |`);
}
out.push('');
out.push(`${blocks.length} blocks. Per-block gate values are in the ledger; most V2-V8 cells are still 'todo' at block level because the family WPs record their evidence per finding and per test file, not per block (WP-23 final pass).`);
out.push('');

out.push('## Open findings by severity');
out.push('');
for (const s of SEV) {
  const list = open.filter((f) => f.severity === s);
  if (!list.length) continue;
  out.push(`### ${s} - ${SEV_TEXT[s]} (${list.length})`);
  out.push('');
  out.push('| Id | Gate | Plan ref | Summary |');
  out.push('| --- | --- | --- | --- |');
  for (const f of list) out.push(`| ${f.id} | ${f.gate} | ${esc(f.plan_ref ?? '')} | ${esc(f.summary)} |`);
  out.push('');
}

if (closedOrMerged.length) {
  out.push('## Closed, merged or superseded findings');
  out.push('');
  for (const f of closedOrMerged) out.push(`- ${f.id} (${f.status}): ${esc(f.summary).slice(0, 200)}`);
  out.push('');
}

out.push('## Decisions');
out.push('');
for (const d of L.decisions) out.push(`- **${d.id}** (${d.date}, ${d.topic}): ${d.decision}`);
out.push('');

if (L.notes_for_later_wps?.length) {
  out.push('## Deferred items (notes for follow-up WPs)');
  out.push('');
  for (const n of L.notes_for_later_wps) out.push(`- **${n.wp}:** ${esc(n.note)}`);
  out.push('');
}

writeFileSync(join(dir, 'report.md'), `${out.join('\n')}`);
console.log(`report.md: ${open.length} open findings, ${done}/${L.wps.length} WPs done`);
