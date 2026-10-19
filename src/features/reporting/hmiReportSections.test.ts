import { describe, expect, it } from 'vitest';
import type { HmiComponent } from '../../types/sysml_types';
import type { VariableDef } from '../../types/sm_types';
import { computeHmiDesignBounds, renderHmiDesignSection, renderHmiPrototypeSection } from './hmiReportSections';

const variables: VariableDef[] = [
  { id: 'v1', name: 'Temperature', type: 'float' as VariableDef['type'], initialValue: '20', currentValue: 20, visibleInScope: true },
];

const comp = (id: string, x: number, y: number, width = 140, height = 90, name = id): HmiComponent =>
  ({ id, type: 'gauge', name, x, y, width, height, variableId: 'v1' }) as HmiComponent;

const components = [comp('a', -60, -40), comp('b', 0, 0, 200, 120), comp('c', 1400, 300, 160, 100), comp('d', 200, 900)];

function viewBoxOf(html: string): { x: number; y: number; width: number; height: number } {
  const m = /viewBox="(-?[\d.]+) (-?[\d.]+) ([\d.]+) ([\d.]+)"/.exec(html);
  expect(m).not.toBeNull();
  return { x: Number(m![1]), y: Number(m![2]), width: Number(m![3]), height: Number(m![4]) };
}

describe('renderHmiDesignSection', () => {
  const html = renderHmiDesignSection(components, variables, []);

  it('wraps the picture in a report figure that never exceeds the page width', () => {
    expect(html).toContain('<figure class="report-figure"');
    expect(html).toContain('<figcaption class="report-figure-caption">HMI layout');
    expect(html).toMatch(/<svg[^>]*style="max-width:100%;height:auto"/);
    expect(html).toContain('overflow-wrap:anywhere');
  });

  it('uses a viewBox containing every component rect, including negative and far-away ones', () => {
    const vb = viewBoxOf(html);
    for (const c of components) {
      expect(c.x).toBeGreaterThanOrEqual(vb.x);
      expect(c.y).toBeGreaterThanOrEqual(vb.y);
      expect(c.x + c.width).toBeLessThanOrEqual(vb.x + vb.width);
      expect(c.y + c.height).toBeLessThanOrEqual(vb.y + vb.height);
    }
    expect(vb.x).toBeLessThanOrEqual(-60 - 20 + 0.001);
    expect(vb.width).toBeGreaterThanOrEqual(1400 + 160 + 60);
  });

  it('pads the bounds for labels wider than their widget', () => {
    const wide = [comp('a', 0, 0, 40, 40, 'A very long component name that overflows')];
    const b = computeHmiDesignBounds(wide);
    expect(b.x).toBeLessThan(-20);
    expect(b.x + b.width).toBeGreaterThan(40 + 20);
  });

  it('lists components with their bindings and escapes names', () => {
    const out = renderHmiDesignSection([comp('a', 0, 0, 140, 90, '<b>x</b>')], variables, []);
    expect(out).toContain('&lt;b&gt;x&lt;/b&gt;');
    expect(out).toContain('Bound to: <strong>Temperature</strong>');
  });

  it('returns nothing without components', () => {
    expect(renderHmiDesignSection([], variables, [])).toBe('');
  });
});

describe('renderHmiPrototypeSection', () => {
  const html = renderHmiPrototypeSection({
    hmiComponents: components, variables, states: [], junctions: [], transitions: [], layers: [], tickMs: 100, safetyMode: false,
  });

  it('keeps the canvas at its natural size inside a scale-to-fit wrapper', () => {
    // natural width = 1560 + 60 (min x) + 40 padding
    const width = 1560 - -60 + 40;
    expect(html).toContain('id="portable-hmi-fit"');
    expect(html).toMatch(/id="portable-hmi-canvas"[^>]*style="width: \d+px; height: \d+px;"/);
    expect(html).toContain(`style="width: ${width}px;`);
    expect(html).toContain(`max-width: ${width + 2}px`);
    expect(html).toContain('transform-origin: 0 0');
    expect(html).toContain('"scale(" + scale + ")"');
    expect(html).toContain('beforeprint');
    expect(html).toContain('matchMedia("print")');
    expect(html).toContain('ResizeObserver');
    expect(html).toContain('@media print');
    expect(html).not.toMatch(/zoom\s*:/);
  });

  it('makes header, dashboard and event log wrap', () => {
    expect(html).toContain('flex-wrap: wrap');
    expect(html).toContain('minmax(min(145px, 100%), 1fr)');
    expect(html).toContain('overflow-wrap: anywhere');
    expect(html).toContain('max-width: 100%');
    expect(html).toContain('box-sizing: border-box');
  });

  it('still carries the runtime pieces', () => {
    expect(html).toContain('PROJECT_DATA');
    expect(html).toContain('window.ADIA_HMI.mount(document.getElementById("portable-hmi-canvas")');
    expect(html).toContain('id="sim-event-log"');
    expect(html).toContain('id="sim-dashboard"');
    expect(html).toContain('ADIAStateMachineRuntime');
    expect(html).toContain('tickMs: 100');
  });

  it('returns nothing without components', () => {
    expect(renderHmiPrototypeSection({ hmiComponents: [], variables, states: [], junctions: [], transitions: [], layers: [], tickMs: 100, safetyMode: false })).toBe('');
  });
});
