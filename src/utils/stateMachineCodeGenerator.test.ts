import { describe, it, expect } from 'vitest';
import { generateMISRACCode } from './stateMachineCodeGenerator';
import { StateData, VariableDef, TransitionData, JunctionData, Layer } from '../types/sm_types';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';


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
    expect(result.files).toHaveLength(9);
    
    const fileNames = result.files.map(f => f.name);
    expect(fileNames).toContain('sm_config.h');
    expect(fileNames).toContain('sm_core.h');
    expect(fileNames).toContain('sm_core.c');
    expect(fileNames).toContain('sm_user_logic.h');
    expect(fileNames).toContain('sm_user_logic.c');
    expect(fileNames).toContain('mcal_dio.h');
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
    
    // counter is uint16, so assignments and comparisons involving literals should have 'U' and cast
    expect(userLogicC).toContain('instance->data.counter = (uint16_t)(0U);'); // From Idle state entry
    expect(coreC).toContain('instance->data.counter = (uint16_t)(5U);');      // From transition action
  });

  it('should correctly generate state transition logic in sm_core.c', () => {
    const result = generateMISRACCode(chart);
    const coreC = result.files.find(f => f.name === 'sm_core.c')?.content || '';
    
    // Check transition from Idle to Active
    expect(coreC).toContain('if ((instance->data.sensor_val > 10.0f))');
    expect(coreC).toContain('SM_Enter_State(instance, SM_ST_ACTIVE, false);');
    
    // Check transition from Active to Idle
    // Note: counter is uint16, so 100 should become 100U
    expect(coreC).toContain('if ((instance->data.counter >= 100U))');
    expect(coreC).toContain('SM_Enter_State(instance, SM_ST_IDLE, false);');
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
      ],
      transitions: []
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
    expect(userLogicC).toContain('instance->data.idle_block2_state += block1_out0 * delta_s;');
    /* MISRA 10.3: output sync assignment carries an explicit cast */
    expect(userLogicC).toContain('instance->data.sensor_val = (float)(block2_out0);');
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

  it('should document terminal states and report type-binding violations', () => {
    const customChart = {
      ...chart,
      states: [
        {
          ...mockStates[0],
          isTerminalState: true
        },
        mockStates[1]
      ],
      hilConfig: {
        enabled: true,
        target: 'STM32F4',
        clockSpeed: 84,
        commPort: 'COM3',
        baudRate: 115200,
        channels: [
          {
            id: 'ch1',
            name: 'DigitalIn',
            peripheral: 'GPIO',
            pin: 'PA0',
            direction: 'In',
            dataType: 'float',
            rangeMin: 0,
            rangeMax: 1,
            scalingFactor: 1,
            unit: ''
          },
          {
            id: 'ch2',
            name: 'AnalogOut',
            peripheral: 'ADC',
            pin: 'PA1',
            direction: 'Out',
            dataType: 'bool',
            rangeMin: 0,
            rangeMax: 5,
            scalingFactor: 1,
            unit: ''
          }
        ],
        mappings: [
          {
            id: 'm1',
            channelId: 'ch1',
            adiaVarId: 'sensor_val', // type is float (implausible for GPIO)
            direction: 'read'
          },
          {
            id: 'm2',
            channelId: 'ch2',
            adiaVarId: 'is_active', // type is bool (implausible for ADC)
            direction: 'write'
          }
        ]
      }
    };

    const result = generateMISRACCode(customChart as any);
    const report = result.files.find(f => f.name === 'sm_testing_report.md')?.content || '';

    // Verify terminal states documentation
    expect(report).toContain('- **Terminal States:** `Idle` (Terminal/Safe)');

    // Verify type-binding plausibility report
    expect(report).toContain('### Type-Binding Plausibility Report');
    expect(report).toContain('Digital GPIO pin is bound to type `float`');
    expect(report).toContain('Analog/PWM peripheral is bound to `bool` type');
  });

  it('should enforce parenthesization and wrap single statement conditional bodies in braces', () => {
    const customChart = {
      ...chart,
      states: [
        {
          ...mockStates[0],
          entry: 'if (sensor_val > 10.0) counter = 1;\nelse counter = 2;'
        },
        mockStates[1]
      ],
      transitions: [
        {
          id: 't1', sourceId: 's1', targetId: 's2',
          condition: 'sensor_val > 5.0 && counter < 10', action: 'if (is_active) counter = 3;',
          afterTicks: null, type: 'condition', hasControlPoint: false, order: 1
        }
      ]
    };

    const result = generateMISRACCode(customChart as any);
    const userLogicC = result.files.find(f => f.name === 'sm_user_logic.c')?.content || '';
    const coreC = result.files.find(f => f.name === 'sm_core.c')?.content || '';

    // Verify bracket wrapping in user entry code
    expect(userLogicC).toContain('if ((instance->data.sensor_val > 10.0f)) {');
    expect(userLogicC).toContain('instance->data.counter = (uint16_t)(1U);');
    expect(userLogicC).toContain('else {');
    expect(userLogicC).toContain('instance->data.counter = (uint16_t)(2U);');

    // Verify parenthesization in transition condition
    expect(coreC).toContain('if (((instance->data.sensor_val > 5.0f) && (instance->data.counter < 10U)))');

    // Verify bracket wrapping in transition action
    expect(coreC).toContain('if ((instance->data.is_active)) {');
    expect(coreC).toContain('instance->data.counter = (uint16_t)(3U);');
  });

  it('should generate correct C code for parallel states and layers', () => {
    const parallelStates: StateData[] = [
      {
        id: 's1', name: 'StateA', x: 0, y: 0, width: 100, height: 100,
        entry: 'counter = 1;', during: '', exit: '',
        isActive: false, color: 'blue', parentId: 'root', children: [],
        priority: 1, isParallel: true, regionId: 'REGION_A', autostart: true
      },
      {
        id: 's2', name: 'StateB', x: 200, y: 0, width: 100, height: 100,
        entry: 'sensor_val = 5.5;', during: '', exit: '',
        isActive: false, color: 'green', parentId: 'root', children: [],
        priority: 2, isParallel: true, regionId: 'REGION_B', autostart: true
      }
    ];

    const parallelChart = {
      tickMs: 10,
      states: parallelStates,
      junctions: [] as JunctionData[],
      transitions: [] as TransitionData[],
      variables: mockVariables,
      layers: mockLayers,
      safetyMode: false
    };

    const result = generateMISRACCode(parallelChart);
    expect(result.errors).toHaveLength(0);

    const configH = result.files.find(f => f.name === 'sm_config.h')?.content || '';
    const coreC = result.files.find(f => f.name === 'sm_core.c')?.content || '';

    // Verify config.h contains state_active bool array
    expect(configH).toContain('bool state_active[SM_NUM_STATES + 1U];');

    // Verify sm_core.c uses state_active checks and priority order execution
    expect(coreC).toContain('instance->state_active[1U] = true;');
    expect(coreC).toContain('instance->state_active[2U] = true;');
    expect(coreC).toContain('if (instance->state_active[1U]) {');
    expect(coreC).toContain('if (instance->state_active[2U]) {');
  });

  it('should generate correct C code for parallel states with internal transitions', () => {
    const parallelStates: StateData[] = [
      {
        id: 's1', name: 'StateA', x: 0, y: 0, width: 100, height: 100,
        entry: '', during: '', exit: '',
        isActive: false, color: 'blue', parentId: 'root', children: [],
        priority: 1, isParallel: true, regionId: 'REGION_A', autostart: true,
        internalTransitions: '[is_active] / counter = 10;'
      },
      {
        id: 's2', name: 'StateB', x: 200, y: 0, width: 100, height: 100,
        entry: '', during: '', exit: '',
        isActive: false, color: 'green', parentId: 'root', children: [],
        priority: 2, isParallel: true, regionId: 'REGION_B', autostart: true
      }
    ];

    const parallelChart = {
      tickMs: 10,
      states: parallelStates,
      junctions: [] as JunctionData[],
      transitions: [] as TransitionData[],
      variables: mockVariables,
      layers: mockLayers,
      safetyMode: false
    };

    const result = generateMISRACCode(parallelChart);
    expect(result.errors).toHaveLength(0);

    const coreC = result.files.find(f => f.name === 'sm_core.c')?.content || '';

    // Verify it parses the internal transition and uses local transitioned flag
    expect(coreC).toContain('bool transitioned_1 = false;');
    expect(coreC).toContain('if ((instance->data.is_active)) {');
    expect(coreC).toContain('instance->data.counter = (uint16_t)(10U);');
    expect(coreC).toContain('transitioned_1 = true;');
    
    // Specifically ensure SM_Step_Layer_0 body doesn't contain early return;
    const stepLayerFuncStart = coreC.indexOf('static void SM_Step_Layer_0');
    expect(stepLayerFuncStart).toBeGreaterThan(-1);
    const stepLayerFuncEnd = coreC.indexOf('}', stepLayerFuncStart);
    const stepLayerFuncBody = coreC.substring(stepLayerFuncStart, stepLayerFuncEnd);
    expect(stepLayerFuncBody).not.toContain('return;');
  });

  it('should generate MISRA-C and SIL-2 safety checks with explicit timer and type conversions', () => {
    const customStates: StateData[] = [
      {
        id: 's1', name: 'StateWithLongNameThatNeedsTruncationForMISRACompliance', x: 0, y: 0, width: 100, height: 100,
        entry: '', during: '', exit: '',
        isActive: false, color: 'blue', parentId: 'root', children: [],
        priority: 1, isParallel: false, regionId: 'LONG_REGION_NAME_THAT_NEEDS_TRUNCATION', autostart: true,
        isSafeState: true,
        internalTransitions: 'after(5) / counter = 15;\n[is_active] / counter = 0;'
      }
    ];

    const customLayers: Layer[] = [
      { id: 'root', name: 'root', parentStateId: null, stateIds: ['s1'], transitionIds: [], junctionIds: [] }
    ];

    const customChart = {
      tickMs: 20,
      states: customStates,
      junctions: [] as JunctionData[],
      transitions: [] as TransitionData[],
      variables: mockVariables,
      layers: customLayers,
      safetyMode: true
    };

    const result = generateMISRACCode(customChart);
    expect(result.errors).toHaveLength(0);

    const configH = result.files.find(f => f.name === 'sm_config.h')?.content || '';
    const coreC = result.files.find(f => f.name === 'sm_core.c')?.content || '';
    const safetyC = result.files.find(f => f.name === 'sm_safety.c')?.content || '';

    // Verify MISRA 5.1 Name Truncation
    expect(configH).toContain('SM_ST_STATEWITHLONGNAMETHATN'); // Max 28 chars
    expect(configH).toContain('SM_GRP_LONG_REGION_NAME_THAT'); // Max 28 chars

    // Verify SM_TICK_MS #define macro
    expect(configH).toContain('#define SM_TICK_MS (20U)');

    // Verify SM_Validate_State_Consistency call in coreC and definition in safetyC
    expect(coreC).toContain('instance->error_status = SM_Validate_State_Consistency(instance);');
    expect(safetyC).toContain('SM_Error_t SM_Validate_State_Consistency(const ADIA_Instance_t* instance)');
    expect(safetyC).toContain('SM_March_RAM_Test');

    // Verify after(5) transition checks (5 * 20 = 100ms) using named macro
    expect(configH).toContain('#define SM_TMR_TR_INT_S1_0_MS (100U)');
    expect(coreC).toContain('(instance->state_timers[1U] >= SM_TMR_TR_INT_S1_0_MS)');
  });

  it('should support floating-point/decimal tick rates (e.g. 0.5 ms)', () => {
    const customStates: StateData[] = [
      {
        id: 's1', name: 'State_1', entry: 'counter = 0;', during: '', exit: '',
        priority: 1, isParallel: false, regionId: 'r1', autostart: true,
        internalTransitions: 'after(3) / counter = 10;',
        x: 0, y: 0, width: 100, height: 100,
        isActive: false, color: 'blue', parentId: 'root', children: []
      }
    ];

    const customLayers: Layer[] = [
      { id: 'root', name: 'root', parentStateId: null, stateIds: ['s1'], transitionIds: [], junctionIds: [] }
    ];

    const customChart = {
      tickMs: 0.5,
      states: customStates,
      junctions: [] as JunctionData[],
      transitions: [] as TransitionData[],
      variables: mockVariables,
      layers: customLayers,
      safetyMode: false
    };

    const result = generateMISRACCode(customChart);
    expect(result.errors).toHaveLength(0);

    const configH = result.files.find(f => f.name === 'sm_config.h')?.content || '';
    const coreC = result.files.find(f => f.name === 'sm_core.c')?.content || '';

    // Verify tickMs suffix is 'f'
    expect(configH).toContain('#define SM_TICK_MS (0.5f)');
    // Verify state timers array is of float type
    expect(configH).toContain('float state_timers[');
    expect(configH).toContain('float state_timer;');
    // Verify SM_Step uses float for delta_ms
    expect(coreC).toContain('void SM_Step(ADIA_Instance_t* instance, float delta_ms)');
    // Verify transition condition uses f suffix for 3 * 0.5 = 1.5 via named macro
    expect(configH).toContain('#define SM_TMR_TR_INT_S1_0_MS (1.5f)');
    expect(coreC).toContain('(instance->state_timers[1U] >= SM_TMR_TR_INT_S1_0_MS)');
  });

  it('should not corrupt local variables or parameter names when user defines variables like i, state, instance', () => {
    const customVariables: VariableDef[] = [
      { id: 'v1', name: 'i', type: 'uint8', initialValue: '0', currentValue: 0, visibleInScope: true },
      { id: 'v2', name: 'state', type: 'uint8', initialValue: '0', currentValue: 0, visibleInScope: true },
      { id: 'v3', name: 'instance', type: 'uint8', initialValue: '0', currentValue: 0, visibleInScope: true },
      { id: 'v4', name: 'is_active', type: 'bool', initialValue: 'false', currentValue: false, visibleInScope: true },
      { id: 'v5', name: 'counter', type: 'uint16', initialValue: '0', currentValue: 0, visibleInScope: true },
      { id: 'v6', name: 'sensor_val', type: 'float', initialValue: '0.0', currentValue: 0.0, visibleInScope: true }
    ];

    const customChart = {
      tickMs: 10,
      states: mockStates,
      junctions: [] as JunctionData[],
      transitions: mockTransitions,
      variables: customVariables,
      layers: mockLayers,
      safetyMode: false
    };

    const result = generateMISRACCode(customChart);
    expect(result.errors).toHaveLength(0);
    const coreC = result.files.find(f => f.name === 'sm_core.c')?.content || '';

    // Check that function signatures and standard loops are not corrupted
    expect(coreC).toContain('static void SM_Exit_State(ADIA_Instance_t* instance, SM_Node_t state)');
    expect(coreC).toContain('static void SM_Enter_State(ADIA_Instance_t* instance, SM_Node_t state, bool use_history)');
    /* sm_iter is the MISRA-compliant loop variable name (Fix 2) */
    expect(coreC).toContain('uint32_t sm_iter;');
    expect(coreC).toContain('for (sm_iter = 0U; sm_iter < SM_NUM_LAYERS; sm_iter++)');
    expect(coreC).toContain('void SM_Init(ADIA_Instance_t* instance)');
  });

  it('should compile the generated C/H files using avr-gcc', () => {
    // Test compilation of standard chart
    const result = generateMISRACCode(chart);
    expect(result.errors).toHaveLength(0);

    const tempDir = path.join(__dirname, '../../scratch/test_compile');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // Write all files
    result.files.forEach(f => {
      if (f.name.endsWith('.c') || f.name.endsWith('.h')) {
        fs.writeFileSync(path.join(tempDir, f.name), f.content);
      }
    });

    const compilerPath = path.join(__dirname, '../../avr-gcc/avr-gcc-15.2.0-x64-windows/bin/avr-gcc.exe');
    if (fs.existsSync(compilerPath)) {
      try {
        const includeFlag1 = `-I.`;
        const includeFlag2 = `-I"${path.join(__dirname, '../../avr-gcc/avr-gcc-15.2.0-x64-windows/avr/include')}"`;
        const mcuFlag = `-D__AVR_ATmega2560__`;
        const cpuFlag = `-DF_CPU=16000000UL`;
        const avrFlag = `-D__AVR__`;
        
        execSync(
          `"${compilerPath}" -Wall -Wextra -Werror -c sm_core.c sm_safety.c sm_user_logic.c ${includeFlag1} ${includeFlag2} ${mcuFlag} ${cpuFlag} ${avrFlag}`,
          { cwd: tempDir, stdio: 'pipe' }
        );
      } catch (err: any) {
        console.error('Compilation failed:', err.stdout?.toString() || err.stderr?.toString() || err.message);
        throw err;
      }
    } else {
      throw new Error(`avr-gcc compiler not found, compilation test failed. Expected path: ${compilerPath}`);
    }
  });

  /* ------------------------------------------------------------------ */
  /* New MISRA C:2012 Compliance Tests                                    */
  /* ------------------------------------------------------------------ */

  it('should use UINT32_MAX instead of magic number 4294967295', () => {
    const result = generateMISRACCode(chart);
    expect(result.errors).toHaveLength(0);
    const coreC = result.files.find(f => f.name === 'sm_core.c')?.content || '';
    /* MISRA 7.2: No magic literals — must use UINT32_MAX */
    expect(coreC).not.toContain('4294967295');
    expect(coreC).toContain('UINT32_MAX');
  });

  it('should use FLT_MAX instead of magic float literal for float tick rate', () => {
    const floatChart = {
      ...chart,
      tickMs: 0.5
    };
    const result = generateMISRACCode(floatChart);
    expect(result.errors).toHaveLength(0);
    const coreC = result.files.find(f => f.name === 'sm_core.c')?.content || '';
    /* MISRA 7.2: No magic float literals — must use FLT_MAX */
    expect(coreC).not.toContain('3.40282347e+38f');
    expect(coreC).toContain('FLT_MAX');
    /* <float.h> must be included when FLT_MAX is used */
    expect(coreC).toContain('#include <float.h>');
  });

  it('should declare all loop variables at top of SM_Init, SM_Reset and SM_Step (MISRA 8.7)', () => {
    /* Use a safety-mode chart so the watchdog/safety path is exercised in SM_Step */
    const safeStates = mockStates.map((s, i) => ({ ...s, isSafeState: i === 0 }));
    const safetyChart = { ...chart, states: safeStates, safetyMode: true };
    const result = generateMISRACCode(safetyChart);
    expect(result.errors).toHaveLength(0);
    const coreC = result.files.find(f => f.name === 'sm_core.c')?.content || '';

    /* Verify sm_iter is present and no mid-block declaration of uint32_t remains */
    expect(coreC).toContain('uint32_t sm_iter;');
    /* Verify loops use sm_iter, not the old single-char 'i' */
    expect(coreC).toContain('for (sm_iter = 0U; sm_iter < SM_NUM_LAYERS; sm_iter++)');
    expect(coreC).toContain('for (sm_iter = 0U; sm_iter <= SM_NUM_STATES; sm_iter++)');

    /* Bound the search to only the SM_Step function definition body.
     * We look for the function body starting with the open brace '{' to skip the forward declarations.
     * SM_Exit_State is the first static helper defined after SM_Step. */
    const stepStart = coreC.indexOf('void SM_Step(ADIA_Instance_t* instance, uint32_t delta_ms) {');
    expect(stepStart).toBeGreaterThan(-1);
    const helperStart = coreC.indexOf('\nstatic void SM_Exit_State(', stepStart);
    const stepBody = helperStart > -1
      ? coreC.substring(stepStart, helperStart)
      : coreC.substring(stepStart, stepStart + 2000);

    /* sm_iter declaration must appear BEFORE SM_Watchdog_Kick */
    const smIterDeclPos = stepBody.indexOf('uint32_t sm_iter;');
    const watchdogPos   = stepBody.indexOf('SM_Watchdog_Kick');
    expect(smIterDeclPos).toBeGreaterThan(-1);
    expect(watchdogPos).toBeGreaterThan(-1);
    expect(smIterDeclPos).toBeLessThan(watchdogPos);

    /* No ADDITIONAL uint32_t declaration should appear after the initial one in SM_Step */
    const afterFirstDecl   = stepBody.indexOf('SM_Watchdog_Kick');
    const secondDeclInStep = stepBody.indexOf('uint32_t', afterFirstDecl);
    expect(secondDeclInStep).toBe(-1);
  });

  it('should check for overflow without relying on wrap-around (MISRA 12.4)', () => {
    const result = generateMISRACCode(chart);
    expect(result.errors).toHaveLength(0);
    const coreC = result.files.find(f => f.name === 'sm_core.c')?.content || '';
    /* The state_timer overflow guard must check delta_ms > (UINT32_MAX - state_timer) */
    expect(coreC).toContain('delta_ms > (UINT32_MAX - instance->state_timer)');
    /* Individual timer increment guards must also check delta_ms > (UINT32_MAX - state_timers[i]) */
    expect(coreC).toContain('delta_ms > (UINT32_MAX - instance->state_timers[1U])');
  });

  it('should hoist variable declarations to top of sm_safety.c functions (MISRA 8.7)', () => {
    const result = generateMISRACCode(chart);
    expect(result.errors).toHaveLength(0);
    const safetyC = result.files.find(f => f.name === 'sm_safety.c')?.content || '';
    /* SM_Safety_Check contains no fabricated CRC variables */
    const fnStart = safetyC.indexOf('void SM_Safety_Check(');
    expect(fnStart).toBeGreaterThan(-1);
    const fnBody = safetyC.substring(fnStart);
    expect(fnBody).not.toContain('calculated_crc');
    /* The RAM March test loop variable is declared at the top of its function */
    const marchStart = safetyC.indexOf('static bool SM_March_RAM_Test(void) {');
    expect(marchStart).toBeGreaterThan(-1);
    const marchBody = safetyC.substring(marchStart);
    const declPos = marchBody.indexOf('uint32_t i;');
    const firstLoopPos = marchBody.indexOf('for (');
    expect(declPos).toBeGreaterThan(-1);
    expect(declPos).toBeLessThan(firstLoopPos);
    /* SM_Validate_State_Consistency must use sm_iter */
    expect(safetyC).toContain('uint32_t sm_iter;');
    expect(safetyC).toContain('for (sm_iter = 0U; sm_iter < SM_NUM_LAYERS; sm_iter++)');
  });

  it('should produce no (bool)(1) or (bool)(0) literals in any generated file (MISRA 10.1/10.3)', () => {
    const result = generateMISRACCode(chart);
    expect(result.errors).toHaveLength(0);
    result.files
      .filter(f => f.name.endsWith('.c') || f.name.endsWith('.h'))
      .forEach(f => {
        expect(f.content).not.toContain('(bool)(1)');
        expect(f.content).not.toContain('(bool)(0)');
      });
  });

  it('should include sm_safety.h and sm_safety.c in the generated output', () => {
    const result = generateMISRACCode(chart);
    expect(result.errors).toHaveLength(0);
    const names = result.files.map(f => f.name);
    expect(names).toContain('sm_safety.h');
    expect(names).toContain('sm_safety.c');
    /* sm_safety.h must include system headers for standalone compilation */
    const safetyH = result.files.find(f => f.name === 'sm_safety.h')?.content || '';
    expect(safetyH).toContain('#include <stdint.h>');
    expect(safetyH).toContain('#include <stdbool.h>');
  });

  it('should use system-headers-first include order in sm_core.c (MATLAB EC style)', () => {
    const result = generateMISRACCode(chart);
    expect(result.errors).toHaveLength(0);
    const coreC = result.files.find(f => f.name === 'sm_core.c')?.content || '';
    /* System includes must come before project includes */
    const stdintPos  = coreC.indexOf('#include <stdint.h>');
    const smCorePos  = coreC.indexOf('#include "sm_core.h"');
    expect(stdintPos).toBeGreaterThan(-1);
    expect(smCorePos).toBeGreaterThan(-1);
    expect(stdintPos).toBeLessThan(smCorePos);
  });

  it('should compile the generated C/H files for X-Bridges model using avr-gcc', () => {
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
      ],
      transitions: []
    };

    const result = generateMISRACCode(xbChart as any);
    expect(result.errors).toHaveLength(0);

    const tempDir = path.join(__dirname, '../../scratch/test_compile_xb');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    result.files.forEach(f => {
      if (f.name.endsWith('.c') || f.name.endsWith('.h')) {
        fs.writeFileSync(path.join(tempDir, f.name), f.content);
      }
    });

    const compilerPath = path.join(__dirname, '../../avr-gcc/avr-gcc-15.2.0-x64-windows/bin/avr-gcc.exe');
    if (fs.existsSync(compilerPath)) {
      try {
        const includeFlag1 = `-I.`;
        const includeFlag2 = `-I"${path.join(__dirname, '../../avr-gcc/avr-gcc-15.2.0-x64-windows/avr/include')}"`;
        const mcuFlag = `-D__AVR_ATmega2560__`;
        const cpuFlag = `-DF_CPU=16000000UL`;
        const avrFlag = `-D__AVR__`;
        
        execSync(
          `"${compilerPath}" -Wall -Wextra -Werror -c sm_core.c sm_safety.c sm_user_logic.c ${includeFlag1} ${includeFlag2} ${mcuFlag} ${cpuFlag} ${avrFlag}`,
          { cwd: tempDir, stdio: 'pipe' }
        );
      } catch (err: any) {
        console.error('X-Bridges compilation failed:', err.stdout?.toString() || err.stderr?.toString() || err.message);
        throw err;
      }
    } else {
      throw new Error(`avr-gcc compiler not found, X-Bridges compilation test failed. Expected path: ${compilerPath}`);
    }
  });

  it('should generate mcal_dio.h and implement SM_Sync_IO integration and safe watchdog kicks', () => {
    const result = generateMISRACCode(chart);
    expect(result.errors).toHaveLength(0);

    const fileNames = result.files.map(f => f.name);
    expect(fileNames).toContain('mcal_dio.h');

    const mcalDioH = result.files.find(f => f.name === 'mcal_dio.h')?.content || '';
    expect(mcalDioH).toContain('MCAL_Dio_ReadChannel');
    expect(mcalDioH).toContain('MCAL_Dio_WriteChannel');
    expect(mcalDioH).toContain('MCAL_Watchdog_Kick');

    const coreH = result.files.find(f => f.name === 'sm_core.h')?.content || '';
    expect(coreH).toContain('SM_Error_t SM_Sync_IO(ADIA_Instance_t* instance);');

    const coreC = result.files.find(f => f.name === 'sm_core.c')?.content || '';
    expect(coreC).toContain('SM_Error_t SM_Sync_IO(ADIA_Instance_t* instance) {');
    expect(coreC).toContain('MCAL_Dio_ReadChannel');

    const safetyC = result.files.find(f => f.name === 'sm_safety.c')?.content || '';
    /* Watchdog feed check */
    expect(safetyC).toContain('MCAL_Watchdog_Kick();');
    /* Array boundary safety (MISRA 18.1): reverse March loop mapped safely */
    expect(safetyC).toContain('rev_idx = (RAM_TEST_SIZE - 1U) - i;');

    /* SRS Bracket Balancing & File Completeness Verification */
    result.files.forEach(f => {
      if (f.name.endsWith('.h') || f.name.endsWith('.c')) {
        // Assert balanced curly braces
        const openBraces = (f.content.match(/\{/g) || []).length;
        const closeBraces = (f.content.match(/\}/g) || []).length;
        expect(openBraces).toBe(closeBraces);

        // Assert C comments are well-formed and closed
        let searchIdx = 0;
        while (true) {
          const nextStart = f.content.indexOf('/*', searchIdx);
          if (nextStart === -1) break;
          const nextEnd = f.content.indexOf('*/', nextStart + 2);
          expect(nextEnd).toBeGreaterThan(-1); // Verify comment is closed
          const nestedStart = f.content.indexOf('/*', nextStart + 2);
          if (nestedStart !== -1 && nestedStart < nextEnd) {
            throw new Error(`Nested comment detected in ${f.name}`);
          }
          searchIdx = nextEnd + 2;
        }

        // Assert file closing directives if it is a header file
        if (f.name.endsWith('.h')) {
          expect(f.content).toContain('#endif');
        }
      }
    });
  });

  it('should generate correct C code for nested mixed OR and AND decomposition layers', () => {
    const mixedStates: StateData[] = [
      {
        id: 'super', name: 'SuperState', x: 0, y: 0, width: 300, height: 300,
        entry: '', during: '', exit: '',
        isActive: false, color: 'blue', parentId: 'root', children: [],
        priority: 1, isParallel: false, regionId: 'MAIN', autostart: true
      },
      {
        id: 'ex_a', name: 'Ex_StateA', x: 10, y: 10, width: 80, height: 80,
        entry: '', during: '', exit: '',
        isActive: false, color: 'blue', parentId: 'super', children: [],
        priority: 1, isParallel: false, regionId: 'MAIN', autostart: true
      },
      {
        id: 'ex_b', name: 'Ex_StateB', x: 110, y: 10, width: 80, height: 80,
        entry: '', during: '', exit: '',
        isActive: false, color: 'blue', parentId: 'super', children: [],
        priority: 2, isParallel: false, regionId: 'MAIN', autostart: false
      },
      {
        id: 'par_c', name: 'Par_StateC', x: 10, y: 150, width: 80, height: 80,
        entry: '', during: '', exit: '',
        isActive: false, color: 'blue', parentId: 'super', children: [],
        priority: 1, isParallel: true, regionId: 'R1', autostart: true
      },
      {
        id: 'par_d', name: 'Par_StateD', x: 110, y: 150, width: 80, height: 80,
        entry: '', during: '', exit: '',
        isActive: false, color: 'blue', parentId: 'super', children: [],
        priority: 2, isParallel: true, regionId: 'R2', autostart: true
      }
    ];

    const mixedChart = {
      tickMs: 10,
      states: mixedStates,
      junctions: [],
      transitions: [
        {
          id: 't_ex', sourceId: 'ex_a', targetId: 'ex_b', condition: 'cond_trigger', action: '', afterTicks: null,
          type: 'condition', hasControlPoint: false, order: 1
        }
      ],
      variables: [
        { id: 'v1', name: 'cond_trigger', type: 'bool', initialValue: 'false', currentValue: false, visibleInScope: true }
      ],
      layers: [
        { id: 'root', name: 'root', parentStateId: null, stateIds: ['super'], transitionIds: [], junctionIds: [] },
        { id: 'layer_ex', name: 'Layer_Exclusive', parentStateId: 'super', stateIds: ['ex_a', 'ex_b'], transitionIds: ['t_ex'], junctionIds: [] },
        { id: 'layer_par', name: 'Layer_Parallel', parentStateId: 'super', stateIds: ['par_c', 'par_d'], transitionIds: [], junctionIds: [] }
      ],
      safetyMode: false
    };

    const result = generateMISRACCode(mixedChart as any);
    expect(result.errors).toHaveLength(0);

    const coreC = result.files.find(f => f.name === 'sm_core.c')?.content || '';
    
    // Check that entering SuperState invokes default entries of both Layer_Exclusive (index 0) and Layer_Parallel (index 1)
    expect(coreC).toContain('SM_Enter_Layer_0(instance, false);');
    expect(coreC).toContain('SM_Enter_Layer_1(instance, false);');
    
    // Check that stepping SuperState steps both layers
    expect(coreC).toContain('SM_Step_Layer_0(instance, delta_ms);');
    expect(coreC).toContain('SM_Step_Layer_1(instance, delta_ms);');

    // Check exit of SuperState exits active state in exclusive layer and parallel states in parallel layer
    expect(coreC).toContain('SM_Exit_State(instance, instance->active_states[');
    expect(coreC).toContain('SM_Exit_State(instance, SM_ST_PAR_STATEC);');
    expect(coreC).toContain('SM_Exit_State(instance, SM_ST_PAR_STATED);');
  });

  it('should return error if undeclared variables are referenced in expressions', () => {
    const invalidChart = {
      tickMs: 10,
      states: [
        {
          id: 's1', name: 'StateA', x: 0, y: 0, width: 100, height: 100,
          entry: 'undeclared_var = 10;', during: 'sin(valid_var);', exit: 'if (another_undeclared) { }',
          isActive: false, color: 'blue', parentId: 'root', children: [],
          priority: 1, isParallel: false, regionId: 'MAIN', autostart: true
        }
      ],
      junctions: [],
      transitions: [
        {
          id: 'tr1', sourceId: 's1', targetId: 's1', condition: 'undeclared_in_cond > 5', action: 'undeclared_in_act = 20;', afterTicks: null,
          type: 'condition', hasControlPoint: false, order: 1
        }
      ],
      variables: [
        { id: 'v1', name: 'valid_var', type: 'uint8', initialValue: '0', currentValue: 0, visibleInScope: true }
      ],
      layers: [
        { id: 'root', name: 'root', parentStateId: null, stateIds: ['s1'], transitionIds: ['tr1'], junctionIds: [] }
      ],
      safetyMode: false
    };

    const result = generateMISRACCode(invalidChart as any);
    expect(result.errors.length).toBe(4);
    
    const messages = result.errors.map(e => e.message);
    expect(messages).toContain("Undeclared variable 'undeclared_var' referenced in state 'StateA' entry action. Add it to the variable panel.");
    expect(messages).toContain("Undeclared variable 'another_undeclared' referenced in state 'StateA' exit action. Add it to the variable panel.");
    expect(messages).toContain("Undeclared variable 'undeclared_in_cond' referenced in transition from 'StateA' condition. Add it to the variable panel.");
    expect(messages).toContain("Undeclared variable 'undeclared_in_act' referenced in transition from 'StateA' action. Add it to the variable panel.");

    // Verify that the valid math function 'sin' and the valid variable 'valid_var' did not trigger any errors
    const hasValidVarError = result.errors.some(e => e.message.includes('valid_var') || e.message.includes('sin'));
    expect(hasValidVarError).toBe(false);
  });

  it('should correctly parse internal transitions containing division operators and block comments', () => {
    const chartWithDivision = {
      tickMs: 10,
      states: [
        {
          id: 's1', name: 'StateDiv', x: 0, y: 0, width: 100, height: 100,
          entry: 'val = 10; // set initial value',
          during: '', exit: '',
          internalTransitions: '[val / 2 > 1] /* calc */ / result_var = val / 2;',
          isActive: false, color: 'blue', parentId: 'root', children: [],
          priority: 1, isParallel: false, regionId: 'MAIN', autostart: true
        }
      ],
      junctions: [],
      transitions: [],
      variables: [
        { id: 'v1', name: 'val', type: 'uint16', initialValue: '10', currentValue: 10, visibleInScope: true },
        { id: 'v2', name: 'result_var', type: 'uint16', initialValue: '0', currentValue: 0, visibleInScope: true }
      ],
      layers: [
        { id: 'root', name: 'root', parentStateId: null, stateIds: ['s1'], transitionIds: [], junctionIds: [] }
      ],
      safetyMode: false
    };

    const result = generateMISRACCode(chartWithDivision as any);
    expect(result.errors).toHaveLength(0);

    const coreC = result.files.find(f => f.name === 'sm_core.c')?.content || '';
    expect(coreC).toContain('val / 2');
    expect(coreC).not.toContain('2 > 1] /');

    const userC = result.files.find(f => f.name === 'sm_user_logic.c')?.content || '';
    expect(userC).toContain('// set initial value');
  });

  it('should halt code generation on critical deadlocks unless allowDeadlocks is true (REQ-G-03)', () => {
    const chartDeadlock: any = {
      tickMs: 10,
      states: [
        {
          id: 's1', name: 'DeadEndState', x: 0, y: 0, width: 100, height: 100,
          entry: '', during: '', exit: '',
          isActive: false, color: 'red', parentId: 'root', children: [],
          priority: 1, isParallel: false, regionId: 'MAIN', autostart: true,
          isTerminal: false
        }
      ],
      junctions: [],
      transitions: [],
      variables: [],
      layers: [{ id: 'root', name: 'root', parentStateId: null, stateIds: ['s1'], transitionIds: [], junctionIds: [] }],
      safetyMode: true
    };

    const result = generateMISRACCode(chartDeadlock);
    expect(result.errors.some(e => e.message.includes('Critical Deadlock') || e.message.includes('deadlock'))).toBe(true);

    const resultAllowed = generateMISRACCode({ ...chartDeadlock, allowDeadlocks: true });
    expect(resultAllowed.errors.filter(e => e.message.includes('Critical Deadlock'))).toHaveLength(0);
  });

  it('should generate default fallback cases in switch statements and active during action checks (REQ-G-03)', () => {
    const testChart: any = {
      tickMs: 10,
      states: [
        {
          id: 's1', name: 'State_6_1', x: 0, y: 0, width: 100, height: 100,
          entry: '', during: '', exit: '',
          isActive: false, color: 'blue', parentId: 'root', children: [],
          priority: 1, isParallel: false, regionId: 'MAIN', autostart: true
        },
        {
          id: 's2', name: 'STATE_6_2', x: 200, y: 0, width: 100, height: 100,
          entry: '', during: 'counter = counter + 1;', exit: '',
          isActive: false, color: 'green', parentId: 'root', children: [],
          priority: 2, isParallel: false, regionId: 'MAIN', autostart: false,
          isTerminal: true
        }
      ],
      junctions: [],
      transitions: [
        {
          id: 't1', sourceId: 's1', targetId: 's2',
          condition: 'true', action: '',
          afterTicks: null, type: 'condition', hasControlPoint: false, order: 1
        }
      ],
      variables: [{ id: 'v1', name: 'counter', type: 'int', initialValue: '0', currentValue: 0, visibleInScope: true }],
      layers: [{ id: 'root', name: 'root', parentStateId: null, stateIds: ['s1', 's2'], transitionIds: ['t1'], junctionIds: [] }],
      safetyMode: false
    };

    const result = generateMISRACCode(testChart);
    const coreC = result.files.find(f => f.name === 'sm_core.c')?.content || '';
    expect(coreC).toContain('default:');
    expect(coreC).toContain('state_active');
  });
});

