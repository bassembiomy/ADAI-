import { execFileSync } from 'child_process';
import { existsSync, readdirSync, statSync, writeFileSync } from 'fs';
import { join, relative, resolve } from 'path';
import type { SMCStandard } from './smModel';
import type { SMTestManifest } from './smTestManifest';
import type { ActivityEvidence } from './smVerificationEvidence';
import { runTool } from './smToolRunner';
import { createGeneratedCodeTestWorkspace } from '../generatedCodeTestWorkspace';
import {
  coerceSemanticValue,
  createRuntime,
  faultRuntime,
  initializeRuntime,
  resetRuntime,
  stepRuntime,
} from './smInterpreter';
import { applyInputs } from './smStandaloneRuntime';
import { generateCArtifacts } from './smCGenerator';
import { renderCType } from './smCExpressions';
import type {
  DifferentialFixture,
  DifferentialScenarioStep,
} from './smFixtures';
import { buildSemanticModel } from './smSemanticBuilder';
import { toCIdentifier, type ExpressionNode } from './smExpressions';
import type {
  SemanticLayer,
  SemanticModel,
  SemanticState,
  SemanticVariable,
} from './smSemanticModel';
import type {
  SemanticTraceFrame,
  XBridgesTraceValue,
} from './smTrace';
import type {
  XBSemanticSignal,
  XBSemanticStateSlot,
} from './xbSemanticModel';
import type { XBNumericType, XBShape } from './xbNumeric';

export interface CProgramOptions {
  directory: string;
  harnessSource: string;
  additionalSources?: readonly string[];
  defines?: readonly string[];
  allowMissingCompiler?: boolean;
  executableName?: string;
}

