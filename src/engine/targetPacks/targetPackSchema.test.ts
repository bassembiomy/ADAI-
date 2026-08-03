import { describe, it, expect } from 'vitest';
import { validateTargetPackManifest } from './targetPackSchema.js';
import type { TargetPackManifest } from './targetPackTypes.js';

const validManifest: TargetPackManifest = {
  schemaVersion: '1.0.0',
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
  memoryRegions: [{ name: 'flash', start: 0x0800_0000, size: 65536 }],
  supportedDriverModes: ['vendor'],
  pinnedToolchains: [{ name: 'arm-none-eabi-gcc', version: '13.2.1' }],
  pins: [],
  peripheralConstraints: [],
  buildRecipes: { compilerFlags: ['-mcpu=cortex-m3'], linkerFlags: [] },
  programmers: [],
  capabilityManifest: { supportedPeripherals: ['gpio'], certifiedStatuses: [] },
  contentHash: 'deadbeef',
};

describe('validateTargetPackManifest', () => {
  it('accepts a valid manifest', () => {
    const result = validateTargetPackManifest(validManifest);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.manifest.targetId).toBe('stm32f103c8t6');
    }
  });

  it('rejects a missing targetId', () => {
    const bad = { ...validManifest, targetId: undefined };
    const result = validateTargetPackManifest(bad);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.some(e => e.path === 'targetId')).toBe(true);
    }
  });

  it('rejects an unsupported driver mode', () => {
    const bad = { ...validManifest, supportedDriverModes: ['shim'] };
    const result = validateTargetPackManifest(bad);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.some(e => e.path.startsWith('supportedDriverModes'))).toBe(true);
    }
  });
});
