/**
 * Test kit (gate V7): generated C99 versus the state-machine interpreter, per tick, on the same IR.
 *
 * Pipeline: ModelSpec -> toEmbeddedModel (same persisted model as runEmbedded) -> one-state machine owning it
 * (hybridXBridgesFixture, state 'controller') -> buildSemanticModel -> IR.
 *   interpreter side: createRuntime / initializeRuntime / stepRuntime(ir.tickMs) per tick, signals read from the trace frame.
 *   C side: generateCArtifacts(ir), harness main() = SM_Init then SM_Step(tickMs) N times, every probed X-Bridges
 *   signal printed with "%.17g" per tick, compiled with a configurable compiler and flags in a fresh mkdtemp
 *   directory that is always removed.
 * Probes are 'block.port'. Numeric fault policy defaults to 'signal-only' so out-of-domain results are compared as values
 * (with 'escalate' both sides stop at the first fault).
 */
import { execFile } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { buildSemanticModel } from '../../../utils/stateMachine/smSemanticBuilder';
import { generateCArtifacts } from '../../../utils/stateMachine/smCGenerator';
import { hybridXBridgesFixture } from '../../../utils/stateMachine/smFixtures';
import { createRuntime, initializeRuntime, stepRuntime } from '../../../utils/stateMachine/smInterpreter';
import { toCIdentifier } from '../../../utils/stateMachine/smExpressions';
import type { SemanticModel } from '../../../utils/stateMachine/smSemanticModel';
import type { ModelSpec } from './model';
import { buildXBSemanticModel } from '../../../utils/stateMachine/xbSemanticBuilder';
import { validateXBModel } from '../../../utils/stateMachine/xbSemanticValidator';
import { EMBEDDED_TARGET, toEmbeddedModel, type EmbeddedSolver } from './embedded';

const execFileAsync = promisify(execFile);

export const PARITY_STATE_ID = 'controller';

export interface CParityBuildOptions {
  solver: EmbeddedSolver;
  dt: number;
  probes: string[];
  portDimensions?: Record<string, number[]>;
  /** Default 'signal-only'. */
  numericFault?: 'escalate' | 'signal-only';
}

export interface ParityDiagnostic { severity: string; code?: string; message?: string }

export interface ParityBuild {
  ok: boolean;
  diagnostics: ParityDiagnostic[];
  ir?: SemanticModel;
}

/** Spec -> IR of a one-state machine owning the X-Bridges model. Never throws: a builder throw is reported as a diagnostic. */
export function buildParityIr(spec: ModelSpec, options: CParityBuildOptions): ParityBuild {
  try {
    const xb = toEmbeddedModel(spec, options);
    (xb as { policy: unknown }).policy = { memory: 'reset', numericFault: options.numericFault ?? 'signal-only' };
    // The production state-machine profile refuses float64 (STATE_MACHINE_XB_TARGET_CAPABILITIES.supportsFloat64 = false), so the
    // one-state machine is built with an empty X-Bridges model and the persisted model is then built with EMBEDDED_TARGET
    // (float64 allowed, same target as runEmbedded) and attached to the state, as xbCGenerator.test.ts does for hand-built IR.
    const sm = hybridXBridgesFixture();
    sm.tickMs = Math.round(options.dt * 1000);
    sm.states[0].autostart = false;
    const controller = sm.states.find((s) => s.id === PARITY_STATE_ID)!;
    controller.autostart = true;
    const shell = buildSemanticModel(sm);
    if (!shell.ir) return { ok: false, diagnostics: shell.diagnostics.map((d) => ({ severity: String(d.severity), code: d.code, message: d.message })) };
    const diagnostics: ParityDiagnostic[] = [];
    const push = (ds: readonly { severity?: unknown; code?: string; message?: string }[]) => {
      for (const d of ds) diagnostics.push({ severity: String(d.severity), code: d.code, message: d.message });
    };
    const vd = validateXBModel(xb, {}, EMBEDDED_TARGET);
    push(vd);
    if (diagnostics.some((d) => d.severity === 'error')) return { ok: false, diagnostics };
    const built = buildXBSemanticModel({
      stateId: PARITY_STATE_ID,
      ownerState: shell.stateSymbols?.get(PARITY_STATE_ID),
      model: xb,
      variables: {},
      target: EMBEDDED_TARGET,
      baseTickMs: sm.tickMs,
    });
    push(built.diagnostics);
    if (!built.ir || diagnostics.some((d) => d.severity === 'error')) return { ok: false, diagnostics };
    // The shell IR is frozen: rebuild the path to the state instead of assigning.
    const ir: SemanticModel = {
      ...shell.ir,
      states: { ...shell.ir.states, [PARITY_STATE_ID]: { ...shell.ir.states[PARITY_STATE_ID], xBridges: built.ir } },
    };
    return { ok: true, diagnostics, ir };
  } catch (err) {
    return { ok: false, diagnostics: [{ severity: 'error', code: 'PARITY_THROW', message: err instanceof Error ? err.message : String(err) }] };
  }
}

