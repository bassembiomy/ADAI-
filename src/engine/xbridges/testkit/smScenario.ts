/**
 * Test kit (gate V7, plan 7.2): one scenario corpus, three executions of a state machine that owns X-Bridges models.
 *   sim        : smInterpreter driving xbInterpreter through the SM trace harness (runInterpreterTrace)
 *   standalone : the public standalone runtime API (smStandaloneRuntime: build, create, initialize, applyInputs, step, reset)
 *   c          : the generated C package compiled with gcc and run through the differential harness
 * Frames are compared per tick on the active configuration, every variable, timers, history and every X-Bridges
 * signal / block-state slot / fault. Tolerance: booleans, integers and the state configuration exact, float <= 4 ULP.
 * Expected values never come from this file: scenarios state them from the documented semantics.
 */
import { createGeneratedCodeTestWorkspace } from '../../../utils/generatedCodeTestWorkspace';
import { generateCArtifacts } from '../../../utils/stateMachine/smCGenerator';
import {
  compileAndRunCProgram,
  compileAndRunCTrace,
  renderDifferentialHarness,
  runInterpreterTrace,
} from '../../../utils/stateMachine/smCHarness';
import type { DifferentialFixture, DifferentialScenarioStep } from '../../../utils/stateMachine/smFixtures';
import {
  CURRENT_SM_SCHEMA_VERSION,
  defaultSMVerificationConfig,
  type StateMachineModelV5,
} from '../../../utils/stateMachine/smModel';
import type { SemanticModel } from '../../../utils/stateMachine/smSemanticModel';
import type { SemanticTraceFrame } from '../../../utils/stateMachine/smTrace';
import { ADIAStateMachineRuntime } from '../../../utils/stateMachine/smStandaloneRuntime';
import type { StateData, TransitionData, VariableDef, VariableType } from '../../../types/sm_types';
import { ulpDistance } from './tolerance';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

export type ScenarioStep = DifferentialScenarioStep;

/* ---------------------------------------------------------------- model builders */

export const smVar = (
  id: string,
  type: VariableType = 'float',
  initial: number | boolean = 0,
): VariableDef => ({
  id, name: id, type, initialValue: String(initial), currentValue: initial, visibleInScope: true,
});

export const smState = (id: string, o: Partial<StateData> = {}): StateData => ({
  id, name: id, x: 0, y: 0, width: 100, height: 60, entry: '', during: '', exit: '', isActive: false,
  color: '#000000', parentId: null, children: [], priority: 1, isParallel: false, regionId: null, autostart: false, ...o,
});

export const smTransition = (
  id: string,
  sourceId: string,
  targetId: string,
  o: Partial<TransitionData> = {},
): TransitionData => ({
  id, sourceId, targetId, condition: '', action: '', afterTicks: null, type: 'condition', hasControlPoint: false, order: 1, ...o,
});

export interface SmLayerSpec {
  id: string;
  parent: string | null;
  kind?: 'OR' | 'AND';
  states: string[];
  transitions?: string[];
  junctions?: string[];
}

export interface SmModelSpec {
  tickMs: number;
  states: StateData[];
  transitions?: TransitionData[];
  variables: VariableDef[];
  layers: SmLayerSpec[];
  junctions?: StateMachineModelV5['junctions'];
}

export const buildSmModel = (spec: SmModelSpec): StateMachineModelV5 => ({
  schemaVersion: CURRENT_SM_SCHEMA_VERSION,
  tickMs: spec.tickMs,
  states: spec.states,
  junctions: spec.junctions ?? [],
  transitions: spec.transitions ?? [],
  variables: spec.variables,
  layers: spec.layers.map((l) => ({
    id: l.id,
    name: l.id,
    parentStateId: l.parent,
    decomposition: l.kind ?? 'OR',
    stateIds: l.states,
    transitionIds: l.transitions ?? [],
    junctionIds: l.junctions ?? [],
  })),
  safetyMode: false,
  verification: defaultSMVerificationConfig(),
});

export const xbPort = (
  id: string,
  direction: 'input' | 'output',
  dataType = 'float32',
): Record<string, unknown> => ({ id, direction, shape: 'scalar', dimensions: [], dataType });

/** An X-Bridges node with scalar ports; `ins` and `outs` are port ids. */
export const xbNode = (
  id: string,
  type: string,
  parameters: Record<string, unknown>,
  ins: readonly string[],
  outs: readonly string[],
  dataType = 'float32',
): Record<string, unknown> => ({
  id,
  type,
  parameters: {
    ...parameters,
    inputs: ins.map((p) => xbPort(p, 'input', dataType)),
    outputs: outs.map((p) => xbPort(p, 'output', dataType)),
  },
});

