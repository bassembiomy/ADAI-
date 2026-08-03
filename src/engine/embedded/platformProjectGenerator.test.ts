import { describe, it, expect } from 'vitest';
import { generatePlatformProject } from './platformProjectGenerator.js';
import { loadBuiltinPack } from '../targetPacks/builtinPackLoader.js';
import type { HILConfig } from '../hil/hilTypes.js';

describe('platformProjectGenerator', () => {
  it('generates platform build assets, CMakeLists.txt / Makefile, and dependency lock file', async () => {
    const pack = (await loadBuiltinPack('stm32f407vgt6')).manifest;
    const config: HILConfig = {
      enabled: true,
      clockSpeed: 168,
      commPort: 'COM1',
      baudRate: 115200,
      target: 'STM32F4',
      targetSelection: {
        targetId: 'stm32f407vgt6',
        packVersion: '1.0.0',
        driverMode: 'vendor',
        boardRevision: 'A',
      },
      channels: [],
      mappings: [],
    };

    const project = generatePlatformProject(config, pack);
    const filePaths = project.files.map(f => f.path);

    expect(filePaths).toContain('src/platform/startup_stm32f407xx.c');
    expect(filePaths).toContain('build/linker/stm32f407vgtx.ld');
    expect(filePaths).toContain('CMakeLists.txt');
    expect(filePaths).toContain('dependency_lock.json');

    const lockFile = project.files.find(f => f.path === 'dependency_lock.json');
    expect(lockFile).toBeDefined();
    const lock = JSON.parse(lockFile!.content);
    expect(lock.targetId).toBe('stm32f407vgt6');
    expect(lock.packHash).toBe(pack.contentHash);
    expect(lock.recipeId).toBe('arm-none-eabi-stm32f407-v1');
  });
});
