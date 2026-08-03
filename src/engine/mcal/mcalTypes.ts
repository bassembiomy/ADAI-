export type McalPeripheral =
  | 'gpio'
  | 'adc'
  | 'dac'
  | 'pwm'
  | 'uart'
  | 'spi'
  | 'i2c'
  | 'can'
  | 'timer'
  | 'capture'
  | 'watchdog'
  | 'systemClock'
  | 'resetReason'
  | 'nonvolatileStorage';

export const MCAL_PERIPHERALS: McalPeripheral[] = [
  'gpio',
  'adc',
  'dac',
  'pwm',
  'uart',
  'spi',
  'i2c',
  'can',
  'timer',
  'capture',
  'watchdog',
  'systemClock',
  'resetReason',
  'nonvolatileStorage',
];

export type McalStatusCode =
  | 'OK'
  | 'ERROR'
  | 'TIMEOUT'
  | 'NOT_IMPLEMENTED'
  | 'INVALID_CHANNEL'
  | 'INVALID_STATE'
  | 'HEALTH_FAULT';

export type McalOperationKind =
  | 'init'
  | 'deinit'
  | 'read'
  | 'write'
  | 'health'
  | 'safeState';

export type McalDirection = 'input' | 'output';

export interface McalScale {
  numerator: number;
  denominator: number;
  offset: number;
}

export interface McalRange {
  min: number;
  max: number;
}

export interface McalChannelConfig {
  peripheral: McalPeripheral;
  channelId: string;
  pin?: string;
  direction?: McalDirection;
  units?: string;
  scale?: McalScale;
  range?: McalRange;
  safeValue: boolean | number;
  timeoutMs?: number;
}

export interface McalHeaderModel {
  packTargetId: string;
  channels: McalChannelConfig[];
}
