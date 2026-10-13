/**
 * V-Lab final certification runner (WP-50).
 * Run: npx tsx scripts/vlab_review/certify.ts   (proposed npm script: "test:vlab:certify")
 *
 * Steps (in sequence):
 *   (a) vitest on all V-Lab suites
 *   (b) tsc --noEmit, errors in V-Lab paths counted separately from other work
 *   (c) inventory regeneration (inventory.json + inventory-gaps.md)
 * Exit code 1 on any V-Lab failure. Non-V-Lab tsc errors are listed but do not fail certification.
 */
import { spawnSync } from 'node:child_process';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const isWin = process.platform === 'win32';

const VLAB_PATH_RE = /(^|[\\/])(src[\\/](engine[\\/]vlab|components[\\/]vlab|utils[\\/]vlab|utils[\\/]scopeUtils|services[\\/]vlabWorker)|benchmarks[\\/]simscape|scripts[\\/]vlab_review|tests[\\/]e2e[\\/]vlab)/i;

function run(cmd: string, args: string[]): { code: number; out: string } {
  const r = spawnSync(isWin ? `${cmd}.cmd` : cmd, args, {
    cwd: ROOT, encoding: 'utf8', shell: isWin, maxBuffer: 256 * 1024 * 1024,
  });
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  return { code: r.status ?? 1, out };
}

const strip = (s: string) => s.replace(/\u001b\[[0-9;]*[A-Za-z]/g, '');
const results: { step: string; ok: boolean; detail: string }[] = [];

// (a) vitest
console.log('[certify] (a) vitest V-Lab suites ...');
const VITEST_TARGETS = [
  'src/engine/vlab', 'src/components/vlab', 'src/utils/vlabLibrary.test.ts', 'src/utils/scopeUtils.test.ts',
  'src/services/vlabWorkerClient.test.ts', 'src/engine/doe/integration.test.ts',
];
const vt = run('npx', ['vitest', 'run', ...VITEST_TARGETS, '--reporter=dot']);
const vtOut = strip(vt.out);
const pick = (re: RegExp) => { const m = vtOut.match(re); return m ? m[1] : null; };
const files = vtOut.match(/^\s*Test Files\s+(\d[^\r\n]*)/m)?.[1]?.trim() ?? 'n/a';
const tests = vtOut.match(/^\s*Tests\s+(\d[^\r\n]*)/m)?.[1]?.trim() ?? 'n/a';
void pick;
const vtOk = vt.code === 0;
console.log(`    Test Files ${files}\n    Tests      ${tests}`);
results.push({ step: 'vitest', ok: vtOk, detail: `files: ${files}; tests: ${tests}` });
if (!vtOk) console.log(vtOut.split(/\r?\n/).slice(-60).join('\n'));

// (b) tsc
console.log('[certify] (b) tsc --noEmit ...');
const tsc = run('npx', ['tsc', '--noEmit']);
const tscLines = strip(tsc.out).split(/\r?\n/).filter(l => /error TS\d+/.test(l));
const vlabErrs = tscLines.filter(l => VLAB_PATH_RE.test(l));
const otherErrs = tscLines.filter(l => !VLAB_PATH_RE.test(l));
console.log(`    V-Lab tsc errors: ${vlabErrs.length}; non-V-Lab (other work, not blocking): ${otherErrs.length}`);
vlabErrs.forEach(l => console.log(`      [vlab] ${l}`));
otherErrs.forEach(l => console.log(`      [other] ${l}`));
results.push({ step: 'tsc', ok: vlabErrs.length === 0, detail: `vlab errors ${vlabErrs.length}, non-vlab ${otherErrs.length}` });

// (c) inventory
console.log('[certify] (c) inventory regeneration ...');
const inv = run('npx', ['tsx', 'scripts/vlab_review/inventory.ts']);
console.log(strip(inv.out).trim().split(/\r?\n/).slice(-6).map(l => `    ${l}`).join('\n'));
results.push({ step: 'inventory', ok: inv.code === 0, detail: `exit ${inv.code}` });

console.log('\n[certify] SUMMARY');
for (const r of results) console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.step.padEnd(10)} ${r.detail}`);
const ok = results.every(r => r.ok);
console.log(`[certify] V-Lab certification: ${ok ? 'PASS' : 'FAIL'}`);
process.exit(ok ? 0 : 1);
