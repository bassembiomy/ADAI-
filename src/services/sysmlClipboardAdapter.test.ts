import { describe, expect, it } from 'vitest';
import { createEmptyRepository, type BlockDefinition } from '../engine/sysml/model';
import { buildSysmlPastePlan } from './sysmlClipboardAdapter';

describe('buildSysmlPastePlan', () => {
  it('creates copied semantics and diagram-specific offset presentations in one gateway batch', () => {
    const repository = createEmptyRepository();
    const motor: BlockDefinition = {
      id: 'motor', name: 'Motor', kind: 'block', namespace: ['model'], ownerId: 'model',
      isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [],
    };
    repository.definitions.motor = motor;
    const plan = buildSysmlPastePlan(repository, {
      bdd: { elementIds: ['motor'], presentations: { motor: { id: 'pres', diagramId: 'bdd', semanticElementId: 'motor', bounds: { x: 40, y: 80, width: 150, height: 100 } } } },
    }, ['motor'], 'bdd', () => 'motor-copy');

    expect(plan?.command).toMatchObject({ type: 'batch', commands: [
      { type: 'createElement', element: { id: 'motor-copy', name: 'Motor' } },
      { type: 'addToDiagram', diagramId: 'bdd', elementIds: ['motor-copy'], coordinates: { 'motor-copy': { x: 64, y: 104, width: 150, height: 100 } } },
    ] });
    expect(plan?.pastedIds).toEqual(['motor-copy']);
  });
});
