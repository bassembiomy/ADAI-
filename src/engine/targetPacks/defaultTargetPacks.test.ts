import { describe, it, expect } from 'vitest';
import { getDefaultTargetRegistry, BUILTIN_TARGET_PACKS } from './defaultTargetPacks';
import { computeTargetPackContentHash } from './packResolver';

describe('defaultTargetPacks', () => {
  it('provides valid built-in target packs for standard microcontrollers', () => {
    expect(BUILTIN_TARGET_PACKS.length).toBeGreaterThanOrEqual(5);
    const registry = getDefaultTargetRegistry();
    const ids = registry.getAllTargetIds();

    expect(ids).toContain('stm32f103c8t6');
    expect(ids).toContain('stm32f407vgt6');
    expect(ids).toContain('atmega328p');
    expect(ids).toContain('atmega2560');
    expect(ids).toContain('esp32-wroom-32');
    for (const pack of BUILTIN_TARGET_PACKS) {
      expect(pack.capabilityManifest.certifiedStatuses).toEqual(['STATIC_ANALYSIS_ONLY']);
      expect(pack.capabilityManifest.certifiedStatuses).not.toContain('HARDWARE_TESTED');
      expect(pack.contentHash).toBe(computeTargetPackContentHash(pack));
    }
  });

  it('allows selecting target and driver mode from registry', () => {
    const registry = getDefaultTargetRegistry();
    const selection = registry.select('stm32f407vgt6', 'vendor');

    expect(selection.success).toBe(true);
    if (selection.success) {
      expect(selection.manifest.displayName).toContain('STM32F407VG');
      expect(selection.manifest.device.core).toBe('cortex-m4');
      expect(selection.manifest.device.maxCpuClockHz).toBe(168_000_000);
    }
  });
});
