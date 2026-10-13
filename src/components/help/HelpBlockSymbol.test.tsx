import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { getBlockHelpReferences } from '../../help/blockReference';
import { XBRIDGES_CATEGORIES } from '../../utils/xbridges/XbridgesLibrary';
import { HelpBlockSymbol } from './HelpBlockSymbol';

describe('catalog-backed block symbol preview', () => {
  const refs = getBlockHelpReferences();
  it('draws the same V-Lab glyph as the palette and labels registry terminal sides', () => {
    const block = refs.find(ref => ref.id === 'vlab:resistor')!;
    const html = renderToStaticMarkup(<HelpBlockSymbol block={block} />);
    expect(html).toContain('aria-label="Symbol for Resistor"');
    expect(html).toContain('data-symbol="resistor"');
    expect(html).toContain('M0 15H15'); // zigzag SVG from VLabSymbols
    for (const port of block.ports) expect(html).toContain(`${port.name} [${port.id}]`);
  });
  it('matches XBlockNode’s generic Box fallback for unmapped palette keys', () => {
    const unmappedInXBlockNode = new Set(['battery-charging', 'check-square', 'crop', 'database', 'git-branch', 'navigation', 'toggle-left']);
    for (const category of XBRIDGES_CATEGORIES) {
      for (const entry of category.blocks) {
        const block = refs.find(ref => ref.id === `xbridges:${entry.type}`)!;
        const html = renderToStaticMarkup(<HelpBlockSymbol block={block} />);
        expect(html.includes('lucide-box'), entry.type).toBe(entry.icon === 'box' || unmappedInXBlockNode.has(entry.icon));
        expect(html.includes('generic box fallback'), entry.type).toBe(unmappedInXBlockNode.has(entry.icon));
      }
    }
  });

  it('shows X-Bridges control terminals on their real sides and an honest palette-only glyph', () => {
    const pid = refs.find(ref => ref.id === 'xbridges:PID_BASIC')!;
    const html = renderToStaticMarkup(<HelpBlockSymbol block={pid} />);
    expect(html).toContain('data-symbol=');
    expect(html).toContain('data-side="bottom"'); // enable/reset inputs
    expect(html).toContain(`${pid.ports.find(port => port.id === 'enable')!.name} [enable]`);
    expect(html).toContain(`${pid.ports.find(port => port.id === 'u')!.name} [u]`);
    const unavailable = refs.find(ref => ref.id === 'xbridges:COSEC')!;
    expect(renderToStaticMarkup(<HelpBlockSymbol block={unavailable} />)).toContain('Palette glyph only');
  });
});
