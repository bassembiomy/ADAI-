/**
 * Test kit: run a buildModel spec through the embedded state-machine X-Bridges interpreter
 * (XBPersistedModelV1 -> validateXBModel -> buildXBSemanticModel -> createXBRuntime -> stepXBState).
 *
 * TIME ALIGNMENT (fixed from the analytic case Constant 1 -> Integrator, IC 0, y(t) = t; never by fitting):
 *   canvas runModel sample k (k = 0..N-1) holds the output at t_k = k*dt (sample 0 = initial condition).
 *   See EMBEDDED_STEP_FOR_CANVAS_SAMPLE below: it is the single place the mapping is defined.
 */
import { BLOCK_LIBRARY } from '../BlockDefinitions';
import type { ModelDiagnostic } from '../types';
import { DEFAULT_XB_EMBEDDED_LIMITS } from '../../../utils/stateMachine/xbEmbeddedProfile';
import type { XBPersistedModelV1, XBTargetCapabilities } from '../../../utils/stateMachine/xbModel';
import { buildXBSemanticModel } from '../../../utils/stateMachine/xbSemanticBuilder';
import { validateXBModel } from '../../../utils/stateMachine/xbSemanticValidator';
import { createXBRuntime, stepXBState } from '../../../utils/stateMachine/xbInterpreter';
import type { ModelSpec } from './model';

export const EMBEDDED_TARGET: XBTargetCapabilities = {
  supportsFloat16: false,
  supportsFloat32: true,
  supportsFloat64: true,
  supportsMathLibrary: true,
  maxVectorLength: 16,
  maxMatrixDimension: 8,
  embeddedLimits: DEFAULT_XB_EMBEDDED_LIMITS,
};

export type EmbeddedSolver = 'euler' | 'rk4' | 'discrete';

export interface EmbeddedOptions {
  solver: EmbeddedSolver;
  dt: number;
  /** Number of embedded ticks executed. */
  steps: number;
  /** 'block.port' probes. */
  probes: string[];
  /** Optional dimensions per 'block.port' (default scalar): [] scalar, [n] vector, [r, c] matrix. */
  portDimensions?: Record<string, number[]>;
}

export interface EmbeddedDiagnostic { stage: 'validate' | 'build' | 'run'; severity: string; code?: string; message?: string }

export interface EmbeddedResult {
  /** signals[probe][tick] = flattened element values after tick+1 calls of stepXBState. */
  signals: Record<string, number[][]>;
  diagnostics: EmbeddedDiagnostic[];
  ok: boolean;
}

/**
 * Embedded tick index compared with the canvas sample k (value at t = k*dt). The mapping k -> k is fixed by the
 * time-varying sources: WaveformGen and Clock in embedded tick k equal the closed form at t = k*dt. (The integrator
 * case y = t does not fix it: inside one embedded tick, sources and UNIT_DELAY are at t_k while Integrator/RATE_LIMITER
 * report their post-update state and Step uses t_(k+1) - finding XBV-084, convention to be decided, decision D9.)
 */
export const EMBEDDED_STEP_FOR_CANVAS_SAMPLE = (k: number): number => k;

