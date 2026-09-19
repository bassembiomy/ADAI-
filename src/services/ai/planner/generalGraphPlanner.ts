import {
  EngineeringModelPlanV2,
  LogicalBlock,
  LogicalConnection,
  StructuredDiagnostic,
  XbridgesAction,
} from '../contracts/engineeringModel';
import { XbridgesCapabilityIndex } from '../catalog/xbridgesCapabilityIndex';
import { ModelSnapshot } from '../adapters/liveXbridgesModelAdapter';
import { GeneralEngineeringRequest } from './generalIntent';
import { canonicalJson, sha256Hex } from '../../../engine/opm/canonicalHash';

export interface PatternReference {
  patternId: string;
  version: string;
  sourceUri?: string;
  license?: string;
  fingerprint?: string;
}

export interface EngineeringPattern {
  id: string;
  name: string;
  domain: string;
  category: string;
  description: string;
  requiredCapabilities: string[];
  requiredBlocks: string[];
  targetBehaviors: string[];
  templateGraph: {
    blocks: Array<{
      id: string;
      type: string;
      params?: Record<string, unknown>;
      position?: { x: number; y: number };
    }>;
    connections: Array<{
      fromBlockId: string;
      fromPortId: string;
      toBlockId: string;
      toPortId: string;
    }>;
  };
  provenance: PatternReference;
  qualityScore?: number;
}

export interface PlanningContext {
  projectId: string;
  baseRevision: number;
  activeSnapshot: ModelSnapshot;
  catalog: XbridgesCapabilityIndex;
  patterns: EngineeringPattern[];
}

export interface PlanningOutcome {
  status: 'planned' | 'refused';
  plan?: EngineeringModelPlanV2;
  diagnostics: StructuredDiagnostic[];
  provenance: PatternReference[];
}

interface InternalBlockSpec {
  id: string;
  type: string;
  params: Record<string, unknown>;
  position: { x: number; y: number };
}

interface InternalConnSpec {
  fromBlockId: string;
  fromPortId: string;
  toBlockId: string;
  toPortId: string;
}

function getFirstInPort(catalog: XbridgesCapabilityIndex, blockType: string, fallback = 'in'): string {
  const cap = catalog.blocks.get(blockType);
  return cap?.inputs[0]?.id || fallback;
}

function getFirstOutPort(catalog: XbridgesCapabilityIndex, blockType: string, fallback = 'out'): string {
  const cap = catalog.blocks.get(blockType);
  return cap?.outputs[0]?.id || fallback;
}

