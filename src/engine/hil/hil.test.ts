import { describe, it, expect } from 'vitest';
import { encodeBinaryFrame, decodeBinaryFrame, encodeTextFrame, decodeTextFrame } from './hilProtocol';
import { generateHALCode } from './hilCodeGenerator';
import { HILConfig } from './hilTypes';
import { generateMISRACCode } from '../../utils/stateMachineCodeGenerator';

describe('HIL Protocol', () => {
  it('should encode and decode binary frames correctly', () => {
    const channelId = 'temp_sensor';
    const value = 27.5;
    const dataType = 'float';

    const encoded = encodeBinaryFrame(channelId, value, dataType);
    expect(encoded[0]).toBe(0xAA); // Start byte

    const decoded = decodeBinaryFrame(encoded);
    expect(decoded).not.toBeNull();
    expect(decoded!.channelId).toBe(channelId);
    expect(decoded!.value).toBeCloseTo(value, 4);
  });

  it('should encode and decode text frames correctly', () => {
    const values = {
      motor_speed: 125.4,
      is_active: 1.0,
      adc_raw: 2048
    };

    const encoded = encodeTextFrame(values);
    expect(encoded).toBe('motor_speed=125.4000;is_active=1.0000;adc_raw=2048.0000\n');

    const decoded = decodeTextFrame(encoded);
    expect(decoded.motor_speed).toBeCloseTo(125.4, 4);
    expect(decoded.is_active).toBe(1.0);
    expect(decoded.adc_raw).toBe(2048);
  });
});

describe('HIL Code Generator', () => {
  const mockConfig: HILConfig = {
    enabled: true,
    target: 'STM32F4',
    clockSpeed: 168,
    commPort: 'COM3',
    baudRate: 115200,
    channels: [
      {
        id: 'ch1',
        name: 'sensor_temp',
        peripheral: 'ADC',
        pin: 'PA0',
        direction: 'In',
        dataType: 'float',
        rangeMin: 0,
        rangeMax: 100,
        scalingFactor: 0.024,
        unit: 'C'
      },
      {
        id: 'ch2',
        name: 'led_status',
        peripheral: 'GPIO',
        pin: 'PD12',
        direction: 'Out',
        dataType: 'bool',
        rangeMin: 0,
        rangeMax: 1,
        scalingFactor: 1,
        unit: ''
      }
    ],
    mappings: [
      {
        id: 'm1',
        adiaVarId: 'sensor_val',
        channelId: 'ch1',
        direction: 'read'
      },
      {
        id: 'm2',
        adiaVarId: 'is_active',
        channelId: 'ch2',
        direction: 'write'
      }
    ]
  };

  const smVariables = [
    { name: 'sensor_val', type: 'float' },
    { name: 'is_active', type: 'bool' }
  ];

  it('should generate all HIL driver files for STM32F4', () => {
    const files = generateHALCode(mockConfig, smVariables);
    expect(files).toHaveLength(6);

    const names = files.map(f => f.name);
    expect(names).toContain('hal_config.h');
    expect(names).toContain('hal_drivers.h');
    expect(names).toContain('hal_drivers.c');
    expect(names).toContain('hil_interface.h');
    expect(names).toContain('hil_interface.c');
    expect(names).toContain('main_hil.c');

    const configH = files.find(f => f.name === 'hal_config.h')?.content;
    expect(configH).toContain('#define TARGET_MCU_STM32F4');
    expect(configH).toContain('#define PIN_SENSOR_TEMP "PA0"');
    expect(configH).toContain('#define PIN_LED_STATUS "PD12"');

    const interfaceC = files.find(f => f.name === 'hil_interface.c')?.content;
    expect(interfaceC).toContain('instance->data.sensor_val =');
    expect(interfaceC).toContain('HAL_GPIO_Write(PIN_LED_STATUS');
  });

  it('should integrate with stateMachineCodeGenerator generateMISRACCode', () => {
    const chart = {
      tickMs: 10,
      states: [],
      junctions: [],
      transitions: [],
      variables: [
        { id: 'v1', name: 'sensor_val', type: 'float', initialValue: '0.0', currentValue: 0, visibleInScope: true },
        { id: 'v2', name: 'is_active', type: 'bool', initialValue: 'false', currentValue: false, visibleInScope: true }
      ],
      layers: [],
      safetyMode: false,
      hilConfig: mockConfig
    };

    const result = generateMISRACCode(chart as any);
    expect(result.errors).toHaveLength(0);
    
    // Default files (8) + HIL files (6) = 14 files
    expect(result.files).toHaveLength(14);

    const testingReport = result.files.find(f => f.name === 'sm_testing_report.md')?.content;
    expect(testingReport).toContain('## 8. HIL Driver Mapping Report');
    expect(testingReport).toContain('Target Microcontroller:** STM32F4');
  });
});