export const compileAndRunCProgram = (
  options: CProgramOptions,
): string | null => {
  try {
    execFileSync('gcc', ['--version'], { stdio: 'pipe' });
  } catch (error) {
    if (options.allowMissingCompiler) return null;
    throw error;
  }
  const harnessName = 'sm_trace_harness.c';
  writeFileSync(
    join(options.directory, harnessName),
    options.harnessSource,
  );
  const executable = join(
    options.directory,
    process.platform === 'win32'
      ? `${options.executableName ?? 'sm_trace_harness'}.exe`
      : options.executableName ?? 'sm_trace_harness',
  );
  execFileSync('gcc', [
    '-std=c99',
    '-pedantic-errors',
    '-Wall',
    '-Wextra',
    '-Werror',
    ...(options.defines ?? []).map((define) => `-D${define}`),
    '-I.',
    'sm_mapping.c',
    'sm_core.c',
    'sm_safety.c',
    'sm_user_logic.c',
    ...(existsSync(join(options.directory, 'sm_xbridges.c'))
      ? ['sm_xbridges.c']
      : []),
    ...(options.additionalSources ?? []),
    harnessName,
    '-lm',
    '-o',
    executable,
  ], { cwd: options.directory, stdio: 'pipe' });
  return execFileSync(executable, [], {
    cwd: options.directory,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
};

export interface SyntaxCompilationResult {
  success: boolean;
  errors: string[];
}

export function compileGeneratedCSyntax(
  artifacts: { files: readonly { name: string; content: string }[] },
  strictCI = false,
): SyntaxCompilationResult {
  const workspace = createGeneratedCodeTestWorkspace('syntax-check');
  for (const file of artifacts.files) {
    if (file.name.endsWith('.c') || file.name.endsWith('.h')) {
      writeFileSync(join(workspace.directory, file.name), file.content);
    }
  }

  const cFiles = artifacts.files
    .filter((f) => f.name.endsWith('.c'))
    .map((f) => f.name);

  const flags = [
    '-std=c11',
    '-Wall',
    '-Wextra',
    ...(strictCI ? ['-Werror'] : []),
    '-fsyntax-only',
    '-I.',
    ...cFiles,
  ];

  try {
    execFileSync('gcc', flags, { cwd: workspace.directory, stdio: 'pipe' });
    return { success: true, errors: [] };
  } catch (err: any) {
    const errorMsg = err.stderr ? err.stderr.toString() : String(err);
    return { success: false, errors: [errorMsg] };
  }
}


const orderedStates = (ir: SemanticModel): SemanticState[] =>
  Object.values(ir.states).sort(
    (left, right) =>
      left.activityIndex - right.activityIndex || left.id.localeCompare(right.id),
  );

const compareCanonicalIds = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const orderedXBTraceStates = (ir: SemanticModel): SemanticState[] =>
  Object.values(ir.states)
    .filter((state) => state.xBridges !== null)
    .sort((left, right) => compareCanonicalIds(left.id, right.id));

const orderedLayers = (ir: SemanticModel): SemanticLayer[] =>
  Object.values(ir.layers).sort((left, right) => {
    const leftSlot = left.activeSlot ?? Number.MAX_SAFE_INTEGER;
    const rightSlot = right.activeSlot ?? Number.MAX_SAFE_INTEGER;
    return leftSlot - rightSlot || left.id.localeCompare(right.id);
  });

const orderedVariables = (ir: SemanticModel): SemanticVariable[] =>
  Object.values(ir.variables).sort((left, right) =>
    left.id.localeCompare(right.id));

const xbNumericCType = (type: XBNumericType): string => {
  if (type.kind === 'fixed') {
    const width = type.wordLength <= 8 ? 8 : type.wordLength <= 16 ? 16 : 32;
    return `${type.signed ? 'int' : 'uint'}${width}_t`;
  }
  if (type.kind === 'boolean') return 'bool';
  const precision = type.kind === 'float' ? type.precision : type.kind;
  return precision === 'float64' ? 'double' : 'float';
};

interface XBTraceLayout {
  signalFields: Map<string, string>;
  fixedValidityFields: Map<string, string>;
  fixedRealFields: Map<string, string>;
  slotFields: Map<string, string>;
  errorFields: Map<string, string>;
}

const xbTraceLayout = (state: SemanticState): XBTraceLayout => {
  const xb = state.xBridges!;
  const names = new Set<string>();
  const signalFields = new Map<string, string>();
  const fixedValidityFields = new Map<string, string>();
  const fixedRealFields = new Map<string, string>();
  const slotFields = new Map<string, string>();
  const errorFields = new Map<string, string>();
  const allocate = (preferred: string, namespace: string): string => {
    let candidate = preferred;
    let suffix = 2;
    if (names.has(candidate)) candidate = `${preferred}_${namespace}`;
    while (names.has(candidate)) candidate = `${preferred}_${namespace}_${suffix++}`;
    names.add(candidate);
    return candidate;
  };
  for (const signal of Object.values(xb.signals).sort((left, right) =>
    left.id.localeCompare(right.id))) {
    const name = allocate(toCIdentifier(`${signal.nodeId}_${signal.portId}`), 'signal');
    signalFields.set(signal.id, name);
    if (signal.numericType.kind === 'fixed') {
      fixedValidityFields.set(
        signal.id,
        allocate(`${name}_has_stored_integer`, 'signal_validity'),
      );
      fixedRealFields.set(
        signal.id,
        allocate(`${name}_real_value`, 'signal_real'),
      );
    }
  }
  for (const operationId of xb.executionOrder) {
    const operation = xb.operations[operationId];
    for (const slot of operation.state?.slots ?? []) {
      slotFields.set(
        slot.id,
        allocate(`state_${toCIdentifier(slot.id)}`, 'slot'),
      );
    }
    allocate(`schedule_${toCIdentifier(operation.id)}`, 'counter');
    if (operation.outputSignalIds.length > 0) {
      errorFields.set(
        operation.id,
        allocate(`${toCIdentifier(operation.id)}_error`, 'fault'),
      );
    }
  }
  return { signalFields, fixedValidityFields, fixedRealFields, slotFields, errorFields };
};

const xbStateMembers = (ir: SemanticModel): Map<string, string> => {
  const names = new Set<string>();
  // Member allocation must mirror xbCGenerator's activity-order ABI layout.
  return new Map(orderedStates(ir).filter((state) => state.xBridges !== null)
    .map((state) => {
      const preferred = `xb_${toCIdentifier(state.id).toLowerCase()}`;
      let name = preferred;
      let suffix = 2;
      while (names.has(name)) name = `${preferred}_${suffix++}`;
      names.add(name);
      return [state.id, name];
    }));
};

const buildFixtureIr = (fixture: DifferentialFixture): SemanticModel => {
  const built = buildSemanticModel(fixture.model);
  const errors = built.diagnostics.filter((item) => item.severity === 'error');
  if (!built.ir || errors.length > 0) {
    throw new Error(
      `differential fixture '${fixture.name}' is invalid: `
      + errors.map((item) => `${item.code}: ${item.message}`).join('; '),
    );
  }
  return built.ir;
};

interface TraceObservation {
  mappedOutputs: Record<string, number | boolean>;
  safeOutputsApplied: number;
  watchdogKicks: number;
}

const evaluateConversion = (
  expression: ExpressionNode | null,
  input: number | boolean,
): number | boolean => {
  if (expression === null) return input;
  if (expression.kind === 'literal') return expression.value;
  if (expression.kind === 'variable') {
    if (expression.name !== 'x') {
      throw new Error(
        `I/O conversion may only reference 'x'; received '${expression.name}'.`,
      );
    }
    return input;
  }
  if (expression.kind === 'unary') {
    const operand = evaluateConversion(expression.operand, input);
    if (expression.operator === '!') return !operand;
    if (expression.operator === '+') return Number(operand);
    return -Number(operand);
  }
  if (expression.kind === 'call') {
    const arg = Number(evaluateConversion(expression.argument, input));
    switch (expression.functionName) {
      case 'sin': return Math.sin(arg);
      case 'cos': return Math.cos(arg);
      case 'exp': return Math.exp(arg);
      case 'sqrt': return Math.sqrt(arg);
      case 'abs': return Math.abs(arg);
      default: throw new Error(`Unsupported function call '${expression.functionName}'`);
    }
  }
  if (expression.kind === 'binary') {
    if (expression.operator === '&&') {
      return Boolean(evaluateConversion(expression.left, input))
        && Boolean(evaluateConversion(expression.right, input));
    }
    if (expression.operator === '||') {
      return Boolean(evaluateConversion(expression.left, input))
        || Boolean(evaluateConversion(expression.right, input));
    }
    const left = evaluateConversion(expression.left, input);
    const right = evaluateConversion(expression.right, input);
    switch (expression.operator) {
      case '+': return Number(left) + Number(right);
      case '-': return Number(left) - Number(right);
      case '*': return Number(left) * Number(right);
      case '/': return Number(left) / Number(right);
      case '%': return Number(left) % Number(right);
      case '<': return Number(left) < Number(right);
      case '<=': return Number(left) <= Number(right);
      case '>': return Number(left) > Number(right);
      case '>=': return Number(left) >= Number(right);
      case '==': return left === right;
      case '!=': return left !== right;
    }
  }
  throw new Error(`Unhandled expression kind '${(expression as ExpressionNode).kind}'`);
};

const resetEffects = (observation: TraceObservation): void => {
  observation.safeOutputsApplied = 0;
  observation.watchdogKicks = 0;
};

const commitMappedOutputs = (
  ir: SemanticModel,
  data: Readonly<Record<string, number | boolean>>,
  observation: TraceObservation,
): void => {
  for (const mapping of ir.ioMappings) {
    if (mapping.direction !== 'write') continue;
    observation.mappedOutputs[mapping.channelId] = evaluateConversion(
      mapping.conversionExpression,
      data[mapping.variableId],
    );
  }
  if (ir.ioMappings.length > 0) observation.watchdogKicks += 1;
};

const commitSafeOutputs = (
  ir: SemanticModel,
  observation: TraceObservation,
): void => {
  for (const mapping of ir.ioMappings) {
    if (mapping.direction !== 'write') continue;
    observation.mappedOutputs[mapping.channelId] = mapping.safeValue
      ?? (mapping.channelDataType === 'bool' ? false : 0);
  }
  if (
    ir.safetyMode
    || ir.ioMappings.some((mapping) => mapping.direction === 'write')
  ) {
    observation.safeOutputsApplied += 1;
  }
};

const observeFrame = (
  frame: SemanticTraceFrame,
  observation: TraceObservation,
): SemanticTraceFrame => Object.freeze({
  ...frame,
  mappedOutputs: Object.freeze({ ...observation.mappedOutputs }),
  ioEffects: Object.freeze({
    safeOutputsApplied: observation.safeOutputsApplied,
    watchdogKicks: observation.watchdogKicks,
  }),
});

export const runInterpreterTrace = (
  fixture: DifferentialFixture,
): SemanticTraceFrame[] => {
  const ir = buildFixtureIr(fixture);
  const runtime = createRuntime(ir);
  const observation: TraceObservation = {
    mappedOutputs: {},
    safeOutputsApplied: 0,
    watchdogKicks: 0,
  };
  const initialized = initializeRuntime(runtime);
  const frames = [observeFrame({
    ...initialized,
    actions: [],
  }, observation)];
  for (const operation of fixture.steps) {
    resetEffects(observation);
    if (operation.kind === 'reset') {
      const frame = resetRuntime(runtime);
      commitMappedOutputs(ir, runtime.data, observation);
      frames.push(observeFrame(frame, observation));
      continue;
    }
    if (operation.kind === 'fault') {
      const frame = faultRuntime(runtime);
      commitSafeOutputs(ir, observation);
      frames.push(observeFrame(frame, observation));
      continue;
    }
    applyInputs(runtime, operation.inputs ?? {});
    const frame = stepRuntime(
      runtime,
      operation.elapsedMs ?? runtime.ir.tickMs,
    );
    if (frame.error === null) commitMappedOutputs(ir, runtime.data, observation);
    else if (runtime.error?.code === 'XBRIDGES_NUMERIC') commitSafeOutputs(ir, observation);
    frames.push(observeFrame(frame, observation));
  }
  return frames;
};

const cString = (value: string): string =>
  `"${value
    .replaceAll('\\', '\\\\')
    .replaceAll('"', '\\"')
    .replaceAll('\r', '\\r')
    .replaceAll('\n', '\\n')}"`;

const stateIndex = (state: SemanticState): string =>
  `${state.enumName}_IDX`;

const layerMacro = (layer: SemanticLayer): string =>
  `SM_LYR_${toCIdentifier(layer.id).toUpperCase()}_IDX`;

const orderedChannels = (ir: SemanticModel): string[] =>
  [...new Set(ir.ioMappings.map((mapping) => mapping.channelId))]
    .sort((left, right) => left.localeCompare(right));

const renderNodeIdFunction = (states: readonly SemanticState[]): string => [
  'static const char *node_id(SM_Node_t node)',
  '{',
  '    switch (node) {',
  ...states.map((state) =>
    `        case ${state.enumName}: return ${cString(state.id)};`),
  '        default: return "";',
  '    }',
  '}',
].join('\n');

const renderTokenFunction = (): string => [
  'static void print_token(const char *value)',
  '{',
  '    const unsigned char *cursor = (const unsigned char *)value;',
  '    while (*cursor != 0U) {',
  '        const unsigned char byte = *cursor++;',
  '        if (((byte >= (unsigned char)\'A\') && (byte <= (unsigned char)\'Z\')) ||',
  '            ((byte >= (unsigned char)\'a\') && (byte <= (unsigned char)\'z\')) ||',
  '            ((byte >= (unsigned char)\'0\') && (byte <= (unsigned char)\'9\')) ||',
  '            (byte == (unsigned char)\'-\') || (byte == (unsigned char)\'_\') ||',
  '            (byte == (unsigned char)\'.\')) {',
  '            (void)putchar((int)byte);',
  '        } else {',
  '            (void)printf("%%%02X", (unsigned)byte);',
  '        }',
  '    }',
  '}',
].join('\n');

const renderMcalFunctions = (ir: SemanticModel): string => {
  const channels = orderedChannels(ir);
  const channelCount = Math.max(channels.length, 1);
  return [
    `#define SM_TRACE_CHANNEL_CAPACITY ${channelCount}U`,
    'static bool output_written[SM_TRACE_CHANNEL_CAPACITY];',
    'static double output_values[SM_TRACE_CHANNEL_CAPACITY];',
    'static unsigned safe_outputs_applied = 0U;',
    'static unsigned watchdog_kicks = 0U;',
    '',
    'bool MCAL_Dio_ReadChannel(uint32_t channel)',
    '{',
    '    (void)channel;',
    '    return false;',
    '}',
    '',
    'void MCAL_Dio_WriteChannel(uint32_t channel, bool level)',
    '{',
    '    if (channel < SM_TRACE_CHANNEL_CAPACITY) {',
    '        output_written[channel] = true;',
    '        output_values[channel] = level ? 1.0 : 0.0;',
    '    }',
    '}',
    '',
    'double MCAL_ReadChannelValue(uint32_t channel)',
    '{',
    '    (void)channel;',
    '    return 0.0;',
    '}',
    '',
    'void MCAL_WriteChannelValue(uint32_t channel, double value)',
    '{',
    '    if (channel < SM_TRACE_CHANNEL_CAPACITY) {',
    '        output_written[channel] = true;',
    '        output_values[channel] = value;',
    '    }',
    '}',
    '',
    'void MCAL_ApplySafeOutputs(void)',
    '{',
    '    ++safe_outputs_applied;',
    '}',
    '',
    'void MCAL_Watchdog_Kick(void)',
    '{',
    '    ++watchdog_kicks;',
    '}',
  ].join('\n');
};

const renderInputAssignments = (
  ir: SemanticModel,
  operation: Extract<DifferentialScenarioStep, { kind: 'step' }>,
): string[] => Object.entries(operation.inputs ?? {}).map(([reference, value]) => {
  const variable = ir.variables[reference]
    ?? Object.values(ir.variables).find((candidate) =>
      candidate.name === reference);
  if (!variable) {
    throw new Error(`scenario input '${reference}' is not a semantic variable`);
  }
  const coerced = coerceSemanticValue(value, variable.type);
  const literal = typeof coerced === 'boolean'
    ? coerced ? 'true' : 'false'
    : Number.isFinite(coerced)
      ? `${coerced}`
      : (() => {
          throw new Error(
            `scenario input '${reference}' must be finite; received ${coerced}`,
          );
        })();
  return `    instance.data.${variable.cName} = (${renderCType(variable.type)})(${literal});`;
});

const renderScenarioOperations = (
  ir: SemanticModel,
  steps: readonly DifferentialScenarioStep[],
): string => steps.flatMap((operation) => {
  if (operation.kind === 'reset') {
    return [
      '    action_count = 0U;',
      '    safe_outputs_applied = 0U;',
      '    watchdog_kicks = 0U;',
      '    (void)SM_Reset(&instance);',
      '    print_frame(&instance, sequence++, 0U);',
    ];
  }
  if (operation.kind === 'fault') {
    return [
      '    action_count = 0U;',
      '    safe_outputs_applied = 0U;',
      '    watchdog_kicks = 0U;',
      '    instance.error_status = SM_ERR_SAFETY_VIOLATION;',
      '    (void)SM_Step(&instance, SM_TICK_MS);',
      '    print_frame(&instance, sequence++, 0U);',
    ];
  }
  const elapsedMs = operation.elapsedMs ?? ir.tickMs;
  return [
    ...renderInputAssignments(ir, operation),
    '    action_count = 0U;',
    '    safe_outputs_applied = 0U;',
    '    watchdog_kicks = 0U;',
    `    step_error = SM_Step(&instance, ${elapsedMs}U);`,
    '    if (step_error == SM_ERR_NONE) {',
    '        (void)SM_WriteOutputs(&instance);',
    '    }',
    `    print_frame(&instance, sequence++, ${elapsedMs}U);`,
  ];
}).join('\n');

const xbShapeCode = (shape: XBShape): string => shape.kind === 'scalar'
  ? 's'
  : shape.kind === 'vector'
    ? `v${shape.length}`
    : `m${shape.rows}x${shape.columns}`;

const xbFlatExpressions = (
  member: string,
  field: string,
  type: XBNumericType,
  count: number,
  scalar: boolean,
): string[] => scalar
  ? [`instance->${member}.${field}`]
  : Array.from({ length: count }, (_, index) =>
    `(((${xbNumericCType(type)} *)&instance->${member}.${field})[${index}])`);

const xbValuePrints = (
  expressions: readonly string[],
  boolean: boolean,
): string[] => expressions.flatMap((expression, index) => [
  ...(index === 0 ? [] : ['    printf(",");']),
  boolean
    ? `    printf("%d", (${expression}) ? 1 : 0);`
    : `    printf("%.17g", (double)(${expression}));`,
]);

const renderXBridgesTrace = (ir: SemanticModel): string[] => {
  const states = orderedXBTraceStates(ir);
  const members = xbStateMembers(ir);
  let signalIndex = 0;
  let slotIndex = 0;
  const signals: string[] = [];
  const slots: string[] = [];
  const faults: string[] = ['    first = true;'];
  for (const state of states) {
    const xb = state.xBridges!;
    const member = members.get(state.id)!;
    const layout = xbTraceLayout(state);
    for (const signal of Object.values(xb.signals).sort((left, right) =>
      compareCanonicalIds(left.id, right.id))) {
      const expressions = signal.numericType.kind === 'fixed'
        ? xbFlatExpressions(
            member,
            layout.fixedRealFields.get(signal.id)!,
            { kind: 'float64' },
            signal.elementCount,
            signal.shape.kind === 'scalar',
          )
        : xbFlatExpressions(
            member,
            layout.signalFields.get(signal.id)!,
            signal.numericType,
            signal.elementCount,
            signal.shape.kind === 'scalar',
          );
      if (signalIndex++ > 0) signals.push('    printf(";");');
      signals.push(
        `    print_token(${cString(state.id)});`, '    printf(":");',
        `    print_token(${cString(signal.id)});`,
        `    printf(":${xbShapeCode(signal.shape)}:${signal.numericType.kind === 'boolean' ? 'b' : 'n'}:");`,
        ...xbValuePrints(expressions, signal.numericType.kind === 'boolean'),
      );
    }
    for (const operationId of [...xb.executionOrder]
      .sort(compareCanonicalIds)) {
      const operation = xb.operations[operationId];
      for (const slot of [...(operation.state?.slots ?? [])].sort((left, right) =>
        compareCanonicalIds(left.role, right.role))) {
        let expressions = xbFlatExpressions(
          member,
          layout.slotFields.get(slot.id)!,
          slot.numericType,
          slot.initialValues.length,
          slot.shape.kind === 'scalar',
        );
        if (slot.numericType.kind === 'fixed') {
          const fractionLength = slot.numericType.fractionLength;
          expressions = expressions.map((value) =>
            `ldexp((double)(${value}), ${-fractionLength})`);
        }
        if (slotIndex++ > 0) slots.push('    printf(";");');
        slots.push(
          `    print_token(${cString(state.id)});`, '    printf(":");',
          `    print_token(${cString(operationId)});`, '    printf(":");',
          `    print_token(${cString(slot.role)});`,
          `    printf(":${xbShapeCode(slot.shape)}:${slot.numericType.kind === 'boolean' ? 'b' : 'n'}:");`,
          ...xbValuePrints(expressions, slot.numericType.kind === 'boolean'),
        );
      }
      const errorField = layout.errorFields.get(operationId);
      if (errorField !== undefined) faults.push(
        `    if (instance->${member}.${errorField}) {`,
        '        printf("%s", first ? "" : ";");',
        `        print_token(${cString(state.id)});`, '        printf(":");',
        `        print_token(${cString(operationId)});`,
        '        first = false;', '    }',
      );
    }
  }
  return [
    '    printf("|xbSignals=");', ...signals,
    '    printf("|xbState=");', ...slots,
    '    printf("|xbFaults=");', ...faults,
  ];
};

const renderFramePrinter = (ir: SemanticModel): string => {
  const states = orderedStates(ir);
  const variables = orderedVariables(ir);
  const layers = orderedLayers(ir);
  const channels = orderedChannels(ir);
  const writeMappings = ir.ioMappings
    .filter((mapping) => mapping.direction === 'write')
    .sort((left, right) => left.channelId.localeCompare(right.channelId));
  const activePrints = states.flatMap((state) => [
    `    if (instance->state_active[${stateIndex(state)}]) {`,
    '        printf("%s", first ? "" : ",");',
    `        print_token(${cString(state.id)});`,
    '        first = false;',
    '    }',
  ]);
  const dataPrints = variables.flatMap((variable, index) => {
    const prefix = index === 0 ? '' : ';';
    return variable.type === 'bool'
      ? [
          ...(prefix === '' ? [] : [`    printf(${cString(prefix)});`]),
          `    print_token(${cString(variable.id)});`,
          `    printf(":b:%d", instance->data.${variable.cName} ? 1 : 0);`,
        ]
      : [
          ...(prefix === '' ? [] : [`    printf(${cString(prefix)});`]),
          `    print_token(${cString(variable.id)});`,
          `    printf(":n:%.17g", (double)instance->data.${variable.cName});`,
        ];
  });
  const timerPrints = states.flatMap((state, index) => [
    ...(index === 0 ? [] : [`    printf(";");`]),
    `    print_token(${cString(state.id)});`,
    `    printf(":%u", (unsigned)instance->state_timers[${stateIndex(state)}]);`,
  ]);
  const historyPrints = layers.flatMap((layer) => {
    const shallow = layer.activeSlot === null
      ? null
      : [
          '    printf("%s", first ? "" : ";");',
          `    print_token(${cString(layer.id)});`,
          '    printf(":");',
          '    first = false;',
          `    if (instance->history_states[${layer.activeSlot}U] == SM_NODE_INVALID) {`,
          '        printf("~");',
          '    } else {',
          `        print_token(node_id(instance->history_states[${layer.activeSlot}U]));`,
          '    }',
        ].join('\n');
    const descendants = states.filter((state) => {
      let current: SemanticLayer | undefined = ir.layers[state.layerId];
      while (current) {
        if (current.id === layer.id) return true;
        if (current.parentStateId === null) return false;
        current = ir.layers[ir.states[current.parentStateId].layerId];
      }
      return false;
    });
    const hasDeep = descendants.map((state) =>
      `instance->deep_history[${layerMacro(layer)}][${stateIndex(state)}]`)
      .join(' || ') || 'false';
    const deep = [
      `    if (${hasDeep}) {`,
      '        printf("%s", first ? "" : ";");',
      `        print_token(${cString(layer.id)});`,
      '        printf(":deep:[");',
      '        first = false;',
      '        item_first = true;',
      ...descendants.flatMap((state) => [
        `        if (instance->deep_history[${layerMacro(layer)}][${stateIndex(state)}]) {`,
        '            printf("%s", item_first ? "" : ",");',
        `            print_token(${cString(state.id)});`,
        '            item_first = false;',
        '        }',
      ]),
      '        printf("]");',
      '    }',
    ].join('\n');
    return [shallow, deep].filter((item): item is string => item !== null);
  });
  const outputPrints = writeMappings.flatMap((mapping, index) => {
    const channelIndex = channels.indexOf(mapping.channelId);
    return [
      `    if (output_written[${channelIndex}U]) {`,
      ...(index === 0 ? [] : ['        printf(";");']),
      `        print_token(${cString(mapping.channelId)});`,
      mapping.channelDataType === 'bool'
        ? `        printf(":b:%d", output_values[${channelIndex}U] != 0.0 ? 1 : 0);`
        : `        printf(":n:%.17g", output_values[${channelIndex}U]);`,
      '    }',
    ];
  });
  const xbMembers = xbStateMembers(ir);
  const faultItems = orderedXBTraceStates(ir).flatMap((state) => {
    const layout = xbTraceLayout(state);
    return [...state.xBridges!.executionOrder]
      .sort(compareCanonicalIds)
      .flatMap((operationId) => {
        const field = layout.errorFields.get(operationId);
        return field === undefined ? [] : [{
          stateId: state.id,
          operationId,
          member: xbMembers.get(state.id)!,
          field,
        }];
      });
  });
  const faultPrints = faultItems.flatMap((item, index) => [
    ...(index === 0 ? [] : ['    printf(";");']),
    `    print_token(${cString(`${item.stateId}/${item.operationId}`)});`,
    `    printf(":b:%d", instance->${item.member}.${item.field} ? 1 : 0);`,
  ]);
  return [
    'static void print_frame(const ADIA_Instance_t *instance, unsigned sequence, unsigned elapsed_ms)',
    '{',
    '    unsigned action_index;',
    '    bool first = true;',
    '    bool item_first = true;',
    '    printf("FRAME|%u|elapsed=%u|active=", sequence, elapsed_ms);',
    ...activePrints,
    '    printf("|actions=");',
    '    for (action_index = 0U; action_index < action_count; ++action_index) {',
    '        printf("%s", action_index == 0U ? "" : ",");',
    '        print_token(actions[action_index]);',
    '    }',
    '    printf("|data=");',
    ...dataPrints,
    '    printf("|timers=");',
    ...timerPrints,
    '    printf("|history=");',
    '    first = true;',
    ...historyPrints,
    '    printf("|outputs=");',
    ...outputPrints,
    '    printf("|faults=");',
    ...faultPrints,
    ...renderXBridgesTrace(ir),
    '    printf("|effects=%u,%u", safe_outputs_applied, watchdog_kicks);',
    '    printf("|error=%u\\n", (unsigned)instance->error_status);',
    '}',
  ].join('\n');
};

export const renderDifferentialHarness = (
  ir: SemanticModel,
  steps: readonly DifferentialScenarioStep[],
): string => {
  const states = orderedStates(ir);
  const actionCapacity = Math.max(
    1,
    (states.length * 3) + (Object.keys(ir.transitions).length * 2) + 1,
  );
  return [
    '#include "sm_core.h"',
    '#include <locale.h>',
    '#include <math.h>',
    '#include <stdio.h>',
    '',
    `#define SM_TRACE_ACTION_CAPACITY ${actionCapacity}U`,
    'static const char *actions[SM_TRACE_ACTION_CAPACITY];',
    'static unsigned action_count = 0U;',
    'static bool action_overflow = false;',
    '',
    renderMcalFunctions(ir),
    '',
    'static void trace_sink(const SM_TraceEvent_t *event)',
    '{',
    '    if ((event != NULL) && (action_count < SM_TRACE_ACTION_CAPACITY)) {',
    '        actions[action_count++] = event->action;',
    '    } else {',
    '        action_overflow = true;',
    '    }',
    '}',
    '',
    renderNodeIdFunction(states),
    '',
    renderTokenFunction(),
    '',
    renderFramePrinter(ir),
    '',
    'int main(void)',
    '{',
    '    ADIA_Instance_t instance = {0};',
    '    unsigned sequence = 0U;',
    '    SM_Error_t step_error = SM_ERR_NONE;',
    '    (void)step_error;',
    '    (void)node_id;',
    '    (void)setlocale(LC_NUMERIC, "C");',
    '    action_count = 0U;',
    '    action_overflow = false;',
    '    (void)SM_Init(&instance);',
    '    SM_SetTraceSink(&instance, trace_sink);',
    '    print_frame(&instance, sequence++, 0U);',
    renderScenarioOperations(ir, steps),
    '    return action_overflow ? 2 : 0;',
    '}',
    '',
  ].join('\n');
};

const parseMap = (
  encoded: string,
  parseValue: (value: string, kind: string) => number | boolean | string | null,
): Record<string, number | boolean | string | null> => {
  const result: Record<string, number | boolean | string | null> = {};
  if (encoded === '') return result;
  for (const item of encoded.split(';')) {
    const [encodedId, kindOrValue, ...tail] = item.split(':');
    const id = decodeURIComponent(encodedId);
    if (tail.length === 0) {
      result[id] = parseValue(kindOrValue, '');
    } else {
      result[id] = parseValue(tail.join(':'), kindOrValue);
    }
  }
  return result;
};

export interface CTraceFrame extends SemanticTraceFrame {
  readonly xBridgesFaults: Readonly<Record<string, boolean>>;
}

const parseXBTraceValue = (
  shape: string,
  kind: string,
  encodedValues: string,
): XBridgesTraceValue => {
  const values = encodedValues === '' ? [] : encodedValues.split(',').map((value) =>
    kind === 'b' ? value === '1' : Number(value));
  if (shape === 's') return values[0] ?? (kind === 'b' ? false : 0);
  if (shape.startsWith('v')) return values;
  const match = /^m(\d+)x(\d+)$/.exec(shape);
  if (match === null) throw new Error(`invalid X-Bridges trace shape '${shape}'`);
  const rows = Number(match[1]);
  const columns = Number(match[2]);
  return Array.from({ length: rows }, (_, row) =>
    values.slice(row * columns, (row + 1) * columns));
};

const parseXBridgesFrame = (
  signalField: string,
  stateField: string,
  faultField: string,
): SemanticTraceFrame['xBridges'] => {
  const result: SemanticTraceFrame['xBridges'] = {};
  const ensure = (stateId: string) => result[stateId] ??= {
    signals: {}, blockState: {}, faults: [],
  };
  if (signalField !== '') {
    for (const item of signalField.split(';')) {
      const [encodedStateId, encodedSignalId, shape, kind, values] = item.split(':');
      ensure(decodeURIComponent(encodedStateId)).signals[
        decodeURIComponent(encodedSignalId)
      ] = parseXBTraceValue(shape, kind, values);
    }
  }
  if (stateField !== '') {
    for (const item of stateField.split(';')) {
      const [encodedStateId, encodedOperationId, encodedRole, shape, kind, values] = item.split(':');
      const state = ensure(decodeURIComponent(encodedStateId));
      const operationId = decodeURIComponent(encodedOperationId);
      state.blockState[operationId] ??= {};
      state.blockState[operationId][decodeURIComponent(encodedRole)] =
        parseXBTraceValue(shape, kind, values);
    }
  }
  if (faultField !== '') {
    for (const item of faultField.split(';')) {
      const [encodedStateId, encodedOperationId] = item.split(':');
      ensure(decodeURIComponent(encodedStateId)).faults.push(
        decodeURIComponent(encodedOperationId),
      );
    }
  }
  return result;
};

const parseFrame = (line: string): CTraceFrame => {
  const segments = line.split('|');
  if (segments.length !== 15 || segments[0] !== 'FRAME') {
    throw new Error(`invalid C trace line: ${line}`);
  }
  const fields = Object.fromEntries(
    segments.slice(2).map((segment) => {
      const separator = segment.indexOf('=');
      return [segment.slice(0, separator), segment.slice(separator + 1)];
    }),
  );
  const history: Record<string, string | null> = {};
  if (fields.history !== '') {
    for (const item of fields.history.split(';')) {
      const deepMarker = item.indexOf(':deep:');
      if (deepMarker >= 0) {
        const key = decodeURIComponent(item.slice(0, deepMarker));
        const encodedSnapshot = item.slice(deepMarker + ':deep:'.length);
        const encodedIds = encodedSnapshot.slice(1, -1);
        history[`${key}:deep`] = JSON.stringify(
          encodedIds === ''
            ? []
            : encodedIds.split(',').map((id) => decodeURIComponent(id)),
        );
        continue;
      }
      const separator = item.indexOf(':');
      const value = item.slice(separator + 1);
      history[decodeURIComponent(item.slice(0, separator))] =
        value === '~' ? null : decodeURIComponent(value);
    }
  }
  return {
    sequence: Number(segments[1]),
    elapsedMs: Number(fields.elapsed),
    activeStateIds: fields.active === ''
      ? []
      : fields.active.split(',').map((id) => decodeURIComponent(id)),
    actions: fields.actions === ''
      ? []
      : fields.actions.split(',').map((action) => decodeURIComponent(action)),
    data: parseMap(
      fields.data,
      (value, kind) => kind === 'b' ? value === '1' : Number(value),
    ) as Record<string, number | boolean>,
    stateTimersMs: parseMap(
      fields.timers,
      (value) => Number(value),
    ) as Record<string, number>,
    history,
    mappedOutputs: parseMap(
      fields.outputs,
      (value, kind) => kind === 'b' ? value === '1' : Number(value),
    ) as Record<string, number | boolean>,
    xBridgesFaults: parseMap(
      fields.faults,
      (value, kind) => kind === 'b' ? value === '1' : Number(value),
    ) as Record<string, boolean>,
    xBridges: parseXBridgesFrame(
      fields.xbSignals,
      fields.xbState,
      fields.xbFaults,
    ),
    ioEffects: {
      safeOutputsApplied: Number(fields.effects.split(',')[0]),
      watchdogKicks: Number(fields.effects.split(',')[1]),
    },
    error: fields.error === '0'
      ? null
      : fields.error === '2'
        ? 'TIMING: timing error'
        : fields.error === '4'
          ? 'SAFETY_VIOLATION: safety violation'
          : fields.error === '5'
            ? 'XBRIDGES_NUMERIC: X-Bridges numeric fault'
          : `C_ERROR_${fields.error}`,
  };
};

export const compileAndRunCTrace = (
  fixture: DifferentialFixture,
): CTraceFrame[] => {
  const ir = buildFixtureIr(fixture);
  const workspace = createGeneratedCodeTestWorkspace(
    `differential-${fixture.name}`,
  );
  try {
    const generated = generateCArtifacts(ir, { includeTestShims: true });
    for (const file of generated.files) {
      if (file.name.endsWith('.c') || file.name.endsWith('.h')) {
        writeFileSync(join(workspace.directory, file.name), file.content);
      }
    }
    const output = compileAndRunCProgram({
      directory: workspace.directory,
      harnessSource: renderDifferentialHarness(ir, fixture.steps),
      defines: ['SM_TRACE_ENABLED'],
    });
    if (output === null) throw new Error('host gcc is required');
    return output.trim().split(/\r?\n/).filter(Boolean).map(parseFrame);
  } catch (error) {
    const detail = error instanceof Error
      ? `${error.message}\n${'stderr' in error ? String(error.stderr ?? '') : ''}`
      : String(error);
    throw new Error(
      `C differential harness failed for '${fixture.name}': ${detail}`,
    );
  } finally {
    workspace.cleanup();
  }
};

export interface HostCompileRequest {
  packageDirectory: string;
  cStandard?: SMCStandard;
  compiler?: string;
  compilerArgs?: readonly string[];
  defines?: readonly string[];
  extraFlags?: readonly string[];
  executableName?: string;
}

export interface HostTestRunRequest {
  packageDirectory: string;
  executablePath?: string;
  args?: readonly string[];
  manifest?: SMTestManifest;
  timeoutMs?: number;
}

export interface SanitizerRunRequest {
  packageDirectory: string;
  cStandard?: SMCStandard;
  compiler?: string;
  compilerArgs?: readonly string[];
  defines?: readonly string[];
  manifest?: SMTestManifest;
  timeoutMs?: number;
  executablePath?: string;
  args?: readonly string[];
  extraFlags?: readonly string[];
}

const findPackageSourceFiles = (dir: string, baseDir: string = dir): string[] => {
  if (!existsSync(dir)) return [];
  const entries = readdirSync(dir);
  const results: string[] = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      results.push(...findPackageSourceFiles(fullPath, baseDir));
    } else if (entry.endsWith('.c') && !entry.endsWith('.test.c') && !entry.includes('sm_trace_harness')) {
      results.push(relative(baseDir, fullPath).replace(/\\/g, '/'));
    }
  }
  return results;
};

