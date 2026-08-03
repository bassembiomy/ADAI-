import { describe, it, expect } from 'vitest';
import { MCAL_PERIPHERALS } from './mcalTypes.js';
import type { McalChannelConfig, McalPeripheral } from './mcalTypes.js';

describe('MCAL types', () => {
  it('exports the supported peripheral list', () => {
    expect(MCAL_PERIPHERALS).toContain('gpio');
    expect(MCAL_PERIPHERALS).toContain('adc');
    expect(MCAL_PERIPHERALS).toContain('watchdog');
  });

  it('accepts a GPIO channel config', () => {
    const gpio: McalChannelConfig = {
      peripheral: 'gpio',
      channelId: 'LED_0',
      pin: 'PA0',
      direction: 'output',
      safeValue: false,
    };
    expect(gpio.peripheral).toBe('gpio');
  });

  it('accepts an ADC channel config', () => {
    const adc: McalChannelConfig = {
      peripheral: 'adc',
      channelId: 'TEMP_SENSOR',
      pin: 'PA1',
      direction: 'input',
      units: 'millivolts',
      scale: { numerator: 3300, denominator: 4095, offset: 0 },
      safeValue: 0,
    };
    expect(adc.scale?.numerator).toBe(3300);
  });
});
