// WP-04 acceptance tests (Powertrain plan §2.R, ADR-001): bus signals, Bus Creator, Bus Selector, Scope.
import { describe, it, expect } from 'vitest';
import { BLOCK_LIBRARY, XBRIDGES_CATEGORIES as CANVAS_CATEGORIES } from '../BlockDefinitions';
import { XBRIDGES_CATEGORIES as HELP_CATEGORIES } from '../../../utils/xbridges/XbridgesLibrary';
import { getXBBlockCapability } from '../../../utils/stateMachine/xbCapabilities';
import { XbridgesEngine } from '../XbridgesEngine';
import { Solvers } from '../Solvers';
import { isBus, makeBus, selectBusElement, flattenBus, busLeafPaths } from './busCore';

const run = (type: string, params: any, ins: any[]) => {
  const b = BLOCK_LIBRARY[type]('t', params);
  return { block: b, res: b.execute(ins, b.params, b.state, 0) };
};

describe('busCore', () => {
  const info = makeBus(['EngTrq', 'Fuel', 'Pwr'], [120, { Mass: 0.002, Vol: 2.7e-6 }, { Eng: 3.1e4, Loss: [1, 2] }]);

  it('makeBus keeps Simulink element order and nesting', () => {
    expect(Object.keys(info)).toEqual(['EngTrq', 'Fuel', 'Pwr']);
    expect(isBus(info)).toBe(true);
    expect(isBus([1, 2])).toBe(false);
    expect(isBus(3)).toBe(false);
    expect(isBus(null)).toBe(false);
    expect(() => makeBus(['a', 'a'], [1, 2])).toThrow(/duplicate/i);
    expect(() => makeBus(['a'], [1, 2])).toThrow(/count/i);
  });

  it('selectBusElement reads dot paths and returns undefined for a missing path', () => {
    expect(selectBusElement(info, 'EngTrq')).toBe(120);
    expect(selectBusElement(info, 'Fuel.Mass')).toBe(0.002);
    expect(selectBusElement(info, 'Pwr')).toEqual({ Eng: 3.1e4, Loss: [1, 2] });
    expect(selectBusElement(info, 'Pwr.Loss')).toEqual([1, 2]);
    expect(selectBusElement(info, 'Fuel.Nope')).toBeUndefined();
    expect(selectBusElement(info, 'EngTrq.x')).toBeUndefined();
  });

  it('flattenBus and busLeafPaths walk leaves depth-first in order', () => {
    expect(busLeafPaths(info)).toEqual(['EngTrq', 'Fuel.Mass', 'Fuel.Vol', 'Pwr.Eng', 'Pwr.Loss']);
    expect(flattenBus(info)).toEqual({ 'EngTrq': 120, 'Fuel.Mass': 0.002, 'Fuel.Vol': 2.7e-6, 'Pwr.Eng': 3.1e4, 'Pwr.Loss': [1, 2] });
  });
});

describe('BUS_CREATOR / BUS_SELECTOR', () => {
  it('BUS_CREATOR: Simulink defaults (2 inputs, signal1/signal2), ports in1..inN -> bus', () => {
    const b = BLOCK_LIBRARY.BUS_CREATOR('bc', {});
    expect(b.params.Inputs).toBe(2);
    expect(b.inputs.map(p => p.id)).toEqual(['in1', 'in2']);
    expect(b.outputs.map(p => p.id)).toEqual(['bus']);
    expect(b.outputs[0].unit).toBe('bus');
    const out = b.execute([1, [2, 3]], b.params, b.state, 0).outputs[0];
    expect(out).toEqual({ signal1: 1, signal2: [2, 3] });
    expect(Object.keys(out as any)).toEqual(['signal1', 'signal2']);
  });

  it('BUS_CREATOR: named elements, nesting a bus input as a sub-bus', () => {
    const { block, res } = run('BUS_CREATOR', { Inputs: 3, SignalNames: 'Trq, Spd, Pwr' }, [10, 20, { a: 1 }]);
    expect(block.inputs.map(p => p.id)).toEqual(['in1', 'in2', 'in3']);
    expect(res.outputs[0]).toEqual({ Trq: 10, Spd: 20, Pwr: { a: 1 } });
    expect(run('BUS_CREATOR', { Inputs: 2, SignalNames: 'a,a' }, [1, 2]).res.error).toMatch(/duplicate/i);
    expect(run('BUS_CREATOR', { Inputs: 3, SignalNames: 'a,b' }, [1, 2, 3]).res.error).toMatch(/3/);
  });

  it('BUS_SELECTOR: one output per selected path, in OutputSignals order', () => {
    const bus = { Trq: 10, Fuel: { Mass: 0.5, Vol: 0.1 } };
    const { block, res } = run('BUS_SELECTOR', { OutputSignals: 'Fuel.Vol,Trq' }, [bus]);
    expect(block.inputs.map(p => p.id)).toEqual(['bus']);
    expect(block.outputs.map(p => p.id)).toEqual(['out1', 'out2']);
    expect(block.outputs.map(p => p.name)).toEqual(['Fuel.Vol', 'Trq']);
    expect(res.outputs).toEqual([0.1, 10]);
    const asBus = run('BUS_SELECTOR', { OutputSignals: 'Fuel.Vol,Trq', OutputAsBus: 'on' }, [bus]);
    expect(asBus.block.outputs.map(p => p.id)).toEqual(['bus']);
    expect(asBus.res.outputs[0]).toEqual({ Vol: 0.1, Trq: 10 });
  });

  it('BUS_SELECTOR: a missing path or a non-bus input is a block error naming it', () => {
    const missing = run('BUS_SELECTOR', { OutputSignals: 'Trq,Nope.x' }, [{ Trq: 1 }]).res;
    expect(missing.error).toMatch(/Nope\.x/);
    for (const v of missing.outputs) expect(Number.isNaN(v as number)).toBe(false);
    expect(run('BUS_SELECTOR', { OutputSignals: 'Trq' }, [5]).res.error).toMatch(/bus/i);
  });
});

