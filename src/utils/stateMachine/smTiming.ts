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
