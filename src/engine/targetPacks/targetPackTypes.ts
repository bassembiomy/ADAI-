export type DriverMode = 'vendor' | 'bare-metal';

export const DRIVER_MODES: DriverMode[] = ['vendor', 'bare-metal'];

export interface TargetDevice {
  architecture: string;
  core: string;
  fpu: 'none' | 'fpv4-sp-d16' | 'fpv5-d16' | string;
  abi: string;
  endianness: 'little' | 'big';
  maxCpuClockHz: number;
}

export interface TargetMemoryRegion {
  name: string;
  start: number;
  size: number;
}

export interface ToolchainPin {
  name: string;
  version: string;
}

export interface TargetPin {
  id: string;
  port?: string;
  pin: number | string;
  alternateFunctions?: Record<string, string>;
  electrical?: string;
}

export interface TargetPeripheralConstraint {
  peripheral: string;
  instance?: string;
  interrupt?: string;
  dmaChannels?: string[];
  maxClockHz?: number;
}

export interface TargetBuildRecipe {
  compilerFlags: string[];
  linkerFlags: string[];
  defines?: string[];
  includePaths?: string[];
}

export interface TargetProgrammer {
  id: string;
  name: string;
  detectionCommand?: string[];
}

export interface TargetCapabilityManifest {
  supportedPeripherals: string[];
  certifiedStatuses: string[];
}

export interface TargetPackManifest {
  schemaVersion: string;
  targetId: string;
  deviceRevision: string;
  displayName: string;
  device: TargetDevice;
  memoryRegions: TargetMemoryRegion[];
  supportedDriverModes: DriverMode[];
  pinnedToolchains: ToolchainPin[];
  pins: TargetPin[];
  peripheralConstraints: TargetPeripheralConstraint[];
  buildRecipes: TargetBuildRecipe;
  programmers: TargetProgrammer[];
  capabilityManifest: TargetCapabilityManifest;
  contentHash: string;
}
