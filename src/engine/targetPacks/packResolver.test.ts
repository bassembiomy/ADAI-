import { describe, it, expect } from 'vitest';
import { resolvePacks } from './packResolver.js';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('resolvePacks', () => {
  it('discovers and validates a valid pack fixture', async () => {
    const packs = await resolvePacks(resolve(__dirname, '__fixtures__'));
    expect(packs).toHaveLength(1);
    expect(packs[0].manifest.targetId).toBe('atmega328p');
    expect(packs[0].packPath).toContain('valid-pack');
  });

  it('returns an empty array for a non-existent directory', async () => {
    const packs = await resolvePacks(resolve(__dirname, '__fixtures__', 'missing'));
    expect(packs).toHaveLength(0);
  });

  it('fails closed when a search path contains an invalid sibling pack', async () => {
    const root = await mkdtemp(resolve(tmpdir(), 'adia-target-packs-'));
    try {
      const validDir = resolve(root, 'valid-pack');
      const invalidDir = resolve(root, 'invalid-pack');
      await mkdir(validDir);
      await mkdir(invalidDir);
      const validManifest = await readFile(
        resolve(__dirname, '__fixtures__', 'valid-pack', 'manifest.json'),
        'utf8',
      );
      await writeFile(resolve(validDir, 'manifest.json'), validManifest, 'utf8');
      await writeFile(resolve(invalidDir, 'manifest.json'), '{}', 'utf8');

      await expect(resolvePacks(root)).rejects.toThrow(/invalid-pack.*targetId/is);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rejects a manifest whose declared content hash does not match its content', async () => {
    const root = await mkdtemp(resolve(tmpdir(), 'adia-target-pack-hash-'));
    try {
      const packDir = resolve(root, 'tampered-pack');
      await mkdir(packDir);
      const source = JSON.parse(await readFile(
        resolve(__dirname, '__fixtures__', 'valid-pack', 'manifest.json'),
        'utf8',
      ));
      source.displayName = 'Tampered after hashing';
      await writeFile(resolve(packDir, 'manifest.json'), JSON.stringify(source), 'utf8');
      await expect(resolvePacks(root)).rejects.toThrow(/contentHash/i);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