export const xbEdge = (from: string, to: string, id = `${from}__${to}`): Record<string, unknown> => {
  const [sn, sp] = from.split('.');
  const [tn, tp] = to.split('.');
  return { id, sourceNodeId: sn, sourcePortId: sp, targetNodeId: tn, targetPortId: tp };
};

export const xbMap = (
  smVarId: string,
  target: string,
  direction: 'in' | 'out',
): Record<string, unknown> => {
  const [blockId, portId] = target.split('.');
  return { smVarId, blockId, portId, direction };
};

export interface XbOwnerSpec {
  nodes: Record<string, unknown>[];
  edges?: Record<string, unknown>[];
  mappings?: Record<string, unknown>[];
  solver?: { kind: 'euler' | 'rk4' | 'discrete'; stepSeconds: number };
  memory?: 'reset' | 'retain';
  numericFault?: 'signal-only' | 'escalate';
}

/** Turns an ordinary state into an X-Bridges owner (mutates and returns it). */
export const asXbOwner = (state: StateData, spec: XbOwnerSpec): StateData => {
  state.isXBridges = true;
  state.xBridgesModel = {
    schemaVersion: 1,
    nodes: spec.nodes,
    edges: spec.edges ?? [],
    mappings: spec.mappings ?? [],
    solver: spec.solver ?? { kind: 'euler', stepSeconds: 0.05 },
    policy: { memory: spec.memory ?? 'reset', numericFault: spec.numericFault ?? 'escalate' },
  } as unknown as StateData['xBridgesModel'];
  return state;
};

/* ---------------------------------------------------------------- three executions */

export const fixtureOf = (model: StateMachineModelV5, steps: readonly ScenarioStep[]): DifferentialFixture => ({
  name: 'flat-priority',
  model,
  steps,
});

export const runSimulator = (f: DifferentialFixture): SemanticTraceFrame[] => runInterpreterTrace(f);

export const runStandalone = (f: DifferentialFixture): SemanticTraceFrame[] => {
  const built = ADIAStateMachineRuntime.buildSemanticModel(f.model);
  const errors = built.diagnostics.filter((d) => d.severity === 'error');
  if (!built.ir || errors.length > 0) {
    throw new Error(`standalone build failed: ${errors.map((d) => `${d.code}: ${d.message}`).join('; ')}`);
  }
  const rt = ADIAStateMachineRuntime.createRuntime(built.ir);
  const frames: SemanticTraceFrame[] = [{ ...ADIAStateMachineRuntime.initializeRuntime(rt), actions: [] }];
  for (const op of f.steps) {
    if (op.kind === 'reset') {
      frames.push(ADIAStateMachineRuntime.resetRuntime(rt));
      continue;
    }
    if (op.kind === 'fault') throw new Error('fault steps are not part of the alignment corpus');
    ADIAStateMachineRuntime.applyInputs(rt, op.inputs ?? {});
    frames.push(ADIAStateMachineRuntime.stepRuntime(rt, op.elapsedMs ?? rt.ir.tickMs));
  }
  return frames;
};

export const runCompiledC = (f: DifferentialFixture): SemanticTraceFrame[] => compileAndRunCTrace(f);

export interface ThreeTraces {
  sim: SemanticTraceFrame[];
  standalone: SemanticTraceFrame[];
  c: SemanticTraceFrame[];
}

export const runThree = (f: DifferentialFixture): ThreeTraces => ({
  sim: runSimulator(f),
  standalone: runStandalone(f),
  c: runCompiledC(f),
});

/* ---------------------------------------------------------------- comparison */

const EXACT_VARIABLE_TYPES = new Set([
  'bool', 'int', 'uint', 'int8', 'uint8', 'int16', 'uint16', 'int32', 'uint32', 'int64', 'uint64',
]);

export interface CompareOptions {
  /** Variable id -> type; integer and boolean variables are compared exactly. */
  variableTypes?: Readonly<Record<string, string>>;
  /** Frame fields to skip (e.g. 'actions'). */
  skip?: readonly string[];
  ulp?: number;
}

const leafEqual = (a: unknown, b: unknown, exact: boolean, ulp: number): boolean => {
  if (typeof a === 'number' && typeof b === 'number') {
    if (Number.isNaN(a) && Number.isNaN(b)) return true;
    if (exact) return Object.is(a, b) || a === b;
    if (a === b) return true;
    return ulpDistance(a, b, 'float64') <= ulp;
  }
  return Object.is(a, b);
};

