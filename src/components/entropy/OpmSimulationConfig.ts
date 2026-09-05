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

export const OPM_SIMULATION_BOUNDS = Object.freeze({
  minTickMs: 1,
  maxTickMs: 60000,
  minMaxTicks: 1,
  maxMaxTicks: 1000000,
  minMaxEventsPerTick: 1,
  maxMaxEventsPerTick: 1024,
});

export type ParseOpmSimulationConfigResult =
  | { ok: true; config: OpmSimulationConfig }
  | { ok: false; diagnostics: string[] };

export function parseOpmSimulationConfig(
  input?: Partial<OpmSimulationConfig> | null,
): ParseOpmSimulationConfigResult {
  if (!input || typeof input !== 'object') {
    return {
      ok: false,
      diagnostics: ['Input configuration is missing or not an object.'],
    };
  }

  const diagnostics: string[] = [];

  const rawTickMs = input.tickMs !== undefined ? input.tickMs : DEFAULT_OPM_SIMULATION_CONFIG.tickMs;
  if (
    typeof rawTickMs !== 'number' ||
    !Number.isFinite(rawTickMs) ||
    !Number.isInteger(rawTickMs) ||
    rawTickMs < OPM_SIMULATION_BOUNDS.minTickMs ||
    rawTickMs > OPM_SIMULATION_BOUNDS.maxTickMs
  ) {
    diagnostics.push(
      `tickMs must be an integer between ${OPM_SIMULATION_BOUNDS.minTickMs} and ${OPM_SIMULATION_BOUNDS.maxTickMs} (received: ${rawTickMs}).`,
    );
  }

  const rawMaxTicks = input.maxTicks !== undefined ? input.maxTicks : DEFAULT_OPM_SIMULATION_CONFIG.maxTicks;
  if (
    typeof rawMaxTicks !== 'number' ||
    !Number.isFinite(rawMaxTicks) ||
    !Number.isInteger(rawMaxTicks) ||
    rawMaxTicks < OPM_SIMULATION_BOUNDS.minMaxTicks ||
    rawMaxTicks > OPM_SIMULATION_BOUNDS.maxMaxTicks
  ) {
    diagnostics.push(
      `maxTicks must be an integer between ${OPM_SIMULATION_BOUNDS.minMaxTicks} and ${OPM_SIMULATION_BOUNDS.maxMaxTicks} (received: ${rawMaxTicks}).`,
    );
  }

  const rawMaxEvents = input.maxEventsPerTick !== undefined ? input.maxEventsPerTick : DEFAULT_OPM_SIMULATION_CONFIG.maxEventsPerTick;
  if (
    typeof rawMaxEvents !== 'number' ||
    !Number.isFinite(rawMaxEvents) ||
    !Number.isInteger(rawMaxEvents) ||
    rawMaxEvents < OPM_SIMULATION_BOUNDS.minMaxEventsPerTick ||
    rawMaxEvents > OPM_SIMULATION_BOUNDS.maxMaxEventsPerTick
  ) {
    diagnostics.push(
      `maxEventsPerTick must be an integer between ${OPM_SIMULATION_BOUNDS.minMaxEventsPerTick} and ${OPM_SIMULATION_BOUNDS.maxMaxEventsPerTick} (received: ${rawMaxEvents}).`,
    );
  }

  if (
    input.deterministicOrder !== undefined &&
    input.deterministicOrder !== 'priority-then-source-order'
  ) {
    diagnostics.push(
      `deterministicOrder must be 'priority-then-source-order' (received: ${String(input.deterministicOrder)}).`,
    );
  }

  if (diagnostics.length > 0) {
    return { ok: false, diagnostics };
  }

  return {
    ok: true,
    config: {
      tickMs: rawTickMs,
      maxTicks: rawMaxTicks,
      maxEventsPerTick: rawMaxEvents,
      deterministicOrder: 'priority-then-source-order',
    },
  };
}

export function normalizeOpmSimulationConfig(
  input?: Partial<OpmSimulationConfig> | null,
): OpmSimulationConfig {
  const parsed = parseOpmSimulationConfig(input);
  if (parsed.ok) {
    return parsed.config;
  }
  return { ...DEFAULT_OPM_SIMULATION_CONFIG };
}
