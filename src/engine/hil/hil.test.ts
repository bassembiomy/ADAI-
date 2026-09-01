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
    expect(files).toHaveLength(14);


    const names = files.map(f => f.name);
    expect(names).toContain('hal_config.h');
    expect(names).toContain('hal_drivers.h');
    expect(names).toContain('hal_drivers.c');
    expect(names).toContain('hil_interface.h');
    expect(names).toContain('hil_interface.c');
    expect(names).toContain('main_hil.c');
    expect(names).toContain('platformio.ini');

    const configH = files.find(f => f.name === 'hal_config.h')?.content;
    expect(configH).toContain('#define TARGET_MCU_STM32F4');
    expect(configH).toContain('#define PIN_SENSOR_TEMP "PA0"');
    expect(configH).toContain('#define PIN_LED_STATUS "PD12"');

    const interfaceC = files.find(f => f.name === 'hil_interface.c')?.content;
    expect(interfaceC).toContain('instance->data.sensor_val =');
    expect(interfaceC).toContain('HAL_GPIO_Write(PIN_LED_STATUS');
  });

  const chart = {
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
      { id: 'v1', name: 'sensor_val', type: 'float', initialValue: '0.0', currentValue: 0, visibleInScope: true },
      { id: 'v2', name: 'is_active', type: 'bool', initialValue: 'false', currentValue: false, visibleInScope: true }
    ],
    layers: [
      { id: 'root', name: 'root', parentStateId: null, stateIds: ['s1'], transitionIds: [], junctionIds: [] }
    ],
    safetyMode: false,
    hilConfig: mockConfig
  };

  it('should integrate with stateMachineCodeGenerator generateMISRACCode', () => {
    const result = generateMISRACCode(chart as any);
    expect(result.errors).toHaveLength(0);

    // Default files (12, including both reports)
    // + HIL files (14, including component, MCAL, driver stub, and manifest) = 26 files.
    expect(result.files).toHaveLength(26);
    const names = result.files.map(f => f.name);
    expect(names).not.toContain('stm32f4xx_hal.h');
    expect(names).toContain('mcal_dio_hil.c');
    const measuredSourceCount = result.files.filter((file) =>
      /\.(?:c|h|cpp|ino)$/i.test(file.name)).length;
    const staticReport = result.files.find(
      (file) => file.name === 'static_metrics_report.md',
    )?.content;
    expect(staticReport).toContain(`| Files measured | ${measuredSourceCount} |`);

    const testingReport = result.files.find(f => f.name === 'sm_testing_report.md')?.content;
    expect(testingReport).toContain('## 8. HIL Driver Mapping Report');
    expect(testingReport).toContain('Target Microcontroller:** STM32F4');
  });

  it('should include target test shims when includeTestShims is true', () => {
    const result = generateMISRACCode(chart as any, { includeTestShims: true });
    expect(result.errors).toHaveLength(0);

    // Default files (12 after excluding the generic MCAL stub)
    // + HIL files (14) + STM32 shim (1) = 27 files.
    expect(result.files).toHaveLength(27);
    const names = result.files.map(f => f.name);
    expect(names).toContain('stm32f4xx_hal.h');
    expect(names).toContain('mcal_dio_hil.c');
    expect(names).not.toContain('mcal_dio_test_stubs.c');
  });

  it('should fail generation for an empty chart instead of emitting broken C', () => {
    const chart = {
      tickMs: 10,
      states: [],
      junctions: [],
      transitions: [],
      variables: [],
      layers: [],
      safetyMode: false
    };

    const result = generateMISRACCode(chart as any);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.files).toHaveLength(0);
  });

  it('should handle binary frame checksum mismatch and reject it', () => {
    const channelId = 'temp_sensor';
    const value = 27.5;
    const dataType = 'float';

    const encoded = encodeBinaryFrame(channelId, value, dataType);
    // Tamper with the checksum byte (last byte)
    encoded[encoded.length - 1] = (encoded[encoded.length - 1] + 1) & 0xFF;

    const decoded = decodeBinaryFrame(encoded);
    expect(decoded).toBeNull();
  });

  it('should decode empty and malformed text frames safely without setting empty keys', () => {
    const emptyDecoded = decodeTextFrame('');
    expect(emptyDecoded).toEqual({});

    const malformedDecoded = decodeTextFrame('  =100; =; motor_speed=12.5');
    expect(malformedDecoded).toEqual({ motor_speed: 12.5 });
  });

  it('should correctly round-trip binary frames for different data types', () => {
    // 1. Bool type
    const boolFrame = encodeBinaryFrame('flag', 1.0, 'bool');
    const boolDecoded = decodeBinaryFrame(boolFrame);
    expect(boolDecoded).not.toBeNull();
    expect(boolDecoded!.channelId).toBe('flag');
    expect(boolDecoded!.value).toBe(1.0);

    // 2. Double type
    const doubleFrame = encodeBinaryFrame('speed', 1234.5678, 'double');
    const doubleDecoded = decodeBinaryFrame(doubleFrame);
    expect(doubleDecoded).not.toBeNull();
    expect(doubleDecoded!.channelId).toBe('speed');
    expect(doubleDecoded!.value).toBeCloseTo(1234.5678, 4);
  });

  it('should generate correct C files for STM32F1, ESP32, and Arduino target MCUs', () => {
    // STM32F1
    const f1Config = { ...mockConfig, target: 'STM32F1' as const };
    const f1Files = generateHALCode(f1Config, smVariables);
    expect(f1Files).toHaveLength(14);
    const f1DriversC = f1Files.find(f => f.name === 'hal_drivers.c')?.content || '';
    expect(f1DriversC).toContain('#include "stm32f1xx_hal.h"');
    expect(f1DriversC).toContain('HAL_UART_Receive(&huart1');

    // ESP32
    const espConfig = { ...mockConfig, target: 'ESP32' as const };
    const espFiles = generateHALCode(espConfig, smVariables);
    expect(espFiles).toHaveLength(14);

    // Arduino_Uno
    const unoConfig = { ...mockConfig, target: 'Arduino_Uno' as const };
    const unoFiles = generateHALCode(unoConfig, smVariables);
    expect(unoFiles).toHaveLength(14);

    const mainUno = unoFiles.find(f => f.name.startsWith('main_hil'))?.content || '';
    expect(mainUno).toContain('#include "Arduino.h"');
  });


  it('should schedule HIL as explicit Read → Step → Write and report errors', () => {
    const files = generateHALCode(mockConfig, smVariables);
    const mainHil = files.find(f => f.name === 'main_hil.c')?.content || '';
    expect(mainHil).toContain('(void)SM_ReadInputs(&sm_instance);');
    expect(mainHil).toContain('(void)SM_Step(&sm_instance, SM_TICK_MS);');
    expect(mainHil).toContain('(void)SM_WriteOutputs(&sm_instance);');
    expect(mainHil).not.toContain('HIL_Sync_Inputs(&sm_instance);');
    expect(mainHil).not.toContain('HIL_Sync_Outputs(&sm_instance);');

    const interfaceC = files.find(f => f.name === 'hil_interface.c')?.content || '';
    expect(interfaceC).toContain('if (SM_GetError(instance) != SM_ERR_NONE)');
    expect(interfaceC).toContain('snprintf(buf + len, (size_t)remaining, ";ERROR=%d"');
    /* Telemetry accumulation must clamp the would-be length from snprintf */
    expect(interfaceC).toContain('len += (written < remaining) ? written : (remaining - 1);');
  });

  it('should comply with MISRA rules (no strtok, terminal else for strcmp)', () => {
    const files = generateHALCode(mockConfig, smVariables);
    const interfaceC = files.find(f => f.name === 'hil_interface.c')?.content || '';
    expect(interfaceC).not.toContain('strtok');

    const driversC = files.find(f => f.name === 'hal_drivers.c')?.content || '';
    expect(driversC).toContain('else { /* MISRA 15.7 */ }');
  });

  it('should generate correct C code for custom mathematical signal conversions', () => {
    const exprConfig: HILConfig = {
      ...mockConfig,
      mappings: [
        {
          id: 'm1',
          adiaVarId: 'sensor_val',
          channelId: 'ch1',
          direction: 'read',
          conversionExpr: 'x * 5.0f / 1023.0f'
        }
      ]
    };
    const files = generateHALCode(exprConfig, smVariables);
    const interfaceC = files.find(f => f.name === 'hil_interface.c')?.content || '';
    expect(interfaceC).toContain('((float)(HAL_ADC_Read(PIN_SENSOR_TEMP, "sensor_temp"))) * 5.0f / 1023.0f');
  });

  it('should process incoming variable override and release messages correctly', () => {
    const files = generateHALCode(mockConfig, smVariables);
    const interfaceC = files.find(f => f.name === 'hil_interface.c')?.content || '';
    
    // Check if override input is handled
    expect(interfaceC).toContain('if (strcmp(name, "sensor_temp") == 0) {');
    expect(interfaceC).toContain('override_val_sensor_temp = val;');
    expect(interfaceC).toContain('override_active_sensor_temp = true;');
    
    // Check if release of override is handled
    expect(interfaceC).toContain('} else if (strcmp(name, "sensor_temp_release") == 0) {');
    expect(interfaceC).toContain('override_active_sensor_temp = false;');
  });

  it('should include all configured channels in the HIL telemetry packet', () => {
    const files = generateHALCode(mockConfig, smVariables);
    const interfaceC = files.find(f => f.name === 'hil_interface.c')?.content || '';
    expect(interfaceC).toContain('sensor_temp=%.4f');
    expect(interfaceC).toContain('led_status=%.4f');
  });

  it('should generate correct UART and SPI driver declarations, implementations and synchronization logic', () => {
    const uartSpiConfig: HILConfig = {
      enabled: true,
      target: 'STM32F4',
      clockSpeed: 168,
      commPort: 'COM3',
      baudRate: 115200,
      channels: [
        {
          id: 'ch_uart',
          name: 'debug_uart',
          peripheral: 'UART',
          pin: 'PC10',
          direction: 'In',
          dataType: 'uint8_t',
          rangeMin: 0,
          rangeMax: 255,
          scalingFactor: 1,
          unit: ''
        },
        {
          id: 'ch_spi',
          name: 'sensor_spi',
          peripheral: 'SPI',
          pin: 'PA4',
          direction: 'Out',
          dataType: 'uint8_t',
          rangeMin: 0,
          rangeMax: 255,
          scalingFactor: 1,
          unit: ''
        }
      ],
      mappings: [
        {
          id: 'm_uart',
          adiaVarId: 'rx_data',
          channelId: 'ch_uart',
          direction: 'read'
        },
        {
          id: 'm_spi',
          adiaVarId: 'tx_data',
          channelId: 'ch_spi',
          direction: 'write'
        }
      ]
    };

    const smVars = [
      { name: 'rx_data', type: 'uint8_t' },
      { name: 'tx_data', type: 'uint8_t' }
    ];

    const files = generateHALCode(uartSpiConfig, smVars);
    expect(files).toHaveLength(14);


    const driversH = files.find(f => f.name === 'hal_drivers.h')?.content || '';
    expect(driversH).toContain('uint32_t HAL_UART_Read(const char* pin, const char* name);');
    expect(driversH).toContain('void HAL_UART_Write(const char* pin, const char* name, uint32_t value);');
    expect(driversH).toContain('uint32_t HAL_SPI_Read(const char* pin, const char* name);');
    expect(driversH).toContain('void HAL_SPI_Write(const char* pin, const char* name, uint32_t value);');

    const driversC = files.find(f => f.name === 'hal_drivers.c')?.content || '';
    expect(driversC).toContain('HAL_UART_ReadChannel(&huart3)');
    expect(driversC).toContain('HAL_SPI_WriteChannel(GPIOA, GPIO_PIN_4, value);');

    const interfaceC = files.find(f => f.name === 'hil_interface.c')?.content || '';
    expect(interfaceC).toContain('HAL_UART_Read(PIN_DEBUG_UART, "debug_uart")');
    expect(interfaceC).toContain('HAL_SPI_Write(PIN_SENSOR_SPI, "sensor_spi", (uint32_t)(instance->data.tx_data))');
  });

  it('should generate correct ADC and DAC channel selection logic on STM32F4', () => {
    const multiChannelConfig: HILConfig = {
      enabled: true,
      target: 'STM32F4',
      clockSpeed: 168,
      commPort: 'COM3',
      baudRate: 115200,
      channels: [
        {
          id: 'adc0',
          name: 'sensor_0',
          peripheral: 'ADC',
          pin: 'PA0',
          direction: 'In',
          dataType: 'float',
          rangeMin: 0,
          rangeMax: 100,
          scalingFactor: 1.0,
          unit: ''
        },
        {
          id: 'adc1',
          name: 'sensor_1',
          peripheral: 'ADC',
          pin: 'PA1',
          direction: 'In',
          dataType: 'float',
          rangeMin: 0,
          rangeMax: 100,
          scalingFactor: 1.0,
          unit: ''
        },
        {
          id: 'dac2',
          name: 'output_dac',
          peripheral: 'DAC',
          pin: 'PA5',
          direction: 'Out',
          dataType: 'float',
          rangeMin: 0,
          rangeMax: 100,
          scalingFactor: 1.0,
          unit: ''
        }
      ],
      mappings: [
        { id: 'm0', adiaVarId: 'var0', channelId: 'adc0', direction: 'read' },
        { id: 'm1', adiaVarId: 'var1', channelId: 'adc1', direction: 'read' },
        { id: 'm2', adiaVarId: 'var2', channelId: 'dac2', direction: 'write' }
      ]
    };

    const smVars = [
      { name: 'var0', type: 'float' },
      { name: 'var1', type: 'float' },
      { name: 'var2', type: 'float' }
    ];

    const files = generateHALCode(multiChannelConfig, smVars);
    const driversC = files.find(f => f.name === 'hal_drivers.c')?.content || '';
    
    // Check ADC dynamic reading with GetADCChannel
    expect(driversC).toContain('return HAL_ADC_ReadChannel(GetADCChannel("PA0"));');
    expect(driversC).toContain('return HAL_ADC_ReadChannel(GetADCChannel("PA1"));');

    // Check DAC dynamic writing with GetDACChannel
    expect(driversC).toContain('HAL_DAC_SetValue(&hdac, GetDACChannel("PA5"), DAC_ALIGN_12B_R, (uint32_t)(value));');
  });

  it('should raise warning when STM32 pin format is configured on Arduino targets', () => {
    const invalidArduinoConfig: HILConfig = {
      enabled: true,
      target: 'Arduino_Uno',
      clockSpeed: 16,
      commPort: 'COM3',
      baudRate: 115200,
      channels: [
        {
          id: 'ch_invalid',
          name: 'temp_sensor',
          peripheral: 'GPIO',
          pin: 'PA0', // STM32 style, invalid on Arduino
          direction: 'In',
          dataType: 'bool',
          rangeMin: 0,
          rangeMax: 1,
          scalingFactor: 1,
          unit: ''
        }
      ],
      mappings: [
        { id: 'm_inv', adiaVarId: 'var_inv', channelId: 'ch_invalid', direction: 'read' }
      ]
    };

    const warnings: string[] = [];
    generateHALCode(invalidArduinoConfig, [{ name: 'var_inv', type: 'bool' }], warnings);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toContain('uses STM32-style');
  });

  it('should output clean C code for Arduino Uno/Mega without C++ String class or atoi CS pin wrappers', () => {
    const arduinoConfig: HILConfig = {
      enabled: true,
      target: 'Arduino_Mega',
      clockSpeed: 16,
      commPort: 'COM3',
      baudRate: 115200,
      channels: [
        {
          id: 'ch_spi',
          name: 'spi_dev',
          peripheral: 'SPI',
          pin: '10',
          direction: 'Out',
          dataType: 'uint8_t',
          rangeMin: 0,
          rangeMax: 255,
          scalingFactor: 1,
          unit: ''
        }
      ],
      mappings: [
        { id: 'm_spi', adiaVarId: 'spi_val', channelId: 'ch_spi', direction: 'write' }
      ]
    };

    const files = generateHALCode(arduinoConfig, [{ name: 'spi_val', type: 'uint8_t' }]);
    const driversC = files.find(f => f.name === 'hal_drivers.c')?.content || '';

    // Verify String class was replaced by char rx_buffer
    expect(driversC).not.toContain('String rx_buffer');
    expect(driversC).toContain('char rx_buffer[RX_BUF_SIZE]');

    // Verify atoi was removed from SPI init/read/write
    expect(driversC).not.toContain('atoi("10")');
    expect(driversC).toContain('pinMode(10, OUTPUT)');
    expect(driversC).toContain('HAL_SPI_WriteChannel(10, value)');
  });

  it('should map LEDC channels dynamically for ESP32 PWM targets', () => {
    const espConfig: HILConfig = {
      enabled: true,
      target: 'ESP32',
      clockSpeed: 240,
      commPort: 'COM3',
      baudRate: 115200,
      channels: [
        {
          id: 'pwm1',
          name: 'led_red',
          peripheral: 'PWM',
          pin: '2',
          direction: 'Out',
          dataType: 'float',
          rangeMin: 0,
          rangeMax: 255,
          scalingFactor: 1,
          unit: ''
        }
      ],
      mappings: [
        { id: 'm_pwm', adiaVarId: 'red_val', channelId: 'pwm1', direction: 'write' }
      ]
    };

    const files = generateHALCode(espConfig, [{ name: 'red_val', type: 'float' }]);
    const driversC = files.find(f => f.name === 'hal_drivers.c')?.content || '';
    
    expect(driversC).toContain('GetLEDCChannel(atoi("2"))');
    expect(driversC).toContain('ledcWrite(GetLEDCChannel(atoi("2")), value)');
  });

  it('should warn on Arduino targets when pins 0 or 1 are used for channel pins', () => {
    const arduinoConfig: HILConfig = {
      ...mockConfig,
      target: 'Arduino_Mega',
      channels: [
        {
          id: 'ch_rx',
          name: 'sensor_rx',
          peripheral: 'GPIO',
          pin: '0',
          direction: 'In',
          dataType: 'bool',
          rangeMin: 0,
          rangeMax: 1,
          scalingFactor: 1,
          unit: ''
        }
      ],
      mappings: [{ id: 'm0', adiaVarId: 'is_active', channelId: 'ch_rx', direction: 'read' }]
    };

    const warnings: string[] = [];
    generateHALCode(arduinoConfig, smVariables, warnings);
    expect(warnings.some(w => w.includes("Hardware Serial RX/TX pin"))).toBe(true);
  });

  it('should cast override float value explicitly to SM variable type in hil_interface.c', () => {
    const files = generateHALCode(mockConfig, smVariables);
    const interfaceC = files.find(f => f.name === 'hil_interface.c')?.content || '';
    expect(interfaceC).toContain('instance->data.sensor_val = (float)(override_val_sensor_temp);');
  });

  it('should emit exact target selection, MCAL contract, and an honest integration manifest', () => {
    const exactConfig: HILConfig = {
      ...mockConfig,
      target: 'STM32F4',
      targetSelection: {
        targetId: 'stm32f407vgt6',
        packVersion: '1.0.0',
        driverMode: 'bare-metal',
        boardRevision: 'A',
      },
    };
    const files = generateHALCode(exactConfig, smVariables);
    const mcalHeader = files.find(file => file.name === 'adia_mcal.h')?.content ?? '';
    const manifestText = files.find(file => file.name === 'integration_manifest.json')?.content ?? '';
    expect(mcalHeader).toContain('Target: stm32f407vgt6');
    expect(mcalHeader).toContain('adia_mcal_gpio_channel_t');
    const manifest = JSON.parse(manifestText);
    expect(manifest.targetSelection).toEqual(exactConfig.targetSelection);
    expect(manifest.flashBlocked).toBe(true);
    expect(manifest.blockReasons).toContain('TARGET_DRIVER_PROVIDER_NOT_GENERATED');
  });
});
