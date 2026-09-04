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

export function normalizeOpmSimulationConfig(
  input?: Partial<OpmSimulationConfig> | null,
): OpmSimulationConfig {
  if (!input) {
    return { ...DEFAULT_OPM_SIMULATION_CONFIG };
  }

  let tickMs = DEFAULT_OPM_SIMULATION_CONFIG.tickMs;
  if (typeof input.tickMs === 'number' && Number.isFinite(input.tickMs) && input.tickMs > 0) {
    tickMs = Math.round(input.tickMs);
  }

  let maxTicks = DEFAULT_OPM_SIMULATION_CONFIG.maxTicks;
  if (typeof input.maxTicks === 'number' && Number.isFinite(input.maxTicks) && input.maxTicks > 0) {
    maxTicks = Math.round(input.maxTicks);
  }

  let maxEventsPerTick = DEFAULT_OPM_SIMULATION_CONFIG.maxEventsPerTick;
  if (typeof input.maxEventsPerTick === 'number' && Number.isFinite(input.maxEventsPerTick) && input.maxEventsPerTick > 0) {
    maxEventsPerTick = Math.round(input.maxEventsPerTick);
  }

  return {
    tickMs,
    maxTicks,
    maxEventsPerTick,
    deterministicOrder: 'priority-then-source-order',
  };
}
