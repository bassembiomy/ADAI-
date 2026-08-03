import { describe, expect, it } from 'vitest';
import { generateEmbeddedLayers } from './embeddedLayerGenerator.js';
import type { HILConfig } from '../hil/hilTypes.js';

const config: HILConfig = {
  enabled: true,
  target: 'STM32F4',
  targetSelection: {
    targetId: 'stm32f407vgt6',
    packVersion: '1.0.0',
    driverMode: 'vendor',
    boardRevision: 'A',
  },
  clockSpeed: 168,
  channels: [
    { id: 'LED_0', name: 'led', peripheral: 'GPIO', pin: 'PD12', direction: 'Out', dataType: 'bool', rangeMin: 0, rangeMax: 1, scalingFactor: 1, unit: '' },
  ],
  mappings: [{ id: 'map-led', adiaVarId: 'led', channelId: 'LED_0', direction: 'write', safeValue: false }],
  commPort: 'COM3',
  baudRate: 115200,
};

describe('generateEmbeddedLayers', () => {
  it('automatically emits component, MCAL, driver-stub, and manifest layers', () => {
    const result = generateEmbeddedLayers(config);
    expect(result.files.map(file => file.name)).toEqual([
      'adia_mcal.h',
      'adia_mcal.c',
      'adia_component.h',
      'adia_component.c',
      'integration_manifest.json',
    ]);
    expect(result.files.find(file => file.name === 'adia_component.c')?.content)
      .toContain('SM_ReadInputs(instance)');
    expect(result.files.find(file => file.name === 'adia_mcal.c')?.content)
      .toContain('return ADIA_MCAL_NOT_IMPLEMENTED;');
    expect(result.manifest.stubbedPeripherals).toEqual(['gpio']);
    expect(result.manifest.flashBlocked).toBe(true);
  });

  it('does not generate unused peripheral symbols', () => {
    const result = generateEmbeddedLayers(config);
    const combined = result.files.map(file => file.content).join('\n');
    expect(combined).not.toContain('adia_mcal_adc_init');
    expect(combined).not.toContain('adia_mcal_uart_init');
  });
});
