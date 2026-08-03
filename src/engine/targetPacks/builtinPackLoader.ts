import { resolve } from 'node:path';
import type { ResolvedPack } from './packResolver.js';
import { resolvePacks } from './packResolver.js';

export async function loadBuiltinTargetPacks(customPath?: string): Promise<ResolvedPack[]> {
  const packsPath = customPath ? resolve(customPath) : resolve(process.cwd(), 'target-packs');
  return resolvePacks(packsPath);
}

export async function loadBuiltinPack(targetId: string, customPath?: string): Promise<ResolvedPack> {
  const packs = await loadBuiltinTargetPacks(customPath);
  const pack = packs.find(p => p.manifest.targetId === targetId);
  if (!pack) {
    throw new Error(`BUILTIN_PACK_NOT_FOUND: ${targetId}`);
  }
  return pack;
}