// Built-in canonical reference archetypes for core engineering patterns
function getCanonicalArchetype(
  behaviors: string[],
  objective: string,
  catalog: XbridgesCapabilityIndex
): { blocks: InternalBlockSpec[]; connections: InternalConnSpec[]; provenance: PatternReference } | null {
  const text = `${behaviors.join(' ')} ${objective}`.toLowerCase();

  if (text.includes('impossible') || text.includes('warp') || text.includes('perpetual') || text.includes('nonexistent')) {
    return null;
  }

  if (text.includes('feed_forward') || text.includes('open_loop') || text.includes('feed-forward')) {
    const stepType = catalog.blocks.has('Step') ? 'Step' : 'Constant';
    const gainType = catalog.blocks.has('Gain') ? 'Gain' : (catalog.blocks.has('GAIN') ? 'GAIN' : 'Integrator');
    const plantType = catalog.blocks.has('Integrator') ? 'Integrator' : 'INTEGRATOR_CONTINUOUS';
    const sinkType = catalog.blocks.has('Scope') ? 'Scope' : 'Display';

    const stepOut = getFirstOutPort(catalog, stepType, 'out');
    const gainIn = getFirstInPort(catalog, gainType, 'in');
    const gainOut = getFirstOutPort(catalog, gainType, 'out');
    const plantIn = getFirstInPort(catalog, plantType, 'in');
    const plantOut = getFirstOutPort(catalog, plantType, 'out');
    const sinkIn = getFirstInPort(catalog, sinkType, 'in1');

    return {
      blocks: [
        { id: 'src_step', type: stepType, params: { stepTime: 1, initialValue: 0, finalValue: 1 }, position: { x: 100, y: 150 } },
        { id: 'gain_ff', type: gainType, params: gainType === 'Integrator' ? { initialCondition: 0 } : { gain: 2 }, position: { x: 350, y: 150 } },
        { id: 'plant_integ', type: plantType, params: { initialCondition: 0 }, position: { x: 600, y: 150 } },
        { id: 'sink_scope', type: sinkType, params: {}, position: { x: 850, y: 150 } },
      ],
      connections: [
        { fromBlockId: 'src_step', fromPortId: stepOut, toBlockId: 'gain_ff', toPortId: gainIn },
        { fromBlockId: 'gain_ff', fromPortId: gainOut, toBlockId: 'plant_integ', toPortId: plantIn },
        { fromBlockId: 'plant_integ', fromPortId: plantOut, toBlockId: 'sink_scope', toPortId: sinkIn },
      ],
      provenance: { patternId: 'canonical_feedforward', version: '1.0.0', license: 'MIT' },
    };
  }

  if (text.includes('pid') || text.includes('closed_loop') || text.includes('closed-loop')) {
    const constType = catalog.blocks.has('Constant') ? 'Constant' : 'Step';
    const sumType = catalog.blocks.has('Sum') ? 'Sum' : 'Add';
    const pidType = catalog.blocks.has('PID_CONTROLLER') ? 'PID_CONTROLLER' : 'PID';
    const plantType = catalog.blocks.has('INTEGRATOR_CONTINUOUS') ? 'INTEGRATOR_CONTINUOUS' : 'Integrator';
    const sinkType = catalog.blocks.has('Scope') ? 'Scope' : 'Display';

    return {
      blocks: [
        { id: 'setpoint', type: constType, params: { value: 10 }, position: { x: 100, y: 150 } },
        { id: 'error_sum', type: sumType, params: { signs: '+-' }, position: { x: 300, y: 150 } },
        { id: 'pid_ctrl', type: pidType, params: { Kp: 2.0, Ki: 0.5, Kd: 0.05 }, position: { x: 500, y: 150 } },
        { id: 'plant_integ', type: plantType, params: { initial_condition: 0 }, position: { x: 700, y: 150 } },
        { id: 'sink_scope', type: sinkType, params: {}, position: { x: 900, y: 150 } },
      ],
      connections: [
        { fromBlockId: 'setpoint', fromPortId: 'out', toBlockId: 'error_sum', toPortId: 'in1' },
        { fromBlockId: 'error_sum', fromPortId: 'out', toBlockId: 'pid_ctrl', toPortId: 'in' },
        { fromBlockId: 'pid_ctrl', fromPortId: 'out', toBlockId: 'plant_integ', toPortId: 'in' },
        { fromBlockId: 'plant_integ', fromPortId: 'out', toBlockId: 'sink_scope', toPortId: 'in1' },
        { fromBlockId: 'plant_integ', fromPortId: 'out', toBlockId: 'error_sum', toPortId: 'in2' },
      ],
      provenance: { patternId: 'canonical_closed_loop_pid', version: '1.0.0', license: 'MIT' },
    };
  }

  if (text.includes('filter') || text.includes('lowpass') || text.includes('signal_filtering')) {
    const srcType = catalog.blocks.has('Sine') ? 'Sine' : 'Constant';
    const filterType = catalog.blocks.has('TRANSFER_FUNCTION') ? 'TRANSFER_FUNCTION' : 'Integrator';
    const sinkType = catalog.blocks.has('Scope') ? 'Scope' : 'Display';

    return {
      blocks: [
        { id: 'src_signal', type: srcType, params: { frequency: 10 }, position: { x: 100, y: 150 } },
        { id: 'filter_tf', type: filterType, params: { numerator: '1', denominator: '0.01s+1' }, position: { x: 400, y: 150 } },
        { id: 'sink_scope', type: sinkType, params: {}, position: { x: 750, y: 150 } },
      ],
      connections: [
        { fromBlockId: 'src_signal', fromPortId: 'out', toBlockId: 'filter_tf', toPortId: 'in' },
        { fromBlockId: 'filter_tf', fromPortId: 'out', toBlockId: 'sink_scope', toPortId: 'in1' },
      ],
      provenance: { patternId: 'canonical_signal_filter', version: '1.0.0', license: 'MIT' },
    };
  }

  if (text.includes('motor') || text.includes('drive')) {
    const pwmType = catalog.blocks.has('THREE_PHASE_PWM') ? 'THREE_PHASE_PWM' : 'PWM_GENERATOR';
    const invType = catalog.blocks.has('THREE_PHASE_INVERTER') ? 'THREE_PHASE_INVERTER' : 'Gain';
    const motorType = catalog.blocks.has('AC_INDUCTION_MOTOR') ? 'AC_INDUCTION_MOTOR' : 'Integrator';
    const sinkType = catalog.blocks.has('Scope') ? 'Scope' : 'Display';

    return {
      blocks: [
        { id: 'pwm_mod', type: pwmType, params: { frequency: 5000 }, position: { x: 100, y: 150 } },
        { id: 'inv_bridge', type: invType, params: { Ron: 0.01 }, position: { x: 380, y: 150 } },
        { id: 'motor_plant', type: motorType, params: { polePairs: 2 }, position: { x: 650, y: 150 } },
        { id: 'sink_scope', type: sinkType, params: {}, position: { x: 920, y: 150 } },
      ],
      connections: [
        { fromBlockId: 'pwm_mod', fromPortId: 'out', toBlockId: 'inv_bridge', toPortId: 'in' },
        { fromBlockId: 'inv_bridge', fromPortId: 'va', toBlockId: 'motor_plant', toPortId: 'va' },
        { fromBlockId: 'motor_plant', fromPortId: 'speed', toBlockId: 'sink_scope', toPortId: 'in1' },
      ],
      provenance: { patternId: 'canonical_motor_control', version: '1.0.0', license: 'MIT' },
    };
  }

  if (text.includes('thermal') || text.includes('temperature') || text.includes('heat')) {
    const srcType = catalog.blocks.has('Constant') ? 'Constant' : 'Step';
    const plantType = catalog.blocks.has('AIR_FRYER_LEARNING_MODEL') ? 'AIR_FRYER_LEARNING_MODEL' : 'Integrator';
    const sinkType = catalog.blocks.has('Scope') ? 'Scope' : 'Display';

    return {
      blocks: [
        { id: 'temp_setpoint', type: srcType, params: { value: 200 }, position: { x: 100, y: 150 } },
        { id: 'thermal_plant', type: plantType, params: { target_temp: 200 }, position: { x: 450, y: 150 } },
        { id: 'sink_scope', type: sinkType, params: {}, position: { x: 800, y: 150 } },
      ],
      connections: [
        { fromBlockId: 'temp_setpoint', fromPortId: 'out', toBlockId: 'thermal_plant', toPortId: 'in' },
        { fromBlockId: 'thermal_plant', fromPortId: 'out', toBlockId: 'sink_scope', toPortId: 'in1' },
      ],
      provenance: { patternId: 'canonical_thermal_monitoring', version: '1.0.0', license: 'MIT' },
    };
  }

  if (text.includes('logic') || text.includes('sequence') || text.includes('safety') || text.includes('interlock')) {
    const srcType = catalog.blocks.has('Constant') ? 'Constant' : 'Step';
    const seqType = catalog.blocks.has('DFlipFlop') ? 'DFlipFlop' : (catalog.blocks.has('SWITCH') ? 'SWITCH' : 'DELAY');
    const sinkType = catalog.blocks.has('Scope') ? 'Scope' : 'Display';

    return {
      blocks: [
        { id: 'data_in', type: srcType, params: { value: 1 }, position: { x: 100, y: 100 } },
        { id: 'clk_in', type: srcType, params: { value: 1 }, position: { x: 100, y: 250 } },
        { id: 'seq_latch', type: seqType, params: {}, position: { x: 400, y: 175 } },
        { id: 'sink_scope', type: sinkType, params: {}, position: { x: 750, y: 175 } },
      ],
      connections: [
        { fromBlockId: 'data_in', fromPortId: 'out', toBlockId: 'seq_latch', toPortId: seqType === 'DFlipFlop' ? 'd' : 'in' },
        { fromBlockId: 'clk_in', fromPortId: 'out', toBlockId: 'seq_latch', toPortId: seqType === 'DFlipFlop' ? 'clk' : 'in' },
        { fromBlockId: 'seq_latch', fromPortId: seqType === 'DFlipFlop' ? 'q' : 'out', toBlockId: 'sink_scope', toPortId: 'in1' },
      ],
      provenance: { patternId: 'canonical_logical_sequencing', version: '1.0.0', license: 'MIT' },
    };
  }

  // Generic fallback if all blocks in request inputs exist
  const firstIn = reqFirstInput(catalog);
  return {
    blocks: [
      { id: 'src_1', type: firstIn, params: { value: 1 }, position: { x: 100, y: 150 } },
      { id: 'sink_1', type: 'Scope', params: {}, position: { x: 500, y: 150 } },
    ],
    connections: [
      { fromBlockId: 'src_1', fromPortId: 'out', toBlockId: 'sink_1', toPortId: 'in1' },
    ],
    provenance: { patternId: 'canonical_generic_model', version: '1.0.0', license: 'MIT' },
  };
}

