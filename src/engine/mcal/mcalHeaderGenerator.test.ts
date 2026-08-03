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

  it('rejects unsafe or colliding generated C identifiers', () => {
    expect(() => generateMcalHeader({
      packTargetId: 'x*/\n#error TARGET_INJECTION\n/*',
      channels: [{
        peripheral: 'gpio',
        channelId: 'A,\n#error CHANNEL_INJECTION\nB',
        direction: 'output',
        safeValue: false,
      }],
    })).toThrow(/target|identifier/i);

    expect(() => generateMcalHeader({
      packTargetId: 'stm32f103c8t6',
      channels: [
        { peripheral: 'gpio', channelId: 'LED-0', direction: 'output', safeValue: false },
        { peripheral: 'gpio', channelId: 'LED_0', direction: 'output', safeValue: false },
      ],
    })).toThrow(/duplicate|identifier/i);
  });

  it('renders direction-correct operations for communication peripherals', () => {
    const header = generateMcalHeader({
      packTargetId: 'stm32f407vgt6',
      channels: [
        { peripheral: 'uart', channelId: 'DEBUG_RX', direction: 'input', safeValue: 0 },
        { peripheral: 'uart', channelId: 'DEBUG_TX', direction: 'output', safeValue: 0 },
        { peripheral: 'spi', channelId: 'SENSOR', direction: 'input', safeValue: 0 },
        { peripheral: 'i2c', channelId: 'ACTUATOR', direction: 'output', safeValue: 0 },
        { peripheral: 'can', channelId: 'VEHICLE', direction: 'input', safeValue: 0 },
      ],
    });
    expect(header).toContain('adia_mcal_uart_read(');
    expect(header).toContain('adia_mcal_uart_write(');
    expect(header).toContain('adia_mcal_spi_read(');
    expect(header).not.toContain('adia_mcal_spi_write(');
    expect(header).toContain('adia_mcal_i2c_write(');
    expect(header).not.toContain('adia_mcal_i2c_read(');
    expect(header).toContain('adia_mcal_can_read(');
  });
});
