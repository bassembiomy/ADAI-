import { describe, expect, it } from 'vitest';
import { coerceTypedValue, getTypeBounds } from './smTypedValue';

describe('coerceTypedValue', () => {
  it('saturates signed and unsigned integer bounds', () => {
    expect(coerceTypedValue(200, 'int8')).toMatchObject({ value: 127, overflowed: true });
    expect(coerceTypedValue(-1, 'uint8')).toMatchObject({ value: 0, overflowed: true });
    expect(coerceTypedValue(65536, 'uint16')).toMatchObject({ value: 65535, overflowed: true });
  });

  it('reports overflow without changing the candidate for error policy', () => {
    const result = coerceTypedValue(128, 'int8', 'error');
    expect(result.overflowed).toBe(true);
    expect(result.error).toContain("type 'int8'");
  });

  it('preserves float and double distinctions', () => {
    const value = 1.23456789;
    expect(coerceTypedValue(value, 'float').value).toBe(Math.fround(value));
    expect(coerceTypedValue(value, 'double').value).toBe(value);
  });

  it('exposes integer bounds', () => {
    expect(getTypeBounds('int16')).toEqual({ min: -32768, max: 32767 });
    expect(getTypeBounds('double')).toBeNull();
  });
});
