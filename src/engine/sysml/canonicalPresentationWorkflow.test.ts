import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createEmptyRepositoryV4, addSemanticElementV4, type Block, type Diagram, type Requirement } from './domain';
import { executeDisplayExistingElement } from './commands/presentationCommands';

describe('canonical cross-diagram presentation workflow', () => {
  it('preserves one semantic Block while displaying it on BDD and Requirements diagrams', () => {
    const repo = createEmptyRepositoryV4();
    const motor: Block = {
      id: 'motor', name: 'Motor', metaclass: 'Block', namespace: [], ownerId: 'pkg-root',
    };
    const requirement: Requirement = {
      id: 'req-001', name: 'REQ-001', metaclass: 'Requirement', namespace: [], ownerId: 'pkg-root',
      requirementId: 'REQ-001', text: 'The motor shall operate.', status: 'draft', version: '1.0',
    };
    const bdd: Diagram = {
      id: 'bdd-a', name: 'BDD-A', metaclass: 'Diagram', diagramKind: 'bdd', namespace: [],
      ownerId: 'pkg-root', presentationIds: [],
    };
    const requirements: Diagram = {
      id: 'requirements-a', name: 'Requirements-A', metaclass: 'Diagram', diagramKind: 'requirements',
      namespace: [], ownerId: 'pkg-root', presentationIds: [],
    };
    addSemanticElementV4(repo, motor);
    addSemanticElementV4(repo, requirement);
    addSemanticElementV4(repo, bdd);
    addSemanticElementV4(repo, requirements);

    executeDisplayExistingElement(repo, {
      type: 'DisplayExistingElement', diagramId: 'bdd-a', semanticElementId: 'motor',
      bounds: { x: 10, y: 10, width: 160, height: 100 },
    });
    executeDisplayExistingElement(repo, {
      type: 'DisplayExistingElement', diagramId: 'requirements-a', semanticElementId: 'motor',
      bounds: { x: 240, y: 10, width: 160, height: 100 },
    });

    expect(Object.values(repo.elements).filter(element => element.metaclass === 'Block')).toHaveLength(1);
    expect(Object.values(repo.presentations).filter(presentation => presentation.semanticElementId === 'motor')).toHaveLength(2);
    expect(repo.elements.motor.name).toBe('Motor');
  });

  it('derives Requirements presentation membership from the canonical store instead of a split React authority', () => {
    const source = readFileSync(new URL('../../App.tsx', import.meta.url), 'utf8');
    expect(source).toContain('Object.fromEntries(sysmlStore.diagramPresentations.entries())');
    expect(source).not.toContain('new Set(diagramPresentations.requirements?.elementIds ?? [])');
  });
});
