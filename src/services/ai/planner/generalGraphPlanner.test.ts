import { describe, it, expect } from 'vitest';
import {
  planGeneralXbridgesModel,
  type PlanningContext,
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

function ctx(projectId: string, snapshot?: ModelSnapshot): PlanningContext {
  return {
    projectId,
    baseRevision: snapshot?.revision ?? 1,
    activeSnapshot: snapshot || createEmptySnapshot(projectId),
    catalog: buildXbridgesCapabilityIndex(),
    patterns: [],
  };
}

describe('generalGraphPlanner (catalog-driven synthesis)', () => {
  const catalog = buildXbridgesCapabilityIndex();

  describe('Domain plans from catalog capabilities', () => {
    it('synthesizes an explicit feed-forward chain plan (Step→GAIN→Scope)', () => {
      const request: GeneralEngineeringRequest = {
        intent: 'create',
        objective: 'Create a signal chain: Step source into a Gain of 2 into a Scope',
        targetBehaviors: ['feed_forward'],
        inputs: [{ name: 'gain', value: 2 }],
        outputs: [],
        constraints: [],
      };

      const outcome = planGeneralXbridgesModel(request, ctx('proj_ff'));
      expect(outcome.status).toBe('planned');
      const types = outcome.plan!.blocks.map(b => b.blockDefinitionId);
      expect(types).toEqual(expect.arrayContaining(['Step', 'GAIN', 'Scope']));
      expect(outcome.plan?.actions.some(a => a.kind === 'add_block')).toBe(true);
      expect(outcome.plan?.actions.some(a => a.kind === 'connect_ports')).toBe(true);
      expect(outcome.plan?.catalogFingerprint).toBe(catalog.catalogFingerprint);
      expect(outcome.plan?.expectedBeforeHash).toBe(createEmptySnapshot('proj_ff').stateHash);
      const gain = outcome.plan!.actions.find(
        (a): a is Extract<typeof a, { kind: 'add_block' }> =>
          a.kind === 'add_block' && a.blockType === 'GAIN',
      );
      expect(gain?.parameters?.gain).toBe(2);
    });

    it('synthesizes a closed-loop PID control graph plan', () => {
      const request: GeneralEngineeringRequest = {
        intent: 'create',
        objective: 'Closed-loop PID speed control with feedback',
        targetBehaviors: ['closed_loop_control', 'speed_control'],
        inputs: [{ name: 'setpoint', value: 100, unit: 'rpm' }],
        outputs: [],
        constraints: [],
      };

      const outcome = planGeneralXbridgesModel(request, ctx('proj_pid'));
      expect(outcome.status).toBe('planned');
      const kinds = outcome.plan!.actions.filter(a => a.kind === 'add_block').map(a => a.blockType);
      expect(kinds).toEqual(expect.arrayContaining(['PID_CONTROLLER', 'Sum', 'INTEGRATOR_CONTINUOUS']));
    });

    it('synthesizes a first-order low-pass filter graph plan', () => {
      const request: GeneralEngineeringRequest = {
        intent: 'create',
        objective: 'First-order low-pass filter',
        targetBehaviors: ['low_pass_filter'],
        inputs: [{ name: 'time_constant', value: 0.01, unit: 's' }],
        outputs: [],
        constraints: [],
      };

      const outcome = planGeneralXbridgesModel(request, ctx('proj_filter'));
      expect(outcome.status).toBe('planned');
      const kinds = outcome.plan!.actions.filter(a => a.kind === 'add_block').map(a => a.blockType);
      expect(kinds).toEqual(expect.arrayContaining(['Sum', 'GAIN', 'Integrator']));
    });

    it('synthesizes a motor drive graph plan', () => {
      const request: GeneralEngineeringRequest = {
        intent: 'create',
        objective: 'Three-phase motor drive',
        targetBehaviors: ['motor_drive'],
        inputs: [
          { name: 'voltage', value: 400, unit: 'V' },
          { name: 'frequency', value: 5000, unit: 'Hz' },
        ],
        outputs: [],
        constraints: [],
      };

      const outcome = planGeneralXbridgesModel(request, ctx('proj_motor'));
      expect(outcome.status).toBe('planned');
      const kinds = outcome.plan!.actions.filter(a => a.kind === 'add_block').map(a => a.blockType);
      expect(kinds).toEqual(expect.arrayContaining(['THREE_PHASE_INVERTER', 'THREE_PHASE_LOAD', 'PWM_GENERATOR']));
    });

    it('synthesizes a thermal alarm logic graph plan', () => {
      const request: GeneralEngineeringRequest = {
        intent: 'create',
        objective: 'Thermal alarm logic',
        targetBehaviors: ['thermal_alarm_logic'],
        inputs: [{ name: 'threshold', value: 200, unit: '°C' }],
        outputs: [],
        constraints: [],
      };

      const outcome = planGeneralXbridgesModel(request, ctx('proj_thermal'));
      expect(outcome.status).toBe('planned');
      const kinds = outcome.plan!.actions.filter(a => a.kind === 'add_block').map(a => a.blockType);
      expect(kinds).toContain('SWITCH');
    });

    it('synthesizes a logical sequencing graph plan', () => {
      const request: GeneralEngineeringRequest = {
        intent: 'create',
        objective: 'Logical safety interlocking and state sequencing',
        targetBehaviors: ['logical_sequencing'],
        inputs: [],
        outputs: [],
        constraints: [],
      };

      const outcome = planGeneralXbridgesModel(request, ctx('proj_logic'));
      expect(outcome.status).toBe('planned');
      const kinds = outcome.plan!.actions.filter(a => a.kind === 'add_block').map(a => a.blockType);
      expect(kinds).toContain('DFlipFlop');
    });
  });

  describe('Catalog authority: ports, parameters, refusals', () => {
    it('every planned connection uses real catalog ports', () => {
      const request: GeneralEngineeringRequest = {
        intent: 'create',
        objective: 'Closed-loop PID speed control',
        targetBehaviors: ['closed_loop_control'],
        inputs: [],
        outputs: [],
        constraints: [],
      };
      const outcome = planGeneralXbridgesModel(request, ctx('proj_ports'));
      expect(outcome.status).toBe('planned');
      const blockTypes = new Map(outcome.plan!.blocks.map(b => [b.id, b.blockDefinitionId]));
      for (const c of outcome.plan!.connections) {
        const srcType = blockTypes.get(c.fromBlockId)!;
        const tgtType = blockTypes.get(c.toBlockId)!;
        const srcCap = catalog.blocks.get(srcType)!;
        const tgtCap = catalog.blocks.get(tgtType)!;
        expect(srcCap.outputs.some(p => p.id === c.fromPortId), `${srcType} must expose output '${c.fromPortId}'`).toBe(true);
        expect(tgtCap.inputs.some(p => p.id === c.toPortId), `${tgtType} must expose input '${c.toPortId}'`).toBe(true);
      }
    });

    it('refuses chains whose blocks cannot satisfy port directionality', () => {
      const request: GeneralEngineeringRequest = {
        intent: 'create',
        objective: 'Feed the output of a TERMINATOR block into a Scope',
        targetBehaviors: [],
        inputs: [],
        outputs: [],
        constraints: [],
      };
      const outcome = planGeneralXbridgesModel(request, ctx('proj_refuse_ports'));
      expect(outcome.status).toBe('refused');
      expect(outcome.plan).toBeUndefined();
      expect(outcome.diagnostics.some(d => d.code === 'INCOMPATIBLE_PORTS' || d.code === 'MISSING_CAPABILITY')).toBe(true);
    });

    it('refuses requests without any catalog-supported realization', () => {
      const impossibleReq: GeneralEngineeringRequest = {
        intent: 'create',
        objective: 'Perpetual motion free energy generator',
        targetBehaviors: ['impossible_warp_physics'],
        inputs: [],
        outputs: [],
        constraints: [],
      };
      const outcome = planGeneralXbridgesModel(impossibleReq, ctx('proj_impossible'));
      expect(outcome.status).toBe('refused');
      expect(outcome.plan).toBeUndefined();
      expect(outcome.diagnostics.some(d => d.severity === 'ERROR')).toBe(true);
    });

    it('refuses modify requests that match no block in the active model', () => {
      const request: GeneralEngineeringRequest = {
        intent: 'modify',
        objective: 'Change the resistor to 100 ohm',
        targetBehaviors: [],
        inputs: [{ name: 'resistance', value: 100 }],
        outputs: [],
        constraints: [],
      };
      const outcome = planGeneralXbridgesModel(request, ctx('proj_mod_empty'));
      expect(outcome.status).toBe('refused');
      expect(outcome.diagnostics.some(d => d.code === 'MISSING_MAPPING')).toBe(true);
    });
  });

  describe('Modification diffing', () => {
    it('synthesizes a minimal set_parameter diff against the active graph', () => {
      const activeSnapshot: ModelSnapshot = {
        projectId: 'proj_mod',
        revision: 2,
        nodes: [
          {
            id: 'node_1',
            type: 'Constant',
            position: { x: 100, y: 100 },
            data: { blockId: 'src_1', blockType: 'Constant', label: 'Constant', params: { value: 5 } },
          },
          {
            id: 'node_2',
            type: 'Scope',
            position: { x: 400, y: 100 },
            data: { blockId: 'sink_1', blockType: 'Scope', label: 'Scope', params: {} },
          },
        ],
        edges: [
          { id: 'edge_1', source: 'node_1', sourceHandle: 'out', target: 'node_2', targetHandle: 'in1' },
        ],
        stateHash: 'mod_base_hash_123',
        timestamp: Date.now(),
      };

      const request: GeneralEngineeringRequest = {
        intent: 'modify',
        objective: 'Update Constant value to 10',
        targetBehaviors: [],
        inputs: [{ name: 'value', value: 10 }],
        outputs: [],
        constraints: [],
      };

      const outcome = planGeneralXbridgesModel(request, {
        projectId: 'proj_mod',
        baseRevision: 2,
        activeSnapshot,
        catalog,
        patterns: [],
      });
      expect(outcome.status).toBe('planned');
      const actions = outcome.plan!.actions;
      expect(actions).toHaveLength(1);
      const action = actions[0] as Extract<(typeof actions)[number], { kind: 'set_parameter' }>;
      expect(action.kind).toBe('set_parameter');
      expect(action.blockId).toBe('src_1');
      expect(action.value).toBe(10);
      expect(outcome.plan!.expectedAfterDelta.modifiedBlocks).toEqual(['src_1']);
      expect(outcome.plan!.expectedAfterDelta.addedBlocks).toEqual([]);
    });
  });

  describe('Byte-identical canonical determinism', () => {
    it('produces byte-identical canonical JSON and planHash on identical repeated runs', () => {
      const request: GeneralEngineeringRequest = {
        intent: 'create',
        objective: 'Closed-loop PID speed control with feedback',
        targetBehaviors: ['closed_loop_control', 'speed_control'],
        inputs: [{ name: 'setpoint', value: 10 }],
        outputs: [],
        constraints: [],
      };
      const context = ctx('proj_determ');

      const run1 = planGeneralXbridgesModel(request, context);
      const run2 = planGeneralXbridgesModel(request, context);

      expect(run1.status).toBe('planned');
      expect(run2.status).toBe('planned');
      expect(run1.plan?.planHash).toEqual(run2.plan?.planHash);
      expect(canonicalJson(run1.plan)).toEqual(canonicalJson(run2.plan));
    });
  });
});
