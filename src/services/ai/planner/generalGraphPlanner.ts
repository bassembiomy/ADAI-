import {
  EngineeringModelPlanV2,
  LogicalBlock,
  LogicalConnection,
  StructuredDiagnostic,
  StructuredDiagnosticSchema,
  XbridgesAction,
} from '../contracts/engineeringModel';
import { XbridgesCapabilityIndex } from '../catalog/xbridgesCapabilityIndex';
import { ModelSnapshot } from '../adapters/liveXbridgesModelAdapter';
import { GeneralEngineeringRequest } from './generalIntent';
import { parseEngineeringEntities } from './engineeringEntityParser';
import { resolveDomainOperation } from '../catalog/xbridgesDomainVocabulary';
import { validateGeneratedGraph } from './generatedGraphValidator';
import { canonicalJson, sha256Hex } from '../../../engine/opm/canonicalHash';
import type { LlmProvider } from '../../../agent/llmProvider';

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
  llm?: LlmProvider;
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
  catalog: XbridgesCapabilityIndex,
  requestInputs?: Array<{ name: string; value: unknown }>
): { blocks: InternalBlockSpec[]; connections: InternalConnSpec[]; provenance: PatternReference } | null {
  const text = `${behaviors.join(' ')} ${objective}`.toLowerCase();

  if (text.includes('impossible') || text.includes('warp') || text.includes('perpetual') || text.includes('nonexistent')) {
    return null;
  }

  // Second-Order Dynamic Systems & RLC Transfer Function
  if (
    text.includes('second_order') ||
    text.includes('second-order') ||
    text.includes('rlc') ||
    text.includes('resonant') ||
    text.includes('mass_spring') ||
    text.includes('mass-spring')
  ) {
    const srcType = catalog.blocks.has('Step') ? 'Step' : 'Constant';
    const tfType = catalog.blocks.has('TRANSFER_FUNCTION') ? 'TRANSFER_FUNCTION' : 'Integrator';
    const sinkType = catalog.blocks.has('Scope') ? 'Scope' : 'Display';

    const sourceOut = getFirstOutPort(catalog, srcType, 'out');
    const tfIn = getFirstInPort(catalog, tfType, 'u');
    const tfOut = getFirstOutPort(catalog, tfType, 'y');
    const sinkIn = getFirstInPort(catalog, sinkType, 'in1');

    let R = 10;
    let L = 0.01;
    let C = 0.0001;

    const rIn = requestInputs?.find(i => i.name.toLowerCase().includes('resist') || i.name === 'R');
    const lIn = requestInputs?.find(i => i.name.toLowerCase().includes('induct') || i.name === 'L');
    const cIn = requestInputs?.find(i => i.name.toLowerCase().includes('capacit') || i.name === 'C');

    if (rIn && typeof rIn.value === 'number') R = rIn.value;
    if (lIn && typeof lIn.value === 'number') L = lIn.value;
    if (cIn && typeof cIn.value === 'number') C = cIn.value;

    const parsed = parseEngineeringEntities(objective);
    if (parsed.resistance !== undefined && (!rIn || typeof rIn.value !== 'number')) R = parsed.resistance;
    if (parsed.inductance !== undefined && (!lIn || typeof lIn.value !== 'number')) L = parsed.inductance;
    if (parsed.capacitance !== undefined && (!cIn || typeof cIn.value !== 'number')) C = parsed.capacitance;

    const a2 = Number((L * C).toPrecision(6));
    const a1 = Number((R * C).toPrecision(6));
    const denominator = [a2, a1, 1];

    return {
      blocks: [
        { id: 'src_step', type: srcType, params: { stepTime: 0.1, initialValue: 0, finalValue: 1 }, position: { x: 100, y: 150 } },
        { id: 'plant_tf', type: tfType, params: { numerator: [1], denominator }, position: { x: 450, y: 150 } },
        { id: 'sink_scope', type: sinkType, params: {}, position: { x: 800, y: 150 } },
      ],
      connections: [
        { fromBlockId: 'src_step', fromPortId: sourceOut, toBlockId: 'plant_tf', toPortId: tfIn },
        { fromBlockId: 'plant_tf', fromPortId: tfOut, toBlockId: 'sink_scope', toPortId: sinkIn },
      ],
      provenance: { patternId: 'canonical_second_order_dynamic', version: '1.0.0', license: 'MIT' },
    };
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

    const constOut = getFirstOutPort(catalog, constType, 'out');
    const sumIn1 = 'in1';
    const sumIn2 = 'in2';
    const sumOut = getFirstOutPort(catalog, sumType, 'out');
    const pidIn = getFirstInPort(catalog, pidType, 'r');
    const pidOut = getFirstOutPort(catalog, pidType, 'u');
    const plantIn = getFirstInPort(catalog, plantType, 'u');
    const plantOut = getFirstOutPort(catalog, plantType, 'y');
    const sinkIn = getFirstInPort(catalog, sinkType, 'in1');

    return {
      blocks: [
        { id: 'setpoint', type: constType, params: { value: 10 }, position: { x: 100, y: 150 } },
        { id: 'error_sum', type: sumType, params: { signs: '+-' }, position: { x: 300, y: 150 } },
        { id: 'pid_ctrl', type: pidType, params: { Kp: 2.0, Ki: 0.5, Kd: 0.05 }, position: { x: 500, y: 150 } },
        { id: 'plant_integ', type: plantType, params: { initial_condition: 0 }, position: { x: 700, y: 150 } },
        { id: 'sink_scope', type: sinkType, params: {}, position: { x: 900, y: 150 } },
      ],
      connections: [
        { fromBlockId: 'setpoint', fromPortId: constOut, toBlockId: 'error_sum', toPortId: sumIn1 },
        { fromBlockId: 'error_sum', fromPortId: sumOut, toBlockId: 'pid_ctrl', toPortId: pidIn },
        { fromBlockId: 'pid_ctrl', fromPortId: pidOut, toBlockId: 'plant_integ', toPortId: plantIn },
        { fromBlockId: 'plant_integ', fromPortId: plantOut, toBlockId: 'sink_scope', toPortId: sinkIn },
        { fromBlockId: 'plant_integ', fromPortId: plantOut, toBlockId: 'error_sum', toPortId: sumIn2 },
      ],
      provenance: { patternId: 'canonical_closed_loop_pid', version: '1.0.0', license: 'MIT' },
    };
  }

  if (text.includes('filter') || text.includes('lowpass') || text.includes('signal_filtering')) {
    const srcType = catalog.blocks.has('WaveformGen') ? 'WaveformGen' : (catalog.blocks.has('Constant') ? 'Constant' : 'Step');
    const filterType = catalog.blocks.has('TRANSFER_FUNCTION') ? 'TRANSFER_FUNCTION' : 'Integrator';
    const sinkType = catalog.blocks.has('Scope') ? 'Scope' : 'Display';
    const sourceOut = getFirstOutPort(catalog, srcType, 'out');
    const filterIn = getFirstInPort(catalog, filterType, 'u');
    const filterOut = getFirstOutPort(catalog, filterType, 'y');
    const sinkIn = getFirstInPort(catalog, sinkType, 'in1');

    return {
      blocks: [
        { id: 'src_signal', type: srcType, params: srcType === 'WaveformGen' ? { freq: 10 } : { value: 10 }, position: { x: 100, y: 150 } },
        { id: 'filter_tf', type: filterType, params: { numerator: [1], denominator: [0.01, 1] }, position: { x: 400, y: 150 } },
        { id: 'sink_scope', type: sinkType, params: {}, position: { x: 750, y: 150 } },
      ],
      connections: [
        { fromBlockId: 'src_signal', fromPortId: sourceOut, toBlockId: 'filter_tf', toPortId: filterIn },
        { fromBlockId: 'filter_tf', fromPortId: filterOut, toBlockId: 'sink_scope', toPortId: sinkIn },
      ],
      provenance: { patternId: 'canonical_signal_filter', version: '1.0.0', license: 'MIT' },
    };
  }

  if (text.includes('motor') || text.includes('drive')) {
    const refType = catalog.blocks.has('Constant') ? 'Constant' : 'Step';
    const pwmType = catalog.blocks.has('THREE_PHASE_PWM') ? 'THREE_PHASE_PWM' : 'PWM_GENERATOR';
    const invType = catalog.blocks.has('THREE_PHASE_INVERTER') ? 'THREE_PHASE_INVERTER' : 'Gain';
    const motorType = catalog.blocks.has('AC_INDUCTION_MOTOR') ? 'AC_INDUCTION_MOTOR' : 'Integrator';
    const sinkType = catalog.blocks.has('Scope') ? 'Scope' : 'Display';

    const refOut = getFirstOutPort(catalog, refType, 'out');
    const pwmIn = getFirstInPort(catalog, pwmType, 'va_ref');
    const pwmOut = getFirstOutPort(catalog, pwmType, 'ga');
    const invIn = getFirstInPort(catalog, invType, 'ga');
    const invOut = getFirstOutPort(catalog, invType, 'va');
    const motorIn = getFirstInPort(catalog, motorType, 'va');
    const motorOut = getFirstOutPort(catalog, motorType, 'omega');
    const sinkIn = getFirstInPort(catalog, sinkType, 'in1');

    return {
      blocks: [
        { id: 'src_ref', type: refType, params: { value: 1 }, position: { x: 50, y: 150 } },
        { id: 'pwm_mod', type: pwmType, params: { frequency: 5000 }, position: { x: 250, y: 150 } },
        { id: 'inv_bridge', type: invType, params: { Ron: 0.01 }, position: { x: 450, y: 150 } },
        { id: 'motor_plant', type: motorType, params: { P: 2 }, position: { x: 680, y: 150 } },
        { id: 'sink_scope', type: sinkType, params: {}, position: { x: 920, y: 150 } },
      ],
      connections: [
        { fromBlockId: 'src_ref', fromPortId: refOut, toBlockId: 'pwm_mod', toPortId: pwmIn },
        { fromBlockId: 'pwm_mod', fromPortId: pwmOut, toBlockId: 'inv_bridge', toPortId: invIn },
        { fromBlockId: 'inv_bridge', fromPortId: invOut, toBlockId: 'motor_plant', toPortId: motorIn },
        { fromBlockId: 'motor_plant', fromPortId: motorOut, toBlockId: 'sink_scope', toPortId: sinkIn },
      ],
      provenance: { patternId: 'canonical_motor_control', version: '1.0.0', license: 'MIT' },
    };
  }

  if (text.includes('thermal') || text.includes('temperature') || text.includes('heat')) {
    const srcType = catalog.blocks.has('Constant') ? 'Constant' : 'Step';
    const plantType = catalog.blocks.has('AIR_FRYER_LEARNING_MODEL') ? 'AIR_FRYER_LEARNING_MODEL' : 'Integrator';
    const sinkType = catalog.blocks.has('Scope') ? 'Scope' : 'Display';

    const srcOut = getFirstOutPort(catalog, srcType, 'out');
    const plantIn = getFirstInPort(catalog, plantType, 'power');
    const plantOut = getFirstOutPort(catalog, plantType, 'temp_actual');
    const sinkIn = getFirstInPort(catalog, sinkType, 'in1');

    return {
      blocks: [
        { id: 'temp_setpoint', type: srcType, params: { value: 200 }, position: { x: 100, y: 150 } },
        { id: 'thermal_plant', type: plantType, params: { T_ambient: 25 }, position: { x: 450, y: 150 } },
        { id: 'sink_scope', type: sinkType, params: {}, position: { x: 800, y: 150 } },
      ],
      connections: [
        { fromBlockId: 'temp_setpoint', fromPortId: srcOut, toBlockId: 'thermal_plant', toPortId: plantIn },
        { fromBlockId: 'thermal_plant', fromPortId: plantOut, toBlockId: 'sink_scope', toPortId: sinkIn },
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

  // Dynamic Domain Semantic Operations (Multiplication, Division, Power, Addition, Subtraction, Abs, Negation)
  const domainOp = resolveDomainOperation(text, catalog);
  if (domainOp) {
    const srcType = catalog.blocks.has('Constant') ? 'Constant' : 'Step';
    const sinkType = catalog.blocks.has('Scope') ? 'Scope' : 'Display';

    const numbers = text.match(/\b\d+(?:\.\d+)?\b/g);
    let val1 = 1;
    let val2 = 1;
    if (numbers && numbers.length >= 2) {
      val1 = parseFloat(numbers[0]);
      val2 = parseFloat(numbers[1]);
    } else if (numbers && numbers.length === 1) {
      val1 = parseFloat(numbers[0]);
      val2 = parseFloat(numbers[0]);
    }

    const source1Out = getFirstOutPort(catalog, srcType, 'out');
    const sinkIn = getFirstInPort(catalog, sinkType, 'in1');

    if (domainOp.inputPorts.length >= 2) {
      const source2Out = getFirstOutPort(catalog, srcType, 'out');
      const opIn1 = domainOp.inputPorts[0] || 'in1';
      const opIn2 = domainOp.inputPorts[1] || 'in2';

      return {
        blocks: [
          { id: 'const_1', type: srcType, params: { value: val1 }, position: { x: 100, y: 100 } },
          { id: 'const_2', type: srcType, params: { value: val2 }, position: { x: 100, y: 250 } },
          { id: 'op_1', type: domainOp.blockType, params: domainOp.defaultParams || {}, position: { x: 400, y: 175 } },
          { id: 'sink_scope', type: sinkType, params: {}, position: { x: 750, y: 175 } },
        ],
        connections: [
          { fromBlockId: 'const_1', fromPortId: source1Out, toBlockId: 'op_1', toPortId: opIn1 },
          { fromBlockId: 'const_2', fromPortId: source2Out, toBlockId: 'op_1', toPortId: opIn2 },
          { fromBlockId: 'op_1', fromPortId: domainOp.outputPort, toBlockId: 'sink_scope', toPortId: sinkIn },
        ],
        provenance: { patternId: `canonical_${domainOp.operator}`, version: '1.0.0', license: 'MIT' },
      };
    } else {
      const opIn1 = domainOp.inputPorts[0] || 'in1';
      return {
        blocks: [
          { id: 'const_1', type: srcType, params: { value: val1 }, position: { x: 100, y: 150 } },
          { id: 'op_1', type: domainOp.blockType, params: domainOp.defaultParams || {}, position: { x: 400, y: 150 } },
          { id: 'sink_scope', type: sinkType, params: {}, position: { x: 750, y: 150 } },
        ],
        connections: [
          { fromBlockId: 'const_1', fromPortId: source1Out, toBlockId: 'op_1', toPortId: opIn1 },
          { fromBlockId: 'op_1', fromPortId: domainOp.outputPort, toBlockId: 'sink_scope', toPortId: sinkIn },
        ],
        provenance: { patternId: `canonical_${domainOp.operator}`, version: '1.0.0', license: 'MIT' },
      };
    }
  }

  return null;
}

export function planGeneralXbridgesModel(
  request: GeneralEngineeringRequest,
  context: PlanningContext
): PlanningOutcome {
  const { projectId, baseRevision, activeSnapshot, catalog } = context;
  const diagnostics: StructuredDiagnostic[] = [];

  // 1. Check verified patterns from context
  let patternArchetype: {
    blocks: InternalBlockSpec[];
    connections: InternalConnSpec[];
    provenance: PatternReference;
  } | null = null;

  if (context.patterns && context.patterns.length > 0) {
    const text = `${request.targetBehaviors.join(' ')} ${request.objective}`.toLowerCase();
    const rankedPatterns = [...context.patterns]
      .filter(p => {
        const blocksExist = p.templateGraph.blocks.every(b => catalog.blocks.has(b.type));
        if (!blocksExist) return false;
        return p.targetBehaviors.some(tb => text.includes(tb.toLowerCase()) || request.targetBehaviors.includes(tb));
      })
      .sort((a, b) => {
        const qA = a.qualityScore ?? 0.5;
        const qB = b.qualityScore ?? 0.5;
        if (Math.abs(qB - qA) > 1e-4) return qB - qA;
        const aMatches = a.targetBehaviors.filter(tb => request.targetBehaviors.includes(tb)).length;
        const bMatches = b.targetBehaviors.filter(tb => request.targetBehaviors.includes(tb)).length;
        if (bMatches !== aMatches) return bMatches - aMatches;
        return a.id.localeCompare(b.id);
      });

    for (const pat of rankedPatterns) {
      const validation = validateGeneratedGraph(
        pat.templateGraph.blocks,
        pat.templateGraph.connections,
        catalog
      );
      if (validation.valid) {
        patternArchetype = {
          blocks: pat.templateGraph.blocks.map((b, i) => ({
            id: b.id || `b_${i + 1}`,
            type: b.type,
            params: b.params || {},
            position: b.position || { x: 100 + i * 250, y: 150 },
          })),
          connections: pat.templateGraph.connections,
          provenance: pat.provenance,
        };
        break;
      }
    }
  }

  // Fallback to canonical archetypes
  const archetype = patternArchetype || getCanonicalArchetype(request.targetBehaviors, request.objective, catalog, request.inputs);

  if (!archetype) {
    diagnostics.push(
      StructuredDiagnosticSchema.parse({
        category: 'ENGINEERING',
        code: 'UNSUPPORTED_ENGINEERING_REQUEST',
        severity: 'ERROR',
        message: `The requested engineering objective "${request.objective}" cannot be realized by active X-Bridges catalog capabilities. Missing recognized target behaviors or component specifications.`,
        remediation: 'Specify explicit target behaviors (e.g. feedback control, signal filtering, arithmetic operations) or required input and output signals.',
      })
    );
    return {
      status: 'refused',
      diagnostics,
      provenance: [],
    };
  }

  // Comprehensive capability and structural validation of generated graph
  const requireObservableSink = request.outputs?.some(o =>
    /scope|display|sink|result|monitored/i.test(String(o.value || o.name || ''))
  ) ?? false;

  const validation = validateGeneratedGraph(
    archetype.blocks,
    archetype.connections,
    catalog,
    { requireObservableSink }
  );

  if (!validation.valid) {
    diagnostics.push(...validation.diagnostics);
    return {
      status: 'refused',
      diagnostics,
      provenance: [archetype.provenance],
    };
  }

  // 2. Synthesize Graph & Diff against activeSnapshot
  const existingNodeMap = new Map<string, any>();
  for (const n of activeSnapshot.nodes) {
    const bId = String(n.data?.blockId || n.id);
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
        n => String(n.data?.blockType || '').toLowerCase() === inp.name.toLowerCase() ||
             String(n.data?.label || '').toLowerCase() === inp.name.toLowerCase()
      );
      if (targetNode) {
        const bId = String(targetNode.data?.blockId || targetNode.id);
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

/**
 * Asynchronous graph planner that uses zero-shot LLM catalog synthesis when
 * no deterministic canonical pattern or semantic operation matches.
 */
export async function planGeneralXbridgesModelAsync(
  request: GeneralEngineeringRequest,
  context: PlanningContext
): Promise<PlanningOutcome> {
  const syncOutcome = planGeneralXbridgesModel(request, context);
  const isUnsupported =
    syncOutcome.status === 'refused' &&
    syncOutcome.diagnostics.some(d => d.code === 'UNSUPPORTED_ENGINEERING_REQUEST');

  if (!isUnsupported || !context.llm) {
    return syncOutcome;
  }

  try {
    const sortedBlocks = Array.from(context.catalog.blocks.values()).sort((a, b) => a.id.localeCompare(b.id));
    const catalogSummary = sortedBlocks
      .map(b => {
        const ins = b.inputs.map(i => i.id).join(', ');
        const outs = b.outputs.map(o => o.id).join(', ');
        const params = b.parameterNames.join(', ');
        return `- ${b.id}: inputs=[${ins}], outputs=[${outs}], params=[${params}]`;
      })
      .join('\n');

    const prompt = {
      prompt: `Synthesize a valid X-Bridges block diagram for: "${request.objective}". Available blocks:\n${catalogSummary}`
    };

    const res = await context.llm.generate<{
      blocks: Array<{ id: string; type: string; params?: Record<string, unknown>; position?: { x: number; y: number } }>;
      connections: Array<{ fromBlockId: string; fromPortId: string; toBlockId: string; toPortId: string }>;
    }>(prompt, { type: 'object' });

    if (!res.success || !res.data || !Array.isArray(res.data.blocks) || res.data.blocks.length === 0) {
      return {
        status: 'refused',
        diagnostics: [
          StructuredDiagnosticSchema.parse({
            category: 'SCHEMA',
            code: 'LLM_GRAPH_INVALID',
            severity: 'ERROR',
            message: `LLM graph synthesis failed: ${res.error || 'Empty or invalid graph structure returned.'}`,
            remediation: 'Provide clearer engineering requirements or verify LLM service availability.',
          }),
        ],
        provenance: [],
      };
    }

    const rawBlocks = res.data.blocks;
    const rawConns = res.data.connections || [];

    // Validate and bound each generated block, connection, parameter object, and position
    const boundedBlocks: InternalBlockSpec[] = [];
    for (let i = 0; i < rawBlocks.length; i++) {
      const b = rawBlocks[i];
      if (!b || typeof b !== 'object' || !b.type) {
        return {
          status: 'refused',
          diagnostics: [
            StructuredDiagnosticSchema.parse({
              category: 'SCHEMA',
              code: 'LLM_GRAPH_INVALID',
              severity: 'ERROR',
              message: `LLM block at index ${i} is malformed or missing type.`,
            }),
          ],
          provenance: [],
        };
      }

      const posX = typeof b.position?.x === 'number' && Number.isFinite(b.position.x)
        ? Math.max(0, Math.min(10000, b.position.x))
        : 100 + i * 250;
      const posY = typeof b.position?.y === 'number' && Number.isFinite(b.position.y)
        ? Math.max(0, Math.min(10000, b.position.y))
        : 150;

      boundedBlocks.push({
        id: String(b.id || `b_${i + 1}`),
        type: String(b.type),
        params: (b.params && typeof b.params === 'object' && !Array.isArray(b.params)) ? { ...b.params } : {},
        position: { x: posX, y: posY },
      });
    }

    const boundedConns: InternalConnSpec[] = [];
    for (const c of rawConns) {
      if (!c || typeof c !== 'object') continue;
      boundedConns.push({
        fromBlockId: String(c.fromBlockId || ''),
        fromPortId: String(c.fromPortId || ''),
        toBlockId: String(c.toBlockId || ''),
        toPortId: String(c.toPortId || ''),
      });
    }

    const requireObservableSink = request.outputs?.some(o =>
      /scope|display|sink|result|monitored/i.test(String(o.value || o.name || ''))
    ) ?? false;

    const validation = validateGeneratedGraph(
      boundedBlocks,
      boundedConns,
      context.catalog,
      {
        maxBlocks: 50,
        maxConnections: 100,
        requireObservableSink,
      }
    );

    if (!validation.valid) {
      return {
        status: 'refused',
        diagnostics: [
          StructuredDiagnosticSchema.parse({
            category: 'SCHEMA',
            code: 'LLM_GRAPH_INVALID',
            severity: 'ERROR',
            message: 'Synthesized LLM graph failed safety and structural validation.',
            remediation: 'Refine request or provide clearer domain constraints.',
          }),
          ...validation.diagnostics,
        ],
        provenance: [],
      };
    }

    const archetype = {
      blocks: boundedBlocks,
      connections: boundedConns,
      provenance: { patternId: 'llm_catalog_synthesized', version: '1.0.0' },
    };

        const { projectId, baseRevision, activeSnapshot, catalog } = context;
        const actions: XbridgesAction[] = [
          ...archetype.blocks.map(b => ({
            id: `act_${b.id}`,
            kind: 'add_block' as const,
            blockId: b.id,
            blockType: b.type,
            parameters: b.params,
          })),
          ...archetype.connections.map((c, i) => ({
            id: `act_conn_${i}_${c.fromBlockId}_${c.toBlockId}`,
            kind: 'connect_ports' as const,
            sourceBlockId: c.fromBlockId,
            sourcePortId: c.fromPortId,
            targetBlockId: c.toBlockId,
            targetPortId: c.toPortId,
          })),
        ];

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
          schemaVersion: '2.0.0' as const,
          planId: `plan_${projectId}_rev${baseRevision}`,
          projectId,
          baseRevision,
          catalogFingerprint: catalog.catalogFingerprint,
          expectedBeforeHash: activeSnapshot.stateHash,
          expectedAfterDelta: {
            addedBlocks: archetype.blocks.map(b => b.id),
            removedBlocks: [],
            modifiedBlocks: [],
            addedConnections: archetype.connections.map(c => ({ from: c.fromBlockId, to: c.toBlockId })),
            removedConnections: [],
          },
          actions,
          blocks: logicalBlocks,
          connections: logicalConnections,
        };

        const planHash = sha256Hex(canonicalJson(planPayload));
        return {
          status: 'planned',
          plan: { ...planPayload, planHash },
          diagnostics: [],
          provenance: [archetype.provenance],
      };
  } catch (err: any) {
    return {
      status: 'refused',
      diagnostics: [
        StructuredDiagnosticSchema.parse({
          category: 'SCHEMA',
          code: 'LLM_GRAPH_INVALID',
          severity: 'ERROR',
          message: `Zero-shot LLM graph synthesis threw an error: ${err?.message || String(err)}`,
        }),
      ],
      provenance: [],
    };
  }

  return syncOutcome;
}
