import { readdir, readFile } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import { resolve } from 'node:path';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { TargetPackManifest } from './targetPackTypes.js';
import { validateTargetPackManifest } from './targetPackSchema.js';

export interface ResolvedPack {
  manifest: TargetPackManifest;
  packPath: string;
  manifestPath: string;
}

export interface TargetPackDiagnostic {
  packPath: string;
  manifestPath: string;
  message: string;
}

export class TargetPackResolutionError extends Error {
  readonly diagnostics: readonly TargetPackDiagnostic[];

  constructor(diagnostics: TargetPackDiagnostic[]) {
    super(diagnostics.map(item => `${item.packPath}: ${item.message}`).join('\n'));
    this.name = 'TargetPackResolutionError';
    this.diagnostics = Object.freeze(diagnostics.map(item => Object.freeze({ ...item })));
  }
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(object[key])}`).join(',')}}`;
}

export function computeTargetPackContentHash(value: unknown): string {
  if ((value === null) || (typeof value !== 'object') || Array.isArray(value)) {
    throw new Error('target pack manifest must be an object');
  }
  const unsigned = structuredClone(value as Record<string, unknown>);
  delete unsigned.contentHash;
  return `sha256:${createHash('sha256').update(canonicalJson(unsigned), 'utf8').digest('hex')}`;
}

function contentHashesEqual(declared: string, computed: string): boolean {
  const left = Buffer.from(declared, 'utf8');
  const right = Buffer.from(computed, 'utf8');
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function resolvePacks(searchPath: string): Promise<ResolvedPack[]> {
  const packs: ResolvedPack[] = [];
  const diagnostics: TargetPackDiagnostic[] = [];
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
    let raw: string;
    try {
      raw = await readFile(manifestPath, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
      diagnostics.push({ packPath, manifestPath, message: `cannot read manifest: ${String(error)}` });
      continue;
    }
    try {
      const parsed = JSON.parse(raw);
      const result = validateTargetPackManifest(parsed);
      if (result.success) {
        const computedHash = computeTargetPackContentHash(parsed);
        if (!contentHashesEqual(result.manifest.contentHash, computedHash)) {
          diagnostics.push({
            packPath,
            manifestPath,
            message: `contentHash mismatch: declared ${result.manifest.contentHash}, computed ${computedHash}`,
          });
        } else {
          packs.push({ manifest: result.manifest, packPath, manifestPath });
        }
      } else {
        diagnostics.push({
          packPath,
          manifestPath,
          message: result.errors.map(item => `${item.path}: ${item.message}`).join('; '),
        });
      }
    } catch (error) {
      diagnostics.push({ packPath, manifestPath, message: `invalid JSON: ${String(error)}` });
    }
  }

  if (diagnostics.length > 0) throw new TargetPackResolutionError(diagnostics);
  return packs;
}
