// Simulink-equivalent Bus Creator and Bus Selector (ADR-001).
// Must not import BlockDefinitions.ts (BlockDefinitions registers these factories).
import type { XBlock, XPort, XValue, XBusElement } from '../types';
import { isBus, makeBus, selectBusElement } from './busCore';

const port = (id: string, dir: 'input' | 'output', name: string = id, bus = false): XPort => ({
  id, name, type: 'auto', direction: dir, value: 0, position: dir === 'input' ? 'left' : 'right',
  ...(bus ? { unit: 'bus', dataType: 'Bus: BusObject' } : {})
});

const splitList = (s: unknown): string[] =>
  String(s ?? '').split(',').map(x => x.trim()).filter(x => x.length > 0);

function parseInputs(v: unknown): number {
  const n = typeof v === 'string' ? Number(v) : (v as number);
  return typeof n === 'number' && Number.isInteger(n) && n >= 1 ? n : NaN;
}

function creatorNames(p: Record<string, any>, n: number): string[] | string {
  const raw = p.SignalNames;
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return Array.from({ length: n }, (_, i) => `signal${i + 1}`);
  }
  const names = splitList(raw);
  if (names.length !== n) return `SignalNames has ${names.length} names but Inputs is ${n}`;
  if (new Set(names).size !== names.length) return 'SignalNames contains a duplicate name';
  return names;
}

function busCreator(id: string, params: any): XBlock {
  const p = params ?? {};
  const pr: Record<string, any> = { Inputs: p.Inputs ?? 2, SignalNames: p.SignalNames ?? '' };
  const nInit = parseInputs(pr.Inputs);
  const nPorts = Number.isNaN(nInit) ? 2 : nInit;
  return {
    id, type: 'BUS_CREATOR', params: pr,
    inputs: Array.from({ length: nPorts }, (_, i) => port(`in${i + 1}`, 'input')),
    outputs: [port('bus', 'output', 'bus', true)],
    icon: 'layers',
    equation: 'bus = { name_k : in_k }, k = 1..Inputs (element order = port order)',
    description: 'Bus Creator: combines input signals into one bus with named elements; a bus input becomes a nested sub-bus.',
    execute: (inputs, rp) => {
      const n = parseInputs(rp.Inputs);
      if (Number.isNaN(n)) return { outputs: [{}], error: 'Inputs must be an integer of at least 1' };
      const names = creatorNames(rp, n);
      if (typeof names === 'string') return { outputs: [{}], error: names };
      const vals: XBusElement[] = [];
      for (let i = 0; i < n; i++) vals.push((inputs[i] ?? 0) as XBusElement);
      try {
        return { outputs: [makeBus(names, vals)] };
      } catch (e: any) {
        return { outputs: [{}], error: String(e?.message ?? e) };
      }
    }
  };
}

function busSelector(id: string, params: any): XBlock {
  const p = params ?? {};
  const pr: Record<string, any> = {
    OutputSignals: p.OutputSignals ?? 'signal1,signal2',
    OutputAsBus: p.OutputAsBus ?? 'off'
  };
  const paths = splitList(pr.OutputSignals);
  const asBus = pr.OutputAsBus === 'on';
  return {
    id, type: 'BUS_SELECTOR', params: pr,
    inputs: [port('bus', 'input', 'bus', true)],
    outputs: asBus ? [port('bus', 'output', 'bus', true)] : paths.map((s, i) => port(`out${i + 1}`, 'output', s)),
    icon: 'layers',
    equation: 'out_k = bus.path_k (dot path into nested buses); OutputAsBus on: bus = { last(path_k) : bus.path_k }',
    description: 'Bus Selector: selects elements of an incoming bus by name or dot path, as separate outputs or as a new bus.',
    execute: (inputs, rp) => {
      const sel = splitList(rp.OutputSignals);
      const mode = rp.OutputAsBus ?? 'off';
      if (mode !== 'on' && mode !== 'off') return { outputs: sel.map(() => 0 as XValue), error: `Unknown OutputAsBus '${String(mode)}'` };
      const fail = (error: string) => ({ outputs: (mode === 'on' ? [{}] : sel.map(() => 0)) as XValue[], error });
      if (sel.length === 0) return fail('OutputSignals must name at least one signal');
      const bus = inputs[0];
      if (!isBus(bus)) return fail('Input must be a bus signal');
      const vals: XBusElement[] = [];
      for (const path of sel) {
        const v = selectBusElement(bus, path);
        if (v === undefined) return fail(`Signal '${path}' is not an element of the input bus`);
        vals.push(v);
      }
      if (mode === 'on') {
        const names = sel.map(s => s.slice(s.lastIndexOf('.') + 1));
        try {
          return { outputs: [makeBus(names, vals)] };
        } catch (e: any) {
          return fail(String(e?.message ?? e));
        }
      }
      return { outputs: vals as XValue[] };
    }
  };
}

export const BUS_FACTORIES: Record<string, (id: string, params?: any) => XBlock> = {
  BUS_CREATOR: busCreator,
  BUS_SELECTOR: busSelector
};

export const BUS_CATEGORY = {
  name: 'Buses',
  blocks: [
    { type: 'BUS_CREATOR', label: 'Bus Creator', icon: 'layers' },
    { type: 'BUS_SELECTOR', label: 'Bus Selector', icon: 'layers' }
  ]
};
