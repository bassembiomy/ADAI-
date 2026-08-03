import { describe, it, expect } from 'vitest';
import { DRIVER_MODES } from './targetPackTypes.js';
import type { TargetPackManifest, DriverMode } from './targetPackTypes.js';

describe('target pack types', () => {
  it('exports supported driver modes', () => {
    expect(DRIVER_MODES).toContain('vendor');
    expect(DRIVER_MODES).toContain('bare-metal');
  });

  it('accepts a minimal manifest shape', () => {
    const manifest: TargetPackManifest = {
      schemaVersion: '1.0.0',
      packVersion: '1.0.0',
      minimumGeneratorSchemaVersion: '1.0.0',
      targetId: 'stm32f103c8t6',
      deviceRevision: 'A',
      displayName: 'STM32F103C8T6',
      device: {
        architecture: 'armv7-m',
        core: 'cortex-m3',
        fpu: 'none',
        abi: 'eabi',
        endianness: 'little',
        maxCpuClockHz: 72_000_000,
      },
      memoryRegions: [
        { name: 'flash', start: 0x0800_0000, size: 64 * 1024 },
        { name: 'sram', start: 0x2000_0000, size: 20 * 1024 },
      ],
      supportedDriverModes: ['vendor', 'bare-metal'] as DriverMode[],
      pinnedToolchains: [{ name: 'arm-none-eabi-gcc', version: '13.2.1' }],
      pins: [],
      peripheralConstraints: [],
      buildRecipes: {
        compilerFlags: ['-mcpu=cortex-m3', '-mthumb', '-O2', '-Wall', '-Wextra'],
        linkerFlags: ['-Tlinker/stm32f103c8t6.ld'],
      },
      programmers: [],
      capabilityManifest: {
        supportedPeripherals: ['gpio', 'adc', 'pwm', 'uart'],
        certifiedStatuses: ['STATIC_ANALYSIS_ONLY', 'GENERATED_WITH_STUBS'],
      },
      contentHash: 'deadbeef',
    };
    expect(manifest.targetId).toBe('stm32f103c8t6');
  });
});
