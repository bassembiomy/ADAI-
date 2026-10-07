/**
 * Regenerates docs/vlab-review/block-matrix.json from the live contract results (WP-50).
 * Run: npx tsx scripts/vlab_review/genBlockMatrix.ts
 *
 * Columns per block: ports / params / equation / conservation / simscape / ui / help.
 *   ports        = unique-ids + port-domains + scope-routing + dae-allocation
 *   params       = params-hidden + params-dead
 *   equation     = equation-factory + finite-residual + unsupported
 *   conservation = per-domain analytic tests (physical/source/measurement) - not a per-block contract check: "tested-by-domain-suite" or "n/a"
 *   simscape     = "pending" (no golden exists, F-021) or "n/a" (signal/utility blocks)
 *   ui           = classification check + a symbol glyph exists in VLabSymbols
 *   help         = equation-doc (library equation text is specific)
 * Values: pass | fail | expected-failure (ratchet entry) | n/a | pending | tested-by-domain-suite
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHECK_IDS, buildContexts, evaluateBlock, libraryStats, type CheckId } from '../../src/engine/vlab/review/contractChecks';
import { CONTRACT_EXPECTED_FAILURES } from '../../src/engine/vlab/review/contractExpectedFailures';
import { BLOCK_CLASSIFICATION } from '../../src/engine/vlab/review/blockClassification';
import { parseSymbols } from '../../src/engine/vlab/review/contractInventory';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const symbols = parseSymbols();

const matrix: Record<string, Record<string, string>> = {};
let fully = 0;
let withExpected = 0;
for (const ctx of buildContexts()) {
  const id = ctx.block.id;
  const res = evaluateBlock(ctx);
  const exp = CONTRACT_EXPECTED_FAILURES[id] ?? {};
  const status = (checks: CheckId[]) => {
    const failing = checks.filter(c => res[c].length > 0);
    if (!failing.length) return 'pass';
    return failing.every(c => exp[c]) ? 'expected-failure' : 'fail';
  };
  const cls = BLOCK_CLASSIFICATION[id];
  const allPass = CHECK_IDS.every(c => res[c].length === 0);
  const hasExp = Object.keys(exp).length > 0;
  if (allPass && !hasExp) fully++;
  if (hasExp) withExpected++;
  const hasSymbol = symbols.has(id);
  const classOk = status(['classification']);
  matrix[id] = {
    class: cls ?? 'unclassified',
    ports: status(['unique-ids', 'port-domains', 'scope-routing', 'dae-allocation']),
    params: status(['params-hidden', 'params-dead']),
    equation: status(['equation-factory', 'finite-residual', 'unsupported']),
    conservation: cls === 'physical' || cls === 'source' || cls === 'measurement' ? 'tested-by-domain-suite' : 'n/a',
    simscape: cls === 'signal' || cls === 'utility' ? 'n/a' : 'pending',
    ui: classOk === 'pass' && hasSymbol ? 'pass' : (classOk === 'pass' ? 'fail:no-symbol' : classOk),
    help: status(['equation-doc']),
  };
}
const stats = libraryStats();
const out = {
  generated_by: 'scripts/vlab_review/genBlockMatrix.ts',
  note: 'simscape=pending: no Simscape golden exists (F-021, partial MATLAB install). Reference is published governing equations (plan section 0).',
  summary: { ...stats, fully_certified: fully, blocks_with_expected_failures: withExpected },
  blocks: matrix,
};
fs.writeFileSync(path.join(ROOT, 'docs', 'vlab-review', 'block-matrix.json'), JSON.stringify(out, null, 2) + '\n');
console.log(JSON.stringify(out.summary));
const tally: Record<string, Record<string, number>> = {};
for (const row of Object.values(matrix)) for (const [k, v] of Object.entries(row)) { if (k === 'class') continue; (tally[k] ||= {})[v] = (tally[k][v] ?? 0) + 1; }
console.log(JSON.stringify(tally));
