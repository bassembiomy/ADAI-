import fs from 'node:fs';
import path from 'node:path';
import { generateMISRACCode } from '../src/utils/stateMachineCodeGenerator';
import type { HILConfig, TargetMCU } from '../src/engine/hil/hilTypes';

const args = process.argv.slice(2);
function getArg(flag: string, fallback = ''): string {
  const idx = args.indexOf(flag);
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : fallback;
}

const target = (getArg('--target', 'STM32F4') as TargetMCU);
const outDir = path.resolve(getArg('--out', path.join(process.cwd(), 'hil_build')));

const TARGET_DEFAULT_PINS: Record<TargetMCU, { pinIn: string; pinOut: string }> = {
  Arduino_Uno: { pinIn: 'A0', pinOut: '13' },
  Arduino_Mega: { pinIn: 'A0', pinOut: '13' },
  STM32F1: { pinIn: 'PA0', pinOut: 'PB12' },
  STM32F4: { pinIn: 'PA0', pinOut: 'PD12' },
  ESP32: { pinIn: '32', pinOut: '2' },
  Generic: { pinIn: 'ADC_0', pinOut: 'PIN_0' },
};

const TARGET_IDS: Record<TargetMCU, string> = {
  Arduino_Uno: 'atmega328p',
  Arduino_Mega: 'atmega2560',
  STM32F1: 'stm32f103c8t6',
  STM32F4: 'stm32f407vgt6',
  ESP32: 'esp32-wroom-32',
  Generic: 'generic-host',
};

const pins = TARGET_DEFAULT_PINS[target] || TARGET_DEFAULT_PINS.Generic;
const targetId = TARGET_IDS[target] || 'generic-host';

const hilConfig: HILConfig = {
  enabled: true,
  target,
  targetSelection: {
    targetId,
    packVersion: '1.0.0',
    driverMode: target === 'ESP32' ? 'vendor' : 'bare-metal',
    boardRevision: 'A',
  },
  clockSpeed: target === 'ESP32' ? 240 : target === 'STM32F4' ? 168 : target === 'STM32F1' ? 72 : 16,
  commPort: 'COM3',
  baudRate: 115200,
  channels: [
    {
      id: 'ch_in',
      name: 'sensor_input',
      peripheral: target.startsWith('Arduino') || target === 'ESP32' || target.startsWith('STM32') ? 'ADC' : 'GPIO',
      pin: pins.pinIn,
      direction: 'In',
      dataType: 'float',
      rangeMin: 0,
      rangeMax: 100,
      scalingFactor: 1,
      unit: 'C',
    },
    {
      id: 'ch_out',
      name: 'actuator_output',
      peripheral: 'GPIO',
      pin: pins.pinOut,
      direction: 'Out',
      dataType: 'bool',
      rangeMin: 0,
      rangeMax: 1,
      scalingFactor: 1,
      unit: '',
    },
  ],
  mappings: [
    { id: 'm1', adiaVarId: 'sensor_val', channelId: 'ch_in', direction: 'read' },
    { id: 'm2', adiaVarId: 'actuator_on', channelId: 'ch_out', direction: 'write' },
  ],
};

const chart = {
  tickMs: 10,
  states: [
    {
      id: 's1',
      name: 'Monitor',
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      entry: '',
      during: '',
      exit: '',
      isActive: false,
      color: 'blue',
      parentId: 'root',
      children: [],
      priority: 1,
      isParallel: false,
      regionId: 'MAIN',
      autostart: true,
    },
  ],
  junctions: [],
  transitions: [],
  variables: [
    { id: 'v1', name: 'sensor_val', type: 'float', initialValue: '0.0', currentValue: 0, visibleInScope: true },
    { id: 'v2', name: 'actuator_on', type: 'bool', initialValue: 'false', currentValue: false, visibleInScope: true },
  ],
  layers: [
    { id: 'root', name: 'root', parentStateId: null, stateIds: ['s1'], transitionIds: [], junctionIds: [] },
  ],
  safetyMode: false,
  hilConfig,
};

fs.mkdirSync(outDir, { recursive: true });
const genRes = generateMISRACCode(chart as any, { includeTestShims: true });

if (genRes.errors && genRes.errors.length > 0) {
  console.error('[EMIT_ERROR]', genRes.errors);
  process.exit(1);
}

for (const file of genRes.files) {
  fs.writeFileSync(path.join(outDir, file.name), file.content, 'utf8');
}

console.log(`[EMIT_OK] Emitted ${genRes.files.length} files to ${outDir}`);
