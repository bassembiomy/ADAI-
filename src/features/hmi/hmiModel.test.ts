import { describe, expect, it } from 'vitest';
import { HMI_CATALOG, createHmiComponent } from './hmiCatalog';
import { normalizeHmiComponents, parseHmiVariableValue, validateHmiInput } from './hmiModel';
import type { VariableDef } from '../../types/sm_types';

const variable: VariableDef = { id: 'v', name: 'V', type: 'bool', initialValue: 'false', currentValue: false, visibleInScope: false };
describe('HMI binding model', () => {
  it('rejects variable write restrictions in the shared command validator', () => {
    for (const flag of [{ readOnly: true }, { writable: false }]) {
      expect(validateHmiInput({ sourceId: 'c', variableId: 'v', value: true }, [{ ...variable, ...flag }], []).accepted).toBe(false);
    }
  });
  it('repairs malformed legacy enums and nullable bindings', () => {
    const diagnostics: string[] = [];
    const [component] = normalizeHmiComponents([{ type: 'buzzer', soundType: 'invalid', icon: {}, color: 'purple', pressVariableId: {}, cursorVariableId: null, oledTempVarId: 4 }], diagnostics);
    expect(component.soundType).toBeUndefined();
    expect(component.icon).toBeUndefined();
    expect(component.color).toBeUndefined();
    expect(component.pressVariableId).toBeUndefined();
    expect(component.cursorVariableId).toBeNull();
    expect(component.oledTempVarId).toBeUndefined();
    expect(diagnostics.length).toBeGreaterThan(0);
  });
  it('repairs layout cycles, invalid parents and unusable tab membership', () => {
    const diagnostics: string[] = [];
    const components = normalizeHmiComponents([
      { type: 'tabs', id: 'tabs', tabs: [{ id: 'a', label: 'A' }, { id: 'a', label: 'Duplicate' }, { id: '', label: 'Empty' }], parentId: 'panel' },
      { type: 'panel', id: 'panel', parentId: 'tabs', tabId: 'missing' },
      { type: 'lamp', id: 'lamp', parentId: 'tabs', tabId: 'missing' },
      { type: 'tabs', id: 'empty', tabs: [] },
      { type: 'lamp', id: 'orphan', parentId: 'lamp', tabId: 'a' },
    ], diagnostics);
    expect(components[0].tabs).toEqual([{ id: 'a', label: 'A' }]);
    expect(components[0].parentId).toBeUndefined();
    expect(components[1].tabId).toBe('a');
    expect(components[2].tabId).toBe('a');
    expect(components[3].tabs).toEqual([{ id: 'tab-1', label: 'Tab 1' }]);
    expect(components[4].parentId).toBeUndefined();
    expect(components[4].tabId).toBeUndefined();
    expect(diagnostics.length).toBeGreaterThan(0);
  });
  it('parses boolean text deliberately and rejects ambiguous inputs', () => {
    for (const value of ['true', '1', true, 1]) expect(parseHmiVariableValue(variable, value)).toEqual({ accepted: true, value: true });
    for (const value of ['false', '0', false, 0]) expect(parseHmiVariableValue(variable, value)).toEqual({ accepted: true, value: false });
    for (const value of ['', 'yes', 2, Infinity]) expect(parseHmiVariableValue(variable, value).accepted).toBe(false);
  });
  it('respects integer overflow policy and rejects nonfinite numeric input', () => {
    expect(parseHmiVariableValue({ ...variable, type: 'uint8' }, '300')).toEqual({ accepted: true, value: 255 });
    expect(parseHmiVariableValue({ ...variable, type: 'uint8', overflowPolicy: 'error' }, '300').accepted).toBe(false);
    for (const value of ['', 'NaN', Infinity]) expect(parseHmiVariableValue({ ...variable, type: 'double' }, value).accepted).toBe(false);
  });
  it('checks external ownership, unknown bindings and release values', () => {
    const command = { sourceId: 'control', variableId: 'v', value: 'true', releaseValue: 'bad' };
    expect(validateHmiInput(command, [variable], ['v']).accepted).toBe(false);
    expect(validateHmiInput({ ...command, variableId: 'missing' }, [variable], []).accepted).toBe(false);
    expect(validateHmiInput(command, [variable], []).accepted).toBe(false);
    expect(validateHmiInput({ ...command, releaseValue: false }, [variable], [])).toMatchObject({ accepted: true, value: true });
  });
  it('contains every legacy and approved new component exactly once', () => {
    expect(HMI_CATALOG).toHaveLength(49);
    expect(new Set(HMI_CATALOG.map(entry => entry.type)).size).toBe(49);
    const approved = 'checkbox combo-box radio-group rocker-switch slide-switch knob vertical-slider latching-button pulse-button simulation-command half-gauge quarter-gauge linear-gauge vertical-gauge dashboard-scope xy-plot multi-state-image active-state-indicator alarm-list progress-bar thermometer tank-level seven-segment label image panel tabs'.split(' ');
    expect(approved.every(type => HMI_CATALOG.some(entry => entry.type === type))).toBe(true);
    expect(HMI_CATALOG.find(entry => entry.type === 'mode-icon')?.role).toBe('input');
    for (const entry of HMI_CATALOG) expect(createHmiComponent(entry.type, 'id')).toMatchObject({ type: entry.type, id: 'id', width: entry.width, height: entry.height });
  });
  it('preserves legacy configuration and repairs unsafe geometry with diagnostics', () => {
    const diagnostics: string[] = [];
    const legacy = { id: 'old', type: 'oled', name: 'Legacy', width: -1, height: NaN, x: Infinity, y: 7, oledTitle: 'Machine', oledIndicatorVarIds: ['v'], variableId: 'v' };
    const result = normalizeHmiComponents([legacy, { type: 'unknown' }, null], diagnostics);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: 'old', name: 'Legacy', y: 7, oledTitle: 'Machine', oledIndicatorVarIds: ['v'], variableId: 'v', writable: false });
    expect(result[0].width).toBeGreaterThan(0);
    expect(Number.isFinite(result[0].x)).toBe(true);
    expect(diagnostics).toHaveLength(2);
    expect(normalizeHmiComponents([{ id: 'toggle', type: 'toggle' }])[0].writable).toBe(true);
  });
  it('normalizes malformed optional collections before rendering', () => {
    const [component] = normalizeHmiComponents([{ type: 'combo-box', options: [null, { label: 'OK', value: 1 }, { label: 'bad', value: Infinity }], tabs: 'bad', variableIds: [null, 'v'], step: NaN }]);
    expect(component.options).toEqual([{ label: 'OK', value: 1 }]);
    expect(component.tabs).toBeUndefined();
    expect(component.variableIds).toEqual(['v']);
    expect(component.step).toBe(1);
  });
});
