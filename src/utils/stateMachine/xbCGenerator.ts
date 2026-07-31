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

interface XBStateLayout {
  readonly declarations: readonly string[];
  readonly signalFields: ReadonlyMap<string, string>;
  readonly fixedValidityFields: ReadonlyMap<string, string>;
  readonly fixedRealFields: ReadonlyMap<string, string>;
  readonly slotFields: ReadonlyMap<string, string>;
  readonly counterFields: ReadonlyMap<string, string>;
  readonly errorFields: ReadonlyMap<string, string>;
}

const stateLayout = (state: SemanticState): XBStateLayout => {
  const xb = state.xBridges!;
  const declarations: string[] = [];
  const names = new Set<string>();
  const signalFields = new Map<string, string>();
  const fixedValidityFields = new Map<string, string>();
  const fixedRealFields = new Map<string, string>();
  const slotFields = new Map<string, string>();
  const counterFields = new Map<string, string>();
  const errorFields = new Map<string, string>();
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
    signalFields.set(signal.id, name);
    declarations.push(
      `    ${numericCType(signal.numericType)} ${name}${shapeSuffix(signal.shape)};`,
    );
    if (signal.numericType.kind === 'fixed') {
      const validityName = allocateName(
        `${name}_has_stored_integer`,
        'signal_validity',
      );
      const realName = allocateName(`${name}_real_value`, 'signal_real');
      fixedValidityFields.set(signal.id, validityName);
      fixedRealFields.set(signal.id, realName);
      declarations.push(
        `    bool ${validityName}${shapeSuffix(signal.shape)};`,
        `    double ${realName}${shapeSuffix(signal.shape)};`,
      );
    }
  }

  for (const operationId of xb.executionOrder) {
    const operation = xb.operations[operationId];
    for (const slot of operation.state?.slots ?? []) {
      const name = allocateName(stateSlotFieldName(slot), 'slot');
      slotFields.set(slot.id, name);
      declarations.push(
        `    ${numericCType(slot.numericType)} ${name}${shapeSuffix(slot.shape)};`,
      );
    }
    const counterName = allocateName(
      `schedule_${toCIdentifier(operation.id)}`,
      'counter',
    );
    counterFields.set(operation.id, counterName);
    declarations.push(`    uint32_t ${counterName};`);
    if (operation.conversion !== null) {
      const errorName = allocateName(
        operationErrorFieldName(operation),
        'fault',
      );
      errorFields.set(operation.id, errorName);
      declarations.push(`    bool ${errorName};`);
    }
  }

  return {
    declarations: declarations.length === 0
      ? ['    uint8_t reserved;']
      : declarations,
    signalFields,
    fixedValidityFields,
    fixedRealFields,
    slotFields,
    counterFields,
    errorFields,
  };
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
  ...stateLayout(state).declarations,
  `} ${stateType(state)};`,
].join('\n');

const stateMemberEntries = (
  ir: SemanticModel,
): ReadonlyArray<{ state: SemanticState; member: string }> => {
  const names = new Set<string>();
  return orderedXBStates(ir).map((state) => {
    const preferred = stateMember(state);
    let name = preferred;
    let suffix = 2;
    while (names.has(name)) {
      name = `${preferred}_${suffix++}`;
    }
    names.add(name);
    return { state, member: name };
  });
};

export const renderXBInstanceMembers = (
  ir: SemanticModel,
): readonly string[] => stateMemberEntries(ir).map(({ state, member }) =>
  `${stateType(state)} ${member};`);