const walk = (
  a: unknown,
  b: unknown,
  path: string,
  exactOf: (path: string) => boolean,
  ulp: number,
  out: string[],
): void => {
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
      out.push(`${path}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`);
      return;
    }
    a.forEach((v, i) => walk(v, b[i], `${path}[${i}]`, exactOf, ulp, out));
    return;
  }
  if (a !== null && b !== null && typeof a === 'object' && typeof b === 'object') {
    const ka = Object.keys(a as object).sort();
    const kb = Object.keys(b as object).sort();
    if (ka.join('\u0000') !== kb.join('\u0000')) {
      out.push(`${path}: keys ${JSON.stringify(ka)} vs ${JSON.stringify(kb)}`);
      return;
    }
    for (const k of ka) {
      walk((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], `${path}.${k}`, exactOf, ulp, out);
    }
    return;
  }
  if (!leafEqual(a, b, exactOf(path), ulp)) out.push(`${path}: ${String(a)} vs ${String(b)}`);
};

/** Differences between two traces (empty array = equal). Each entry names the tick and the field. */
export const diffTraces = (
  left: readonly SemanticTraceFrame[],
  right: readonly SemanticTraceFrame[],
  options: CompareOptions = {},
): string[] => {
  const out: string[] = [];
  const ulp = options.ulp ?? 4;
  const skip = new Set(options.skip ?? []);
  if (left.length !== right.length) out.push(`frame count ${left.length} vs ${right.length}`);
  const exactOf = (path: string): boolean => {
    const m = /^data\.(.+)$/.exec(path);
    if (m) return EXACT_VARIABLE_TYPES.has(options.variableTypes?.[m[1]] ?? 'double');
    return !path.startsWith('xBridges') && !path.startsWith('mappedOutputs');
  };
  for (let i = 0; i < Math.min(left.length, right.length); i += 1) {
    const l = left[i];
    const r = right[i];
    const pick = (f: SemanticTraceFrame) => ({
      sequence: f.sequence,
      elapsedMs: f.elapsedMs,
      activeStateIds: [...f.activeStateIds].sort(),
      actions: f.actions,
      data: f.data,
      stateTimersMs: f.stateTimersMs,
      history: f.history,
      xBridges: f.xBridges,
      error: f.error,
    });
    const lp = pick(l) as Record<string, unknown>;
    const rp = pick(r) as Record<string, unknown>;
    for (const k of skip) { delete lp[k]; delete rp[k]; }
    const local: string[] = [];
    walk(lp, rp, 'frame', (p) => exactOf(p.replace(/^frame\./, '')), ulp, local);
    out.push(...local.map((d) => `tick ${i}: ${d}`));
  }
  return out;
};

export const variableTypesOf = (model: StateMachineModelV5): Record<string, string> =>
  Object.fromEntries(model.variables.map((v) => [v.id, v.type]));

/** First frame index (0 = after init) whose frame satisfies the predicate, or -1. */
export const firstFrame = (
  frames: readonly SemanticTraceFrame[],
  pred: (f: SemanticTraceFrame) => boolean,
): number => frames.findIndex(pred);

/** Frame index at which the given state first becomes active, or -1. */
export const firstActive = (frames: readonly SemanticTraceFrame[], stateId: string): number =>
  firstFrame(frames, (f) => f.activeStateIds.includes(stateId));

/* ---------------------------------------------------------------- size and RAM */

export interface CFootprint { coreCBytes: number; allCBytes: number; instanceBytes: number }

/** Bytes of sm_core.c, of all generated .c files, and sizeof(ADIA_Instance_t) from a compiled host print. */
export const measureGeneratedC = (model: StateMachineModelV5): CFootprint => {
  const fixture = fixtureOf(model, [{ kind: 'step' }]);
  const built = ADIAStateMachineRuntime.buildSemanticModel(fixture.model);
  if (!built.ir) throw new Error('measureGeneratedC: model does not build');
  const ir: SemanticModel = built.ir;
  const workspace = createGeneratedCodeTestWorkspace('xbv-footprint');
  try {
    const generated = generateCArtifacts(ir, { includeTestShims: true });
    let core = 0;
    let all = 0;
    for (const file of generated.files) {
      if (file.name.endsWith('.c') || file.name.endsWith('.h')) {
        writeFileSync(join(workspace.directory, file.name), file.content);
      }
      if (file.name.endsWith('.c')) all += Buffer.byteLength(file.content);
      if (file.name === 'sm_core.c') core = Buffer.byteLength(file.content);
    }
    const source = renderDifferentialHarness(ir, fixture.steps).replace(
      '(void)SM_Init(&instance);',
      'printf("SIZEOF=%zu\\n", sizeof(instance));\n    (void)SM_Init(&instance);',
    );
    const output = compileAndRunCProgram({ directory: workspace.directory, harnessSource: source, defines: ['SM_TRACE_ENABLED'] });
    const m = /SIZEOF=(\d+)/.exec(output ?? '');
    if (!m) throw new Error('measureGeneratedC: sizeof line missing');
    return { coreCBytes: core, allCBytes: all, instanceBytes: Number(m[1]) };
  } finally {
    workspace.cleanup();
  }
};
