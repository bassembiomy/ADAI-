import { describe, it, expect } from 'vitest';
import {
  planGeneralXbridgesModel,
  type PlanningContext,
  type PlanningOutcome,
} from './generalGraphPlanner';
import { buildXbridgesCapabilityIndex } from '../catalog/xbridgesCapabilityIndex';
import { canonicalJson } from '../../../engine/opm/canonicalHash';
import type { ModelSnapshot } from '../adapters/liveXbridgesModelAdapter';
import type { GeneralEngineeringRequest } from './generalIntent';

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
});
