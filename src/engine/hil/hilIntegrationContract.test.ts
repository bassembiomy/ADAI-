import { describe, it, expect } from 'vitest';
import { generateMISRACCode } from '../../utils/stateMachineCodeGenerator';
import type { HILConfig, TargetMCU } from './hilTypes';

const makeChart = (target: TargetMCU = 'STM32F4') => {
  const hilConfig: HILConfig = {
    enabled: true,
    target,
    targetSelection: {
      targetId: target === 'STM32F4' ? 'stm32f407vgt6' : target === 'STM32F1' ? 'stm32f103c8t6' : target === 'ESP32' ? 'esp32-wroom-32' : 'atmega328p',
      packVersion: '1.0.0',
      driverMode: 'vendor',
      boardRevision: 'A',
    },
    clockSpeed: 168,
    commPort: 'COM3',
    baudRate: 115200,
    channels: [
      {
        id: 'ch_adc',
        name: 'sensor_temp',
        peripheral: 'ADC',
        pin: target.startsWith('Arduino') ? 'A0' : target === 'ESP32' ? '32' : 'PA0',
        direction: 'In',
        dataType: 'float',
        rangeMin: 0,
        rangeMax: 100,
        scalingFactor: 0.024,
        unit: 'C',
      },
      {
        id: 'ch_gpio',
        name: 'alarm_led',
        peripheral: 'GPIO',
        pin: target.startsWith('Arduino') ? '13' : target === 'ESP32' ? '2' : 'PD12',
        direction: 'Out',
        dataType: 'bool',
        rangeMin: 0,
        rangeMax: 1,
        scalingFactor: 1,
        unit: '',
      },
    ],
    mappings: [
      { id: 'm1', adiaVarId: 'temp_reading', channelId: 'ch_adc', direction: 'read' },
      { id: 'm2', adiaVarId: 'alarm_active', channelId: 'ch_gpio', direction: 'write' },
    ],
  };

  return {
    tickMs: 10,
    states: [
      {
        id: 's1', name: 'Monitor', x: 0, y: 0, width: 100, height: 100,
        entry: '', during: '', exit: '',
        isActive: false, color: 'blue', parentId: 'root', children: [],
        priority: 1, isParallel: false, regionId: 'MAIN', autostart: true
      }
    ],
    junctions: [],
    transitions: [],
    variables: [
      { id: 'v1', name: 'temp_reading', type: 'float', initialValue: '25.0', currentValue: 25.0, visibleInScope: true },
      { id: 'v2', name: 'alarm_active', type: 'bool', initialValue: 'false', currentValue: false, visibleInScope: true },
    ],
    layers: [
      { id: 'root', name: 'root', parentStateId: null, stateIds: ['s1'], transitionIds: [], junctionIds: [] }
    ],
    safetyMode: false,
    hilConfig,
  };
};

describe('HIL Driver <-> Generated SM Integration Contract', () => {
  it('emits all required layers of the software architecture', () => {
    const chart = makeChart('STM32F4');
    const result = generateMISRACCode(chart as any, { includeTestShims: true });

    expect(result.errors).toHaveLength(0);
    const fileNames = result.files.map(f => f.name);

    // SM Engine Layer
    expect(fileNames).toContain('sm_core.h');
    expect(fileNames).toContain('sm_core.c');
    expect(fileNames).toContain('sm_mapping.h');
    expect(fileNames).toContain('sm_mapping.c');
    expect(fileNames).toContain('sm_safety.h');
    expect(fileNames).toContain('sm_safety.c');
    expect(fileNames).toContain('sm_user_logic.c');

    // HIL Interface Layer
    expect(fileNames).toContain('hil_interface.h');
    expect(fileNames).toContain('hil_interface.c');
    expect(fileNames).toContain('main_hil.c');

    // MCAL and Hardware Drivers
    expect(fileNames).toContain('hal_config.h');
    expect(fileNames).toContain('hal_drivers.h');
    expect(fileNames).toContain('hal_drivers.c');
    expect(fileNames).toContain('adia_mcal.h');
    expect(fileNames).toContain('adia_mcal.c');
    expect(fileNames).toContain('adia_component.h');
    expect(fileNames).toContain('adia_component.c');
    expect(fileNames).toContain('mcal_dio.h');
    expect(fileNames).toContain('mcal_dio_hil.c');
    expect(fileNames).toContain('integration_manifest.json');
  });

  it('correctly connects ReadInputs -> SM_Step -> WriteOutputs in hil_interface.c', () => {
    const chart = makeChart('STM32F4');
    const result = generateMISRACCode(chart as any);
    const interfaceC = result.files.find(f => f.name === 'hil_interface.c')?.content || '';

    // Step invocation and synchronization
    expect(interfaceC).toContain('void HIL_Sync_Inputs(ADIA_Instance_t* instance)');
    expect(interfaceC).toContain('void HIL_Sync_Outputs(ADIA_Instance_t* instance)');
    expect(interfaceC).toContain('void HIL_ProcessMessage(const char* msg)');
    expect(interfaceC).toContain('void HIL_SendTelemetry(ADIA_Instance_t* instance)');

    // Channel mapping read logic
    expect(interfaceC).toContain('instance->data.temp_reading =');
    expect(interfaceC).toContain('HAL_ADC_Read');

    // Channel mapping write logic
    expect(interfaceC).toContain('HAL_GPIO_Write');
  });

  it('declares volatile overrides to avoid compiler register-caching during HIL injection', () => {
    const chart = makeChart('STM32F4');
    const result = generateMISRACCode(chart as any);
    const interfaceC = result.files.find(f => f.name === 'hil_interface.c')?.content || '';

    expect(interfaceC).toContain('static volatile float override_val_sensor_temp');
    expect(interfaceC).toContain('static volatile bool override_active_sensor_temp');
  });

  it('includes exact target metadata and certified driver status in integration_manifest.json', () => {
    const chart = makeChart('STM32F4');
    const result = generateMISRACCode(chart as any);
    const manifestText = result.files.find(f => f.name === 'integration_manifest.json')?.content || '{}';
    const manifest = JSON.parse(manifestText);

    expect(manifest.targetSelection).toMatchObject({
      targetId: 'stm32f407vgt6',
      packVersion: '1.0.0',
      driverMode: 'vendor',
      boardRevision: 'A',
    });
    expect(manifest.schemaVersion).toBe('1.0.0');
    expect(manifest.generatedLayers).toContain('mcal');
    expect(manifest.flashBlocked).toBe(false);
  });
});
