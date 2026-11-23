/**
 * WP-22 mutation run for the X-Bridges engine (nightly CI; no npm dependency, no Stryker).
 *
 * Each mutant is one string replacement in one engine file. `before` must occur exactly once in the file, otherwise
 * the run stops before any mutant is applied. The unmutated subset runs first (the baseline); then each mutant runs the
 * targeted vitest subset (the verification folder plus one equations file) with a timeout:
 *   killed   - a test fails that does not fail on the baseline (the first such test is the killer)
 *   survived - no new failure (every test passes, or only baseline failures remain)
 *   timeout  - no result within the timeout (counted as killed, as Stryker does)
 *   error    - no report, or a non-zero exit without a failing test; not counted in the kill rate
 * A test that already fails at HEAD is never credited to a mutant. The original bytes are captured in memory before
 * the run; each file is written back in a finally block, and the run verifies at the end that every file is
 * byte-identical to its original.
 *
 * Usage (from the repository root):
 *   npx tsx scripts/xbridges-verification/mutationRun.ts                 full run, writes docs/xbridges-verification/mutation-report.md
 *   npx tsx scripts/xbridges-verification/mutationRun.ts --check         validate the anchors only, run nothing
 *   npx tsx scripts/xbridges-verification/mutationRun.ts --limit=5       first five mutants (partial run; the report says so)
 *   npx tsx scripts/xbridges-verification/mutationRun.ts --only=1,9      selected mutants by number
 *   options: --timeout=<seconds per mutant, default 3 x the baseline run time, at least 120>  --no-report
 *
 * Plan: docs/superpowers/plans/2026-11-10-xbridges-full-verification.md (WP-22).
 */
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const VITEST = join(ROOT, 'node_modules', 'vitest', 'vitest.mjs');
const REPORT_PATH = join(ROOT, 'docs', 'xbridges-verification', 'mutation-report.md');
const VERIFICATION = 'src/engine/xbridges/verification';
const ENGINE = 'src/engine/xbridges';

interface Mutation {
  id: number;
  kind: string;
  file: string;
  before: string;
  after: string;
  what: string;
  /** The relevant equations file, run next to the verification folder. */
  extra: string;
}

