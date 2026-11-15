// src/engine/xbridges/simulationConfig.ts
// Simulink "Configuration Parameters > Solver": start time, stop time, solver type, fixed-step size.
// Plan: docs/superpowers/plans/2026-11-08-xbridges-discrete-solver-start-stop.md
import type { ModelDiagnostic, XBlock } from './types';
import { getBlockSampleTime, isPeriodicSampleTime } from './modelChecks';

export interface XSimulationConfig {
  solver: string;
  startTime: number;
  /** Infinity is allowed (live canvas runs until stopped; a batch run refuses it). */
  stopTime: number;
  /** A number, or 'auto' (fundamental sample time, else (stop - start) / 50). */
  fixedStep: number | 'auto';
  /** Variable-step (ode23, ode45, ode23tb) relative and absolute tolerance; Simulink defaults 1e-3 and 1e-6 (auto). */
  relTol?: number;
  absTol?: number;
  /** ode14x extrapolation order (Simulink default 4) and Newton iterations (default 1). */
  extrapolationOrder?: number;
  newtonIterations?: number;
}

/** Simulink Solver-pane defaults of the solver options (the live stepper applies the same values when unset). */
export const DEFAULT_SOLVER_OPTIONS = { relTol: 1e-3, absTol: 1e-6, extrapolationOrder: 4, newtonIterations: 1 } as const;

/** Parses a tolerance field: a finite number greater than 0, else null. */
export function parseToleranceInput(text: string): number | null {
  const v = parseTimeInput(text);
  return v !== null && Number.isFinite(v) && v > 0 ? v : null;
}

/** Parses an integer option field (extrapolation order, Newton iterations): an integer >= 1, else null. */
export function parseIterationInput(text: string): number | null {
  const s = (text ?? '').trim();
  if (!/^\+?\d+$/.test(s)) return null;
  const v = Number(s);
  return Number.isSafeInteger(v) && v >= 1 ? v : null;
}

/** The toolbar texts of the solver options (the canvas keeps them as text so that invalid input stays visible). */
export interface SolverOptionTexts { relative: string; absolute: string; extrapolationOrder: string; newtonIterations: string }
export type SolverOptionTextKey = keyof SolverOptionTexts;

export function solverOptionTextsFrom(config: XSimulationConfig | null): SolverOptionTexts {
  return {
    relative: String(config?.relTol ?? DEFAULT_SOLVER_OPTIONS.relTol),
    absolute: String(config?.absTol ?? DEFAULT_SOLVER_OPTIONS.absTol),
    extrapolationOrder: String(config?.extrapolationOrder ?? DEFAULT_SOLVER_OPTIONS.extrapolationOrder),
    newtonIterations: String(config?.newtonIterations ?? DEFAULT_SOLVER_OPTIONS.newtonIterations),
  };
}

/** Which option group a solver uses: RelTol/AbsTol (ode23, ode45, ode23tb), ode14x options, or none (fixed step). */
export function solverOptionGroup(solver: string): 'tolerances' | 'extrapolation' | null {
  if (solver === 'ode45' || solver === 'ode23' || solver === 'ode23tb') return 'tolerances';
  if (solver === 'ode14x') return 'extrapolation';
  return null;
}

/** The option fields whose text is invalid (as toolbar keys), for the solver in use. */
export function invalidSolverOptionTexts(solver: string, texts: SolverOptionTexts): SolverOptionTextKey[] {
  const group = solverOptionGroup(solver);
  const bad: SolverOptionTextKey[] = [];
  if (group === 'tolerances') {
    if (parseToleranceInput(texts.relative) === null) bad.push('relative');
    if (parseToleranceInput(texts.absolute) === null) bad.push('absolute');
  } else if (group === 'extrapolation') {
    if (parseIterationInput(texts.extrapolationOrder) === null) bad.push('extrapolationOrder');
    if (parseIterationInput(texts.newtonIterations) === null) bad.push('newtonIterations');
  }
  return bad;
}

const OPTION_MESSAGES: Record<SolverOptionTextKey, string> = {
  relative: 'Relative tolerance must be a finite number greater than 0',
  absolute: 'Absolute tolerance must be a finite number greater than 0',
  extrapolationOrder: 'Extrapolation order must be an integer >= 1',
  newtonIterations: 'Newton iterations must be an integer >= 1',
};

