// @vitest-environment jsdom
import React, { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { HmiWidget, HmiWorkspace, type HmiRuntime } from './HmiWorkspace';
import { createHmiComponent } from '../../features/hmi/hmiCatalog';
import { HMI_GLYPHS } from '../../features/hmi/hmiGlyphs';
import type { HmiComponent } from '../../types/sysml_types';
import type { VariableDef } from '../../types/sm_types';

afterEach(cleanup);
const runtime: HmiRuntime = { running: true, time: 1, activeStateIds: [], states: [], samples: [], resetVersion: 0 };
const variable = (id: string, currentValue: number | boolean, type: VariableDef['type'] = 'double'): VariableDef => ({ id, name: id, type, initialValue: String(currentValue), currentValue, visibleInScope: true });
const comp = (type: HmiComponent['type'], patch: Partial<HmiComponent> = {}): HmiComponent => ({ ...createHmiComponent(type, type), variableId: 'v', ...patch });
const widget = (c: HmiComponent, variables: VariableDef[] = [variable('v', 12.5)]) => render(<HmiWidget comp={c} variables={variables} runtime={runtime} editMode={false} owned={new Set()} onInput={() => ({ accepted: true })} onSimulationCommand={vi.fn()} />).container;

describe('segment and matrix displays', () => {
  it.each([['seven-segment', '7'], ['fourteen-segment', '14'], ['sixteen-segment', '16']] as const)('%s renders fixed digit cells with lit segments', (type, style) => {
    const root = widget(comp(type, { digitCount: 6, precision: 1 }));
    const svg = root.querySelector(`svg[data-segment-style="${style}"]`)!;
    expect(svg).not.toBeNull();
    expect(svg.getAttribute('aria-label')).toBe('12.5');
    expect(svg.querySelectorAll('[data-segment-cell]')).toHaveLength(6);
    expect(svg.querySelectorAll('[data-segment-on="true"]').length).toBeGreaterThan(0);
    expect(svg.querySelectorAll('[data-dp-on="true"]')).toHaveLength(1);
  });
  it('keeps auto width for legacy seven-segment components and applies italic skew', () => {
    const root = widget(comp('seven-segment', { precision: 0, segmentSkew: true }), [variable('v', 42)]);
    expect(root.querySelectorAll('[data-segment-cell]')).toHaveLength(2);
    expect(root.querySelector('[data-segment-skew="true"]')).not.toBeNull();
  });
  it('renders alphanumeric templates on 14-segment displays', () => {
    const root = widget(comp('fourteen-segment', { digitCount: 8, text: 'SPD {value}', precision: 0 }), [variable('v', 30)]);
    expect(root.querySelector('svg[data-segment-style="14"]')!.getAttribute('aria-label')).toBe('SPD 30');
  });
  it('applies the LCD theme palette to display glass', () => {
    const root = widget(comp('sixteen-segment', { lcdTheme: 'blue-negative' }));
    const glass = root.querySelector('[data-lcd-theme="blue-negative"]') as HTMLElement;
    expect(glass).not.toBeNull();
    expect(root.innerHTML).toContain(HMI_GLYPHS.lcdThemes['blue-negative'].on);
  });
  it('renders dot-matrix characters dot by dot', () => {
    const root = widget(comp('dot-matrix', { digitCount: 1, text: 'I', variableId: null }), []);
    const lit = HMI_GLYPHS.font5x7.I.reduce((sum, row) => sum + row.toString(2).split('1').length - 1, 0);
    expect(root.querySelectorAll('[data-dot-on="true"]')).toHaveLength(lit);
  });
});

describe('LCD types', () => {
  it('renders the numeric LCD with its theme', () => {
    const root = widget(comp('lcd', { lcdTheme: 'amber', unit: 'bar' }));
    expect(root.querySelector('[data-lcd-theme="amber"]')).not.toBeNull();
    expect(root.textContent).toContain('12.50 bar');
  });
  it('renders a character LCD with rows × columns cells and formatted lines', () => {
    const root = widget(comp('character-lcd', { name: 'Boiler', lcdRows: 2, lcdColumns: 16, lcdLines: ['{name}', 'T={value}{unit}'], unit: 'C', precision: 1 }));
    expect(root.querySelectorAll('[data-lcd-cell]')).toHaveLength(32);
    expect(screen.getByRole('img', { name: /Boiler\s+T=12\.5C/ })).toBeTruthy();
  });
  it('renders a segment LCD with digits and annunciators driven by their own variables', () => {
    const root = widget(comp('segment-lcd', { annunciators: [{ icon: 'flame', variableId: 'heat', label: 'Heat' }, { icon: 'snowflake', variableId: 'cool', label: 'Cool' }] }), [variable('v', 88), variable('heat', true, 'bool'), variable('cool', false, 'bool')]);
    expect(root.querySelector('[data-annunciator="flame"]')!.getAttribute('data-on')).toBe('true');
    expect(root.querySelector('[data-annunciator="snowflake"]')!.getAttribute('data-on')).toBe('false');
    expect(root.querySelectorAll('[data-segment-cell]')).toHaveLength(4);
  });
  it('lights LED bar segments in proportion to the value', () => {
    const root = widget(comp('led-bar', { barSegments: 20, min: 0, max: 100 }), [variable('v', 25)]);
    expect(root.querySelectorAll('[data-bar-segment]')).toHaveLength(20);
    expect(root.querySelectorAll('[data-bar-segment][data-on="true"]')).toHaveLength(5);
  });
});

describe('vector icons on indicators', () => {
  it.each(['lamp', 'led', 'icon-indicator'] as const)('%s shows the chosen vector icon and its active state', type => {
    const off = widget(comp(type, { icon: 'fan' }), [variable('v', false, 'bool')]);
    expect(off.querySelector('svg[data-icon="fan"]')).not.toBeNull();
    expect(off.querySelector('[data-active]')!.getAttribute('data-active')).toBe('false');
    cleanup();
    const on = widget(comp(type, { icon: 'fan' }), [variable('v', true, 'bool')]);
    expect(on.querySelector('[data-active]')!.getAttribute('data-active')).toBe('true');
  });
  it('mode icons use the vector icon unless a saved emoji overrides it', () => {
    expect(widget(comp('mode-icon', { icon: 'steam' }), [variable('v', 0)]).querySelector('svg[data-icon="steam"]')).not.toBeNull();
    cleanup();
    const legacy = widget(comp('mode-icon', { icon: 'steam', iconEmoji: '💧' }), [variable('v', 0)]);
    expect(legacy.textContent).toContain('💧');
  });
  it('gauges draw ticks and a value arc', () => {
    const root = widget(comp('gauge'), [variable('v', 40)]);
    expect(root.querySelectorAll('[data-gauge-tick]').length).toBeGreaterThanOrEqual(11);
    expect(root.querySelector('[data-gauge-value]')).not.toBeNull();
  });
});

function Harness({ initial, onChange }: { initial: HmiComponent[]; onChange: (c: HmiComponent[]) => void }) {
  const [components, setComponents] = useState(initial);
  const set: React.Dispatch<React.SetStateAction<HmiComponent[]>> = next => setComponents(prev => { const value = typeof next === 'function' ? next(prev) : next; onChange(value); return value; });
  return <HmiWorkspace variables={[variable('v', 1), variable('heat', true, 'bool')]} components={components} setComponents={set} onInput={() => ({ accepted: true })} onClose={vi.fn()} runtime={runtime} externalOwnedVariableIds={[]} onSimulationCommand={vi.fn()} />;
}
const select = (c: HmiComponent) => fireEvent.click(screen.getByText(c.name, { selector: '.hmi-component-title' }));

describe('display properties editor', () => {
  it('picks a vector icon from a searchable icon grid', () => {
    const changes = vi.fn();
    const lamp = comp('lamp', { id: 'lamp', name: 'Fan lamp' });
    render(<Harness initial={[lamp]} onChange={changes} />);
    select(lamp);
    const picker = screen.getByRole('group', { name: 'Icon' });
    fireEvent.change(within(picker).getByRole('searchbox'), { target: { value: 'fan' } });
    fireEvent.click(within(picker).getByRole('button', { name: HMI_GLYPHS.icons.fan.label }));
    expect(changes.mock.lastCall![0][0].icon).toBe('fan');
    expect(within(picker).getByRole('button', { name: HMI_GLYPHS.icons.fan.label }).getAttribute('aria-pressed')).toBe('true');
  });
  it('edits LCD theme, digit count and italic segments', () => {
    const changes = vi.fn();
    const seg = comp('fourteen-segment', { id: 'seg', name: 'Display' });
    render(<Harness initial={[seg]} onChange={changes} />);
    select(seg);
    fireEvent.change(screen.getByLabelText('LCD theme'), { target: { value: 'cyan-oled' } });
    fireEvent.change(screen.getByLabelText('Digit count'), { target: { value: '10' } });
    fireEvent.click(screen.getByLabelText('Italic segments'));
    expect(changes.mock.lastCall![0][0]).toEqual(expect.objectContaining({ lcdTheme: 'cyan-oled', digitCount: 10, segmentSkew: true }));
  });
  it('adds, binds and removes segment-LCD annunciators', () => {
    const changes = vi.fn();
    const lcd = comp('segment-lcd', { id: 'lcd', name: 'Oven glass' });
    render(<Harness initial={[lcd]} onChange={changes} />);
    select(lcd);
    fireEvent.click(screen.getByRole('button', { name: 'Add annunciator' }));
    fireEvent.change(screen.getByLabelText('Annunciator 1 icon'), { target: { value: 'flame' } });
    fireEvent.change(screen.getByLabelText('Annunciator 1 variable'), { target: { value: 'heat' } });
    expect(changes.mock.lastCall![0][0].annunciators).toEqual([expect.objectContaining({ icon: 'flame', variableId: 'heat' })]);
    fireEvent.click(screen.getByRole('button', { name: 'Remove annunciator 1' }));
    expect(changes.mock.lastCall![0][0].annunciators).toEqual([]);
  });
  it('edits character LCD geometry', () => {
    const changes = vi.fn();
    const lcd = comp('character-lcd', { id: 'clcd', name: 'Text LCD' });
    render(<Harness initial={[lcd]} onChange={changes} />);
    select(lcd);
    fireEvent.change(screen.getByLabelText('Rows'), { target: { value: '4' } });
    fireEvent.change(screen.getByLabelText('Columns'), { target: { value: '20' } });
    expect(changes.mock.lastCall![0][0]).toEqual(expect.objectContaining({ lcdRows: 4, lcdColumns: 20 }));
  });
  it('shows a preview icon on every palette entry', () => {
    render(<Harness initial={[]} onChange={vi.fn()} />);
    const palette = document.querySelector('.hmi-palette')!;
    const buttons = Array.from(palette.querySelectorAll('section button'));
    expect(buttons.length).toBe(49);
    for (const button of buttons) expect(button.querySelector('svg')).not.toBeNull();
  });
});
