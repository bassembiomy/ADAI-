import { describe, it, expect, beforeEach } from 'vitest';
import { TargetRegistry } from './TargetRegistry.js';
import type { ResolvedPack } from './packResolver.js';
import type { TargetPackManifest } from './targetPackTypes.js';

function makeManifest(targetId: string, modes: ('vendor' | 'bare-metal')[]): TargetPackManifest {
  return {
    schemaVersion: '1.0.0',
    targetId,
    deviceRevision: 'A',
    displayName: targetId,
    device: { architecture: 'arm', core: 'cortex-m0', fpu: 'none', abi: 'eabi', endianness: 'little', maxCpuClockHz: 48_000_000 },
    memoryRegions: [{ name: 'flash', start: 0, size: 65536 }],
    supportedDriverModes: modes,
    pinnedToolchains: [{ name: 'gcc', version: '1.0.0' }],
    pins: [],
    peripheralConstraints: [],
    buildRecipes: { compilerFlags: [], linkerFlags: [] },
    programmers: [],
    capabilityManifest: { supportedPeripherals: [], certifiedStatuses: [] },
    contentHash: `hash-${targetId}`,
  };
}

describe('TargetRegistry', () => {
  let registry: TargetRegistry;

  beforeEach(() => {
    const packs: ResolvedPack[] = [
      { manifest: makeManifest('stm32f103c8t6', ['vendor', 'bare-metal']), packPath: '/p1', manifestPath: '/p1/manifest.json' },
      { manifest: makeManifest('atmega328p', ['vendor']), packPath: '/p2', manifestPath: '/p2/manifest.json' },
    ];
    registry = new TargetRegistry(packs);
  });

  it('returns all target ids', () => {
    expect(registry.getAllTargetIds().sort()).toEqual(['atmega328p', 'stm32f103c8t6']);
  });

  it('selects a target with a supported driver mode', () => {
    const result = registry.select('stm32f103c8t6', 'bare-metal');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.manifest.targetId).toBe('stm32f103c8t6');
      expect(result.driverMode).toBe('bare-metal');
    }
  });

  it('rejects an unsupported driver mode', () => {
    const result = registry.select('atmega328p', 'bare-metal');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('bare-metal');
    }
  });

  it('rejects a missing target id', () => {
    const result = registry.select('STM32F4', 'vendor');
    expect(result.success).toBe(false);
  });

  it('throws on duplicate target ids', () => {
    const packs: ResolvedPack[] = [
      { manifest: makeManifest('stm32f103c8t6', ['vendor']), packPath: '/p1', manifestPath: '/p1/manifest.json' },
      { manifest: makeManifest('stm32f103c8t6', ['vendor']), packPath: '/p2', manifestPath: '/p2/manifest.json' },
    ];
    expect(() => new TargetRegistry(packs)).toThrow('Duplicate targetId');
  });
});