/** Error diagnostics for invalid option text of the solver in use (a run is refused, nothing is clamped). */
export function solverOptionDiagnostics(solver: string, texts: SolverOptionTexts): ModelDiagnostic[] {
  return invalidSolverOptionTexts(solver, texts).map((key) => ({
    severity: 'error' as const,
    code: 'STIFF_SOLVER_INVALID_OPTION',
    message: `${OPTION_MESSAGES[key]}; got "${texts[key]}".`,
  }));
}

/** Valid option texts as numbers, under the engine option names, for the solver in use (engine.options). */
export function solverOptionsForRun(solver: string, texts: SolverOptionTexts) {
  const group = solverOptionGroup(solver);
  if (group === 'tolerances') {
    const relTol = parseToleranceInput(texts.relative);
    const absTol = parseToleranceInput(texts.absolute);
    return { ...(relTol !== null ? { relTol } : {}), ...(absTol !== null ? { absTol } : {}) };
  }
  if (group === 'extrapolation') {
    const extrapolationOrder = parseIterationInput(texts.extrapolationOrder);
    const newtonIterations = parseIterationInput(texts.newtonIterations);
    return { ...(extrapolationOrder !== null ? { extrapolationOrder } : {}), ...(newtonIterations !== null ? { newtonIterations } : {}) };
  }
  return {};
}

/** Valid option texts as saved config fields (all four, whichever solver is selected). */
export function solverOptionsForSave(texts: SolverOptionTexts) {
  const relTol = parseToleranceInput(texts.relative);
  const absTol = parseToleranceInput(texts.absolute);
  const extrapolationOrder = parseIterationInput(texts.extrapolationOrder);
  const newtonIterations = parseIterationInput(texts.newtonIterations);
  return {
    ...(relTol !== null ? { relTol } : {}), ...(absTol !== null ? { absTol } : {}),
    ...(extrapolationOrder !== null ? { extrapolationOrder } : {}), ...(newtonIterations !== null ? { newtonIterations } : {}),
  };
}

export const DEFAULT_SIMULATION_CONFIG: XSimulationConfig = {
  solver: 'rk4',
  startTime: 0,
  stopTime: 10,
  fixedStep: 'auto',
};

/** Parses a time field: a finite number, 'inf' (any case, optional sign '+'), or null when not a number. */
export function parseTimeInput(text: string): number | null {
  const s = (text ?? '').trim();
  if (s === '') return null;
  if (/^\+?inf(inity)?$/i.test(s)) return Number.POSITIVE_INFINITY;
  if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(s)) return null;
  const v = Number(s);
  return Number.isFinite(v) ? v : null;
}

/** Parses the fixed-step field: 'auto' (any case) or a number. Returns null when invalid. */
export function parseFixedStepInput(text: string): number | 'auto' | null {
  const s = (text ?? '').trim();
  if (s.toLowerCase() === 'auto') return 'auto';
  const v = parseTimeInput(s);
  return v === null ? null : v;
}

const gcdInt = (a: number, b: number): number => {
  while (b) { [a, b] = [b, a % b]; }
  return a;
};

/** Greatest common divisor of positive decimal values (scaled rationals); null when none can be represented. */
export function gcdOfSampleTimes(values: number[]): number | null {
  const vs = values.filter((v) => Number.isFinite(v) && v > 0);
  if (vs.length === 0) return null;
  for (let k = 0; k <= 12; k++) {
    const scale = 10 ** k;
    const ints = vs.map((v) => v * scale);
    if (ints.every((x) => Math.abs(x - Math.round(x)) <= 1e-7 * Math.max(1, Math.abs(x)) && Math.round(x) <= Number.MAX_SAFE_INTEGER)) {
      const g = ints.map(Math.round).reduce((acc, x) => gcdInt(acc, x));
      if (g > 0) return g / scale;
    }
  }
  return Math.min(...vs);
}

export interface ResolvedSimulationConfig {
  startTime: number;
  stopTime: number;
  fixedStep: number;
  diagnostics: ModelDiagnostic[];
}

