'use strict';

const KNOWN_PROBE_PATTERNS = Object.freeze([
  {
    programmerId: 'stlink-v2-1',
    family: 'stm32',
    vendorIds: ['0483'],
    productIds: ['3748', '374b', '374e', '3752', '374a', '3744'],
    targetIds: ['stm32f103c8t6', 'stm32f407vgt6', 'STM32F1', 'STM32F4'],
  },
  {
    programmerId: 'openocd',
    family: 'stm32',
    vendorIds: ['0483', '0d28'],
    productIds: [],
    targetIds: ['stm32f103c8t6', 'stm32f407vgt6', 'STM32F1', 'STM32F4'],
  },
  {
    programmerId: 'avrdude',
    family: 'avr',
    vendorIds: ['2341', '1a86', '10c4', '0403'],
    productIds: ['0043', '0001', '0042', '0010', '7523', 'ea60'],
    targetIds: ['atmega328p', 'atmega2560', 'Arduino_Uno', 'Arduino_Mega'],
  },
  {
    programmerId: 'esptool',
    family: 'esp32',
    vendorIds: ['10c4', '1a86', '303a'],
    productIds: ['ea60', '7523', '1001', '1002'],
    targetIds: ['esp32-wroom-32', 'ESP32'],
  },
]);

async function detectProbes(targetSelection, opts = {}) {
  if (opts.mockProbes) {
    return opts.mockProbes.filter(p => {
      if (!targetSelection || !targetSelection.targetId) return true;
      const tid = String(targetSelection.targetId);
      const pattern = KNOWN_PROBE_PATTERNS.find(pat => pat.programmerId === p.programmerId || pat.targetIds.includes(tid));
      return pattern ? pattern.targetIds.includes(tid) : true;
    });
  }

  let ports = [];
  if (typeof opts.listPorts === 'function') {
    ports = await opts.listPorts();
  } else {
    try {
      const { SerialPort } = require('serialport');
      ports = await SerialPort.list();
    } catch {
      ports = [];
    }
  }

  const detected = [];
  const targetId = targetSelection?.targetId ? String(targetSelection.targetId) : '';

  for (const p of ports) {
    const vid = (p.vendorId || '').toLowerCase().replace(/^0x/, '');
    const pid = (p.productId || '').toLowerCase().replace(/^0x/, '');

    for (const pattern of KNOWN_PROBE_PATTERNS) {
      const vidMatch = pattern.vendorIds.some(v => v.toLowerCase() === vid);
      const pidMatch = pattern.productIds.length === 0 || pattern.productIds.some(pd => pd.toLowerCase() === pid);

      if (vidMatch && pidMatch) {
        const matchesTarget = !targetId || pattern.targetIds.includes(targetId);
        if (matchesTarget) {
          detected.push({
            probeId: `${pattern.programmerId}-${p.path || p.serialNumber || '0'}`,
            programmerId: pattern.programmerId,
            port: p.path,
            vendorId: p.vendorId,
            productId: p.productId,
            serial: p.serialNumber || 'UNKNOWN',
            description: p.friendlyName || p.manufacturer || pattern.programmerId,
            family: pattern.family,
          });
        }
        break;
      }
    }
  }

  return detected;
}

module.exports = { detectProbes, KNOWN_PROBE_PATTERNS };
