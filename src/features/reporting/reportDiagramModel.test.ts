import { describe, expect, it } from 'vitest';
import {
  MAX_NODES_PER_FIGURE, boundsOf, chunkItems, escapeHtml, measureNode,
  rectsOverlap, renderEmptyFigure, wrapFigure, figurePageFit, minFontSizeOf,
} from './reportDiagramModel';

describe('escapeHtml', () => {
  it('escapes markup-significant characters', () => {
    expect(escapeHtml('<b>"x" & `y` \'')).toBe('&lt;b&gt;&quot;x&quot; &amp; &#96;y&#96; &#39;');
  });
});

describe('measureNode', () => {
  it('sizes from the longest line with padding and enforces minimums', () => {
    const node = measureNode('a', ['Temperature Controller', '«block»'], 'bdd');
    expect(node.width).toBeGreaterThanOrEqual(72);
    expect(node.height).toBeGreaterThanOrEqual(30);
    const wider = measureNode('b', ['A much longer requirement name line'], 'bdd');
    expect(wider.width).toBeGreaterThan(measureNode('c', ['short'], 'bdd').width);
  });
});

describe('rectsOverlap', () => {
  it('detects overlap and separation', () => {
    expect(rectsOverlap({ x: 0, y: 0, width: 10, height: 10 }, { x: 5, y: 5, width: 10, height: 10 })).toBe(true);
    expect(rectsOverlap({ x: 0, y: 0, width: 10, height: 10 }, { x: 10, y: 0, width: 10, height: 10 })).toBe(false);
  });
});

describe('boundsOf', () => {
  it('computes padded enclosing rect', () => {
    expect(boundsOf([{ x: 10, y: 20, width: 30, height: 40 }], 5))
      .toEqual({ x: 5, y: 15, width: 40, height: 50 });
  });
});

describe('chunkItems', () => {
  it('splits deterministically at the figure node cap', () => {
    const items = Array.from({ length: 41 }, (_, i) => i);
    const chunks = chunkItems(items, MAX_NODES_PER_FIGURE);
    expect(chunks.map(c => c.length)).toEqual([20, 20, 1]);
  });
});

describe('figure wrappers', () => {
  it('wrapFigure emits an SVG figure with escaped caption', () => {
    const html = wrapFigure('<rect/>', 'BDD <Root>', { x: 0, y: 0, width: 200, height: 100 });
    expect(html).toContain('<figure class="report-figure"');
    expect(html).toContain('viewBox="0 0 200 100"');
    expect(html).toContain('BDD &lt;Root&gt;');
    expect(html).toContain('report-figure-caption');
  });

  it('renderEmptyFigure renders a formal no-data statement', () => {
    expect(renderEmptyFigure('No data available for this diagram'))
      .toContain('No data available for this diagram');
  });
});

describe('figurePageFit / page-fit rule', () => {
  it('keeps compact figures portrait and legible', () => {
    const fit = figurePageFit({ width: 600, height: 400 }, 10);
    expect(fit).toMatchObject({ orientation: 'portrait', scale: 1, legible: true });
  });
  it('moves a wide small-font figure to landscape when that is more legible', () => {
    const fit = figurePageFit({ width: 1400, height: 500 }, 11);
    expect(fit.portraitScale * 11).toBeLessThan(8);
    expect(fit.orientation).toBe('landscape');
    expect(fit.scale).toBeCloseTo(987 / 1400, 5);
    expect(fit.legible).toBe(false); // 11 * 0.705 = 7.8
    expect(figurePageFit({ width: 1100, height: 500 }, 11)).toMatchObject({ orientation: 'landscape', legible: true });
  });
  it('stays portrait when landscape gives no better scale', () => {
    expect(figurePageFit({ width: 5000, height: 20 }, 9).orientation).toBe('landscape');
    expect(figurePageFit({ width: 600, height: 400 }, 4).orientation).toBe('portrait');
  });
  it('reads the minimum declared font-size, default 9', () => {
    expect(minFontSizeOf('<text font-size="11">a</text><text font-size="7.5">b</text>')).toBe(7.5);
    expect(minFontSizeOf('<rect/>')).toBe(9);
  });
  it('wrapFigure marks wide small-font figures and not compact ones', () => {
    const wide = wrapFigure('<text font-size="11" x="0" y="10">a</text><rect x="0" y="0" width="1500" height="400"/>', 'Wide', { x: 0, y: 0, width: 1500, height: 400 });
    expect(wide).toContain('report-figure report-figure-wide');
    expect(wide).toContain('data-page-fit="landscape"');
    expect(wide).toContain('data-min-font="11"');
    expect(wide).toContain('width="987"');
    const small = wrapFigure('<text font-size="11" x="0" y="10">a</text>', 'Small', { x: 0, y: 0, width: 500, height: 300 });
    expect(small).not.toContain('report-figure-wide');
    expect(small).toContain('data-page-fit="portrait"');
  });
});
