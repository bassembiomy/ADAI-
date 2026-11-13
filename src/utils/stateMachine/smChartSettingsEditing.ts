import type {
  ExternalFunctionDef,
  FixedPointFormat,
  FixedPointRounding,
  StateData,
  TransitionData,
  VariableDef,
  VariableType,
} from '../../types/sm_types';
import { fixedRange, isValidFixedPoint } from './smFixedPoint';
import { codePrefixProblem, DEFAULT_CODE_PREFIX, prefixedFileName } from './smCodePrefix';
import { validateExternalFunctionDefs } from './smExternalFunctions';

/**
 * Pure helpers behind the fixed-point variable controls, the chart settings (rounding, code prefix)
 * and the external functions editor. Validation reuses the engine's own checks so the editor and
 * Validate / Generate C/H agree.
 */

export const FIXED_POINT_ROUNDINGS: readonly FixedPointRounding[] = ['floor', 'nearest'];

export const DEFAULT_FIXED_POINT: FixedPointFormat = { signed: true, wordLength: 16, fractionLength: 8 };

/** The fixed-point format a variable of `type` carries: the existing one (or a default) for fixdt, none otherwise. */
export const fixedPointForType = (type: VariableType, existing?: FixedPointFormat): FixedPointFormat | undefined =>
  type === 'fixdt' ? { ...(existing ?? DEFAULT_FIXED_POINT) } : undefined;

/** Applies a new type to a variable: fixdt gets a format, every other type drops it. */
export const withVariableType = (variable: VariableDef, type: VariableType): VariableDef => {
  const { fixedPoint: _dropped, ...rest } = variable;
  const fixedPoint = fixedPointForType(type, variable.fixedPoint);
  return fixedPoint === undefined ? { ...rest, type } : { ...rest, type, fixedPoint };
};

/** Returns the validation message for a proposed fraction length input, or null when it is valid. */
export const fractionLengthProblem = (text: string, wordLength: number): string | null => {
  const trimmed = text.trim();
  const message = `Fraction length must be an integer from 0 to ${wordLength}.`;
  if (!/^-?\d+$/.test(trimmed)) return message;
  const value = Number(trimmed);
  if (value < 0 || value > wordLength) return message;
  return null;
};

/** Changes the word length; a fraction length that no longer fits is reduced to the word length. */
export const changeWordLength = (
  format: FixedPointFormat,
  wordLength: FixedPointFormat['wordLength'],
): { format: FixedPointFormat; fractionClamped: boolean } => {
  const fractionClamped = format.fractionLength > wordLength;
  return {
    format: { ...format, wordLength, fractionLength: fractionClamped ? wordLength : format.fractionLength },
    fractionClamped,
  };
};

/** Human-readable range and resolution of a fixed-point format. */
export const describeFixedPoint = (format: FixedPointFormat): string => {
  if (!isValidFixedPoint(format)) return 'invalid format';
  const { min, max } = fixedRange(format);
  const scale = 2 ** -format.fractionLength;
  const text = (stored: bigint): string => String(Number(stored) * scale);
  return `fixdt(${format.signed ? 1 : 0}, ${format.wordLength}, ${format.fractionLength}): ${text(min)} to ${text(max)}, step ${scale}`;
};

/** Message for a proposed code prefix: null when valid (an empty text means the default prefix). */
export const codePrefixInputProblem = (text: string): string | null =>
  text === '' ? null : codePrefixProblem(text);

/** The prefix to store: undefined for the default prefix, so old projects stay byte-identical. */
export const storedCodePrefix = (text: string): string | undefined =>
  text === '' || text === DEFAULT_CODE_PREFIX ? undefined : text;

/** Generated file names the prefix produces, for the hint under the input. */
export const codePrefixFileHints = (prefix: string | undefined): string[] => {
  const effective = prefix === undefined || prefix === '' ? DEFAULT_CODE_PREFIX : prefix;
  return ['sm_core.c', 'sm_core.h'].map((name) => prefixedFileName(name, effective));
};

/** A new external function with unused default names (ext_fn_1 / ext_fn_1.h) and a valid simulation expression. */
export const newExternalFunction = (
  functions: readonly ExternalFunctionDef[],
  id: string,
  reserved: ReadonlySet<string> = new Set(),
): ExternalFunctionDef => {
  const used = new Set([...functions.map((def) => def.name), ...reserved]);
  let index = 1;
  while (used.has(`ext_fn_${index}`)) index += 1;
  return {
    id,
    name: `ext_fn_${index}`,
    header: `ext_fn_${index}.h`,
    returnType: 'int32',
    params: [],
    simulation: '0',
  };
};

/** Next unused parameter name: arg1, arg2, ... */
export const nextParamName = (def: ExternalFunctionDef): string => {
  const used = new Set(def.params.map((param) => param.name));
  let index = 1;
  while (used.has(`arg${index}`)) index += 1;
  return `arg${index}`;
};

/** Names an external function may not take: variable names and ids, event names. */
export const externalFunctionReservedNames = (
  variables: readonly Pick<VariableDef, 'id' | 'name'>[],
  events: readonly { name: string }[],
): Set<string> => {
  const reserved = new Set<string>();
  for (const variable of variables) { reserved.add(variable.name); reserved.add(variable.id); }
  for (const event of events) reserved.add(event.name);
  return reserved;
};

/**
 * Validates `draft` as it would sit in the chart (replacing the declaration with the same id, or
 * appended) using the engine's declaration checks. Returns the messages (empty when valid).
 */
export const validateExternalFunctionDraft = (
  functions: readonly ExternalFunctionDef[],
  draft: ExternalFunctionDef,
  reserved: ReadonlySet<string>,
): string[] => {
  const exists = functions.some((def) => def.id === draft.id);
  const next = exists ? functions.map((def) => (def.id === draft.id ? draft : def)) : [...functions, draft];
  return validateExternalFunctionDefs(next, reserved)
    .filter((diagnostic) => diagnostic.elementId === draft.id)
    .map((diagnostic) => diagnostic.message.replace(/^External function '[^']*': /, ''));
};

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** True when the C-like action or condition text calls `name(`. */
export const textCallsFunction = (text: string | undefined, name: string): boolean =>
  typeof text === 'string' && name !== '' && new RegExp(`(^|[^A-Za-z0-9_])${escapeRegExp(name)}\\s*\\(`).test(text);

/** Where the chart calls the function: transition guards / actions and state entry / during / exit / internal text. */
export const externalFunctionCallSites = (
  name: string,
  states: readonly Pick<StateData, 'id' | 'name' | 'entry' | 'during' | 'exit' | 'internalTransitions'>[],
  transitions: readonly Pick<TransitionData, 'id' | 'condition' | 'action'>[],
): string[] => {
  const sites: string[] = [];
  for (const state of states) {
    for (const field of ['entry', 'during', 'exit', 'internalTransitions'] as const) {
      if (textCallsFunction(state[field], name)) sites.push(`state ${state.name} ${field}`);
    }
  }
  transitions.forEach((transition, index) => {
    if (textCallsFunction(transition.condition, name)) sites.push(`transition ${index + 1} condition`);
    if (textCallsFunction(transition.action, name)) sites.push(`transition ${index + 1} action`);
  });
  return sites;
};
