import type { TargetPackManifest, DriverMode } from './targetPackTypes.js';

export interface TargetChannelConfig {
  channelId: string;
  peripheral: string;
  pin?: string;
  function?: string;
  mode?: DriverMode;
  interrupt?: string;
  dmaChannel?: string;
}

export interface TargetConfiguration {
  driverMode?: DriverMode;
  cpuClockHz?: number;
  fpuMode?: string;
  channels: TargetChannelConfig[];
}

export interface TargetConfigurationDiagnostic {
  code:
    | 'PIN_FUNCTION_CONFLICT'
    | 'INVALID_ADC_PIN'
    | 'DUPLICATE_INTERRUPT'
    | 'DMA_COLLISION'
    | 'IMPOSSIBLE_CLOCK'
    | 'WRONG_FPU_MODE'
    | 'UNAVAILABLE_BARE_METAL'
    | 'RESERVED_DEBUG_PIN';
  message: string;
  channelId?: string;
}

const RESERVED_PINS = new Set([
  'PA13', 'PA14', 'PA15', 'PB3', 'PB4', // ARM SWD/JTAG
  'RESET', 'NRST',
]);

export function validateTargetConfiguration(
  pack: TargetPackManifest,
  config: TargetConfiguration,
): TargetConfigurationDiagnostic[] {
  const diagnostics: TargetConfigurationDiagnostic[] = [];

  // 1. Clock check
  if (config.cpuClockHz !== undefined) {
    if (config.cpuClockHz <= 0 || config.cpuClockHz > pack.device.maxCpuClockHz) {
      diagnostics.push({
        code: 'IMPOSSIBLE_CLOCK',
        message: `Clock ${config.cpuClockHz} Hz exceeds max ${pack.device.maxCpuClockHz} Hz`,
      });
    }
  }

  // 2. FPU check
  if (config.fpuMode !== undefined && config.fpuMode !== 'none') {
    if (pack.device.fpu === 'none') {
      diagnostics.push({
        code: 'WRONG_FPU_MODE',
        message: `Target device does not have FPU, requested ${config.fpuMode}`,
      });
    }
  }

  // 3. Driver mode check
  if (config.driverMode !== undefined) {
    if (!pack.supportedDriverModes.includes(config.driverMode)) {
      diagnostics.push({
        code: 'UNAVAILABLE_BARE_METAL',
        message: `Driver mode ${config.driverMode} not supported by pack`,
      });
    }
  }

  const pinUsage = new Map<string, string>();
  const interruptUsage = new Map<string, string>();
  const dmaUsage = new Map<string, string>();

  for (const channel of config.channels) {
    // Channel-level driver mode check
    if (channel.mode !== undefined && !pack.supportedDriverModes.includes(channel.mode)) {
      diagnostics.push({
        code: 'UNAVAILABLE_BARE_METAL',
        message: `Driver mode ${channel.mode} not supported by pack for channel ${channel.channelId}`,
        channelId: channel.channelId,
      });
    }

    if (channel.pin) {
      // Reserved debug pin check
      if (RESERVED_PINS.has(channel.pin)) {
        diagnostics.push({
          code: 'RESERVED_DEBUG_PIN',
          message: `Pin ${channel.pin} is a reserved debug pin`,
          channelId: channel.channelId,
        });
      }

      // Pin function conflict check
      if (pinUsage.has(channel.pin)) {
        diagnostics.push({
          code: 'PIN_FUNCTION_CONFLICT',
          message: `Pin ${channel.pin} is assigned to multiple channels: ${pinUsage.get(channel.pin)} and ${channel.channelId}`,
          channelId: channel.channelId,
        });
      } else {
        pinUsage.set(channel.pin, channel.channelId);
      }

      // ADC pin check
      if (channel.peripheral.toLowerCase() === 'adc') {
        const declaredPin = pack.pins.find(p => p.id === channel.pin);
        const hasAdcAf = declaredPin?.alternateFunctions && Object.keys(declaredPin.alternateFunctions).some(k => k.toLowerCase().includes('adc'));
        if (!declaredPin || !hasAdcAf) {
          diagnostics.push({
            code: 'INVALID_ADC_PIN',
            message: `Pin ${channel.pin} does not support ADC function`,
            channelId: channel.channelId,
          });
        }
      }
    }

    // Interrupt collision check
    if (channel.interrupt) {
      if (interruptUsage.has(channel.interrupt)) {
        diagnostics.push({
          code: 'DUPLICATE_INTERRUPT',
          message: `Interrupt ${channel.interrupt} assigned to multiple channels`,
          channelId: channel.channelId,
        });
      } else {
        interruptUsage.set(channel.interrupt, channel.channelId);
      }
    }

    // DMA collision check
    if (channel.dmaChannel) {
      if (dmaUsage.has(channel.dmaChannel)) {
        diagnostics.push({
          code: 'DMA_COLLISION',
          message: `DMA channel ${channel.dmaChannel} assigned to multiple channels`,
          channelId: channel.channelId,
        });
      } else {
        dmaUsage.set(channel.dmaChannel, channel.channelId);
      }
    }
  }

  return diagnostics;
}
