/**
 * Pre-simulation topology validation (WP-07). Runs before VLabPhysicsEngine assembles or solves anything:
 *  1. re-runs the connection rules (vlabConnectionRules) on every edge of the loaded model, because a saved
 *     file may contain wires that today's editor would reject (wrong domain, two sources on one input, a scope on
 *     a conserving port, ...);
 *  2. reports REQUIRED ports that are left unconnected.
 *
 * Definition of "required" (derived by src/engine/vlab/review/requiredPorts.ts, ratcheted by connections.test.ts):
 *  - signal input: the block's equation consumes the port with no parameter fallback. `inputOrParam` ports
 *    (force_source.s, controlled_voltage.s, ...) are optional because the equation substitutes the parameter when the
 *    port is unwired; ports the equation never reads are optional because they cannot create a silent zero.
 *    Exempt by semantics (SEMANTIC_OPTIONAL_INPUTS): inputs whose unwired 0 is a documented, tested default.
 *  - conserving port: with every other conserving port tied to a reference, leaving this one open makes the block's
 *    residual Jacobian structurally singular (generic rank < n), e.g. an ideal current source (dc_current.p) or an open
 *    controlled-source terminal (vccs.p, cccs.p). Frame ports are never required: the assembler and ImplicitSolver
 *    deliberately accept open frame nodes (free rotation DOFs).
 *    Blocks that are already singular with every port tied cannot be judged per port (ILL_POSED_CONSERVING_BLOCKS);
 *    no conserving port is claimed required for them.
 *  3. (WP-08) checks every numeric parameter: it must be a finite number (or `{value, unit}` / numeric text) inside the
 *     physical bounds stored next to the parameter in vlabLibrary.ts (R > 0, damping >= 0, ratio != 0, ...). The
 *     diagnostics use codes 'invalid-parameter' / 'parameter-out-of-range' and carry `param` and `raw`.
 * An unconnected required port would otherwise be a silent 0 / an unsolvable or hanging solve.
 */
import type { Node, Edge } from '@xyflow/react';
import { DAEAssembler } from './DAEAssembler';
import { validateBlockParams } from './vlabParams';
import { UNSUPPORTED_BLOCKS, unsupportedBlockReason } from './vlabStructure';
import { DERIVED_REQUIRED_SIGNAL_INPUTS, DERIVED_REQUIRED_CONSERVING_PORTS } from './vlabRequiredPorts';
import {
  TRANSPARENT_BLOCKS, blockTypeOf, checkEdgeSet, libraryBlock, portIdFromHandle, resolvePort,
  type ConnectionDiagnostic, type EdgeSetDiagnostic, type RuleEdge, type RuleNode,
} from './vlabConnectionRules';

export type TopologyDiagnostic = EdgeSetDiagnostic;

/**
 * Inputs whose unwired 0 is the documented, tested "inactive" state rather than a silent wrong value:
 *  - external_force in_*: an unwired load component means no applied force/torque
 *    (vlab_multibody_forces.test.ts: "external_force applies no hidden force when inputs are unconnected").
 *  (pwm_3ph_2level vabc / ma / mb / mc / amp are no longer listed since WP-12b: the equation reads them through connectedPorts,
 *  an unwired reference is the documented zero-voltage state d = 0 and amp falls back to modulation_index, so none is a derived
 *  required input.)
 */
export const SEMANTIC_OPTIONAL_INPUTS: ReadonlySet<string> = new Set([
  'external_force.in_fx', 'external_force.in_fy', 'external_force.in_fz',
  'external_force.in_tx', 'external_force.in_ty', 'external_force.in_tz',
  // WP-20a: the external reset of the integrator is level-sensitive and inactive at 0: an unwired reset never fires (the derivation
  // sees it as required only because its random sample points sit above the 0.5 threshold, where u is not consumed)
  'ps_integrator_gen.reset',
]);

/**
 * Inputs that are required by semantics although the behavioural derivation cannot see the dependence (WP-11):
 *  - igbt.g: the gate is the control input of the switch. For Vce < Vce_sat the collector current is the leakage
 *    Vce/Roff whether the gate is on or off (Simscape ideal IGBT), so a perturbation of the gate at the derivation's sample
 *    points (Vce in 0.5..1.5 V) never changes the residual. An unwired gate would silently read 0 V (always off).
 *  WP-20a: inputs that a piecewise equation does not consume at the derivation's sample points (all inputs 0.5..1.5, i.e. every
 *  logic input high and every control above its threshold) but that the block needs:
 *  - ps_delay.u: the history of the input is read at t - delay, before any history exists the sample point sees only `initial`
 *  - ps_integrator_gen.u: not consumed while reset is high
 *  - ps_sr_flipflop.r: not consumed while S is high (set dominant); an unwired R would silently read 0 (never reset)
 *  - ps_switch.u2: not consumed while ctrl is above the threshold
 */
