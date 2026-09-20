/**
 * src/services/ai/planner/graphSynthesizer.ts
 *
 * Catalog-driven graph synthesis. Every block, port, and parameter in a
 * produced plan comes from the installed X-Bridges capability index —
 * never from model-name keywords or hardcoded archetypes. Knowledge patterns
 * act as advisory topology evidence only; the catalog and port semantics are
 * authoritative.
 *
 * Deterministic: identical normalized request + snapshot hash + catalog hash
 * + knowledge hash + planner version always produce the same plan hash.
 */
import {
  EngineeringModelPlanV2,
  LogicalBlock,
  LogicalConnection,
  StructuredDiagnostic,
  XbridgesAction,
} from '../contracts/engineeringModel';
import { XbridgesCapabilityIndex, XbridgesBlockCapability } from '../catalog/xbridgesCapabilityIndex';
import { ModelSnapshot } from '../adapters/liveXbridgesModelAdapter';
import { GeneralEngineeringRequest, RequirementValue } from './generalIntent';
import { canonicalJson, sha256Hex } from '../../../engine/opm/canonicalHash';

export const GRAPH_SYNTHESIZER_VERSION = '2.0.0';

export interface SynthesizedBlock {
  id: string;
  type: string;
  params: Record<string, unknown>;
  position: { x: number; y: number };
}

export interface SynthesizedConnection {
  fromBlockId: string;
  fromPortId: string;
  toBlockId: string;
  toPortId: string;
}

export interface SynthesisTopology {
  blocks: SynthesizedBlock[];
  connections: SynthesizedConnection[];
  provenanceId: string;
}

export interface SynthesizeInput {
  request: GeneralEngineeringRequest;
  snapshot: ModelSnapshot;
  catalog: XbridgesCapabilityIndex;
  patterns: ReadonlyArray<{ id: string; name: string; topology?: unknown }>;
  knowledgeHash?: string;
}

export interface SynthesisOutcome {
  status: 'planned' | 'refused';
  topology?: SynthesisTopology;
  diagnostics: StructuredDiagnostic[];
}

const STOPWORDS = new Set([
  'the', 'a', 'an', 'into', 'onto', 'from', 'with', 'and', 'that', 'this', 'for', 'of', 'in', 'to', 'at', 'on', 'is', 'be',
  'create', 'build', 'make', 'add', 'connect', 'model', 'source', 'chain', 'block', 'blocks', 'output', 'input', 'observe',
]);

/**
 * Resolves a single user token against the catalog: exact id, exact alias, or
 * a full underscore/word segment of a catalog id/alias (e.g. 'PID' matches
 * 'PID_CONTROLLER'). Returns undefined when nothing in the catalog matches —
 * such tokens are refusals, never inventions.
 */
export function resolveBlockToken(token: string, catalog: XbridgesCapabilityIndex): XbridgesBlockCapability | undefined {
  const direct = catalog.blocks.get(token);
  if (direct) return direct;
  const viaAlias = catalog.aliases.get(token.trim().toLowerCase());
  if (viaAlias) return catalog.blocks.get(viaAlias);

  // Segment matching is restricted to ALL_CAPS acronym tokens (e.g. 'PID' →
  // 'PID_CONTROLLER'). Lowercase common nouns ('motion', 'energy', 'drive')
  // must never resolve, or prose like "perpetual motion generator" would be
  // misread as a catalog chain.
  const trimmed = token.trim();
  if (!/^[A-Z][A-Z0-9_]*$/.test(trimmed)) return undefined;
  const lower = trimmed.toLowerCase();
  if (lower.length < 2) return undefined;
  const prefix: XbridgesBlockCapability[] = [];
  const suffix: XbridgesBlockCapability[] = [];
  const middle: XbridgesBlockCapability[] = [];
  for (const cap of catalog.blocks.values()) {
    const idLower = cap.id.toLowerCase();
    const idSegments = idLower.split('_');
    if (!idSegments.includes(lower)) continue;
    if (idLower === lower || idLower.startsWith(`${lower}_`)) prefix.push(cap);
    else if (idLower.endsWith(`_${lower}`)) suffix.push(cap);
    else middle.push(cap);
  }
  const pick = (list: XbridgesBlockCapability[]) =>
    [...list].sort((a, b) => a.id.localeCompare(b.id))[0];
  return pick(prefix) || pick(suffix) || pick(middle);
}