export const compileHostPackage = async (
  request: HostCompileRequest,
): Promise<ActivityEvidence> => {
  const standard = request.cStandard ?? 'c11';
  const targetExe = join(
    request.packageDirectory,
    request.executableName ?? 'host_test_runner.exe',
  );
  const sources = findPackageSourceFiles(request.packageDirectory);

  const compileArgs: string[] = [
    ...(request.compilerArgs ?? []),
    `-std=${standard}`,
    '-pedantic-errors',
    '-Wall',
    '-Wextra',
    '-Werror',
    '-Wpedantic',
    '-Wconversion',
    '-Wsign-conversion',
    '-Wshadow',
    '-Wvla',
    '-DADIA_TESTING',
    '-I.',
    '-Iproduction',
    '-Itests',
    ...(request.defines ? request.defines.map((d) => `-D${d}`) : []),
    ...(request.extraFlags ?? []),
    ...sources,
    '-o',
    targetExe,
  ];

  const toolResult = await runTool({
    executable: request.compiler ?? 'gcc',
    args: compileArgs,
    cwd: request.packageDirectory,
    versionArgs: ['--version'],
    inputFiles: sources,
  });

  if (!toolResult.available) {
    return {
      activity: 'host-compilation',
      status: 'NOT_RUN',
      summary: `Host compiler '${request.compiler ?? 'gcc'}' was not found or unavailable`,
      command: toolResult.command,
      details: { compiled: false, error: toolResult.error?.message },
    };
  }

  if (toolResult.command.exitCode !== 0) {
    return {
      activity: 'host-compilation',
      status: 'FAIL',
      summary: `Host compilation failed with exit code ${toolResult.command.exitCode}`,
      command: toolResult.command,
      details: { compiled: false, exitCode: toolResult.command.exitCode },
    };
  }

  return {
    activity: 'host-compilation',
    status: 'PASS',
    summary: 'Host compilation succeeded cleanly with strict flags',
    command: toolResult.command,
    details: { compiled: true, executablePath: targetExe },
  };
};

