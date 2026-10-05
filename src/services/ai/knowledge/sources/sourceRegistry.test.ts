import { describe, expect, it } from 'vitest';
import { canonicalSourceUrl, deriveSourceId, KnowledgeSourceSchema } from './sourceSchemas';
import { SourceRegistry } from './sourceRegistry';
import { SEED_SOURCES } from './seedSources';

describe('engineering knowledge source registry', () => {
  it('provides the approved metadata-only seed sources', () => {
    expect(SEED_SOURCES).toHaveLength(6);
    expect(SEED_SOURCES.map(source => source.title)).toEqual(expect.arrayContaining([
      'Official MathWorks Simulink documentation',
      'MathWorks Simulink Model Finder',
      'MathWorks Simulink Model Reference',
      'MATLAB Central File Exchange',
      'Simulink-tagged MATLAB Central File Exchange',
      'GitHub Simulink repository search'
    ]));

    for (const source of SEED_SOURCES) {
      expect(KnowledgeSourceSchema.parse(source)).toEqual(source);
      expect(source.retrievalPolicy).toEqual({ mode: 'metadata_only' });
      expect(source.enabled).toBe(true);
      expect(source.id).toBe(deriveSourceId(source.url));
    }
  });

  it('canonicalizes URLs before deriving deterministic IDs', () => {
    const canonical = canonicalSourceUrl('HTTPS://Example.com/docs/?b=2&a=1#fragment');
    expect(canonical).toBe('https://example.com/docs?a=1&b=2');
    expect(deriveSourceId('https://example.com/docs')).toBe(deriveSourceId('https://EXAMPLE.com/docs/'));
  });

  it('supports validated seed, get, and filtered deterministic list operations', () => {
    const registry = new SourceRegistry();
    expect(registry.seed(SEED_SOURCES)).toHaveLength(6);
    expect(registry.get(deriveSourceId(SEED_SOURCES[0].url))).toEqual(SEED_SOURCES[0]);
    expect(registry.list({ provider: 'MathWorks' })).toHaveLength(5);
    expect(registry.list({ sourceType: 'repository_search' })).toHaveLength(1);
    expect(registry.list().map(source => source.id)).toEqual(
      [...registry.list()].map(source => source.id).sort()
    );
  });

  it('rejects duplicate IDs with conflicting source metadata', () => {
    const registry = new SourceRegistry();
    registry.seed([SEED_SOURCES[0]]);
    expect(() => registry.seed([{ ...SEED_SOURCES[0], title: 'Conflicting title' }])).toThrow(/SOURCE_CONFLICT/);
  });
});
