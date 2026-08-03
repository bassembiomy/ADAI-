import { describe, it, expect } from 'vitest';
import { resolvePacks } from './packResolver.js';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

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
});