/** Resolve every catalog-recognizable token in the text, in order of appearance. */
export function resolveCatalogTokens(text: string, catalog: XbridgesCapabilityIndex): XbridgesBlockCapability[] {
  const tokens = text.split(/[^A-Za-z0-9_]+/).filter(t => t.length > 1 && !STOPWORDS.has(t.toLowerCase()));
  const resolved: XbridgesBlockCapability[] = [];
  const seen = new Set<string>();
  for (const token of tokens) {
    const cap = resolveBlockToken(token, catalog);
    if (cap && !seen.has(cap.id)) {
      seen.add(cap.id);
      resolved.push(cap);
    }
  }
  return resolved;
}

function quantity(request: GeneralEngineeringRequest, name: string): RequirementValue | undefined {
  return request.inputs.find(i => i.name === name || i.name.toLowerCase() === name.toLowerCase());
}

function numericQuantity(request: GeneralEngineeringRequest, name: string): number | undefined {
  const q = quantity(request, name);
  if (!q) return undefined;
  const n = typeof q.value === 'number' ? q.value : Number(String(q.value).match(/-?\d+(\.\d+)?/)?.[0] ?? NaN);
  return Number.isFinite(n) ? n : undefined;
}

function diag(category: StructuredDiagnostic['category'], code: string, message: string, entityId?: string): StructuredDiagnostic {
  return { category, code, severity: 'ERROR', message, entityId };
}

function block(catalog: XbridgesCapabilityIndex, id: string, type: string, params: Record<string, unknown>, slot: number): SynthesizedBlock | undefined {
  const cap = catalog.blocks.get(type);
  if (!cap) return undefined;
  // Only parameters that actually exist on the catalog block are allowed.
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(params)) {
    if (cap.parameters[k]) clean[k] = v;
  }
  return { id, type, params: clean, position: { x: 100 + slot * 240, y: 150 + (slot % 2) * 120 } };
}

function requireBlocks(
  catalog: XbridgesCapabilityIndex,
  types: string[],
  diagnostics: StructuredDiagnostic[]
): boolean {
  let ok = true;
  for (const t of types) {
    if (!catalog.blocks.has(t)) {
      diagnostics.push(diag('TOPOLOGY', 'MISSING_CAPABILITY', `Required block type '${t}' is not present in the installed catalog.`, t));
      ok = false;
    }
  }
  return ok;
}

function portExists(catalog: XbridgesCapabilityIndex, blockType: string, portId: string, direction: 'input' | 'output'): boolean {
  const cap = catalog.blocks.get(blockType);
  if (!cap) return false;
  const ports = direction === 'input' ? cap.inputs : cap.outputs;
  return ports.some(p => p.id === portId);
}

