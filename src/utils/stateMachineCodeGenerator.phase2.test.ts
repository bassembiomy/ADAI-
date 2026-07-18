import { describe, it, expect } from 'vitest';
import { generateMISRACCode } from './stateMachineCodeGenerator';
import { StateData, VariableDef, TransitionData, JunctionData, Layer } from '../types/sm_types';

describe('StateMachineCodeGenerator Phase 2 & Core Remediation Tests', () => {
  const baseVariables: VariableDef[] = [
    { id: 'v1', name: 'sensor_val', type: 'float', initialValue: '0.0', currentValue: 0, visibleInScope: true },
    { id: 'v2', name: 'counter', type: 'uint16', initialValue: '0', currentValue: 0, visibleInScope: true },
    { id: 'v3', name: 'is_active', type: 'bool', initialValue: 'false', currentValue: false, visibleInScope: true },
  ];

  const baseStates: StateData[] = [
    {
      id: 's1', name: 'Idle', x: 0, y: 0, width: 100, height: 100,
      entry: '', during: '', exit: '',
      isActive: false, color: 'blue', parentId: 'root', children: [],
      priority: 1, isParallel: false, regionId: 'MAIN', autostart: true
    },
    {
      id: 's2', name: 'Active', x: 200, y: 0, width: 100, height: 100,
      entry: '', during: '', exit: '',
      isActive: false, color: 'green', parentId: 'root', children: [],
      priority: 2, isParallel: false, regionId: 'MAIN', autostart: false
    }
  ];

  const baseLayers: Layer[] = [
    { id: 'root', name: 'root', parentStateId: null, stateIds: ['s1', 's2'], transitionIds: [], junctionIds: [] }
  ];

  const baseChart = {
    tickMs: 10,
    states: baseStates,
    junctions: [] as JunctionData[],
    transitions: [] as TransitionData[],
    variables: baseVariables,
    layers: baseLayers,
    safetyMode: false
  };

  it('1.1 & 1.2: should wire use_history=true for states with history junctions and honor propagation', () => {
    // Parent state with nested layer containing a history junction and deep history junction
    const compositeStates: StateData[] = [
      {
        id: 's_parent', name: 'Parent', x: 0, y: 0, width: 200, height: 200,
        entry: '', during: '', exit: '',
        isActive: false, color: 'blue', parentId: 'root', children: [],
        priority: 1, isParallel: false, regionId: 'MAIN', autostart: true
      },
      {
        id: 's_child1', name: 'Child1', x: 10, y: 10, width: 80, height: 80,
        entry: '', during: '', exit: '',
        isActive: false, color: 'green', parentId: 'layer_child', children: [],
        priority: 1, isParallel: false, regionId: 'MAIN', autostart: true
      },
      {
        id: 's_child2', name: 'Child2', x: 10, y: 100, width: 80, height: 80,
        entry: '', during: '', exit: '',
        isActive: false, color: 'green', parentId: 'layer_child', children: [],
        priority: 2, isParallel: false, regionId: 'MAIN', autostart: false
      },
      {
        id: 's_other', name: 'Other', x: 300, y: 0, width: 100, height: 100,
        entry: '', during: '', exit: '',
        isActive: false, color: 'red', parentId: 'root', children: [],
        priority: 2, isParallel: false, regionId: 'MAIN', autostart: false
      }
    ];

    const compositeJunctions: JunctionData[] = [
      { id: 'j_hist', x: 0, y: 0, name: 'H', color: 'black', parentId: 'layer_child', type: 'deep-history' }
    ];

    const compositeTransitions: TransitionData[] = [
      {
        id: 't_to_parent', sourceId: 's_other', targetId: 's_parent',
        condition: 'sensor_val > 5.0', action: '', afterTicks: null,
        type: 'condition', hasControlPoint: false, order: 1
      }
    ];

    const compositeLayers: Layer[] = [
      { id: 'root', name: 'root', parentStateId: null, stateIds: ['s_parent', 's_other'], transitionIds: ['t_to_parent'], junctionIds: [] },
      { id: 'layer_child', name: 'child_layer', parentStateId: 's_parent', stateIds: ['s_child1', 's_child2'], transitionIds: [], junctionIds: ['j_hist'] }
    ];

    const compositeChart = {
      ...baseChart,
      states: compositeStates,
      junctions: compositeJunctions,
      transitions: compositeTransitions,
      layers: compositeLayers
    };

    const result = generateMISRACCode(compositeChart);
    expect(result.errors).toHaveLength(0);

    const coreC = result.files.find(f => f.name === 'sm_core.c')?.content || '';
    
    // Check that transition entering Parent passes use_history=true because Parent contains history junction
    expect(coreC).toContain('SM_Enter_State(instance, SM_ST_PARENT, true);');
  });

  it('1.3: should honor TransitionData.isInternal and handle external self-transitions', () => {
    const customTransitions: TransitionData[] = [
      {
        id: 't_internal', sourceId: 's1', targetId: 's1',
        condition: 'sensor_val > 10.0', action: 'counter = 1;', afterTicks: null,
        type: 'condition', hasControlPoint: false, order: 1, isInternal: true
      },
      {
        id: 't_external_self', sourceId: 's2', targetId: 's2',
        condition: 'sensor_val > 20.0', action: 'counter = 2;', afterTicks: null,
        type: 'condition', hasControlPoint: false, order: 1, isInternal: false
      }
    ];

    const customChart = {
      ...baseChart,
      transitions: customTransitions
    };

    const result = generateMISRACCode(customChart);
    expect(result.errors).toHaveLength(0);

    const coreC = result.files.find(f => f.name === 'sm_core.c')?.content || '';

    // Internal transition: no Exit or Enter of S1
    const internalTransitionBlock = coreC.substring(coreC.indexOf('if ((instance->data.sensor_val > 10.0f))'));
    expect(internalTransitionBlock.substring(0, internalTransitionBlock.indexOf('}'))).not.toContain('SM_Exit_State');
    expect(internalTransitionBlock.substring(0, internalTransitionBlock.indexOf('}'))).not.toContain('SM_Enter_State');
    expect(internalTransitionBlock).toContain('instance->data.counter = (uint16_t)(1U);');

    // External self transition: should exit and enter S2
    const externalTransitionBlock = coreC.substring(coreC.indexOf('if ((instance->data.sensor_val > 20.0f))'));
    expect(externalTransitionBlock).toContain('SM_Exit_State(instance, SM_ST_ACTIVE);');
    expect(externalTransitionBlock).toContain('instance->data.counter = (uint16_t)(2U);');
    expect(externalTransitionBlock).toContain('SM_Enter_State(instance, SM_ST_ACTIVE, false);');
  });

  it('1.4: should enter ALL states in parallel regions', () => {
    const parallelStates: StateData[] = [
      {
        id: 's_p1', name: 'P1', x: 0, y: 0, width: 100, height: 100,
        entry: '', during: '', exit: '',
        isActive: false, color: 'blue', parentId: 'root', children: [],
        priority: 1, isParallel: true, regionId: 'REG_A', autostart: true
      },
      {
        id: 's_p2', name: 'P2', x: 200, y: 0, width: 100, height: 100,
        entry: '', during: '', exit: '',
        isActive: false, color: 'green', parentId: 'root', children: [],
        priority: 2, isParallel: true, regionId: 'REG_B', autostart: true
      }
    ];

    const parallelChart = {
      ...baseChart,
      states: parallelStates,
      layers: [
        { id: 'root', name: 'root', parentStateId: null, stateIds: ['s_p1', 's_p2'], transitionIds: [], junctionIds: [] }
      ]
    };

    const result = generateMISRACCode(parallelChart);
    expect(result.errors).toHaveLength(0);

    const coreC = result.files.find(f => f.name === 'sm_core.c')?.content || '';
    
    // Should enter both states in Enter_Layer_0
    expect(coreC).toContain('SM_Enter_State(instance, SM_ST_P1, false);');
    expect(coreC).toContain('SM_Enter_State(instance, SM_ST_P2, false);');
  });

  it('1.5: should implement SM_GetActive correctly using lookup table mapping', () => {
    const result = generateMISRACCode(baseChart);
    expect(result.errors).toHaveLength(0);

    const coreC = result.files.find(f => f.name === 'sm_core.c')?.content || '';

    // Check that SM_GetActive uses switch-case lookup for region groups
    expect(coreC).toContain('SM_Node_t SM_GetActive(const ADIA_Instance_t* instance, SM_Group_t g)');
    expect(coreC).toContain('switch (g)');
    expect(coreC).toContain('case SM_GRP_MAIN:');
    expect(coreC).toContain('active = instance->active_states[');
  });

  it('1.6: should actually enter designates isSafeState state on error', () => {
    const safetyStates: StateData[] = [
      {
        id: 's_normal', name: 'Normal', x: 0, y: 0, width: 100, height: 100,
        entry: '', during: '', exit: '',
        isActive: false, color: 'blue', parentId: 'root', children: [],
        priority: 1, isParallel: false, regionId: 'MAIN', autostart: true
      },
      {
        id: 's_safe', name: 'SafeState', x: 200, y: 0, width: 100, height: 100,
        entry: 'counter = 99;', during: '', exit: '',
        isActive: false, color: 'green', parentId: 'root', children: [],
        priority: 2, isParallel: false, regionId: 'MAIN', autostart: false,
        isSafeState: true
      }
    ];

    const safetyChart = {
      ...baseChart,
      states: safetyStates,
      safetyMode: true
    };

    const result = generateMISRACCode(safetyChart);
    expect(result.errors).toHaveLength(0);

    const coreC = result.files.find(f => f.name === 'sm_core.c')?.content || '';
    
    // Should enter SM_ST_SAFESTATE on safety checks failure
    expect(coreC).toContain('SM_Enter_State(instance, SM_ST_SAFESTATE, false);');
  });

  it('1.7: should gate safety checks under safetyMode', () => {
    const resultNormal = generateMISRACCode(baseChart);
    const coreCNormal = resultNormal.files.find(f => f.name === 'sm_core.c')?.content || '';
    
    // When safetyMode is false, safety check calls are gated out
    expect(coreCNormal).not.toContain('SM_Safety_Check(instance);');

    // Add safe state and enable safetyMode
    const safetyStates: StateData[] = [
      { ...baseStates[0] },
      { ...baseStates[1], isSafeState: true, name: 'Safe' }
    ];
    const safetyChart = { ...baseChart, states: safetyStates, safetyMode: true };
    const resultSafety = generateMISRACCode(safetyChart);
    const coreCSafety = resultSafety.files.find(f => f.name === 'sm_core.c')?.content || '';

    // Safety check calls are present when safetyMode is true
    expect(coreCSafety).toContain('SM_Safety_Check(instance);');
  });

  it('1.8: should verify SM_Reset fully reinitializes all history and timer states', () => {
    const result = generateMISRACCode(baseChart);
    const coreC = result.files.find(f => f.name === 'sm_core.c')?.content || '';

    expect(coreC).toContain('instance->active_states[sm_iter] = SM_NODE_INVALID;');
    expect(coreC).toContain('instance->history_states[sm_iter] = SM_NODE_INVALID;');
    expect(coreC).toContain('instance->state_timers[sm_iter] = 0U;');
    expect(coreC).toContain('instance->state_active[sm_iter] = false;');
  });

  it('1.9: should implement DELAY block support for X-Bridges', () => {
    const delayChart = {
      ...baseChart,
      states: [
        {
          ...baseStates[0],
          isXBridges: true,
          xBridgesModel: {
            nodes: [
              { id: 'b_in', data: { type: 'Constant', params: { value: 1.0 }, outputs: [{id: 'out'}] } },
              { id: 'b_delay', data: { type: 'DELAY', params: {}, inputs: [{id: 'in'}], outputs: [{id: 'out'}] } }
            ],
            edges: [
              { source: 'b_in', sourceHandle: 'out', target: 'b_delay', targetHandle: 'in' }
            ],
            mappings: [
              { smVarId: 'v1', blockId: 'b_delay', portId: 'out', direction: 'out' }
            ]
          }
        }
      ]
    };

    const result = generateMISRACCode(delayChart as any);
    expect(result.errors).toHaveLength(0);

    const userLogicC = result.files.find(f => f.name === 'sm_user_logic.c')?.content || '';
    
    // Check that stateful Delay member is handled in execution
    expect(userLogicC).toContain('b_delay_out0 = instance->data.idle_b_delay_state;');
    expect(userLogicC).toContain('instance->data.idle_b_delay_state = b_in_out0;');
  });

  it('1.10: should emit error for dangling transition target', () => {
    const danglingTransitions: TransitionData[] = [
      {
        id: 't_dangling', sourceId: 's1', targetId: 'nonexistent',
        condition: 'true', action: '', afterTicks: null,
        type: 'condition', hasControlPoint: false, order: 1
      }
    ];

    const danglingChart = {
      ...baseChart,
      transitions: danglingTransitions
    };

    const result = generateMISRACCode(danglingChart);
    // Validation flags dangling targets
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].message).toContain('dangling');
  });

  it('2.3: should not fabricate a ROM CRC self-comparison in sm_safety.c (MISRA 2.1/14.3)', () => {
    const result = generateMISRACCode(baseChart);
    const safetyC = result.files.find(f => f.name === 'sm_safety.c')?.content || '';

    /* No fake CRC constants and no invariant self-compare dead code */
    expect(safetyC).not.toContain('0x12345678U');
    expect(safetyC).not.toContain('calculated_crc');
    /* The RAM March test remains, and a documented target-specific hook is present */
    expect(safetyC).toContain('SM_March_RAM_Test');
    expect(safetyC).toContain('SM_ERR_ROM_INTEGRITY on mismatch');
  });

  it('3.1: should generate dynamic MCAL pin count', () => {
    const customVariables: VariableDef[] = [
      { id: 'v1', name: 'in_sensor1', type: 'bool', initialValue: 'false', currentValue: false, visibleInScope: true },
      { id: 'v2', name: 'in_sensor2', type: 'bool', initialValue: 'false', currentValue: false, visibleInScope: true },
      { id: 'v3', name: 'in_sensor3', type: 'bool', initialValue: 'false', currentValue: false, visibleInScope: true },
      { id: 'v4', name: 'out_actuator1', type: 'bool', initialValue: 'false', currentValue: false, visibleInScope: true },
    ];
    const customChart = { ...baseChart, variables: customVariables };
    const result = generateMISRACCode(customChart);
    const mcalDioH = result.files.find(f => f.name === 'mcal_dio.h')?.content || '';
    
    // We have 3 input variables, so MCAL_PIN_INPUT_2 must be defined (and 0, 1)
    expect(mcalDioH).toContain('#define MCAL_PIN_INPUT_0');
    expect(mcalDioH).toContain('#define MCAL_PIN_INPUT_1');
    expect(mcalDioH).toContain('#define MCAL_PIN_INPUT_2');
    expect(mcalDioH).toContain('#define MCAL_PIN_OUTPUT_0');
    expect(mcalDioH).toContain('#define MCAL_PIN_OUTPUT_1');
  });
});
