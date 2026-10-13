import type { VariableOverflowPolicy, VariableType } from '../../types/sm_types';

export interface TypedValueResult {
  value: number | boolean;
  overflowed: boolean;
  error?: string;
}

const INTEGER_BOUNDS: Partial<Record<VariableType, { min: number; max: number }>> = {
  int8: { min: -128, max: 127 },
  uint8: { min: 0, max: 255 },
  int16: { min: -32768, max: 32767 },
  uint16: { min: 0, max: 65535 },
  int: { min: -2147483648, max: 2147483647 },
  int32: { min: -2147483648, max: 2147483647 },
  uint: { min: 0, max: 4294967295 },
  uint32: { min: 0, max: 4294967295 },
  int64: { min: Number.MIN_SAFE_INTEGER, max: Number.MAX_SAFE_INTEGER },
  uint64: { min: 0, max: Number.MAX_SAFE_INTEGER },
};

export const getTypeBounds = (type: VariableType): { min: number; max: number } | null =>
  INTEGER_BOUNDS[type] ?? null;

export const coerceTypedValue = (
  value: number | boolean,
  type: VariableType,
  policy: VariableOverflowPolicy = 'saturate',
): TypedValueResult => {
  if (type === 'bool') return { value: Boolean(value), overflowed: false };
  const numeric = Number(value);
  const floatValue = type === 'float' || type === 'single' ? Math.fround(numeric) : numeric;
  const nonFinite = !Number.isFinite(numeric) || !Number.isFinite(floatValue);
  const bounds = getTypeBounds(type);
  const integerType = bounds !== null;
  const overflowed = nonFinite || (bounds !== null && (numeric < bounds.min || numeric > bounds.max));
  if (!overflowed) {
    return { value: integerType ? Math.trunc(numeric) : floatValue, overflowed: false };
  }
  if (policy === 'error') {
    return {
      value: floatValue,
      overflowed: true,
      error: `Value '${String(value)}' overflows variable type '${type}'.`,
    };
  }
  if (bounds !== null) {
    return { value: Math.min(bounds.max, Math.max(bounds.min, Math.trunc(numeric))), overflowed: true };
  }
  return {
    value: type === 'float' || type === 'single'
      ? (numeric < 0 ? -Number.MAX_VALUE : Number.MAX_VALUE)
      : (numeric < 0 ? -Number.MAX_VALUE : Number.MAX_VALUE),
    overflowed: true,
  };
};