export function resolveSimulationConfig(config: XSimulationConfig, blocks: XBlock[]): ResolvedSimulationConfig {
  const diagnostics: ModelDiagnostic[] = [];
  const { startTime, stopTime } = config;

  if (!Number.isFinite(startTime)) {
    diagnostics.push({ severity: 'error', code: 'START_TIME_INVALID', message: 'Start time must be a finite number.' });
  }
  if (Number.isNaN(stopTime) || (Number.isFinite(startTime) && stopTime < startTime)) {
    diagnostics.push({
      severity: 'error', code: 'STOP_TIME_BEFORE_START',
      message: `Stop time (${stopTime}) must not be less than start time (${startTime}).`,
    });
  }

  let fixedStep: number;
  if (config.fixedStep === 'auto') {
    const g = gcdOfSampleTimes(blocks.map(getBlockSampleTime).filter(isPeriodicSampleTime));
    if (g !== null) fixedStep = g;
    else if (!Number.isFinite(stopTime) || !Number.isFinite(startTime)) fixedStep = 0.2;
    else {
      const span = stopTime - startTime;
      fixedStep = span > 0 ? span / 50 : 0.2;
    }
  } else {
    fixedStep = config.fixedStep;
    if (!Number.isFinite(fixedStep) || fixedStep <= 0) {
      diagnostics.push({
        severity: 'error', code: 'FIXED_STEP_INVALID',
        message: `Fixed-step size must be a finite number greater than 0 (or 'auto'); got ${String(config.fixedStep)}.`,
      });
    }
  }
  return { startTime, stopTime, fixedStep, diagnostics };
}

/** JSON-safe form of the simulation settings saved with a model (Infinity is stored as 'inf'). */
export interface XSimulationSettings {
  solver: string;
  startTime: number;
  stopTime: number | 'inf';
  fixedStep: number | 'auto';
  /** Fixed step actually used ('auto' resolved against the model's sample times). */
  resolvedStep?: number;
  relTol?: number;
  absTol?: number;
  extrapolationOrder?: number;
  newtonIterations?: number;
}

export function toSimulationSettings(config: XSimulationConfig, resolvedStep?: number): XSimulationSettings {
  return {
    solver: config.solver,
    startTime: config.startTime,
    stopTime: config.stopTime === Number.POSITIVE_INFINITY ? 'inf' : config.stopTime,
    fixedStep: config.fixedStep,
    ...(resolvedStep !== undefined && Number.isFinite(resolvedStep) ? { resolvedStep } : {}),
    ...(config.relTol !== undefined ? { relTol: config.relTol } : {}),
    ...(config.absTol !== undefined ? { absTol: config.absTol } : {}),
    ...(config.extrapolationOrder !== undefined ? { extrapolationOrder: config.extrapolationOrder } : {}),
    ...(config.newtonIterations !== undefined ? { newtonIterations: config.newtonIterations } : {}),
  };
}

/** Reads saved settings; fields that are missing or malformed fall back to the defaults. Returns null when absent. */
export function fromSimulationSettings(raw: unknown): XSimulationConfig | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const d = DEFAULT_SIMULATION_CONFIG;
  const start = typeof r.startTime === 'number' && Number.isFinite(r.startTime) ? r.startTime : d.startTime;
  const stop = r.stopTime === 'inf' ? Number.POSITIVE_INFINITY
    : typeof r.stopTime === 'number' && !Number.isNaN(r.stopTime) ? r.stopTime : d.stopTime;
  const step = r.fixedStep === 'auto' ? 'auto' as const
    : typeof r.fixedStep === 'number' && Number.isFinite(r.fixedStep) && r.fixedStep > 0 ? r.fixedStep : d.fixedStep;
  const posNum = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined);
  const posInt = (v: unknown) => (typeof v === 'number' && Number.isSafeInteger(v) && v >= 1 ? v : undefined);
  const relTol = posNum(r.relTol);
  const absTol = posNum(r.absTol);
  const extrapolationOrder = posInt(r.extrapolationOrder);
  const newtonIterations = posInt(r.newtonIterations);
  return {
    solver: typeof r.solver === 'string' && r.solver ? r.solver : d.solver, startTime: start, stopTime: stop, fixedStep: step,
    ...(relTol !== undefined ? { relTol } : {}),
    ...(absTol !== undefined ? { absTol } : {}),
    ...(extrapolationOrder !== undefined ? { extrapolationOrder } : {}),
    ...(newtonIterations !== undefined ? { newtonIterations } : {}),
  };
}

/** Embedded (state machine code generation) solver kind for a workspace solver; other solvers are returned unchanged. */
export function embeddedSolverKind(solver: string): string {
  if (solver === 'euler' || solver === 'ode1') return 'euler';
  if (solver === 'rk4' || solver === 'ode4') return 'rk4';
  return solver;
}
