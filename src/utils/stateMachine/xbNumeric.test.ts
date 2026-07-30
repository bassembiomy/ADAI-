import { describe, expect, it } from 'vitest';
import {
  xbConvertScalar,
  xbMapValue,
  type XBConversionPolicy,
  type XBFixedType,
} from './xbNumeric';

const signed8: XBFixedType = {
  kind: 'fixed',
  signed: true,
  wordLength: 8,
  fractionLength: 0,
};

const saturating = (
  rounding: XBConversionPolicy['rounding'] = 'floor',
): XBConversionPolicy => ({
  rounding,
  overflow: 'saturate',
});

describe('xbConvertScalar', () => {
  it.each([
    ['floor', -1.5, -2],
    ['ceiling', -1.5, -1],
    ['zero', -1.5, -1],
    ['nearest', -1.5, -1],
    ['round', -1.5, -2],
    ['convergent', -1.5, -2],
  ] as const)('%s converts negative ties correctly', (rounding, input, stored) => {
    const result = xbConvertScalar(input, signed8, {
      rounding,
      overflow: 'saturate',
    });

    expect(result.storedInteger).toBe(stored);
    expect(result.value).toBe(stored);
    expect(result.fault).toBeNull();
  });

  it('saturates at signed and unsigned stored-integer boundaries', () => {
    const signedHigh = xbConvertScalar(128, signed8, saturating());
    const signedLow = xbConvertScalar(-129, signed8, saturating());
    const unsignedLow = xbConvertScalar(-1, {
      ...signed8,
      signed: false,
    }, saturating());
    const unsignedHigh = xbConvertScalar(256, {
      ...signed8,
      signed: false,
    }, saturating());

    expect([signedHigh.storedInteger, signedLow.storedInteger]).toEqual([127, -128]);
    expect([unsignedLow.storedInteger, unsignedHigh.storedInteger]).toEqual([0, 255]);
  });

  it('uses two-complement modular wrap for signed and unsigned values', () => {
    const signedHigh = xbConvertScalar(128, signed8, {
      rounding: 'zero',
      overflow: 'wrap',
    });
    const signedLow = xbConvertScalar(-129, signed8, {
      rounding: 'zero',
      overflow: 'wrap',
    });
    const unsignedLow = xbConvertScalar(-1, {
      ...signed8,
      signed: false,
    }, {
      rounding: 'zero',
      overflow: 'wrap',
    });

    expect([signedHigh.storedInteger, signedLow.storedInteger]).toEqual([-128, 127]);
    expect(unsignedLow.storedInteger).toBe(255);
  });

  it('reports overflow-as-error while returning a representable boundary value', () => {
    const result = xbConvertScalar(128, signed8, {
      rounding: 'zero',
      overflow: 'error',
    });

    expect(result).toMatchObject({
      value: 127,
      storedInteger: 127,
      fault: 'overflow',
    });
  });

  it('rejects fixed-point intermediates outside the exact JS integer range', () => {
    const result = xbConvertScalar(Number.MAX_SAFE_INTEGER, {
      kind: 'fixed',
      signed: true,
      wordLength: 32,
      fractionLength: 1,
    }, saturating());

    expect(result.fault).toBe('overflow');
    expect(result.storedInteger).toBe(2147483647);
  });

  it('quantizes through a true stored integer and binary-point scale', () => {
    const result = xbConvertScalar(1.2345, {
      kind: 'fixed',
      signed: true,
      wordLength: 8,
      fractionLength: 4,
    }, saturating());

    expect(result.storedInteger).toBe(19);
    expect(result.value).toBe(1.1875);
    expect(result.quantizationError).toBeCloseTo(0.047, 12);
  });

  it('uses Math.fround for float32 and explicit JS double for float64', () => {
    const value = 1 + 2 ** -24;
    const float32 = xbConvertScalar(value, {
      kind: 'float',
      precision: 'float32',
    }, saturating());
    const float64 = xbConvertScalar(value, {
      kind: 'float',
      precision: 'float64',
    }, {
      ...saturating(),
      supportsFloat64: true,
    });

    expect(float32.value).toBe(Math.fround(value));
    expect(float64.value).toBe(value);
    expect(float32.storedInteger).toBeNull();
    expect(float64.fault).toBeNull();
  });

  it('reports unsupported float64 unless the target enables it', () => {
    const unsupported = xbConvertScalar(Math.PI, {
      kind: 'float',
      precision: 'float64',
    }, saturating());
    const supported = xbConvertScalar(Math.PI, {
      kind: 'float',
      precision: 'float64',
    }, {
      ...saturating(),
      supportsFloat64: true,
    });

    expect(unsupported.fault).toBe('unsupported-float');
    expect(supported).toMatchObject({
      value: Math.PI,
      fault: null,
    });
  });

  it('reports unsupported float16 unless the target enables it', () => {
    const unsupported = xbConvertScalar(Math.PI, {
      kind: 'float',
      precision: 'float16',
    }, saturating());
    const supported = xbConvertScalar(Math.PI, {
      kind: 'float',
      precision: 'float16',
    }, {
      ...saturating(),
      supportsFloat16: true,
    });

    expect(unsupported.fault).toBe('unsupported-float');
    expect(supported.fault).toBeNull();
    expect(supported.value).toBe(3.140625);
  });

  it('rounds binary16 directly from the JS double without float32 double-rounding', () => {
    const result = xbConvertScalar(1.0004882821813226, {
      kind: 'float',
      precision: 'float16',
    }, {
      ...saturating(),
      supportsFloat16: true,
    });

    expect(result.value).toBe(1.0009765625);
  });

  it('reports non-finite fixed-point inputs without manufacturing an integer', () => {
    const result = xbConvertScalar(Number.POSITIVE_INFINITY, signed8, saturating());

    expect(result.fault).toBe('non-finite');
    expect(result.storedInteger).toBeNull();
  });

  it('requires simplest rounding to be resolved before execution', () => {
    expect(() => xbConvertScalar(1.25, signed8, {
      rounding: 'simplest',
      overflow: 'saturate',
    })).toThrow(/resolve.*simplest/i);
  });

  it.each([
    [{ rounding: 'sideways', overflow: 'saturate' }, /rounding/i],
    [{ rounding: 'floor', overflow: 'ignore' }, /overflow/i],
  ])('rejects malformed conversion policy %#', (policy, message) => {
    expect(() => xbConvertScalar(1, signed8, policy as XBConversionPolicy))
      .toThrow(message);
  });

  it.each([
    [{ kind: 'decimal128' }, /numeric type/i],
    [{ kind: 'float', precision: 'float128' }, /precision/i],
  ])('rejects malformed destination type %#', (destination, message) => {
    expect(() => xbConvertScalar(
      1,
      destination as unknown as XBFixedType,
      saturating(),
    )).toThrow(message);
  });
});

