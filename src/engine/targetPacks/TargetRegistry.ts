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
  private readonly byId = new Map<string, TargetPackManifest>();

  constructor(packs: ResolvedPack[]) {
    for (const pack of packs) {
      const existing = this.byId.get(pack.manifest.targetId);
      if (existing) {
        throw new Error(`Duplicate targetId ${pack.manifest.targetId}`);
      }
      this.byId.set(pack.manifest.targetId, pack.manifest);
    }
  }

  getTarget(targetId: string): TargetPackManifest | undefined {
    return this.byId.get(targetId);
  }

  getAllTargetIds(): string[] {
    return Array.from(this.byId.keys()).sort();
  }

  select(targetId: string, driverMode: DriverMode): TargetSelection | TargetRegistryError {
    const manifest = this.byId.get(targetId);
    if (!manifest) {
      return { success: false, error: `targetId ${targetId} not found` };
    }
    if (!manifest.supportedDriverModes.includes(driverMode)) {
      return { success: false, error: `driver mode ${driverMode} not supported for ${targetId}` };
    }
    return { success: true, manifest, driverMode };
  }
}
