// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { HmiComponent } from '../../types/sysml_types';
import { HMI_CATALOG, createHmiComponent, getHmiDefinition } from './hmiCatalog';
import { normalizeHmiComponents } from './hmiModel';
import { getPortableHmiScript, renderHmiWidgetSvg } from './hmiReport';
import { HMI_GLYPHS } from './hmiGlyphs';

const NEW_TYPES = ['fourteen-segment', 'sixteen-segment', 'dot-matrix', 'character-lcd', 'segment-lcd', 'icon-indicator', 'led-bar'] as const;
const comp = (type: HmiComponent['type'], patch: Partial<HmiComponent> = {}): HmiComponent => ({ ...createHmiComponent(type, type), variableId: 'v', ...patch });
const count = (svg: string, marker: string) => svg.split(marker).length - 1;

describe('HMI display catalog', () => {
  it('adds the new display types with real-panel default sizes', () => {
    const sizes: Record<string, [number, number]> = { 'fourteen-segment': [240, 100], 'sixteen-segment': [240, 100], 'dot-matrix': [240, 100], 'character-lcd': [300, 110], 'segment-lcd': [280, 150], 'icon-indicator': [110, 110], 'led-bar': [220, 80] };
    for (const type of NEW_TYPES) {
      const entry = getHmiDefinition(type)!;
      expect(entry, type).toBeDefined();
      expect(entry.category).toBe('Displays');
      expect(entry.role).toBe('display');
      expect([entry.width, entry.height]).toEqual(sizes[type]);
      expect(entry.description).toMatch(/committed/);
    }
    expect(HMI_CATALOG).toHaveLength(49);
  });
  it('creates components with display defaults', () => {
    expect(createHmiComponent('fourteen-segment', 'a')).toEqual(expect.objectContaining({ digitCount: 8, lcdTheme: 'green-led', writable: false }));
    expect(createHmiComponent('sixteen-segment', 'a')).toEqual(expect.objectContaining({ digitCount: 8, lcdTheme: 'red-led' }));
    expect(createHmiComponent('dot-matrix', 'a')).toEqual(expect.objectContaining({ digitCount: 8, lcdTheme: 'amber' }));
    expect(createHmiComponent('character-lcd', 'a')).toEqual(expect.objectContaining({ lcdRows: 2, lcdColumns: 16, lcdLines: ['{name}', '{value}'], lcdTheme: 'green-stn' }));
    expect(createHmiComponent('segment-lcd', 'a')).toEqual(expect.objectContaining({ digitCount: 4, annunciators: [], lcdTheme: 'white-fstn' }));
    expect(createHmiComponent('icon-indicator', 'a')).toEqual(expect.objectContaining({ icon: 'power' }));
    expect(createHmiComponent('led-bar', 'a')).toEqual(expect.objectContaining({ barSegments: 10, lcdTheme: 'green-led' }));
    expect(createHmiComponent('lcd', 'a').lcdTheme).toBe('green-stn');
    const seven = createHmiComponent('seven-segment', 'a');
    expect(seven.lcdTheme).toBe('green-led');
    expect(seven.digitCount).toBeUndefined();
  });
});

