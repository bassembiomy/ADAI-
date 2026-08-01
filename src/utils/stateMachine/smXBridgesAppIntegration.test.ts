import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { hybridXBridgesFixture } from './smFixtures';
import { compileAndRunCTrace } from './smCHarness';
import { compareSemanticTraces } from './smTrace';
import {
  createAppSimulationSession,
  runAppSimulationTick,
  stepAppSimulationSession,
} from './smAppAdapter';

const sameTickInnerTransitionModel = () => {
  const model = hybridXBridgesFixture();
  const ordinary = model.states.find((state) => state.id === 'ordinary')!;
  const controller = model.states.find((state) => state.id === 'controller')!;
  ordinary.autostart = false;
  controller.autostart = true;
  controller.during = 'u = 2;';
  controller.internalTransitions = '[y > 3] / u = u;';
  controller.xBridgesModel = {
    schemaVersion: 1,
    nodes: [{
      id: 'gain',
      type: 'GAIN',
      parameters: {
        inputs: [{
          id: 'u',
          direction: 'input',
          shape: 'scalar',
          dataType: 'float32',
        }],
        outputs: [{
          id: 'y',
          direction: 'output',
          shape: 'scalar',
          dataType: 'float32',
        }],
        gain: 2,
      },
    }, {
      id: 'integrator',
      type: 'INTEGRATOR_DISCRETE',
      parameters: {
        initialValue: 3,
        inputs: [{
          id: 'u', direction: 'input', shape: 'scalar', dataType: 'float32',
        }],
        outputs: [{
          id: 'y', direction: 'output', shape: 'scalar', dataType: 'float32',
        }],
      },
    }],
    edges: [],
    mappings: [
      { smVarId: 'u', blockId: 'gain', portId: 'u', direction: 'in' },
      { smVarId: 'y', blockId: 'gain', portId: 'y', direction: 'out' },
      { smVarId: 'u', blockId: 'integrator', portId: 'u', direction: 'in' },
    ],
    solver: { kind: 'euler', stepSeconds: 0.002 },
    policy: { memory: 'reset', numericFault: 'escalate' },
  };
  for (const id of ['u', 'y']) {
    model.variables.push({
      id,
      name: id,
      type: 'float',
      initialValue: '0',
      currentValue: 0,
      visibleInScope: true,
    });
  }
  return model;
};

const discreteSubstepModel = () => {
  const model = hybridXBridgesFixture();
  model.states[0].autostart = false;
  const controller = model.states.find((state) => state.id === 'controller')!;
  controller.autostart = true;
  controller.xBridgesModel = {
    schemaVersion: 1,
    nodes: [{
      id: 'integrator',
      type: 'INTEGRATOR_DISCRETE',
      parameters: {
        initialValue: 3,
        inputs: [{
          id: 'u', direction: 'input', shape: 'scalar', dataType: 'float32',
        }],
        outputs: [{
          id: 'y', direction: 'output', shape: 'scalar', dataType: 'float32',
        }],
      },
    }],
    edges: [],
    mappings: [
      { smVarId: 'u', blockId: 'integrator', portId: 'u', direction: 'in' },
      { smVarId: 'y', blockId: 'integrator', portId: 'y', direction: 'out' },
    ],
    solver: { kind: 'euler', stepSeconds: 0.002 },
    policy: { memory: 'retain', numericFault: 'escalate' },
  };
  for (const [id, value] of [['u', 7], ['y', 0]] as const) {
    model.variables.push({
      id, name: id, type: 'float', initialValue: String(value),
      currentValue: value, visibleInScope: true,
    });
  }
  return model;
};

