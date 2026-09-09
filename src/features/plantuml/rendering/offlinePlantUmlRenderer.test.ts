import { describe, expect, it } from 'vitest';
import { OfflinePlantUmlRenderer, renderVisualDiagramToSvg } from './offlinePlantUmlRenderer';

describe('offline PlantUML renderer boundary', () => {
  it('renders through an injected local renderer and never requires a URL', async () => {
    const renderer = new OfflinePlantUmlRenderer(async (source) => `<svg data-source="${source.length}"/>`);
    await expect(renderer.render('@startuml\n@enduml')).resolves.toEqual({ svg: '<svg data-source="17"/>' });
  });

  it('maps local renderer failures to structured errors', async () => {
    const renderer = new OfflinePlantUmlRenderer(async () => { throw new Error('syntax error'); });
    await expect(renderer.render('bad')).resolves.toEqual({ error: { code: 'render-failed', message: 'syntax error' } });
  });

  it('renders the visual model locally without a network or renderer service', () => {
    const svg = renderVisualDiagramToSvg({
      version: 1,
      id: 'diagram-1',
      type: 'use-case',
      title: 'Offline test',
      elements: [{ id: 'actor-1', kind: 'actor', label: 'Operator', position: { x: 40, y: 40 }, size: { width: 140, height: 72 }, style: {} }],
      relationships: [],
      canvas: { zoom: 1, pan: { x: 0, y: 0 } },
    });
    expect(svg).toContain('<svg');
    expect(svg).toContain('Operator');
    expect(svg).not.toContain('http://');
    expect(svg).not.toContain('https://');
  });
});
