import { describe, it, expect } from 'vitest';
import { loadBuiltinPack } from './builtinPackLoader.js';
import { validateTargetConfiguration } from './targetConfigurationValidator.js';

describe('exactPackValidation', () => {
  it.each([
    ['stm32f103c8t6', 0x08000000, 64 * 1024, 0x20000000, 20 * 1024],
    ['stm32f407vgt6', 0x08000000, 1024 * 1024, 0x20000000, 128 * 1024],
    ['atmega328p', 0x00000000, 32 * 1024, 0x00800100, 2 * 1024],
    ['atmega2560', 0x00000000, 256 * 1024, 0x00800200, 8 * 1024],
  ])('%s declares exact flash/RAM bounds', async (id, flashStart, flashSize, ramStart, ramSize) => {
    const pack = await loadBuiltinPack(id);
    expect(pack.manifest.memoryRegions).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'FLASH', start: flashStart, size: flashSize }),
      expect.objectContaining({ name: 'RAM', start: ramStart, size: ramSize }),
    ]));
  });

  it('esp32-wroom-32 declares exact flash/RAM bounds', async () => {
    const pack = await loadBuiltinPack('esp32-wroom-32');
    expect(pack.manifest.targetId).toBe('esp32-wroom-32');
    expect(pack.manifest.memoryRegions).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'FLASH', start: 0x3f400000, size: 4 * 1024 * 1024 }),
      expect.objectContaining({ name: 'RAM', start: 0x3ffb0000, size: 320 * 1024 }),
    ]));
  });

  it('detects pin function conflicts, invalid ADC pins, duplicate interrupts, DMA collisions, impossible clocks, and FPU mismatches', async () => {
    const stm32f1 = (await loadBuiltinPack('stm32f103c8t6')).manifest;
    const diagnostics = validateTargetConfiguration(stm32f1, {
      cpuClockHz: 120_000_000, // Exceeds 72MHz
      fpuMode: 'fpv4-sp-d16',  // F103 has no FPU
      driverMode: 'unsupported-mode' as any,
      channels: [
        { channelId: 'ch1', peripheral: 'uart', pin: 'PA9', function: 'USART1_TX', interrupt: 'USART1_IRQ', dmaChannel: 'DMA1_Ch4' },
        { channelId: 'ch2', peripheral: 'pwm', pin: 'PA9', function: 'TIM1_CH2', interrupt: 'USART1_IRQ', dmaChannel: 'DMA1_Ch4' },
        { channelId: 'ch3', peripheral: 'adc', pin: 'PB12' }, // PB12 does not support ADC
        { channelId: 'ch4', peripheral: 'gpio', pin: 'PA13' }, // PA13 is SWDIO reserved
      ],
    });

    const codes = diagnostics.map(d => d.code);
    expect(codes).toContain('IMPOSSIBLE_CLOCK');
    expect(codes).toContain('WRONG_FPU_MODE');
    expect(codes).toContain('UNAVAILABLE_BARE_METAL');
    expect(codes).toContain('PIN_FUNCTION_CONFLICT');
    expect(codes).toContain('DUPLICATE_INTERRUPT');
    expect(codes).toContain('DMA_COLLISION');
    expect(codes).toContain('INVALID_ADC_PIN');
    expect(codes).toContain('RESERVED_DEBUG_PIN');
  });
});
