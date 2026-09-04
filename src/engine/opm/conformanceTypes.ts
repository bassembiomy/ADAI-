/**
 * OPM conformance (differential parity) scenario types.
 *
 * A conformance scenario drives the canonical TypeScript runtime and the
 * compiled C runtime through the same deterministic step sequence so their
 * per-step snapshots can be compared field-for-field.
 */

import type { OpmStepSnapshot } from './executableTypes';
import type { ExecutableOpmModel } from './pipeline';

/** One deterministic driver step applied to both runtimes. */
export interface OpmScenarioStep {
  /** Simulated time advance for the step in milliseconds. */
  deltaMs: number;
  /**
   * Input injection applied before the step (attribute cIdentifier -> value).
   * Mirrors `ioInputs` sampling: once set, a value latches until reset.
   */
  inputValues?: Readonly<Record<string, boolean | number | string>>;
  /** Event ids dispatched (in order) immediately before the step. */
  dispatchEventIds?: readonly string[];
  /** When true, the runtime is reset to its initial state before the step. */
  resetBeforeStep?: boolean;
}

/** A named step sequence bound to one compiled executable model. */
export interface OpmConformanceScenario {
  name: string;
  model: ExecutableOpmModel;
  steps: readonly OpmScenarioStep[];
}

/** Snapshots produced by running a scenario on one runtime. */
export interface OpmConformanceResult {
  snapshots: readonly OpmStepSnapshot[];
  /** Raw captured stdout of the producing harness ('' for the TS runner). */
  stdout: string;
}

/** One field-level mismatch between expected and actual snapshots. */
export interface OpmSnapshotDiff {
  stepPosition: number;
  stepIndex: number;
  field: string;
  expected: string;
  actual: string;
}
