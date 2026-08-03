import { describe, it, expect } from 'vitest';
import { generateHilSelfTest } from './hilSelfTestGenerator.js';
import { loadBuiltinPack } from '../targetPacks/builtinPackLoader.js';

describe('hilSelfTestGenerator', () => {
  it('generates hil_self_test.c and hil_self_test.h with boot identity, ram pattern, and loopback tests', async () => {
    const stm32f4 = (await loadBuiltinPack('stm32f407vgt6')).manifest;
    const files = generateHilSelfTest(stm32f4);

    const fileNames = files.map(f => f.path);
    expect(fileNames).toContain('src/platform/hil_self_test.h');
    expect(fileNames).toContain('src/platform/hil_self_test.c');

    const source = files.find(f => f.path === 'src/platform/hil_self_test.c')?.content;
    expect(source).toContain('ADIA_HIL_RunSelfTest');
    expect(source).toContain('stm32f407vgt6');
    expect(source).toContain('0x10016413');
  });
});
