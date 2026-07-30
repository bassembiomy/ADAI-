export interface XBFixedType {
  readonly kind: 'fixed';
  readonly signed: boolean;
  readonly wordLength: number;
  readonly fractionLength: number;
}

export interface XBFloatType {
  readonly kind: 'float';
  readonly precision: 'float16' | 'float32' | 'float64';
}

export interface XBBooleanType {
  readonly kind: 'boolean';
}

export type XBNumericType =
  | XBFixedType
  | XBFloatType
  | XBBooleanType
  | { readonly kind: 'float16' | 'float32' | 'float64' };

export type XBRoundingMode =
  | 'floor'
  | 'ceiling'
  | 'zero'
  | 'nearest'
  | 'round'
  | 'convergent'
  | 'simplest';

export type XBOverflowMode = 'saturate' | 'wrap' | 'error';

export interface XBConversionPolicy {
  readonly rounding: XBRoundingMode;
  readonly overflow: XBOverflowMode;
  readonly supportsFloat16?: boolean;
}

export interface XBConversionResult {
  readonly value: number | boolean;
  readonly storedInteger: number | null;
  readonly quantizationError: number;
  readonly fault: 'overflow' | 'non-finite' | 'unsupported-float' | null;
}

export type XBShape =
  | { readonly kind: 'scalar' }
  | { readonly kind: 'vector'; readonly length: number }
  | {
      readonly kind: 'matrix';
      readonly rows: number;
      readonly columns: number;
    };

export interface XBTypedValue {
  readonly shape: XBShape;
  readonly values: readonly (number | boolean)[];
}

type XBScalar = number | boolean;
type XBShapedInput = XBScalar | readonly XBShapedInput[];
type XBScalarConverter = (
  value: XBScalar,
  index: number,
) => XBScalar | XBConversionResult;

const assertFixedType = (type: XBFixedType): void => {
  if (!Number.isInteger(type.wordLength)
    || type.wordLength < 1
    || type.wordLength > 32) {
    throw new RangeError('Fixed-point wordLength must be an integer from 1 through 32.');
  }
  if (!Number.isInteger(type.fractionLength)) {
    throw new RangeError('Fixed-point fractionLength must be an integer.');
  }

  const scale = 2 ** type.fractionLength;
  if (!Number.isFinite(scale) || scale === 0) {
    throw new RangeError('Fixed-point fractionLength produces an unsupported binary-point scale.');
  }
};

const roundStoredInteger = (
  value: number,
  mode: Exclude<XBRoundingMode, 'simplest'>,
): number => {
  switch (mode) {
    case 'floor':
      return Math.floor(value);
    case 'ceiling':
      return Math.ceil(value);
    case 'zero':
      return Math.trunc(value);
    case 'nearest': {
      const lower = Math.floor(value);
      return value - lower < 0.5 ? lower : lower + 1;
    }
    case 'round': {
      const magnitude = Math.floor(Math.abs(value) + 0.5);
      return value < 0 ? -magnitude : magnitude;
    }
    case 'convergent': {
      const lower = Math.floor(value);
      const fraction = value - lower;
      if (fraction < 0.5) return lower;
      if (fraction > 0.5) return lower + 1;
      return lower % 2 === 0 ? lower : lower + 1;
    }
  }
};

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.max(minimum, Math.min(maximum, value));

const positiveModulo = (value: number, modulus: number): number => {
  const remainder = value % modulus;
  return remainder < 0 ? remainder + modulus : remainder;
};

const float16BitsToNumber = (bits: number): number => {
  const sign = (bits & 0x8000) === 0 ? 1 : -1;
  const exponent = (bits >>> 10) & 0x1f;
  const fraction = bits & 0x03ff;

  if (exponent === 0) {
    return fraction === 0
      ? sign < 0 ? -0 : 0
      : sign * fraction * 2 ** -24;
  }
  if (exponent === 0x1f) {
    return fraction === 0 ? sign * Number.POSITIVE_INFINITY : Number.NaN;
  }
  return sign * (1 + fraction / 1024) * 2 ** (exponent - 15);
};

const float32Buffer = new ArrayBuffer(4);
const float32View = new DataView(float32Buffer);

const numberToFloat16Bits = (value: number): number => {
  float32View.setFloat32(0, value, false);
  const bits = float32View.getUint32(0, false);
  const sign = (bits >>> 16) & 0x8000;
  const exponent = (bits >>> 23) & 0xff;
  let fraction = bits & 0x7fffff;

  if (exponent === 0xff) {
    return sign | (fraction === 0 ? 0x7c00 : 0x7e00);
  }

  let halfExponent = exponent - 127 + 15;
  if (halfExponent >= 0x1f) return sign | 0x7c00;

  if (halfExponent <= 0) {
    if (halfExponent < -10) return sign;
    fraction |= 0x800000;
    const shift = 14 - halfExponent;
    let halfFraction = fraction >>> shift;
    const remainder = fraction & (2 ** shift - 1);
    const halfway = 2 ** (shift - 1);
    if (remainder > halfway || (remainder === halfway && (halfFraction & 1) !== 0)) {
      halfFraction += 1;
    }
    return sign | halfFraction;
  }

  let halfFraction = fraction >>> 13;
  const remainder = fraction & 0x1fff;
  if (remainder > 0x1000 || (remainder === 0x1000 && (halfFraction & 1) !== 0)) {
    halfFraction += 1;
    if (halfFraction === 0x400) {
      halfFraction = 0;
      halfExponent += 1;
      if (halfExponent >= 0x1f) return sign | 0x7c00;
    }
  }

  return sign | (halfExponent << 10) | halfFraction;
};

