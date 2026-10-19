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
    expect(html).toContain('<figure class="report-figure');
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

  it('keeps the bounds at the widget boxes because widget labels are truncated to their box', () => {
    const b = computeHmiDesignBounds([comp('a', 0, 0, 40, 40, 'A very long component name that overflows')]);
    expect(b.x).toBe(-20);
    expect(b.x + b.width).toBe(40 + 20);
  });

  it('lists every component in a compact table with full name, type, variable name and state binding', () => {
    const long = 'A very long component name that the widget itself has to truncate';
    const out = renderHmiDesignSection([
      comp('a', 0, 0, 140, 90, '<b>x</b>'),
      { ...comp('b', 200, 0, 60, 60, long), variableId: null, stateId: 's1', type: 'active-state-indicator' } as HmiComponent,
      { ...comp('c', 400, 0), variableId: 'missing-id', type: 'lamp' } as HmiComponent,
      { ...comp('d', 600, 0), variableId: null, type: 'label' } as HmiComponent,
    ], variables, [], [{ id: 's1', name: 'Heating' }]);
    const table = /<table class="data[^"]*">[\s\S]*<\/table>/.exec(out)?.[0] ?? '';
    expect(table).toContain('<th>Bound variable</th>');
    expect(table.match(/<tr>/g)?.length).toBe(1 + 4);
    expect(table).toContain('&lt;b&gt;x&lt;/b&gt;');
    expect(table).toContain('<td>gauge</td><td>Temperature</td>');
    expect(table).toContain(long);
    expect(table).toContain('<td>active-state-indicator</td><td>Unbound</td><td>Heating</td>');
    expect(table).toContain('<td>missing-id</td>');
    expect(table).toContain('<td>label</td><td>Unbound</td><td>&mdash;</td>');
    expect(out).not.toContain('class="item"');
  });

  it('draws variable names, not ids, in the picture and no text wider than its widget', () => {
    const uuid = '6178d014-831f-4339-8dac-f275360b1222';
    const named = [{ ...comp('a', 0, 0, 100, 80, 'Coil'), variableId: uuid }];
    const out = renderHmiDesignSection(named, [{ ...variables[0], id: uuid, name: 'Coil current' }], []);
    expect(out).toContain('&#8594; Coil current');
    expect(out.match(/<svg[\s\S]*<\/svg>/)?.[0]).not.toContain(uuid);
    const longNamed = [{ ...comp('a', 0, 0, 100, 80, 'x'.repeat(80)), variableId: uuid }];
    const svg = renderHmiDesignSection(longNamed, [{ ...variables[0], id: uuid, name: 'y'.repeat(80) }], []);
    for (const m of svg.matchAll(/<text x="([-\d.]+)"[^>]*font-size="([\d.]+)"[^>]*>([^<]*)<\/text>/g)) {
      expect(m[3].replace(/&#?\w+;/g, 'x').length * 0.6 * Number(m[2])).toBeLessThanOrEqual(100);
    }
  });

  it('marks a wide HMI picture for a landscape page and keeps a narrow one portrait', () => {
    expect(html).toContain('report-figure report-figure-wide');
    expect(renderHmiDesignSection([comp('a', 0, 0), comp('b', 160, 0)], variables, [])).not.toContain('report-figure-wide');
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

  it('puts a canvas wider than the portrait content box on a landscape page and scales to the landscape width in print', () => {
    expect(html).toContain('<div class="report-wide-page">');
    expect(html).toContain('data-wide="1"');
    expect(html).toContain('mmToPx(fit.getAttribute("data-wide") === "1" ? 267 : 180) - 26');
    const narrow = renderHmiPrototypeSection({ hmiComponents: [comp('a', 0, 0), comp('b', 160, 0)], variables, states: [], junctions: [], transitions: [], layers: [], tickMs: 100, safetyMode: false });
    expect(narrow).not.toContain('report-wide-page');
    expect(narrow).toContain('data-wide="0"');
  });

  it('hands variable and state names to the portable widget runtime', () => {
    expect(html).toContain('variableNames: hmiVariableNames');
    expect(html).toContain('stateNames: hmiStateNames');
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
