import { execFileSync } from 'child_process';
import { writeFileSync } from 'fs';
import { join } from 'path';
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
import type { SemanticTraceFrame } from './smTrace';

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
    'sm_core.c',
    'sm_safety.c',
    'sm_user_logic.c',
    ...(options.additionalSources ?? []),
    harnessName,
    '-o',
    executable,
  ], { cwd: options.directory, stdio: 'pipe' });
  return execFileSync(executable, [], {
    cwd: options.directory,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
};

const orderedStates = (ir: SemanticModel): SemanticState[] =>
  Object.values(ir.states).sort(
    (left, right) =>
      left.activityIndex - right.activityIndex || left.id.localeCompare(right.id),
  );

const orderedLayers = (ir: SemanticModel): SemanticLayer[] =>
  Object.values(ir.layers).sort((left, right) => {
    const leftSlot = left.activeSlot ?? Number.MAX_SAFE_INTEGER;
    const rightSlot = right.activeSlot ?? Number.MAX_SAFE_INTEGER;
    return leftSlot - rightSlot || left.id.localeCompare(right.id);
  });

const orderedVariables = (ir: SemanticModel): SemanticVariable[] =>
  Object.values(ir.variables).sort((left, right) =>
    left.id.localeCompare(right.id));

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
  const frames = [observeFrame(initializeRuntime(runtime), observation)];
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
    '    printf("|effects=%u,%u", safe_outputs_applied, watchdog_kicks);',
    '    printf("|error=%u\\n", (unsigned)instance->error_status);',
    '}',
  ].join('\n');
};

const renderHarness = (
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
    '    SM_SetTraceSink(&instance, trace_sink);',
    '    action_count = 0U;',
    '    action_overflow = false;',
    '    (void)SM_Init(&instance);',
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

const parseFrame = (line: string): SemanticTraceFrame => {
  const segments = line.split('|');
  if (segments.length !== 11 || segments[0] !== 'FRAME') {
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
    ioEffects: {
      safeOutputsApplied: Number(fields.effects.split(',')[0]),
      watchdogKicks: Number(fields.effects.split(',')[1]),
    },
    error: fields.error === '0'
      ? null
      : fields.error === '4'
        ? 'SAFETY_VIOLATION: safety violation'
        : `C_ERROR_${fields.error}`,
  };
};

export const compileAndRunCTrace = (
  fixture: DifferentialFixture,
): SemanticTraceFrame[] => {
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
      harnessSource: renderHarness(ir, fixture.steps),
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
