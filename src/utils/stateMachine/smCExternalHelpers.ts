import { arithmeticModeFor } from './smArithmetic';

/*
 * Argument conversions for calls of external C functions (see smExternalFunctions.ts). They
 * follow the assignment conversion of smArithmetic.ts (saturating, floating to integer truncates
 * toward zero) without the pending-error bookkeeping: an argument is never an error by itself,
 * an arithmetic error inside the argument expression is already latched by its own helper.
 * Emitted into sm_core.h only for charts that declare external functions.
 */
export const renderExternalArithSection = (cStandard: string | undefined): string => {
  const int64 = arithmeticModeFor(cStandard) === 'int64';
  const common = [
    '/* External function arguments: conversion to the parameter type, saturating. */',
    'SM_ARITH_INLINE float SM_ArgFloat(double value)',
    '{',
    '    float converted;',
    '    if (value > (double)FLT_MAX) {',
    '        converted = FLT_MAX;',
    '    } else if (value < -(double)FLT_MAX) {',
    '        converted = -FLT_MAX;',
    '    } else {',
    '        converted = (float)value;',
    '    }',
    '    return converted;',
    '}',
    '',
  ];
  const wide = [
    'SM_ARITH_INLINE int64_t SM_ArgI64(int64_t value, int64_t lo, int64_t hi)',
    '{',
    '    int64_t converted = value;',
    '    if (value < lo) {',
    '        converted = lo;',
    '    } else if (value > hi) {',
    '        converted = hi;',
    '    } else {',
    '        /* In range. */',
    '    }',
    '    return converted;',
    '}',
    '',
    'SM_ARITH_INLINE int64_t SM_ArgDoubleToI64(double value, int64_t lo, int64_t hi)',
    '{',
    '    int64_t wide;',
    '    if ((value - value) != 0.0) {',
    '        wide = 0;',
    '    } else if (value >= 9223372036854775808.0) {',
    '        wide = INT64_MAX;',
    '    } else if (value < -9223372036854775808.0) {',
    '        wide = SM_I64_MIN;',
    '    } else {',
    '        wide = (int64_t)value;',
    '    }',
    '    return SM_ArgI64(wide, lo, hi);',
    '}',
    '',
  ];
  const narrow = [
    'SM_ARITH_INLINE double SM_ArgIntD(double value, double lo, double hi)',
    '{',
    '    double converted = SM_TruncD(value);',
    '    if (converted < lo) {',
    '        converted = lo;',
    '    } else if (converted > hi) {',
    '        converted = hi;',
    '    } else {',
    '        /* In range. */',
    '    }',
    '    return converted + 0.0;',
    '}',
    '',
  ];
  return [...common, ...(int64 ? wide : narrow)].join('\n');
};
