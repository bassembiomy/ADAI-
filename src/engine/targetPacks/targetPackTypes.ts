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

export type TargetAssetKind = 'startup' | 'linker' | 'driver' | 'sdk-lock' | 'hil-fixture';

export interface TargetPackAsset {
  kind: TargetAssetKind;
  path: string;
  sha256: `sha256:${string}`;
}

export type TargetBuildRecipeRef =
  | 'arm-none-eabi-stm32f103-v1'
  | 'arm-none-eabi-stm32f407-v1'
  | 'avr-atmega328p-v1'
  | 'avr-atmega2560-v1'
  | 'esp-idf-wroom32-v1';

export type TargetFlashRecipeRef =
  | 'openocd-stm32f103-v1'
  | 'openocd-stm32f407-v1'
  | 'avrdude-atmega328p-v1'
  | 'avrdude-atmega2560-v1'
  | 'esptool-wroom32-v1';

export type TargetInspectRecipeRef =
  | 'arm-elf-v1'
  | 'avr-elf-v1'
  | 'esp-idf-image-v1';

export interface TargetRecipeSet {
  build: TargetBuildRecipeRef;
  flash: TargetFlashRecipeRef;
  inspect: TargetInspectRecipeRef;
}

export interface TargetDeviceIdentity {
  mask: string;
  value: string;
  signature?: string;
}

export interface TargetCapabilityManifest {
  supportedPeripherals: string[];
  certifiedStatuses: string[];
}

export interface TargetVerificationRecipe {
  executable: string;
  args: string[];
  sourceGlobs: string[];
  includeDirectories: string[];
  outputPath: string;
  versionArgs?: string[];
}

export interface TargetPackManifest {
  schemaVersion: string;
  packVersion: string;
  minimumGeneratorSchemaVersion: string;
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
  recipes?: TargetRecipeSet;
  assets?: TargetPackAsset[];
  deviceIdentity?: TargetDeviceIdentity;
  programmers: TargetProgrammer[];
  capabilityManifest: TargetCapabilityManifest;
  contentHash: string;
  verificationRecipe?: TargetVerificationRecipe;
}
