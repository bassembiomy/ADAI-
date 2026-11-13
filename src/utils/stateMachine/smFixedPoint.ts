import type { FixedPointFormat, FixedPointRounding } from '../../types/sm_types';

/*
 * Fixed-point (fixdt) arithmetic on stored integers, shared by the simulation. The generated C
 * (smCArith.ts: SM_FxAlign, SM_FxRescale, SM_FxDiv, SM_FxStore, SM_FxStoreDouble) implements the very
 * same operations on int64_t, so the two agree bit for bit.
 *
 * A fixed-point value is a stored integer `v` (64-bit intermediate) and a fraction length `f`:
 * real-world value = v * 2^-f. Integers have f = 0. Rounding is 'floor' (toward -infinity) or
 * 'nearest' (round half toward +infinity).
 */

export const I64_MIN = -(1n << 63n);
export const I64_MAX = (1n << 63n) - 1n;

export const sat64 = (value: bigint): bigint => (value < I64_MIN ? I64_MIN : value > I64_MAX ? I64_MAX : value);

export const FIXED_WORD_LENGTHS = [8, 16, 32] as const;

export const isValidFixedPoint = (format: FixedPointFormat | undefined): format is FixedPointFormat =>
  format !== undefined
  && format !== null
  && (FIXED_WORD_LENGTHS as readonly number[]).includes(format.wordLength)
  && typeof format.signed === 'boolean'
  && Number.isInteger(format.fractionLength)
  && format.fractionLength >= 0
  && format.fractionLength <= format.wordLength;

export const fixedRange = (format: FixedPointFormat): { min: bigint; max: bigint } => {
  const bits = BigInt(format.wordLength);
  return format.signed
    ? { min: -(1n << (bits - 1n)), max: (1n << (bits - 1n)) - 1n }
    : { min: 0n, max: (1n << bits) - 1n };
};

/** Saturating left shift (multiplication by 2^n) in the 64-bit intermediate. */
export const fxAlign = (value: bigint, n: number): bigint => {
  if (n <= 0 || value === 0n) return value;
  if (n >= 63) return value > 0n ? I64_MAX : I64_MIN;
  return sat64(value << BigInt(n));
};

/** Right shift by n >= 0 rounding the exact quotient value / 2^n (floor or half toward +infinity). */
export const fxRescaleDown = (value: bigint, n: number, rounding: FixedPointRounding): bigint => {
  if (n <= 0) return value;
  const divisor = 1n << BigInt(n);
  let quotient = value / divisor;
  let remainder = value % divisor;
  if (remainder < 0n) {
    quotient -= 1n;
    remainder += divisor;
  }
  if (rounding === 'nearest' && remainder * 2n >= divisor) quotient += 1n;
  return quotient;
};

/** Divides two stored integers: floor or round-half-up of the exact quotient; null when den is zero. */
export const fxDiv = (num: bigint, den: bigint, rounding: FixedPointRounding): bigint | null => {
  if (den === 0n) return null;
  if (den === -1n) return sat64(-num);
  let quotient = num / den;
  const remainder = num % den;
  if (remainder !== 0n) {
    const ur = remainder < 0n ? -remainder : remainder;
    const ud = den < 0n ? -den : den;
    if ((num < 0n) !== (den < 0n)) {
      if (rounding === 'floor' || ur * 2n > ud) quotient -= 1n;
    } else if (rounding === 'nearest' && ur * 2n >= ud) {
      quotient += 1n;
    }
  }
  return quotient;
};

/** Stored integer of a double: floor(x * 2^F) or floor(x * 2^F + 0.5), in double arithmetic. null when not finite. */
export const fxFromDouble = (value: number, fractionLength: number, rounding: FixedPointRounding): bigint | null => {
  if (!Number.isFinite(value)) return null;
  const scaled = value * 2 ** fractionLength;
  const rounded = rounding === 'nearest' ? Math.floor(scaled + 0.5) : Math.floor(scaled);
  if (!Number.isFinite(rounded)) return null;
  return BigInt(rounded);
};

/** Real-world value of a stored integer, as a double (exact for words up to 32 bits). */
export const fxToDouble = (value: bigint, fractionLength: number): number => Number(value) * 2 ** -fractionLength;

export type FixedStoreResult = { ok: true; stored: bigint } | { ok: false };

/** Saturates (or fails under policy 'error') a stored integer to the format's word. */
export const fxSaturate = (stored: bigint, format: FixedPointFormat, errorOnOverflow: boolean): FixedStoreResult => {
  const { min, max } = fixedRange(format);
  if (stored >= min && stored <= max) return { ok: true, stored };
  if (errorOnOverflow) return { ok: false };
  return { ok: true, stored: stored < min ? min : max };
};

/** Converts a stored integer with fraction length f to the format: rescale with rounding, then saturate. */
export const fxStore = (
  value: bigint,
  fraction: number,
  format: FixedPointFormat,
  rounding: FixedPointRounding,
  errorOnOverflow: boolean,
): FixedStoreResult => {
  const shift = fraction - format.fractionLength;
  const scaled = shift > 0 ? fxRescaleDown(value, shift, rounding) : fxAlign(value, -shift);
  return fxSaturate(scaled, format, errorOnOverflow);
};

/** Converts a double to the format (initial values, literals, floating expressions). */
export const fxStoreDouble = (
  value: number,
  format: FixedPointFormat,
  rounding: FixedPointRounding,
  errorOnOverflow: boolean,
): FixedStoreResult => {
  const stored = fxFromDouble(value, format.fractionLength, rounding);
  if (stored === null) return { ok: false };
  return fxSaturate(stored, format, errorOnOverflow);
};
