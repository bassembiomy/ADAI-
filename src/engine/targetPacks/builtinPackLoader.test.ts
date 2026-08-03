import { describe, it, expect } from 'vitest';
import { loadBuiltinTargetPacks, loadBuiltinPack } from './builtinPackLoader.js';

describe('builtinPackLoader', () => {
  it('loads all five builtin target packs', async () => {
    const packs = await loadBuiltinTargetPacks();
    expect(packs).toHaveLength(5);
    const ids = packs.map(p => p.manifest.targetId).sort();
    expect(ids).toEqual([
      'atmega2560',
      'atmega328p',
      'esp32-wroom-32',
      'stm32f103c8t6',
      'stm32f407vgt6',
    ]);
  });

  it('throws for unknown targetId', async () => {
    await expect(loadBuiltinPack('unknown-mcu')).rejects.toThrow('BUILTIN_PACK_NOT_FOUND');
  });
});
