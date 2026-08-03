import type { TargetPackManifest } from './targetPackTypes.js';
import { TargetRegistry } from './TargetRegistry.js';
import type { ResolvedPack } from './packResolver.js';

export const BUILTIN_TARGET_PACKS: TargetPackManifest[] = [
  {
    schemaVersion: '1.0.0',
    packVersion: '1.0.0',
    minimumGeneratorSchemaVersion: '1.0.0',
    targetId: 'stm32f103c8t6',
    deviceRevision: 'A',
    displayName: 'STM32F103C8T6 (BluePill)',
    device: {
      architecture: 'armv7-m',
      core: 'cortex-m3',
      fpu: 'none',
      abi: 'eabi',
      endianness: 'little',
      maxCpuClockHz: 72_000_000,
    },
    memoryRegions: [
      { name: 'flash', start: 0x0800_0000, size: 64 * 1024 },
      { name: 'sram', start: 0x2000_0000, size: 20 * 1024 },
    ],
    supportedDriverModes: ['vendor', 'bare-metal'],
    pinnedToolchains: [{ name: 'arm-none-eabi-gcc', version: '10.3.1' }],
    pins: [],
    peripheralConstraints: [],
    buildRecipes: {
      compilerFlags: ['-mcpu=cortex-m3', '-mthumb', '-Os', '-Wall', '-Wextra'],
      linkerFlags: ['-Tstm32f103c8t6.ld'],
    },
    programmers: [{ id: 'stlink-v2', name: 'ST-Link V2' }],
    capabilityManifest: {
      supportedPeripherals: ['GPIO', 'ADC', 'DAC', 'PWM', 'UART', 'SPI', 'I2C', 'CAN', 'Timer'],
      certifiedStatuses: ['STATIC_ANALYSIS_ONLY'],
    },
    contentHash: 'sha256:2d4781ccc0fb196286fbe60df98fcb705404cb04172b79698e5c0c9b7910978e',
  },
  {
    schemaVersion: '1.0.0',
    packVersion: '1.0.0',
    minimumGeneratorSchemaVersion: '1.0.0',
    targetId: 'stm32f407vgt6',
    deviceRevision: 'A',
    displayName: 'STM32F407VG (Discovery)',
    device: {
      architecture: 'armv7-m',
      core: 'cortex-m4',
      fpu: 'fpv4-sp-d16',
      abi: 'eabi',
      endianness: 'little',
      maxCpuClockHz: 168_000_000,
    },
    memoryRegions: [
      { name: 'flash', start: 0x0800_0000, size: 1024 * 1024 },
      { name: 'sram', start: 0x2000_0000, size: 192 * 1024 },
    ],
    supportedDriverModes: ['vendor', 'bare-metal'],
    pinnedToolchains: [{ name: 'arm-none-eabi-gcc', version: '10.3.1' }],
    pins: [],
    peripheralConstraints: [],
    buildRecipes: {
      compilerFlags: ['-mcpu=cortex-m4', '-mthumb', '-mfpu=fpv4-sp-d16', '-mfloat-abi=hard', '-Os'],
      linkerFlags: ['-Tstm32f407vg.ld'],
    },
    programmers: [{ id: 'stlink-v2', name: 'ST-Link V2' }],
    capabilityManifest: {
      supportedPeripherals: ['GPIO', 'ADC', 'DAC', 'PWM', 'UART', 'SPI', 'I2C', 'CAN', 'Timer'],
      certifiedStatuses: ['STATIC_ANALYSIS_ONLY'],
    },
    contentHash: 'sha256:2d526ef3e648286f1b2473c650b82966d5cde1794a13f543cb206da096972a44',
  },
  {
    schemaVersion: '1.0.0',
    packVersion: '1.0.0',
    minimumGeneratorSchemaVersion: '1.0.0',
    targetId: 'atmega328p',
    deviceRevision: 'A',
    displayName: 'ATmega328P (Arduino Uno)',
    device: {
      architecture: 'avr',
      core: 'avr5',
      fpu: 'none',
      abi: 'eabi',
      endianness: 'little',
      maxCpuClockHz: 16_000_000,
    },
    memoryRegions: [
      { name: 'flash', start: 0x0000, size: 32 * 1024 },
      { name: 'sram', start: 0x0100, size: 2 * 1024 },
    ],
    supportedDriverModes: ['vendor', 'bare-metal'],
    pinnedToolchains: [{ name: 'avr-gcc', version: '14.1.0' }],
    pins: [],
    peripheralConstraints: [],
    buildRecipes: {
      compilerFlags: ['-mmcu=atmega328p', '-DF_CPU=16000000UL', '-Os'],
      linkerFlags: [],
    },
    programmers: [{ id: 'avrdude', name: 'AVRDUDE / Arduino Bootloader' }],
    capabilityManifest: {
      supportedPeripherals: ['GPIO', 'ADC', 'PWM', 'UART', 'SPI', 'I2C', 'Timer'],
      certifiedStatuses: ['STATIC_ANALYSIS_ONLY'],
    },
    contentHash: 'sha256:9a717ed49c240562cabde533199792f40454e288dcf131e0ae84f85afc3c8d57',
  },
  {
    schemaVersion: '1.0.0',
    packVersion: '1.0.0',
    minimumGeneratorSchemaVersion: '1.0.0',
    targetId: 'atmega2560',
    deviceRevision: 'A',
    displayName: 'ATmega2560 (Arduino Mega)',
    device: {
      architecture: 'avr',
      core: 'avr6',
      fpu: 'none',
      abi: 'eabi',
      endianness: 'little',
      maxCpuClockHz: 16_000_000,
    },
    memoryRegions: [
      { name: 'flash', start: 0x0000, size: 256 * 1024 },
      { name: 'sram', start: 0x0200, size: 8 * 1024 },
    ],
    supportedDriverModes: ['vendor', 'bare-metal'],
    pinnedToolchains: [{ name: 'avr-gcc', version: '14.1.0' }],
    pins: [],
    peripheralConstraints: [],
    buildRecipes: {
      compilerFlags: ['-mmcu=atmega2560', '-DF_CPU=16000000UL', '-Os'],
      linkerFlags: [],
    },
    programmers: [{ id: 'avrdude', name: 'AVRDUDE / Wiring' }],
    capabilityManifest: {
      supportedPeripherals: ['GPIO', 'ADC', 'PWM', 'UART', 'SPI', 'I2C', 'Timer'],
      certifiedStatuses: ['STATIC_ANALYSIS_ONLY'],
    },
    contentHash: 'sha256:29dc9c15324a84d447d2bfddbd5f2422d1af99aff81ed6f22f963d63ac0d880e',
  },
  {
    schemaVersion: '1.0.0',
    packVersion: '1.0.0',
    minimumGeneratorSchemaVersion: '1.0.0',
    targetId: 'esp32-wroom-32',
    deviceRevision: 'V3',
    displayName: 'ESP32 Dev Module',
    device: {
      architecture: 'xtensa',
      core: 'lx6',
      fpu: 'single',
      abi: 'windowed',
      endianness: 'little',
      maxCpuClockHz: 240_000_000,
    },
    memoryRegions: [
      { name: 'flash', start: 0x0000_0000, size: 4096 * 1024 },
      { name: 'sram', start: 0x3FFA_E000, size: 520 * 1024 },
    ],
    supportedDriverModes: ['vendor', 'bare-metal'],
    pinnedToolchains: [{ name: 'xtensa-esp32-elf-gcc', version: '12.2.0' }],
    pins: [],
    peripheralConstraints: [],
    buildRecipes: {
      compilerFlags: ['-mlongcalls', '-Os', '-Wextra'],
      linkerFlags: [],
    },
    programmers: [{ id: 'esptool', name: 'esptool.py' }],
    capabilityManifest: {
      supportedPeripherals: ['GPIO', 'ADC', 'DAC', 'PWM', 'UART', 'SPI', 'I2C', 'CAN', 'Timer'],
      certifiedStatuses: ['STATIC_ANALYSIS_ONLY'],
    },
    contentHash: 'sha256:093bfe7444da989718f57b28373076218b5ed4955751884bddde5f8584fc957b',
  },
];

let defaultRegistryInstance: TargetRegistry | null = null;

export function getDefaultTargetRegistry(): TargetRegistry {
  if (!defaultRegistryInstance) {
    const resolvedPacks: ResolvedPack[] = BUILTIN_TARGET_PACKS.map(manifest => ({
      manifest,
      packPath: `/builtin/targetPacks/${manifest.targetId}`,
      manifestPath: `/builtin/targetPacks/${manifest.targetId}/manifest.json`,
    }));
    defaultRegistryInstance = new TargetRegistry(resolvedPacks);
  }
  return defaultRegistryInstance;
}
