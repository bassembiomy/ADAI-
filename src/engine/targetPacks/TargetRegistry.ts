import type { TargetPackManifest, DriverMode } from './targetPackTypes.js';
import type { ResolvedPack } from './packResolver.js';

export interface TargetRegistryError {
  success: false;
  error: string;
}

export interface TargetSelection {
  success: true;
  manifest: TargetPackManifest;
  driverMode: DriverMode;
}

export class TargetRegistry {
  private readonly byKey = new Map<string, TargetPackManifest>();
  private readonly versionsById = new Map<string, string[]>();

  private static freezeManifest(manifest: TargetPackManifest): TargetPackManifest {
    const clone = structuredClone(manifest);
    const freeze = (value: unknown): unknown => {
      if ((value !== null) && (typeof value === 'object') && !Object.isFrozen(value)) {
        for (const child of Object.values(value as Record<string, unknown>)) freeze(child);
        Object.freeze(value);
      }
      return value;
    };
    return freeze(clone) as TargetPackManifest;
  }

  constructor(packs: ResolvedPack[]) {
    for (const pack of packs) {
      const key = `${pack.manifest.targetId}@${pack.manifest.packVersion}`;
      const existing = this.byKey.get(key);
      if (existing) {
        throw new Error(`Duplicate targetId ${pack.manifest.targetId}@${pack.manifest.packVersion}`);
      }
      this.byKey.set(key, TargetRegistry.freezeManifest(pack.manifest));
      const versions = this.versionsById.get(pack.manifest.targetId) ?? [];
      versions.push(pack.manifest.packVersion);
      versions.sort((left, right) => {
        const a = left.split('.').map(Number);
        const b = right.split('.').map(Number);
        return (a[0] - b[0]) || (a[1] - b[1]) || (a[2] - b[2]);
      });
      this.versionsById.set(pack.manifest.targetId, versions);
    }
  }

  getTarget(targetId: string, packVersion?: string): TargetPackManifest | undefined {
    const version = packVersion ?? this.versionsById.get(targetId)?.at(-1);
    return version ? this.byKey.get(`${targetId}@${version}`) : undefined;
  }

  getAllTargetIds(): string[] {
    return Array.from(this.versionsById.keys()).sort();
  }

  select(targetId: string, driverMode: DriverMode, packVersion?: string): TargetSelection | TargetRegistryError {
    const manifest = this.getTarget(targetId, packVersion);
    if (!manifest) {
      return { success: false, error: `targetId ${targetId} not found` };
    }
    if (!manifest.supportedDriverModes.includes(driverMode)) {
      return { success: false, error: `driver mode ${driverMode} not supported for ${targetId}` };
    }
    return { success: true, manifest, driverMode };
  }
}