describe('buses in the engine and the Scope', () => {
  it('Constant x2 -> BUS_CREATOR -> BUS_SELECTOR round-trips through the engine', () => {
    const blocks = [
      BLOCK_LIBRARY.Constant('c1', { value: 3 }),
      BLOCK_LIBRARY.Constant('c2', { value: '[4 5]' }),
      BLOCK_LIBRARY.BUS_CREATOR('bc', { Inputs: 2, SignalNames: 'a,b' }),
      BLOCK_LIBRARY.BUS_SELECTOR('bs', { OutputSignals: 'b,a' })
    ];
    const c = (s: string, sp: string, t: string, tp: string) => ({ sourceBlock: s, sourcePort: sp, targetBlock: t, targetPort: tp });
    const engine = new XbridgesEngine({ blocks, connections: [c('c1', 'out', 'bc', 'in1'), c('c2', 'out', 'bc', 'in2'), c('bc', 'bus', 'bs', 'bus')] } as any);
    Solvers.runFixedStep(engine, { solver: 'ode4', startTime: 0, stopTime: 0.02, fixedStep: 0.01 } as any);
    expect(engine.getSignalValue('bs', 'out1')).toEqual([4, 5]);
    expect(engine.getSignalValue('bs', 'out2')).toBe(3);
    expect(engine.getSignalValue('bc', 'bus')).toEqual({ a: 3, b: [4, 5] });
    expect(engine.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
  });

  it('Scope records every bus leaf as y<i>.<path> and keeps y<i> as the first leaf', () => {
    const scope = BLOCK_LIBRARY.Scope('sc', { numSignals: 2 });
    const r = scope.execute([{ Trq: 7, Pwr: { Eng: 9 } }, 2], scope.params, scope.state, 0.1);
    const sample = (r.nextState as any).history[0];
    expect(sample.t).toBe(0.1);
    expect(sample['y1']).toBe(7);
    expect(sample['y1.Trq']).toBe(7);
    expect(sample['y1.Pwr.Eng']).toBe(9);
    expect(sample['y2']).toBe(2);
  });
});

describe('bus blocks registration', () => {
  it('are listed in a "Buses" category in both palettes, host-only for embedded C, with complete help', async () => {
    for (const cats of [CANVAS_CATEGORIES, HELP_CATEGORIES]) {
      expect(cats.find(c => c.name === 'Buses')?.blocks.map(b => b.type)).toEqual(['BUS_CREATOR', 'BUS_SELECTOR']);
    }
    for (const t of ['BUS_CREATOR', 'BUS_SELECTOR']) expect(getXBBlockCapability(t)?.codegen).toBe(false);
    const { getBlockHelpReferences } = await import('../../../help/blockReference');
    for (const t of ['BUS_CREATOR', 'BUS_SELECTOR']) {
      expect(getBlockHelpReferences().find(r => r.id === `xbridges:${t}`)?.documentationGaps).toEqual([]);
    }
  });
});
