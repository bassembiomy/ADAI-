import { describe, it, expect, vi, afterEach } from 'vitest';
import type { Node, Edge } from '@xyflow/react';
import { VLabPhysicsEngine } from '../vlabPhysics';
import { VLAB_LIBRARY } from '../../../utils/vlabLibrary';
import { blockEquations, inputOrParam, type BlockEquationArgs } from '../vlabEquations';

/**
 * F-010: an unwired optional physical-signal input reads 0 (not undefined) in the assembler.
 * Every port-or-param equation must therefore fall back to its parameter when the port is not
 * connected, and use the port value when it is. These tests go through the real assembler
 * (VLabPhysicsEngine.simulateStep) and observe which input the DUT residual actually depends on.
 */

interface Case {
  block: string;
  port: string;
  /** parameter that replaces the port when unwired (null = constant fallback, no parameter) */
  param: string | null;
}

const CASES: Case[] = [
  { block: 'force_source', port: 's', param: 'F' },
  { block: 'torque_source', port: 's', param: 'T' },
  { block: 'ang_vel_source', port: 's', param: 'omega' },
  { block: 'gas_pressure_source', port: 'p', param: 'P' },
  { block: 'gas_flow_source', port: 'm', param: 'mdot' },
  { block: 'gas_reservoir', port: 's', param: 'P' },
  { block: 'gas_restriction', port: 'ar', param: 'area' },
  { block: 'steam_generator_fluid', port: 'q_in', param: 'Q' },
  { block: 'mag_controlled_mmf', port: 'src', param: 'MMF' },
  { block: 'lms_adaptive_filter', port: 'lr', param: 'lr' },
  { block: 'neural_neuron_learning', port: 'lr', param: 'lr' },
  { block: 'ac_motor_pid_control', port: 'w_ref', param: 'w_ref' },
  { block: 'ac_motor_pid_control', port: 'tl', param: 'tl' },
  { block: 'im_foc_ctrl', port: 'wr_ref', param: 'target_rpm' },
  { block: 'variable_resistor', port: 'r', param: null },
  { block: 'switch', port: 'v', param: null },
  { block: 'controlled_voltage', port: 's', param: null },
  { block: 'ctrl_heat_src', port: 's', param: null },
  { block: 'ctrl_temp_src', port: 's', param: null },
  { block: 'microwave_inverter', port: 'ctrl', param: null },
  { block: 'ma_pressure_source', port: 's', param: null },
  { block: 'variable_reluctance', port: 'ctrl', param: null },
  { block: 'ctrl_pressure_source', port: 'ctrl', param: null },
];

const findBlock = (id: string) => {
  for (const d of VLAB_LIBRARY) {
    const b = d.blocks.find(x => x.id === id);
    if (b) return b;
  }
  throw new Error(`block ${id} not in library`);
};

const defaultParams = (id: string) => {
  const out: Record<string, any> = {};
  Object.entries(findBlock(id).params || {}).forEach(([k, v]: [string, any]) => { out[k] = v.value; });
  return out;
};

/** Run the DUT through the real assembler and return the last args its equation factory received. */
const captureArgs = (c: Case, wired: boolean): BlockEquationArgs => {
  const original = blockEquations[c.block];
  let captured: BlockEquationArgs | null = null;
  const spy = vi.spyOn(blockEquations, c.block).mockImplementation((args: BlockEquationArgs) => {
    captured = args;
    return original(args);
  });
  try {
    const block = findBlock(c.block);
    const nodes: Node[] = [{
      id: 'dut', type: 'default', position: { x: 0, y: 0 },
      data: { type: c.block, params: defaultParams(c.block), ports: block.ports },
    } as any];
    const edges: Edge[] = [];
    if (wired) {
      nodes.push({ id: 'sig', type: 'default', position: { x: 0, y: 0 }, data: { type: 'ps_constant', params: { value: 5.0 } } } as any);
      edges.push({ id: 'e_sig', source: 'sig', target: 'dut', sourceHandle: 'y_s', targetHandle: `${c.port}_t` });
    }
    try {
      new VLabPhysicsEngine().simulateStep(nodes, edges, null, 0.01);
    } catch {
      // solver may reject an under-constrained single block; the captured args are what matter here
    }
  } finally {
    spy.mockRestore();
  }
  if (!captured) throw new Error(`${c.block}: equation factory never called through the assembler`);
  return captured;
};