// Anchors were chosen so that each `before` occurs exactly once in the current source (checked again at run time).
export const MUTATIONS: Mutation[] = [
  { id: 1, kind: 'flip comparison', file: `${ENGINE}/XbridgesEngine.ts`,
    before: 'return Math.abs(a - b) <= algTol * (1 + Math.abs(b));', after: 'return Math.abs(a - b) < algTol * (1 + Math.abs(b));',
    what: 'algebraic-loop tolerance test: <= becomes <', extra: `${VERIFICATION}/xbEngine.test.ts` },
  { id: 2, kind: 'swap + and -', file: `${ENGINE}/XbridgesEngine.ts`,
    before: 'JtJ[i][i] += 1e-8 * maxDiag;', after: 'JtJ[i][i] -= 1e-8 * maxDiag;',
    what: 'Newton regularisation of the algebraic loop: + becomes -', extra: `${VERIFICATION}/xbEngine.test.ts` },
  { id: 3, kind: 'off-by-one loop bound', file: `${ENGINE}/XbridgesEngine.ts`,
    before: 'for (let pass = 0; pass < maxPasses; pass++) {', after: 'for (let pass = 0; pass <= maxPasses; pass++) {',
    what: 'algebraic-loop pass loop runs one pass too many', extra: `${VERIFICATION}/xbEngine.test.ts` },
  { id: 4, kind: 'off-by-one loop bound', file: `${ENGINE}/XbridgesEngine.ts`,
    before: 'for (let tries = 0; tries < 60; tries++, t /= 2) {', after: 'for (let tries = 0; tries < 59; tries++, t /= 2) {',
    what: 'trial-step halving loop has one try fewer', extra: `${VERIFICATION}/xbEngine.test.ts` },
  { id: 5, kind: 'off-by-one loop bound', file: `${ENGINE}/AdaptiveSolver.ts`,
    before: 'iter < 80 && hi - lo > EVENT_TIME_TOL', after: 'iter < 79 && hi - lo > EVENT_TIME_TOL',
    what: 'event bisection: 80 iterations become 79', extra: `${VERIFICATION}/xbSolvers.test.ts` },
  { id: 6, kind: 'flip comparison', file: `${ENGINE}/AdaptiveSolver.ts`,
    before: 'if (!(mid > lo && mid < hi)) break;', after: 'if (!(mid >= lo && mid < hi)) break;',
    what: 'event bisection stop test: strict lower bound becomes inclusive', extra: `${VERIFICATION}/xbSolvers.test.ts` },
  { id: 7, kind: 'swap + and -', file: `${ENGINE}/AdaptiveSolver.ts`,
    before: 'const tol = absTol + relTol * Math.max(', after: 'const tol = absTol - relTol * Math.max(',
    what: 'local error tolerance: absTol + relTol becomes absTol - relTol', extra: `${VERIFICATION}/xbSolvers.test.ts` },
  { id: 8, kind: 'drop clamp', file: `${ENGINE}/AdaptiveSolver.ts`,
    before: 'tHigh: Math.min(hi + 2 * EVENT_TIME_TOL, tHi)', after: 'tHigh: hi + 2 * EVENT_TIME_TOL',
    what: 'event bracket end is no longer clamped to the interval end', extra: `${VERIFICATION}/xbSolvers.test.ts` },
  { id: 9, kind: 'remove event-landing call', file: `${ENGINE}/AdaptiveSolver.ts`,
    before: 'crossBracket(engine, t, event!.tHigh, k1);', after: 'void k1;',
    what: 'the scheduled-event bracket is not crossed by the explicit step', extra: `${VERIFICATION}/xbSolvers.test.ts` },
  { id: 10, kind: 'swap min/max', file: `${ENGINE}/AdaptiveSolver.ts`,
    before: 'let h = Math.min(cfg.h0, cfg.hMax);', after: 'let h = Math.max(cfg.h0, cfg.hMax);',
    what: 'first step is no longer capped by maxStep (XBV-424)', extra: `${VERIFICATION}/xbSolvers.test.ts` },
  { id: 11, kind: 'change constant', file: `${ENGINE}/Solvers.ts`,
    before: "applyElementWise(sum, dt / 6, 'multiply')", after: "applyElementWise(sum, dt / 5, 'multiply')",
    what: 'fourth-order weight 1/6 becomes 1/5', extra: `${VERIFICATION}/xbSolvers.test.ts` },
  { id: 12, kind: 'swap + and -', file: `${ENGINE}/Solvers.ts`,
    before: 'Math.min(dt, stopTime - t)', after: 'Math.min(dt, stopTime + t)',
    what: 'discrete step is shortened to the wrong remaining time', extra: `${VERIFICATION}/xbSolvers.test.ts` },
  { id: 13, kind: 'off-by-one loop bound', file: `${ENGINE}/Solvers.ts`,
    before: 'for (let j = 0; j < s; j++) {', after: 'for (let j = 0; j <= s; j++) {',
    what: 'Runge-Kutta stage sum includes one term too many', extra: `${VERIFICATION}/xbSolvers.test.ts` },
  { id: 14, kind: 'swap + and -', file: `${ENGINE}/Solvers.ts`,
    before: 'Math.round((stopTime - startTime) / dt - 1e-9)', after: 'Math.round((stopTime - startTime) / dt + 1e-9)',
    what: 'number of output steps: - 1e-9 becomes + 1e-9', extra: `${VERIFICATION}/xbSolvers.test.ts` },
  { id: 15, kind: 'flip comparison', file: `${ENGINE}/zeroCrossingGuard.ts`,
    before: 'a[i] * b[i] < 0) return blockId;', after: 'a[i] * b[i] <= 0) return blockId;',
    what: 'crossing detection: strict sign change becomes a touch', extra: `${VERIFICATION}/xbSolvers.test.ts` },
  { id: 16, kind: 'off-by-one loop bound', file: `${ENGINE}/zeroCrossingGuard.ts`,
    before: 'return this.count > MAX_CONSECUTIVE_ZERO_CROSSINGS;', after: 'return this.count >= MAX_CONSECUTIVE_ZERO_CROSSINGS;',
    what: 'chatter limit fires one crossing early (count > limit becomes count >= limit)', extra: `${VERIFICATION}/xbSolvers.test.ts` },
  { id: 17, kind: 'drop clamp', file: `${ENGINE}/zeroCrossingGuard.ts`,
    before: 'tHigh: Math.min(tn + d, tEnd)', after: 'tHigh: tn + d',
    what: 'scheduled-event bracket end is no longer clamped to the interval end', extra: `${VERIFICATION}/xbSolvers.test.ts` },
  { id: 18, kind: 'swap min/max', file: `${ENGINE}/liveStep.ts`,
    before: 'const stepNow = Math.min(dt, remaining);', after: 'const stepNow = Math.max(dt, remaining);',
    what: 'canvas time base: the last output step is no longer shortened to the stop time', extra: `${VERIFICATION}/xbSolvers.test.ts` },
  { id: 19, kind: 'change constant', file: `${ENGINE}/liveStep.ts`,
    before: 'engine.options?.relTol ?? DEFAULT_REL_TOL', after: 'engine.options?.relTol ?? DEFAULT_ABS_TOL',
    what: 'default relative tolerance replaced by the absolute default (1e-3 becomes 1e-6)', extra: `${VERIFICATION}/xbSolvers.test.ts` },
  { id: 20, kind: 'drop check', file: `${ENGINE}/liveStep.ts`,
    before: 'const good = ok && !engine.hasFatalError();', after: 'const good = ok;',
    what: 'a step that raised a fatal error is committed', extra: `${VERIFICATION}/xbSolvers.test.ts` },
  { id: 21, kind: 'flip comparison', file: `${ENGINE}/BlockDefinitions.ts`,
    before: '(u > hi ? 1 : (u < lo ? -1 : 0))', after: '(u >= hi ? 1 : (u < lo ? -1 : 0))',
    what: 'saturation region: upper comparison becomes inclusive', extra: `${VERIFICATION}/xbEquations.dynamics.test.ts` },
  { id: 22, kind: 'drop clamp', file: `${ENGINE}/BlockDefinitions.ts`,
    before: '(v) => Math.max(v[1], Math.min(v[2], v[0]))', after: '(v) => v[0]',
    what: 'limited integrator output is no longer clamped to its limits', extra: `${VERIFICATION}/xbEquations.dynamics.test.ts` },
];

