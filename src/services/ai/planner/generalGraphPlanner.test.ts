import { describe, it, expect, vi } from 'vitest';
import {
  planGeneralXbridgesModel,
  planGeneralXbridgesModelAsync,
  type PlanningContext,
  type PlanningOutcome,
} from './generalGraphPlanner';
import type { LlmProvider } from '../../../agent/llmProvider';
import { buildXbridgesCapabilityIndex } from '../catalog/xbridgesCapabilityIndex';
import { canonicalJson } from '../../../engine/opm/canonicalHash';
import type { ModelSnapshot } from '../adapters/liveXbridgesModelAdapter';
import type { GeneralEngineeringRequest } from './generalIntent';
import { proveXbridgesPlan } from '../proof/xbridgesProofRunner';

function createEmptySnapshot(projectId: string = 'proj_test'): ModelSnapshot {
  return {
    projectId,
    revision: 1,
    nodes: [],
    edges: [],
    stateHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    timestamp: Date.now(),
  };
}

describe('generalGraphPlanner (Deterministic General Graph Planner)', () => {
  const catalog = buildXbridgesCapabilityIndex();

  describe('Corpus Domain Plans & Action Generation', () => {
    it('synthesizes a deterministic step-integrator-scope graph', () => {
      const request: GeneralEngineeringRequest = {
        intent: 'create',
        objective: 'Create a model that integrates a step input and displays the result on a Scope',
        targetBehaviors: ['integration'],
        inputs: [{ name: 'Step', value: 1 }],
        outputs: [{ name: 'Scope', value: 'display' }],
        constraints: [],
      };
      const context: PlanningContext = {
        projectId: 'proj_integrator',
        baseRevision: 1,
        activeSnapshot: createEmptySnapshot('proj_integrator'),
        catalog,
        patterns: [],
      };

      const outcome = planGeneralXbridgesModel(request, context);
      expect(outcome.status).toBe('planned');
      expect(outcome.plan?.blocks.map(block => block.blockDefinitionId)).toEqual(['Step', 'Integrator', 'Scope']);
      expect(outcome.plan?.connections).toHaveLength(2);
    });

    it('synthesizes a feed-forward control graph plan', () => {
      const request: GeneralEngineeringRequest = {
        intent: 'create',
        objective: 'Feed-forward open loop control',
        targetBehaviors: ['feed_forward', 'open_loop'],
        inputs: [{ name: 'Step', value: 1 }],
        outputs: [{ name: 'Scope', value: 'monitored' }],
        constraints: [],
      };
      const context: PlanningContext = {
        projectId: 'proj_ff',
        baseRevision: 1,
        activeSnapshot: createEmptySnapshot('proj_ff'),
        catalog,
        patterns: [],
      };

      const outcome = planGeneralXbridgesModel(request, context);
      expect(outcome.status).toBe('planned');
      expect(outcome.plan).toBeDefined();
      expect(outcome.plan?.actions.length).toBeGreaterThan(0);
      expect(outcome.plan?.actions.some(a => a.kind === 'add_block')).toBe(true);
      expect(outcome.plan?.actions.some(a => a.kind === 'connect_ports')).toBe(true);
      expect(outcome.plan?.catalogFingerprint).toBe(catalog.catalogFingerprint);
      expect(outcome.plan?.expectedBeforeHash).toBe(context.activeSnapshot.stateHash);
    });

    it('synthesizes a closed-loop PID control graph plan', () => {
      const request: GeneralEngineeringRequest = {
        intent: 'create',
        objective: 'Closed-loop PID position control with feedback',
        targetBehaviors: ['closed_loop', 'pid_control'],
        inputs: [{ name: 'Constant', value: 10 }],
        outputs: [{ name: 'Scope', value: 'monitored' }],
        constraints: [],
      };
      const context: PlanningContext = {
        projectId: 'proj_pid',
        baseRevision: 1,
        activeSnapshot: createEmptySnapshot('proj_pid'),
        catalog,
        patterns: [],
      };

      const outcome = planGeneralXbridgesModel(request, context);
      expect(outcome.status).toBe('planned');
      expect(outcome.plan?.actions.some(a => a.kind === 'add_block' && a.blockType === 'PID_CONTROLLER')).toBe(true);
    });

    it('synthesizes a signal filtering graph plan', () => {
      const request: GeneralEngineeringRequest = {
        intent: 'create',
        objective: 'Noise filtering with lowpass filter',
        targetBehaviors: ['signal_filtering', 'lowpass'],
        inputs: [{ name: 'Sine', value: 1 }],
        outputs: [{ name: 'Scope', value: 'monitored' }],
        constraints: [],
      };
      const context: PlanningContext = {
        projectId: 'proj_filter',
        baseRevision: 1,
        activeSnapshot: createEmptySnapshot('proj_filter'),
        catalog,
        patterns: [],
      };

      const outcome = planGeneralXbridgesModel(request, context);
      expect(outcome.status).toBe('planned');
      expect(outcome.plan?.actions.some(a => a.kind === 'add_block')).toBe(true);
    });

    it('synthesizes a motor control graph plan', () => {
      const request: GeneralEngineeringRequest = {
        intent: 'create',
        objective: 'Induction motor drive control',
        targetBehaviors: ['motor_control'],
        inputs: [{ name: 'source_voltage', value: 400, unit: 'V' }],
        outputs: [{ name: 'load_specification', value: 'AC_INDUCTION_MOTOR' }],
        constraints: [],
      };
      const context: PlanningContext = {
        projectId: 'proj_motor',
        baseRevision: 1,
        activeSnapshot: createEmptySnapshot('proj_motor'),
        catalog,
        patterns: [],
      };

      const outcome = planGeneralXbridgesModel(request, context);
      expect(outcome.status).toBe('planned');
      expect(outcome.plan?.actions.some(a => a.kind === 'add_block')).toBe(true);
    });

    it('synthesizes a thermal monitoring graph plan', () => {
      const request: GeneralEngineeringRequest = {
        intent: 'create',
        objective: 'Thermal chamber monitoring and over-temperature detection',
        targetBehaviors: ['thermal_monitoring'],
        inputs: [{ name: 'Constant', value: 200, unit: '°C' }],
        outputs: [{ name: 'Scope', value: 'monitored' }],
        constraints: [],
      };
      const context: PlanningContext = {
        projectId: 'proj_thermal',
        baseRevision: 1,
        activeSnapshot: createEmptySnapshot('proj_thermal'),
        catalog,
        patterns: [],
      };

      const outcome = planGeneralXbridgesModel(request, context);
      expect(outcome.status).toBe('planned');
      expect(outcome.plan?.actions.length).toBeGreaterThan(0);
    });

    it('synthesizes a logical sequencing graph plan', () => {
      const request: GeneralEngineeringRequest = {
        intent: 'create',
        objective: 'Logical safety interlocking and state sequencing',
        targetBehaviors: ['logical_sequencing'],
        inputs: [{ name: 'Constant', value: 1 }],
        outputs: [{ name: 'Scope', value: 'monitored' }],
        constraints: [],
      };
      const context: PlanningContext = {
        projectId: 'proj_logic',
        baseRevision: 1,
        activeSnapshot: createEmptySnapshot('proj_logic'),
        catalog,
        patterns: [],
      };

      const outcome = planGeneralXbridgesModel(request, context);
      expect(outcome.status).toBe('planned');
      expect(outcome.plan?.actions.some(a => a.kind === 'add_block')).toBe(true);
    });

    it('synthesizes an arithmetic model adding two constants and displaying on scope', () => {
      const request: GeneralEngineeringRequest = {
        intent: 'create',
        objective: 'make a model add two cnstant each is 1 and display the result on a scope',
        targetBehaviors: ['xbridges_vectoradd'],
        inputs: [],
        outputs: [],
        constraints: [],
      };
      const context: PlanningContext = {
        projectId: 'proj_add',
        baseRevision: 1,
        activeSnapshot: createEmptySnapshot('proj_add'),
        catalog,
        patterns: [],
      };

      const outcome = planGeneralXbridgesModel(request, context);
      expect(outcome.status).toBe('planned');
      expect(outcome.plan?.blocks).toHaveLength(4);
      expect(outcome.plan?.connections).toHaveLength(3);
      const constantBlocks = outcome.plan?.blocks.filter(b => b.blockDefinitionId === 'Constant');
      expect(constantBlocks).toHaveLength(2);
      expect(outcome.plan?.blocks.some(b => b.blockDefinitionId === 'Sum')).toBe(true);
      expect(outcome.plan?.blocks.some(b => b.blockDefinitionId === 'Scope')).toBe(true);
    });

    it('synthesizes multiplication of constant 10 by 100 on scope', () => {
      const request: GeneralEngineeringRequest = {
        intent: 'create',
        objective: 'make a model multiply constant its value is 10 by 100 and display the result on a scope',
        targetBehaviors: [],
        inputs: [],
        outputs: [],
        constraints: [],
      };
      const context: PlanningContext = {
        projectId: 'proj_mul',
        baseRevision: 1,
        activeSnapshot: createEmptySnapshot('proj_mul'),
        catalog,
        patterns: [],
      };

      const outcome = planGeneralXbridgesModel(request, context);
      expect(outcome.status).toBe('planned');
      expect(outcome.plan?.blocks).toHaveLength(4);
      expect(outcome.plan?.connections).toHaveLength(3);
      const consts = outcome.plan?.blocks.filter(b => b.blockDefinitionId === 'Constant');
      expect(consts).toHaveLength(2);
      expect(outcome.plan?.blocks.some(b => b.blockDefinitionId === 'VectorMul')).toBe(true);
      expect(outcome.plan?.blocks.some(b => b.blockDefinitionId === 'Scope')).toBe(true);
    });

    it('synthesizes division of constant 100 by 5 on scope', () => {
      const request: GeneralEngineeringRequest = {
        intent: 'create',
        objective: 'divide constant 100 by 5 and display on scope',
        targetBehaviors: [],
        inputs: [],
        outputs: [],
        constraints: [],
      };
      const context: PlanningContext = {
        projectId: 'proj_div',
        baseRevision: 1,
        activeSnapshot: createEmptySnapshot('proj_div'),
        catalog,
        patterns: [],
      };

      const outcome = planGeneralXbridgesModel(request, context);
      expect(outcome.status).toBe('planned');
      expect(outcome.plan?.blocks.some(b => b.blockDefinitionId === 'VectorDiv')).toBe(true);
      expect(outcome.plan?.blocks.some(b => b.blockDefinitionId === 'Scope')).toBe(true);
    });

    it('synthesizes power operation of constant 2 by 3 on scope', () => {
      const request: GeneralEngineeringRequest = {
        intent: 'create',
        objective: 'power of constant 2 to 3 and show on scope',
        targetBehaviors: [],
        inputs: [],
        outputs: [],
        constraints: [],
      };
      const context: PlanningContext = {
        projectId: 'proj_pow',
        baseRevision: 1,
        activeSnapshot: createEmptySnapshot('proj_pow'),
        catalog,
        patterns: [],
      };

      const outcome = planGeneralXbridgesModel(request, context);
      expect(outcome.status).toBe('planned');
      expect(outcome.plan?.blocks.some(b => b.blockDefinitionId === 'VectorPow')).toBe(true);
      expect(outcome.plan?.blocks.some(b => b.blockDefinitionId === 'Scope')).toBe(true);
    });

    it('uses zero-shot LLM catalog synthesis when available for custom systems', async () => {
      const mockLlm: LlmProvider = {
        generate: vi.fn().mockResolvedValue({
          success: true,
          data: {
            blocks: [
              { id: 'b_wave', type: 'WaveformGen', params: { freq: 5 }, position: { x: 100, y: 150 } },
              { id: 'b_sat', type: 'SATURATION', params: { upperLimit: 1, lowerLimit: -1 }, position: { x: 450, y: 150 } },
              { id: 'b_scope', type: 'Scope', params: {}, position: { x: 800, y: 150 } },
            ],
            connections: [
              { fromBlockId: 'b_wave', fromPortId: 'out', toBlockId: 'b_sat', toPortId: 'u' },
              { fromBlockId: 'b_sat', fromPortId: 'y', toBlockId: 'b_scope', toPortId: 'in1' },
            ],
          },
        }),
        health: vi.fn().mockResolvedValue({ status: 'healthy', provider: 'test', latencyMs: 1 }),
      };

      const request: GeneralEngineeringRequest = {
        intent: 'create',
        objective: 'Custom saturated wave generator pipeline with Scope',
        targetBehaviors: [],
        inputs: [],
        outputs: [],
        constraints: [],
      };
      const context: PlanningContext = {
        projectId: 'proj_llm',
        baseRevision: 1,
        activeSnapshot: createEmptySnapshot('proj_llm'),
        catalog,
        patterns: [],
        llm: mockLlm,
      };

      const outcome = await planGeneralXbridgesModelAsync(request, context);
      expect(outcome.status).toBe('planned');
      expect(outcome.plan?.blocks).toHaveLength(3);
      expect(outcome.plan?.blocks.some(b => b.blockDefinitionId === 'SATURATION')).toBe(true);
      expect(outcome.provenance.some(p => p.patternId === 'llm_catalog_synthesized')).toBe(true);
    });
  });

  describe('Modification Diffing & Refusal Handling', () => {
    it('synthesizes minimal diff actions when modifying an existing graph', () => {
      const activeSnapshot: ModelSnapshot = {
        projectId: 'proj_mod',
        revision: 2,
        nodes: [
          {
            id: 'node_1',
            type: 'xbridgesBlock',
            position: { x: 100, y: 100 },
            data: {
              blockId: 'src_1',
              blockType: 'Constant',
              label: 'Constant',
              parameters: { value: 5 },
            },
          },
          {
            id: 'node_2',
            type: 'xbridgesBlock',
            position: { x: 400, y: 100 },
            data: {
              blockId: 'sink_1',
              blockType: 'Scope',
              label: 'Scope',
              parameters: {},
            },
          },
        ],
        edges: [
          {
            id: 'edge_1',
            source: 'node_1',
            sourceHandle: 'out',
            target: 'node_2',
            targetHandle: 'in1',
          },
        ],
        stateHash: 'mod_base_hash_123',
        timestamp: Date.now(),
      };

      const request: GeneralEngineeringRequest = {
        intent: 'modify',
        objective: 'Update constant source value to 10 and add gain stage',
        targetBehaviors: ['gain_stage'],
        inputs: [{ name: 'Constant', value: 10 }],
        outputs: [],
        constraints: [],
      };

      const context: PlanningContext = {
        projectId: 'proj_mod',
        baseRevision: 2,
        activeSnapshot,
        catalog,
        patterns: [],
      };

      const outcome = planGeneralXbridgesModel(request, context);
      expect(outcome.status).toBe('planned');
      expect(outcome.plan).toBeDefined();

      const actions = outcome.plan!.actions;
      // Should modify existing constant parameter
      expect(actions.some(a => a.kind === 'set_parameter' && a.blockId === 'src_1')).toBe(true);
    });

    it('refuses impossible requests that require non-existent block types or invalid physics', () => {
      const impossibleReq: GeneralEngineeringRequest = {
        intent: 'create',
        objective: 'Perpetual motion free energy generator with warp drive',
        targetBehaviors: ['impossible_warp_physics', 'nonexistent_magic_block'],
        inputs: [],
        outputs: [],
        constraints: [],
      };
      const context: PlanningContext = {
        projectId: 'proj_impossible',
        baseRevision: 1,
        activeSnapshot: createEmptySnapshot('proj_impossible'),
        catalog,
        patterns: [],
      };

      const outcome = planGeneralXbridgesModel(impossibleReq, context);
      expect(outcome.status).toBe('refused');
      expect(outcome.plan).toBeUndefined();
      expect(outcome.diagnostics.length).toBeGreaterThan(0);
      expect(outcome.diagnostics.some(d => d.severity === 'ERROR')).toBe(true);
    });

    it('synthesizes a 2nd-order dynamic RLC transfer function model with Step source and Scope sink', () => {
      const request: GeneralEngineeringRequest = {
        intent: 'create',
        objective: 'create rlc circuit transfer function with R=10, L=0.01, C=0.0001',
        targetBehaviors: ['second_order_dynamic', 'transfer_function'],
        inputs: [
          { name: 'resistance', value: 10 },
          { name: 'inductance', value: 0.01 },
          { name: 'capacitance', value: 0.0001 },
        ],
        outputs: [{ name: 'output_signal', value: 'Scope' }],
        constraints: [],
      };
      const context: PlanningContext = {
        projectId: 'proj_rlc',
        baseRevision: 1,
        activeSnapshot: createEmptySnapshot('proj_rlc'),
        catalog,
        patterns: [],
      };

      const outcome = planGeneralXbridgesModel(request, context);
      expect(outcome.status).toBe('planned');
      expect(outcome.plan).toBeDefined();
      expect(outcome.plan?.blocks.some(b => b.blockDefinitionId === 'TRANSFER_FUNCTION')).toBe(true);
      expect(outcome.plan?.blocks.some(b => b.blockDefinitionId === 'Scope')).toBe(true);

      const tfBlock = outcome.plan?.blocks.find(b => b.blockDefinitionId === 'TRANSFER_FUNCTION');
      expect(tfBlock).toBeDefined();
      const denParam = tfBlock?.parameters?.find(p => p.parameterName === 'denominator');
      expect(denParam).toBeDefined();
      expect(denParam?.value).toEqual([1e-6, 0.001, 1]);
    });
  });

  describe('Byte-identical Canonical Determinism', () => {
    it('produces byte-identical canonical JSON and planHash on identical repeated runs', () => {
      const request: GeneralEngineeringRequest = {
        intent: 'create',
        objective: 'Closed-loop PID position control with feedback',
        targetBehaviors: ['closed_loop', 'pid_control'],
        inputs: [{ name: 'Constant', value: 10 }],
        outputs: [{ name: 'Scope', value: 'monitored' }],
        constraints: [],
      };
      const context: PlanningContext = {
        projectId: 'proj_determ',
        baseRevision: 1,
        activeSnapshot: createEmptySnapshot('proj_determ'),
        catalog,
        patterns: [],
      };

      const run1 = planGeneralXbridgesModel(request, context);
      const run2 = planGeneralXbridgesModel(request, context);

      expect(run1.status).toBe('planned');
      expect(run2.status).toBe('planned');
      expect(run1.plan?.planHash).toEqual(run2.plan?.planHash);
      expect(canonicalJson(run1.plan)).toEqual(canonicalJson(run2.plan));
    });
  });

  describe('Deterministic Graph Safety Validation', () => {
    it('refuses deterministic plan when catalog port definition is mutated/invalid', () => {
      // Create a mutated catalog where Scope has no inputs
      const mutatedBlocks = new Map(catalog.blocks);
      const originalScope = catalog.blocks.get('Scope')!;
      mutatedBlocks.set('Scope', {
        ...originalScope,
        inputs: [], // removed inputs
        ports: originalScope.outputs,
      });
      const mutatedCatalog = {
        ...catalog,
        blocks: mutatedBlocks,
      };

      const request: GeneralEngineeringRequest = {
        intent: 'create',
        objective: 'multiply constant its value is 10 by 100 and display the result on a scope',
        targetBehaviors: ['multiply'],
        inputs: [{ name: 'input1', value: 10 }, { name: 'input2', value: 100 }],
        outputs: [{ name: 'result', value: 'Scope' }],
        constraints: [],
      };
      const context: PlanningContext = {
        projectId: 'proj_mutated',
        baseRevision: 1,
        activeSnapshot: createEmptySnapshot('proj_mutated'),
        catalog: mutatedCatalog,
        patterns: [],
      };

      const outcome = planGeneralXbridgesModel(request, context);
      expect(outcome.status).toBe('refused');
      expect(outcome.plan).toBeUndefined();
      expect(outcome.diagnostics.some(d => d.code === 'UNKNOWN_TARGET_PORT')).toBe(true);
    });
  });

  describe('Zero-Shot LLM Synthesis Safety Gate', () => {
    const baseRequest: GeneralEngineeringRequest = {
      intent: 'create',
      objective: 'Custom novel system requiring LLM synthesis',
      targetBehaviors: [],
      inputs: [],
      outputs: [{ name: 'result', value: 'Scope' }],
      constraints: [],
    };

    it('refuses LLM output with unknown ports', async () => {
      const mockLlm: LlmProvider = {
        generate: vi.fn().mockResolvedValue({
          success: true,
          data: {
            blocks: [
              { id: 'b_wave', type: 'WaveformGen', params: { freq: 5 }, position: { x: 100, y: 150 } },
              { id: 'b_scope', type: 'Scope', params: {}, position: { x: 800, y: 150 } },
            ],
            connections: [
              { fromBlockId: 'b_wave', fromPortId: 'invalid_source_port', toBlockId: 'b_scope', toPortId: 'in1' },
            ],
          },
        }),
        health: vi.fn().mockResolvedValue({ status: 'healthy', provider: 'test', latencyMs: 1 }),
      };

      const context: PlanningContext = {
        projectId: 'proj_llm_ports',
        baseRevision: 1,
        activeSnapshot: createEmptySnapshot('proj_llm_ports'),
        catalog,
        patterns: [],
        llm: mockLlm,
      };

      const outcome = await planGeneralXbridgesModelAsync(baseRequest, context);
      expect(outcome.status).toBe('refused');
      expect(outcome.plan).toBeUndefined();
      expect(outcome.diagnostics.some(d => d.code === 'LLM_GRAPH_INVALID')).toBe(true);
      expect(outcome.diagnostics.some(d => d.code === 'UNKNOWN_SOURCE_PORT')).toBe(true);
    });

    it('refuses LLM output with duplicate IDs', async () => {
      const mockLlm: LlmProvider = {
        generate: vi.fn().mockResolvedValue({
          success: true,
          data: {
            blocks: [
              { id: 'dup_id', type: 'WaveformGen', params: {}, position: { x: 100, y: 150 } },
              { id: 'dup_id', type: 'Scope', params: {}, position: { x: 800, y: 150 } },
            ],
            connections: [
              { fromBlockId: 'dup_id', fromPortId: 'out', toBlockId: 'dup_id', toPortId: 'in1' },
            ],
          },
        }),
        health: vi.fn().mockResolvedValue({ status: 'healthy', provider: 'test', latencyMs: 1 }),
      };

      const context: PlanningContext = {
        projectId: 'proj_llm_dup',
        baseRevision: 1,
        activeSnapshot: createEmptySnapshot('proj_llm_dup'),
        catalog,
        patterns: [],
        llm: mockLlm,
      };

      const outcome = await planGeneralXbridgesModelAsync(baseRequest, context);
      expect(outcome.status).toBe('refused');
      expect(outcome.plan).toBeUndefined();
      expect(outcome.diagnostics.some(d => d.code === 'LLM_GRAPH_INVALID')).toBe(true);
      expect(outcome.diagnostics.some(d => d.code === 'DUPLICATE_BLOCK_ID')).toBe(true);
    });

    it('refuses LLM output with dangling connections', async () => {
      const mockLlm: LlmProvider = {
        generate: vi.fn().mockResolvedValue({
          success: true,
          data: {
            blocks: [
              { id: 'b_wave', type: 'WaveformGen', params: {}, position: { x: 100, y: 150 } },
              { id: 'b_scope', type: 'Scope', params: {}, position: { x: 800, y: 150 } },
            ],
            connections: [
              { fromBlockId: 'b_wave', fromPortId: 'out', toBlockId: 'phantom_target', toPortId: 'in1' },
            ],
          },
        }),
        health: vi.fn().mockResolvedValue({ status: 'healthy', provider: 'test', latencyMs: 1 }),
      };

      const context: PlanningContext = {
        projectId: 'proj_llm_dangle',
        baseRevision: 1,
        activeSnapshot: createEmptySnapshot('proj_llm_dangle'),
        catalog,
        patterns: [],
        llm: mockLlm,
      };

      const outcome = await planGeneralXbridgesModelAsync(baseRequest, context);
      expect(outcome.status).toBe('refused');
      expect(outcome.plan).toBeUndefined();
      expect(outcome.diagnostics.some(d => d.code === 'LLM_GRAPH_INVALID')).toBe(true);
      expect(outcome.diagnostics.some(d => d.code === 'DANGLING_CONNECTION')).toBe(true);
    });

    it('refuses LLM output with invalid parameters', async () => {
      const mockLlm: LlmProvider = {
        generate: vi.fn().mockResolvedValue({
          success: true,
          data: {
            blocks: [
              { id: 'b_wave', type: 'WaveformGen', params: { freq: NaN }, position: { x: 100, y: 150 } },
              { id: 'b_scope', type: 'Scope', params: {}, position: { x: 800, y: 150 } },
            ],
            connections: [
              { fromBlockId: 'b_wave', fromPortId: 'out', toBlockId: 'b_scope', toPortId: 'in1' },
            ],
          },
        }),
        health: vi.fn().mockResolvedValue({ status: 'healthy', provider: 'test', latencyMs: 1 }),
      };

      const context: PlanningContext = {
        projectId: 'proj_llm_params',
        baseRevision: 1,
        activeSnapshot: createEmptySnapshot('proj_llm_params'),
        catalog,
        patterns: [],
        llm: mockLlm,
      };

      const outcome = await planGeneralXbridgesModelAsync(baseRequest, context);
      expect(outcome.status).toBe('refused');
      expect(outcome.plan).toBeUndefined();
      expect(outcome.diagnostics.some(d => d.code === 'LLM_GRAPH_INVALID')).toBe(true);
      expect(outcome.diagnostics.some(d => d.code === 'INVALID_PARAMETER')).toBe(true);
    });

    it('refuses oversized LLM output', async () => {
      const oversizedBlocks = Array.from({ length: 60 }, (_, i) => ({
        id: `b_${i}`,
        type: 'Constant',
        params: { value: i },
        position: { x: i * 50, y: 100 },
      }));

      const mockLlm: LlmProvider = {
        generate: vi.fn().mockResolvedValue({
          success: true,
          data: {
            blocks: oversizedBlocks,
            connections: [],
          },
        }),
        health: vi.fn().mockResolvedValue({ status: 'healthy', provider: 'test', latencyMs: 1 }),
      };

      const context: PlanningContext = {
        projectId: 'proj_llm_oversized',
        baseRevision: 1,
        activeSnapshot: createEmptySnapshot('proj_llm_oversized'),
        catalog,
        patterns: [],
        llm: mockLlm,
      };

      const outcome = await planGeneralXbridgesModelAsync(baseRequest, context);
      expect(outcome.status).toBe('refused');
      expect(outcome.plan).toBeUndefined();
      expect(outcome.diagnostics.some(d => d.code === 'LLM_GRAPH_INVALID')).toBe(true);
      expect(outcome.diagnostics.some(d => d.code === 'EXCEEDS_MAX_BLOCKS')).toBe(true);
    });

    it('refuses malformed or empty LLM output', async () => {
      const mockLlm: LlmProvider = {
        generate: vi.fn().mockResolvedValue({
          success: false,
          error: 'LLM generated malformed json',
        }),
        health: vi.fn().mockResolvedValue({ status: 'healthy', provider: 'test', latencyMs: 1 }),
      };

      const context: PlanningContext = {
        projectId: 'proj_llm_malformed',
        baseRevision: 1,
        activeSnapshot: createEmptySnapshot('proj_llm_malformed'),
        catalog,
        patterns: [],
        llm: mockLlm,
      };

      const outcome = await planGeneralXbridgesModelAsync(baseRequest, context);
      expect(outcome.status).toBe('refused');
      expect(outcome.plan).toBeUndefined();
      expect(outcome.diagnostics.some(d => d.code === 'LLM_GRAPH_INVALID')).toBe(true);
    });
  });

  describe('Unsupported Request Refusal (No Silent Generic Fallback)', () => {
    it('refuses unrecognized requests without generating canonical_generic_model or actions', () => {
      const request: GeneralEngineeringRequest = {
        intent: 'create',
        objective: 'Completely ambiguous or unsupported request without recognized engineering behavior',
        targetBehaviors: ['unknown_behavior_xyz'],
        inputs: [],
        outputs: [],
        constraints: [],
      };
      const context: PlanningContext = {
        projectId: 'proj_unrecognized',
        baseRevision: 1,
        activeSnapshot: createEmptySnapshot('proj_unrecognized'),
        catalog,
        patterns: [],
      };

      const outcome = planGeneralXbridgesModel(request, context);
      expect(outcome.status).toBe('refused');
      expect(outcome.plan).toBeUndefined();
      expect(outcome.provenance.some(p => p.patternId === 'canonical_generic_model')).toBe(false);
      expect(outcome.diagnostics.some(d => d.code === 'UNSUPPORTED_ENGINEERING_REQUEST')).toBe(true);
    });
  });

  describe('Verified Pattern Integration in Planning', () => {
    it('selects a compatible verified pattern from planner context before invoking LLM', async () => {
      const verifiedPattern = {
        id: 'pat_custom_saturation',
        name: 'Custom Saturation Pipeline',
        domain: 'control',
        category: 'Nonlinear',
        description: 'Verified pattern for signal saturation',
        requiredCapabilities: ['WaveformGen', 'SATURATION', 'Scope'],
        requiredBlocks: ['WaveformGen', 'SATURATION', 'Scope'],
        targetBehaviors: ['custom_saturation'],
        templateGraph: {
          blocks: [
            { id: 'b_wave', type: 'WaveformGen', params: { freq: 5 }, position: { x: 100, y: 150 } },
            { id: 'b_sat', type: 'SATURATION', params: { upperLimit: 1, lowerLimit: -1 }, position: { x: 450, y: 150 } },
            { id: 'b_scope', type: 'Scope', params: {}, position: { x: 800, y: 150 } },
          ],
          connections: [
            { fromBlockId: 'b_wave', fromPortId: 'out', toBlockId: 'b_sat', toPortId: 'u' },
            { fromBlockId: 'b_sat', fromPortId: 'y', toBlockId: 'b_scope', toPortId: 'in1' },
          ],
        },
        provenance: { patternId: 'pat_custom_saturation', version: '1.0.0' },
        qualityScore: 0.95,
      };

      const mockLlm: LlmProvider = {
        generate: vi.fn(),
        health: vi.fn().mockResolvedValue({ status: 'healthy', provider: 'test', latencyMs: 1 }),
      };

      const request: GeneralEngineeringRequest = {
        intent: 'create',
        objective: 'Construct a custom saturation pipeline',
        targetBehaviors: ['custom_saturation'],
        inputs: [],
        outputs: [{ name: 'monitored', value: 'Scope' }],
        constraints: [],
      };

      const context: PlanningContext = {
        projectId: 'proj_pattern',
        baseRevision: 1,
        activeSnapshot: createEmptySnapshot('proj_pattern'),
        catalog,
        patterns: [verifiedPattern],
        llm: mockLlm,
      };

      const outcome = await planGeneralXbridgesModelAsync(request, context);
      expect(outcome.status).toBe('planned');
      expect(outcome.plan).toBeDefined();
      expect(outcome.provenance.some(p => p.patternId === 'pat_custom_saturation')).toBe(true);
      expect(mockLlm.generate).not.toHaveBeenCalled();
    });
  });

  describe('Numeric and Unit-Aware Arithmetic Handling', () => {
    it('handles negative, fractional, and scientific notation arithmetic operands', () => {
      const request: GeneralEngineeringRequest = {
        intent: 'create',
        objective: 'multiply -2.5 by 1e3 and display result on a scope',
        targetBehaviors: ['multiply'],
        inputs: [],
        outputs: [{ name: 'result', value: 'Scope' }],
        constraints: [],
      };
      const context: PlanningContext = {
        projectId: 'proj_arith_sci',
        baseRevision: 1,
        activeSnapshot: createEmptySnapshot('proj_arith_sci'),
        catalog,
        patterns: [],
      };

      const outcome = planGeneralXbridgesModel(request, context);
      expect(outcome.status).toBe('planned');
      const c1 = outcome.plan?.blocks.find(b => b.id === 'const_1');
      const c2 = outcome.plan?.blocks.find(b => b.id === 'const_2');
      expect(c1?.parameters.find(p => p.parameterName === 'value')?.value).toBe(-2.5);
      expect(c2?.parameters.find(p => p.parameterName === 'value')?.value).toBe(1000);
    });

    it('handles unit-bearing operands with SI prefixes', () => {
      const request: GeneralEngineeringRequest = {
        intent: 'create',
        objective: 'multiply 10k by 500m and display result on a scope',
        targetBehaviors: ['multiply'],
        inputs: [],
        outputs: [{ name: 'result', value: 'Scope' }],
        constraints: [],
      };
      const context: PlanningContext = {
        projectId: 'proj_arith_units',
        baseRevision: 1,
        activeSnapshot: createEmptySnapshot('proj_arith_units'),
        catalog,
        patterns: [],
      };

      const outcome = planGeneralXbridgesModel(request, context);
      expect(outcome.status).toBe('planned');
      const c1 = outcome.plan?.blocks.find(b => b.id === 'const_1');
      const c2 = outcome.plan?.blocks.find(b => b.id === 'const_2');
      expect(c1?.parameters.find(p => p.parameterName === 'value')?.value).toBe(10000);
      expect(c2?.parameters.find(p => p.parameterName === 'value')?.value).toBe(0.5);
    });

    it('refuses division by zero with structured diagnostic', () => {
      const request: GeneralEngineeringRequest = {
        intent: 'create',
        objective: 'divide 100 by 0 and display result on a scope',
        targetBehaviors: ['divide'],
        inputs: [],
        outputs: [{ name: 'result', value: 'Scope' }],
        constraints: [],
      };
      const context: PlanningContext = {
        projectId: 'proj_div_zero',
        baseRevision: 1,
        activeSnapshot: createEmptySnapshot('proj_div_zero'),
        catalog,
        patterns: [],
      };

      const outcome = planGeneralXbridgesModel(request, context);
      expect(outcome.status).toBe('refused');
      expect(outcome.plan).toBeUndefined();
      expect(outcome.diagnostics.some(d => d.code === 'DIVISION_BY_ZERO')).toBe(true);
    });

    it('refuses binary operations with missing operands instead of duplicating values', () => {
      const request: GeneralEngineeringRequest = {
        intent: 'create',
        objective: 'multiply constant its value is 10 and display the result on a scope',
        targetBehaviors: ['multiply'],
        inputs: [],
        outputs: [{ name: 'result', value: 'Scope' }],
        constraints: [],
      };
      const context: PlanningContext = {
        projectId: 'proj_missing_op',
        baseRevision: 1,
        activeSnapshot: createEmptySnapshot('proj_missing_op'),
        catalog,
        patterns: [],
      };

      const outcome = planGeneralXbridgesModel(request, context);
      expect(outcome.status).toBe('refused');
      expect(outcome.plan).toBeUndefined();
      expect(outcome.diagnostics.some(d => d.code === 'MISSING_ARITHMETIC_OPERAND')).toBe(true);
    });

    it('refuses addition between incompatible physical units', () => {
      const request: GeneralEngineeringRequest = {
        intent: 'create',
        objective: 'add 10V and 5s on a scope',
        targetBehaviors: ['add'],
        inputs: [],
        outputs: [{ name: 'result', value: 'Scope' }],
        constraints: [],
      };
      const context: PlanningContext = {
        projectId: 'proj_incompatible_units',
        baseRevision: 1,
        activeSnapshot: createEmptySnapshot('proj_incompatible_units'),
        catalog,
        patterns: [],
      };

      const outcome = planGeneralXbridgesModel(request, context);
      expect(outcome.status).toBe('refused');
      expect(outcome.plan).toBeUndefined();
      expect(outcome.diagnostics.some(d => d.code === 'INCOMPATIBLE_UNITS')).toBe(true);
    });

    it('preserves exact numeric values in canonical plan JSON and verifies deterministic planHash', () => {
      const request: GeneralEngineeringRequest = {
        intent: 'create',
        objective: 'multiply -2.5 by 1e3 and display result on a scope',
        targetBehaviors: ['multiply'],
        inputs: [],
        outputs: [{ name: 'result', value: 'Scope' }],
        constraints: [],
      };
      const context: PlanningContext = {
        projectId: 'proj_arith_det',
        baseRevision: 1,
        activeSnapshot: createEmptySnapshot('proj_arith_det'),
        catalog,
        patterns: [],
      };

      const outcome1 = planGeneralXbridgesModel(request, context);
      const outcome2 = planGeneralXbridgesModel(request, context);
      expect(outcome1.status).toBe('planned');
      expect(outcome2.status).toBe('planned');
      expect(outcome1.plan?.planHash).toBe(outcome2.plan?.planHash);
      expect(typeof outcome1.plan?.planHash).toBe('string');
      expect(outcome1.plan?.planHash.length).toBe(64);
    });

    it('executes validated arithmetic plans through simulation proof and asserts Scope observable equals expected calculation', async () => {
      const mulReq: GeneralEngineeringRequest = {
        intent: 'create',
        objective: 'multiply -2.5 by 1e3 and display result on a scope',
        targetBehaviors: ['multiply'],
        inputs: [],
        outputs: [{ name: 'result', value: 'Scope' }],
        constraints: [],
      };
      const context: PlanningContext = {
        projectId: 'proj_proof_sim',
        baseRevision: 1,
        activeSnapshot: createEmptySnapshot('proj_proof_sim'),
        catalog,
        patterns: [],
      };

      const outcome = planGeneralXbridgesModel(mulReq, context);
      expect(outcome.status).toBe('planned');
      const proof = await proveXbridgesPlan(outcome.plan!);
      expect(proof.status).toBe('proved');
      expect(proof.engineRunId).toBeTruthy();
      expect(Number(proof.observables['sink_scope'])).toBeCloseTo(-2500, 4);
    });
  });
});
