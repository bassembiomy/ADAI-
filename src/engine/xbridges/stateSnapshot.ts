/**
 * Deep snapshot of the block states of an engine, to restore the step-start state after a faulted step (XBV-403 / 404).
 * Blocks may mutate their state object in place (ROBOT_VACUUM_BATTERY), so a reference is not a snapshot.
 */
import type { XbridgesEngine } from './XbridgesEngine';

class BudgetExceeded extends Error {}

/**
 * Deep copy: arrays, typed arrays, Map, Set, Date and plain objects are copied; functions and other objects are kept by
 * reference. With a budget, more than `budget.n` copied elements throw BudgetExceeded.
 */
export function cloneState(value: unknown, seen: WeakMap<object, unknown> = new WeakMap(), budget?: { n: number }): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return seen.get(value);
  const spend = (n: number) => { if (budget && (budget.n -= n + 1) < 0) throw new BudgetExceeded(); };
  if (ArrayBuffer.isView(value)) {
    if (value instanceof DataView) return value;
    spend((value as unknown as { length: number }).length);
    const copy = (value as unknown as { slice: () => unknown }).slice();
    seen.set(value, copy);
    return copy;
  }
  if (Array.isArray(value)) {
    spend(value.length);
    const copy: unknown[] = [];
    seen.set(value, copy);
    for (let i = 0; i < value.length; i++) copy[i] = cloneState(value[i], seen, budget);
    return copy;
  }
  if (value instanceof Map) {
    spend(value.size);
    const copy = new Map<unknown, unknown>();
    seen.set(value, copy);
    value.forEach((v, k) => copy.set(k, cloneState(v, seen, budget)));
    return copy;
  }
  if (value instanceof Set) {
    spend(value.size);
    const copy = new Set<unknown>();
    seen.set(value, copy);
    value.forEach(v => copy.add(cloneState(v, seen, budget)));
    return copy;
  }
  if (value instanceof Date) return new Date(value.getTime());
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return value;
  const keys = Object.keys(value);
  spend(keys.length);
  const copy: Record<string, unknown> = Object.create(proto);
  seen.set(value, copy);
  for (const key of keys) copy[key] = cloneState((value as Record<string, unknown>)[key], seen, budget);
  return copy;
}

export type BlockStateSnapshot = Array<readonly [{ state?: unknown }, unknown]>;

/** Most elements copied per block and step: a state that grows with the run (Scope / Delay history) is kept by reference, which bounds the per-step cost. */
const MAX_ELEMENTS = 256;

function cloneBounded(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  try { return cloneState(value, new WeakMap(), { n: MAX_ELEMENTS }); } catch (e) { if (e instanceof BudgetExceeded) return value; throw e; }
}

export function snapshotBlockStates(engine: XbridgesEngine): BlockStateSnapshot {
  return engine.executionOrder.map(b => [b, cloneBounded(b.state)] as const);
}

export function restoreBlockStates(snapshot: BlockStateSnapshot): void {
  for (const [b, state] of snapshot) b.state = state;
}
