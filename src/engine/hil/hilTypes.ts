export type TargetMCU = 'STM32F4' | 'STM32F1' | 'Arduino_Uno' | 'Arduino_Mega' | 'ESP32' | 'Generic';

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
}

export interface HILConfig {
  enabled: boolean;
  target: TargetMCU;
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