// ---------------------------------------------------------------------------
// Behavior-specific topologies (each verified against real catalog ports)
// ---------------------------------------------------------------------------
function topologyClosedLoopPid(request: GeneralEngineeringRequest, catalog: XbridgesCapabilityIndex, diagnostics: StructuredDiagnostic[]): SynthesisTopology | undefined {
  if (!requireBlocks(catalog, ['Constant', 'Sum', 'PID_CONTROLLER', 'INTEGRATOR_CONTINUOUS', 'Scope'], diagnostics)) return undefined;

  const setpoint = numericQuantity(request, 'setpoint') ?? 100;
  const kp = numericQuantity(request, 'kp') ?? 2;
  const ki = numericQuantity(request, 'ki') ?? 0.5;
  const kd = numericQuantity(request, 'kd') ?? 0.05;

  const blocks: SynthesizedBlock[] = [];
  const b = (id: string, type: string, params: Record<string, unknown>) => {
    const made = block(catalog, id, type, params, blocks.length);
    if (made) blocks.push(made);
    return made;
  };
  b('setpoint_src', 'Constant', { value: setpoint });
  b('error_sum', 'Sum', { signs: '+-', numInputs: 2 });
  b('pid_ctrl', 'PID_CONTROLLER', { Kp: kp, Ki: ki, Kd: kd });
  b('plant_integ', 'INTEGRATOR_CONTINUOUS', { initial_condition: 0 });
  b('obs_scope', 'Scope', {});

  const connections: SynthesizedConnection[] = [
    { fromBlockId: 'setpoint_src', fromPortId: 'out', toBlockId: 'error_sum', toPortId: 'in1' },
    { fromBlockId: 'error_sum', fromPortId: 'out', toBlockId: 'pid_ctrl', toPortId: 'r' },
    { fromBlockId: 'pid_ctrl', fromPortId: 'u', toBlockId: 'plant_integ', toPortId: 'u' },
    { fromBlockId: 'plant_integ', fromPortId: 'y', toBlockId: 'error_sum', toPortId: 'in2' },
    { fromBlockId: 'plant_integ', fromPortId: 'y', toBlockId: 'obs_scope', toPortId: 'in1' },
  ];
  return { blocks, connections, provenanceId: 'catalog_closed_loop_pid' };
}

function topologyLowPassFilter(request: GeneralEngineeringRequest, catalog: XbridgesCapabilityIndex, diagnostics: StructuredDiagnostic[]): SynthesisTopology | undefined {
  if (!requireBlocks(catalog, ['Step', 'Sum', 'GAIN', 'Integrator', 'Scope'], diagnostics)) return undefined;

  const tau = numericQuantity(request, 'time_constant') ?? 0.01;
  const amp = numericQuantity(request, 'amplitude') ?? 1;
  const gain = tau > 0 ? Number((1 / tau).toPrecision(6)) : 1;

  const blocks: SynthesizedBlock[] = [];
  const b = (id: string, type: string, params: Record<string, unknown>) => {
    const made = block(catalog, id, type, params, blocks.length);
    if (made) blocks.push(made);
    return made;
  };
  b('src_step', 'Step', { stepTime: 0.5, initialValue: 0, finalValue: amp });
  b('error_sum', 'Sum', { signs: '+-', numInputs: 2 });
  b('tau_gain', 'GAIN', { gain });
  b('filter_integ', 'Integrator', { initialCondition: 0 });
  b('obs_scope', 'Scope', {});

  const connections: SynthesizedConnection[] = [
    { fromBlockId: 'src_step', fromPortId: 'out', toBlockId: 'error_sum', toPortId: 'in1' },
    { fromBlockId: 'error_sum', fromPortId: 'out', toBlockId: 'tau_gain', toPortId: 'u' },
    { fromBlockId: 'tau_gain', fromPortId: 'y', toBlockId: 'filter_integ', toPortId: 'in' },
    { fromBlockId: 'filter_integ', fromPortId: 'out', toBlockId: 'error_sum', toPortId: 'in2' },
    { fromBlockId: 'filter_integ', fromPortId: 'out', toBlockId: 'obs_scope', toPortId: 'in1' },
  ];
  return { blocks, connections, provenanceId: 'catalog_first_order_low_pass' };
}

