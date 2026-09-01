import { describe, it, expect } from 'vitest';
import { SymbolRenderer, RawSymbolRenderer, UnknownSymbolGlyph } from './VLabSymbols';
import { VLAB_LIBRARY } from '../../utils/vlabLibrary';

const ALL_IDS = VLAB_LIBRARY.flatMap(d => d.blocks.map(b => b.id));

describe('VLabSymbols', () => {
  it('renders a wrapper element for every library icon without throwing', () => {
    for (const id of ALL_IDS) {
      const el = SymbolRenderer({ type: id, color: '#3b82f6' });
      expect(el).toBeDefined();
      expect((el as any).type).toBe('div');
    }
  });

  it('renders raw symbols with an svg root or the designed fallback', () => {
    const resistor = RawSymbolRenderer({ type: 'resistor', color: '#fff' });
    expect((resistor as any).type).toBe('svg');
    const unknown = RawSymbolRenderer({ type: 'no_such_symbol', color: '#fff' });
    expect(unknown).toBeDefined();
  });

  it('never falls back for any library icon', () => {
    for (const id of ALL_IDS) {
      const el = RawSymbolRenderer({ type: id, color: '#fff' }) as any;
      const isFallback = el.type === UnknownSymbolGlyph;
      expect(isFallback).toBe(false);
    }
  });
});
