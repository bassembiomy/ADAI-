import type { VariableDef } from '../../types/sm_types';
import type { HmiComponent } from '../../types/sysml_types';
import { coerceTypedValue } from '../../utils/stateMachine/smTypedValue';
import { createHmiComponent, getHmiDefinition } from './hmiCatalog';

export interface HmiInputCommand {
  sourceId: string;
  variableId: string;
  value: number | boolean | string;
  mode?: 'set' | 'press' | 'release' | 'pulse';
  releaseValue?: number | boolean | string;
}
export interface HmiInputResult { accepted: boolean; error?: string }
export interface HmiRuntimeSnapshot {
  running: boolean;
  time: number;
  activeStateIds: string[];
  states: { id: string; name: string }[];
  samples: { time: number; values: Record<string, number | boolean> }[];
  resetVersion: number;
}
export type HmiParsedValue = { accepted: true; value: number | boolean } | { accepted: false; error: string };
export function parseHmiVariableValue(variable: VariableDef, value: number | boolean | string): HmiParsedValue {
  const text = typeof value === 'string' ? value.trim().toLowerCase() : value;
  let parsed: number | boolean;
  if (variable.type === 'bool') {
    if (text === true || text === 1 || text === 'true' || text === '1') parsed = true;
    else if (text === false || text === 0 || text === 'false' || text === '0') parsed = false;
    else return { accepted: false, error: 'Boolean input must be true, false, 1 or 0.' };
  } else {
    if (text === '') return { accepted: false, error: 'A numeric value is required.' };
    parsed = Number(text);
    if (!Number.isFinite(parsed)) return { accepted: false, error: 'Input must be a finite number.' };
  }
  const result = coerceTypedValue(parsed, variable.type, variable.overflowPolicy ?? 'saturate');
  return result.error ? { accepted: false, error: result.error } : { accepted: true, value: result.value };
}
export function validateHmiInput(command: HmiInputCommand, variables: readonly VariableDef[], externalOwnedVariableIds: readonly string[]): HmiParsedValue {
  const variable = variables.find(candidate => candidate.id === command.variableId);
  if (!variable) return { accepted: false, error: 'Choose an existing variable binding.' };
  const permission = variable as VariableDef & { readOnly?: boolean; writable?: boolean };
  if (permission.readOnly === true || permission.writable === false) return { accepted: false, error: 'This variable is read-only.' };
  if (externalOwnedVariableIds.includes(variable.id)) return { accepted: false, error: 'This variable is driven by external I/O.' };
  if (command.releaseValue !== undefined) {
    const release = parseHmiVariableValue(variable, command.releaseValue);
    if (!release.accepted) return release;
  }
  return parseHmiVariableValue(variable, command.value);
}
/** Known legacy fields survive migration; unsupported entries are reported and omitted. */
export function normalizeHmiComponents(raw: unknown, diagnostics: string[] = []): HmiComponent[] {
  if (!Array.isArray(raw)) { if (raw != null) diagnostics.push('HMI components must be an array.'); return []; }
  const ids = new Set<string>();
  const components = raw.flatMap((item, index) => {
    if (!item || typeof item !== 'object' || !getHmiDefinition((item as Record<string, unknown>).type as string)) {
      diagnostics.push(`Unsupported HMI component at index ${index}.`); return [];
    }
    const source = item as Record<string, unknown>;
    const entry = getHmiDefinition(source.type as string)!;
    let id = typeof source.id === 'string' && source.id ? source.id : `hmi-${index + 1}`;
    while (ids.has(id)) id += '-copy';
    ids.add(id);
    const defaults = createHmiComponent(entry.type, id);
    const component = { ...defaults, ...source, id, type: entry.type } as HmiComponent;
    component.name = typeof source.name === 'string' ? source.name : defaults.name;
    component.variableId = typeof source.variableId === 'string' ? source.variableId : null;
    for (const [key, allowed] of [['soundType', ['sine', 'square', 'sawtooth', 'triangle']], ['icon', ['none', 'power', 'play', 'light']], ['color', ['orange', 'green', 'red', 'blue', 'yellow', 'grey']]] as const) {
      if (source[key] !== undefined && !allowed.some(value => value === source[key])) {
        delete component[key]; diagnostics.push(`HMI ${id}: removed invalid ${key}.`);
      }
    }
    for (const key of ['cursorVariableId', 'pressVariableId', 'oledModeVarId', 'oledTempVarId', 'oledTimeVarId', 'oledStateVarId', 'oledSteamVarId', 'oledHeatVarId', 'oledFanVarId', 'oledLightVarId', 'oledDuoVarId', 'oledProgressVarId'] as const) {
      if (source[key] !== undefined && source[key] !== null && typeof source[key] !== 'string') {
        delete component[key]; diagnostics.push(`HMI ${id}: removed invalid ${key}.`);
      }
    }
    for (const key of ['min', 'max', 'step', 'precision', 'alarmThreshold'] as const) {
      if (typeof source[key] !== 'number' || !Number.isFinite(source[key]) || (key === 'step' && (source[key] as number) <= 0) || (key === 'precision' && (!Number.isInteger(source[key]) || (source[key] as number) < 0 || (source[key] as number) > 20))) {
        component[key] = defaults[key];
      }
    }
    if (component.min !== undefined && component.max !== undefined && component.min >= component.max) { component.min = defaults.min; component.max = defaults.max; }
    for (const key of ['unit', 'text', 'imageUrl', 'stateId', 'parentId', 'tabId', 'iconEmoji', 'targetValue', 'oledModeNames', 'oledTitle'] as const) {
      if (typeof source[key] !== 'string') delete component[key];
    }
    for (const key of ['variableIds', 'hybridValues', 'encoderValues', 'oledIndicatorEmojis', 'oledIndicatorLabels'] as const) {
      component[key] = Array.isArray(source[key]) ? source[key].filter((value): value is string => typeof value === 'string') : undefined;
    }
    component.oledIndicatorVarIds = Array.isArray(source.oledIndicatorVarIds) ? source.oledIndicatorVarIds.filter((value): value is string | null => value === null || typeof value === 'string') : undefined;
    component.options = Array.isArray(source.options) ? source.options.filter((option): option is { label: string; value: number | boolean; imageUrl?: string } => !!option && typeof option === 'object' && typeof option.label === 'string' && (typeof option.value === 'boolean' || (typeof option.value === 'number' && Number.isFinite(option.value))))
      .map(option => ({ label: option.label, value: option.value, ...(typeof option.imageUrl === 'string' ? { imageUrl: option.imageUrl } : {}) })) : undefined;
    component.tabs = Array.isArray(source.tabs) ? source.tabs.filter((tab): tab is { id: string; label: string } => !!tab && typeof tab === 'object' && typeof tab.id === 'string' && typeof tab.label === 'string') : defaults.tabs;
    if (component.tabs) {
      const tabIds = new Set<string>();
      component.tabs = component.tabs.filter(tab => {
        if (!tab.id.trim() || tabIds.has(tab.id)) { diagnostics.push(`HMI ${id}: removed empty or duplicate tab ID.`); return false; }
        tabIds.add(tab.id); return true;
      });
      if (entry.type === 'tabs' && !component.tabs.length) { component.tabs = defaults.tabs; diagnostics.push(`HMI ${id}: restored default tab.`); }
    }
    if (!['start', 'pause', 'resume', 'step', 'reset'].includes(source.command as string)) component.command = defaults.command;
    for (const key of ['activeValue', 'inactiveValue'] as const) {
      if (typeof source[key] !== 'boolean' && !(typeof source[key] === 'number' && Number.isFinite(source[key]))) delete component[key];
    }
    for (const key of ['x', 'y', 'width', 'height'] as const) {
      if (typeof source[key] !== 'number' || !Number.isFinite(source[key]) || ((key === 'width' || key === 'height') && (source[key] as number) <= 0)) component[key] = defaults[key];
    }
    component.writable = entry.role === 'input' && source.writable !== false;
    return [component];
  });
  const byId = new Map(components.map(component => [component.id, component]));
  for (const component of components) {
    if (component.parentId) {
      const parent = byId.get(component.parentId);
      const visited = new Set([component.id]);
      let ancestor = parent;
      let cycle = false;
      while (ancestor) {
        if (visited.has(ancestor.id)) { cycle = true; break; }
        visited.add(ancestor.id);
        ancestor = ancestor.parentId ? byId.get(ancestor.parentId) : undefined;
      }
      if (!parent || !['panel', 'tabs'].includes(parent.type) || cycle) {
        diagnostics.push(`HMI ${component.id}: removed invalid or cyclic parent.`);
        delete component.parentId;
      }
    }
    const parent = component.parentId ? byId.get(component.parentId) : undefined;
    if (parent?.type === 'tabs') {
      if (!parent.tabs?.some(tab => tab.id === component.tabId)) {
        component.tabId = parent.tabs?.[0]?.id;
        diagnostics.push(`HMI ${component.id}: selected first parent tab.`);
      }
    } else if (component.tabId !== undefined) {
      delete component.tabId; diagnostics.push(`HMI ${component.id}: removed tab without a tabs parent.`);
    }
  }
  return components;
}