function topologyThermalAlarm(request: GeneralEngineeringRequest, catalog: XbridgesCapabilityIndex, diagnostics: StructuredDiagnostic[]): SynthesisTopology | undefined {
  if (!requireBlocks(catalog, ['WaveformGen', 'SWITCH', 'Constant', 'Scope'], diagnostics)) return undefined;

  const threshold = numericQuantity(request, 'threshold') ?? 200;

  const blocks: SynthesizedBlock[] = [];
  const b = (id: string, type: string, params: Record<string, unknown>) => {
    const made = block(catalog, id, type, params, blocks.length);
    if (made) blocks.push(made);
    return made;
  };
  b('temp_signal', 'WaveformGen', { type: 'sine', amp: threshold, freq: 1, offset: threshold / 2 });
  b('alarm_high', 'Constant', { value: 1 });
  b('alarm_low', 'Constant', { value: 0 });
  b('alarm_switch', 'SWITCH', { threshold, criteria: '>' });
  b('obs_scope', 'Scope', {});

  const connections: SynthesizedConnection[] = [
    { fromBlockId: 'temp_signal', fromPortId: 'out', toBlockId: 'alarm_switch', toPortId: 'ctrl' },
    { fromBlockId: 'alarm_high', fromPortId: 'out', toBlockId: 'alarm_switch', toPortId: 'u1' },
    { fromBlockId: 'alarm_low', fromPortId: 'out', toBlockId: 'alarm_switch', toPortId: 'u2' },
    { fromBlockId: 'alarm_switch', fromPortId: 'y', toBlockId: 'obs_scope', toPortId: 'in1' },
  ];
  return { blocks, connections, provenanceId: 'catalog_thermal_alarm_logic' };
}

function topologyMotorDrive(request: GeneralEngineeringRequest, catalog: XbridgesCapabilityIndex, diagnostics: StructuredDiagnostic[]): SynthesisTopology | undefined {
  if (!requireBlocks(catalog, ['DC_VOLTAGE_SOURCE', 'PWM_GENERATOR', 'Constant', 'THREE_PHASE_INVERTER', 'THREE_PHASE_LOAD', 'Scope'], diagnostics)) return undefined;

  const voltage = numericQuantity(request, 'voltage') ?? 400;
  const freqHz = numericQuantity(request, 'frequency') ?? 5000;
  const resistance = numericQuantity(request, 'resistance') ?? numericQuantity(request, 'load') ?? 10;

  const blocks: SynthesizedBlock[] = [];
  const b = (id: string, type: string, params: Record<string, unknown>) => {
    const made = block(catalog, id, type, params, blocks.length);
    if (made) blocks.push(made);
    return made;
  };
  b('dc_src', 'DC_VOLTAGE_SOURCE', { voltage });
  b('duty_ref', 'Constant', { value: 0.5 });
  b('pwm_gen', 'PWM_GENERATOR', { frequency: freqHz });
  b('inv_bridge', 'THREE_PHASE_INVERTER', { Ron: 0.01 });
  b('phase_load', 'THREE_PHASE_LOAD', { R: resistance });
  b('obs_scope', 'Scope', {});

  const connections: SynthesizedConnection[] = [
    { fromBlockId: 'dc_src', fromPortId: 'v_pos', toBlockId: 'inv_bridge', toPortId: 'vdc_p' },
    { fromBlockId: 'dc_src', fromPortId: 'v_neg', toBlockId: 'inv_bridge', toPortId: 'vdc_n' },
    { fromBlockId: 'duty_ref', fromPortId: 'out', toBlockId: 'pwm_gen', toPortId: 'duty' },
    { fromBlockId: 'pwm_gen', fromPortId: 'pwm', toBlockId: 'inv_bridge', toPortId: 'ga' },
    { fromBlockId: 'pwm_gen', fromPortId: 'pwm', toBlockId: 'inv_bridge', toPortId: 'gb' },
    { fromBlockId: 'pwm_gen', fromPortId: 'pwm', toBlockId: 'inv_bridge', toPortId: 'gc' },
    { fromBlockId: 'inv_bridge', fromPortId: 'va', toBlockId: 'phase_load', toPortId: 'va' },
    { fromBlockId: 'inv_bridge', fromPortId: 'vb', toBlockId: 'phase_load', toPortId: 'vb' },
    { fromBlockId: 'inv_bridge', fromPortId: 'vc', toBlockId: 'phase_load', toPortId: 'vc' },
    { fromBlockId: 'phase_load', fromPortId: 'ia', toBlockId: 'obs_scope', toPortId: 'in1' },
  ];
  return { blocks, connections, provenanceId: 'catalog_three_phase_motor_drive' };
}

