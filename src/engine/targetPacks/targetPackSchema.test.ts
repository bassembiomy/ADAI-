import { describe, it, expect } from 'vitest';
import { validateTargetPackManifest } from './targetPackSchema.js';
import type { TargetPackManifest } from './targetPackTypes.js';

const validManifest: TargetPackManifest = {
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

  it('rejects unsupported schema versions and unsafe target identifiers', () => {
    const bad = {
      ...validManifest,
      schemaVersion: '999.0.0',
      targetId: 'bad*/\n#error injected',
    };
    const result = validateTargetPackManifest(bad);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.some(e => e.path === 'schemaVersion')).toBe(true);
      expect(result.errors.some(e => e.path === 'targetId')).toBe(true);
    }
  });

  it('recursively rejects malformed nested fields and invalid memory ranges', () => {
    const bad = {
      ...validManifest,
      memoryRegions: [{ name: 'flash', start: -1, size: -10 }],
      pins: [null],
      peripheralConstraints: [42],
      buildRecipes: { compilerFlags: [123], linkerFlags: [null] },
      programmers: [false],
      capabilityManifest: {
        supportedPeripherals: [{}],
        certifiedStatuses: ['HARDWARE_TESTED'],
      },
      contentHash: '',
    };
    const result = validateTargetPackManifest(bad);
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.errors.map(e => e.path);
      expect(paths).toContain('memoryRegions[0].start');
      expect(paths).toContain('memoryRegions[0].size');
      expect(paths).toContain('pins[0]');
      expect(paths).toContain('peripheralConstraints[0]');
      expect(paths).toContain('buildRecipes.compilerFlags[0]');
      expect(paths).toContain('buildRecipes.linkerFlags[0]');
      expect(paths).toContain('programmers[0]');
      expect(paths).toContain('capabilityManifest.supportedPeripherals[0]');
      expect(paths).toContain('capabilityManifest.certifiedStatuses[0]');
      expect(paths).toContain('contentHash');
    }
  });

  it('rejects traversal, unknown recipes, and unhashed startup assets', () => {
    const result = validateTargetPackManifest({
      ...validManifest,
      assets: [{ kind: 'startup', path: '../startup.c', sha256: '' as any }],
      recipes: { build: 'renderer-command' as any, flash: 'unknown-flasher' as any, inspect: 'arm-elf-v1' },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.map(error => error.path)).toEqual(expect.arrayContaining([
        'assets[0].path', 'assets[0].sha256', 'recipes.build', 'recipes.flash',
      ]));
    }
  });
});
