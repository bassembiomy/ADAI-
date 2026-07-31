import { toCIdentifier } from './smExpressions';
import type { SemanticModel, SemanticState } from './smSemanticModel';
import { STATE_MACHINE_XB_TARGET_CAPABILITIES } from './smSemanticValidator';
import type {
  XBSemanticModel,
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

const numericFaultContract = (
  state: SemanticState,
  operation: XBSemanticOperation,
) => operation.numericFault ?? {
  fallback: operation.stateful ? 'previous-value' as const : 'zero' as const,
  errorSignalId: operation.outputSignalIds.find((signalId) => {
    const portId = state.xBridges!.signals[signalId]?.portId;
    return portId === 'error' || (
      portId === 'e'
      && operation.type !== 'DATA_TYPE_CONVERSION'
      && operation.type !== 'NUMERIC_REPRESENTATION'
    );
  }) ?? null,
};

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
    if (operation.outputSignalIds.length > 0) {
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

const matrixParameterValue = (
  operation: XBSemanticOperation,
  name: string,
  row: number,
  column: number,
  fallback: number,
): number => {
  const value = operation.parameters[name];
  if (Array.isArray(value) && Array.isArray(value[row]) && typeof value[row][column] === 'number') {
    return value[row][column] as number;
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

const requireSignal = (
  state: SemanticState,
  signalId: string,
): XBSemanticSignal => {
  const signal = state.xBridges!.signals[signalId];
  if (signal === undefined) {
    throw new Error(`X-Bridges signal '${signalId}' is absent from semantic IR`);
  }
  return signal;
};

const signalElementStorageExpression = (
  state: SemanticState,
  signalId: string,
  layout: XBStateLayout,
  member: string,
  index: string,
): { signal: XBSemanticSignal; expression: string } => {
  const requested = requireSignal(state, signalId);
  const sourceId = requested.sourceSignalId ?? requested.id;
  const source = requireSignal(state, sourceId);
  const field = layout.signalFields.get(sourceId);
  if (field === undefined) {
    throw new Error(`X-Bridges signal '${sourceId}' lacks generated storage`);
  }
  return {
    signal: source,
    expression: `(((${numericCType(source.numericType)} *)&(instance->${member}.${field}))[${index}])`,
  };
};

const signalElementRealExpression = (
  state: SemanticState,
  signalId: string,
  layout: XBStateLayout,
  member: string,
  index: string,
): string => {
  const storage = signalElementStorageExpression(state, signalId, layout, member, index);
  if (storage.signal.numericType.kind === 'fixed') {
    const validity = layout.fixedValidityFields.get(storage.signal.id);
    const real = layout.fixedRealFields.get(storage.signal.id);
    if (validity === undefined || real === undefined) {
      throw new Error(`X-Bridges fixed signal '${storage.signal.id}' lacks sidecar storage`);
    }
    return `(((((bool *)&(instance->${member}.${validity}))[${index}])) ? ldexp((double)(${storage.expression}), ${-storage.signal.numericType.fractionLength}) : (((double *)&(instance->${member}.${real}))[${index}]))`;
  }
  if (storage.signal.numericType.kind === 'boolean') return `((${storage.expression}) ? 1.0 : 0.0)`;
  return `(double)(${storage.expression})`;
};

const renderSignalElementWrite = (
  state: SemanticState,
  operation: XBSemanticOperation,
  operationIndex: number,
  outputIndex: number,
  signalId: string,
  index: string,
  expression: string,
  layout: XBStateLayout,
  member: string,
): readonly string[] => {
  const signal = requireSignal(state, signalId);
  const destination = signalElementStorageExpression(state, signalId, layout, member, index).expression;
  const resultName = `xb_result_${operationIndex}_${outputIndex}`;
  const valueName = `xb_value_${operationIndex}_${outputIndex}`;
  const errorField = layout.errorFields.get(operation.id);
  const faultLines = [
    ...(errorField === undefined ? [] : [`            instance->${member}.${errorField} = true;`]),
    ...(state.xBridges!.policy.numericFault === 'escalate'
      ? ['            instance->error_status = SM_ERR_XBRIDGES_NUMERIC;']
      : []),
  ];
  if (signal.numericType.kind === 'boolean') return [
    `        const double ${valueName} = (double)(${expression});`,
    `        ${destination} = SM_XB_Truth(${valueName});`,
    `        if (!isfinite(${valueName})) {`, `            ${destination} = false;`, ...faultLines, '        }',
  ];
  const precision = signal.numericType.kind === 'float' ? signal.numericType.precision : signal.numericType.kind;
  if (precision === 'float32') return [
    `        const double ${valueName} = (double)(${expression});`,
    `        if (!isfinite(${valueName})) {`, `            ${destination} = 0.0F;`,
    ...faultLines, `        } else if (fabs(${valueName}) > (double)FLT_MAX) {`,
    `            ${destination} = 0.0F;`, ...faultLines,
    '        } else {', `            ${destination} = (float)${valueName};`, '        }',
  ];
  if (precision === 'float64') return [
    `        const double ${valueName} = (double)(${expression});`,
    `        if (!isfinite(${valueName})) {`, `            ${destination} = 0.0;`, ...faultLines,
    `        } else {`, `            ${destination} = ${valueName};`, '        }',
  ];
  if (signal.numericType.kind === 'fixed') {
    const validity = layout.fixedValidityFields.get(signal.id);
    const real = layout.fixedRealFields.get(signal.id);
    if (validity === undefined || real === undefined) throw new Error(`X-Bridges fixed signal '${signal.id}' lacks sidecar storage`);
    return [
      `        const SM_XB_NumericResult_t ${resultName} = ${defaultConversionCall(expression, signal.numericType, operation)};`,
      `        if (${resultName}.fault != SM_XB_FAULT_NONE) {`,
      `            ${destination} = (${numericCType(signal.numericType)})0;`,
      `            (((bool *)&(instance->${member}.${validity}))[${index}]) = false;`,
      `            (((double *)&(instance->${member}.${real}))[${index}]) = 0.0;`,
      ...faultLines,
      '        } else {',
      `            ${destination} = (${numericCType(signal.numericType)})${resultName}.stored_integer;`,
      `            (((bool *)&(instance->${member}.${validity}))[${index}]) = ${resultName}.has_stored_integer;`,
      `            (((double *)&(instance->${member}.${real}))[${index}]) = ${resultName}.real_value;`,
      '        }',
    ];
  }
  return [];
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
  operation: XBSemanticOperation | null = null,
): string => {
  if (type.kind === 'fixed') {
    return [
      'SM_XB_ConvertFixed(',
      `${expression}, `,
      `${type.signed ? 'true' : 'false'}, `,
      `${type.wordLength}U, `,
      `${type.fractionLength}, `,
      'SM_XB_ROUND_FLOOR, ',
      operation?.parameters.overflow === 'error'
        ? 'SM_XB_OVERFLOW_ERROR)'
        : 'SM_XB_OVERFLOW_SATURATE)',
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
  const errorField = layout.errorFields.get(operation.id);
  const faultLines = [
    ...(errorField === undefined ? [] : [`        instance->${member}.${errorField} = true;`]),
    ...(state.xBridges!.policy.numericFault === 'escalate'
      ? ['        instance->error_status = SM_ERR_XBRIDGES_NUMERIC;']
      : []),
  ];
  if (signal.numericType.kind === 'boolean') {
    return [
      `    const double ${valueName} = (double)(${expression});`,
      `    instance->${member}.${field} = SM_XB_Truth(${valueName});`,
      `    if (!isfinite(${valueName})) {`,
      `        instance->${member}.${field} = false;`,
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
      `        instance->${member}.${field} = 0.0F;`,
      ...faultLines,
      `    } else if (fabs(${valueName}) > (double)FLT_MAX) {`,
      `        instance->${member}.${field} = 0.0F;`,
      ...faultLines,
      '    } else {',
      `        instance->${member}.${field} = (float)${valueName};`,
      '    }',
    ];
  }
  if (precision === 'float64') {
    return [
      `    const double ${valueName} = (double)(${expression});`,
      `    if (!isfinite(${valueName})) {`,
      `        instance->${member}.${field} = 0.0;`,
      ...faultLines,
      `    } else {`, `        instance->${member}.${field} = ${valueName};`, '    }',
    ];
  }
  if (signal.numericType.kind === 'fixed') {
    const sidecars = fixedSignalSidecarExpressions(signal, layout, member);
    return [
      `    const SM_XB_NumericResult_t ${resultName} = ${defaultConversionCall(expression, signal.numericType, operation)};`,
      `    if (${resultName}.fault != SM_XB_FAULT_NONE) {`,
      `        instance->${member}.${field} = (${numericCType(signal.numericType)})0;`,
      `        ${sidecars.validity} = false;`,
      `        ${sidecars.real} = 0.0;`,
      ...faultLines,
      '    } else {',
      `        instance->${member}.${field} = (${numericCType(signal.numericType)})${resultName}.stored_integer;`,
      `        ${sidecars.validity} = ${resultName}.has_stored_integer;`,
      `        ${sidecars.real} = ${resultName}.real_value;`,
      '    }',
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

const constantValues = (value: unknown): number[] => Array.isArray(value)
  ? value.flatMap((item) => constantValues(item))
  : typeof value === 'number' || typeof value === 'boolean'
    ? [Number(value)]
    : [];

const emitConstant: OperationEmitter = (
  state,
  operation,
  operationIndex,
  layout,
  member,
) => {
  const outputId = operation.outputSignalIds[0];
  if (outputId === undefined) return [];
  const output = requireSignal(state, outputId);
  const values = constantValues(
    operation.parameters.value
      ?? operation.parameters.Value
      ?? operation.parameters.constant,
  );
  const source = values.length === 0 ? [0] : values;
  return Array.from({ length: output.elementCount }, (_, index) =>
    renderSignalElementWrite(
      state,
      operation,
      operationIndex,
      index,
      outputId,
      `${index}U`,
      cNumber(source[index] ?? source[0]!),
      layout,
      member,
    )).flat();
};

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

const emitElementwise = (
  expression: (inputs: readonly string[]) => string,
): OperationEmitter => (state, operation, operationIndex, layout, member) => {
  const outputId = operation.outputSignalIds[0];
  if (outputId === undefined) return [];
  const output = requireSignal(state, outputId);
  if (output.shape.kind === 'scalar') return emitSingleOutput(expression)(state, operation, operationIndex, layout, member);
  const count = output.elementCount;
  for (const inputId of operation.inputSignalIds) {
    const input = requireSignal(state, inputId);
    if (input.elementCount !== 1 && input.elementCount !== count) {
      throw new Error(`X-Bridges '${operation.id}' elementwise input '${inputId}' has incompatible static size`);
    }
  }
  const inputs = operation.inputSignalIds.map((inputId) => {
    const input = requireSignal(state, inputId);
    return signalElementRealExpression(state, inputId, layout, member,
      input.elementCount === 1 ? '0U' : 'xb_i');
  });
  return [
    '    {',
    `        for (uint32_t xb_i = 0U; xb_i < ${count}U; ++xb_i) {`,
    ...renderSignalElementWrite(state, operation, operationIndex, 0, outputId,
      'xb_i', expression(inputs), layout, member),
    '        }',
    '    }',
  ];
};

const emitVectorElementwiseSum: OperationEmitter = (...args) =>
  emitElementwise((inputs) => reduceExpression(inputs, '+', '0.0'))(...args);
const emitVectorElementwiseProduct: OperationEmitter = (...args) =>
  emitElementwise((inputs) => reduceExpression(inputs, '*', '1.0'))(...args);
const emitVectorElementwiseSubtract: OperationEmitter = (...args) =>
  emitElementwise((inputs) => `((${inputs[0] ?? '0.0'}) - (${inputs[1] ?? '0.0'}))`)(...args);
const emitVectorElementwiseDivide: OperationEmitter = (...args) =>
  emitElementwise((inputs) => `((${inputs[0] ?? '0.0'}) / (${inputs[1] ?? '1.0'}))`)(...args);
const emitVectorElementwisePower: OperationEmitter = (...args) =>
  emitElementwise((inputs) => `pow((${inputs[0] ?? '0.0'}), (${inputs[1] ?? '0.0'}))`)(...args);

const matrixSignal = (
  state: SemanticState,
  signalId: string,
): Extract<XBShape, { kind: 'matrix' }> => {
  const shape = requireSignal(state, signalId).shape;
  if (shape.kind !== 'matrix') throw new Error(`X-Bridges '${signalId}' must be a matrix`);
  return shape;
};

const emitMatrixMultiply: OperationEmitter = (state, operation, operationIndex, layout, member) => {
  const [leftId, rightId] = operation.inputSignalIds;
  const outputId = operation.outputSignalIds[0];
  if (leftId === undefined || rightId === undefined || outputId === undefined) return [];
  const left = matrixSignal(state, leftId);
  const right = matrixSignal(state, rightId);
  const output = matrixSignal(state, outputId);
  if (left.columns !== right.rows || output.rows !== left.rows || output.columns !== right.columns) {
    throw new Error(`X-Bridges MatrixMul '${operation.id}' has incompatible static shapes`);
  }
  const leftValue = signalElementRealExpression(state, leftId, layout, member, `xb_row * ${left.columns}U + xb_k`);
  const rightValue = signalElementRealExpression(state, rightId, layout, member, `xb_k * ${right.columns}U + xb_column`);
  return [
    '    {', `        for (uint32_t xb_row = 0U; xb_row < ${left.rows}U; ++xb_row) {`,
    `            for (uint32_t xb_column = 0U; xb_column < ${right.columns}U; ++xb_column) {`,
    '                double xb_total = 0.0;',
    `                for (uint32_t xb_k = 0U; xb_k < ${left.columns}U; ++xb_k) {`,
    `                    xb_total += (${leftValue}) * (${rightValue});`, '                }',
    ...renderSignalElementWrite(state, operation, operationIndex, 0, outputId,
      `xb_row * ${right.columns}U + xb_column`, 'xb_total', layout, member).map((line) => `    ${line}`),
    '            }', '        }', '    }',
  ];
};

const emitTranspose: OperationEmitter = (state, operation, operationIndex, layout, member) => {
  const inputId = operation.inputSignalIds[0]; const outputId = operation.outputSignalIds[0];
  if (inputId === undefined || outputId === undefined) return [];
  const input = matrixSignal(state, inputId); const output = matrixSignal(state, outputId);
  if (output.rows !== input.columns || output.columns !== input.rows) throw new Error(`X-Bridges Transpose '${operation.id}' has incompatible static shapes`);
  return ['    {', `        for (uint32_t xb_row = 0U; xb_row < ${input.rows}U; ++xb_row) {`,
    `            for (uint32_t xb_column = 0U; xb_column < ${input.columns}U; ++xb_column) {`,
    ...renderSignalElementWrite(state, operation, operationIndex, 0, outputId,
      `xb_column * ${output.columns}U + xb_row`, signalElementRealExpression(state, inputId, layout, member, `xb_row * ${input.columns}U + xb_column`), layout, member).map((line) => `    ${line}`),
    '            }', '        }', '    }'];
};

const emitMatrixDiag: OperationEmitter = (state, operation, operationIndex, layout, member) => {
  const inputId = operation.inputSignalIds[0]; const outputId = operation.outputSignalIds[0];
  if (inputId === undefined || outputId === undefined) return [];
  const input = requireSignal(state, inputId); const output = matrixSignal(state, outputId);
  if (input.shape.kind !== 'vector' || output.rows !== input.shape.length || output.columns !== input.shape.length) throw new Error(`X-Bridges MatrixDiag '${operation.id}' requires vector to N-by-N static shapes`);
  return ['    {', `        for (uint32_t xb_row = 0U; xb_row < ${output.rows}U; ++xb_row) {`,
    `            for (uint32_t xb_column = 0U; xb_column < ${output.columns}U; ++xb_column) {`,
    ...renderSignalElementWrite(state, operation, operationIndex, 0, outputId,
      `xb_row * ${output.columns}U + xb_column`,
      `(xb_row == xb_column ? ${signalElementRealExpression(state, inputId, layout, member, 'xb_row')} : 0.0)`, layout, member).map((line) => `    ${line}`),
    '            }', '        }', '    }'];
};

const emitSubMatrix: OperationEmitter = (state, operation, operationIndex, layout, member) => {
  const inputId = operation.inputSignalIds[0]; const outputId = operation.outputSignalIds[0];
  if (inputId === undefined || outputId === undefined) return [];
  const input = matrixSignal(state, inputId); const output = matrixSignal(state, outputId);
  const rowStart = Number(scalarParameter(operation, ['rowStart'], 0));
  const rowEnd = Number(scalarParameter(operation, ['rowEnd'], input.rows - 1));
  const colStart = Number(scalarParameter(operation, ['colStart'], 0));
  const colEnd = Number(scalarParameter(operation, ['colEnd'], input.columns - 1));
  if (rowStart < 0 || colStart < 0 || rowEnd >= input.rows || colEnd >= input.columns || rowEnd - rowStart + 1 !== output.rows || colEnd - colStart + 1 !== output.columns) throw new Error(`X-Bridges SubMatrix '${operation.id}' has invalid static bounds`);
  return ['    {', `        for (uint32_t xb_row = 0U; xb_row < ${output.rows}U; ++xb_row) {`,
    `            for (uint32_t xb_column = 0U; xb_column < ${output.columns}U; ++xb_column) {`,
    ...renderSignalElementWrite(state, operation, operationIndex, 0, outputId,
      `xb_row * ${output.columns}U + xb_column`, signalElementRealExpression(state, inputId, layout, member, `(${rowStart}U + xb_row) * ${input.columns}U + ${colStart}U + xb_column`), layout, member).map((line) => `    ${line}`),
    '            }', '        }', '    }'];
};

const emitMatrixConcat: OperationEmitter = (state, operation, operationIndex, layout, member) => {
  const outputId = operation.outputSignalIds[0];
  if (outputId === undefined || operation.inputSignalIds.length === 0) return [];
  const output = matrixSignal(state, outputId);
  const axis = Number(scalarParameter(operation, ['axis'], 0));
  const inputs = operation.inputSignalIds.map((id) => ({ id, shape: matrixSignal(state, id) }));
  const pieces: string[] = ['    {'];
  if (axis === 1) {
    if (inputs.some(({ shape }) => shape.rows !== output.rows)
      || inputs.reduce((total, { shape }) => total + shape.columns, 0) !== output.columns) throw new Error(`X-Bridges MatrixConcat '${operation.id}' has incompatible horizontal static shapes`);
    pieces.push(`        for (uint32_t xb_row = 0U; xb_row < ${output.rows}U; ++xb_row) {`);
    let offset = 0;
    for (const { id, shape } of inputs) {
      pieces.push(`            for (uint32_t xb_column = 0U; xb_column < ${shape.columns}U; ++xb_column) {`,
        ...renderSignalElementWrite(state, operation, operationIndex, 0, outputId,
          `xb_row * ${output.columns}U + ${offset}U + xb_column`, signalElementRealExpression(state, id, layout, member, `xb_row * ${shape.columns}U + xb_column`), layout, member).map((line) => `    ${line}`),
        '            }');
      offset += shape.columns;
    }
    pieces.push('        }');
  } else {
    if (inputs.some(({ shape }) => shape.columns !== output.columns)
      || inputs.reduce((total, { shape }) => total + shape.rows, 0) !== output.rows) throw new Error(`X-Bridges MatrixConcat '${operation.id}' has incompatible vertical static shapes`);
    let offset = 0;
    for (const { id, shape } of inputs) {
      pieces.push(`        for (uint32_t xb_row = 0U; xb_row < ${shape.rows}U; ++xb_row) {`,
        `            for (uint32_t xb_column = 0U; xb_column < ${output.columns}U; ++xb_column) {`,
        ...renderSignalElementWrite(state, operation, operationIndex, 0, outputId,
          `(${offset}U + xb_row) * ${output.columns}U + xb_column`, signalElementRealExpression(state, id, layout, member, `xb_row * ${output.columns}U + xb_column`), layout, member).map((line) => `    ${line}`),
        '            }', '        }');
      offset += shape.rows;
    }
  }
  pieces.push('    }');
  return pieces;
};

const emitMatrixSolve: OperationEmitter = (state, operation, operationIndex, layout, member) => {
  const [matrixId, rightId] = operation.inputSignalIds; const outputId = operation.outputSignalIds[0];
  if (matrixId === undefined || rightId === undefined || outputId === undefined) return [];
  const matrix = matrixSignal(state, matrixId); const right = matrixSignal(state, rightId); const output = matrixSignal(state, outputId);
  const configuredMaximum = Number(scalarParameter(operation, ['maxDimension', 'maximumDimension'], 8));
  if (!Number.isSafeInteger(configuredMaximum) || configuredMaximum < 1 || configuredMaximum > 8 || matrix.rows !== matrix.columns || right.rows !== matrix.rows || output.rows !== matrix.rows || output.columns !== right.columns || matrix.rows > configuredMaximum || right.columns > configuredMaximum) throw new Error(`X-Bridges MatrixSolve '${operation.id}' exceeds static solve bounds`);
  const matrixValue = signalElementRealExpression(state, matrixId, layout, member, `xb_row * ${matrix.columns}U + xb_column`);
  const rightValue = signalElementRealExpression(state, rightId, layout, member, `xb_row * ${right.columns}U + xb_column`);
  const outputValue = signalElementRealExpression(state, outputId, layout, member, `xb_row * ${output.columns}U + xb_column`);
  const errorField = layout.errorFields.get(operation.id);
  const pivotFault = [
    ...(errorField === undefined ? [] : [`            instance->${member}.${errorField} = true;`]),
    ...(state.xBridges!.policy.numericFault === 'escalate'
      ? ['            instance->error_status = SM_ERR_XBRIDGES_NUMERIC;']
      : []),
  ];
  return ['    {', '        double xb_solve_a[SM_XB_MAX_SOLVE_DIMENSION * SM_XB_MAX_SOLVE_DIMENSION];', '        double xb_solve_b[SM_XB_MAX_SOLVE_DIMENSION * SM_XB_MAX_SOLVE_DIMENSION];', '        bool xb_pivot_failed = false;',
    `        for (uint32_t xb_row = 0U; xb_row < ${matrix.rows}U; ++xb_row) {`,
    `            for (uint32_t xb_column = 0U; xb_column < ${matrix.columns}U; ++xb_column) xb_solve_a[xb_row * SM_XB_MAX_SOLVE_DIMENSION + xb_column] = ${matrixValue};`,
    `            for (uint32_t xb_column = 0U; xb_column < ${right.columns}U; ++xb_column) xb_solve_b[xb_row * SM_XB_MAX_SOLVE_DIMENSION + xb_column] = ${rightValue};`, '        }',
    `        for (uint32_t xb_pivot = 0U; xb_pivot < ${matrix.rows}U; ++xb_pivot) {`, '            uint32_t xb_selected = xb_pivot;',
    `            for (uint32_t xb_row = xb_pivot + 1U; xb_row < ${matrix.rows}U; ++xb_row) if (fabs(xb_solve_a[xb_row * SM_XB_MAX_SOLVE_DIMENSION + xb_pivot]) > fabs(xb_solve_a[xb_selected * SM_XB_MAX_SOLVE_DIMENSION + xb_pivot])) xb_selected = xb_row;`,
    '            if (fabs(xb_solve_a[xb_selected * SM_XB_MAX_SOLVE_DIMENSION + xb_pivot]) <= 1.0e-12) { xb_pivot_failed = true; break; }',
    '            if (xb_selected != xb_pivot) {',
    `                for (uint32_t xb_column = 0U; xb_column < ${matrix.columns}U; ++xb_column) { double xb_swap = xb_solve_a[xb_pivot * SM_XB_MAX_SOLVE_DIMENSION + xb_column]; xb_solve_a[xb_pivot * SM_XB_MAX_SOLVE_DIMENSION + xb_column] = xb_solve_a[xb_selected * SM_XB_MAX_SOLVE_DIMENSION + xb_column]; xb_solve_a[xb_selected * SM_XB_MAX_SOLVE_DIMENSION + xb_column] = xb_swap; }`,
    `                for (uint32_t xb_column = 0U; xb_column < ${right.columns}U; ++xb_column) { double xb_swap = xb_solve_b[xb_pivot * SM_XB_MAX_SOLVE_DIMENSION + xb_column]; xb_solve_b[xb_pivot * SM_XB_MAX_SOLVE_DIMENSION + xb_column] = xb_solve_b[xb_selected * SM_XB_MAX_SOLVE_DIMENSION + xb_column]; xb_solve_b[xb_selected * SM_XB_MAX_SOLVE_DIMENSION + xb_column] = xb_swap; }`, '            }',
    `            for (uint32_t xb_row = xb_pivot + 1U; xb_row < ${matrix.rows}U; ++xb_row) {`, '                const double xb_factor = xb_solve_a[xb_row * SM_XB_MAX_SOLVE_DIMENSION + xb_pivot] / xb_solve_a[xb_pivot * SM_XB_MAX_SOLVE_DIMENSION + xb_pivot];', '                xb_solve_a[xb_row * SM_XB_MAX_SOLVE_DIMENSION + xb_pivot] = 0.0;',
    `                for (uint32_t xb_column = xb_pivot + 1U; xb_column < ${matrix.columns}U; ++xb_column) xb_solve_a[xb_row * SM_XB_MAX_SOLVE_DIMENSION + xb_column] -= xb_factor * xb_solve_a[xb_pivot * SM_XB_MAX_SOLVE_DIMENSION + xb_column];`,
    `                for (uint32_t xb_column = 0U; xb_column < ${right.columns}U; ++xb_column) xb_solve_b[xb_row * SM_XB_MAX_SOLVE_DIMENSION + xb_column] -= xb_factor * xb_solve_b[xb_pivot * SM_XB_MAX_SOLVE_DIMENSION + xb_column];`, '            }', '        }',
    '        if (xb_pivot_failed) {', ...pivotFault, '        } else {',
    `            for (int32_t xb_row = ${matrix.rows - 1}; xb_row >= 0; --xb_row) for (uint32_t xb_column = 0U; xb_column < ${right.columns}U; ++xb_column) { double xb_value = xb_solve_b[(uint32_t)xb_row * SM_XB_MAX_SOLVE_DIMENSION + xb_column]; for (uint32_t xb_k = (uint32_t)xb_row + 1U; xb_k < ${matrix.rows}U; ++xb_k) xb_value -= xb_solve_a[(uint32_t)xb_row * SM_XB_MAX_SOLVE_DIMENSION + xb_k] * xb_solve_b[xb_k * SM_XB_MAX_SOLVE_DIMENSION + xb_column]; xb_solve_b[(uint32_t)xb_row * SM_XB_MAX_SOLVE_DIMENSION + xb_column] = xb_value / xb_solve_a[(uint32_t)xb_row * SM_XB_MAX_SOLVE_DIMENSION + (uint32_t)xb_row]; }`, '        }',
    `        for (uint32_t xb_row = 0U; xb_row < ${output.rows}U; ++xb_row) for (uint32_t xb_column = 0U; xb_column < ${output.columns}U; ++xb_column) {`,
    ...renderSignalElementWrite(state, operation, operationIndex, 0, outputId, `xb_row * ${output.columns}U + xb_column`, `(xb_pivot_failed ? 0.0 : xb_solve_b[xb_row * SM_XB_MAX_SOLVE_DIMENSION + xb_column])`, layout, member).map((line) => `    ${line}`), '        }', '    }'];
};

const emitClarke: OperationEmitter = (state, operation, operationIndex, layout, member) => {
  const inputs = inputExpressions(state, operation, layout, member);
  const ia = inputs[0] ?? '0.0'; const ib = inputs[1] ?? '0.0'; const ic = inputs[2] ?? '0.0';
  const powerInvariant = operation.parameters.mode === 'power_invariant';
  const alpha = powerInvariant ? `(sqrt(2.0 / 3.0) * ((${ia}) - 0.5 * (${ib}) - 0.5 * (${ic})))` : ia;
  const beta = powerInvariant ? `(sqrt(2.0 / 3.0) * sqrt(3.0) * ((${ib}) - (${ic})) / 2.0)` : `(((${ia}) + 2.0 * (${ib})) / sqrt(3.0))`;
  return operation.outputSignalIds.flatMap((id, index) => renderSignalWrite(state, operation, operationIndex, index, id, index === 0 ? alpha : beta, layout, member));
};
const emitPark: OperationEmitter = (state, operation, operationIndex, layout, member) => {
  const inputs = inputExpressions(state, operation, layout, member); const alpha = inputs[0] ?? '0.0'; const beta = inputs[1] ?? '0.0'; const theta = inputs[2] ?? '0.0';
  const values = [`((${alpha}) * cos(${theta}) + (${beta}) * sin(${theta}))`, `(-(${alpha}) * sin(${theta}) + (${beta}) * cos(${theta}))`];
  return operation.outputSignalIds.flatMap((id, index) => renderSignalWrite(state, operation, operationIndex, index, id, values[index] ?? '0.0', layout, member));
};
const emitInversePark: OperationEmitter = (state, operation, operationIndex, layout, member) => {
  const inputs = inputExpressions(state, operation, layout, member); const d = inputs[0] ?? '0.0'; const q = inputs[1] ?? '0.0'; const theta = inputs[2] ?? '0.0';
  const values = [`((${d}) * cos(${theta}) - (${q}) * sin(${theta}))`, `((${d}) * sin(${theta}) + (${q}) * cos(${theta}))`];
  return operation.outputSignalIds.flatMap((id, index) => renderSignalWrite(state, operation, operationIndex, index, id, values[index] ?? '0.0', layout, member));
};
const emitInverseClarke: OperationEmitter = (state, operation, operationIndex, layout, member) => {
  const inputs = inputExpressions(state, operation, layout, member); const alpha = inputs[0] ?? '0.0'; const beta = inputs[1] ?? '0.0';
  const values = [alpha, `(-0.5 * (${alpha}) + sqrt(3.0) * (${beta}) / 2.0)`, `(-0.5 * (${alpha}) - sqrt(3.0) * (${beta}) / 2.0)`];
  return operation.outputSignalIds.flatMap((id, index) => renderSignalWrite(state, operation, operationIndex, index, id, values[index] ?? '0.0', layout, member));
};

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
          `    if (${resultName}.fault != SM_XB_FAULT_NONE) {`,
          `        instance->${member}.${dataField} = (${numericCType(dataSignal.numericType)})0;`,
          `        ${sidecars.validity} = false;`,
          `        ${sidecars.real} = 0.0;`,
          '    } else {',
          `        instance->${member}.${dataField} = (${numericCType(dataSignal.numericType)})${resultName}.stored_integer;`,
          `        ${sidecars.validity} = ${resultName}.has_stored_integer;`,
          `        ${sidecars.real} = ${resultName}.real_value;`,
          '    }',
        ];
      })()
    : [
        `    instance->${member}.${dataField} = ${resultName}.fault == SM_XB_FAULT_NONE ? (${numericCType(dataSignal.numericType)})${resultName}.${convertedStorageMember(dataSignal.numericType)} : (${numericCType(dataSignal.numericType)})0;`,
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
  VectorAdd: emitVectorElementwiseSum,
  VectorSub: emitVectorElementwiseSubtract,
  VectorMul: emitVectorElementwiseProduct,
  VectorDiv: emitVectorElementwiseDivide,
  VectorPow: emitVectorElementwisePower,
  UnaryNeg: emitNegate,
  Abs: emitAbsolute,
  MatrixMul: emitMatrixMultiply,
  Transpose: emitTranspose,
  MatrixConcat: emitMatrixConcat,
  MatrixDiag: emitMatrixDiag,
  SubMatrix: emitSubMatrix,
  MatrixSolve: emitMatrixSolve,
  CLARKE_TRANSFORM: emitClarke,
  PARK_TRANSFORM: emitPark,
  INVERSE_PARK: emitInversePark,
  INVERSE_CLARKE: emitInverseClarke,
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

const stateSlotField = (
  slot: XBSemanticStateSlot,
  layout: XBStateLayout,
): string => {
  const field = layout.slotFields.get(slot.id);
  if (field === undefined) {
    throw new Error(`X-Bridges state slot '${slot.id}' lacks generated storage`);
  }
  return field;
};

const stateSlotRealExpression = (
  slot: XBSemanticStateSlot,
  layout: XBStateLayout,
  member: string,
): string => {
  const field = `instance->${member}.${stateSlotField(slot, layout)}`;
  return slot.numericType.kind === 'fixed'
    ? `ldexp((double)(${field}), ${-slot.numericType.fractionLength})`
    : slot.numericType.kind === 'boolean'
      ? `((${field}) ? 1.0 : 0.0)`
      : `(double)(${field})`;
};

const stateSlotElementRealExpression = (
  slot: XBSemanticStateSlot,
  layout: XBStateLayout,
  member: string,
  index: string,
): string => {
  const field = `(((${numericCType(slot.numericType)} *)&(instance->${member}.${stateSlotField(slot, layout)}))[${index}])`;
  return slot.numericType.kind === 'fixed'
    ? `ldexp((double)(${field}), ${-slot.numericType.fractionLength})`
    : slot.numericType.kind === 'boolean'
      ? `((${field}) ? 1.0 : 0.0)`
      : `(double)(${field})`;
};

const renderStateSlotElementAssignment = (
  state: SemanticState,
  slot: XBSemanticStateSlot,
  index: string,
  expression: string,
  layout: XBStateLayout,
  member: string,
  name: string,
  errorField: string | undefined = undefined,
  operation: XBSemanticOperation | null = null,
): string[] => {
  const field = `(((${numericCType(slot.numericType)} *)&(instance->${member}.${stateSlotField(slot, layout)}))[${index}])`;
  const faultLines = [
    ...(errorField === undefined ? [] : [`        instance->${member}.${errorField} = true;`]),
    ...(state.xBridges!.policy.numericFault === 'escalate'
      ? ['        instance->error_status = SM_ERR_XBRIDGES_NUMERIC;']
      : []),
  ];
  if (slot.numericType.kind !== 'fixed') {
    const value = `xb_state_${toCIdentifier(name)}_value`;
    return [
      `    const double ${value} = (double)(${expression});`,
      `    if (!isfinite(${value})) {`, ...faultLines, '    } else {',
      `        ${field} = (${numericCType(slot.numericType)})${value};`, '    }',
    ];
  }
  const result = `xb_state_${toCIdentifier(name)}`;
  return [
    `    const SM_XB_NumericResult_t ${result} = ${defaultConversionCall(expression, slot.numericType, operation)};`,
    `    if (${result}.fault != SM_XB_FAULT_NONE) {`, ...faultLines, '    } else {',
    `        ${field} = (${numericCType(slot.numericType)})${result}.stored_integer;`, '    }',
  ];
};

const renderStateSlotAssignment = (
  state: SemanticState,
  slot: XBSemanticStateSlot,
  expression: string,
  layout: XBStateLayout,
  member: string,
  name: string,
  errorField: string | undefined = undefined,
  operation: XBSemanticOperation | null = null,
): string[] => {
  const field = `instance->${member}.${stateSlotField(slot, layout)}`;
  const faultLines = [
    ...(errorField === undefined ? [] : [`        instance->${member}.${errorField} = true;`]),
    ...(state.xBridges!.policy.numericFault === 'escalate'
      ? ['        instance->error_status = SM_ERR_XBRIDGES_NUMERIC;']
      : []),
  ];
  if (slot.numericType.kind !== 'fixed') {
    const value = `xb_state_${toCIdentifier(name)}_value`;
    return [
      `    const double ${value} = (double)(${expression});`,
      `    if (!isfinite(${value})) {`, ...faultLines, '    } else {',
      `        ${field} = (${numericCType(slot.numericType)})${value};`, '    }',
    ];
  }
  const result = `xb_state_${toCIdentifier(name)}`;
  return [
    `    const SM_XB_NumericResult_t ${result} = ${defaultConversionCall(expression, slot.numericType, operation)};`,
    `    if (${result}.fault != SM_XB_FAULT_NONE) {`, ...faultLines, '    } else {',
    `        ${field} = (${numericCType(slot.numericType)})${result}.stored_integer;`, '    }',
  ];
};

const stateSlotForRole = (
  operation: XBSemanticOperation,
  role: string,
) => (operation.state?.slots ?? []).find((slot) => slot.role === role);

const renderPIDComputation = (
  state: SemanticState,
  operation: XBSemanticOperation,
  layout: XBStateLayout,
  member: string,
): string[] => {
  const iSlot = stateSlotForRole(operation, 'i_state');
  const dSlot = stateSlotForRole(operation, 'd_state');
  const lastESlot = stateSlotForRole(operation, 'last_e');
  const [errorId, enableId, resetId] = operation.inputSignalIds;
  if (iSlot === undefined || dSlot === undefined || lastESlot === undefined
    || errorId === undefined || enableId === undefined || resetId === undefined) {
    throw new Error(`X-Bridges PID_BASIC '${operation.id}' requires e, enable, reset, i_state, d_state, and last_e`);
  }
  const identifier = toCIdentifier(operation.id);
  const e = `xb_pid_${identifier}_e`;
  const enabled = `xb_pid_${identifier}_enabled`;
  const reset = `xb_pid_${identifier}_reset`;
  const i = `xb_pid_${identifier}_i`;
  const d = `xb_pid_${identifier}_d`;
  const lastE = `xb_pid_${identifier}_last_e`;
  const derivative = `xb_pid_${identifier}_derivative`;
  const unlimited = `xb_pid_${identifier}_unlimited`;
  const output = `xb_pid_${identifier}_output`;
  const kp = cNumber(scalarParameter(operation, ['Kp', 'kp'], 1));
  const ki = cNumber(scalarParameter(operation, ['Ki', 'ki'], 0));
  const kd = cNumber(scalarParameter(operation, ['Kd', 'kd'], 0));
  const n = cNumber(scalarParameter(operation, ['N', 'n'], 100));
  const dt = cNumber(scalarParameter(operation, ['sampleTime', 'dt'], 1));
  const minimum = cNumber(scalarParameter(operation, ['min', 'minimum'], -100));
  const maximum = cNumber(scalarParameter(operation, ['max', 'maximum'], 100));
  const mode = operation.parameters.mode;
  const method = operation.parameters.method;
  const integralLines = mode === 'PD' ? [] : method === 'forward_euler'
    ? [`            ${i} += (${ki}) * ${lastE} * (${dt});`]
    : method === 'backward_euler'
      ? [`            ${i} += (${ki}) * ${e} * (${dt});`]
      : [`            ${i} += (${ki}) * (${e} + ${lastE}) * (${dt}) / 2.0;`];
  const derivativeLines = mode === 'PI' ? [] : method === 'forward_euler'
    ? [
      `            ${derivative} = (${kd}) * (${n}) * (${e} - ${d});`,
      `            ${d} += (${n}) * (${e} - ${d}) * (${dt});`,
    ] : method === 'backward_euler'
      ? [
        `            ${derivative} = (${kd}) * (${n}) * (${e} - ${d}) / (1.0 + (${n}) * (${dt}));`,
        `            ${d} = (${d} + (${n}) * ${e} * (${dt})) / (1.0 + (${n}) * (${dt}));`,
      ] : [
        `            ${derivative} = 2.0 * (${kd}) * (${n}) * (${e} - ${d}) / (2.0 + (${n}) * (${dt}));`,
        `            ${d} = (${d} * (2.0 - (${n}) * (${dt})) + 2.0 * (${n}) * ${e} * (${dt})) / (2.0 + (${n}) * (${dt}));`,
      ];
  return [
    `        const double ${e} = ${signalRealExpression(state, errorId, layout, member)};`,
    `        const double ${enabled} = ${signalRealExpression(state, enableId, layout, member)};`,
    `        const double ${reset} = ${signalRealExpression(state, resetId, layout, member)};`,
    `        double ${i} = ${stateSlotRealExpression(iSlot, layout, member)};`,
    `        double ${d} = ${stateSlotRealExpression(dSlot, layout, member)};`,
    `        double ${lastE} = ${stateSlotRealExpression(lastESlot, layout, member)};`,
    `        double ${derivative} = 0.0;`,
    `        double ${unlimited} = 0.0;`,
    `        double ${output} = 0.0;`,
    `        if (${reset} > 0.5) { ${i} = 0.0; ${d} = 0.0; ${lastE} = 0.0; }`,
    `        else if (${enabled} < 0.5) { ${output} = 0.0; }`,
    '        else {',
    ...integralLines,
    ...derivativeLines,
    `            ${unlimited} = (${kp}) * ${e} + ${i} + ${derivative};`,
    `            ${output} = fmax(${minimum}, fmin(${maximum}, ${unlimited}));`,
    `            if (((${ki}) != 0.0) && (((${unlimited} > ${maximum}) && (${e} > 0.0)) || ((${unlimited} < ${minimum}) && (${e} < 0.0)))) ${i} = ${stateSlotRealExpression(iSlot, layout, member)};`,
    `            ${lastE} = ${e};`,
    '        }',
    `        (void)${output};`,
  ];
};

const renderStateOutputs = (
  state: SemanticState,
  operation: XBSemanticOperation,
  operationIndex: number,
  layout: XBStateLayout,
  member: string,
  expressions: readonly string[] | null = null,
): string[] => {
  if (operation.type === 'PID_BASIC') {
    const outputSignalId = operation.outputSignalIds.find((signalId) =>
      state.xBridges!.signals[signalId]?.portId === 'u');
    if (outputSignalId === undefined) return [];
    const outputName = `xb_pid_${toCIdentifier(operation.id)}_output`;
    return ['    {', ...renderPIDComputation(state, operation, layout, member),
      ...renderSignalWrite(state, operation, operationIndex, 0, outputSignalId, outputName, layout, member).map((line) => `    ${line}`),
      '    }'];
  }
  if (operation.type === 'DISCRETE_TRANSFER_FUNCTION' || operation.type === 'STATE_SPACE') {
    const xSlot = stateSlotForRole(operation, 'x');
    const ySignalId = operation.outputSignalIds.find((signalId) =>
      state.xBridges!.signals[signalId]?.portId === 'y');
    if (xSlot !== undefined && ySignalId !== undefined) {
      const y = requireSignal(state, ySignalId);
      const inputId = operation.inputSignalIds[0];
      const c = (row: number, column: number) => cNumber(matrixParameterValue(operation, 'C', row, column, 0));
      const d = (row: number, column: number) => cNumber(matrixParameterValue(operation, 'D', row, column, 0));
      const terms = Array.from({ length: y.elementCount }, (_, row) => {
        const stateTerms = Array.from({ length: xSlot.initialValues.length }, (_, column) =>
          `(${c(row, column)}) * ${stateSlotElementRealExpression(xSlot, layout, member, `${column}U`)}`);
        const inputSignal = inputId === undefined ? null : requireSignal(state, inputId);
        const inputTerms = inputSignal === null ? [] : Array.from({ length: inputSignal.elementCount }, (_, column) =>
          `(${d(row, column)}) * ${signalElementRealExpression(state, inputId!, layout, member, `${column}U`)}`);
        return renderSignalElementWrite(state, operation, operationIndex, row, ySignalId, `${row}U`,
          [...stateTerms, ...inputTerms].join(' + ') || '0.0', layout, member);
      }).flat();
      const xSignalId = xSlot.signalId;
      const xLines = xSignalId === null ? [] : Array.from({ length: xSlot.initialValues.length }, (_, index) =>
        renderSignalElementWrite(state, operation, operationIndex, y.elementCount + index, xSignalId, `${index}U`,
          stateSlotElementRealExpression(xSlot, layout, member, `${index}U`), layout, member)).flat();
      return [...terms, ...xLines];
    }
  }
  return (operation.state?.slots ?? []).flatMap((slot, slotIndex) => slot.signalId === null ? [] :
  renderSignalWrite(
    state,
    operation,
    operationIndex,
    slotIndex,
    slot.signalId,
    expressions?.[slotIndex]
      ?? stateSlotRealExpression(slot, layout, member),
    layout,
    member,
  ));
};

const renderOperationFaultSignalSyncForOperation = (
  state: SemanticState,
  operation: XBSemanticOperation,
  layout: XBStateLayout,
  member: string,
): string[] => {
  const field = layout.errorFields.get(operation.id);
  const signalId = numericFaultContract(state, operation).errorSignalId;
  if (field === undefined || signalId === null) return [];
  return [
    `    ${signalStorageExpression(state, signalId, layout, member).expression} = instance->${member}.${field};`,
  ];
};

const renderTransactionalStateOutputs = (
  state: SemanticState,
  operation: XBSemanticOperation,
  outputLines: readonly string[],
  layout: XBStateLayout,
  member: string,
): string[] => {
  const errorField = layout.errorFields.get(operation.id);
  if (errorField === undefined || outputLines.length === 0) {
    return [
      ...outputLines,
      ...renderOperationFaultSignalSyncForOperation(
        state, operation, layout, member,
      ),
    ];
  }
  const errorSignalId = numericFaultContract(state, operation).errorSignalId;
  const outputIds = [...new Set(operation.outputSignalIds)]
    .filter((signalId) => signalId !== errorSignalId);
  const snapshots = outputIds.flatMap((signalId, signalIndex) => {
    const signal = requireSignal(state, signalId);
    const field = layout.signalFields.get(signal.id);
    if (field === undefined) {
      throw new Error(`X-Bridges signal '${signal.id}' lacks generated storage`);
    }
    const components = [{
      field,
      type: numericCType(signal.numericType),
      suffix: 'value',
    }];
    if (signal.numericType.kind === 'fixed') {
      const validity = layout.fixedValidityFields.get(signal.id);
      const real = layout.fixedRealFields.get(signal.id);
      if (validity === undefined || real === undefined) {
        throw new Error(`X-Bridges fixed signal '${signal.id}' lacks sidecar storage`);
      }
      components.push(
        { field: validity, type: 'bool', suffix: 'validity' },
        { field: real, type: 'double', suffix: 'real' },
      );
    }
    return components.map((component, componentIndex) => {
      const name = `xb_output_snapshot_${toCIdentifier(operation.id)}_${signalIndex}_${component.suffix}`;
      if (signal.shape.kind === 'scalar') return {
        declaration: `        ${component.type} ${name};`,
        save: `        ${name} = instance->${member}.${component.field};`,
        restore: `            instance->${member}.${component.field} = ${name};`,
      };
      const index = `xb_output_snapshot_index_${signalIndex}_${componentIndex}`;
      return {
        declaration: `        ${component.type} ${name}${shapeSuffix(signal.shape)};`,
        save: `        for (uint32_t ${index} = 0U; ${index} < ${signal.elementCount}U; ++${index}) (((${component.type} *)&${name})[${index}]) = (((${component.type} *)&(instance->${member}.${component.field}))[${index}]);`,
        restore: `            for (uint32_t ${index} = 0U; ${index} < ${signal.elementCount}U; ++${index}) (((${component.type} *)&(instance->${member}.${component.field}))[${index}]) = (((${component.type} *)&${name})[${index}]);`,
      };
    });
  });
  return [
    '    {',
    `        if (!instance->${member}.${errorField}) {`,
    ...snapshots.map((snapshot) => snapshot.declaration),
    ...snapshots.map((snapshot) => snapshot.save),
    ...outputLines.map((line) => `        ${line}`),
    `        if (instance->${member}.${errorField}) {`,
    ...snapshots.map((snapshot) => snapshot.restore),
    '        }',
    '        }',
    '    }',
    ...renderOperationFaultSignalSyncForOperation(
      state, operation, layout, member,
    ),
  ];
};

const renderDirectEvaluation = (
  state: SemanticState,
  xb: XBSemanticModel,
  layout: XBStateLayout,
  member: string,
  forceEvaluation = false,
): string[] => xb.executionOrder.flatMap((operationId, operationIndex) => {
  const operation = xb.operations[operationId];
  if (operation === undefined) {
    throw new Error(
      `X-Bridges execution order references missing operation '${operationId}'`,
    );
  }
  if (operation.stateful) return [];
  const errorField = layout.errorFields.get(operation.id);
  const emitted = [
    ...operationEmitter(operation)(
    state,
    operation,
    operationIndex,
    layout,
    member,
  ),
  ];
  const guarded = errorField === undefined ? emitted : [
    `    if (!instance->${member}.${errorField}) {`,
    ...emitted.map((line) => `    ${line}`),
    '    }',
  ];
  const evaluated = [
    ...guarded,
    ...renderOperationFaultSignalSyncForOperation(
      state, operation, layout, member,
    ),
  ];
  if (
    forceEvaluation
    || operation.schedule.hold === 'none'
    || operation.schedule.periodSubsteps <= 1
  ) return evaluated;
  const counter = layout.counterFields.get(operation.id);
  if (counter === undefined) {
    throw new Error(`X-Bridges operation '${operation.id}' lacks a schedule counter`);
  }
  return [
    `    if (instance->${member}.${counter} == UINT32_C(0)) {`,
    ...guarded.map((line) => `    ${line}`),
    '    }',
    ...renderOperationFaultSignalSyncForOperation(
      state, operation, layout, member,
    ),
  ];
});

const renderTransactionalStateUpdates = (
  operation: XBSemanticOperation,
  updates: readonly string[],
  layout: XBStateLayout,
  member: string,
): string[] => {
  const errorField = layout.errorFields.get(operation.id);
  const slots = operation.state?.slots ?? [];
  if (errorField === undefined || slots.length === 0) return [...updates];
  const stem = `xb_snapshot_${toCIdentifier(operation.id)}`;
  const snapshots = slots.map((slot, index) => {
    const field = stateSlotField(slot, layout);
    const name = `${stem}_${index}`;
    const type = numericCType(slot.numericType);
    const count = slot.initialValues.length;
    if (slot.shape.kind === 'scalar') return {
      declaration: `        ${type} ${name};`,
      save: `        ${name} = instance->${member}.${field};`,
      restore: `            instance->${member}.${field} = ${name};`,
    };
    return {
      declaration: `        ${type} ${name}${shapeSuffix(slot.shape)};`,
      save: `        for (uint32_t xb_snapshot_index_${index} = 0U; xb_snapshot_index_${index} < ${count}U; ++xb_snapshot_index_${index}) (((${type} *)&${name})[xb_snapshot_index_${index}]) = (((${type} *)&(instance->${member}.${field}))[xb_snapshot_index_${index}]);`,
      restore: `            for (uint32_t xb_snapshot_index_${index} = 0U; xb_snapshot_index_${index} < ${count}U; ++xb_snapshot_index_${index}) (((${type} *)&(instance->${member}.${field}))[xb_snapshot_index_${index}]) = (((${type} *)&${name})[xb_snapshot_index_${index}]);`,
    };
  });
  return [
    '    {',
    `        if (!instance->${member}.${errorField}) {`,
    ...snapshots.map((snapshot) => snapshot.declaration),
    ...snapshots.map((snapshot) => snapshot.save),
    ...updates.map((line) => `        ${line}`),
    `        if (instance->${member}.${errorField}) {`,
    ...snapshots.map((snapshot) => snapshot.restore),
    '        }',
    '        }',
    '    }',
  ];
};

const renderOperationFaultReset = (
  xb: XBSemanticModel,
  layout: XBStateLayout,
  member: string,
): string[] => xb.executionOrder.flatMap((operationId) => {
  const field = layout.errorFields.get(operationId);
  return field === undefined ? [] : [`    instance->${member}.${field} = false;`];
});

const renderOperationFaultSignalSync = (
  state: SemanticState,
  xb: XBSemanticModel,
  layout: XBStateLayout,
  member: string,
): string[] => xb.executionOrder.flatMap((operationId) => {
  const operation = xb.operations[operationId];
  return operation === undefined
    ? []
    : renderOperationFaultSignalSyncForOperation(
        state, operation, layout, member,
      );
});

const renderDiscreteStateUpdates = (
  state: SemanticState,
  xb: XBSemanticModel,
  layout: XBStateLayout,
  member: string,
): string[] => xb.executionOrder.flatMap((operationId) => {
  const operation = xb.operations[operationId];
  if (
    operation === undefined
    || !operation.stateful
    || operation.type === 'INTEGRATOR_CONTINUOUS'
    || operation.type === 'Integrator'
  ) return [];
  const counter = layout.counterFields.get(operation.id);
  if (counter === undefined) {
    throw new Error(`X-Bridges operation '${operation.id}' lacks a schedule counter`);
  }
  const withFaultSync = (rendered: readonly string[]): string[] => [
    ...rendered,
    ...renderOperationFaultSignalSyncForOperation(
      state, operation, layout, member,
    ),
  ];
  const input = (operation.type === 'STATE_SPACE' || operation.type === 'DISCRETE_TRANSFER_FUNCTION') || operation.inputSignalIds[0] === undefined
    ? '0.0'
    : signalRealExpression(state, operation.inputSignalIds[0], layout, member);
  if (operation.type === 'STATE_SPACE' || operation.type === 'DISCRETE_TRANSFER_FUNCTION') {
    const xSlot = stateSlotForRole(operation, 'x');
    const inputId = operation.inputSignalIds[0];
    if (xSlot === undefined || inputId === undefined) {
      throw new Error(`X-Bridges STATE_SPACE '${operation.id}' requires x state and input signals`);
    }
    const inputSignal = requireSignal(state, inputId);
    const dimension = xSlot.initialValues.length;
    if (dimension === 0) {
      throw new Error(`X-Bridges STATE_SPACE '${operation.id}' requires a non-empty state vector`);
    }
    const coefficientByRow = (name: string, column: number): string =>
      Array.from({ length: dimension }, (_, row) =>
        `(xb_row == ${row}U ? ${cNumber(matrixParameterValue(operation, name, row, column, 0))}`)
        .join(' : ') + ' : 0.0' + ')'.repeat(dimension);
    // Matrix coefficients are emitted directly from validated, finite parameters;
    // loop bounds remain literal dimensions from the semantic IR.
    const updateLines: string[] = [
      '    {',
      `        double xb_state_space_next[${dimension}U];`,
      `        for (uint32_t xb_row = 0U; xb_row < ${dimension}U; ++xb_row) {`,
      '            double xb_sum = 0.0;',
    ];
    for (let column = 0; column < dimension; column++) {
      updateLines.push(`            xb_sum += (${coefficientByRow('A', column)}) * ${stateSlotElementRealExpression(xSlot, layout, member, `${column}U`)};`);
    }
    for (let column = 0; column < inputSignal.elementCount; column++) {
      updateLines.push(`            xb_sum += (${coefficientByRow('B', column)}) * ${signalElementRealExpression(state, inputId, layout, member, `${column}U`)};`);
    }
    updateLines.push('            xb_state_space_next[xb_row] = xb_sum;', '        }',
      `        for (uint32_t xb_row = 0U; xb_row < ${dimension}U; ++xb_row) {`,
      ...renderStateSlotElementAssignment(state, xSlot, 'xb_row', 'xb_state_space_next[xb_row]', layout, member, `${operation.id}_state_space_update`, layout.errorFields.get(operation.id), operation).map((line) => `    ${line}`),
      '        }', '    }');
    const transactional = renderTransactionalStateUpdates(operation, updateLines, layout, member);
    if (operation.schedule.hold === 'none' || operation.schedule.periodSubsteps <= 1) return withFaultSync(transactional);
    return withFaultSync([`    if (instance->${member}.${counter} == UINT32_C(0)) {`, ...transactional.map((line) => `    ${line}`), '    }']);
  }
  if (operation.type === 'PID_BASIC') {
    const iSlot = stateSlotForRole(operation, 'i_state');
    const dSlot = stateSlotForRole(operation, 'd_state');
    const lastESlot = stateSlotForRole(operation, 'last_e');
    if (iSlot === undefined || dSlot === undefined || lastESlot === undefined) {
      throw new Error(`X-Bridges PID_BASIC '${operation.id}' requires i_state, d_state, and last_e`);
    }
    const identifier = toCIdentifier(operation.id);
    const updates = [
      ...renderStateSlotAssignment(state, iSlot, `xb_pid_${identifier}_i`, layout, member, `${operation.id}_i_state_update`, layout.errorFields.get(operation.id), operation),
      ...renderStateSlotAssignment(state, dSlot, `xb_pid_${identifier}_d`, layout, member, `${operation.id}_d_state_update`, layout.errorFields.get(operation.id), operation),
      ...renderStateSlotAssignment(state, lastESlot, `xb_pid_${identifier}_last_e`, layout, member, `${operation.id}_last_e_state_update`, layout.errorFields.get(operation.id), operation),
    ];
    const block = ['    {', ...renderPIDComputation(state, operation, layout, member),
      ...renderTransactionalStateUpdates(operation, updates, layout, member).map((line) => `    ${line}`), '    }'];
    if (operation.schedule.hold === 'none' || operation.schedule.periodSubsteps <= 1) return withFaultSync(block);
    return withFaultSync([`    if (instance->${member}.${counter} == UINT32_C(0)) {`, ...block.map((line) => `    ${line}`), '    }']);
  }
  const updates = (operation.state?.slots ?? []).flatMap((slot, slotIndex) => {
    switch (operation.type) {
      case 'DELAY':
      case 'UNIT_DELAY':
      case 'MEMORY':
        return renderStateSlotAssignment(
          state, slot, input, layout, member, `${operation.id}_${slotIndex}_update`, layout.errorFields.get(operation.id), operation,
        );
      case 'INTEGRATOR_DISCRETE':
        return renderStateSlotAssignment(
          state,
          slot,
          `${stateSlotRealExpression(slot, layout, member)} + (${input})`,
          layout,
          member,
          `${operation.id}_${slotIndex}_update`,
          layout.errorFields.get(operation.id), operation,
        );
      case 'PID_CONTROLLER': {
        const feedbackId = operation.inputSignalIds[1];
        const feedback = feedbackId === undefined
          ? '0.0'
          : signalRealExpression(state, feedbackId, layout, member);
        const error = `((${input}) - (${feedback}))`;
        const proportional = cNumber(scalarParameter(operation, ['Kp', 'kp'], 1));
        const integral = cNumber(scalarParameter(operation, ['Ki', 'ki'], 0));
        const step = cNumber(scalarParameter(operation, ['sampleTime', 'dt'], 1));
        const minimum = cNumber(scalarParameter(operation, ['min', 'minimum'], -100));
        const maximum = cNumber(scalarParameter(operation, ['max', 'maximum'], 100));
        return renderStateSlotAssignment(
          state,
          slot,
          `fmax(${minimum}, fmin(${maximum}, (${proportional}) * ${error} + ${stateSlotRealExpression(slot, layout, member)} + (${integral}) * ${error} * (${step})))`,
          layout,
          member,
          `${operation.id}_${slotIndex}_update`,
          layout.errorFields.get(operation.id), operation,
        );
      }
      default:
        throw new Error(
          `X-Bridges stateful operation '${operation.id}' has unsupported type '${operation.type}'`,
        );
    }
  });
  if (updates.length === 0) return [];
  const transactional = renderTransactionalStateUpdates(operation, updates, layout, member);
  if (operation.schedule.hold === 'none' || operation.schedule.periodSubsteps <= 1) {
    return withFaultSync(transactional);
  }
  return withFaultSync([
    `    if (instance->${member}.${counter} == UINT32_C(0)) {`,
    ...transactional.map((line) => `    ${line}`),
    '    }',
  ]);
});

interface ContinuousOperationSlot {
  readonly operation: XBSemanticOperation;
  readonly operationIndex: number;
  readonly slot: XBSemanticStateSlot;
  readonly slotIndex: number;
}

const continuousOperationSlots = (
  xb: XBSemanticModel,
): ContinuousOperationSlot[] => xb.executionOrder.flatMap((operationId, operationIndex) => {
  const operation = xb.operations[operationId];
  if (
    operation === undefined
    || (operation.type !== 'INTEGRATOR_CONTINUOUS' && operation.type !== 'Integrator')
  ) return [];
  return (operation.state?.slots ?? []).map((slot, slotIndex) => ({
    operation,
    operationIndex,
    slot,
    slotIndex,
  }));
});

const rkName = (
  prefix: string,
  entry: ContinuousOperationSlot,
): string => `${prefix}_${entry.operationIndex}_${entry.slotIndex}`;

const renderContinuousStateUpdates = (
  state: SemanticState,
  xb: XBSemanticModel,
  layout: XBStateLayout,
  member: string,
): string[] => {
  const slots = continuousOperationSlots(xb);
  if (slots.length === 0) return [];
  const transactionalAssignments = (
    entries: readonly ContinuousOperationSlot[],
    expression: (entry: ContinuousOperationSlot) => string,
    prefix: string,
  ): string[] => {
    const groups = new Map<string, ContinuousOperationSlot[]>();
    for (const entry of entries) {
      const group = groups.get(entry.operation.id) ?? [];
      group.push(entry);
      groups.set(entry.operation.id, group);
    }
    return [...groups.values()].flatMap((group) => [
      ...renderTransactionalStateUpdates(
        group[0].operation,
        group.flatMap((entry) => renderStateSlotAssignment(
          state,
          entry.slot,
          expression(entry),
          layout,
          member,
          `${prefix}_${entry.operationIndex}_${entry.slotIndex}`,
          layout.errorFields.get(entry.operation.id),
          entry.operation,
        )),
        layout,
        member,
      ),
      ...renderOperationFaultSignalSyncForOperation(
        state, group[0].operation, layout, member,
      ),
    ]);
  };
  const step = cNumber(xb.solver.stepSeconds);
  const baseLines = slots.map((entry) =>
    `    const double ${rkName('xb_rk_base', entry)} = ${stateSlotRealExpression(entry.slot, layout, member)};`);
  const derivative = (entry: ContinuousOperationSlot): string => {
    const input = entry.operation.inputSignalIds[0];
    return input === undefined
      ? '0.0'
      : signalRealExpression(state, input, layout, member);
  };
  if (xb.solver.kind === 'euler') {
    const nextLines = slots.map((entry) =>
      `    const double ${rkName('xb_euler_next', entry)} = ${rkName('xb_rk_base', entry)} + ${step} * (${derivative(entry)});`);
    const assignLines = transactionalAssignments(
      slots,
      (entry) => rkName('xb_euler_next', entry),
      'euler',
    );
    return [
      ...baseLines,
      ...nextLines,
      ...assignLines,
      '    {',
      ...slots.flatMap((entry) => renderTransactionalStateOutputs(
        state,
        entry.operation,
        renderStateOutputs(
          state, entry.operation, entry.operationIndex, layout, member, null,
        ),
        layout,
        member,
      ).map((line) => `    ${line}`)),
      ...renderDirectEvaluation(state, xb, layout, member, true)
        .map((line) => `    ${line}`),
      '    }',
    ];
  }
  const stage = (
    label: 'k2' | 'k3' | 'k4',
    previous: 'k1' | 'k2' | 'k3',
    scale: string,
  ): string[] => [
    '    {',
    ...slots.flatMap((entry) => renderTransactionalStateOutputs(
      state,
      entry.operation,
      renderStateOutputs(
        state,
        entry.operation,
        entry.operationIndex,
        layout,
        member,
        [`${rkName('xb_rk_base', entry)} + ${scale} * ${rkName(`xb_rk_${previous}`, entry)}`],
      ),
      layout,
      member,
    ).map((line) => `    ${line}`)),
    ...renderDirectEvaluation(state, xb, layout, member, true)
      .map((line) => `    ${line}`),
    ...slots.map((entry) =>
      `    ${rkName(`xb_rk_${label}`, entry)} = ${derivative(entry)};`),
    '    }',
  ];
  const k1 = slots.map((entry) =>
    `    const double ${rkName('xb_rk_k1', entry)} = ${derivative(entry)};`);
  const laterStages = slots.flatMap((entry) => [
    `    double ${rkName('xb_rk_k2', entry)};`,
    `    double ${rkName('xb_rk_k3', entry)};`,
    `    double ${rkName('xb_rk_k4', entry)};`,
  ]);
  const finalExpression = (entry: ContinuousOperationSlot): string =>
    `(${rkName('xb_rk_base', entry)} + ${step} * (${rkName('xb_rk_k1', entry)} + 2.0 * ${rkName('xb_rk_k2', entry)} + 2.0 * ${rkName('xb_rk_k3', entry)} + ${rkName('xb_rk_k4', entry)}) / 6.0)`;
  const final = transactionalAssignments(slots, finalExpression, 'rk4');
  const refresh = [
    '    {',
    ...slots.flatMap((entry) => renderTransactionalStateOutputs(
      state,
      entry.operation,
      renderStateOutputs(
        state, entry.operation, entry.operationIndex, layout, member, null,
      ),
      layout,
      member,
    ).map((line) => `    ${line}`)),
    ...renderDirectEvaluation(state, xb, layout, member, true)
      .map((line) => `    ${line}`),
    '    }',
  ];
  return [
    ...baseLines,
    ...k1,
    ...laterStages,
    ...stage('k2', 'k1', `${step} * 0.5`),
    ...stage('k3', 'k2', `${step} * 0.5`),
    ...stage('k4', 'k3', step),
    ...final,
    ...refresh,
  ];
};

const renderScheduleAdvances = (
  xb: XBSemanticModel,
  layout: XBStateLayout,
  member: string,
): string[] => xb.executionOrder.flatMap((operationId) => {
  const operation = xb.operations[operationId];
  if (operation === undefined) return [];
  const counter = layout.counterFields.get(operation.id);
  if (counter === undefined || operation.schedule.periodSubsteps <= 1) {
    return counter === undefined ? [] : [`    instance->${member}.${counter} = UINT32_C(0);`];
  }
  return [
    `    instance->${member}.${counter} += ${operation.schedule.counterIncrement}U;`,
    `    if (instance->${member}.${counter} >= ${operation.schedule.periodSubsteps}U) {`,
    `        instance->${member}.${counter} -= ${operation.schedule.periodSubsteps}U;`,
    '    }',
  ];
});

const renderSolverSubstep = (
  state: SemanticState,
  xb: XBSemanticModel,
  layout: XBStateLayout,
  member: string,
): string[] => [
  '    {',
  '        (void)instance;',
  ...xb.executionOrder.flatMap((operationId, operationIndex) => {
    const operation = xb.operations[operationId];
    if (!operation?.stateful) return [];
    const outputs = renderTransactionalStateOutputs(
      state,
      operation,
      renderStateOutputs(state, operation, operationIndex, layout, member),
      layout,
      member,
    )
      .map((line) => `    ${line}`);
    if (operation.type === 'INTEGRATOR_CONTINUOUS' || operation.type === 'Integrator'
      || operation.schedule.hold === 'none' || operation.schedule.periodSubsteps <= 1) {
      return outputs;
    }
    const counter = layout.counterFields.get(operation.id);
    if (counter === undefined) {
      throw new Error(`X-Bridges operation '${operation.id}' lacks a schedule counter`);
    }
    return [
      `    if (instance->${member}.${counter} == UINT32_C(0)) {`,
      ...outputs.map((line) => `    ${line}`),
      '    }',
    ];
  }),
  ...renderDirectEvaluation(state, xb, layout, member).map((line) => `    ${line}`),
  ...renderDiscreteStateUpdates(state, xb, layout, member).map((line) => `    ${line}`),
  ...renderContinuousStateUpdates(state, xb, layout, member).map((line) => `    ${line}`),
  ...renderScheduleAdvances(xb, layout, member).map((line) => `    ${line}`),
  '    }',
];

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
    for (const slot of operation.state?.slots ?? []) {
      if (slot.shape.kind === 'scalar') {
        initLines.push(...renderStateSlotAssignment(
          state, slot, cNumber(slot.initialValues[0]), layout, member,
          `initial_${operation.id}_${slot.id}`,
        ));
      } else {
        slot.initialValues.forEach((value, index) => initLines.push(
          ...renderStateSlotElementAssignment(
            state, slot, `${index}U`, cNumber(value), layout, member,
            `initial_${operation.id}_${slot.id}_${index}`,
          ),
        ));
      }
    }
  }
  const stepLines: string[] = [];
  stepLines.push(...renderOperationFaultReset(xb, layout, member));
  stepLines.push(...renderOperationFaultSignalSync(state, xb, layout, member));
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
  for (let substep = 0; substep < xb.solver.substepsPerTick; substep++) {
    stepLines.push(...renderSolverSubstep(state, xb, layout, member));
  }
  stepLines.push(...renderOperationFaultSignalSync(state, xb, layout, member));
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
    orderedXBStates(ir).some((state) => state.xBridges!.executionOrder.some((operationId) =>
      state.xBridges!.operations[operationId]?.type === 'MatrixSolve'))
      ? '#define SM_XB_MAX_SOLVE_DIMENSION 8U\n'
      : null,
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