describe('xbMapValue', () => {
  const convert = (value: number | boolean) => xbConvertScalar(Number(value), signed8, {
    rounding: 'zero',
    overflow: 'saturate',
  }).value;

  it('maps fixed-length vectors without changing element order', () => {
    const result = xbMapValue([1.9, -2.9, 3.1], {
      kind: 'vector',
      length: 3,
    }, convert);

    expect(result.values).toEqual([1, -2, 3]);
    expect(result.faults).toEqual([]);
    expect(result.fault).toBeNull();
  });

  it('flattens matrices in row-major order', () => {
    const result = xbMapValue([
      [1.9, 2.9, 3.9],
      [4.9, 5.9, 6.9],
    ], {
      kind: 'matrix',
      rows: 2,
      columns: 3,
    }, convert);

    expect(result.values).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('maps scalar values with the same conversion contract', () => {
    const result = xbMapValue(3.9, { kind: 'scalar' }, convert);

    expect(result).toEqual({
      shape: { kind: 'scalar' },
      values: [3],
      faults: [],
      fault: null,
    });
  });

  it('preserves all element faults in row-major index order', () => {
    const result = xbMapValue([128, 1, -129], {
      kind: 'vector',
      length: 3,
    }, (value) => xbConvertScalar(Number(value), signed8, {
      rounding: 'zero',
      overflow: 'error',
    }));

    expect(result.values).toEqual([127, 1, -128]);
    expect(result.fault).toBe('overflow');
    expect(result.faults).toEqual([
      { index: 0, fault: 'overflow' },
      { index: 2, fault: 'overflow' },
    ]);
  });

  it('rejects ragged or dimensionally invalid shaped values', () => {
    expect(() => xbMapValue([[1, 2], [3]], {
      kind: 'matrix',
      rows: 2,
      columns: 2,
    }, convert)).toThrow(/matrix/i);
  });

  it.each([
    [{ kind: 'vector', length: 0 }, /positive integer/i],
    [{ kind: 'vector', length: -1 }, /positive integer/i],
    [{ kind: 'vector', length: 1.5 }, /positive integer/i],
    [{ kind: 'matrix', rows: 0, columns: 1 }, /positive integer/i],
    [{ kind: 'matrix', rows: -1, columns: 1 }, /positive integer/i],
    [{ kind: 'matrix', rows: 1.5, columns: 1 }, /positive integer/i],
    [{ kind: 'matrix', rows: 1, columns: 0 }, /positive integer/i],
    [{ kind: 'matrix', rows: 1, columns: -1 }, /positive integer/i],
    [{ kind: 'matrix', rows: 1, columns: 1.5 }, /positive integer/i],
  ])('rejects invalid shape dimensions %#', (shape, message) => {
    expect(() => xbMapValue([], shape as any, convert)).toThrow(message);
  });
});
