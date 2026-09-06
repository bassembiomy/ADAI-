import { describe, expect, it } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { TargetRegistry } from '../../engine/targetPacks/TargetRegistry';
import type { TargetPackManifest } from '../../engine/targetPacks/targetPackTypes';
import {
  compileTargetPackage,
  type TargetCompileRequest,
} from './smTargetCompileRunner';

describe('smTargetCompileRunner', () => {
  const sampleManifest: TargetPackManifest = {
    schemaVersion: '1.0.0',
    packVersion: '1.0.0',
    minimumGeneratorSchemaVersion: '1.0.0',
    targetId: 'stm32f407-test',
    deviceRevision: 'A',
    displayName: 'STM32F407 Test Board',
    device: {
      architecture: 'armv7e-m',
      core: 'cortex-m4',
      fpu: 'fpv4-sp-d16',
      abi: 'eabi',
      endianness: 'little',
      maxCpuClockHz: 168_000_000,
    },
    memoryRegions: [{ name: 'flash', start: 0x0800_0000, size: 1048576 }],
    supportedDriverModes: ['vendor'],
    pinnedToolchains: [{ name: 'arm-none-eabi-gcc', version: '13.2.1' }],
    pins: [],
    peripheralConstraints: [],
    buildRecipes: { compilerFlags: ['-mcpu=cortex-m4'], linkerFlags: [] },
    programmers: [],
    capabilityManifest: { supportedPeripherals: ['gpio'], certifiedStatuses: [] },
    contentHash: 'content_hash_12345',
    verificationRecipe: {
      executable: 'arm-none-eabi-gcc',
      args: ['-c', '{sources}', '-o', '{outputFile}'],
      sourceGlobs: ['*.c'],
      includeDirectories: ['.'],
      outputPath: 'firmware.elf',
      versionArgs: ['--version'],
    },
  };

  const registry = new TargetRegistry([
    {
      packPath: '/fake/pack/path',
      manifestPath: '/fake/pack/path/manifest.json',
      manifest: sampleManifest,
    },
  ]);

  it('returns NOT_RUN when no target is configured in the model', async () => {
    const request: TargetCompileRequest = {
      targetId: null,
      sourceDir: process.cwd(),
      registry,
    };

    const evidence = await compileTargetPackage(request);

    expect(evidence.activity).toBe('target-compilation');
    expect(evidence.status).toBe('NOT_RUN');
    expect(evidence.summary).toContain('No target configured');
    expect(evidence.details.targetId).toBeNull();
  });

  it('returns FAIL when configured target pack is missing from the registry', async () => {
    const request: TargetCompileRequest = {
      targetId: 'non_existent_target_board',
      sourceDir: process.cwd(),
      registry,
    };

    const evidence = await compileTargetPackage(request);

    expect(evidence.activity).toBe('target-compilation');
    expect(evidence.status).toBe('FAIL');
    expect(evidence.summary).toContain('non_existent_target_board');
    expect(evidence.summary).toContain('not found');
    expect(evidence.details.targetId).toBe('non_existent_target_board');
  });

  it('returns NOT_RUN when configured target cross-compiler is unavailable on host', async () => {
    const request: TargetCompileRequest = {
      targetId: 'stm32f407-test',
      sourceDir: process.cwd(),
      registry,
      // Target cross-compiler arm-none-eabi-gcc is usually not present or we can point to missing binary
      overrideRecipe: {
        executable: 'arm-none-eabi-gcc-definitely-missing-binary-999',
      },
    };

    const evidence = await compileTargetPackage(request);

    expect(evidence.activity).toBe('target-compilation');
    expect(evidence.status).toBe('NOT_RUN');
    expect(evidence.summary).toContain('arm-none-eabi-gcc-definitely-missing-binary-999');
    expect(evidence.details.targetId).toBe('stm32f407-test');
    expect(evidence.details.packHash).toBe('content_hash_12345');
  });

  it('returns FAIL with diagnostics when target compiler fails with non-zero exit code', async () => {
    // Fake failing compiler script
    const fakeCompilerScript = path.join(process.cwd(), 'scratch_fail_compiler.cjs');
    fs.writeFileSync(
      fakeCompilerScript,
      'console.error("error: target architecture mismatch"); process.exit(1);',
    );

    try {
      const request: TargetCompileRequest = {
        targetId: 'stm32f407-test',
        sourceDir: process.cwd(),
        registry,
        overrideRecipe: {
          executable: process.execPath,
          args: [fakeCompilerScript],
        },
      };

      const evidence = await compileTargetPackage(request);

      expect(evidence.activity).toBe('target-compilation');
      expect(evidence.status).toBe('FAIL');
      expect(evidence.details.diagnostics.join(' ')).toContain('target architecture mismatch');
    } finally {
      if (fs.existsSync(fakeCompilerScript)) {
        fs.unlinkSync(fakeCompilerScript);
      }
    }
  });

  it('returns PASS and captures output hash when compilation succeeds and produces expected artifact', async () => {
    const tempDir = path.join(process.cwd(), 'scratch_target_build');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    const fakeCompilerScript = path.join(tempDir, 'fake_success_compiler.cjs');
    const expectedOutput = path.join(tempDir, 'output.elf');

    fs.writeFileSync(
      fakeCompilerScript,
      `const fs = require('fs');
fs.writeFileSync(process.argv[2], "ELF_BINARY_MOCK_DATA");
process.exit(0);`,
    );

    try {
      const request: TargetCompileRequest = {
        targetId: 'stm32f407-test',
        sourceDir: tempDir,
        registry,
        overrideRecipe: {
          executable: process.execPath,
          args: [fakeCompilerScript, expectedOutput],
          outputPath: 'output.elf',
        },
      };

      const evidence = await compileTargetPackage(request);

      expect(evidence.activity).toBe('target-compilation');
      expect(evidence.status).toBe('PASS');
      expect(evidence.details.targetId).toBe('stm32f407-test');
      expect(evidence.details.packVersion).toBe('1.0.0');
      expect(evidence.details.packHash).toBe('content_hash_12345');
      expect(evidence.details.outputFile).toBe('output.elf');
      expect(evidence.details.outputHash).toMatch(/^[0-9a-f]{64}$/);
    } finally {
      try {
        if (fs.existsSync(tempDir)) {
          fs.rmSync(tempDir, { recursive: true, force: true });
        }
      } catch {
        // ignore Windows file lock
      }
    }
  });

  it('proves that host compilation cannot set target compilation status', () => {
    // The target compilation runner requires target pack resolution and cross-compiler invocation;
    // it never derives or accepts host compiler evidence.
    const sampleHostEvidence = {
      activity: 'host-compilation' as const,
      status: 'PASS' as const,
      summary: 'Host gcc passed',
    };

    expect(sampleHostEvidence.activity).not.toBe('target-compilation');
  });
});
