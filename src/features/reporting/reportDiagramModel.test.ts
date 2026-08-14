import { describe, expect, it } from 'vitest';
import {
  MAX_NODES_PER_FIGURE, boundsOf, chunkItems, escapeHtml, measureNode,
  rectsOverlap, renderEmptyFigure, wrapFigure,
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
    expect(html).toContain('<figure class="report-figure">');
    expect(html).toContain('viewBox="0 0 200 100"');
    expect(html).toContain('BDD &lt;Root&gt;');
    expect(html).toContain('report-figure-caption');
  });

  it('renderEmptyFigure renders a formal no-data statement', () => {
    expect(renderEmptyFigure('No data available for this diagram'))
      .toContain('No data available for this diagram');
  });
});
