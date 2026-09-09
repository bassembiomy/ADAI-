import { describe, expect, it } from 'vitest';
import { OfflinePlantUmlRenderer } from './offlinePlantUmlRenderer';

describe('offline PlantUML renderer boundary', () => {
  it('renders through an injected local renderer and never requires a URL', async () => {
    const renderer = new OfflinePlantUmlRenderer(async (source) => `<svg data-source="${source.length}"/>`);
    await expect(renderer.render('@startuml\n@enduml')).resolves.toEqual({ svg: '<svg data-source="17"/>' });
  });

  it('maps local renderer failures to structured errors', async () => {
    const renderer = new OfflinePlantUmlRenderer(async () => { throw new Error('syntax error'); });
    await expect(renderer.render('bad')).resolves.toEqual({ error: { code: 'render-failed', message: 'syntax error' } });
  });
});
