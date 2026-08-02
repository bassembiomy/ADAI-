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

  it('runs a 50-substep generated package with compact C loop and fixed-tick timing parity', () => {
    const scalarPort = (id: string, direction: 'input' | 'output') => ({
      id, direction, shape: 'scalar' as const, dimensions: [], dataType: 'float32' as const,
    });
    const base = hybridXBridgesFixture();
    const countVar = base.variables.find((v) => v.id === 'count')!;
    countVar.type = 'float';
    countVar.initialValue = '0';
    countVar.currentValue = 0;

    const ordinary = base.states.find((s) => s.id === 'ordinary')!;
    const controller = base.states.find((s) => s.id === 'controller')!;
    ordinary.autostart = true;
    controller.autostart = false;

    controller.xBridgesModel = {
      schemaVersion: 1,
      nodes: [
        { id: 'inport', type: 'Inport', parameters: { inputs: [scalarPort('in', 'input')], outputs: [scalarPort('y', 'output')] } },
        { id: 'constant', type: 'Constant', parameters: { value: 1, inputs: [], outputs: [scalarPort('y', 'output')] } },
        { id: 'sum', type: 'Sum', parameters: { signs: '++', inputs: [scalarPort('a', 'input'), scalarPort('b', 'input')], outputs: [scalarPort('y', 'output')] } },
        { id: 'outport', type: 'Outport', parameters: { inputs: [scalarPort('u', 'input')], outputs: [scalarPort('out', 'output')] } },
      ],
      edges: [
        { id: 'in_sum', sourceNodeId: 'inport', sourcePortId: 'y', targetNodeId: 'sum', targetPortId: 'a' },
        { id: 'const_sum', sourceNodeId: 'constant', sourcePortId: 'y', targetNodeId: 'sum', targetPortId: 'b' },
        { id: 'sum_out', sourceNodeId: 'sum', sourcePortId: 'y', targetNodeId: 'outport', targetPortId: 'u' },
      ],
      mappings: [
        { smVarId: 'count', blockId: 'inport', portId: 'in', direction: 'in' },
        { smVarId: 'count', blockId: 'outport', portId: 'out', direction: 'out' },
      ],
      solver: { kind: 'euler', stepSeconds: 0.0002 }, // 10 ms / 0.0002 s = 50 substeps
      policy: { memory: 'reset', numericFault: 'signal-only' },
    };

    base.states.push({
      ...ordinary,
      id: 'state_3',
      name: 'State 3',
      autostart: false,
      priority: 3,
    });
    base.layers[0].stateIds.push('state_3');

    base.transitions = [
      {
        id: 't_ord_ctrl',
        sourceId: 'ordinary',
        targetId: 'controller',
        condition: 'count == 1',
        action: '',
        afterTicks: null,
        type: 'condition',
        priority: 1,
      },
      {
        id: 't_ctrl_3',
        sourceId: 'controller',
        targetId: 'state_3',
        condition: 'count >= 2',
        action: '',
        afterTicks: null,
        type: 'condition',
        priority: 1,
      },
      {
        id: 't_3_ord',
        sourceId: 'state_3',
        targetId: 'ordinary',
        condition: 'count >= 2',
        action: '',
        afterTicks: null,
        type: 'condition',
        priority: 1,
      },
    ];
    base.layers[0].transitionIds = ['t_ord_ctrl', 't_ctrl_3', 't_3_ord'];

    const session = createAppSimulationSession(base);
    expect(session.initialFrame.activeStateIds).toEqual(['ordinary']);
    expect(session.initialFrame.data.count).toBe(0);

    // Tick 1: input count=1 -> transition to controller
    session.runtime.data.count = 1;
    const f1 = stepAppSimulationSession(session, 10);
    expect(f1.activeStateIds).toEqual(['controller']);

    // Tick 2: controller runs 50 substeps. count was 1, sum(+1) -> count becomes 2
    const f2 = stepAppSimulationSession(session, 10);
    expect(f2.activeStateIds).toEqual(['controller']);
    expect(f2.data.count).toBe(2);

    // Tick 3: count is 2 -> transition to state_3
    const f3 = stepAppSimulationSession(session, 10);
    expect(f3.activeStateIds).toEqual(['state_3']);

    // Tick 4: count >= 2 -> transition back to ordinary
    const f4 = stepAppSimulationSession(session, 10);
    expect(f4.activeStateIds).toEqual(['ordinary']);

    // Compare with C execution
    const cTrace = compileAndRunCTrace({
      name: '50-substep-pkg',
      model: base,
      steps: [
        { kind: 'step', inputs: { count: 1 } },
        { kind: 'step' },
        { kind: 'step' },
        { kind: 'step' },
      ],
    });
    expect(compareSemanticTraces(
      [session.initialFrame, f1, f2, f3, f4],
      cTrace,
    )).toBeNull();
  }, 60_000);
});
