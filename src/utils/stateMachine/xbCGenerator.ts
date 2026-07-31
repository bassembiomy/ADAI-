import { toCIdentifier } from './smExpressions';
import type { SemanticModel, SemanticState } from './smSemanticModel';
import { STATE_MACHINE_XB_TARGET_CAPABILITIES } from './smSemanticValidator';
import type {
  XBSemanticOperation,
  XBSemanticSignal,
  XBSemanticStateSlot,
} from './xbSemanticModel';
import type {
  XBFixedType,
  XBNumericType,
  XBShape,
} from './xbNumeric';

const lines = (...parts: Array<string | false | null | undefined>): string =>
  `${parts.filter((part): part is string => typeof part === 'string')
    .join('\n')}\n`;

const orderedXBStates = (ir: SemanticModel): SemanticState[] =>
  Object.values(ir.states)
    .filter((state) => state.xBridges !== null)
    .sort((left, right) =>
      left.activityIndex - right.activityIndex || left.id.localeCompare(right.id));

const stateSuffix = (state: SemanticState): string => {
  const suffix = state.enumName.replace(/^SM_ST_/, '');
  return toCIdentifier(suffix).toUpperCase();
};

const stateType = (state: SemanticState): string =>
  `SM_XB_${stateSuffix(state)}_t`;

const stateMember = (state: SemanticState): string =>
  `xb_${toCIdentifier(state.id).toLowerCase()}`;

const numericCType = (type: XBNumericType): string => {
  if (type.kind === 'fixed') {
    const width = type.wordLength <= 8 ? 8 : type.wordLength <= 16 ? 16 : 32;
    return `${type.signed ? 'int' : 'uint'}${width}_t`;
  }
  if (type.kind === 'boolean') return 'bool';
  const precision = type.kind === 'float' ? type.precision : type.kind;
  return precision === 'float64' ? 'double' : 'float';
};

const shapeSuffix = (shape: XBShape): string => {
  if (shape.kind === 'scalar') return '';
  if (shape.kind === 'vector') return `[${shape.length}]`;
  return `[${shape.rows}][${shape.columns}]`;
};

const signalFieldName = (signal: XBSemanticSignal): string =>
  toCIdentifier(`${signal.nodeId}_${signal.portId}`);

const stateSlotFieldName = (slot: XBSemanticStateSlot): string =>
  `state_${toCIdentifier(slot.id)}`;

const operationErrorFieldName = (operation: XBSemanticOperation): string =>
  `${toCIdentifier(operation.id)}_error`;

const stateFields = (state: SemanticState): string[] => {
  const xb = state.xBridges!;
  const declarations: string[] = [];
  const names = new Set<string>();
  const allocateName = (
    preferred: string,
    namespace: string,
  ): string => {
    let candidate = preferred;
    let suffix = 2;
    if (names.has(candidate)) candidate = `${preferred}_${namespace}`;
    while (names.has(candidate)) {
      candidate = `${preferred}_${namespace}_${suffix++}`;
    }
    names.add(candidate);
    return candidate;
  };

  for (const signal of Object.values(xb.signals)
    .sort((left, right) => left.id.localeCompare(right.id))) {
    const name = allocateName(signalFieldName(signal), 'signal');
    declarations.push(
      `    ${numericCType(signal.numericType)} ${name}${shapeSuffix(signal.shape)};`,
    );
  }

  for (const operationId of xb.executionOrder) {
    const operation = xb.operations[operationId];
    for (const slot of operation.state?.slots ?? []) {
      const name = allocateName(stateSlotFieldName(slot), 'slot');
      declarations.push(
        `    ${numericCType(slot.numericType)} ${name}${shapeSuffix(slot.shape)};`,
      );
    }
    const counterName = allocateName(
      `schedule_${toCIdentifier(operation.id)}`,
      'counter',
    );
    declarations.push(`    uint32_t ${counterName};`);
    if (operation.conversion !== null) {
      const errorName = allocateName(
        operationErrorFieldName(operation),
        'fault',
      );
      declarations.push(`    bool ${errorName};`);
    }
  }

  return declarations.length === 0 ? ['    uint8_t reserved;'] : declarations;
};

const conversionOperations = (
  state: SemanticState,
): XBSemanticOperation[] => state.xBridges!.executionOrder
  .map((operationId) => state.xBridges!.operations[operationId])
  .filter((operation) => operation.conversion !== null);

const conversionWrappers = (
  state: SemanticState,
): Array<{ operation: XBSemanticOperation; name: string }> => {
  const names = new Set<string>();
  return conversionOperations(state).map((operation) => {
    const preferred = toCIdentifier(operation.id).toUpperCase();
    let operationSuffix = preferred;
    let suffix = 2;
    while (names.has(operationSuffix)) {
      operationSuffix = `${preferred}_${suffix++}`;
    }
    names.add(operationSuffix);
    return {
      operation,
      name: `SM_XB_${stateSuffix(state)}_${operationSuffix}_Convert`,
    };
  });
};

