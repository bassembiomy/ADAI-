export type TargetMCU = 'STM32F4' | 'STM32F1' | 'Arduino_Uno' | 'Arduino_Mega' | 'ESP32' | 'Generic';
import type { DriverMode } from '../targetPacks/targetPackTypes.js';

export interface TargetSelectionConfig {
  targetId: string;
  packVersion: string;
  driverMode: DriverMode;
  boardRevision: string;
  programmerId?: string;
}

const LEGACY_TARGET_SELECTIONS: Record<TargetMCU, TargetSelectionConfig | null> = {
  STM32F1: { targetId: 'stm32f103c8t6', packVersion: '1.0.0', driverMode: 'vendor', boardRevision: 'A' },
  STM32F4: { targetId: 'stm32f407vgt6', packVersion: '1.0.0', driverMode: 'vendor', boardRevision: 'A' },
  Arduino_Uno: { targetId: 'atmega328p', packVersion: '1.0.0', driverMode: 'vendor', boardRevision: 'A' },
  Arduino_Mega: { targetId: 'atmega2560', packVersion: '1.0.0', driverMode: 'vendor', boardRevision: 'A' },
  ESP32: { targetId: 'esp32-wroom-32', packVersion: '1.0.0', driverMode: 'vendor', boardRevision: 'A' },
  Generic: null,
};

export function legacyTargetForTargetId(targetId: string): TargetMCU {
  for (const [legacy, selection] of Object.entries(LEGACY_TARGET_SELECTIONS)) {
    if (selection?.targetId === targetId) return legacy as TargetMCU;
  }
  return 'Generic';
}

export function resolveTargetSelection(config: HILConfig): TargetSelectionConfig | null {
  return config.targetSelection ?? LEGACY_TARGET_SELECTIONS[config.target];
}

export function applyTargetSelection(
  config: HILConfig,
  selection: TargetSelectionConfig,
): HILConfig {
  return {
    ...config,
    target: legacyTargetForTargetId(selection.targetId),
    targetSelection: { ...selection },
  };
}

export type PeripheralType = 'GPIO' | 'ADC' | 'DAC' | 'PWM' | 'UART' | 'SPI' | 'I2C' | 'CAN' | 'Timer';

export interface DriverChannel {
  id: string;
  name: string;
  peripheral: PeripheralType;
  pin: string;
  direction: 'In' | 'Out';
  dataType: 'uint8_t' | 'int8_t' | 'uint16_t' | 'int16_t' | 'uint32_t' | 'int32_t' | 'float' | 'double' | 'bool';
  rangeMin: number;
  rangeMax: number;
  scalingFactor: number;
  unit: string;
}

export interface HILMapping {
  id: string;
  adiaVarId: string; // The variable name from state machine or signal from X-Bridges
  channelId: string; // The ID of the DriverChannel
  direction: 'read' | 'write'; // read: hardware -> ADIA (input to SM), write: ADIA -> hardware (output from SM)
  conversionExpr?: string | null; // Optional mathjs/js expression for signal conversion (e.g. "x * 2.0")
  /** Value driven to an output channel when a safety fault is latched. */
  safeValue?: number | boolean;
}

export interface HILConfig {
  enabled: boolean;
  target: TargetMCU;
  targetSelection?: TargetSelectionConfig;
  clockSpeed: number; // in MHz, e.g. 16, 84, 168, 240
  channels: DriverChannel[];
  mappings: HILMapping[];
  commPort: string;
  baudRate: number;
}

export interface FaultInjectionConfig {
  type: 'override' | 'noise' | 'clamp';
  value: number;
  active: boolean;
}

export interface HILSessionState {
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  connectedAt?: number;
  lastSyncMs?: number;
  channelValues: Record<string, number>; // channelId -> current value
  faultInjections: Record<string, FaultInjectionConfig>; // channelId -> fault config
  log: Array<{ timestamp: number; type: 'info' | 'warn' | 'error' | 'success'; message: string }>;
}
