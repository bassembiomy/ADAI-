import { describe, expect, it } from 'vitest';
import { HMI_GLYPHS, HMI_ICON_IDS, HMI_RENDER_LIB, formatCharacterLcdLines, layoutSegmentCells } from './hmiGlyphs';

const REQUIRED_ICONS = ['power', 'play', 'pause', 'stop', 'light', 'fan', 'flame', 'steam', 'droplet', 'snowflake', 'thermometer', 'warning', 'bell', 'lock', 'unlock', 'wifi', 'bluetooth', 'battery-full', 'battery-half', 'battery-low', 'plug', 'clock', 'timer', 'gear', 'motor', 'pump', 'valve', 'door', 'home', 'check', 'close', 'arrow-up', 'arrow-down', 'arrow-left', 'arrow-right', 'plus', 'minus', 'speaker', 'mute', 'leaf', 'child-lock', 'filter', 'wind', 'sun', 'moon', 'water-wave', 'signal', 'error', 'info', 'refresh'];
const CATEGORIES = ['power', 'media', 'climate', 'status', 'connectivity', 'appliance', 'navigation', 'audio'];

describe('HMI vector icon library', () => {
  it('provides at least fifty kebab-case vector icons including every required id', () => {
    expect(HMI_ICON_IDS.length).toBeGreaterThanOrEqual(50);
    expect(new Set(HMI_ICON_IDS).size).toBe(HMI_ICON_IDS.length);
    for (const id of REQUIRED_ICONS) expect(HMI_ICON_IDS).toContain(id);
    expect(Object.keys(HMI_GLYPHS.icons).sort()).toEqual([...HMI_ICON_IDS].sort());
  });
  it.each([...HMI_ICON_IDS])('icon %s has a label, category and valid 24×24 path data', id => {
    const icon = HMI_GLYPHS.icons[id];
    expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    expect(icon.label.trim().length).toBeGreaterThan(0);
    expect(CATEGORIES).toContain(icon.category);
    expect(icon.paths.length).toBeGreaterThan(0);
    for (const d of icon.paths) {
      expect(d).toMatch(/^[Mm]/);
      expect(d).toMatch(/^[MmLlHhVvCcSsQqTtAaZz0-9.,\s-]+$/);
      const numbers = (d.match(/-?\d*\.?\d+/g) || []).map(Number);
      for (const n of numbers) expect(Math.abs(n)).toBeLessThanOrEqual(24);
    }
  });
  it('gives icons distinct artwork', () => {
    const art = HMI_ICON_IDS.map(id => HMI_GLYPHS.icons[id].paths.join('|'));
    expect(new Set(art).size).toBe(art.length);
  });
});

