/**
 * WP-07: signal-direction derivation for Physical (signal) ports (F-030), updated by WP-09a (F-026 / F-036).
 *
 * The library `direction` is the single source of truth: the assembler allocates a signal branch for a Physical port iff
 * the library says `out` (DAEAssembler.isPhysicalOutputPort; the old port-name vocabulary is gone). This module is now the
 * ratchet that keeps the library, the equations and the allocation consistent:
 *
 * Tier 1, from the equation (never from port position):
 *   - the block's equation reads the port as `across` and the assembler gives the port no signal branch  -> `in`
 *   - the equation never reads the port as `across` and the assembler allocates a signal branch for it    -> `out`
 * "Driven" is read from the real DAEAssembler: the port's Kirchhoff node carries one of the block's branches.
 *
 * Tier 2, block physics (documented below). The trace is silent or ambiguous for these ports:
 *   - read AND driven: the equation reads one of its own outputs back as `across` (a residual artefact), it is an output.
 *   - neither read nor driven: the equation does not implement the port (an unread input), or the block is a container
 *     (inport) with no branches at all.
 * Every tier-2 entry is checked against the live trace by connections.test.ts, so the table cannot go stale.
 */import { DAEAssembler } from '../DAEAssembler';
import { libraryDefaults } from './contractInventory';
import type { BlockContext } from './contractChecks';
import type { VLabBlock } from '../../../utils/vlabLibrary';

export type Direction = 'in' | 'out';
export type TraceVerdict = 'in' | 'out' | 'read+driven' | 'silent';

/** Ports of non-simulating utility blocks that are domain transparent: no direction (see vlabConnectionRules). */
export const NO_DIRECTION_PORTS: Record<string, string> = {
  'solver_config.a': 'Solver Configuration attaches to a node of any physical network; it is not a signal port.',
  'conn_label.a': 'Net label: names the net it is wired to, so it takes the direction of whatever it is wired to.',
};

/**
 * read as across AND given a signal branch: physics says the block reads it. Empty since WP-09a: the assembler no longer
 * gives an input a spurious branch (switch.v, gas_flow_source.m, clarke/park/sym_comp abc, ... are plain tier-1 inputs).
 */
export const CONFLICT_IS_INPUT: string[] = [];

/** read as across AND driven; physics says the block produces it (the readback is a residual artefact). */
export const CONFLICT_IS_OUTPUT = [
  'ma_selector.t', 'pmsm_tq_est.tq_est',
  // outputs the old name vocabulary called conserving (s, p): the equation still reads them back as across
  'hysteresis_ctrl_3ph.s',
];

/**
 * driven only because the NAME (y, m, x, a) was in the output vocabulary. Empty since WP-09a: these feedback / measurement
 * inputs are now undriven (see SILENT_IS_INPUT).
 */
export const DRIVEN_BY_NAME_BUT_INPUT: string[] = [];

/** read but not driven only because the NAME (s, p) was in the conserving vocabulary. Empty since WP-09a (see CONFLICT_IS_OUTPUT). */
export const READ_BUT_OUTPUT: string[] = [];

