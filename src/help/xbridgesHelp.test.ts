/**
 * Acceptance tests — X-Bridges help is complete and matches the current implementation.
 * Plan: docs/superpowers/plans/2026-11-08-xbridges-help-update.md
 */
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { HELP_DATA } from '../HelpData';
import { getBlockHelpReferences } from './blockReference';
import {
  XBRIDGES_EMBEDDED_DIAGNOSTIC_GUIDANCE,
  XBRIDGES_SIMULATION_DIAGNOSTIC_GUIDANCE,
} from './diagnosticGuidance';

const read = (path: string) => readFileSync(path, 'utf8');
const collect = (text: string, patterns: RegExp[]) => {
  const codes = new Set<string>();
  for (const pattern of patterns) for (const match of text.matchAll(pattern)) codes.add(match[1]);
  return codes;
};

const simulationCodes = (() => {
  const engine = ['XbridgesEngine', 'modelChecks', 'Solvers', 'simulationConfig', 'StiffSolver', 'AdaptiveSolver', 'parameterEvaluation']
    .map((name) => read(`src/engine/xbridges/${name}.ts`)).join('\n');
  const codes = collect(engine, [
    /code:\s*'([A-Z][A-Z0-9_]+)'/g,
    /\b(?:err|warn|info|reportError|StiffSolverError)\(\s*(?:\w+\s*,\s*)?'([A-Z][A-Z0-9_]+)'/g,
  ]);
  for (const code of collect(read('src/engine/xbridges/BlockDefinitions.ts'), [/diagnostic:\s*\{[^}]*?code:\s*'([A-Z][A-Z0-9_]+)'/g])) codes.add(code);
  return codes;
})();

const embeddedCodes = collect(
  ['xbSemanticValidator', 'xbSemanticBuilder', 'xbModelAdapter', 'xbShapeResolver', 'xbSubsystemFlattener', 'xbControlPortDefaults', 'stateSpaceValidation']
    .map((name) => `src/utils/stateMachine/${name}.ts`).filter(existsSync).map(read).join('\n'),
  [/'(XB_[A-Z0-9_]+)'/g],
);

describe('X-Bridges diagnostic guidance uses the real code vocabulary', () => {
  it('simulation: one entry per emitted code, no invented codes', () => {
    expect(simulationCodes.size).toBeGreaterThan(30);
    expect(Object.keys(XBRIDGES_SIMULATION_DIAGNOSTIC_GUIDANCE).sort()).toEqual([...simulationCodes].sort());
  });
  it('code generation: one entry per emitted code, no invented codes', () => {
    expect(embeddedCodes.size).toBeGreaterThan(30);
    expect(Object.keys(XBRIDGES_EMBEDDED_DIAGNOSTIC_GUIDANCE).sort()).toEqual([...embeddedCodes].sort());
  });
  it('every entry states its severity and a corrective action', () => {
    for (const [code, text] of [...Object.entries(XBRIDGES_SIMULATION_DIAGNOSTIC_GUIDANCE), ...Object.entries(XBRIDGES_EMBEDDED_DIAGNOSTIC_GUIDANCE)]) {
      expect(text, code).toMatch(/^(Error|Warning|Info): /);
      expect(text.length, code).toBeGreaterThan(60);
    }
  });
  it('states the severity the implementation uses', () => {
    const severity = (code: string) => (XBRIDGES_SIMULATION_DIAGNOSTIC_GUIDANCE[code] ?? XBRIDGES_EMBEDDED_DIAGNOSTIC_GUIDANCE[code]).split(':')[0];
    for (const code of ['UNCONNECTED_INPUT_PORT', 'UNCONNECTED_OUTPUT_PORT', 'RATE_TRANSITION_REQUIRED', 'ALGEBRAIC_LOOP', 'DIVIDE_BY_ZERO', 'MATH_DOMAIN_ERROR', 'NUMERICAL_INSTABILITY', 'DATA_TYPE_MISMATCH'])
      expect(severity(code), code).toBe('Warning');
    for (const code of ['LOGIC_NAN_INPUT', 'TF_IMPROPER', 'TF_DENOMINATOR_LEADING_ZERO', 'LIMITS_INVALID', 'CONTINUOUS_STATES_WITH_DISCRETE_SOLVER', 'STOP_TIME_BEFORE_START', 'STOP_TIME_INFINITE_BATCH', 'INVALID_SAMPLE_TIME', 'SAMPLE_TIME_NOT_MULTIPLE_OF_FIXED_STEP', 'BLOCK_RUNTIME_FAULT', 'XB_DISCRETE_SOLVER_CONTINUOUS_STATE', 'XB_PORT_DANGLING', 'XB_CONSTANT_VALUE_OUT_OF_RANGE'])
      expect(severity(code), code).toBe('Error');
  });
});

const topic = (id: string) => {
  const t = HELP_DATA[id];
  expect(t, id).toBeDefined();
  return t;
};
const sectionBody = (id: string, sectionId: string) => {
  const s = topic(id).sections?.find((x) => x.id === sectionId);
  expect(s, `${id}#${sectionId}`).toBeDefined();
  return s!.body;
};

describe('X-Bridges simulation chapter', () => {
  const id = 'xbridges-simulation';
  it('has the required sections with real source references', () => {
    const t = topic(id);
    expect(t.sections!.map((s) => s.id)).toEqual(expect.arrayContaining(['solvers', 'timing', 'discrete-solver', 'sample-times', 'saving', 'errors']));
    for (const s of t.sections!) {
      expect(s.body.length, s.id).toBeGreaterThan(80);
      expect(s.sources?.length, s.id).toBeGreaterThan(0);
      for (const src of s.sources!) expect(existsSync(src), src).toBe(true);
    }
  });
  it('describes every solver offered in the workspace', () => {
    const workspace = read('src/components/xbridges/XbridgesWorkspace.tsx');
    const body = sectionBody(id, 'solvers').toLowerCase();
    for (const value of ['rk4', 'euler', 'ode2', 'ode3', 'ode5', 'ode23', 'ode45', 'ode14x', 'ode23tb', 'discrete']) {
      expect(workspace).toContain(`<option value="${value}">`);
      expect(body, value).toContain(value);
    }
  });
  it('documents start time, stop time (inf, default 10) and fixed step (auto rules)', () => {
    const body = sectionBody(id, 'timing');
    for (const text of ['Start Time', 'Stop Time', 'Fixed Step', 'inf', 'auto', '10', '50', '0.2', 'greatest common divisor']) expect(body, text).toContain(text);
  });
  it('documents the discrete solver and s/z sample-time semantics', () => {
    expect(sectionBody(id, 'discrete-solver')).toMatch(/continuous state/i);
    const st = sectionBody(id, 'sample-times');
    for (const text of ['n·Ts', 'zero-order hold', 'Rate Transition']) expect(st, text).toContain(text);
  });
  it('documents what is saved and what reaches code generation', () => {
    const body = sectionBody(id, 'saving');
    for (const text of ['Euler', 'RK4', 'Discrete', 'Tick']) expect(body, text).toContain(text);
  });
  it('lists every simulation diagnostic', () => {
    const body = sectionBody(id, 'errors');
    for (const code of simulationCodes) expect(body, code).toContain(code);
  });
});

describe('X-Bridges code generation chapter', () => {
  const id = 'xbridges-code-generation';
  it('has the required sections', () => {
    expect(topic(id).sections!.map((s) => s.id)).toEqual(expect.arrayContaining(['solver-kinds', 'data-types', 'control-ports', 'discrete-integrator', 'errors']));
  });
  it('explains solver kinds, Constant data types, control-port defaults and integrator methods', () => {
    expect(sectionBody(id, 'solver-kinds')).toMatch(/Discrete/);
    expect(sectionBody(id, 'data-types')).toContain('Output data type');
    expect(sectionBody(id, 'control-ports')).toMatch(/Enable[\s\S]*Reset/);
    const integ = sectionBody(id, 'discrete-integrator');
    for (const text of ['forward', 'backward', 'Tustin']) expect(integ.toLowerCase(), text).toContain(text.toLowerCase());
  });
  it('lists every code-generation diagnostic', () => {
    const body = sectionBody(id, 'errors');
    for (const code of embeddedCodes) expect(body, code).toContain(code);
  });
  it('is linked from the X-Bridges reference', () => {
    expect(topic('xbridges-ref').related).toEqual(expect.arrayContaining(['xbridges-simulation', 'xbridges-code-generation']));
  });
});

describe('X-Bridges block help matches the implementation', () => {
  const refs = new Map(getBlockHelpReferences().filter((r) => r.source === 'X-Bridges').map((r) => [r.typeId, r]));
  const text = (typeId: string) => {
    const r = refs.get(typeId);
    expect(r, typeId).toBeDefined();
    return [r!.description, r!.behavior, r!.example, r!.equation ?? '', ...r!.parameters.map((p) => `${p.name}: ${p.description}`)].join('\n');
  };
  const facts: [string, (string | RegExp)[]][] = [
    ['Constant', ['output_type', 'XB_CONSTANT_VALUE_OUT_OF_RANGE']],
    ['PRODUCT', [/Inf/, 'DIVIDE_BY_ZERO']],
    ['VectorDiv', ['DIVIDE_BY_ZERO']],
    ['ASIN', ['MATH_DOMAIN_ERROR']],
    ['ACOS', ['MATH_DOMAIN_ERROR']],
    ['AND', ['LOGIC_NAN_INPUT']],
    ['COSEC', ['1/sin']],
    ['ACOSECH', ['asinh(1/u)']],
    ['RATE_LIMITER', [/per second/i]],
    ['RELAY', ['onValue', 'offValue']],
    ['SWITCH', ['>=']],
    ['DELAY', ['sampleTime']],
    ['INTEGRATOR_DISCRETE', ['sample_time', /backward/i, /tustin/i]],
    ['TRANSFER_FUNCTION', ['TF_IMPROPER']],
    ['SATURATION', ['LIMITS_INVALID']],
    ['STATE_SPACE', ['STATE_SPACE_DIMENSION_MISMATCH']],
    ['PID_BASIC', [/continuous/i, /mode/]],
  ];
  it.each(facts)('%s', (typeId, needles) => {
    const t = text(typeId);
    for (const needle of needles) expect(t, String(needle)).toMatch(needle instanceof RegExp ? needle : new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    expect(refs.get(typeId)!.documentationGaps).toEqual([]);
  });
});

describe('X-Bridges toolbar help matches the controls', () => {
  const workspace = read('src/components/xbridges/XbridgesWorkspace.tsx');
  const featureAfter = (label: string) => {
    const at = workspace.indexOf(`>${label}</span>`);
    expect(at, label).toBeGreaterThan(-1);
    const match = /data-help-feature="(ui:[^"]+)"/.exec(workspace.slice(at, at + 800));
    expect(match, `${label} has a help feature`).not.toBeNull();
    return HELP_DATA[match![1]];
  };
  it('Start Time, Stop Time and Fixed Step each open accurate help', () => {
    const start = featureAfter('Start Time');
    const stop = featureAfter('Stop Time');
    const step = featureAfter('Fixed Step');
    for (const t of [start, stop, step]) expect(t).toBeDefined();
    expect(start.content).toMatch(/start/i);
    expect(stop.content).toContain('inf');
    expect(stop.content).not.toMatch(/unlimited/i);
    expect(step.content).toContain('auto');
    expect(new Set([start, stop, step].map((t) => t.content)).size).toBe(3);
  });
  it('the solver selector help names the Discrete solver', () => {
    const solver = Object.values(HELP_DATA).find((t) => t.title === 'XbridgesWorkspace: SolverType' || /X-Bridges solver/i.test(t.title));
    expect(solver).toBeDefined();
    expect(solver!.content).toMatch(/Discrete/);
  });
});

describe('embedded code generation guide', () => {
  it('docs/XBRIDGES_EMBEDDED_CODEGEN.md covers the discrete solver, Constant types, control-port defaults and integrator methods', () => {
    const doc = read('docs/XBRIDGES_EMBEDDED_CODEGEN.md');
    for (const text of ['Discrete', 'output_type', 'Enable', 'Tustin']) expect(doc, text).toContain(text);
  });
});
