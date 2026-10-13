import { describe, it, expect } from 'vitest';
import { generateScalabilityFixture } from '../largeModelGenerator';
import { fromRepository } from '../normalizedStore';
import { projectActiveDiagram } from './activeDiagramProjection';
import type { ModelDiagramDefinition } from '../model';

describe('Diagram Switching Performance Gate (10,000 elements)', () => {
  it('switches between BDD, IBD, package, requirements, and use-case diagrams under 100ms', () => {
    const fixture = generateScalabilityFixture({ semanticCount: 10_000, seed: 42, topology: 'distributed' });
    const repo = fixture.repository;

    // Define diagrams for each supported kind
    const diagramKinds: Array<{ id: string; kind: 'bdd' | 'ibd' | 'package' | 'requirements' | 'usecase'; name: string }> = [
      { id: 'diag-switch-bdd', kind: 'bdd', name: 'BDD View' },
      { id: 'diag-switch-ibd', kind: 'ibd', name: 'IBD View' },
      { id: 'diag-switch-package', kind: 'package', name: 'Package View' },
      { id: 'diag-switch-requirements', kind: 'requirements', name: 'Requirements View' },
      { id: 'diag-switch-usecase', kind: 'usecase', name: 'UseCase View' },
    ];

    const blockIds = Object.keys(repo.definitions).filter(id => repo.definitions[id].kind === 'block');
    const reqIds = Object.keys(repo.requirements);
    const pkgIds = Object.keys(repo.packages);

    const presentations: Record<string, { elementIds: string[] }> = { ...fixture.diagramPresentations };

    for (const d of diagramKinds) {
      repo.diagrams[d.id] = {
        id: d.id,
        name: d.name,
        kind: 'diagram',
        diagramKind: d.kind,
        ownerId: 'model',
        namespace: ['Model'],
      } as ModelDiagramDefinition;

      let elems: string[] = [];
      if (d.kind === 'bdd') elems = blockIds.slice(0, 150);
      else if (d.kind === 'ibd') elems = blockIds.slice(150, 250);
      else if (d.kind === 'package') elems = pkgIds.slice(0, 50);
      else if (d.kind === 'requirements') elems = reqIds.slice(0, 200);
      else if (d.kind === 'usecase') elems = blockIds.slice(250, 300);

      presentations[d.id] = { elementIds: elems };
    }

    const store = fromRepository(repo, fixture.coordinates, presentations);

    for (const d of diagramKinds) {
      const t0 = performance.now();
      const projection = projectActiveDiagram(store, d.id);
      const durationMs = performance.now() - t0;

      // Gate: Diagram projection must complete well within the 100 ms interaction budget
      expect(durationMs).toBeLessThan(100);

      // Verify non-empty appropriate elements
      const totalPresented = projection.blocks.length + projection.packages.length + projection.parts.length;
      expect(totalPresented).toBeGreaterThan(0);

      // Second access (cache hit) must be virtually instantaneous (< 5ms)
      const tCached = performance.now();
      const cached = projectActiveDiagram(store, d.id);
      const cachedDurationMs = performance.now() - tCached;

      expect(cachedDurationMs).toBeLessThan(5);
      expect(cached).toBe(projection); // Stable reference
    }
  });
});
