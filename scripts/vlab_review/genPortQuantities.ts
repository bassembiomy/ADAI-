/**
 * Writes `"quantity"` and `"unit"` onto every signal-out (Physical, direction out) port of src/utils/vlabLibrary.ts from
 * the reviewed table src/engine/vlab/review/portQuantities.ts (WP-09b). Only those two fields are added or rewritten;
 * ids, labels and everything else are untouched. Idempotent.
 * Run: npx tsx scripts/vlab_review/genPortQuantities.ts
 * scope_routing.test.ts fails whenever the committed library differs from the table.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { VLAB_LIBRARY } from '../../src/utils/vlabLibrary';
import { PORT_QUANTITIES } from '../../src/engine/vlab/review/portQuantities';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const file = path.join(ROOT, 'src/utils/vlabLibrary.ts');

const outs = new Set<string>();
for (const d of VLAB_LIBRARY) for (const b of d.blocks) for (const p of b.ports) {
  if (p.direction === 'out' && (p.domain ?? '').toLowerCase() === 'physical') outs.add(`${b.id}.${p.id}`);
}
const missing = [...outs].filter(k => !PORT_QUANTITIES[k]);
const stale = Object.keys(PORT_QUANTITIES).filter(k => !outs.has(k));
if (missing.length || stale.length) {
  console.error(`missing entries: ${missing.join(', ') || '-'}\nstale entries: ${stale.join(', ') || '-'}`);
  process.exit(1);
}

const esc = (s: string) => JSON.stringify(s);
const raw = fs.readFileSync(file, 'utf8');
const eol = raw.includes('\r\n') ? '\r\n' : '\n';
const lines = raw.split(/\r?\n/);
const out: string[] = [];
let block = ''; let port = ''; let n = 0;
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  let m: RegExpMatchArray | null;
  if ((m = line.match(/^ {8}"id": "([^"]+)"/))) block = m[1];
  else if ((m = line.match(/^ {12}"id": "([^"]+)"/))) port = m[1];

  // multi-line port: drop old quantity/unit lines that follow the direction line, then re-add them
  const dir = line.match(/^( {12})"direction": "out"(,?)\s*$/);
  if (dir && PORT_QUANTITIES[`${block}.${port}`]) {
    const e = PORT_QUANTITIES[`${block}.${port}`];
    let j = i + 1;
    while (/^ {12}"(quantity|unit)": ".*",?\s*$/.test(lines[j] ?? '')) j++;
    const last = /^\s*\}/.test(lines[j] ?? '');
    out.push(`${dir[1]}"direction": "out",`);
    out.push(`${dir[1]}"quantity": ${esc(e.quantity)},`);
    out.push(`${dir[1]}"unit": ${esc(e.unit)}${last ? '' : ','}`);
    i = j - 1;
    n++;
    continue;
  }
  // inline port: { "id": "out", ..., "direction": "out"[, "quantity": ..., "unit": ...] }
  const inl = line.match(/^(\s*\{ "id": "([^"]+)".*"direction": "out")(?:, "quantity": "[^"]*")?(?:, "unit": "[^"]*")?( \},?\s*)$/);
  if (inl && PORT_QUANTITIES[`${block}.${inl[2]}`]) {
    const e = PORT_QUANTITIES[`${block}.${inl[2]}`];
    out.push(`${inl[1]}, "quantity": ${esc(e.quantity)}, "unit": ${esc(e.unit)}${inl[3]}`);
    n++;
    continue;
  }
  out.push(line);
}
fs.writeFileSync(file, out.join(eol));
console.log(`wrote quantity/unit for ${n} signal-out ports (expected ${outs.size})`);