/** Residuals with every input driven to a distinct non-zero value so each dependency is observable. */
const probe = (c: Case, args: BlockEquationArgs, mod: (a: BlockEquationArgs) => void): number[] => {
  const a: BlockEquationArgs = {
    ...args,
    across: args.across.map((_, i) => 1.3 + 0.7 * i),
    dAcross: args.dAcross.map(() => 0.2),
    branch: args.branch.map((_, i) => 0.4 + 0.1 * i),
    dBranch: args.dBranch.map(() => 0.1),
    state: args.state.map((_, i) => 0.3 + 0.05 * i),
    dState: args.dState.map(() => 0.1),
    params: { ...args.params },
    ctx: { ...args.ctx, parameters: { ...(args.ctx?.parameters || {}) } } as any,
  };
  mod(a);
  const res = blockEquations[c.block](a).map(Number);
  // im_foc_ctrl consumes the speed reference only through the shared grid frequency side effect
  if (c.block === 'im_foc_ctrl') res.push(Number(a.ctx.parameters['grid_freq']));
  return res;
};

const differs = (x: number[], y: number[]) => x.some((v, i) => Math.abs(v - y[i]) > 1e-12 * Math.max(1, Math.abs(v)));

const LOW = -10;
const HIGH = 5e6;

afterEach(() => vi.restoreAllMocks());

describe('inputOrParam helper', () => {
  it('locates the port by id, not by position', () => {
    const args = { across: [9, 8, 7], ports: ['s', 'a', 'b'], connectedPorts: ['s'] };
    expect(inputOrParam(args, 's', -1)).toBe(9);
    expect(inputOrParam({ ...args, connectedPorts: [] }, 's', -1)).toBe(-1);
  });
  it('falls back when the port id is absent, honours aliases, and trusts direct calls without connectedPorts', () => {
    expect(inputOrParam({ across: [1, 2], ports: ['a', 'b'] }, 'zzz', 42)).toBe(42);
    expect(inputOrParam({ across: [1, 2, 3], ports: ['a', 'b', 's_in'], connectedPorts: ['s_in'] }, ['src', 's_in'], 0)).toBe(3);
    expect(inputOrParam({ across: [1, 2, 6] } as any, 's', 0, 2)).toBe(6);
  });
});

describe('F-010 unwired optional inputs use their parameter (real assembler path)', () => {
  CASES.forEach(c => {
    describe(`${c.block}.${c.port}`, () => {
      const portIdx = findBlock(c.block).ports.findIndex(p => p.id === c.port);

      it('port exists', () => expect(portIdx).toBeGreaterThanOrEqual(0));

      it('(a) unwired: port not reported connected, residual ignores the port and follows the parameter', () => {
        const args = captureArgs(c, false);
        expect(args.connectedPorts).toBeDefined();
        expect(args.connectedPorts).not.toContain(c.port);
        // LOW/HIGH straddle every clamp and threshold in the library equations
        const portLow = probe(c, args, a => { a.across[portIdx] = LOW; });
        const portHigh = probe(c, args, a => { a.across[portIdx] = HIGH; });
        expect(differs(portLow, portHigh)).toBe(false);
        if (c.param) {
          const paramLow = probe(c, args, a => { a.params[c.param!] = LOW; });
          const paramHigh = probe(c, args, a => { a.params[c.param!] = HIGH; });
          expect(differs(paramLow, paramHigh)).toBe(true);
        }
      });

      it('(b) wired: port reported connected and the residual follows the port value', () => {
        const args = captureArgs(c, true);
        expect(args.connectedPorts).toContain(c.port);
        const portLow = probe(c, args, a => { a.across[portIdx] = LOW; });
        const portHigh = probe(c, args, a => { a.across[portIdx] = HIGH; });
        expect(differs(portLow, portHigh)).toBe(true);
      });
    });
  });
});
