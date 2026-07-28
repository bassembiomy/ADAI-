import { describe, expect, it } from 'vitest';
import { parseSafeValueForChannel } from './HILSignalMapper';
import type { DriverChannel } from '../../engine/hil/hilTypes';

const channel = (
  dataType: DriverChannel['dataType'],
  rangeMin: number,
  rangeMax: number,
): DriverChannel => ({
  id: 'output',
  name: 'output',
  peripheral: dataType === 'bool' ? 'GPIO' : 'PWM',
  pin: 'P0',
  direction: 'Out',
  dataType,
  rangeMin,
  rangeMax,
  scalingFactor: 1,
  unit: '',
});

describe('parseSafeValueForChannel', () => {
  it('uses the selected channel type for boolean safe values', () => {
    expect(parseSafeValueForChannel('true', channel('bool', 0, 1))).toEqual({
      value: true,
      error: null,
    });
    expect(parseSafeValueForChannel('2', channel('bool', 0, 1)).error).toContain(
      'true, false, 1, or 0',
    );
  });

  it('rejects numeric safe values outside the channel range', () => {
    expect(parseSafeValueForChannel('128', channel('uint16_t', 0, 255))).toEqual({
      value: 128,
      error: null,
    });
    expect(parseSafeValueForChannel('999', channel('uint16_t', 0, 255)).error).toContain(
      'between 0 and 255',
    );
  });

  it('rejects fractional safe values for integer channels', () => {
    expect(parseSafeValueForChannel('1.5', channel('uint16_t', 0, 255)).error).toContain(
      'whole number',
    );
    expect(parseSafeValueForChannel('1.5', channel('float', 0, 255))).toEqual({
      value: 1.5,
      error: null,
    });
  });
});