const convertFloat16 = (value: number): number =>
  float16BitsToNumber(numberToFloat16Bits(value));

const getFloatPrecision = (
  destination: Exclude<XBNumericType, XBFixedType | XBBooleanType>,
): 'float16' | 'float32' | 'float64' =>
  destination.kind === 'float' ? destination.precision : destination.kind;

export const xbConvertScalar = (
  value: number,
  destination: XBNumericType,
  policy: XBConversionPolicy,
): XBConversionResult => {
  if (policy.rounding === 'simplest') {
    throw new Error(
      'Resolve "simplest" rounding to either "floor" or "zero" before numeric execution.',
    );
  }

  if (!Number.isFinite(value)) {
    return {
      value: destination.kind === 'boolean' ? false : value,
      storedInteger: null,
      quantizationError: 0,
      fault: 'non-finite',
    };
  }

  if (destination.kind === 'boolean') {
    const converted = value !== 0;
    return {
      value: converted,
      storedInteger: converted ? 1 : 0,
      quantizationError: Math.abs(value - Number(converted)),
      fault: null,
    };
  }

  if (destination.kind !== 'fixed') {
    const precision = getFloatPrecision(destination);
    if (precision === 'float16' && policy.supportsFloat16 !== true) {
      return {
        value,
        storedInteger: null,
        quantizationError: 0,
        fault: 'unsupported-float',
      };
    }

    const converted = precision === 'float16'
      ? convertFloat16(value)
      : precision === 'float32'
        ? Math.fround(value)
        : value;
    return {
      value: converted,
      storedInteger: null,
      quantizationError: Math.abs(value - converted),
      fault: Number.isFinite(converted) ? null : 'non-finite',
    };
  }

  assertFixedType(destination);
  const scale = 2 ** destination.fractionLength;
  const scaled = value * scale;
  const minimum = destination.signed ? -(2 ** (destination.wordLength - 1)) : 0;
  const maximum = destination.signed
    ? 2 ** (destination.wordLength - 1) - 1
    : 2 ** destination.wordLength - 1;

  if (!Number.isFinite(scaled) || Math.abs(scaled) > Number.MAX_SAFE_INTEGER) {
    const storedInteger = scaled < 0 ? minimum : maximum;
    const converted = storedInteger / scale;
    return {
      value: converted,
      storedInteger,
      quantizationError: Math.abs(value - converted),
      fault: 'overflow',
    };
  }

  const rounded = roundStoredInteger(scaled, policy.rounding);
  let storedInteger = rounded;
  let fault: XBConversionResult['fault'] = null;
  const overflowed = rounded < minimum || rounded > maximum;

  if (overflowed) {
    switch (policy.overflow) {
      case 'saturate':
        storedInteger = clamp(rounded, minimum, maximum);
        break;
      case 'wrap': {
        const modulus = 2 ** destination.wordLength;
        const residue = positiveModulo(rounded, modulus);
        storedInteger = destination.signed && residue >= modulus / 2
          ? residue - modulus
          : residue;
        break;
      }
      case 'error':
        storedInteger = clamp(rounded, minimum, maximum);
        fault = 'overflow';
        break;
    }
  }

  const converted = storedInteger / scale;
  return {
    value: converted,
    storedInteger,
    quantizationError: Math.abs(value - converted),
    fault,
  };
};

const assertPositiveDimension = (name: string, value: number): void => {
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive integer.`);
  }
};

const unwrapConvertedScalar = (
  converted: XBScalar | XBConversionResult,
): XBScalar => {
  if (typeof converted === 'object') return converted.value;
  return converted;
};

export const xbMapValue = (
  value: XBShapedInput,
  shape: XBShape,
  convert: XBScalarConverter,
): XBTypedValue => {
  let sourceValues: readonly XBScalar[];

  if (shape.kind === 'scalar') {
    if (Array.isArray(value)) {
      throw new TypeError('Scalar value must not be an array.');
    }
    sourceValues = [value as XBScalar];
  } else if (shape.kind === 'vector') {
    assertPositiveDimension('Vector length', shape.length);
    if (!Array.isArray(value)
      || value.length !== shape.length
      || value.some(Array.isArray)) {
      throw new TypeError(`Vector value must contain exactly ${shape.length} scalar elements.`);
    }
    sourceValues = value as readonly XBScalar[];
  } else {
    assertPositiveDimension('Matrix row count', shape.rows);
    assertPositiveDimension('Matrix column count', shape.columns);
    if (!Array.isArray(value) || value.length !== shape.rows) {
      throw new TypeError(`Matrix value must contain exactly ${shape.rows} rows.`);
    }

    const flattened: XBScalar[] = [];
    for (const row of value) {
      if (!Array.isArray(row)
        || row.length !== shape.columns
        || row.some(Array.isArray)) {
        throw new TypeError(
          `Matrix rows must each contain exactly ${shape.columns} scalar elements.`,
        );
      }
      flattened.push(...row as readonly XBScalar[]);
    }
    sourceValues = flattened;
  }

  return {
    shape,
    values: sourceValues.map((entry, index) =>
      unwrapConvertedScalar(convert(entry, index))),
  };
};