export const runHostTests = async (
  request: HostTestRunRequest,
): Promise<ActivityEvidence> => {
  const executable = request.executablePath ?? join(
    request.packageDirectory,
    'host_test_runner.exe',
  );

  if (!existsSync(executable)) {
    return {
      activity: 'host-runtime',
      status: 'NOT_RUN',
      summary: `Test runner executable not found: ${executable}`,
      command: null,
      details: { executed: false },
    };
  }

  const isJs = executable.endsWith('.js');
  const spawnExe = isJs ? process.execPath : executable;
  const spawnArgs = isJs ? [executable, ...(request.args ?? [])] : [...(request.args ?? [])];

  const toolResult = await runTool({
    executable: spawnExe,
    args: spawnArgs,
    cwd: request.packageDirectory,
    timeoutMs: request.timeoutMs ?? 30_000,
  });

  if (toolResult.timedOut) {
    return {
      activity: 'host-runtime',
      status: 'FAIL',
      summary: 'Host test execution timed out',
      command: toolResult.command,
      details: { timedOut: true },
    };
  }

  const caseResults = new Map<string, { status: string; count: number }>();
  const stdoutLines = toolResult.command.stdout.split(/\r?\n/);

  for (const line of stdoutLines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        const parsed = JSON.parse(trimmed) as { case_id?: string; caseId?: string; status?: string };
        const id = parsed.case_id ?? parsed.caseId;
        const status = parsed.status ?? 'UNKNOWN';
        if (id) {
          const existing = caseResults.get(id);
          if (existing) {
            existing.count += 1;
          } else {
            caseResults.set(id, { status, count: 1 });
          }
        }
      } catch {
        // ignore malformed JSON line
      }
    } else {
      const match = trimmed.match(/\[ADIA_TEST\] RESULT:\s+(\S+)\s+(PASS|FAIL)/);
      if (match) {
        const id = match[1];
        const status = match[2];
        const existing = caseResults.get(id);
        if (existing) {
          existing.count += 1;
        } else {
          caseResults.set(id, { status, count: 1 });
        }
      }
    }
  }

  if (request.manifest) {
    const applicableCases = request.manifest.cases
      .filter((c) => c.applicability.status === 'applicable')
      .map((c) => c.id);

    const missing = applicableCases.filter((id) => !caseResults.has(id));
    const duplicates = [...caseResults.entries()]
      .filter(([_, v]) => v.count > 1)
      .map(([id]) => id);

    if (missing.length > 0 || duplicates.length > 0) {
      const issues: string[] = [];
      if (missing.length > 0) issues.push(`Missing test cases: ${missing.join(', ')}`);
      if (duplicates.length > 0) issues.push(`Duplicate test cases: ${duplicates.join(', ')}`);

      return {
        activity: 'host-runtime',
        status: 'FAIL',
        summary: `Manifest test case inventory mismatch. ${issues.join('; ')}`,
        command: toolResult.command,
        details: { missing, duplicates, results: Object.fromEntries(caseResults) },
      };
    }
  }

  const failedTests = [...caseResults.entries()]
    .filter(([_, v]) => v.status === 'FAIL')
    .map(([id]) => id);

  if (toolResult.command.exitCode !== 0 || failedTests.length > 0) {
    return {
      activity: 'host-runtime',
      status: 'FAIL',
      summary: `Host test execution failed (exit code: ${toolResult.command.exitCode}, failed tests: ${failedTests.length})`,
      command: toolResult.command,
      details: {
        failedCount: failedTests.length,
        failedTests,
        results: Object.fromEntries(caseResults),
      },
    };
  }

  return {
    activity: 'host-runtime',
    status: 'PASS',
    summary: `All ${caseResults.size} test cases passed cleanly with zero exit code`,
    command: toolResult.command,
    details: {
      passedCount: caseResults.size,
      results: Object.fromEntries(caseResults),
    },
  };
};

