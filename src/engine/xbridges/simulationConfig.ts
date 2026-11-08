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
}

export function toSimulationSettings(config: XSimulationConfig, resolvedStep?: number): XSimulationSettings {
  return {
    solver: config.solver,
    startTime: config.startTime,
    stopTime: config.stopTime === Number.POSITIVE_INFINITY ? 'inf' : config.stopTime,
    fixedStep: config.fixedStep,
    ...(resolvedStep !== undefined && Number.isFinite(resolvedStep) ? { resolvedStep } : {}),
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
  return { solver: typeof r.solver === 'string' && r.solver ? r.solver : d.solver, startTime: start, stopTime: stop, fixedStep: step };
}

/** Embedded (state machine code generation) solver kind for a workspace solver; other solvers are returned unchanged. */
export function embeddedSolverKind(solver: string): string {
  if (solver === 'euler' || solver === 'ode1') return 'euler';
  if (solver === 'rk4' || solver === 'ode4') return 'rk4';
  return solver;
}