const boundaryMappingModel = () => {
  const model = hybridXBridgesFixture();
  model.states[0].autostart = false;
  const controller = model.states.find((state) => state.id === 'controller')!;
  controller.autostart = true;
  model.variables.push({
    id: 'x', name: 'x', type: 'float', initialValue: '1', currentValue: 1,
    visibleInScope: true,
  });
  const scalar = (id: string, direction: 'input' | 'output') => ({
    id, direction, shape: 'scalar' as const, dataType: 'float32',
  });
  controller.xBridgesModel = {
    schemaVersion: 1,
    nodes: [
      { id: 'inport', type: 'Inport', parameters: {
        inputs: [scalar('in', 'input')], outputs: [scalar('y', 'output')],
      } },
      { id: 'constant', type: 'Constant', parameters: {
        value: 1, inputs: [], outputs: [scalar('y', 'output')],
      } },
      { id: 'sum', type: 'Sum', parameters: {
        signs: '++', inputs: [scalar('a', 'input'), scalar('b', 'input')],
        outputs: [scalar('y', 'output')],
      } },
      { id: 'outport', type: 'Outport', parameters: {
        inputs: [scalar('u', 'input')], outputs: [scalar('out', 'output')],
      } },
    ],
    edges: [
      { id: 'inport_sum', sourceNodeId: 'inport', sourcePortId: 'y', targetNodeId: 'sum', targetPortId: 'a' },
      { id: 'constant_sum', sourceNodeId: 'constant', sourcePortId: 'y', targetNodeId: 'sum', targetPortId: 'b' },
      { id: 'sum_outport', sourceNodeId: 'sum', sourcePortId: 'y', targetNodeId: 'outport', targetPortId: 'u' },
    ],
    mappings: [
      { smVarId: 'x', blockId: 'inport', portId: 'in', direction: 'in' },
      { smVarId: 'x', blockId: 'outport', portId: 'out', direction: 'out' },
    ],
    solver: { kind: 'euler', stepSeconds: 0.002 },
    policy: { memory: 'reset', numericFault: 'escalate' },
  };
  return model;
};

describe('application X-Bridges simulation integration', () => {
  it('T14-INT-CORE-DIRECT maps an SM variable through Inport and Outport in the integrated runtime', () => {
    const model = boundaryMappingModel();
    const session = createAppSimulationSession(model);
    const frame = stepAppSimulationSession(session, model.tickMs);

    expect(frame.data.x).toBe(2);
  });

  it('orchestrates exactly one stateful X-Bridges step before a first-tick inner transition', async () => {
    const session = createAppSimulationSession(sameTickInnerTransitionModel());
    const applied = [] as number[];
    const committed = [] as Array<Readonly<Record<string, number | boolean>>>;

    const frame = await runAppSimulationTick(session, 10, {
      readInputs: async () => ({}),
      isCurrent: () => true,
      applyFrame: (nextFrame) => applied.push(nextFrame.sequence),
      commitOutputs: async (outputs) => { committed.push(outputs); },
    });

    expect(frame?.sequence).toBe(1);
    expect(frame?.data.y).toBe(4);
    expect(frame?.actions).toContain('xbridges:CONTROLLER');
    expect(frame?.actions).toContain('transition:$internal_controller_0');
    expect(frame?.xBridges.controller.blockState.integrator.y).toBe(13);
    expect(applied).toEqual([1]);
    expect(committed).toEqual([{}]);
  });

  it('keeps the React simulation path on the extracted orchestrator only', () => {
    const source = readFileSync(
      new URL('../../App.tsx', import.meta.url),
      'utf8',
    );

    expect(source).toContain('runAppSimulationTick(session, tickMs');
    expect(source).not.toContain('stepActiveXBridgesModels');
    expect(source).not.toContain('xBridgesEnginesRef');
    expect(source).not.toContain('new XbridgesEngine');
    expect(source).toContain('applyStateMachineSnapshot(d)');
    expect(source).toContain('applyStateMachineSnapshot(prevSnapshot)');
    expect(source).toContain('applyStateMachineSnapshot(nextSnapshot)');
  });

  it('uses the compiled-C substep schedule and exposes identical block state', () => {
    const model = discreteSubstepModel();
    const session = createAppSimulationSession(model);
    const frame = stepAppSimulationSession(session, model.tickMs);
    const substeps = session.ir.states.controller.xBridges!.solver.substepsPerTick;
    const expectedState = 3 + substeps * 7;

    expect(substeps).toBe(5);
    expect(frame.xBridges.controller.blockState.integrator.y)
      .toBe(expectedState);

    const cTrace = compileAndRunCTrace({
      name: 'flat-priority',
      model,
      steps: [{ kind: 'step' }],
    });
    expect(compareSemanticTraces(
      [session.initialFrame, frame],
      cTrace,
    )).toBeNull();
  }, 60_000);
});
