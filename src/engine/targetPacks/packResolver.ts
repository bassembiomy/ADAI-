import { readdir, readFile } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import { resolve } from 'node:path';
import type { TargetPackManifest } from './targetPackTypes.js';
import { validateTargetPackManifest } from './targetPackSchema.js';

export interface ResolvedPack {
  manifest: TargetPackManifest;
  packPath: string;
  manifestPath: string;
}

export async function resolvePacks(searchPath: string): Promise<ResolvedPack[]> {
  const packs: ResolvedPack[] = [];
  let entries: Dirent[] = [];
  try {
    entries = await readdir(searchPath, { withFileTypes: true });
  } catch {
    return [];
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const packPath = resolve(searchPath, entry.name);
    const manifestPath = resolve(packPath, 'manifest.json');
    try {
      const raw = await readFile(manifestPath, 'utf8');
      const parsed = JSON.parse(raw);
      const result = validateTargetPackManifest(parsed);
      if (result.success) {
        packs.push({ manifest: result.manifest, packPath, manifestPath });
      }
    } catch {
      // Skip directories without a valid manifest.json
    }
  }

  return packs;
}