/** Per-mutant verdict. `killer` is the first failure the unmutated code does not have; empty for survivors. */
export interface MutantResult { id: number; status: 'killed' | 'survived' | 'timeout' | 'error'; killer: string; seconds: number; preexisting: number }

interface VitestRun { timedOut: boolean; code: number | null; seconds: number; failing: string[] | null; stderrTail: string }

function git(args: string[]): string {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' });
}

function readAnchor(m: Mutation, text: string): void {
  const count = text.split(m.before).length - 1;
  if (count !== 1) throw new Error(`mutant ${m.id} (${m.file}): 'before' occurs ${count} times, expected exactly 1: ${m.before}`);
  if (m.before === m.after) throw new Error(`mutant ${m.id}: 'after' equals 'before'`);
}

/** Names of every failing test, and of every file whose suite failed to run, in a vitest JSON report. */
export function failingTests(report: unknown): string[] {
  const files = (report as { testResults?: Array<{ name: string; status: string;
    assertionResults?: Array<{ fullName: string; status: string }> }> }).testResults ?? [];
  const rel = (p: string) => (p.startsWith(ROOT) ? p.slice(ROOT.length + 1) : p).replace(/\\/g, '/');
  const names: string[] = [];
  for (const f of files) {
    const failed = (f.assertionResults ?? []).filter((a) => a.status === 'failed');
    for (const a of failed) names.push(`${rel(f.name)} > ${a.fullName}`);
    if (failed.length === 0 && f.status === 'failed') names.push(`${rel(f.name)} (suite failed to run)`);
  }
  return names;
}

let activeChild: ChildProcess | null = null;
/** Kills the active vitest process group (detached child), so an interrupted run leaves no orphan. */
function killActiveChild(): void {
  const child = activeChild;
  if (child === null || child.pid === undefined) return;
  try {
    if (process.platform !== 'win32') process.kill(-child.pid, 'SIGKILL'); else child.kill('SIGKILL');
  } catch {
    try { child.kill('SIGKILL'); } catch { /* already gone */ }
  }
}

