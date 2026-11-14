import { describe, expect, it } from 'vitest';
import { BLOCK_LIBRARY } from '../../engine/xbridges/BlockDefinitions';
import type { StateData, VariableDef } from '../../types/sm_types';
import { compileAndRunCTrace, runInterpreterTrace } from './smCHarness';
import { generateCArtifacts } from './smCGenerator';
import { flatOrFixture, type DifferentialFixture } from './smFixtures';
import type { StateMachineModelV5 } from './smModel';
import { buildSemanticModel } from './smSemanticBuilder';
import { compareSemanticTraces } from './smTrace';
import type { XBEdgeV1, XBNodeV1 } from './xbModel';

/*
 * Multi-rate X-Bridges states (time slicing for motor/inverter control), as Simulink
 * multitasking with deterministic rate transitions.
 *
 * Model: xBridgesModel.solver.execution = 'in-tick' (default, today's behaviour: all
 * tick / stepSeconds solver substeps run inside the chart tick, right after the state's
 * during actions) or 'separate-task'.
 *
 * 'separate-task':
 *  - The generated C exposes `SM_Error_t SM_XB_Task(ADIA_Instance_t *instance)`, which performs
 *    ONE solver step of every enabled separate-task X-Bridges state of the chart. The
 *    integrator calls it every SM_XB_TASK_PERIOD_US microseconds (= stepSeconds) from a fast
 *    interrupt with higher priority than the chart task. SM_XB_TASK_STEPS_PER_TICK =
 *    tick / stepSeconds. All separate-task states of a chart share one solver step
 *    (else SM_XB_TASK_RATE_MISMATCH).
 *  - Schedule of chart period k (chart hit at time k*T, fast steps kN .. kN+N-1):
 *      1. fast step kN runs first (higher priority) with the inputs and the enable latched at
 *         the end of chart step k-1;
 *      2. the chart step k reads the mapped outputs produced by fast step kN (fast-to-slow
 *         rate transition: sample at the hit, no delay);
 *      3. at the end of chart step k the mapped inputs written by the chart and the state's
 *         active flag are latched for fast steps kN+N .. (slow-to-fast rate transition: one
 *         chart period delay, deterministic);
 *      4. fast steps kN+1 .. kN+N-1 run with the inputs latched at the end of step k-1.
 *    A state entered by chart step k starts executing at fast step (k+1)N; memory 'reset' is
 *    applied at that first fast step. The latches are double-buffered so the fast interrupt
 *    may preempt the chart step anywhere without changing results.
 *  - The simulation implements exactly this schedule, and the differential harness drives the
 *    C the same way (SM_XB_Task once, SM_Step, then SM_XB_Task N-1 times per chart tick);
 *    traces are compared after each full chart period.
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
const variable = (name: string): VariableDef => ({ id: name, name, type: 'float', initialValue: '0', currentValue: 0, visibleInScope: true });

const gainChart = (execution: 'in-tick' | 'separate-task' | undefined, stepSeconds = 0.001): StateMachineModelV5 => {
  const model = flatOrFixture();
  model.variables = [variable('u'), variable('y')];
  const solver: Record<string, unknown> = { kind: 'euler', stepSeconds };
  if (execution) solver.execution = execution;
  const drive = {
    id: 'drive', name: 'Drive', x: 0, y: 0, width: 100, height: 60, entry: '', during: 'u = u + 1;', exit: '',
    isActive: false, color: '#000', parentId: null, children: [], priority: 1, isParallel: false, regionId: null, autostart: true,
    isXBridges: true,
    xBridgesModel: {
      schemaVersion: 1,
      nodes: [xbNode('in', 'Inport', { smVarId: 'u' }), xbNode('gain', 'GAIN', { gain: 2 }), xbNode('out', 'Outport', { smVarId: 'y' })],
      edges: [edge('in', 'out', 'gain', 'u'), edge('gain', 'y', 'out', 'in')],
      mappings: [
        { smVarId: 'u', blockId: 'in', portId: 'in', direction: 'in' },
        { smVarId: 'y', blockId: 'out', portId: 'out', direction: 'out' },
      ],
      solver,
      policy: { memory: 'reset', numericFault: 'signal-only' },
    },
  } as unknown as StateData;
  model.states = [drive] as never;
  model.transitions = [];
  model.layers = [{ id: 'root', name: 'root', parentStateId: null, decomposition: 'OR', stateIds: ['drive'], transitionIds: [], junctionIds: [] }] as never;
  return model;
};

const run = (model: StateMachineModelV5, ticks = 6) => {
  const fixture: DifferentialFixture = { name: 'flat-priority', model, steps: Array.from({ length: ticks }, () => ({ kind: 'step' as const })) };
  const expected = runInterpreterTrace(fixture);
  expect(compareSemanticTraces(expected, compileAndRunCTrace(fixture))).toBeNull();
  return expected;
};

describe('multi-rate X-Bridges states', () => {
  it("'in-tick' (default): the diagram sees the chart's write of the same tick", () => {
    const frames = run(gainChart(undefined));
    // during u = u + 1 then the diagram: y = 2 * u in the same tick
    expect(frames.slice(1).map((frame) => frame.data.y)).toEqual([2, 4, 6, 8, 10, 12]);
  }, 120_000);

  it("'separate-task': deterministic rate transitions, one chart period from chart to task", () => {
    const frames = run(gainChart('separate-task'));
    // chart k reads the fast step at hit k, which used u latched at the end of chart step k-1
    expect(frames.slice(1).map((frame) => frame.data.y)).toEqual([0, 2, 4, 6, 8, 10]);
    expect(frames.slice(1).map((frame) => frame.data.u)).toEqual([1, 2, 3, 4, 5, 6]);
  }, 120_000);

  it('exposes the fast task entry point and its period', () => {
    const built = buildSemanticModel(gainChart('separate-task'));
    expect(built.diagnostics.filter((item) => item.severity === 'error')).toEqual([]);
    const files = generateCArtifacts(built.ir!).files;
    const header = files.filter((file) => file.name.endsWith('.h')).map((file) => file.content).join('\n');
    expect(header).toMatch(/SM_Error_t\s+SM_XB_Task\s*\(\s*ADIA_Instance_t\s*\*\s*\w+\s*\)/);
    expect(header).toMatch(/#define\s+SM_XB_TASK_PERIOD_US\s+1000U/);
    expect(header).toMatch(/#define\s+SM_XB_TASK_STEPS_PER_TICK\s+10U/);
  });

  it('charts without separate-task states generate no fast task', () => {
    const files = generateCArtifacts(buildSemanticModel(gainChart('in-tick')).ir!).files;
    expect(files.map((file) => file.content).join('\n')).not.toMatch(/SM_XB_Task|SM_XB_TASK_/);
  });

  it('rejects separate-task states with different solver steps in one chart', () => {
    const model = gainChart('separate-task');
    const second = JSON.parse(JSON.stringify(model.states[0])) as StateData & { xBridgesModel: { solver: { stepSeconds: number } } };
    second.id = 'drive2';
    second.name = 'Drive2';
    second.autostart = false;
    second.priority = 2;
    second.xBridgesModel.solver.stepSeconds = 0.002;
    model.states.push(second as never);
    model.layers[0].stateIds.push('drive2');
    const codes = buildSemanticModel(model).diagnostics.filter((item) => item.severity === 'error').map((item) => item.code);
    expect(codes).toContain('SM_XB_TASK_RATE_MISMATCH');
  });
});
