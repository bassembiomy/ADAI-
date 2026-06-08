import { describe, it, expect } from 'vitest';
import { generateMISRACCode } from './stateMachineCodeGenerator';
import { StateData, VariableDef, TransitionData, JunctionData, Layer } from '../types/sm_types';

describe('StateMachineCodeGenerator', () => {
  const mockVariables: VariableDef[] = [
    { id: 'v1', name: 'sensor_val', type: 'float', initialValue: '0.0', currentValue: 0, visibleInScope: true },
    { id: 'v2', name: 'counter', type: 'uint16', initialValue: '0', currentValue: 0, visibleInScope: true },
    { id: 'v3', name: 'is_active', type: 'bool', initialValue: 'false', currentValue: false, visibleInScope: true },
  ];

  const mockStates: StateData[] = [
    {
      id: 's1', name: 'Idle', x: 0, y: 0, width: 100, height: 100,
      entry: 'counter = 0;', during: 'sensor_val = 1.2;', exit: '',
      isActive: false, color: 'blue', parentId: 'root', children: [],
      priority: 1, isParallel: false, regionId: 'MAIN', autostart: true
    },
    {
      id: 's2', name: 'Active', x: 200, y: 0, width: 100, height: 100,
      entry: 'is_active = true;', during: 'counter = counter + 1;', exit: 'is_active = false;',
      isActive: false, color: 'green', parentId: 'root', children: [],
      priority: 2, isParallel: false, regionId: 'MAIN', autostart: false
    }
  ];

  const mockTransitions: TransitionData[] = [
    {
      id: 't1', sourceId: 's1', targetId: 's2',
      condition: 'sensor_val > 10.0', action: 'counter = 5;',
      afterTicks: null, type: 'condition', hasControlPoint: false, order: 1
    },
    {
      id: 't2', sourceId: 's2', targetId: 's1',
      condition: 'counter >= 100', action: '',
      afterTicks: null, type: 'condition', hasControlPoint: false, order: 1
    }
  ];

  const mockLayers: Layer[] = [
    { id: 'root', name: 'root', parentStateId: null, stateIds: ['s1', 's2'], transitionIds: ['t1', 't2'], junctionIds: [] }
  ];

  const chart = {
    tickMs: 10,
    states: mockStates,
    junctions: [] as JunctionData[],
    transitions: mockTransitions,
    variables: mockVariables,
    layers: mockLayers,
    safetyMode: false
  };

  it('should generate all required C/H files', () => {
    const result = generateMISRACCode(chart);
    expect(result.errors).toHaveLength(0);
    expect(result.files).toHaveLength(8);
    
    const fileNames = result.files.map(f => f.name);
    expect(fileNames).toContain('sm_config.h');
    expect(fileNames).toContain('sm_core.h');
    expect(fileNames).toContain('sm_core.c');
    expect(fileNames).toContain('sm_user_logic.h');
    expect(fileNames).toContain('sm_user_logic.c');
    expect(fileNames).toContain('sm_testing_report.md');
  });

  it('should correctly map variables to g_data in sm_config.h', () => {
    const result = generateMISRACCode(chart);
    const configH = result.files.find(f => f.name === 'sm_config.h')?.content || '';
    
    expect(configH).toContain('float sensor_val;');
    expect(configH).toContain('uint16_t counter;');
    expect(configH).toContain('bool is_active;');
  });

  it('should apply MISRA-C "U" suffix to unsigned variable assignments and comparisons', () => {
    const result = generateMISRACCode(chart);
    const userLogicC = result.files.find(f => f.name === 'sm_user_logic.c')?.content || '';
    const coreC = result.files.find(f => f.name === 'sm_core.c')?.content || '';
    
    // counter is uint16, so assignments and comparisons involving literals should have 'U'
    expect(userLogicC).toContain('instance->data.counter = 0U;'); // From Idle state entry
    expect(coreC).toContain('instance->data.counter = 5U;');      // From transition action
  });

  it('should correctly generate state transition logic in sm_core.c', () => {
    const result = generateMISRACCode(chart);
    const coreC = result.files.find(f => f.name === 'sm_core.c')?.content || '';
    
    // Check transition from Idle to Active
    expect(coreC).toContain('if (instance->data.sensor_val > 10.0)');
    expect(coreC).toContain('instance->active_state = SM_ST_ACTIVE;');
    
    // Check transition from Active to Idle
    // Note: counter is uint16, so 100 should become 100U
    expect(coreC).toContain('if (instance->data.counter >= 100U)');
    expect(coreC).toContain('instance->active_state = SM_ST_IDLE;');
  });

  it('should generate X-Bridges step logic when a state has an X-Bridges model', () => {
    const xbChart = {
      ...chart,
      states: [
        {
          ...mockStates[0],
          isXBridges: true,
          xBridgesModel: {
            nodes: [
              { id: 'block1', data: { type: 'Constant', params: { value: 5.0 }, outputs: [{id: 'out'}] } },
              { id: 'block2', data: { type: 'Integrator', params: {}, inputs: [{id: 'in'}], outputs: [{id: 'out'}] } }
            ],
            edges: [
              { source: 'block1', sourceHandle: 'out', target: 'block2', targetHandle: 'in' }
            ],
            mappings: [
              { smVarId: 'v1', blockId: 'block2', portId: 'out', direction: 'out' }
            ]
          }
        }
      ]
    };

    const result = generateMISRACCode(xbChart as any);
    const userLogicC = result.files.find(f => f.name === 'sm_user_logic.c')?.content || '';
    const userLogicH = result.files.find(f => f.name === 'sm_user_logic.h')?.content || '';

    // Check prototype in .h
    expect(userLogicH).toContain('void SM_ST_IDLE_XBridges_Step(ADIA_Instance_t* instance, float delta_s);');

    // Check implementation in .c
    expect(userLogicC).toContain('void SM_ST_IDLE_XBridges_Step(ADIA_Instance_t* instance, float delta_s)');
    expect(userLogicC).toContain('float block1_out0 = 0.0f;');
    expect(userLogicC).toContain('block1_out0 = 5.0000f;');
    expect(userLogicC).toContain('instance->data.block2_state += block1_out0 * delta_s;');
    expect(userLogicC).toContain('instance->data.sensor_val = block2_out0;');
  });

  it('should report error if safety mode is enabled but no safe state is defined', () => {
    const safetyChart = { ...chart, safetyMode: true };
    const result = generateMISRACCode(safetyChart);
    
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain('No Safe State defined');
    expect(result.files).toHaveLength(0);
  });

  it('should include enhanced state machine analysis sections in the testing report', () => {
    const result = generateMISRACCode(chart);
    const report = result.files.find(f => f.name === 'sm_testing_report.md')?.content || '';

    expect(report).toContain('## 5. Critical Path Analysis (Critical Batches)');
    expect(report).toContain('## 6. Corner Case & Behavior Analysis');
    expect(report).toContain('## 7. Automatically Generated Test Scenario Matrix');
    expect(report).toContain('Total Unique Paths Enumerated:');
    expect(report).toContain('State Reachability:');
  });
});