describe('HMI display normalization', () => {
  it('keeps valid display fields and repairs invalid ones with diagnostics', () => {
    const diagnostics: string[] = [];
    const [ok, bad] = normalizeHmiComponents([
      { ...comp('segment-lcd'), id: 'ok', icon: 'fan', lcdTheme: 'blue-negative', digitCount: 6, segmentSkew: true, annunciators: [{ icon: 'flame', variableId: 'heat', label: 'Heat' }, { icon: 'snowflake', variableId: null }] },
      { ...comp('segment-lcd'), id: 'bad', icon: 'bogus', lcdTheme: 'plasma', digitCount: 99, segmentSkew: 'yes', annunciators: [{ icon: 'nope', variableId: 'x' }, { icon: 'fan', variableId: 7 }, 'junk', ...Array.from({ length: 20 }, () => ({ icon: 'bell', variableId: null }))] },
    ], diagnostics);
    expect(ok).toEqual(expect.objectContaining({ icon: 'fan', lcdTheme: 'blue-negative', digitCount: 6, segmentSkew: true }));
    expect(ok.annunciators).toEqual([{ icon: 'flame', variableId: 'heat', label: 'Heat' }, { icon: 'snowflake', variableId: null }]);
    expect(bad.icon).toBeUndefined();
    expect(bad.lcdTheme).toBe('white-fstn');
    expect(bad.digitCount).toBe(4);
    expect(bad.segmentSkew).toBeUndefined();
    expect(bad.annunciators).toHaveLength(12);
    expect(bad.annunciators!.every(a => a.icon === 'bell')).toBe(true);
    expect(diagnostics).toEqual(expect.arrayContaining(['HMI bad: removed invalid icon.', 'HMI bad: removed invalid lcdTheme.']));
  });
  it('keeps legacy icons and bounds character LCD geometry', () => {
    const [lamp, lcd] = normalizeHmiComponents([
      { ...comp('lamp'), icon: 'light' },
      { ...comp('character-lcd'), lcdRows: 9, lcdColumns: 3, lcdLines: ['Temp {value}', 5, null, 'ok'], barSegments: 2 },
    ]);
    expect(lamp.icon).toBe('light');
    expect(lcd.lcdRows).toBe(2);
    expect(lcd.lcdColumns).toBe(16);
    expect(lcd.lcdLines).toEqual(['Temp {value}', 'ok']);
    const [bar] = normalizeHmiComponents([{ ...comp('led-bar'), barSegments: 2 }, { ...comp('led-bar'), barSegments: 24 }]);
    expect(bar.barSegments).toBe(10);
    expect(normalizeHmiComponents([{ ...comp('led-bar'), barSegments: 24 }])[0].barSegments).toBe(24);
  });
  it('round-trips an existing seven-segment without inventing a digit count', () => {
    const [seven] = normalizeHmiComponents([{ id: 's', type: 'seven-segment', name: 'Timer', variableId: 'v', x: 1, y: 2, width: 180, height: 90 }]);
    expect(seven.digitCount).toBeUndefined();
    expect(seven.lcdTheme).toBe('green-led');
  });
});

