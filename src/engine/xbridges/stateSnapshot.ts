/**
 * Deep snapshot of the block states of an engine, to restore the step-start state after a faulted step (XBV-403 / 404).
 * States are replaced and never mutated, so the snapshot is a reference.
 */
import type { XbridgesEngine } from './XbridgesEngine';

/**
 * Deep copy: arrays, typed arrays, Map, Set, Date and plain objects are copied; functions and other objects are kept by
 * reference.
 */
export function cloneState(value: unknown, seen: WeakMap<object, unknown> = new WeakMap()): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return seen.get(value);
  if (ArrayBuffer.isView(value)) {
    if (value instanceof DataView) return value;
    const copy = (value as unknown as { slice: () => unknown }).slice();
    seen.set(value, copy);
    return copy;
  }
  if (Array.isArray(value)) {
    const copy: unknown[] = [];
    seen.set(value, copy);
    for (let i = 0; i < value.length; i++) copy[i] = cloneState(value[i], seen);
    return copy;
  }
  if (value instanceof Map) {
    const copy = new Map<unknown, unknown>();
    seen.set(value, copy);
    value.forEach((v, k) => copy.set(k, cloneState(v, seen)));
    return copy;
  }
  if (value instanceof Set) {
    const copy = new Set<unknown>();
    seen.set(value, copy);
    value.forEach(v => copy.add(cloneState(v, seen)));
    return copy;
  }
  if (value instanceof Date) return new Date(value.getTime());
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return value;
  const keys = Object.keys(value);
  const copy: Record<string, unknown> = Object.create(proto);
  seen.set(value, copy);
  for (const key of keys) copy[key] = cloneState((value as Record<string, unknown>)[key], seen);
  return copy;
}

export type BlockStateSnapshot = Array<readonly [{ state?: unknown }, unknown]>;

/**
 * Snapshot of the block states at the step start. A block never writes its committed state (execute / derivatives /
 * updateDiscrete return a new state, verified for every library block by the frozen-state contract test XBV-413), so the
 * reference is exact and costs nothing, however large a Scope / Delay history grows.
 */
export function snapshotBlockStates(engine: XbridgesEngine): BlockStateSnapshot {
  return engine.executionOrder.map(b => [b, b.state] as const);
}

export function restoreBlockStates(snapshot: BlockStateSnapshot): void {
  for (const [b, state] of snapshot) b.state = state;
}
