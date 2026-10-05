/**
 * Rewrites the `"direction"` field of every Physical port in src/utils/vlabLibrary.ts from the equation-trace
 * derivation in src/engine/vlab/review/portDirections.ts (WP-07, F-030). Idempotent.
 * Run: npx tsx scripts/vlab_review/genPortDirections.ts
 * connections.test.ts fails whenever the committed library differs from this derivation.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildContexts } from '../../src/engine/vlab/review/contractChecks';
import { resolveDirection, tracePortDirections } from '../../src/engine/vlab/review/portDirections';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const file = path.join(ROOT, 'src/utils/vlabLibrary.ts');

const want = new Map<string, 'in' | 'out'>();
for (const ctx of buildContexts()) {
  for (const t of tracePortDirections(ctx)) {
    const d = resolveDirection(t);
    if (!d) {
      if (!['solver_config.a', 'mech_config.c', 'conn_label.a'].includes(`${t.block}.${t.port}`)) {
        console.error(`unresolved direction for ${t.block}.${t.port} (${t.verdict}): record a tier-2 decision in portDirections.ts`);
        process.exit(1);
      }
      continue;
    }
    want.set(`${t.block}.${t.port}`, d);
  }
}

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

  // multi-line port: drop an existing direction line, re-add it after the domain line
  if (/^ {12}"direction": "(in|out)",?\s*$/.test(line)) continue;
  const dom = line.match(/^( {12})"domain": "Physical"(,?)\s*$/);
  if (dom && want.has(`${block}.${port}`)) {
    // the direction line is last in the object unless another property follows (skip an old direction line when peeking)
    let j = i + 1;
    if (/^ {12}"direction": "(in|out)",?\s*$/.test(lines[j] ?? '')) j++;
    const last = /^\s*\}/.test(lines[j] ?? '');
    out.push(`${dom[1]}"domain": "Physical",`);
    out.push(`${dom[1]}"direction": "${want.get(`${block}.${port}`)}"${last ? '' : ','}`);
    n++;
    continue;
  }
  // inline port: { "id": "out", ..., "domain": "Physical"[, "direction": "x"] }
  const inl = line.match(/^(\s*\{ "id": "([^"]+)".*"domain": "Physical")(?:, "direction": "(?:in|out)")?( \},?\s*)$/);
  if (inl && want.has(`${block}.${inl[2]}`)) {
    out.push(`${inl[1]}, "direction": "${want.get(`${block}.${inl[2]}`)}"${inl[3]}`);
    n++;
    continue;
  }
  out.push(line);
}
fs.writeFileSync(file, out.join(eol));
console.log(`wrote ${n} Physical port directions (expected ${want.size})`);