const flatNumbers = (v: unknown): number[] =>
  Array.isArray(v) ? v.flatMap(flatNumbers) : [typeof v === 'boolean' ? (v ? 1 : 0) : Number(v)];

export type PerTick = Record<string, number[][]>;

/** Interpreter side: signals[probe][tick] = flattened row-major values after tick+1 state-machine steps. */
export function interpretIr(ir: SemanticModel, steps: number, probes: string[]): { signals: PerTick; error?: string } {
  const signals: PerTick = {};
  for (const p of probes) signals[p] = [];
  const runtime = createRuntime(ir);
  initializeRuntime(runtime);
  for (let i = 0; i < steps; i++) {
    const frame = stepRuntime(runtime, ir.tickMs);
    if (frame.error !== null) return { signals, error: `tick ${i + 1}: ${JSON.stringify(frame.error)}` };
    const sigs = frame.xBridges[PARITY_STATE_ID]?.signals ?? {};
    for (const p of probes) signals[p].push(flatNumbers(sigs[p.replace('.', ':')]));
  }
  return { signals };
}

export interface ParitySources { files: { name: string; content: string }[] }

export function generateParitySources(ir: SemanticModel): ParitySources {
  const out = generateCArtifacts(ir, { includeTestShims: true });
  return { files: out.files.filter((f) => f.name.endsWith('.c') || f.name.endsWith('.h')).map((f) => ({ name: f.name, content: f.content })) };
}

/** C field of a probed signal: <state member>.<signal field>; verified against the generated header text. */
function probeAccessor(ir: SemanticModel, header: string, probe: string): { access: string; count: number; dims: number[] } {
  const xb = ir.states[PARITY_STATE_ID].xBridges!;
  const sig = xb.signals[probe.replace('.', ':')];
  if (!sig) throw new Error(`probe '${probe}' is not an X-Bridges signal of the IR`);
  // A fixed-point signal is read through its real-value shadow field (what the interpreter publishes).
  const base = toCIdentifier(`${sig.nodeId}_${sig.portId}`);
  const field = sig.numericType.kind === 'fixed' ? `${base}_real_value` : base;
  if (!new RegExp(`\\b${field}(\\[\\d+\\])*;`).test(header)) throw new Error(`generated header has no field '${field}' for probe '${probe}'`);
  const dims = sig.shape.kind === 'scalar' ? [] : sig.shape.kind === 'vector' ? [sig.shape.length] : [sig.shape.rows, sig.shape.columns];
  return { access: `instance.xb_${toCIdentifier(PARITY_STATE_ID)}.${field}`, count: dims.reduce((a, b) => a * b, 1), dims };
}

/** Harness source: one output line per tick, values comma separated in probe order (row-major), "%.17g". */
export function renderParityHarness(ir: SemanticModel, sources: ParitySources, steps: number, probes: string[]): string {
  const header = sources.files.filter((f) => f.name.endsWith('.h')).map((f) => f.content).join('\n');
  const printers: string[] = [];
  let first = true;
  for (const p of probes) {
    const { access, count, dims } = probeAccessor(ir, header, p);
    for (let k = 0; k < count; k++) {
      const idx = dims.length === 0 ? '' : dims.length === 1 ? `[${k}]` : `[${Math.floor(k / dims[1])}][${k % dims[1]}]`;
      printers.push(`        printf("${first ? '' : ','}%.17g", (double)${access}${idx});`);
      first = false;
    }
  }
  return [
    '#include "sm_core.h"',
    '#include <stdio.h>',
    '',
    'int main(void)',
    '{',
    '    ADIA_Instance_t instance;',
    '    unsigned tick;',
    '    if (SM_Init(&instance) != SM_ERR_NONE) {',
    '        return 1;',
    '    }',
    `    for (tick = 0U; tick < ${steps}U; ++tick) {`,
    `        if (SM_Step(&instance, ${ir.tickMs}U) != SM_ERR_NONE) {`,
    '            return 2;',
    '        }',
    ...printers,
    '        printf("\\n");',
    '    }',
    '    return 0;',
    '}',
    '',
  ].join('\n');
}

export interface CCompileOptions {
  compiler?: string;
  /** Default: -std=c99 -pedantic -Wall -Wextra -Werror -O0 */
  flags?: string[];
  timeoutMs?: number;
}

export const DEFAULT_PARITY_FLAGS = ['-std=c99', '-pedantic', '-Wall', '-Wextra', '-Werror', '-O0'];
export const STRICT_PARITY_FLAGS = ['-std=c99', '-Wall', '-Wextra', '-Werror', '-pedantic', '-Wconversion', '-Wdouble-promotion', '-Wshadow'];

