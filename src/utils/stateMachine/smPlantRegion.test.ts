import { describe, expect, it } from 'vitest';
import { BLOCK_LIBRARY } from '../../engine/xbridges/BlockDefinitions';
import type { StateData, VariableDef } from '../../types/sm_types';
import { compileAndRunCTrace, runInterpreterTrace } from './smCHarness';
import { generateCArtifacts } from './smCGenerator';
import { flatOrFixture, type DifferentialFixture, type DifferentialScenarioStep } from './smFixtures';
import type { StateMachineModelV5 } from './smModel';
import { buildSemanticModel } from './smSemanticBuilder';
import type { XBEdgeV1, XBNodeV1 } from './xbModel';

/*
 * Plant models in a chart (Simulink practice: controller and plant in one simulation, only the
 * controller is generated).
 *
 *   StateData.simulationOnly = true marks a state as part of the plant. It is allowed only on a
 *   region of the root parallel (AND) layer; its whole subtree (states, transitions, X-Bridges
 *   diagrams, actions) is simulation-only.
 *   - Simulation: simulation-only regions execute first in every tick, before the controller
 *     regions (the plant produces this tick's sensor values), then the controller regions in
 *     their usual order.
 *   - Generated C: nothing of a simulation-only subtree is generated (no state ids, functions,
 *     X-Bridges code or instance storage for it). Variables written by the plant are inputs of
 *     the generated chart: the integrator writes them (from real sensors) before SM_Step.
 *   - Validation: SM_SIMULATION_ONLY_PLACEMENT (not a region of the root parallel layer),
 *     SM_SIMULATION_ONLY_TRANSITION (a transition between plant and controller states),
 *     SM_SIMULATION_ONLY_SHARED_WRITE (a variable written by both plant and controller).
 *   Closed-loop proof: feeding the C controller, at each step, the plant outputs the simulation
 *   computed for that tick reproduces the controller's behaviour exactly.
 */

const float32 = 'float32';
const xbNode = (id: string, type: string, params: Record<string, unknown> = {}): XBNodeV1 => {
  const block = BLOCK_LIBRARY[type](id, params);
  const port = (p: { id: string; direction: string }) => ({ id: p.id, direction: p.direction, shape: 'scalar', dimensions: [], dataType: float32 });
  return {
    id, type, label: id,
    parameters: { ...(block.inputs ? { inputs: block.inputs.map(port) } : {}), ...(block.outputs ? { outputs: block.outputs.map(port) } : {}), ...params } as XBNodeV1['parameters'],
  };
};
const edge = (from: string, fromPort: string, to: string, toPort: string): XBEdgeV1 => ({
  id: `${from}.${fromPort}->${to}.${toPort}`, sourceNodeId: from, sourcePortId: fromPort, targetNodeId: to, targetPortId: toPort,
});
const st = (id: string, o: Record<string, unknown> = {}) => ({
  id, name: id, x: 0, y: 0, width: 100, height: 60, entry: '', during: '', exit: '', isActive: false, color: '#000',
  parentId: null, children: [], priority: 1, isParallel: false, regionId: null, autostart: false, ...o,
});
const fl = (name: string): VariableDef => ({ id: name, name, type: 'float', initialValue: '0', currentValue: 0, visibleInScope: true });

/* Controller region: Idle -> Run (cmd = 200) -> Done when speed > 50. Plant region: speed = 0.5 * cmd. */
const closedLoop = (): StateMachineModelV5 => {
  const model = flatOrFixture();
  model.variables = [fl('cmd'), fl('speed')];
  const plantMotor = st('motor', {
    parentId: 'plant', autostart: true, isXBridges: true,
    xBridgesModel: {
      schemaVersion: 1,
      nodes: [xbNode('in', 'Inport', { smVarId: 'cmd' }), xbNode('gain', 'GAIN', { gain: 0.5 }), xbNode('out', 'Outport', { smVarId: 'speed' })],
      edges: [edge('in', 'out', 'gain', 'u'), edge('gain', 'y', 'out', 'in')],
      mappings: [
        { smVarId: 'cmd', blockId: 'in', portId: 'in', direction: 'in' },
        { smVarId: 'speed', blockId: 'out', portId: 'out', direction: 'out' },
      ],
      solver: { kind: 'euler', stepSeconds: 0.01 },
      policy: { memory: 'reset', numericFault: 'signal-only' },
    },
  }) as unknown as StateData;
  model.states = [
    st('system', { autostart: true }),
    st('controller', { parentId: 'system', priority: 2 }),
    st('plant', { parentId: 'system', priority: 1, simulationOnly: true }),
    st('idle', { parentId: 'controller', autostart: true }),
    st('run', { parentId: 'controller', priority: 2, entry: 'cmd = 200;' }),
    st('done', { parentId: 'controller', priority: 3, entry: 'cmd = 0;' }),
    plantMotor,
  ] as never;
  model.transitions = [
    { id: 't_go', sourceId: 'idle', targetId: 'run', condition: '', action: '', afterTicks: 2, type: 'after', hasControlPoint: false, order: 1 },
    { id: 't_done', sourceId: 'run', targetId: 'done', condition: 'speed > 50', action: '', afterTicks: null, type: 'condition', hasControlPoint: false, order: 1 },
  ] as never;
  model.layers = [
    { id: 'root', name: 'root', parentStateId: null, decomposition: 'OR', stateIds: ['system'], transitionIds: [], junctionIds: [] },
    { id: 'regions', name: 'regions', parentStateId: 'system', decomposition: 'AND', stateIds: ['controller', 'plant'], transitionIds: [], junctionIds: [] },
    { id: 'ctl', name: 'ctl', parentStateId: 'controller', decomposition: 'OR', stateIds: ['idle', 'run', 'done'], transitionIds: ['t_go', 't_done'], junctionIds: [] },
    { id: 'plt', name: 'plt', parentStateId: 'plant', decomposition: 'OR', stateIds: ['motor'], transitionIds: [], junctionIds: [] },
  ] as never;
  return model;
};

