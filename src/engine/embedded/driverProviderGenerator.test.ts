import { describe, it, expect } from 'vitest';
import { generateDriverProviders } from './driverProviderGenerator.js';
import { loadBuiltinPack } from '../targetPacks/builtinPackLoader.js';
import type { HILConfig } from '../hil/hilTypes.js';

describe('driverProviderGenerator', () => {
  it('generates exact driver files and records channel providers in integration manifest', async () => {
    const stm32f4Pack = (await loadBuiltinPack('stm32f407vgt6')).manifest;
    const config: HILConfig = {
      enabled: true,
      clockSpeed: 168,
      commPort: 'COM1',
      baudRate: 115200,
      target: 'STM32F4',
      targetSelection: {
        targetId: 'stm32f407vgt6',
        packVersion: '1.0.0',
        driverMode: 'vendor',
        boardRevision: 'A',
      },
      channels: [
        { id: 'motor_pwm', name: 'Motor PWM', direction: 'Out', peripheral: 'PWM', pin: 'PD12', dataType: 'uint16_t', scalingFactor: 1, unit: '%', rangeMin: 0, rangeMax: 100 },
        { id: 'status_led', name: 'Status LED', direction: 'Out', peripheral: 'GPIO', pin: 'PA0', dataType: 'bool', scalingFactor: 1, unit: 'bool', rangeMin: 0, rangeMax: 1 },
      ],
      mappings: [],
    };

    const result = generateDriverProviders(config, stm32f4Pack);
    expect(result.channels).toContainEqual(expect.objectContaining({
      channelId: 'motor_pwm',
      peripheral: 'pwm',
      stub: false,
    }));

    const filePaths = result.files.map(f => f.path);
    expect(filePaths).toContain('src/driver/adia_mcal_pwm.c');
    expect(filePaths).toContain('src/driver/adia_mcal_gpio.c');
    expect(filePaths).not.toContain('src/driver/adia_mcal_adc.c');
  });

  it('marks unsupported peripherals as stub=true and returns ADIA_MCAL_NOT_IMPLEMENTED', async () => {
    const stm32f1Pack = (await loadBuiltinPack('stm32f103c8t6')).manifest;
    const config: HILConfig = {
      enabled: true,
      clockSpeed: 72,
      commPort: 'COM1',
      baudRate: 115200,
      target: 'STM32F1',
      targetSelection: {
        targetId: 'stm32f103c8t6',
        packVersion: '1.0.0',
        driverMode: 'vendor',
        boardRevision: 'A',
      },
      channels: [
        { id: 'sensor_dac', name: 'Sensor DAC', direction: 'Out', peripheral: 'DAC', pin: 'PA4', dataType: 'float', scalingFactor: 1, unit: 'V', rangeMin: 0, rangeMax: 3.3 },
      ],
      mappings: [],
    };

    const result = generateDriverProviders(config, stm32f1Pack);
    expect(result.channels).toContainEqual(expect.objectContaining({
      channelId: 'sensor_dac',
      peripheral: 'dac',
      stub: true,
      reason: 'UNSUPPORTED_PERIPHERAL',
    }));

    const dacFile = result.files.find(f => f.path === 'src/driver/adia_mcal_dac.c');
    expect(dacFile).toBeDefined();
    expect(dacFile?.content).toContain('ADIA_MCAL_NOT_IMPLEMENTED');
  });
});
