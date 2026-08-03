import { describe, it, expect } from 'vitest';
import { resolveTargetPackAsset } from './targetPackAssets.js';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import type { TargetPackAsset } from './targetPackTypes.js';

describe('resolveTargetPackAsset', () => {
  it('resolves valid asset content when path is contained and sha256 matches', async () => {
    const root = await mkdtemp(resolve(tmpdir(), 'adia-asset-test-'));
    try {
      const startupDir = resolve(root, 'startup');
      await mkdir(startupDir, { recursive: true });
      const content = Buffer.from('void Reset_Handler(void) {}', 'utf8');
      const hash = `sha256:${createHash('sha256').update(content).digest('hex')}` as const;
      await writeFile(resolve(startupDir, 'startup.c'), content);

      const asset: TargetPackAsset = {
        kind: 'startup',
        path: 'startup/startup.c',
        sha256: hash,
      };

      const resolvedBytes = await resolveTargetPackAsset(root, asset);
      expect(Buffer.from(resolvedBytes).toString('utf8')).toBe('void Reset_Handler(void) {}');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rejects path traversal attempting to escape pack root', async () => {
    const root = await mkdtemp(resolve(tmpdir(), 'adia-asset-escape-test-'));
    try {
      const asset: TargetPackAsset = {
        kind: 'startup',
        path: '../secret.txt',
        sha256: 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      };
      await expect(resolveTargetPackAsset(root, asset)).rejects.toThrow('TARGET_ASSET_ESCAPE');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rejects asset with sha256 hash mismatch', async () => {
    const root = await mkdtemp(resolve(tmpdir(), 'adia-asset-mismatch-test-'));
    try {
      await writeFile(resolve(root, 'linker.ld'), 'MEMORY {}', 'utf8');
      const asset: TargetPackAsset = {
        kind: 'linker',
        path: 'linker.ld',
        sha256: 'sha256:0000000000000000000000000000000000000000000000000000000000000000',
      };
      await expect(resolveTargetPackAsset(root, asset)).rejects.toThrow('TARGET_ASSET_HASH_MISMATCH');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