/** not read and not driven (equation does not implement it): decided from the block physics, input. */
export const SILENT_IS_INPUT = [
  'ps_smith_predictor.y', 'ps_sine_3phase.m', 'ps_state_feedback.x', 'ps_sliding_mode.y', 'quad_decoder.a',
  'im_curr_ctrl.vdq_ff', 'im_curr_ctrl.v_max', 'pmsm_curr_ctrl.vdq_ff', 'pmsm_curr_ctrl.v_max',
  'scope.in1', 'ps_switch.ctrl', 'ps_min.u2', 'ps_max.u2', 'bldc_commutation.dir',
  'bldc_current_ctrl.reset', 'bldc_current_ctrl.hall', 'bldc_current_ctrl.dir',
  'bldc_pwm_ctrl.is', 'bldc_pwm_ctrl.reset', 'bldc_pwm_ctrl.hall', 'bldc_pwm_ctrl.dir',
  'dcdc_ctrl.ff', 'dcdc_ctrl.reset', 'pfc_rectifier_ctrl.vabc_sens', 'pfc_rectifier_ctrl.iabc_sens',
  'cycloconverter_ctrl.f_ref', 'cycloconverter_ctrl.vabc', 'cycloconverter_ctrl.vcyc', 'cycloconverter_ctrl.icyc',
  'ps_pi_ctrl.reset', 'ps_pid_ctrl.reset', 'ps_integrator_gen.reset', 'ps_sine_3phase.ang', 'ps_state_feedback.reset',
  'dc_current_ctrl.v_max', 'dc_current_ctrl.reset', 'dc_voltage_ctrl.reset', 'velocity_ctrl.tq_sat', 'velocity_ctrl.reset',
  'im_foc_ctrl.imr_ref', 'im_foc_ctrl.iabc', 'im_foc_ctrl.wr', 'im_foc_ctrl.vdc', 'im_curr_ctrl.reset',
  'quad_decoder.b', 'quad_decoder.z', 'resolver_to_digital.vy', 'pmsm_curr_ctrl.reset',
  'pmsm_ref_gen.tq_ref', 'pmsm_ref_gen.vdc', 'pmsm_foc.vdc_s', 'pmsm_field_weakening.vdq', 'pmsm_field_weakening.v_max',
  'pmsm_tq_est.idq', 'pwm_3ph_2level.amp', 'pwm_3ph_2level.ma', 'pwm_3ph_2level.mb', 'pwm_3ph_2level.mc',
  'ps_terminator.u', 'outport.in',
];

/** not read and not driven (the block has no equation / no branch): decided from the block physics, output. */
export const SILENT_IS_OUTPUT = [
  'inport.out',
];

export const TIER2_DIRECTION: Record<string, Direction> = (() => {
  const m: Record<string, Direction> = {};
  for (const k of [...CONFLICT_IS_INPUT, ...DRIVEN_BY_NAME_BUT_INPUT, ...SILENT_IS_INPUT]) m[k] = 'in';
  for (const k of [...CONFLICT_IS_OUTPUT, ...READ_BUT_OUTPUT, ...SILENT_IS_OUTPUT]) m[k] = 'out';
  return m;
})();

/** Ports whose Kirchhoff node carries one of the block's own branches in a one-block real assembly. */
export function drivenPorts(b: VLabBlock): Set<string> {
  const out = new Set<string>();
  const e = console.error; const w = console.warn;
  console.error = () => {}; console.warn = () => {};
  try {
    const node: any = { id: 'dut', type: 'default', position: { x: 0, y: 0 }, data: { type: b.id, params: libraryDefaults(b), ports: b.ports } };
    const sys = new DAEAssembler().assemble([node], []);
    for (const p of b.ports) {
      const kn = sys.kirchhoffNodes.find(k => k.nodeId === `dut_${p.id}`);
      if (kn && kn.throughIndices.length > 0) out.add(p.id);
    }
  } catch { /* assembly failure leaves the set empty: every port then reports `silent` */ } finally {
    console.error = e; console.warn = w;
  }
  return out;
}

export interface PortTrace { block: string; port: string; verdict: TraceVerdict; read: boolean; driven: boolean }

/** Tier-1 evidence for every Physical port of the block. */
export function tracePortDirections(ctx: BlockContext): PortTrace[] {
  const b = ctx.block;
  const read = new Set<number>(ctx.trace ? [...ctx.trace.across, ...ctx.trace.dAcross] : []);
  const driven = drivenPorts(b);
  const out: PortTrace[] = [];
  b.ports.forEach((p, i) => {
    if ((p.domain ?? '').toLowerCase() !== 'physical') return;
    const r = read.has(i); const d = driven.has(p.id);
    const verdict: TraceVerdict = r && !d ? 'in' : !r && d ? 'out' : r && d ? 'read+driven' : 'silent';
    out.push({ block: b.id, port: p.id, verdict, read: r, driven: d });
  });
  return out;
}

/** Final direction for a Physical port: tier 1 when the trace is unambiguous and not name-vocabulary-contaminated, else tier 2. */
export function resolveDirection(t: PortTrace): Direction | undefined {
  const key = `${t.block}.${t.port}`;
  if (key in NO_DIRECTION_PORTS) return undefined;
  if (key in TIER2_DIRECTION) return TIER2_DIRECTION[key];
  if (t.verdict === 'in' || t.verdict === 'out') return t.verdict;
  return undefined; // unresolved: connections.test.ts fails until a tier-2 decision is recorded
}