function topologyThermalControl(request: GeneralEngineeringRequest, catalog: XbridgesCapabilityIndex, diagnostics: StructuredDiagnostic[]): SynthesisTopology | undefined {
  if (!requireBlocks(catalog, ['Constant', 'AIR_FRYER_LEARNING_MODEL', 'Scope'], diagnostics)) return undefined;

  const power = numericQuantity(request, 'power') ?? 1800;
  const target = numericQuantity(request, 'threshold') ?? numericQuantity(request, 'setpoint') ?? 200;

  const blocks: SynthesizedBlock[] = [];
  const b = (id: string, type: string, params: Record<string, unknown>) => {
    const made = block(catalog, id, type, params, blocks.length);
    if (made) blocks.push(made);
    return made;
  };
  b('power_ref', 'Constant', { value: power });
  b('fan_ref', 'Constant', { value: 0.5 });
  b('temp_meas', 'Constant', { value: 25 });
  b('learn_rate', 'Constant', { value: 0.01 });
  b('cavity_dim', 'Constant', { value: 0.2 });
  b('thermal_plant', 'AIR_FRYER_LEARNING_MODEL', {});
  b('obs_scope', 'Scope', {});

  const connections: SynthesizedConnection[] = [
    { fromBlockId: 'power_ref', fromPortId: 'out', toBlockId: 'thermal_plant', toPortId: 'power' },
    { fromBlockId: 'fan_ref', fromPortId: 'out', toBlockId: 'thermal_plant', toPortId: 'fan_speed' },
    { fromBlockId: 'temp_meas', fromPortId: 'out', toBlockId: 'thermal_plant', toPortId: 'measured_temp' },
    { fromBlockId: 'learn_rate', fromPortId: 'out', toBlockId: 'thermal_plant', toPortId: 'lr' },
    { fromBlockId: 'cavity_dim', fromPortId: 'out', toBlockId: 'thermal_plant', toPortId: 'cavity_dim' },
    { fromBlockId: 'thermal_plant', fromPortId: 'temp_actual', toBlockId: 'obs_scope', toPortId: 'in1' },
  ];
  void target;
  return { blocks, connections, provenanceId: 'catalog_thermal_control_plant' };
}

function topologyLogicalSequencing(request: GeneralEngineeringRequest, catalog: XbridgesCapabilityIndex, diagnostics: StructuredDiagnostic[]): SynthesisTopology | undefined {
  if (!requireBlocks(catalog, ['Constant', 'Clock', 'DFlipFlop', 'Scope'], diagnostics)) return undefined;

  const blocks: SynthesizedBlock[] = [];
  const b = (id: string, type: string, params: Record<string, unknown>) => {
    const made = block(catalog, id, type, params, blocks.length);
    if (made) blocks.push(made);
    return made;
  };
  b('data_in', 'Constant', { value: 1 });
  b('clk_src', 'Clock', { freq: 10 });
  b('seq_latch', 'DFlipFlop', {});
  b('obs_scope', 'Scope', {});

  const connections: SynthesizedConnection[] = [
    { fromBlockId: 'data_in', fromPortId: 'out', toBlockId: 'seq_latch', toPortId: 'd' },
    { fromBlockId: 'clk_src', fromPortId: 'clk', toBlockId: 'seq_latch', toPortId: 'clk' },
    { fromBlockId: 'seq_latch', fromPortId: 'q', toBlockId: 'obs_scope', toPortId: 'in1' },
  ];
  return { blocks, connections, provenanceId: 'catalog_logical_sequencing' };
}

