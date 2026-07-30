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
  readonly supportsFloat64?: boolean;
}

export type XBNumericFault = 'overflow' | 'non-finite' | 'unsupported-float';

export interface XBConversionResult {
  readonly value: number | boolean;
  readonly storedInteger: number | null;
  readonly quantizationError: number;
  readonly fault: XBNumericFault | null;
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
  readonly faults: readonly {
    readonly index: number;
    readonly fault: XBNumericFault;
  }[];
  readonly fault: XBNumericFault | null;
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

const roundPositiveTiesToEven = (value: number): number => {
  const lower = Math.floor(value);
  const fraction = value - lower;
  if (fraction < 0.5) return lower;
  if (fraction > 0.5) return lower + 1;
  return lower % 2 === 0 ? lower : lower + 1;
};

const convertFloat16 = (value: number): number => {
  if (value === 0) return value;

  const sign = value < 0 ? -1 : 1;
  const magnitude = Math.abs(value);
  const minimumNormal = 2 ** -14;
  const exponent = magnitude < minimumNormal
    ? -14
    : Math.floor(Math.log2(magnitude));
  const step = magnitude < minimumNormal
    ? 2 ** -24
    : 2 ** (exponent - 10);
  const roundedMagnitude = roundPositiveTiesToEven(magnitude / step) * step;

  return roundedMagnitude >= 65536
    ? sign * Number.POSITIVE_INFINITY
    : sign * roundedMagnitude;
};

const getFloatPrecision = (
  destination: Exclude<XBNumericType, XBFixedType | XBBooleanType>,
): 'float16' | 'float32' | 'float64' =>
  destination.kind === 'float' ? destination.precision : destination.kind;

const ROUNDING_MODES: readonly XBRoundingMode[] = [
  'floor',
  'ceiling',
  'zero',
  'nearest',
  'round',
  'convergent',
  'simplest',
];

const OVERFLOW_MODES: readonly XBOverflowMode[] = ['saturate', 'wrap', 'error'];

const validateConversionPolicy = (policy: XBConversionPolicy): void => {
  if (!ROUNDING_MODES.includes(policy.rounding)) {
    throw new RangeError(`Unsupported rounding mode: ${String(policy.rounding)}.`);
  }
  if (!OVERFLOW_MODES.includes(policy.overflow)) {
    throw new RangeError(`Unsupported overflow mode: ${String(policy.overflow)}.`);
  }
};

const validateNumericType = (destination: XBNumericType): void => {
  if (typeof destination !== 'object' || destination === null) {
    throw new TypeError('Unsupported numeric type.');
  }

  if (destination.kind === 'fixed') {
    assertFixedType(destination);
    return;
  }
  if (destination.kind === 'boolean'
    || destination.kind === 'float16'
    || destination.kind === 'float32'
    || destination.kind === 'float64') {
    return;
  }
  if (destination.kind === 'float') {
    if (!['float16', 'float32', 'float64'].includes(destination.precision)) {
      throw new RangeError(`Unsupported float precision: ${String(destination.precision)}.`);
    }
    return;
  }

  throw new RangeError(`Unsupported numeric type: ${String((destination as any).kind)}.`);
};

export const xbConvertScalar = (
  value: number,
  destination: XBNumericType,
  policy: XBConversionPolicy,
): XBConversionResult => {
  validateConversionPolicy(policy);
  validateNumericType(destination);

  if (policy.rounding === 'simplest') {
    throw new Error(
      'Resolve "simplest" rounding to either "floor" or "zero" before numeric execution.',
    );
  }

  const precision = destination.kind !== 'fixed' && destination.kind !== 'boolean'
    ? getFloatPrecision(destination)
    : null;
  if ((precision === 'float16' && policy.supportsFloat16 !== true)
    || (precision === 'float64' && policy.supportsFloat64 !== true)) {
    return {
      value,
      storedInteger: null,
      quantizationError: 0,
      fault: 'unsupported-float',
    };
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

  const values: XBScalar[] = [];
  const faults: Array<{ index: number; fault: XBNumericFault }> = [];
  sourceValues.forEach((entry, index) => {
    const converted = convert(entry, index);
    if (typeof converted === 'object') {
      values.push(converted.value);
      if (converted.fault !== null) {
        faults.push({ index, fault: converted.fault });
      }
    } else {
      values.push(converted);
    }
  });

  return {
    shape,
    values,
    faults,
    fault: faults[0]?.fault ?? null,
  };
};
