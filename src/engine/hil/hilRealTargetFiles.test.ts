import { describe, it, expect } from 'vitest';
import { generateMISRACCode } from '../../utils/stateMachineCodeGenerator';
import type { StateData, VariableDef, Layer } from '../../types/sm_types';

const gen = (target: string, includeTestShims: boolean) => {
  const variables = [{ id: 'v1', name: 'v_out', type: 'bool', initialValue: 'false', currentValue: false, visibleInScope: true }] as VariableDef[];
  const states = [{
    id: 's1', name: 'S', x: 0, y: 0, width: 100, height: 100, entry: '', during: 'v_out = true;', exit: '', isActive: false,
    color: 'blue', parentId: 'root', children: [], priority: 1, isParallel: false, regionId: 'MAIN', autostart: true,
  }] as StateData[];
  const layers = [{ id: 'root', name: 'root', parentStateId: null, stateIds: ['s1'], transitionIds: [], junctionIds: [] }] as Layer[];
  return generateMISRACCode({
    tickMs: 10, states, junctions: [], transitions: [], variables, layers, safetyMode: false,
    hilConfig: {
      enabled: true, target, clockSpeed: 16, commPort: '', baudRate: 115200,
      channels: [{ id: 'o', name: 'v_out', peripheral: 'GPIO', pin: '13', direction: 'Out', dataType: 'bool', rangeMin: 0, rangeMax: 1, scalingFactor: 1, unit: '' }],
      mappings: [{ id: 'm', channelId: 'o', adiaVarId: 'v_out', direction: 'write' }],
    },
  } as never, { includeTestShims });
};

describe('real-target (includeTestShims:false) HIL output', () => {
  for (const target of ['Arduino_Uno', 'Arduino_Mega']) {
    it(`${target}: still emits the register-level Arduino runtime`, () => {
      const names = gen(target, false).files.map((f) => f.name);
      for (const n of ['Arduino.h', 'Arduino.cpp', 'SPI.h', 'Wire.h', 'SoftwareSerial.h', 'hal_drivers.c', 'main_hil.ino']) {
        expect(names, n).toContain(n);
      }
      const h = gen(target, false).files.find((f) => f.name === 'Arduino.h')!.content;
      expect(h).toContain('#include <avr/io.h>');
      expect(h).toContain('UBRR0H');
    });

    it(`${target}: Arduino runtime is identical with and without test shims`, () => {
      const real = gen(target, false).files.filter((f) => /^(Arduino\.(h|cpp)|SPI\.h|Wire\.h|SoftwareSerial\.h)$/.test(f.name));
      const shim = gen(target, true).files.filter((f) => /^(Arduino\.(h|cpp)|SPI\.h|Wire\.h|SoftwareSerial\.h)$/.test(f.name));
      expect(real.length).toBe(5);
      expect(real).toEqual(shim);
    });
  }

  it('ESP32 mock Arduino shim and STM32 mock HAL are only emitted for host tests', () => {
    expect(gen('ESP32', false).files.map((f) => f.name)).not.toContain('Arduino.h');
    expect(gen('ESP32', true).files.map((f) => f.name)).toContain('Arduino.h');
    expect(gen('STM32F4', false).files.map((f) => f.name)).not.toContain('stm32f4xx_hal.h');
    expect(gen('Generic', false).files.map((f) => f.name)).not.toContain('Arduino.h');
  });
});