export interface CRunOutcome {
  /** compiled and executed with exit code 0 */
  ok: boolean;
  stage: 'compile' | 'run' | 'done';
  /** stderr of the compiler (all diagnostics) or of the executable. */
  log: string;
  exitCode: number | null;
  stdout: string;
}

/** Compile `files` + harness in a fresh mkdtemp directory (always removed), run, return stdout. */
export async function compileAndRunParity(
  sources: ParitySources, harness: string, options: CCompileOptions = {},
): Promise<CRunOutcome> {
  const dir = mkdtempSync(join(tmpdir(), 'xb-cparity-'));
  try {
    for (const f of sources.files) writeFileSync(join(dir, f.name), f.content);
    writeFileSync(join(dir, 'parity_harness.c'), harness);
    const csources = [...sources.files.map((f) => f.name).filter((n) => n.endsWith('.c')), 'parity_harness.c'];
    const exe = join(dir, 'parity.exe');
    try {
      await execFileAsync(options.compiler ?? 'gcc', [...(options.flags ?? DEFAULT_PARITY_FLAGS), '-I.', ...csources, '-lm', '-o', exe], {
        cwd: dir, timeout: options.timeoutMs ?? 240_000, maxBuffer: 64 * 1024 * 1024,
      });
    } catch (err) {
      const e = err as { stderr?: string; message?: string };
      return { ok: false, stage: 'compile', log: String(e.stderr ?? e.message ?? err), exitCode: null, stdout: '' };
    }
    try {
      const r = await execFileAsync(exe, [], { cwd: dir, timeout: 60_000, maxBuffer: 64 * 1024 * 1024 });
      return { ok: true, stage: 'done', log: String(r.stderr ?? ''), exitCode: 0, stdout: String(r.stdout) };
    } catch (err) {
      const e = err as { stderr?: string; stdout?: string; code?: number; message?: string };
      return { ok: false, stage: 'run', log: String(e.stderr ?? e.message ?? err), exitCode: typeof e.code === 'number' ? e.code : null, stdout: String(e.stdout ?? '') };
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const parseNumber = (s: string): number => {
  const t = s.trim().toLowerCase();
  if (t === 'nan' || t === '-nan') return Number.NaN;
  if (t === 'inf') return Number.POSITIVE_INFINITY;
  if (t === '-inf') return Number.NEGATIVE_INFINITY;
  return Number(t);
};

/** Parse harness stdout into signals[probe][tick] using the probe widths of the IR. */
export function parseParityOutput(ir: SemanticModel, sources: ParitySources, probes: string[], stdout: string): PerTick {
  const header = sources.files.filter((f) => f.name.endsWith('.h')).map((f) => f.content).join('\n');
  const widths = probes.map((p) => probeAccessor(ir, header, p).count);
  const out: PerTick = {};
  for (const p of probes) out[p] = [];
  for (const line of stdout.split(/\r?\n/).filter((l) => l.length > 0)) {
    const vals = line.split(',').map(parseNumber);
    let at = 0;
    probes.forEach((p, i) => { out[p].push(vals.slice(at, at + widths[i])); at += widths[i]; });
  }
  return out;
}

export interface CParityResult {
  build: ParityBuild;
  interpreter: PerTick;
  interpreterError?: string;
  c: PerTick;
  outcome?: CRunOutcome;
  sources?: ParitySources;
  /** The generator or the harness renderer threw (message). */
  generateError?: string;
  /** build ok, interpreter ran all ticks, C compiled and ran. */
  ok: boolean;
}

export interface CParityOptions extends CParityBuildOptions, CCompileOptions { steps: number }

/** Full run: spec -> IR -> interpreter trace + generated C trace. */
export async function runCParity(spec: ModelSpec, options: CParityOptions): Promise<CParityResult> {
  const build = buildParityIr(spec, options);
  if (!build.ok || !build.ir) return { build, interpreter: {}, c: {}, ok: false };
  const interp = interpretIr(build.ir, options.steps, options.probes);
  let sources: ParitySources;
  let harness: string;
  try {
    sources = generateParitySources(build.ir);
    harness = renderParityHarness(build.ir, sources, options.steps, options.probes);
  } catch (err) {
    return { build, interpreter: interp.signals, interpreterError: interp.error, c: {}, ok: false, generateError: err instanceof Error ? err.message : String(err) };
  }
  const outcome = await compileAndRunParity(sources, harness, options);
  const c = outcome.ok ? parseParityOutput(build.ir, sources, options.probes, outcome.stdout) : {};
  return { build, interpreter: interp.signals, interpreterError: interp.error, c, outcome, sources, ok: outcome.ok && interp.error === undefined };
}

/** Bounded-concurrency map for batching compiles. */
export async function mapPool<T, R>(items: readonly T[], concurrency: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
  return results;
}
