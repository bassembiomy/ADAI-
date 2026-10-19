import { describe, expect, it } from 'vitest';
import { HmiComponent } from '../../types/sysml_types';
import { rectsOverlap } from './reportDiagramModel';
import { computeHmiLayout, renderHmiDiagram, renderXbridgesDiagram } from './reportDiagrams';

describe('renderXbridgesDiagram', () => {
  it('renders nodes and labeled edges with a caption', () => {
    const html = renderXbridgesDiagram({
      nodes: [
        { id: 'n1', label: 'Sensor <input>', kind: 'source' },
        { id: 'n2', label: 'PID', kind: 'controller' },
      ],
      edges: [{ id: 'e1', sourceId: 'n1', targetId: 'n2', label: 'feedback' }],
    });
    expect(html).toContain('Sensor &lt;input&gt;');
    expect(html).toContain('PID');
    expect(html).toContain('feedback');
    expect(html).toContain('X-Bridges model');
  });

  it('renders a formal empty figure when no model exists', () => {
    expect(renderXbridgesDiagram({ nodes: [], edges: [] })).toContain('No X-Bridges model available');
  });
});

describe('renderHmiDiagram', () => {
  const component = (partial: Partial<HmiComponent> & { id: string }): HmiComponent => ({
    type: 'gauge', name: partial.id, x: 0, y: 0, width: 120, height: 80, variableId: null,
    ...partial,
  } as HmiComponent);

  it('preserves valid non-overlapping positions', () => {
    const html = renderHmiDiagram({
      components: [
        component({ id: 'g1', name: 'Chamber temp', x: 10, y: 20, variableId: 'temp' }),
        component({ id: 'l1', name: 'Door lamp', type: 'lamp', x: 300, y: 20, variableId: 'door' }),
      ],
    });
    expect(html).toContain('Chamber temp');
    expect(html).toContain('Door lamp');
    expect(html).toContain('&#8594; temp');
    expect(html).toContain('HMI layout');
  });

  it('prints variable names and truncates texts to the widget width', () => {
    const uuid = '6178d014-831f-4339-8dac-f275360b1222';
    const html = renderHmiDiagram({
      components: [
        component({ id: 'g1', name: 'MR-PLD ECU - OM 501 LA operating modes', x: 0, y: 0, width: 120, variableId: uuid }),
        component({ id: 'g2', name: 'MR-PLD ECU (A 541 446 53 40) - OM 501 LA', x: 200, y: 0, width: 120, variableId: uuid }),
      ],
      variables: [{ id: uuid, name: 'Coil current' }],
    });
    expect(html).not.toContain(uuid);
    expect(html).toContain('&#8594; Coil current');
    expect(html).toContain('<title>MR-PLD ECU - OM 501 LA operating modes</title>');
    for (const m of html.matchAll(/<text x="([-\d.]+)"[^>]*font-size="([\d.]+)"[^>]*>([^<]*)<\/text>/g)) {
      expect(m[3].replace(/&#?\w+;/g, 'x').length * 0.6 * Number(m[2])).toBeLessThanOrEqual(120);
    }
  });

  it('falls back to a grid when persisted positions overlap', () => {
    const components = [
      component({ id: 'a', x: 0, y: 0 }),
      component({ id: 'b', x: 10, y: 10 }),
      component({ id: 'c', x: 5, y: 5 }),
    ];
    const placed = computeHmiLayout(components);
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        expect(rectsOverlap(placed[i], placed[j])).toBe(false);
      }
    }
  });

  it('renders a formal empty figure when no components exist', () => {
    expect(renderHmiDiagram({ components: [] })).toContain('No HMI components configured');
  });
});