export function toEmbeddedModel(spec: ModelSpec, o: Pick<EmbeddedOptions, 'solver' | 'dt' | 'portDimensions'>): XBPersistedModelV1 {
  const port = (blockId: string, p: any) => {
    const dims = o.portDimensions?.[`${blockId}.${p.id}`] ?? [];
    const shape = dims.length === 0 ? 'scalar' : dims.length === 1 ? 'vector' : 'matrix';
    return dims.length === 0
      ? { id: p.id, direction: p.direction, shape, dataType: 'float64' }
      : { id: p.id, direction: p.direction, shape, dimensions: dims, dataType: 'float64' };
  };
  const nodes = spec.blocks.map((b) => {
    const blk = BLOCK_LIBRARY[b.type](b.id, { ...(b.params ?? {}) });
    const merged: Record<string, any> = { ...(blk.params as any), ...(b.params ?? {}) };
    // The embedded model stores a matrix Constant row-major and flat (smDifferential shapedTraceFixture); the canvas takes nested rows.
    if (b.type === 'Constant' && Array.isArray(merged.value) && Array.isArray(merged.value[0])) merged.value = merged.value.flat();
    return {
      id: b.id,
      type: b.type,
      parameters: {
        ...merged,
        inputs: blk.inputs.map((p: any) => port(b.id, p)),
        outputs: blk.outputs.map((p: any) => port(b.id, p)),
      },
    };
  });
  const edges = spec.wires.map((w, i) => {
    const m = /^\s*([^\s.>-]+)\.([^\s>-]+)\s*->\s*([^\s.>-]+)\.([^\s>-]+)\s*$/.exec(w);
    if (!m) throw new Error(`toEmbeddedModel: malformed wire '${w}'`);
    return { id: `e${i}`, sourceNodeId: m[1], sourcePortId: m[2], targetNodeId: m[3], targetPortId: m[4] };
  });
  return {
    schemaVersion: 1,
    nodes,
    edges,
    mappings: [],
    solver: { kind: o.solver, stepSeconds: o.dt },
    policy: { memory: 'reset', numericFault: 'escalate' },
  } as XBPersistedModelV1;
}

const flatNumbers = (v: unknown): number[] => (Array.isArray(v) ? v.flatMap(flatNumbers) : [typeof v === 'boolean' ? (v ? 1 : 0) : Number(v)]);

export function runEmbedded(spec: ModelSpec, options: EmbeddedOptions): EmbeddedResult {
  const signals: Record<string, number[][]> = {};
  for (const p of options.probes) signals[p] = [];
  const diagnostics: EmbeddedDiagnostic[] = [];
  const conv = (stage: EmbeddedDiagnostic['stage'], ds: readonly any[]) => {
    for (const d of ds) diagnostics.push({ stage, severity: String(d.severity), code: d.code, message: d.message });
  };
  const model = toEmbeddedModel(spec, options);
  const vd = validateXBModel(model, {}, EMBEDDED_TARGET) as ModelDiagnostic[];
  conv('validate', vd);
  if (vd.some((d) => d.severity === 'error')) return { signals, diagnostics, ok: false };
  let built: ReturnType<typeof buildXBSemanticModel>;
  try {
    built = buildXBSemanticModel({ stateId: 's', model, variables: {}, target: EMBEDDED_TARGET, baseTickMs: options.dt * 1000 });
  } catch (err) {
    // The builder throws instead of returning a diagnostic for some invalid parameters: reported as a parity gap.
    diagnostics.push({ stage: 'build', severity: 'error', code: 'EMBEDDED_THROW', message: err instanceof Error ? err.message : String(err) });
    return { signals, diagnostics, ok: false };
  }
  conv('build', built.diagnostics);
  if (!built.ir || built.diagnostics.some((d) => d.severity === 'error')) return { signals, diagnostics, ok: false };
  let runtime: ReturnType<typeof createXBRuntime>;
  try {
    runtime = createXBRuntime(built.ir);
  } catch (err) {
    diagnostics.push({ stage: 'run', severity: 'error', code: 'EMBEDDED_THROW', message: err instanceof Error ? err.message : String(err) });
    return { signals, diagnostics, ok: false };
  }
  for (let i = 0; i < options.steps; i++) {
    try {
      stepXBState(runtime, {});
    } catch (err) {
      diagnostics.push({ stage: 'run', severity: 'error', code: 'EMBEDDED_THROW', message: err instanceof Error ? err.message : String(err) });
      return { signals, diagnostics, ok: false };
    }
    for (const p of options.probes) {
      const raw = runtime.signals[p.replace('.', ':')];
      signals[p].push(raw === undefined ? [] : flatNumbers(raw));
    }
  }
  return { signals, diagnostics, ok: true };
}