export const SEMANTIC_REQUIRED_INPUTS: ReadonlySet<string> = new Set([
  'igbt.g', 'ps_delay.u', 'ps_integrator_gen.u', 'ps_sr_flipflop.r', 'ps_switch.u2',
  // WP-20b: the derivation shifts every channel of a vector by the same amount (a pure zero-sequence change that Clarke removes),
  // and saturated outputs (the PWM modulation clamp, the carrier comparison) hide a dependence that is real
  'im_flux_observer.iabc', 'pmsm_foc.iabc_s', 'bldc_pwm_ctrl.is_ref', 'bldc_pwm_ctrl.is', 'bldc_pwm_ctrl.hall',
]);

export class TopologyValidationError extends Error {
  readonly diagnostics: TopologyDiagnostic[];
  constructor(diagnostics: TopologyDiagnostic[]) {
    super(formatTopologyMessage(diagnostics));
    this.name = 'TopologyValidationError';
    this.diagnostics = diagnostics;
  }
}

export function formatTopologyMessage(diagnostics: ConnectionDiagnostic[], max = 3): string {
  const head = `Invalid V-Lab topology: ${diagnostics.length} problem(s) found before simulation.`;
  const shown = diagnostics.slice(0, max).map(d => d.reason).join(' | ');
  const more = diagnostics.length > max ? ` (+${diagnostics.length - max} more)` : '';
  return `${head} ${shown}${more}`;
}

export interface TopologyReport {
  valid: boolean;
  diagnostics: TopologyDiagnostic[];
}

/** Required ports of a block type after the semantic exemptions. */
export function requiredPortsOf(type: string): { signal: string[]; conserving: string[] } {
  const derived = (DERIVED_REQUIRED_SIGNAL_INPUTS[type] ?? []).filter(p => !SEMANTIC_OPTIONAL_INPUTS.has(`${type}.${p}`));
  const signal = [...new Set([...derived, ...[...SEMANTIC_REQUIRED_INPUTS].filter(k => k.startsWith(`${type}.`)).map(k => k.slice(type.length + 1))])];
  const conserving = [...(DERIVED_REQUIRED_CONSERVING_PORTS[type] ?? [])];
  return { signal, conserving };
}

export function validateTopology(nodes: Node[], edges: Edge[]): TopologyReport {
  const { flatNodes, flatEdges } = new DAEAssembler().flattenSubsystems(nodes, edges);
  const ruleNodes = flatNodes as unknown as RuleNode[];
  const ruleEdges = flatEdges as unknown as RuleEdge[];
  const diagnostics: TopologyDiagnostic[] = checkEdgeSet(ruleNodes, ruleEdges);

  // ports touched by any edge
  const byId = new Map(ruleNodes.map(n => [n.id, n]));
  const connected = new Set<string>();
  for (const e of ruleEdges) {
    const sn = byId.get(e.source); const tn = byId.get(e.target);
    if (!sn || !tn) continue;
    const sp = portIdFromHandle(sn, e.sourceHandle); const tp = portIdFromHandle(tn, e.targetHandle);
    if (sp) connected.add(`${sn.id}\u0000${sp}`);
    if (tp) connected.add(`${tn.id}\u0000${tp}`);
  }

  for (const n of ruleNodes) {
    const type = blockTypeOf(n);
    if (!libraryBlock(type)) continue;
    // numeric parameters: finite numbers inside their physical bounds (WP-08); also for transparent config blocks
    for (const d of validateBlockParams(n.id, type, (n.data as any)?.params, (n.data as any)?.label)) {
      diagnostics.push({
        blockId: d.blockId, portId: '', expectedDomain: 'parameter', actualDomain: 'parameter',
        code: d.code, reason: d.reason, param: d.param, raw: d.raw,
      });
    }
    // (WP-09a) a block whose library promise the engine cannot represent is rejected with the missing specification
    // instead of simulating a placeholder equation.
    const unsupported = UNSUPPORTED_BLOCKS[type];
    if (unsupported) {
      diagnostics.push({
        blockId: n.id, portId: '', expectedDomain: 'supported', actualDomain: 'unsupported', code: 'unsupported-block',
        reason: unsupportedBlockReason(n.id, type, unsupported),
      });
    }
    if (TRANSPARENT_BLOCKS.has(type)) continue;
    const req = requiredPortsOf(type);
    const check = (portId: string, why: string) => {
      if (connected.has(`${n.id}\u0000${portId}`)) return;
      const r = resolvePort(n, `${n.id}-${portId}`);
      const domain = r.ok ? r.port.domain : 'unknown';
      const label = n.data?.label || type;
      diagnostics.push({
        blockId: n.id, portId, expectedDomain: domain, actualDomain: 'unconnected', code: 'unconnected-required-port',
        reason: `Required port "${portId}" of "${label}" (${type}) is not connected: ${why}.`,
      });
    };
    req.signal.forEach(p => check(p, 'its signal input is read with no parameter fallback, so an open input would silently read 0'));
    req.conserving.forEach(p => check(p, 'leaving this conserving port open makes the block structurally singular'));
  }

  diagnostics.push(...seriesAcrossSensorDiagnostics(ruleNodes, ruleEdges));
  return { valid: diagnostics.length === 0, diagnostics };
}