const renderStateType = (state: SemanticState): string => [
  'typedef struct {',
  ...stateFields(state),
  `} ${stateType(state)};`,
].join('\n');

export const renderXBInstanceMembers = (
  ir: SemanticModel,
): readonly string[] => {
  const names = new Set<string>();
  return orderedXBStates(ir).map((state) => {
    const preferred = stateMember(state);
    let name = preferred;
    let suffix = 2;
    while (names.has(name)) {
      name = `${preferred}_${suffix++}`;
    }
    names.add(name);
    return `${stateType(state)} ${name};`;
  });
};

export const renderXBHeader = (ir: SemanticModel): string => {
  const states = orderedXBStates(ir);
  const wrappers = states.flatMap((state) =>
    conversionWrappers(state).map(({ name }) =>
      `SM_XB_NumericResult_t ${name}(double value);`));
  return lines(
    '#ifndef SM_XBRIDGES_H',
    '#define SM_XBRIDGES_H',
    '',
    '#include <stdbool.h>',
    '#include <stdint.h>',
    '',
    `#define SM_XB_SUPPORTS_FLOAT16 ${STATE_MACHINE_XB_TARGET_CAPABILITIES.supportsFloat16 ? 1 : 0}`,
    `#define SM_XB_SUPPORTS_FLOAT32 ${STATE_MACHINE_XB_TARGET_CAPABILITIES.supportsFloat32 ? 1 : 0}`,
    `#define SM_XB_SUPPORTS_FLOAT64 ${STATE_MACHINE_XB_TARGET_CAPABILITIES.supportsFloat64 ? 1 : 0}`,
    '',
    'typedef enum {',
    '    SM_XB_FAULT_NONE = 0,',
    '    SM_XB_FAULT_OVERFLOW,',
    '    SM_XB_FAULT_NON_FINITE,',
    '    SM_XB_FAULT_UNSUPPORTED_FLOAT',
    '} SM_XB_Fault_t;',
    '',
    'typedef enum {',
    '    SM_XB_ROUND_FLOOR = 0,',
    '    SM_XB_ROUND_CEILING,',
    '    SM_XB_ROUND_ZERO,',
    '    SM_XB_ROUND_NEAREST,',
    '    SM_XB_ROUND_AWAY,',
    '    SM_XB_ROUND_CONVERGENT',
    '} SM_XB_Rounding_t;',
    '',
    'typedef enum {',
    '    SM_XB_OVERFLOW_SATURATE = 0,',
    '    SM_XB_OVERFLOW_WRAP,',
    '    SM_XB_OVERFLOW_ERROR',
    '} SM_XB_Overflow_t;',
    '',
    'typedef struct {',
    '    double real_value;',
    '    int64_t stored_integer;',
    '    double quantization_error;',
    '    SM_XB_Fault_t fault;',
    '    bool has_stored_integer;',
    '} SM_XB_NumericResult_t;',
    '',
    ...states.flatMap((state) => [renderStateType(state), '']),
    'SM_XB_NumericResult_t SM_XB_ConvertFixed(',
    '    double value,',
    '    bool is_signed,',
    '    uint8_t word_length,',
    '    int16_t fraction_length,',
    '    SM_XB_Rounding_t rounding,',
    '    SM_XB_Overflow_t overflow);',
    'SM_XB_NumericResult_t SM_XB_ConvertBoolean(double value);',
    'SM_XB_NumericResult_t SM_XB_ConvertFloat16(double value);',
    'SM_XB_NumericResult_t SM_XB_ConvertFloat32(double value);',
    'SM_XB_NumericResult_t SM_XB_ConvertFloat64(double value);',
    wrappers.length > 0 ? '' : false,
    ...wrappers,
    '',
    '#endif /* SM_XBRIDGES_H */',
  );
};

const roundingEnum = (
  rounding: NonNullable<XBSemanticOperation['conversion']>['rounding'],
): string => {
  switch (rounding) {
    case 'floor': return 'SM_XB_ROUND_FLOOR';
    case 'ceiling': return 'SM_XB_ROUND_CEILING';
    case 'zero': return 'SM_XB_ROUND_ZERO';
    case 'nearest': return 'SM_XB_ROUND_NEAREST';
    case 'round': return 'SM_XB_ROUND_AWAY';
    case 'convergent': return 'SM_XB_ROUND_CONVERGENT';
  }
};

