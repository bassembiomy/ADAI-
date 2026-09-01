import type { DriverChannel, TargetMCU } from './hilTypes';

export interface PinValidationIssue {
  level: 'error' | 'warning';
  channelId: string;
  message: string;
}

export interface PackLike {
  pins?: Array<{ id: string }>;
  pinsComplete?: boolean;
  capabilityManifest?: { supportedPeripherals?: string[] };
}

interface FamilyRule {
  validPin: (pin: string) => boolean;
  describe: string;
  serialConflict?: (pin: string) => boolean;
  strappingWarn?: (pin: string) => boolean;
  inputOnlyError?: (pin: string) => boolean;
}

const arduinoDigital = (max: number) => {
  const analogCount = max === 13 ? 6 : 16;
  const analog = Array.from({ length: analogCount }, (_, i) => `A${i}`);
  return new Set([...Array.from({ length: max + 1 }, (_, i) => String(i)), ...analog]);
};

const FAMILY: Partial<Record<TargetMCU, FamilyRule>> = {
  Arduino_Uno: {
    validPin: p => arduinoDigital(13).has(p.trim().toUpperCase()),
    describe: "numeric '0'-'13' or analog 'A0'-'A5'",
    serialConflict: p => p.trim() === '0' || p.trim() === '1',
  },
  Arduino_Mega: {
    validPin: p => arduinoDigital(53).has(p.trim().toUpperCase()),
    describe: "numeric '0'-'53' or analog 'A0'-'A15'",
    serialConflict: p => p.trim() === '0' || p.trim() === '1',
  },
  STM32F1: {
    validPin: p => /^P[A-EL][0-9]$|^P[A-EL]1[0-5]$/i.test(p.trim()),
    describe: "STM32 style e.g. 'PA5', 'PB12'",
  },
  STM32F4: {
    validPin: p => /^P[A-EL][0-9]$|^P[A-EL]1[0-5]$/i.test(p.trim()),
    describe: "STM32 style e.g. 'PA5', 'PB12'",
  },
  ESP32: {
    validPin: p => /^(0|[1-9]|[1-3][0-9])$/.test(p.trim()) && Number(p.trim()) <= 39,
    describe: "GPIO numbers '0'-'39'",
    strappingWarn: p => ['0', '2', '5', '12', '15'].includes(p.trim()),
    inputOnlyError: p => ['34', '35', '36', '39'].includes(p.trim()),
  },
};

export function validatePinAssignments(
  channels: DriverChannel[],
  opts: { targetLegacy: TargetMCU; pack?: PackLike | null },
): PinValidationIssue[] {
  const issues: PinValidationIssue[] = [];
  const family = FAMILY[opts.targetLegacy];

  if (family) {
    const seen = new Map<string, string>();
    for (const ch of channels) {
      const pin = String(ch.pin ?? '').trim();

      if (/^P[A-L]\d+$/i.test(pin) && opts.targetLegacy.startsWith('Arduino')) {
        issues.push({
          level: 'error',
          channelId: ch.id,
          message: `pin '${pin}' uses STM32-style naming which is invalid on ${opts.targetLegacy}; use numeric pins ('13') or analog pins ('A0')`,
        });
      }
      if (opts.targetLegacy.startsWith('Arduino') && family.serialConflict?.(pin)) {
        issues.push({
          level: 'warning',
          channelId: ch.id,
          message: `pin '${pin}' is a Hardware Serial RX/TX pin and conflicts with HIL UART communication; remap (e.g. '4' or '22')`,
        });
      }
      if (!family.validPin(pin)) {
        issues.push({
          level: 'error',
          channelId: ch.id,
          message: `pin '${pin}' is not available on ${opts.targetLegacy}; expected ${family.describe}`,
        });
      } else {
        const owner = seen.get(pin.toUpperCase());
        if (owner && owner !== ch.id) {
          issues.push({
            level: 'error',
            channelId: ch.id,
            message: `pin '${pin}' already assigned to channel '${owner}'`,
          });
        } else {
          seen.set(pin.toUpperCase(), ch.id);
        }
      }
      if (ch.direction === 'Out' && family.inputOnlyError?.(pin)) {
        issues.push({
          level: 'error',
          channelId: ch.id,
          message: `pin '${pin}' is input-only on ESP32 and cannot drive an output channel`,
        });
      }
      if (family.strappingWarn?.(pin) && ch.direction === 'Out') {
        issues.push({
          level: 'warning',
          channelId: ch.id,
          message: `pin '${pin}' is an ESP32 strapping pin; avoid outputs on it (boot mode side effects)`,
        });
      }
    }
  }

  if (opts.pack?.capabilityManifest?.supportedPeripherals?.length) {
    const supported = new Set(opts.pack.capabilityManifest.supportedPeripherals.map(p => p.toLowerCase()));
    for (const ch of channels) {
      if (!supported.has(ch.peripheral.toLowerCase())) {
        issues.push({
          level: 'error',
          channelId: ch.id,
          message: `peripheral '${ch.peripheral}' is not supported by the selected target pack (${[...supported].join(', ')})`,
        });
      }
    }
  }

  if (opts.pack?.pinsComplete && Array.isArray(opts.pack.pins) && opts.pack.pins.length > 0) {
    const known = new Set(opts.pack.pins.map(p => p.id.toUpperCase()));
    for (const ch of channels) {
      if (!known.has(String(ch.pin).trim().toUpperCase())) {
        issues.push({
          level: 'error',
          channelId: ch.id,
          message: `pin '${ch.pin}' is not defined in target pack pins[]`,
        });
      }
    }
  }

  return issues;
}
