import { describe, it, expect } from 'vitest';
import { generateMcalHeader } from './mcalHeaderGenerator.js';
import type { McalHeaderModel } from './mcalTypes.js';

const emptyModel: McalHeaderModel = {
  packTargetId: 'stm32f103c8t6',
  channels: [],
};

const gpioModel: McalHeaderModel = {
  packTargetId: 'stm32f103c8t6',
  channels: [
    { peripheral: 'gpio', channelId: 'LED_0', pin: 'PA0', direction: 'output', safeValue: false },
    { peripheral: 'gpio', channelId: 'BUTTON_0', pin: 'PA1', direction: 'input', safeValue: false },
  ],
};

describe('generateMcalHeader', () => {
  it('emits header guard and status enum', () => {
    const header = generateMcalHeader(emptyModel);
    expect(header).toContain('#ifndef ADIA_MCAL_H');
    expect(header).toContain('#define ADIA_MCAL_H');
    expect(header).toContain('adia_mcal_status_t');
    expect(header).toContain('ADIA_MCAL_OK');
  });

  it('emits channel enums only for used peripherals', () => {
    const header = generateMcalHeader(gpioModel);
    expect(header).toContain('adia_mcal_gpio_channel_t');
    expect(header).toContain('ADIA_MCAL_GPIO_LED_0');
    expect(header).toContain('ADIA_MCAL_GPIO_BUTTON_0');
    expect(header).not.toContain('adia_mcal_adc_channel_t');
  });

  it('emits function prototypes for used peripherals', () => {
    const header = generateMcalHeader(gpioModel);
    expect(header).toContain('adia_mcal_gpio_init(void)');
    expect(header).toContain('adia_mcal_gpio_read(');
    expect(header).toContain('adia_mcal_gpio_write(');
  });

  it('includes the target id in a comment', () => {
    const header = generateMcalHeader(emptyModel);
    expect(header).toContain('Target: stm32f103c8t6');
  });
});