function runVitest(tests: string[], timeoutMs: number, outFile: string): Promise<VitestRun> {
  const args = [VITEST, 'run', ...tests, '--exclude', '.claude/**', '--reporter=json', `--outputFile=${outFile}`];
  // XBV_SEED_BASE is removed: the mutation run always uses the fixed seeds, so the verdicts are comparable across nights.
  const env = { ...process.env, CI: 'true' };
  delete env.XBV_SEED_BASE;
  const started = Date.now();
  return new Promise((resolvePromise) => {
    let timedOut = false;
    const child: ChildProcess = spawn(process.execPath, args, {
      cwd: ROOT, env, detached: process.platform !== 'win32', stdio: ['ignore', 'ignore', 'pipe'],
    });
    activeChild = child;
    let stderr = '';
    child.stderr?.on('data', (chunk) => { if (stderr.length < 4000) stderr += String(chunk); });
    const kill = () => {
      try {
        if (process.platform !== 'win32' && child.pid !== undefined) process.kill(-child.pid, 'SIGKILL');
        else child.kill('SIGKILL');
      } catch {
        child.kill('SIGKILL');
      }
    };
    const timer = setTimeout(() => { timedOut = true; kill(); }, timeoutMs);
    child.on('close', (code) => {
      clearTimeout(timer);
      if (activeChild === child) activeChild = null;
      const seconds = Math.round((Date.now() - started) / 100) / 10;
      let failing: string[] | null = null;
      if (!timedOut && existsSync(outFile)) {
        try { failing = failingTests(JSON.parse(readFileSync(outFile, 'utf8'))); } catch { failing = null; }
      }
      resolvePromise({ timedOut, code, seconds, failing, stderrTail: stderr.trim().split('\n').slice(-3).join(' ').slice(0, 300) });
    });
  });
}

/**
 * Verdict of one mutant. A failure counts as a kill only when the unmutated code does not have it: a test that already
 * fails at HEAD is a pre-existing finding, not evidence that the suite detects the mutant.
 */
export function classify(run: VitestRun, baseline: ReadonlySet<string>): { status: MutantResult['status']; killer: string; preexisting: number } {
  if (run.timedOut) return { status: 'timeout', killer: 'no result within the timeout', preexisting: 0 };
  if (run.failing === null) return { status: 'error', killer: `no report (vitest exit ${run.code}): ${run.stderrTail}`, preexisting: 0 };
  const fresh = run.failing.filter((name) => !baseline.has(name));
  const preexisting = run.failing.length - fresh.length;
  if (fresh.length > 0) return { status: 'killed', killer: fresh[0], preexisting };
  if (run.code !== 0 && run.failing.length === 0) {
    return { status: 'error', killer: `vitest exit ${run.code} without a failing test: ${run.stderrTail}`, preexisting };
  }
  return { status: 'survived', killer: '', preexisting };
}

interface Options { check: boolean; limit: number | null; only: number[] | null; timeoutSeconds: number; writeReport: boolean }

export function parseOptions(argv: string[]): Options {
  const opts: Options = { check: false, limit: null, only: null, timeoutSeconds: 0, writeReport: true };
  for (const arg of argv) {
    if (arg === '--check') opts.check = true;
    else if (arg === '--no-report') opts.writeReport = false;
    else if (arg.startsWith('--limit=')) opts.limit = positiveInt(arg, arg.slice(8));
    else if (arg.startsWith('--timeout=')) opts.timeoutSeconds = positiveInt(arg, arg.slice(10));
    else if (arg.startsWith('--only=')) opts.only = arg.slice(7).split(',').map((s) => positiveInt(arg, s));
    else throw new Error(`unknown argument: ${arg}`);
  }
  return opts;
}

function positiveInt(flag: string, text: string): number {
  if (!/^\d+$/.test(text) || Number(text) < 1) throw new Error(`${flag}: expected a positive integer`);
  return Number(text);
}

