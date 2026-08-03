import { readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { createHash } from 'node:crypto';
import type { TargetPackAsset } from './targetPackTypes.js';

export async function resolveTargetPackAsset(
  packRoot: string,
  asset: TargetPackAsset,
): Promise<Uint8Array> {
  const normalizedRoot = resolve(packRoot);
  const candidate = resolve(normalizedRoot, asset.path);
  if (!candidate.startsWith(`${normalizedRoot}${sep}`)) {
    throw new Error('TARGET_ASSET_ESCAPE');
  }
  const bytes = await readFile(candidate);
  const computedHash = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  if (computedHash !== asset.sha256) {
    throw new Error('TARGET_ASSET_HASH_MISMATCH');
  }
  return bytes;
}