export const runSanitizers = async (
  request: SanitizerRunRequest,
): Promise<ActivityEvidence> => {
  let executable = request.executablePath;

  if (!executable) {
    const compileResult = await compileHostPackage({
      packageDirectory: request.packageDirectory,
      cStandard: request.cStandard,
      compiler: request.compiler,
      compilerArgs: request.compilerArgs,
      defines: request.defines,
      extraFlags: [
        '-fsanitize=address,undefined',
        '-fno-omit-frame-pointer',
        ...(request.extraFlags ?? []),
      ],
      executableName: 'sanitizer_test_runner.exe',
    });

    if (compileResult.status === 'NOT_RUN') {
      return {
        activity: 'sanitizers',
        status: 'NOT_RUN',
        summary: compileResult.summary,
        command: compileResult.command,
        details: compileResult.details,
      };
    }

    if (compileResult.status === 'FAIL') {
      const errText = (compileResult.command?.stderr ?? '') + (compileResult.command?.stdout ?? '');
      const isUnsupported = /unrecognized|not supported|unrecognized command-line option|cannot find -l(asan|ubsan)/i.test(errText);

      if (isUnsupported) {
        return {
          activity: 'sanitizers',
          status: 'NOT_RUN',
          summary: 'Sanitizer flags (-fsanitize=address,undefined) not supported by the host compiler',
          command: compileResult.command,
          details: { supported: false, error: errText },
        };
      }

      return {
        activity: 'sanitizers',
        status: 'FAIL',
        summary: 'Sanitizer compilation failed',
        command: compileResult.command,
        details: compileResult.details,
      };
    }

    executable = (compileResult.details as { executablePath: string }).executablePath;
  }

  const isJs = executable.endsWith('.js');
  const spawnExe = isJs ? process.execPath : executable;
  const spawnArgs = isJs ? [executable, ...(request.args ?? [])] : [...(request.args ?? [])];

  const runResult = await runTool({
    executable: spawnExe,
    args: spawnArgs,
    cwd: request.packageDirectory,
    timeoutMs: request.timeoutMs ?? 30_000,
  });

  const combinedOutput = runResult.command.stdout + '\n' + runResult.command.stderr;
  const hasViolation = /AddressSanitizer:|runtime error:|UndefinedBehaviorSanitizer/i.test(combinedOutput);

  if (runResult.command.exitCode !== 0 || hasViolation || runResult.timedOut) {
    return {
      activity: 'sanitizers',
      status: 'FAIL',
      summary: hasViolation
        ? 'Sanitizer violation detected during execution'
        : `Sanitizer execution failed with exit code ${runResult.command.exitCode}`,
      command: runResult.command,
      details: {
        violation: hasViolation,
        exitCode: runResult.command.exitCode,
        timedOut: runResult.timedOut,
      },
    };
  }

  return {
    activity: 'sanitizers',
    status: 'PASS',
    summary: 'Execution under AddressSanitizer and UndefinedBehaviorSanitizer passed without violations',
    command: runResult.command,
    details: { clean: true },
  };
};