/** Explicit user-named block chain, connected in order via compatible ports. */
function topologyExplicitChain(
  chain: XbridgesBlockCapability[],
  request: GeneralEngineeringRequest,
  catalog: XbridgesCapabilityIndex,
  diagnostics: StructuredDiagnostic[]
): SynthesisTopology | undefined {
  if (chain.length < 2) {
    diagnostics.push(diag('ENGINEERING', 'MISSING_REQUIREMENT', 'At least two connected blocks are required to form a chain.'));
    return undefined;
  }

  const blocks: SynthesizedBlock[] = [];
  chain.forEach((cap, i) => {
    const params: Record<string, unknown> = {};
    const made = block(catalog, `${cap.id.toLowerCase()}_${i + 1}`, cap.id, params, i);
    if (made) blocks.push(made);
  });
  if (blocks.length !== chain.length) {
    diagnostics.push(diag('TOPOLOGY', 'MISSING_CAPABILITY', 'One or more named blocks could not be resolved in the catalog.'));
    return undefined;
  }

  // Apply requested quantities to matching parameters (e.g. gain).
  for (const q of request.inputs) {
    const num = typeof q.value === 'number' ? q.value : Number(String(q.value).match(/-?\d+(\.\d+)?/)?.[0] ?? NaN);
    if (!Number.isFinite(num)) continue;
    for (const b of blocks) {
      const cap = catalog.blocks.get(b.type)!;
      const paramName = Object.keys(cap.parameters).find(p => p.toLowerCase() === q.name.toLowerCase());
      if (paramName) b.params[paramName] = num;
    }
  }

  const connections: SynthesizedConnection[] = [];
  for (let i = 0; i < blocks.length - 1; i++) {
    const srcCap = catalog.blocks.get(blocks[i].type)!;
    const tgtCap = catalog.blocks.get(blocks[i + 1].type)!;
    const outPort = srcCap.outputs[0];
    const inPort = tgtCap.inputs[0];
    if (!outPort) {
      diagnostics.push(diag('TOPOLOGY', 'INCOMPATIBLE_PORTS', `Block type '${srcCap.id}' exposes no output port; it cannot feed '${tgtCap.id}'.`, blocks[i].id));
      return undefined;
    }
    if (!inPort) {
      diagnostics.push(diag('TOPOLOGY', 'INCOMPATIBLE_PORTS', `Block type '${tgtCap.id}' exposes no input port; it cannot be fed by '${srcCap.id}'.`, blocks[i + 1].id));
      return undefined;
    }
    connections.push({
      fromBlockId: blocks[i].id,
      fromPortId: outPort.id,
      toBlockId: blocks[i + 1].id,
      toPortId: inPort.id,
    });
  }
  return { blocks, connections, provenanceId: 'catalog_explicit_chain' };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
const BEHAVIOR_PRIORITY: Array<{ behavior: string; build: typeof topologyClosedLoopPid }> = [
  { behavior: 'speed_control', build: topologyClosedLoopPid },
  { behavior: 'closed_loop_control', build: topologyClosedLoopPid },
  { behavior: 'low_pass_filter', build: topologyLowPassFilter },
  { behavior: 'thermal_alarm_logic', build: topologyThermalAlarm },
  { behavior: 'motor_drive', build: topologyMotorDrive },
  { behavior: 'thermal_control', build: topologyThermalControl },
  { behavior: 'logical_sequencing', build: topologyLogicalSequencing },
];

export function synthesizeTopology(input: SynthesizeInput): SynthesisOutcome {
  const { request, catalog } = input;
  const diagnostics: StructuredDiagnostic[] = [];
  const text = `${request.objective} ${request.rawPrompt || ''}`;

  const explicitChain = resolveCatalogTokens(text, catalog);
  const chainUsable = explicitChain.length >= 2;

  // 1. Behavior-specific topologies take precedence when the request names a
  //    recognized engineering behavior.
  for (const { behavior, build } of BEHAVIOR_PRIORITY) {
    if (request.targetBehaviors.includes(behavior)) {
      const topology = build(request, catalog, diagnostics);
      if (!topology) {
        return { status: 'refused', diagnostics };
      }
      return { status: 'planned', topology, diagnostics: [] };
    }
  }

  // 2. Explicit user-named chains (catalog tokens only).
  if (chainUsable) {
    const topology = topologyExplicitChain(explicitChain, request, catalog, diagnostics);
    if (!topology) {
      return { status: 'refused', diagnostics };
    }
    return { status: 'planned', topology, diagnostics: [] };
  }

  // 3. Generic feed-forward requests with no resolvable blocks: refuse rather
  //    than invent a meaningless graph.
  if (request.targetBehaviors.includes('feed_forward')) {
    diagnostics.push(diag('ENGINEERING', 'MISSING_REQUIREMENT', 'The request names no catalog blocks and no supported behavior topology applies. Name concrete blocks (e.g., Step, Gain, Scope) or a supported behavior.'));
    return { status: 'refused', diagnostics };
  }

  diagnostics.push(diag('ENGINEERING', 'MISSING_CAPABILITY', `No catalog-supported topology matches behaviors [${request.targetBehaviors.join(', ') || 'none'}]. Refusing instead of guessing.`));
  return { status: 'refused', diagnostics };
}

/** Validates every synthesized connection against real catalog ports. */
export function validateTopologyPorts(topology: SynthesisTopology, catalog: XbridgesCapabilityIndex): StructuredDiagnostic[] {
  const diagnostics: StructuredDiagnostic[] = [];
  for (const b of topology.blocks) {
    if (!catalog.blocks.has(b.type)) {
      diagnostics.push(diag('TOPOLOGY', 'UNKNOWN_BLOCK_TYPE', `Block '${b.id}' uses type '${b.type}' absent from the catalog.`, b.id));
    }
    const cap = catalog.blocks.get(b.type);
    if (cap) {
      for (const [name] of Object.entries(b.params)) {
        if (!cap.parameters[name]) {
          diagnostics.push(diag('PARAMETER', 'UNKNOWN_PARAMETER', `Parameter '${name}' is not defined on block type '${b.type}'.`, b.id));
        }
      }
    }
  }
  for (const c of topology.connections) {
    const src = topology.blocks.find(b => b.id === c.fromBlockId);
    const tgt = topology.blocks.find(b => b.id === c.toBlockId);
    if (!src || !tgt) {
      diagnostics.push(diag('TOPOLOGY', 'UNKNOWN_CONNECTION_ENDPOINT', `Connection ${c.fromBlockId}→${c.toBlockId} references a missing block.`));
      continue;
    }
    if (!portExists(catalog, src.type, c.fromPortId, 'output')) {
      diagnostics.push(diag('TOPOLOGY', 'INCOMPATIBLE_PORTS', `Output port '${c.fromPortId}' does not exist on '${src.type}'.`, src.id));
    }
    if (!portExists(catalog, tgt.type, c.toPortId, 'input')) {
      diagnostics.push(diag('TOPOLOGY', 'INCOMPATIBLE_PORTS', `Input port '${c.toPortId}' does not exist on '${tgt.type}'.`, tgt.id));
    }
  }
  return diagnostics;
}

/**
 * Full synthesis: topology + typed actions + deterministic plan hash.
 */
export function synthesizeGraph(input: SynthesizeInput & { projectId: string; baseRevision: number }): {
  status: 'planned' | 'refused';
  plan?: EngineeringModelPlanV2;
  diagnostics: StructuredDiagnostic[];
  provenance: Array<{ patternId: string; version: string; license?: string }>;
} {
  const { request, snapshot, catalog, projectId, baseRevision } = input;
  const outcome = synthesizeTopology(input);

  if (outcome.status === 'refused' || !outcome.topology) {
    return { status: 'refused', diagnostics: outcome.diagnostics, provenance: [] };
  }

  const portDiagnostics = validateTopologyPorts(outcome.topology, catalog);
  if (portDiagnostics.length > 0) {
    return { status: 'refused', diagnostics: [...outcome.diagnostics, ...portDiagnostics], provenance: [] };
  }

  const topology = outcome.topology;

  const actions: XbridgesAction[] = [];
  for (const b of topology.blocks) {
    actions.push({
      id: `act_add_${b.id}`,
      kind: 'add_block',
      blockId: b.id,
      blockType: b.type,
      parameters: b.params,
      position: b.position,
    });
  }
  for (const c of topology.connections) {
    actions.push({
      id: `act_conn_${c.fromBlockId}_${c.fromPortId}_${c.toBlockId}_${c.toPortId}`,
      kind: 'connect_ports',
      sourceBlockId: c.fromBlockId,
      sourcePortId: c.fromPortId,
      targetBlockId: c.toBlockId,
      targetPortId: c.toPortId,
    });
  }

  const KIND_ORDER: Record<string, number> = {
    add_block: 1,
    rename_block: 2,
    move_block: 3,
    set_parameter: 4,
    disconnect_ports: 5,
    remove_block: 6,
    connect_ports: 7,
  };
  actions.sort((a, b) => {
    const oa = KIND_ORDER[a.kind] || 99;
    const ob = KIND_ORDER[b.kind] || 99;
    if (oa !== ob) return oa - ob;
    return a.id.localeCompare(b.id);
  });

  const addedBlocks = topology.blocks.map(b => b.id).sort();
  const addedConnections = topology.connections
    .map(c => ({ from: `${c.fromBlockId}:${c.fromPortId}`, to: `${c.toBlockId}:${c.toPortId}` }))
    .sort((a, b) => `${a.from}->${a.to}`.localeCompare(`${b.from}->${b.to}`));

  const logicalBlocks: LogicalBlock[] = topology.blocks.map(b => ({
    id: b.id,
    blockDefinitionId: b.type,
    domain: 'xbridges',
    name: b.id,
    parameters: Object.entries(b.params).map(([parameterName, value]) => ({
      blockId: b.id,
      parameterName,
      value: value as never,
    })),
  }));

  const logicalConnections: LogicalConnection[] = topology.connections.map((c, i) => ({
    id: `conn_${i}_${c.fromBlockId}_${c.toBlockId}`,
    fromBlockId: c.fromBlockId,
    fromPortId: c.fromPortId,
    toBlockId: c.toBlockId,
    toPortId: c.toPortId,
    domain: 'xbridges',
  }));

  const planPayload = {
    schemaVersion: '2.0.0' as const,
    planId: `plan_${projectId}_rev${baseRevision}_${topology.provenanceId}`,
    projectId,
    baseRevision,
    catalogFingerprint: catalog.catalogFingerprint,
    expectedBeforeHash: snapshot.stateHash,
    expectedAfterDelta: {
      addedBlocks,
      removedBlocks: [] as string[],
      modifiedBlocks: [] as string[],
      addedConnections,
      removedConnections: [] as Array<{ from: string; to: string }>,
    },
    actions,
    blocks: logicalBlocks,
    connections: logicalConnections,
    synthesizer: {
      version: GRAPH_SYNTHESIZER_VERSION,
      knowledgeHash: input.knowledgeHash ?? 'none',
      requestHash: sha256Hex(canonicalJson(request)),
    },
  };

  const plan: EngineeringModelPlanV2 = {
    ...planPayload,
    planHash: sha256Hex(canonicalJson(planPayload)),
  };

  return {
    status: 'planned',
    plan,
    diagnostics: [],
    provenance: [{ patternId: topology.provenanceId, version: GRAPH_SYNTHESIZER_VERSION, license: 'catalog-derived' }],
  };
}