export function selectMutants(all: Mutation[], opts: Pick<Options, 'limit' | 'only'>): Mutation[] {
  let chosen = all;
  if (opts.only !== null) {
    const wanted = new Set(opts.only);
    for (const id of wanted) if (!all.some((m) => m.id === id)) throw new Error(`--only: no mutant ${id}`);
    chosen = all.filter((m) => wanted.has(m.id));
  }
  if (opts.limit !== null) chosen = chosen.slice(0, opts.limit);
  return chosen;
}

export function killRate(results: MutantResult[]): { killed: number; survived: number; timeout: number; error: number; rate: number | null } {
  const killed = results.filter((r) => r.status === 'killed').length;
  const timeout = results.filter((r) => r.status === 'timeout').length;
  const survived = results.filter((r) => r.status === 'survived').length;
  const error = results.filter((r) => r.status === 'error').length;
  const denominator = killed + timeout + survived;
  return { killed, survived, timeout, error, rate: denominator === 0 ? null : (killed + timeout) / denominator };
}

const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');

export function renderReport(args: {
  results: MutantResult[]; selected: Mutation[]; total: number; sha: string; date: string; timeoutSeconds: number; baseline: string[];
}): string {
  const { results, selected, total, sha, date, timeoutSeconds, baseline } = args;
  const k = killRate(results);
  const partial = selected.length < total;
  const byId = new Map(results.map((r) => [r.id, r]));
  const lines: string[] = [];
  lines.push('# X-Bridges mutation report (WP-22)');
  lines.push('');
  lines.push(`Generated by \`npx tsx scripts/xbridges-verification/mutationRun.ts\` on ${date} at commit \`${sha}\`.`);
  lines.push('');
  lines.push(partial
    ? `**Scope: PARTIAL.** ${selected.length} of ${total} mutants were run locally; the nightly job runs all ${total}. The kill rate below covers only the mutants listed.`
    : `**Scope: full.** All ${total} mutants were run.`);
  lines.push('');
  lines.push(`Each mutant is one string replacement (the \`before\` text occurs exactly once in the file) applied to one engine file, one at a time. ` +
    `The targeted subset is the verification folder (\`${VERIFICATION}\`) plus the relevant equations file. ` +
    `Timeout per mutant: ${timeoutSeconds} s (a timeout counts as killed). Survived: no failure that the baseline lacks.`);
  lines.push('');
  lines.push(`**Baseline (unmutated code): ${baseline.length} failing test${baseline.length === 1 ? '' : 's'}.** ` +
    'A failure counts as a kill only when it is absent from the baseline, so a test that already fails at HEAD is never credited to a mutant.');
  for (const name of baseline) lines.push(`- ${cell(name)}`);
  lines.push('');
  lines.push('| # | Kind | File | Mutation | Result | Killing test |');
  lines.push('| --- | --- | --- | --- | --- | --- |');
  for (const m of selected) {
    const r = byId.get(m.id);
    const result = r ? r.status : 'not run';
    const killer = r && r.status !== 'survived' ? r.killer : '-';
    lines.push(`| ${m.id} | ${cell(m.kind)} | \`${m.file.replace(`${ENGINE}/`, '')}\` | ${cell(m.what)}: \`${cell(m.before)}\` to \`${cell(m.after)}\` | ${result} | ${cell(killer || '-')} |`);
  }
  lines.push('');
  lines.push(`Killed ${k.killed}, survived ${k.survived}, timeout ${k.timeout}, error ${k.error} (of ${results.length} run).`);
  lines.push('');
  lines.push(k.rate === null
    ? 'Kill rate: n/a (no mutant produced a verdict).'
    : `Kill rate: ${(k.rate * 100).toFixed(1)}% = (killed + timeout) / (killed + timeout + survived). Errors (no verdict) are excluded.`);
  lines.push('');
  return lines.join('\n');
}