const overflowEnum = (
  overflow: NonNullable<XBSemanticOperation['conversion']>['overflow'],
): string => {
  switch (overflow) {
    case 'saturate': return 'SM_XB_OVERFLOW_SATURATE';
    case 'wrap': return 'SM_XB_OVERFLOW_WRAP';
    case 'error': return 'SM_XB_OVERFLOW_ERROR';
  }
};

const renderFixedCall = (
  type: XBFixedType,
  operation: XBSemanticOperation,
): string => {
  const conversion = operation.conversion!;
  return [
    'SM_XB_ConvertFixed(',
    'value, ',
    `${type.signed ? 'true' : 'false'}, `,
    `${type.wordLength}U, `,
    `${type.fractionLength}, `,
    `${roundingEnum(conversion.rounding)}, `,
    `${overflowEnum(conversion.overflow)})`,
  ].join('');
};

const renderConversionCall = (operation: XBSemanticOperation): string => {
  const destination = operation.conversion!.destinationType;
  if (destination.kind === 'fixed') {
    return renderFixedCall(destination, operation);
  }
  if (destination.kind === 'boolean') return 'SM_XB_ConvertBoolean(value)';
  const precision = destination.kind === 'float'
    ? destination.precision
    : destination.kind;
  if (precision === 'float16') return 'SM_XB_ConvertFloat16(value)';
  if (precision === 'float32') return 'SM_XB_ConvertFloat32(value)';
  return 'SM_XB_ConvertFloat64(value)';
};

const renderWrapper = (
  name: string,
  operation: XBSemanticOperation,
): string => [
  `SM_XB_NumericResult_t ${name}(double value)`,
  '{',
  `    return ${renderConversionCall(operation)};`,
  '}',
].join('\n');

