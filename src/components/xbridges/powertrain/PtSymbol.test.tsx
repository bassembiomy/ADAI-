// WP-07b acceptance tests: powertrain symbols describe their use, and the palette list shows them.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { PtSymbol, PtLibraryIcon, PT_SYMBOL_TITLES } from './PtSymbol';
import { PT_SYMBOL_IDS } from '../../../engine/xbridges/powertrain/ptSpec';
import { POWERTRAIN_SPECS } from '../../../engine/xbridges/powertrain/index';

describe('PtSymbol', () => {
  it('every symbol is an accessible SVG whose title says what it represents', () => {
    for (const id of PT_SYMBOL_IDS) {
      const html = renderToStaticMarkup(<PtSymbol id={id} size={48} />);
      expect(html, id).toMatch(/^<svg[^>]*role="img"/);
      expect(html, id).toContain(`data-pt-symbol="${id}"`);
      const title = PT_SYMBOL_TITLES[id];
      expect(title, id).toBeTruthy();
      expect(title.split(' ').length, `${id} title should be a short phrase`).toBeGreaterThanOrEqual(3);
      expect(html, id).toContain(`<title>${title}</title>`);
      expect(html, id).not.toMatch(/#[0-9a-fA-F]{3,6}\b|rgb\(/); // theme colours only
    }
  });

  it('the symbols of registered blocks are all different drawings', () => {
    const used = [...new Set(POWERTRAIN_SPECS.map(s => s.symbol))];
    const bodies = used.map(id => renderToStaticMarkup(<PtSymbol id={id} size={48} />).replace(/<title>.*?<\/title>|data-pt-symbol="[^"]*"/g, ''));
    expect(new Set(bodies).size).toBe(used.length);
  });

  it('PtLibraryIcon shows the block symbol and explains the block in its tooltip', () => {
    for (const s of POWERTRAIN_SPECS) {
      const html = renderToStaticMarkup(<PtLibraryIcon type={s.type} />);
      expect(html, s.type).toContain(`data-pt-symbol="${s.symbol}"`);
      const firstSentence = s.description.split(/(?<=\.)\s/)[0];
      expect(html, s.type).toContain(`title="${firstSentence.replace(/"/g, '&quot;')}"`);
    }
    expect(renderToStaticMarkup(<PtLibraryIcon type="GAIN" />)).toBe('');
  });

  it('the X-Bridges palette list uses PtLibraryIcon for powertrain blocks', () => {
    const src = readFileSync(join(__dirname, '../XbridgesWorkspace.tsx'), 'utf8');
    expect(src).toMatch(/import \{[^}]*PtLibraryIcon[^}]*\} from '\.\/powertrain\/PtSymbol'/);
    expect(src).toMatch(/<PtLibraryIcon type=\{b\.type\}/);
  });
});
