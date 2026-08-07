export type LogicalTickResult =
  | { kind: 'accepted'; observedMs: number; logicalMs: number }
  | { kind: 'out-of-tolerance'; observedMs: number; logicalMs: number }
  | { kind: 'invalid'; observedMs: number; logicalMs: number };

export const timingToleranceMs = (tickMs: number): number =>
  Math.max(Math.floor(tickMs / 10), 1);

export const normalizeLogicalTick = (
  tickMs: number,
  observedMs: number,
): LogicalTickResult => {
  if (!Number.isInteger(tickMs) || tickMs <= 0) {
    throw new RangeError(`tickMs must be a positive integer; received ${tickMs}`);
  }
  if (!Number.isFinite(observedMs) || observedMs < 0) {
    return { kind: 'invalid', observedMs, logicalMs: tickMs };
  }
  return Math.abs(observedMs - tickMs) <= timingToleranceMs(tickMs)
    ? { kind: 'accepted', observedMs, logicalMs: tickMs }
    : { kind: 'out-of-tolerance', observedMs, logicalMs: tickMs };
};

export type TimeUnit = 'seconds' | 'milliseconds' | 'ticks';

export function convertTime(
  value: number,
  fromUnit: TimeUnit,
  toUnit: TimeUnit,
  baseTickMs: number
): number {
  if (fromUnit === toUnit) return value;
  const ms = fromUnit === 'seconds' ? value * 1000 : fromUnit === 'ticks' ? value * baseTickMs : value;
  if (toUnit === 'milliseconds') return ms;
  if (toUnit === 'seconds') return ms / 1000;
  if (toUnit === 'ticks') return ms / baseTickMs;
  throw new Error(`Unsupported unit conversion: ${fromUnit} to ${toUnit}`);
}

export function alignRuntimeThreshold(
  timeMs: number,
  baseTickMs: number,
  policy: 'ceil-to-tick' | 'exact' = 'ceil-to-tick'
): { requiredTicks: number; thresholdMs: number } {
  if (!Number.isFinite(timeMs) || timeMs < 0) {
    throw new Error(`Invalid time threshold: ${timeMs}`);
  }
  if (!Number.isFinite(baseTickMs) || baseTickMs <= 0) {
    throw new Error(`Invalid base tick: ${baseTickMs}`);
  }

  if (policy === 'ceil-to-tick') {
    const requiredTicks = Math.ceil(timeMs / baseTickMs);
    return {
      requiredTicks,
      thresholdMs: requiredTicks * baseTickMs,
    };
  }

  return {
    requiredTicks: Math.ceil(timeMs / baseTickMs),
    thresholdMs: timeMs,
  };
}