export const renderXBHeader = (ir: SemanticModel): string => {
  const states = orderedXBStates(ir);
  const wrappers = states.flatMap((state) =>
    conversionWrappers(state).map(({ name }) =>
      `SM_XB_NumericResult_t ${name}(double value);`));
  const lifecycle = states.flatMap((state) => [
    `void SM_XB_${stateSuffix(state)}_Init(ADIA_Instance_t *instance);`,
    `void SM_XB_${stateSuffix(state)}_Enter(ADIA_Instance_t *instance);`,
    `void SM_XB_${stateSuffix(state)}_Step(ADIA_Instance_t *instance);`,
  ]);
  return lines(
    '#ifndef SM_XBRIDGES_H',
    '#define SM_XBRIDGES_H',
    '',
    '#include <stdbool.h>',
    '#include <stdint.h>',
    '',
    '#ifndef SM_ADIA_INSTANCE_FWD',
    '#define SM_ADIA_INSTANCE_FWD',
    'typedef struct ADIA_Instance ADIA_Instance_t;',
    '#endif',
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
    'bool SM_XB_Truth(double value);',
    'SM_XB_NumericResult_t SM_XB_ConvertBoolean(double value);',
    'SM_XB_NumericResult_t SM_XB_ConvertFloat16(double value);',
    'SM_XB_NumericResult_t SM_XB_ConvertFloat32(double value);',
    'SM_XB_NumericResult_t SM_XB_ConvertFloat64(double value);',
    wrappers.length > 0 ? '' : false,
    ...wrappers,
    lifecycle.length > 0 ? '' : false,
    ...lifecycle,
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

type OperationEmitter = (
  state: SemanticState,
  operation: XBSemanticOperation,
  operationIndex: number,
  layout: XBStateLayout,
  member: string,
) => readonly string[];

const scalarParameter = (
  operation: XBSemanticOperation,
  names: readonly string[],
  fallback: number | boolean,
): number | boolean => {
  for (const name of names) {
    const value = operation.parameters[name];
    if (typeof value === 'number' || typeof value === 'boolean') return value;
  }
  return fallback;
};

const cNumber = (value: number | boolean): string => {
  if (typeof value === 'boolean') return value ? '1.0' : '0.0';
  if (!Number.isFinite(value)) {
    throw new Error(`X-Bridges C generation requires a finite scalar value; received ${value}`);
  }
  if (Object.is(value, -0)) return '-0.0';
  const literal = `${value}`;
  if (/[eE]/.test(literal)) return literal;
  return Number.isInteger(value) ? `${literal}.0` : literal;
};

const requireScalarSignal = (
  state: SemanticState,
  signalId: string,
): XBSemanticSignal => {
  const signal = state.xBridges!.signals[signalId];
  if (signal === undefined) {
    throw new Error(`X-Bridges signal '${signalId}' is absent from semantic IR`);
  }
  if (signal.shape.kind !== 'scalar') {
    throw new Error(
      `X-Bridges Task 8 emitter requires scalar signal '${signalId}'`,
    );
  }
  return signal;
};

const signalStorageExpression = (
  state: SemanticState,
  signalId: string,
  layout: XBStateLayout,
  member: string,
): { signal: XBSemanticSignal; expression: string } => {
  const requested = requireScalarSignal(state, signalId);
  const sourceId = requested.sourceSignalId ?? requested.id;
  const source = requireScalarSignal(state, sourceId);
  const field = layout.signalFields.get(sourceId);
  if (field === undefined) {
    throw new Error(`X-Bridges signal '${sourceId}' lacks generated storage`);
  }
  return {
    signal: source,
    expression: `instance->${member}.${field}`,
  };
};

const fixedSignalSidecarExpressions = (
  signal: XBSemanticSignal,
  layout: XBStateLayout,
  member: string,
): { validity: string; real: string } => {
  const validityField = layout.fixedValidityFields.get(signal.id);
  const realField = layout.fixedRealFields.get(signal.id);
  if (validityField === undefined || realField === undefined) {
    throw new Error(`X-Bridges fixed signal '${signal.id}' lacks sidecar storage`);
  }
  return {
    validity: `instance->${member}.${validityField}`,
    real: `instance->${member}.${realField}`,
  };
};

const signalRealExpression = (
  state: SemanticState,
  signalId: string,
  layout: XBStateLayout,
  member: string,
): string => {
  const storage = signalStorageExpression(state, signalId, layout, member);
  if (storage.signal.numericType.kind === 'fixed') {
    const sidecars = fixedSignalSidecarExpressions(
      storage.signal,
      layout,
      member,
    );
    return `((${sidecars.validity}) ? ldexp((double)(${storage.expression}), ${-storage.signal.numericType.fractionLength}) : (${sidecars.real}))`;
  }
  if (storage.signal.numericType.kind === 'boolean') {
    return `((${storage.expression}) ? 1.0 : 0.0)`;
  }
  return `(double)(${storage.expression})`;
};

const defaultConversionCall = (
  expression: string,
  type: XBNumericType,
): string => {
  if (type.kind === 'fixed') {
    return [
      'SM_XB_ConvertFixed(',
      `${expression}, `,
      `${type.signed ? 'true' : 'false'}, `,
      `${type.wordLength}U, `,
      `${type.fractionLength}, `,
      'SM_XB_ROUND_FLOOR, ',
      'SM_XB_OVERFLOW_SATURATE)',
    ].join('');
  }
  if (type.kind === 'boolean') return `SM_XB_ConvertBoolean(${expression})`;
  const precision = type.kind === 'float' ? type.precision : type.kind;
  if (precision === 'float16') return `SM_XB_ConvertFloat16(${expression})`;
  if (precision === 'float32') return `SM_XB_ConvertFloat32(${expression})`;
  return `SM_XB_ConvertFloat64(${expression})`;
};

const convertedStorageMember = (type: XBNumericType): string =>
  type.kind === 'fixed' || type.kind === 'boolean'
    ? 'stored_integer'
    : 'real_value';

const renderSignalWrite = (
  state: SemanticState,
  operation: XBSemanticOperation,
  operationIndex: number,
  outputIndex: number,
  signalId: string,
  expression: string,
  layout: XBStateLayout,
  member: string,
): readonly string[] => {
  const signal = requireScalarSignal(state, signalId);
  const field = layout.signalFields.get(signal.id);
  if (field === undefined) {
    throw new Error(`X-Bridges signal '${signal.id}' lacks generated storage`);
  }
  const resultName = `xb_result_${operationIndex}_${outputIndex}`;
  const valueName = `xb_value_${operationIndex}_${outputIndex}`;
  const faultLines = state.xBridges!.policy.numericFault === 'escalate'
    ? ['        instance->error_status = SM_ERR_XBRIDGES_NUMERIC;']
    : [];
  if (signal.numericType.kind === 'boolean') {
    return [
      `    const double ${valueName} = (double)(${expression});`,
      `    instance->${member}.${field} = SM_XB_Truth(${valueName});`,
      `    if (!isfinite(${valueName})) {`,
      ...faultLines,
      '    }',
    ];
  }
  const precision = signal.numericType.kind === 'float'
    ? signal.numericType.precision
    : signal.numericType.kind;
  if (precision === 'float32') {
    return [
      `    const double ${valueName} = (double)(${expression});`,
      `    if (!isfinite(${valueName})) {`,
      `        instance->${member}.${field} = (float)${valueName};`,
      ...faultLines,
      `    } else if (fabs(${valueName}) > (double)FLT_MAX) {`,
      `        instance->${member}.${field} = ${valueName} < 0.0 ? -HUGE_VALF : HUGE_VALF;`,
      ...faultLines,
      '    } else {',
      `        instance->${member}.${field} = (float)${valueName};`,
      '    }',
    ];
  }
  if (precision === 'float64') {
    return [
      `    const double ${valueName} = (double)(${expression});`,
      `    instance->${member}.${field} = ${valueName};`,
      `    if (!isfinite(${valueName})) {`,
      ...faultLines,
      '    }',
    ];
  }
  if (signal.numericType.kind === 'fixed') {
    const sidecars = fixedSignalSidecarExpressions(signal, layout, member);
    return [
      `    const SM_XB_NumericResult_t ${resultName} = ${defaultConversionCall(expression, signal.numericType)};`,
      `    instance->${member}.${field} = (${numericCType(signal.numericType)})${resultName}.stored_integer;`,
      `    ${sidecars.validity} = ${resultName}.has_stored_integer;`,
      `    ${sidecars.real} = ${resultName}.real_value;`,
      ...(state.xBridges!.policy.numericFault === 'escalate'
        ? [
            `    if (${resultName}.fault != SM_XB_FAULT_NONE) {`,
            '        instance->error_status = SM_ERR_XBRIDGES_NUMERIC;',
            '    }',
          ]
        : []),
    ];
  }
  return [
    `    const SM_XB_NumericResult_t ${resultName} = ${defaultConversionCall(expression, signal.numericType)};`,
    `    instance->${member}.${field} = (${numericCType(signal.numericType)})${resultName}.${convertedStorageMember(signal.numericType)};`,
    ...(state.xBridges!.policy.numericFault === 'escalate'
      ? [
          `    if (${resultName}.fault != SM_XB_FAULT_NONE) {`,
          '        instance->error_status = SM_ERR_XBRIDGES_NUMERIC;',
          '    }',
        ]
      : []),
  ];
};

const inputExpressions = (
  state: SemanticState,
  operation: XBSemanticOperation,
  layout: XBStateLayout,
  member: string,
): string[] => operation.inputSignalIds.map((signalId) =>
  signalRealExpression(state, signalId, layout, member));

const emitSingleOutput = (
  expression: (
    inputs: readonly string[],
    operation: XBSemanticOperation,
    state: SemanticState,
  ) => string,
): OperationEmitter => (state, operation, operationIndex, layout, member) => {
  if (operation.outputSignalIds.length === 0) return [];
  const inputs = inputExpressions(state, operation, layout, member);
  return renderSignalWrite(
    state,
    operation,
    operationIndex,
    0,
    operation.outputSignalIds[0],
    expression(inputs, operation, state),
    layout,
    member,
  );
};

const reduceExpression = (
  inputs: readonly string[],
  operator: string,
  identity: string,
): string => inputs.length === 0
  ? identity
  : `(${inputs.map((input) => `(${input})`).join(` ${operator} `)})`;

const emitConstant = emitSingleOutput((_inputs, operation) =>
  cNumber(scalarParameter(operation, ['value', 'Value', 'constant'], 0)));

const emitInport: OperationEmitter = () => [];
const emitOutport: OperationEmitter = () => [];
const emitTerminator: OperationEmitter = () => [];

const emitStep = emitSingleOutput((_inputs, operation, state) => {
  const stepTimeSeconds = Number(
    scalarParameter(operation, ['stepTime', 'time'], 1),
  );
  const thresholdMs = stepTimeSeconds * 1000;
  if (
    !Number.isFinite(stepTimeSeconds)
    || stepTimeSeconds < 0
    || !Number.isSafeInteger(thresholdMs)
    || thresholdMs > 0xffff_ffff
  ) {
    throw new Error(
      `X-Bridges Step operation '${operation.id}' requires stepTime to be `
        + 'finite, nonnegative, and exactly representable as uint32_t '
        + `milliseconds; received ${stepTimeSeconds}`,
    );
  }
  const initial = cNumber(
    scalarParameter(operation, ['initialValue', 'initial'], 0),
  );
  const final = cNumber(
    scalarParameter(operation, ['finalValue', 'final'], 1),
  );
  if (thresholdMs === 0) return final;
  return `(instance->state_timers[${state.enumName}_IDX] < UINT32_C(${thresholdMs}) ? ${initial} : ${final})`;
});

const emitGain = emitSingleOutput((inputs, operation) =>
  `((${inputs[0] ?? '0.0'}) * ${cNumber(scalarParameter(
    operation,
    ['gain', 'Gain', 'k', 'value'],
    1,
  ))})`);

const emitSum = emitSingleOutput((inputs, operation) => {
  const configuredSigns = operation.parameters.signs;
  const signs = typeof configuredSigns === 'string'
    ? configuredSigns
    : '+'.repeat(inputs.length);
  const terms = inputs.map((input, index) =>
    signs[index] === '-' ? `(-(${input}))` : `(${input})`);
  return terms.length === 0 ? '0.0' : `(${terms.join(' + ')})`;
});
const emitSumJunction: OperationEmitter = (...args) => emitSum(...args);
const emitVectorAdd: OperationEmitter = (...args) => emitSum(...args);
const emitProduct = emitSingleOutput((inputs) =>
  reduceExpression(inputs, '*', '1.0'));
const emitVectorMultiply: OperationEmitter = (...args) =>
  emitProduct(...args);
const emitSubtract = emitSingleOutput((inputs) =>
  `((${inputs[0] ?? '0.0'}) - (${inputs[1] ?? '0.0'}))`);
const emitDivide = emitSingleOutput((inputs) =>
  `((${inputs[0] ?? '0.0'}) / (${inputs[1] ?? '1.0'}))`);
const emitPower = emitSingleOutput((inputs) =>
  `pow((${inputs[0] ?? '0.0'}), (${inputs[1] ?? '0.0'}))`);
const emitNegate = emitSingleOutput((inputs) =>
  `(-(${inputs[0] ?? '0.0'}))`);
const emitAbsolute = emitSingleOutput((inputs) =>
  `fabs(${inputs[0] ?? '0.0'})`);

const emitAnd = emitSingleOutput((inputs) =>
  reduceExpression(
    inputs.map((input) => `SM_XB_Truth(${input})`),
    '&&',
    'true',
  ));
const emitOr = emitSingleOutput((inputs) =>
  reduceExpression(
    inputs.map((input) => `SM_XB_Truth(${input})`),
    '||',
    'false',
  ));
const emitNot = emitSingleOutput((inputs) =>
  `(!SM_XB_Truth(${inputs[0] ?? '0.0'}))`);
const emitNand = emitSingleOutput((inputs) =>
  `(!${reduceExpression(
    inputs.map((input) => `SM_XB_Truth(${input})`),
    '&&',
    'true',
  )})`);
const emitNor = emitSingleOutput((inputs) =>
  `(!${reduceExpression(
    inputs.map((input) => `SM_XB_Truth(${input})`),
    '||',
    'false',
  )})`);
const emitXor = emitSingleOutput((inputs) =>
  `((${inputs.map((input) => `SM_XB_Truth(${input})`).join(' + ') || '0'}) % 2)`);

const bitwiseBinary = (operator: string): OperationEmitter =>
  emitSingleOutput((inputs) =>
    `SM_XB_BitcastU32ToI32(SM_XB_BitcastI32ToU32(SM_XB_ToInt32(${inputs[0] ?? '0.0'})) ${operator} SM_XB_BitcastI32ToU32(SM_XB_ToInt32(${inputs[1] ?? '0.0'})))`);
const emitBitwiseNot = emitSingleOutput((inputs) =>
  `SM_XB_BitcastU32ToI32(~SM_XB_BitcastI32ToU32(SM_XB_ToInt32(${inputs[0] ?? '0.0'})))`);
const emitShiftLeft = emitSingleOutput((inputs) =>
  `SM_XB_ShiftLeft32(${inputs[0] ?? '0.0'}, ${inputs[1] ?? '0.0'})`);
const emitShiftRight = emitSingleOutput((inputs) =>
  `SM_XB_ShiftRight32(${inputs[0] ?? '0.0'}, ${inputs[1] ?? '0.0'})`);

const emitSwitch = emitSingleOutput((inputs, operation) => {
  const threshold = cNumber(
    scalarParameter(operation, ['threshold', 'Threshold'], 0),
  );
  const control = inputs[2] ?? '0.0';
  const criteriaValue = operation.parameters.criteria;
  const criteria = criteriaValue === '<'
    || criteriaValue === '>='
    || criteriaValue === '<='
    ? criteriaValue
    : '>';
  return `((${control}) ${criteria} ${threshold} ? (${inputs[0] ?? '0.0'}) : (${inputs[1] ?? '0.0'}))`;
});

const emitConversion: OperationEmitter = (
  state,
  operation,
  operationIndex,
  layout,
  member,
) => {
  const conversion = operation.conversion;
  if (conversion === null) {
    throw new Error(
      `X-Bridges conversion operation '${operation.id}' lacks conversion IR`,
    );
  }
  const inputSignalId = operation.inputSignalIds[0];
  if (inputSignalId === undefined) {
    throw new Error(
      `X-Bridges conversion operation '${operation.id}' lacks an input`,
    );
  }
  const dataOutputId = operation.outputSignalIds.find((signalId) =>
    state.xBridges!.signals[signalId]?.portId === 'y')
    ?? (operation.outputSignalIds.length === 1
      ? operation.outputSignalIds[0]
      : undefined);
  if (dataOutputId === undefined) {
    throw new Error(
      `X-Bridges conversion operation '${operation.id}' lacks a y output`,
    );
  }
  let input = signalRealExpression(state, inputSignalId, layout, member);
  let reinterpretationSidecars: { validity: string; real: string } | null = null;
  if (conversion.mode === 'stored-integer-reinterpretation') {
    const storage = signalStorageExpression(
      state,
      inputSignalId,
      layout,
      member,
    );
    if (storage.signal.numericType.kind !== 'fixed') {
      throw new Error(
        `X-Bridges conversion operation '${operation.id}' requires stored-integer input metadata`,
      );
    }
    reinterpretationSidecars = fixedSignalSidecarExpressions(
      storage.signal,
      layout,
      member,
    );
    input = conversion.destinationType.kind === 'fixed'
      ? `ldexp((double)(${storage.expression}), ${-conversion.destinationType.fractionLength})`
      : `(double)(${storage.expression})`;
  }
  const resultName = `xb_conversion_${operationIndex}`;
  const errorField = layout.errorFields.get(operation.id);
  const dataSignal = requireScalarSignal(state, dataOutputId);
  const dataField = layout.signalFields.get(dataOutputId);
  if (dataField === undefined || errorField === undefined) {
    throw new Error(
      `X-Bridges conversion operation '${operation.id}' lacks generated storage`,
    );
  }
  const call = renderConversionCall(operation).replace(/\bvalue\b/g, input);
  const resultLines = reinterpretationSidecars === null
    ? [`    const SM_XB_NumericResult_t ${resultName} = ${call};`]
    : [
        `    SM_XB_NumericResult_t ${resultName};`,
        `    if (${reinterpretationSidecars.validity}) {`,
        `        ${resultName} = ${call};`,
        '    } else {',
        `        ${resultName}.real_value = ${reinterpretationSidecars.real};`,
        `        ${resultName}.stored_integer = INT64_C(0);`,
        `        ${resultName}.quantization_error = 0.0;`,
        `        ${resultName}.fault = isfinite(${reinterpretationSidecars.real})`,
        '            ? SM_XB_FAULT_OVERFLOW',
        '            : SM_XB_FAULT_NON_FINITE;',
        `        ${resultName}.has_stored_integer = false;`,
        '    }',
      ];
  const dataWriteLines = dataSignal.numericType.kind === 'fixed'
    ? (() => {
        const sidecars = fixedSignalSidecarExpressions(
          dataSignal,
          layout,
          member,
        );
        return [
          `    instance->${member}.${dataField} = (${numericCType(dataSignal.numericType)})${resultName}.stored_integer;`,
          `    ${sidecars.validity} = ${resultName}.has_stored_integer;`,
          `    ${sidecars.real} = ${resultName}.real_value;`,
        ];
      })()
    : [
        `    instance->${member}.${dataField} = (${numericCType(dataSignal.numericType)})${resultName}.${convertedStorageMember(dataSignal.numericType)};`,
      ];
  const linesOut: string[] = [
    ...resultLines,
    ...dataWriteLines,
    `    instance->${member}.${errorField} = ${resultName}.fault != SM_XB_FAULT_NONE;`,
  ];
  operation.outputSignalIds.forEach((signalId, outputIndex) => {
    if (signalId === dataOutputId) return;
    linesOut.push(...renderSignalWrite(
      state,
      operation,
      operationIndex,
      outputIndex + 1,
      signalId,
      `${resultName}.quantization_error`,
      layout,
      member,
    ));
  });
  if (state.xBridges!.policy.numericFault === 'escalate') {
    linesOut.push(
      `    if (${resultName}.fault != SM_XB_FAULT_NONE) {`,
      '        instance->error_status = SM_ERR_XBRIDGES_NUMERIC;',
      '    }',
    );
  }
  return linesOut;
};

const emitDataTypeConversion: OperationEmitter = (...args) =>
  emitConversion(...args);
const emitNumericRepresentation: OperationEmitter = (...args) =>
  emitConversion(...args);
const emitDelayLifecycleStub: OperationEmitter = () => [];
const emitUnitDelayLifecycleStub: OperationEmitter = () => [];
const emitMemoryLifecycleStub: OperationEmitter = () => [];
const emitDiscreteIntegratorLifecycleStub: OperationEmitter = () => [];
const emitContinuousIntegratorLifecycleStub: OperationEmitter = () => [];
const emitIntegratorLifecycleStub: OperationEmitter = () => [];
const emitBasicPidLifecycleStub: OperationEmitter = () => [];
const emitPidControllerLifecycleStub: OperationEmitter = () => [];
const emitLowPassLifecycleStub: OperationEmitter = () => [];
const emitHighPassLifecycleStub: OperationEmitter = () => [];
const emitMovingAverageLifecycleStub: OperationEmitter = () => [];
const emitTransferFunctionLifecycleStub: OperationEmitter = () => [];
const emitStateSpaceLifecycleStub: OperationEmitter = () => [];

const OPERATION_EMITTERS: Readonly<Record<string, OperationEmitter>> = {
  Constant: emitConstant,
  Inport: emitInport,
  Outport: emitOutport,
  Step: emitStep,
  Sum: emitSum,
  SUM_JUNCTION: emitSumJunction,
  GAIN: emitGain,
  PRODUCT: emitProduct,
  VectorAdd: emitVectorAdd,
  VectorSub: emitSubtract,
  VectorMul: emitVectorMultiply,
  VectorDiv: emitDivide,
  VectorPow: emitPower,
  UnaryNeg: emitNegate,
  Abs: emitAbsolute,
  AND: emitAnd,
  OR: emitOr,
  NOT: emitNot,
  NAND: emitNand,
  NOR: emitNor,
  XOR: emitXor,
  BitwiseAND: bitwiseBinary('&'),
  BitwiseOR: bitwiseBinary('|'),
  BitwiseXOR: bitwiseBinary('^'),
  BitwiseNOT: emitBitwiseNot,
  ShiftLeft: emitShiftLeft,
  ShiftRight: emitShiftRight,
  SWITCH: emitSwitch,
  TERMINATOR: emitTerminator,
  DATA_TYPE_CONVERSION: emitDataTypeConversion,
  NUMERIC_REPRESENTATION: emitNumericRepresentation,
  DELAY: emitDelayLifecycleStub,
  UNIT_DELAY: emitUnitDelayLifecycleStub,
  MEMORY: emitMemoryLifecycleStub,
  INTEGRATOR_DISCRETE: emitDiscreteIntegratorLifecycleStub,
  INTEGRATOR_CONTINUOUS: emitContinuousIntegratorLifecycleStub,
  Integrator: emitIntegratorLifecycleStub,
  PID_BASIC: emitBasicPidLifecycleStub,
  PID_CONTROLLER: emitPidControllerLifecycleStub,
  LOW_PASS_FILTER: emitLowPassLifecycleStub,
  HIGH_PASS_FILTER: emitHighPassLifecycleStub,
  MOVING_AVERAGE: emitMovingAverageLifecycleStub,
  DISCRETE_TRANSFER_FUNCTION: emitTransferFunctionLifecycleStub,
  STATE_SPACE: emitStateSpaceLifecycleStub,
};

const operationEmitter = (operation: XBSemanticOperation): OperationEmitter => {
  const emitter = OPERATION_EMITTERS[operation.type];
  if (emitter === undefined) {
    throw new Error(
      `X-Bridges operation '${operation.id}' has unsupported type '${operation.type}'`,
    );
  }
  return emitter;
};

const renderVariableCast = (
  type: SemanticModel['variables'][string]['type'],
): string => {
  switch (type) {
    case 'bool': return 'bool';
    case 'int8': return 'int8_t';
    case 'uint8': return 'uint8_t';
    case 'int16': return 'int16_t';
    case 'uint16': return 'uint16_t';
    case 'int32': return 'int32_t';
    case 'uint32': return 'uint32_t';
    case 'double': return 'double';
    case 'float':
    default:
      return 'float';
  }
};

const BITWISE_OPERATION_TYPES = new Set([
  'BitwiseAND',
  'BitwiseOR',
  'BitwiseXOR',
  'BitwiseNOT',
  'ShiftLeft',
  'ShiftRight',
]);

const BITWISE_HELPERS = `static int32_t SM_XB_BitcastU32ToI32(uint32_t value)
{
    int32_t result;
    (void)memcpy(&result, &value, sizeof(result));
    return result;
}

static uint32_t SM_XB_BitcastI32ToU32(int32_t value)
{
    uint32_t result;
    (void)memcpy(&result, &value, sizeof(result));
    return result;
}

static int32_t SM_XB_ToInt32(double value)
{
    double residue;
    uint32_t bits;
    if (!isfinite(value) || (value == 0.0)) {
        return INT32_C(0);
    }
    residue = fmod(trunc(value), 4294967296.0);
    if (residue < 0.0) {
        residue += 4294967296.0;
    }
    bits = (uint32_t)residue;
    return SM_XB_BitcastU32ToI32(bits);
}

static int32_t SM_XB_ShiftLeft32(double value, double amount)
{
    const uint32_t shift = SM_XB_BitcastI32ToU32(
        SM_XB_ToInt32(amount)) & UINT32_C(31);
    const uint32_t bits = SM_XB_BitcastI32ToU32(SM_XB_ToInt32(value));
    return SM_XB_BitcastU32ToI32(bits << shift);
}

static int32_t SM_XB_ShiftRight32(double value, double amount)
{
    const uint32_t shift = SM_XB_BitcastI32ToU32(
        SM_XB_ToInt32(amount)) & UINT32_C(31);
    const uint32_t bits = SM_XB_BitcastI32ToU32(SM_XB_ToInt32(value));
    uint32_t shifted;
    if (shift == UINT32_C(0)) {
        return SM_XB_BitcastU32ToI32(bits);
    }
    shifted = bits >> shift;
    if ((bits & UINT32_C(0x80000000)) != UINT32_C(0)) {
        shifted |= UINT32_MAX << (UINT32_C(32) - shift);
    }
    return SM_XB_BitcastU32ToI32(shifted);
}`;

const renderStateLifecycle = (
  ir: SemanticModel,
  state: SemanticState,
  member: string,
): string => {
  const xb = state.xBridges!;
  const layout = stateLayout(state);
  const initLines: string[] = [
    `    (void)memset(&instance->${member}, 0, sizeof(instance->${member}));`,
  ];
  for (const operationId of xb.executionOrder) {
    const operation = xb.operations[operationId];
    if (operation === undefined) {
      throw new Error(
        `X-Bridges execution order references missing operation '${operationId}'`,
      );
    }
    const counter = layout.counterFields.get(operation.id);
    if (counter !== undefined && operation.schedule.initialCounter !== 0) {
      initLines.push(
        `    instance->${member}.${counter} = ${operation.schedule.initialCounter}U;`,
      );
    }
  }
  const stepLines: string[] = [];
  let inputMappingIndex = 0;
  for (const mapping of xb.mappings) {
    if (mapping.direction !== 'in') continue;
    const variable = ir.variables[mapping.variableId];
    if (variable === undefined) {
      throw new Error(
        `X-Bridges input mapping variable '${mapping.variableId}' is absent`,
      );
    }
    stepLines.push(...renderSignalWrite(
      state,
      {
        id: `mapping_in_${mapping.blockId}_${mapping.portId}`,
        type: 'Inport',
        inputSignalIds: [],
        outputSignalIds: [mapping.signalId],
        parameters: {},
        directFeedthrough: true,
        stateful: false,
        conversion: null,
        state: null,
        schedule: {
          periodSubsteps: 1,
          offsetSubsteps: 0,
          initialCounter: 0,
          counterIncrement: 1,
          hold: 'none',
        },
      },
      100000 + inputMappingIndex++,
      0,
      mapping.signalId,
      `(double)(instance->data.${variable.cName})`,
      layout,
      member,
    ));
  }
  xb.executionOrder.forEach((operationId, operationIndex) => {
    const operation = xb.operations[operationId];
    if (operation === undefined) {
      throw new Error(
        `X-Bridges execution order references missing operation '${operationId}'`,
      );
    }
    stepLines.push(
      ...operationEmitter(operation)(
        state,
        operation,
        operationIndex,
        layout,
        member,
      ),
    );
  });
  for (const mapping of xb.mappings) {
    if (mapping.direction !== 'out') continue;
    const variable = ir.variables[mapping.variableId];
    if (variable === undefined) {
      throw new Error(
        `X-Bridges output mapping variable '${mapping.variableId}' is absent`,
      );
    }
    stepLines.push(
      `    instance->data.${variable.cName} = (${renderVariableCast(variable.type)})(${signalRealExpression(state, mapping.signalId, layout, member)});`,
    );
  }
  return lines(
    `void SM_XB_${stateSuffix(state)}_Init(ADIA_Instance_t *instance)`,
    '{',
    ...initLines,
    '}',
    '',
    `void SM_XB_${stateSuffix(state)}_Enter(ADIA_Instance_t *instance)`,
    '{',
    xb.policy.memory === 'reset'
      ? `    SM_XB_${stateSuffix(state)}_Init(instance);`
      : '    (void)instance;',
    '}',
    '',
    `void SM_XB_${stateSuffix(state)}_Step(ADIA_Instance_t *instance)`,
    '{',
    ...(stepLines.length === 0 ? ['    (void)instance;'] : stepLines),
    '}',
  ).trimEnd();
};

export const renderXBLifecycleSource = (ir: SemanticModel): string =>
  lines(
    orderedXBStates(ir).some((state) =>
      state.xBridges!.executionOrder.some((operationId) =>
        BITWISE_OPERATION_TYPES.has(
          state.xBridges!.operations[operationId]?.type ?? '',
        )))
      ? BITWISE_HELPERS
      : null,
    ...stateMemberEntries(ir)
      .map(({ state, member }) => renderStateLifecycle(ir, state, member)),
  ).trimEnd();

const NUMERIC_HELPERS = `#define SM_XB_MAX_SAFE_INTEGER 9007199254740991.0

bool SM_XB_Truth(double value)
{
    return !isnan(value) && (value != 0.0);
}

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
    result.stored_integer = SM_XB_Truth(value) ? INT64_C(1) : INT64_C(0);
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
  for (const state of orderedXBStates(ir)) {
    for (const operationId of state.xBridges!.executionOrder) {
      const operation = state.xBridges!.operations[operationId];
      if (operation === undefined) {
        throw new Error(
          `X-Bridges execution order references missing operation '${operationId}'`,
        );
      }
      operationEmitter(operation);
    }
  }
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