const controllerOnly = (ids: string[]) => ids.filter((id) => !['plant', 'motor'].includes(id)).sort();

describe('simulation-only plant regions', () => {
  it('closes the loop in the simulation with the plant running first in each tick', () => {
    const frames = runInterpreterTrace({ name: 'flat-priority', model: closedLoop(), steps: Array.from({ length: 6 }, () => ({ kind: 'step' as const })) });
    // tick 2: Idle -> Run (cmd = 200); tick 3: plant first gives speed = 100, then Run -> Done.
    expect(frames[2].activeStateIds).toContain('run');
    expect(frames[3].data.speed).toBe(100);
    expect(frames[3].activeStateIds).toContain('done');
  }, 120_000);

  it('generates only the controller', () => {
    const built = buildSemanticModel(closedLoop());
    expect(built.diagnostics.filter((item) => item.severity === 'error')).toEqual([]);
    const code = generateCArtifacts(built.ir!).files.filter((file) => /\.(c|h)$/.test(file.name)).map((file) => file.content).join('\n');
    expect(code).toMatch(/SM_ST_RUN\b/);
    expect(code).not.toMatch(/SM_ST_PLANT\b|SM_ST_MOTOR\b/);
    expect(code).not.toMatch(/xb_motor|XB_MOTOR|motor_gain/i);
  });

  it('the generated controller fed with the simulated plant outputs reproduces the simulation', () => {
    const steps = 6;
    const simulated = runInterpreterTrace({ name: 'flat-priority', model: closedLoop(), steps: Array.from({ length: steps }, () => ({ kind: 'step' as const })) });
    const fed: DifferentialScenarioStep[] = simulated.slice(1).map((frame) => ({ kind: 'step', inputs: { speed: frame.data.speed as number } }));
    const fixture: DifferentialFixture = { name: 'flat-priority', model: closedLoop(), steps: fed };
    const cFrames = compileAndRunCTrace(fixture);
    expect(cFrames.map((frame) => controllerOnly(frame.activeStateIds))).toEqual(simulated.map((frame) => controllerOnly(frame.activeStateIds)));
    expect(cFrames.map((frame) => frame.data.cmd)).toEqual(simulated.map((frame) => frame.data.cmd));
  }, 120_000);

  it('validates placement, crossing transitions and shared writes', () => {
    const codes = (mutate: (model: StateMachineModelV5) => void) => {
      const model = closedLoop();
      mutate(model);
      return buildSemanticModel(model).diagnostics.filter((item) => item.severity === 'error').map((item) => item.code);
    };
    expect(codes((model) => { (model.states.find((s) => s.id === 'run') as unknown as { simulationOnly: boolean }).simulationOnly = true; }))
      .toContain('SM_SIMULATION_ONLY_PLACEMENT');
    expect(codes((model) => {
      model.transitions.push({ id: 't_x', sourceId: 'motor', targetId: 'done', condition: '', action: '', afterTicks: null, type: 'condition', hasControlPoint: false, order: 1 } as never);
      model.layers[0].transitionIds.push('t_x');
    })).toContain('SM_SIMULATION_ONLY_TRANSITION');
    expect(codes((model) => { model.states.find((s) => s.id === 'run')!.entry = 'cmd = 200; speed = 1;'; }))
      .toContain('SM_SIMULATION_ONLY_SHARED_WRITE');
  });
});