/**
 * WP-15: ideal ACROSS sensors measure the difference between two nodes and carry (almost) no through variable, so they belong
 * in parallel with the element they measure (like a voltmeter). Wired in series they silently cut the path (zero flux, zero heat
 * flow, 100 Mohm). A sensor is in series when both its measuring ports sit on a plain wire to ONE other block port each (two
 * different blocks) and neither wire touches a reference: nothing else is attached to those nodes, so the sensor is the only
 * path between the two blocks. Only the MMF sensor is checked: the voltage / temperature sensors are legitimately wired between two\n * sources in the fixtures and a structural check cannot tell that from a series cut (they carry 1e8 ohm / zero heat flow, not a hard open). Reference nets (ground, thermal_ref, mag_ref) and open ports are never flagged.
 */
const ACROSS_SENSORS: Readonly<Record<string, { ports: [string, string]; name: string; series: string }>> = {
  mag_mmf_sensor: { ports: ['n', 's'], name: 'MMF Sensor', series: 'Use the Flux Sensor in series.' },
};
const REFERENCE_TYPES: ReadonlySet<string> = new Set(['ground', 'delta_ref', 'thermal_ref', 'mag_ref']);

function seriesAcrossSensorDiagnostics(nodes: RuleNode[], edges: RuleEdge[]): TopologyDiagnostic[] {
  if (!nodes.some(n => ACROSS_SENSORS[blockTypeOf(n)])) return [];
  const byId = new Map(nodes.map(n => [n.id, n]));
  const parent = new Map<string, string>();
  const find = (a: string): string => {
    if (!parent.has(a)) parent.set(a, a);
    let r = a;
    while (parent.get(r) !== r) r = parent.get(r)!;
    return r;
  };
  const key = (id: string, port: string) => `${id}\u0000${port}`;
  for (const e of edges) {
    const sn = byId.get(e.source); const tn = byId.get(e.target);
    if (!sn || !tn) continue;
    const sp = portIdFromHandle(sn, e.sourceHandle); const tp = portIdFromHandle(tn, e.targetHandle);
    if (sp && tp) parent.set(find(key(sn.id, sp)), find(key(tn.id, tp)));
  }
  const members = new Map<string, string[]>();
  for (const k of [...parent.keys()]) { const r = find(k); (members.get(r) ?? members.set(r, []).get(r)!).push(k); }
  const out: TopologyDiagnostic[] = [];
  for (const n of nodes) {
    const spec = ACROSS_SENSORS[blockTypeOf(n)];
    if (!spec) continue;
    const others = spec.ports.map(p => {
      const net = members.get(find(key(n.id, p))) ?? [];
      const rest = net.filter(k => k !== key(n.id, p));
      const reference = rest.some(k => REFERENCE_TYPES.has(blockTypeOf(byId.get(k.split('\u0000')[0])!)));
      return !reference && rest.length === 1 ? rest[0].split('\u0000')[0] : undefined;
    });
    if (others[0] && others[1] && others[0] !== others[1] && others[0] !== n.id && others[1] !== n.id) {
      out.push({
        blockId: n.id, portId: '', expectedDomain: 'parallel', actualDomain: 'series', code: 'sensor-in-series',
        reason: `${spec.name} "${n.id}" is wired in series between "${others[0]}" and "${others[1]}": it measures across two nodes and carries no ` +
          `through variable, so it cuts the path. Connect it in parallel with the element to measure. ${spec.series}`,
      });
    }
  }
  return out;
}

/** Throws TopologyValidationError (fail fast, before any assembly/solve) when the model is invalid. */
export function assertValidTopology(nodes: Node[], edges: Edge[]): void {
  const report = validateTopology(nodes, edges);
  if (!report.valid) throw new TopologyValidationError(report.diagnostics);
}