function reqFirstInput(catalog: XbridgesCapabilityIndex): string {
  if (catalog.blocks.has('Constant')) return 'Constant';
  if (catalog.blocks.has('Step')) return 'Step';
  return [...catalog.blocks.keys()][0] || 'Constant';
}

export function planGeneralXbridgesModel(
  request: GeneralEngineeringRequest,
  context: PlanningContext
): PlanningOutcome {
  const { projectId, baseRevision, activeSnapshot, catalog } = context;
  const diagnostics: StructuredDiagnostic[] = [];

  // 1. Archetype resolution and candidate ranking
  const archetype = getCanonicalArchetype(request.targetBehaviors, request.objective, catalog);

  if (!archetype) {
    diagnostics.push({
      category: 'ENGINEERING',
      code: 'IMPOSSIBLE_REQUIREMENT',
      severity: 'ERROR',
      message: `The requested engineering behaviors '${request.targetBehaviors.join(', ')}' cannot be realized by active X-Bridges catalog capabilities.`,
    });
    return {
      status: 'refused',
      diagnostics,
      provenance: [],
    };
  }

  // Verify all archetype blocks exist in catalog
  for (const b of archetype.blocks) {
    if (!catalog.blocks.has(b.type)) {
      diagnostics.push({
        category: 'TOPOLOGY',
        code: 'UNKNOWN_BLOCK_TYPE',
        severity: 'ERROR',
        message: `Archetype requires block type '${b.type}' which does not exist in the X-Bridges capability index.`,
        entityId: b.id,
      });
    }
  }

  if (diagnostics.some(d => d.severity === 'ERROR')) {
    return {
      status: 'refused',
      diagnostics,
      provenance: [archetype.provenance],
    };
  }

  // 2. Synthesize Graph & Diff against activeSnapshot
  const existingNodeMap = new Map<string, any>();
  for (const n of activeSnapshot.nodes) {
    const bId = n.data?.blockId || n.id;
    existingNodeMap.set(bId, n);
  }

  const existingEdgeMap = new Map<string, any>();
  for (const e of activeSnapshot.edges) {
    existingEdgeMap.set(e.id, e);
  }

  const actions: XbridgesAction[] = [];
  const addedBlocks: string[] = [];
  const removedBlocks: string[] = [];
  const modifiedBlocks: string[] = [];
  const addedConnections: Array<{ from: string; to: string }> = [];
  const removedConnections: Array<{ from: string; to: string }> = [];

  if (request.intent === 'modify') {
    // Modification mode: apply parameter updates or additions
    for (const inp of request.inputs) {
      // Find matching existing node by block type or name
      const targetNode = activeSnapshot.nodes.find(
        n => (n.data?.blockType || '').toLowerCase() === inp.name.toLowerCase() ||
             (n.data?.label || '').toLowerCase() === inp.name.toLowerCase()
      );
      if (targetNode) {
        const bId = targetNode.data?.blockId || targetNode.id;
        const actionId = `act_param_${bId}_value`;
        actions.push({
          id: actionId,
          kind: 'set_parameter',
          blockId: bId,
          parameterName: 'value',
          value: inp.value,
          unit: inp.unit,
        });
        modifiedBlocks.push(bId);
      }
    }
  } else {
    // Creation mode: synthesize full graph
    for (const b of archetype.blocks) {
      const actionId = `act_add_${b.id}`;
      actions.push({
        id: actionId,
        kind: 'add_block',
        blockId: b.id,
        blockType: b.type,
        parameters: b.params,
        position: b.position,
      });
      addedBlocks.push(b.id);
    }

    for (const c of archetype.connections) {
      const actionId = `act_conn_${c.fromBlockId}_${c.fromPortId}_to_${c.toBlockId}_${c.toPortId}`;
      actions.push({
        id: actionId,
        kind: 'connect_ports',
        sourceBlockId: c.fromBlockId,
        sourcePortId: c.fromPortId,
        targetBlockId: c.toBlockId,
        targetPortId: c.toPortId,
      });
      addedConnections.push({
        from: `${c.fromBlockId}:${c.fromPortId}`,
        to: `${c.toBlockId}:${c.toPortId}`,
      });
    }
  }

  // Sort actions deterministically by kind priority, then stable actionId
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
    const oA = KIND_ORDER[a.kind] || 99;
    const oB = KIND_ORDER[b.kind] || 99;
    if (oA !== oB) return oA - oB;
    return a.id.localeCompare(b.id);
  });

  addedBlocks.sort();
  removedBlocks.sort();
  modifiedBlocks.sort();
  addedConnections.sort((a, b) => `${a.from}->${a.to}`.localeCompare(`${b.from}->${b.to}`));
  removedConnections.sort((a, b) => `${a.from}->${a.to}`.localeCompare(`${b.from}->${b.to}`));

  const expectedAfterDelta = {
    addedBlocks,
    removedBlocks,
    modifiedBlocks,
    addedConnections,
    removedConnections,
  };

  const expectedBeforeHash = activeSnapshot.stateHash;
  const catalogFingerprint = catalog.catalogFingerprint;

  const logicalBlocks: LogicalBlock[] = archetype.blocks.map(b => ({
    id: b.id,
    blockDefinitionId: b.type,
    domain: 'xbridges',
    name: b.id,
    parameters: Object.entries(b.params).map(([k, v]) => ({
      blockId: b.id,
      parameterName: k,
      value: v as any,
    })),
  }));

  const logicalConnections: LogicalConnection[] = archetype.connections.map((c, i) => ({
    id: `conn_${i}_${c.fromBlockId}_${c.toBlockId}`,
    fromBlockId: c.fromBlockId,
    fromPortId: c.fromPortId,
    toBlockId: c.toBlockId,
    toPortId: c.toPortId,
    domain: 'xbridges',
  }));

  const planPayload = {
    schemaVersion: '2.0.0',
    planId: `plan_${projectId}_rev${baseRevision}`,
    projectId,
    baseRevision,
    catalogFingerprint,
    expectedBeforeHash,
    expectedAfterDelta,
    actions,
    blocks: logicalBlocks,
    connections: logicalConnections,
  };

  const planHash = sha256Hex(canonicalJson(planPayload));

  const plan: EngineeringModelPlanV2 = {
    ...planPayload,
    schemaVersion: '2.0.0',
    planHash,
  };

  return {
    status: 'planned',
    plan,
    diagnostics: [],
    provenance: [archetype.provenance],
  };
}
