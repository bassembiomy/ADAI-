/**
 * OPM Simulation Configuration contract.
 * Owned by OPM and isolated from the global State Machine tick.
 */

export interface OpmSimulationConfig {
  tickMs: number;
  maxTicks: number;
  maxEventsPerTick: number;
  deterministicOrder: 'priority-then-source-order';
}

export const DEFAULT_OPM_SIMULATION_CONFIG: Readonly<OpmSimulationConfig> = Object.freeze({
  tickMs: 10,
  maxTicks: 1000,
  maxEventsPerTick: 16,
  deterministicOrder: 'priority-then-source-order',
});

const LIMITS = {
  tickMs: { min: 1, max: 60_000 },
  maxTicks: { min: 1, max: 1_000_000 },
  maxEventsPerTick: { min: 1, max: 1_024 },
} as const;

export function normalizeOpmSimulationConfig(
  input?: Partial<OpmSimulationConfig> | null,
): OpmSimulationConfig {
  if (!input) {
    return { ...DEFAULT_OPM_SIMULATION_CONFIG };
  }

  const readPositiveInteger = (key: 'tickMs' | 'maxTicks' | 'maxEventsPerTick') => {
    const value = input[key];
    if (value === undefined) return DEFAULT_OPM_SIMULATION_CONFIG[key];
    const limits = LIMITS[key];
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < limits.min || value > limits.max) {
      throw new Error(`Invalid OPM simulation ${key}: expected an integer from ${limits.min} to ${limits.max}.`);
    }
    return value;
  };

  const tickMs = readPositiveInteger('tickMs');
  const maxTicks = readPositiveInteger('maxTicks');
  const maxEventsPerTick = readPositiveInteger('maxEventsPerTick');

  return {
    tickMs,
    maxTicks,
    maxEventsPerTick,
    deterministicOrder: 'priority-then-source-order',
  };
}