const NUMERIC_HELPERS = `#define SM_XB_MAX_SAFE_INTEGER 9007199254740991.0

static SM_XB_NumericResult_t SM_XB_DefaultResult(double value)
{
    SM_XB_NumericResult_t result;
    result.real_value = value;
    result.stored_integer = INT64_C(0);
    result.quantization_error = 0.0;
    result.fault = SM_XB_FAULT_NONE;
    result.has_stored_integer = false;
    return result;
}

static double SM_XB_RoundStored(double value, SM_XB_Rounding_t rounding)
{
    const double lower = floor(value);
    const double fraction = value - lower;
    switch (rounding) {
        case SM_XB_ROUND_FLOOR:
            return lower;
        case SM_XB_ROUND_CEILING:
            return ceil(value);
        case SM_XB_ROUND_ZERO:
            return trunc(value);
        case SM_XB_ROUND_NEAREST:
            return fraction < 0.5 ? lower : lower + 1.0;
        case SM_XB_ROUND_AWAY:
            return value < 0.0
                ? -floor(fabs(value) + 0.5)
                : floor(value + 0.5);
        case SM_XB_ROUND_CONVERGENT:
            if (fraction < 0.5) return lower;
            if (fraction > 0.5) return lower + 1.0;
            return fmod(fabs(lower), 2.0) == 0.0 ? lower : lower + 1.0;
        default:
            return lower;
    }
}

static uint64_t SM_XB_PositiveResidue(int64_t value, uint64_t modulus)
{
    uint64_t magnitude;
    uint64_t remainder;
    if (value >= INT64_C(0)) {
        return ((uint64_t)value) % modulus;
    }
    magnitude = (uint64_t)(-(value + INT64_C(1)));
    magnitude += UINT64_C(1);
    remainder = magnitude % modulus;
    return remainder == UINT64_C(0) ? UINT64_C(0) : modulus - remainder;
}

SM_XB_NumericResult_t SM_XB_ConvertFixed(
    double value,
    bool is_signed,
    uint8_t word_length,
    int16_t fraction_length,
    SM_XB_Rounding_t rounding,
    SM_XB_Overflow_t overflow)
{
    SM_XB_NumericResult_t result = SM_XB_DefaultResult(value);
    double scale;
    double scaled;
    double rounded;
    double minimum;
    double maximum;
    uint64_t modulus;
    uint64_t half_modulus;
    int64_t rounded_integer;
    int64_t stored_integer;
    bool overflowed;

    if (!isfinite(value)) {
        result.fault = SM_XB_FAULT_NON_FINITE;
        return result;
    }
    if ((word_length == 0U) || (word_length > 32U)) {
        result.fault = SM_XB_FAULT_OVERFLOW;
        return result;
    }
    scale = ldexp(1.0, (int)fraction_length);
    if (!isfinite(scale) || (scale == 0.0)) {
        result.fault = SM_XB_FAULT_OVERFLOW;
        return result;
    }

    modulus = UINT64_C(1) << word_length;
    half_modulus = modulus >> 1U;
    minimum = is_signed ? -(double)half_modulus : 0.0;
    maximum = is_signed
        ? (double)(half_modulus - UINT64_C(1))
        : (double)(modulus - UINT64_C(1));
    scaled = value * scale;

    if (!isfinite(scaled) || (fabs(scaled) > SM_XB_MAX_SAFE_INTEGER)) {
        stored_integer = scaled < 0.0
            ? (int64_t)minimum
            : (int64_t)maximum;
        result.stored_integer = stored_integer;
        result.real_value = (double)stored_integer / scale;
        result.quantization_error = fabs(value - result.real_value);
        result.fault = SM_XB_FAULT_OVERFLOW;
        result.has_stored_integer = true;
        return result;
    }

    rounded = SM_XB_RoundStored(scaled, rounding);
    overflowed = (rounded < minimum) || (rounded > maximum);
    if (overflowed && (overflow != SM_XB_OVERFLOW_WRAP)) {
        const double bounded = rounded < minimum ? minimum : maximum;
        stored_integer = (int64_t)bounded;
        if (overflow == SM_XB_OVERFLOW_ERROR) {
            result.fault = SM_XB_FAULT_OVERFLOW;
        }
    } else {
        rounded_integer = (int64_t)rounded;
        if (overflowed) {
            const uint64_t residue =
                SM_XB_PositiveResidue(rounded_integer, modulus);
            if (is_signed && (residue >= half_modulus)) {
                const uint64_t magnitude = modulus - residue;
                stored_integer = -(int64_t)magnitude;
            } else {
                stored_integer = (int64_t)residue;
            }
        } else {
            stored_integer = rounded_integer;
        }
    }

    result.stored_integer = stored_integer;
    result.real_value = (double)stored_integer / scale;
    result.quantization_error = fabs(value - result.real_value);
    result.has_stored_integer = true;
    return result;
}

SM_XB_NumericResult_t SM_XB_ConvertBoolean(double value)
{
    SM_XB_NumericResult_t result = SM_XB_DefaultResult(value);
    if (!isfinite(value)) {
        result.real_value = 0.0;
        result.fault = SM_XB_FAULT_NON_FINITE;
        return result;
    }
    result.stored_integer = value != 0.0 ? INT64_C(1) : INT64_C(0);
    result.real_value = (double)result.stored_integer;
    result.quantization_error = fabs(value - result.real_value);
    result.has_stored_integer = true;
    return result;
}

static SM_XB_NumericResult_t SM_XB_UnsupportedFloat(double value)
{
    SM_XB_NumericResult_t result = SM_XB_DefaultResult(value);
    result.fault = SM_XB_FAULT_UNSUPPORTED_FLOAT;
    return result;
}

SM_XB_NumericResult_t SM_XB_ConvertFloat16(double value)
{
    (void)value;
    return SM_XB_UnsupportedFloat(value);
}

SM_XB_NumericResult_t SM_XB_ConvertFloat32(double value)
{
#if SM_XB_SUPPORTS_FLOAT32
    SM_XB_NumericResult_t result = SM_XB_DefaultResult(value);
    float converted;
    if (!isfinite(value)) {
        result.fault = SM_XB_FAULT_NON_FINITE;
        return result;
    }
    if (fabs(value) > (double)FLT_MAX) {
        result.real_value = value < 0.0 ? -HUGE_VAL : HUGE_VAL;
        result.quantization_error = HUGE_VAL;
        result.fault = SM_XB_FAULT_NON_FINITE;
        return result;
    }
    converted = (float)value;
    result.real_value = (double)converted;
    result.quantization_error = fabs(value - result.real_value);
    if (!isfinite(result.real_value)) {
        result.fault = SM_XB_FAULT_NON_FINITE;
    }
    return result;
#else
    return SM_XB_UnsupportedFloat(value);
#endif
}

SM_XB_NumericResult_t SM_XB_ConvertFloat64(double value)
{
#if SM_XB_SUPPORTS_FLOAT64
    SM_XB_NumericResult_t result = SM_XB_DefaultResult(value);
    if (!isfinite(value)) {
        result.fault = SM_XB_FAULT_NON_FINITE;
        return result;
    }
    return result;
#else
    return SM_XB_UnsupportedFloat(value);
#endif
}`;

export const renderXBSource = (ir: SemanticModel): string => {
  const wrappers = orderedXBStates(ir).flatMap((state) =>
    conversionWrappers(state).map(({ operation, name }) =>
      renderWrapper(name, operation)));
  return lines(
    '#include "sm_xbridges.h"',
    '',
    '#include <float.h>',
    '#include <math.h>',
    '',
    NUMERIC_HELPERS,
    wrappers.length > 0 ? '' : false,
    ...wrappers,
  );
};
