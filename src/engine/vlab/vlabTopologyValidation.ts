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
 *  - pwm_3ph_2level ma/mb/mc: consumed only when control_mode != sinusoidal_modulation; in the sinusoidal mode (used
 *    by the shipped pid_ac_motor / vfd labs) the block generates its own references and ignores them.
 */
export const SEMANTIC_OPTIONAL_INPUTS: ReadonlySet<string> = new Set([
  'external_force.in_fx', 'external_force.in_fy', 'external_force.in_fz',
  'external_force.in_tx', 'external_force.in_ty', 'external_force.in_tz',
  'pwm_3ph_2level.ma', 'pwm_3ph_2level.mb', 'pwm_3ph_2level.mc',
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
  const signal = (DERIVED_REQUIRED_SIGNAL_INPUTS[type] ?? []).filter(p => !SEMANTIC_OPTIONAL_INPUTS.has(`${type}.${p}`));
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

  return { valid: diagnostics.length === 0, diagnostics };
}

/** Throws TopologyValidationError (fail fast, before any assembly/solve) when the model is invalid. */
export function assertValidTopology(nodes: Node[], edges: Edge[]): void {
  const report = validateTopology(nodes, edges);
  if (!report.valid) throw new TopologyValidationError(report.diagnostics);
}