describe('portable display rendering', () => {
  it('renders 7, 14 and 16 segment displays with one cell per digit and lit polygon segments', () => {
    const seven = renderHmiWidgetSvg(comp('seven-segment', { digitCount: 4, precision: 1 }), { v: 12.5 });
    expect(seven).toContain('data-segment-style="7"');
    expect(count(seven, 'data-segment-cell')).toBe(4);
    expect(count(seven, 'data-segment-on="true"')).toBe(2 + 5 + 5); // '1' bc, '2' abdeg, '5' acdfg; the decimal point is data-dp-on, not a segment
    expect(seven).toContain('data-dp-on="true"');
    const fourteen = renderHmiWidgetSvg(comp('fourteen-segment', { digitCount: 5, text: 'HI', variableId: null }), {});
    expect(fourteen).toContain('data-segment-style="14"');
    expect(count(fourteen, 'data-segment-cell')).toBe(5);
    const sixteen = renderHmiWidgetSvg(comp('sixteen-segment', { digitCount: 3, text: 'T{value}', precision: 0 }), { v: 42 });
    expect(sixteen).toContain('data-segment-style="16"');
    expect(count(sixteen, 'data-segment-cell')).toBe(3);
    expect(sixteen).toContain(HMI_GLYPHS.lcdThemes['red-led'].on);
  });
  it('applies LCD themes and shows numeric overflow instead of truncating', () => {
    const svg = renderHmiWidgetSvg(comp('seven-segment', { digitCount: 2, precision: 0, lcdTheme: 'amber' }), { v: 123 });
    expect(svg).toContain('data-lcd-theme="amber"');
    expect(svg).toContain(HMI_GLYPHS.lcdThemes.amber.background);
    expect(count(svg, 'data-segment-on="true"')).toBe(2);
    expect(renderHmiWidgetSvg(comp('lcd', { lcdTheme: 'blue-negative' }), { v: 1 })).toContain('data-lcd-theme="blue-negative"');
  });
  it('renders a character LCD as rows × columns cells with the formatted value', () => {
    const svg = renderHmiWidgetSvg(comp('character-lcd', { name: 'Boiler', lcdRows: 2, lcdColumns: 16, lcdLines: ['{name}', 'T={value}{unit}'], unit: 'C', precision: 1 }), { v: 72.5 });
    expect(count(svg, 'data-lcd-cell')).toBe(32);
    expect(svg).toContain('T=72.5C');
  });
  it('renders dot-matrix characters from the 5×7 font', () => {
    const svg = renderHmiWidgetSvg(comp('dot-matrix', { digitCount: 2, text: 'OK', variableId: null }), {});
    expect(count(svg, 'data-dot-on="true"')).toBe(HMI_GLYPHS.font5x7.O.concat(HMI_GLYPHS.font5x7.K).reduce((sum, row) => sum + row.toString(2).split('1').length - 1, 0));
  });
  it('lights segment-LCD annunciators from their own variables', () => {
    const svg = renderHmiWidgetSvg(comp('segment-lcd', { annunciators: [{ icon: 'flame', variableId: 'heat' }, { icon: 'fan', variableId: 'fan' }] }), { v: 88, heat: true, fan: false });
    expect(svg).toContain('data-annunciator="flame" data-on="true"');
    expect(svg).toContain('data-annunciator="fan" data-on="false"');
    expect(svg).toContain('data-icon="flame"');
  });
  it('draws vector icons for lamps, LEDs, mode icons and icon indicators', () => {
    for (const type of ['lamp', 'led', 'mode-icon', 'icon-indicator'] as const) {
      const svg = renderHmiWidgetSvg(comp(type, { icon: 'fan' }), { v: 1 });
      expect(svg, type).toContain('data-icon="fan"');
      expect(svg, type).toContain(HMI_GLYPHS.icons.fan.paths[0]);
    }
  });
  it('lights LED bar segments in proportion to the value', () => {
    const svg = renderHmiWidgetSvg(comp('led-bar', { barSegments: 10, min: 0, max: 100 }), { v: 60 });
    expect(count(svg, 'data-bar-segment')).toBe(10);
    expect(count(svg, 'data-on="true"')).toBe(6);
  });
  it('draws gauge ticks', () => {
    expect(count(renderHmiWidgetSvg(comp('gauge'), { v: 30 }), 'data-gauge-tick')).toBeGreaterThanOrEqual(11);
  });
  it('embeds the glyph library in the portable script so icons and segments render outside the app bundle', () => {
    document.body.innerHTML = '<main></main>';
    const script = getPortableHmiScript();
    expect(script).not.toMatch(/HMI_RENDER_LIB|HMI_GLYPHS/);
    window.eval(script);
    const api = (window as any).ADIA_HMI.mount(document.querySelector('main'), [comp('lamp', { id: 'lamp', icon: 'fan' }), comp('fourteen-segment', { id: 'seg', digitCount: 4 }), comp('character-lcd', { id: 'lcd' })]);
    api.update({ v: 7 });
    expect(document.querySelector('[data-hmi-id="lamp"] [data-icon="fan"]')).not.toBeNull();
    expect(document.querySelectorAll('[data-hmi-id="seg"] [data-segment-cell]')).toHaveLength(4);
    expect(document.querySelectorAll('[data-hmi-id="lcd"] [data-lcd-cell]')).toHaveLength(32);
    api.destroy();
  });
});