describe('segment glyph maps', () => {
  const counts = { '7': 7, '14': 14, '16': 16 } as const;
  it.each(Object.entries(counts))('%s-segment style defines %i polygon segments and consistent character masks', (style, count) => {
    const def = HMI_GLYPHS.segments[style as '7' | '14' | '16'];
    expect(Object.keys(def.paths)).toHaveLength(count);
    for (const d of Object.values(def.paths)) { expect(d).toMatch(/^M/); expect(d).toMatch(/Z\s*$/i); }
    for (const [char, mask] of Object.entries(def.chars)) {
      expect(char).toHaveLength(1);
      for (const segment of mask) expect(Object.keys(def.paths)).toContain(segment);
    }
    const digits = '0123456789'.split('').map(d => def.chars[d]);
    digits.forEach(mask => expect(mask?.length).toBeGreaterThan(0));
    expect(new Set(digits.map(m => m.split('').sort().join(''))).size).toBe(10);
    expect(def.chars['-']).toBeTruthy();
  });
  it('7-segment covers hex digits and 14/16-segment cover the full Latin alphabet', () => {
    for (const ch of 'AbCdEF') expect(HMI_GLYPHS.segments['7'].chars[ch] ?? HMI_GLYPHS.segments['7'].chars[ch.toUpperCase()] ?? HMI_GLYPHS.segments['7'].chars[ch.toLowerCase()]).toBeTruthy();
    for (const style of ['14', '16'] as const) {
      for (const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') expect(HMI_GLYPHS.segments[style].chars[ch]).toBeTruthy();
      expect(HMI_GLYPHS.segments[style].chars.M).not.toBe(HMI_GLYPHS.segments[style].chars.N);
    }
    expect(HMI_GLYPHS.segments['7'].chars['8'].split('').sort().join('')).toBe('abcdefg');
  });
});

describe('5×7 dot-matrix font', () => {
  it('covers printable ASCII with seven five-bit rows', () => {
    for (let code = 32; code <= 126; code++) {
      const rows = HMI_GLYPHS.font5x7[String.fromCharCode(code)];
      expect(rows, String.fromCharCode(code)).toHaveLength(7);
      rows.forEach(row => { expect(Number.isInteger(row)).toBe(true); expect(row).toBeGreaterThanOrEqual(0); expect(row).toBeLessThanOrEqual(31); });
    }
    expect(HMI_GLYPHS.font5x7[' '].every(row => row === 0)).toBe(true);
    expect(HMI_GLYPHS.font5x7['8']).not.toEqual(HMI_GLYPHS.font5x7.B);
    expect(HMI_GLYPHS.font5x7['0']).not.toEqual(HMI_GLYPHS.font5x7.O);
  });
});

describe('LCD themes', () => {
  it('defines the seven glass/backlight themes with colours', () => {
    expect(Object.keys(HMI_GLYPHS.lcdThemes).sort()).toEqual(['amber', 'blue-negative', 'cyan-oled', 'green-led', 'green-stn', 'red-led', 'white-fstn']);
    for (const theme of Object.values(HMI_GLYPHS.lcdThemes)) {
      for (const colour of [theme.background, theme.bezel, theme.on, theme.off]) expect(colour).toMatch(/^#[0-9a-f]{6}$/i);
      expect(theme.on.toLowerCase()).not.toBe(theme.off.toLowerCase());
      expect(theme.label.length).toBeGreaterThan(0);
    }
    expect(HMI_GLYPHS.lcdThemes['red-led'].glow).toBe(true);
    expect(HMI_GLYPHS.lcdThemes['green-stn'].glow).toBe(false);
  });
});

describe('layoutSegmentCells', () => {
  const lay = (text: string, options: Parameters<typeof layoutSegmentCells>[1]) => layoutSegmentCells(text, options, HMI_GLYPHS);
  it('merges decimal points into the preceding digit and right-aligns to the digit count', () => {
    const cells = lay('12.5', { style: '7', digits: 4 });
    expect(cells.map(c => c.char)).toEqual([' ', '1', '2', '5']);
    expect(cells.map(c => c.dp)).toEqual([false, false, true, false]);
    expect(cells[0].segments).toBe('');
    expect(cells[1].segments.split('').sort().join('')).toBe('bc');
  });
  it('sets colon flags for clock displays', () => {
    const cells = lay('12:30', { style: '7' });
    expect(cells.map(c => c.char)).toEqual(['1', '2', '3', '0']);
    expect(cells.map(c => c.colon)).toEqual([false, true, false, false]);
  });
  it('gives a leading decimal point its own blank cell and blanks unknown characters', () => {
    const cells = lay('.5', { style: '7' });
    expect(cells).toHaveLength(2);
    expect(cells[0]).toEqual(expect.objectContaining({ segments: '', dp: true }));
    expect(lay('~', { style: '7' })[0].segments).toBe('');
  });
  it('shows numeric overflow as dashes but truncates text', () => {
    expect(lay('12345', { style: '7', digits: 4, numeric: true }).map(c => c.char)).toEqual(['-', '-', '-', '-']);
    expect(lay('HELLO WORLD', { style: '14', digits: 5 }).map(c => c.char).join('')).toBe('HELLO');
  });
  it('falls back between letter cases', () => {
    expect(lay('hi', { style: '14' }).every(c => c.segments.length > 0)).toBe(true);
    expect(lay('', { style: '16' })).toHaveLength(1);
  });
  it('is self-contained so the portable report can embed its source', () => {
    const rebuilt = new Function(`return (${layoutSegmentCells.toString()})`)();
    expect(rebuilt('1.2', { style: '7', digits: 3 }, HMI_GLYPHS)).toEqual(lay('1.2', { style: '7', digits: 3 }));
    const lines = new Function(`return (${formatCharacterLcdLines.toString()})`)();
    expect(lines(['{value}'], 1, 8, { value: '42' })).toEqual(['42      ']);
  });
});

describe('formatCharacterLcdLines', () => {
  it('substitutes tokens and returns exactly rows × columns characters', () => {
    expect(formatCharacterLcdLines(['{name}', 'T={value}{unit}'], 2, 16, { name: 'Boiler', value: '72.5', unit: 'C' })).toEqual(['Boiler          ', 'T=72.5C         ']);
    expect(formatCharacterLcdLines(['A very long line that overflows'], 3, 8, {})).toEqual(['A very l', '        ', '        ']);
    expect(formatCharacterLcdLines(['{missing}'], 1, 8, {})).toEqual(['        ']);
  });
  it('is exposed through the render library', () => {
    expect(HMI_RENDER_LIB.glyphs).toBe(HMI_GLYPHS);
    expect(HMI_RENDER_LIB.layoutSegmentCells).toBe(layoutSegmentCells);
    expect(HMI_RENDER_LIB.formatCharacterLcdLines).toBe(formatCharacterLcdLines);
    expect(() => JSON.stringify(HMI_RENDER_LIB.glyphs)).not.toThrow();
  });
});
