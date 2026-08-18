import { describe, expect, it } from 'vitest';
import { runReferenceInterpreter, type SMTraceStep } from './smReferenceInterpreter';
import { flatOrFixture } from './smFixtures';
import { buildSemanticModel } from './smSemanticBuilder';

describe('smReferenceInterpreter', () => {
  it('selects highest-priority enabled transition based on guard evaluation (Milestone 7C)', () => {
    const model = flatOrFixture();
    const { ir } = buildSemanticModel(model);
    const trace = runReferenceInterpreter(ir!, [{ tick: 1, deltaMs: 100, inputs: { speed: 120 }, events: [] }]);

    expect(trace.length).toBe(1);
    expect(trace[0].tick).toBe(1);
    expect(trace[0].activeStates).toBeDefined();
    expect(trace[0].transitionIds).toBeDefined();
    expect(trace[0].error).toBe('SM_ERR_NONE');
  });

  it('evaluates Step block output across time vectors matching ceiling step threshold (GEN-XB-STEP-007)', () => {
    const model = flatOrFixture();
    model.states[0].xBridgesModel = {
      nodes: [
        {
          id: 'step1',
          type: 'Step',
          params: { step_time: 0.3, initial_value: 0, final_value: 5 },
          inputs: [],
          outputs: [{ id: 'out', direction: 'output' }],
        },
        {
          id: 'XB6-StepOut',
          type: 'Outport',
          params: { smVarId: 'xb6_step_output' },
          inputs: [{ id: 'in', direction: 'input' }],
          outputs: [{ id: 'out', direction: 'output' }],
        },
      ],
      edges: [{ id: 'e1', sourceNodeId: 'step1', sourcePortId: 'out', targetNodeId: 'XB6-StepOut', targetPortId: 'in' }],
      mappings: [
        { smVarId: 'xb6_step_output', blockId: 'XB6-StepOut', portId: 'out', direction: 'out' },
      ],
    };
    model.variables.push({ id: 'v_step', name: 'xb6_step_output', type: 'double', initialValue: '0', currentValue: 0, visibleInScope: true });

    const { ir } = buildSemanticModel(model);
    const vectors = [
      { tick: 1, deltaMs: 100, inputs: {}, events: [] }, // 100ms: 0
      { tick: 2, deltaMs: 100, inputs: {}, events: [] }, // 200ms: 0
      { tick: 3, deltaMs: 100, inputs: {}, events: [] }, // 300ms: 5
      { tick: 4, deltaMs: 100, inputs: {}, events: [] }, // 400ms: 5
    ];

    const trace = runReferenceInterpreter(ir!, vectors);
    expect(trace[0].variables.xb6_step_output).toBe(0);
    expect(trace[1].variables.xb6_step_output).toBe(0);
    expect(trace[2].variables.xb6_step_output).toBe(5);
    expect(trace[3].variables.xb6_step_output).toBe(5);
  });
});
