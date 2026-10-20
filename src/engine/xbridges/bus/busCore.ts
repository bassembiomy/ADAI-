// Pure helpers for bus signals (ADR-001): a bus is a plain, ordered object of named elements.
import type { XBus, XBusElement } from '../types';

export function isBus(v: unknown): v is XBus {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function makeBus(names: string[], values: XBusElement[]): XBus {
  if (names.length !== values.length) {
    throw new Error(`Bus element count mismatch: ${names.length} names for ${values.length} values`);
  }
  const bus: XBus = {};
  for (let i = 0; i < names.length; i++) {
    if (Object.prototype.hasOwnProperty.call(bus, names[i])) throw new Error(`Duplicate bus element name '${names[i]}'`);
    bus[names[i]] = values[i];
  }
  return bus;
}

export function selectBusElement(bus: XBus, path: string): XBusElement | undefined {
  let cur: unknown = bus;
  for (const seg of path.split('.')) {
    if (!isBus(cur) || !Object.prototype.hasOwnProperty.call(cur, seg)) return undefined;
    cur = cur[seg];
  }
  return cur as XBusElement;
}

export function flattenBus(bus: XBus): Record<string, XBusElement> {
  const out: Record<string, XBusElement> = {};
  const walk = (b: XBus, prefix: string) => {
    for (const [k, v] of Object.entries(b)) {
      const p = prefix ? `${prefix}.${k}` : k;
      if (isBus(v)) walk(v, p); else out[p] = v;
    }
  };
  walk(bus, '');
  return out;
}

export function busLeafPaths(bus: XBus): string[] {
  return Object.keys(flattenBus(bus));
}
