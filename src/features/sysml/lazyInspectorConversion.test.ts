import { describe, expect, it } from 'vitest';
import { createEmptyRepository } from '../../engine/sysml/model';
import { createEmptyRepositoryV4 } from '../../engine/sysml/domain';
import { ensureDefaultSysmlDiagrams } from '../../services/sysmlDiagramWorkspace';
import { migrateV3ToV4 } from '../../engine/sysml/persistence/migrateV3ToV4';
import { generateSysmlModel } from '../../engine/sysml/largeModelGenerator';

describe('Lazy Inspector V4 conversion gate', () => {
  it('skips V4 conversion when inspector is collapsed or no element is selected', () => {
    const fixture = generateSysmlModel({ targetElementCount: 1000, seed: 42 });

    // Simulate App.tsx gating logic
    const getInspectorRepo = (isPropertiesCollapsed: boolean, selectedIds: string[]) => {
      const shouldDerive = !isPropertiesCollapsed && selectedIds.length > 0;
      if (!shouldDerive) {
        return createEmptyRepositoryV4();
      }
      return migrateV3ToV4(fixture.repository, fixture.coordinates, fixture.diagramPresentations);
    };

    // When collapsed, O(1) empty repository (with just root Model) is returned
    const collapsedRepo = getInspectorRepo(true, ['some-element']);
    expect(Object.keys(collapsedRepo.elements).length).toBe(1);

    // When no element is selected, O(1) empty repository is returned
    const unselectedRepo = getInspectorRepo(false, []);
    expect(Object.keys(unselectedRepo.elements).length).toBe(1);

    // When an element is selected and open, full V4 repository is returned
    const activeRepo = getInspectorRepo(false, ['elem-1']);
    expect(Object.keys(activeRepo.elements).length).toBeGreaterThan(100);
  });
});