async function main(): Promise<void> {
  const opts = parseOptions(process.argv.slice(2));
  const selected = selectMutants(MUTATIONS, opts);

  const files = [...new Set(MUTATIONS.map((m) => m.file))];
  const originals = new Map<string, Buffer>();
  for (const f of files) {
    const abs = join(ROOT, f);
    if (!existsSync(abs)) throw new Error(`mutation target missing: ${f}`);
    originals.set(f, readFileSync(abs));
  }
  for (const m of MUTATIONS) readAnchor(m, originals.get(m.file)!.toString('utf8'));
  console.log(`anchors ok: ${MUTATIONS.length} mutants in ${files.length} files`);
  if (opts.check) return;

  const dirty = git(['status', '--porcelain', '--', ...files]).trim();
  if (dirty !== '') throw new Error(`refusing to mutate files with uncommitted changes:\n${dirty}`);

  const tests = [VERIFICATION, ...new Set(MUTATIONS.map((m) => m.extra))];
  // --timeout=<s> fixes the per-mutant timeout; by default it is 3 x the baseline run time (at least 120 s), so a slow
  // CI runner does not turn ordinary runs into false kills. The baseline itself may take up to 1800 s.
  let timeoutMs = opts.timeoutSeconds > 0 ? opts.timeoutSeconds * 1000 : 1_800_000;
  const workDir = mkdtempSync(join(tmpdir(), 'xbv-mutation-'));
  const restoreAll = () => {
    for (const [f, buf] of originals) writeFileSync(join(ROOT, f), buf);
  };
  // On SIGINT / SIGTERM: kill the vitest process group, restore every mutated file and remove the work directory
  // (process.exit skips the finally block below, so the cleanup is done here too).
  const onSignal = () => {
    killActiveChild();
    restoreAll();
    rmSync(workDir, { recursive: true, force: true });
    process.exit(130);
  };
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);

  const results: MutantResult[] = [];
  let baseline: string[] = [];
  try {
    console.log('baseline: unmutated subset');
    const base = await runVitest(tests, timeoutMs, join(workDir, 'baseline.json'));
    if (base.timedOut || base.failing === null) throw new Error('baseline run produced no report; no mutant is attributed');
    baseline = base.failing;
    if (opts.timeoutSeconds === 0) timeoutMs = Math.max(120_000, Math.round(3 * base.seconds * 1000));
    console.log(`  per-mutant timeout ${Math.round(timeoutMs / 1000)} s`);
    const baselineSet = new Set(baseline);
    console.log(`  -> ${baseline.length} failing at baseline in ${base.seconds} s`);

    for (const m of selected) {
      const abs = join(ROOT, m.file);
      const original = originals.get(m.file)!;
      const mutated = original.toString('utf8').replace(m.before, m.after);
      console.log(`mutant ${m.id} (${m.kind}) ${m.file}`);
      try {
        writeFileSync(abs, mutated, 'utf8');
        const run = await runVitest([VERIFICATION, m.extra], timeoutMs, join(workDir, `mutant-${m.id}.json`));
        const verdict = classify(run, baselineSet);
        results.push({ id: m.id, status: verdict.status, killer: verdict.killer, seconds: run.seconds, preexisting: verdict.preexisting });
        console.log(`  -> ${verdict.status} in ${run.seconds} s${verdict.killer ? `: ${verdict.killer}` : ''}`);
      } finally {
        writeFileSync(abs, original);
      }
    }
  } finally {
    restoreAll();
    rmSync(workDir, { recursive: true, force: true });
    process.removeListener('SIGINT', onSignal);
    process.removeListener('SIGTERM', onSignal);
  }

  for (const f of files) {
    if (!readFileSync(join(ROOT, f)).equals(originals.get(f)!)) throw new Error(`${f} was not restored byte-for-byte`);
  }

  const k = killRate(results);
  console.log(`killed ${k.killed}, survived ${k.survived}, timeout ${k.timeout}, error ${k.error}; kill rate ${k.rate === null ? 'n/a' : `${(k.rate * 100).toFixed(1)}%`}`);
  if (opts.writeReport) {
    const sha = git(['rev-parse', '--short', 'HEAD']).trim();
    const date = new Date().toISOString().slice(0, 10);
    writeFileSync(REPORT_PATH, renderReport({
      results, selected, total: MUTATIONS.length, sha, date, timeoutSeconds: Math.round(timeoutMs / 1000), baseline,
    }), 'utf8');
    console.log(`report: ${REPORT_PATH}`);
  }
}

const invokedDirectly = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  });
}
