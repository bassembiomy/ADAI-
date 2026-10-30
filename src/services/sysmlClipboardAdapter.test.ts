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
      // A copy next to its original needs its own qualified name.
      { type: 'createElement', element: { id: 'motor-copy', name: 'Motor2' } },
      { type: 'addToDiagram', diagramId: 'bdd', elementIds: ['motor-copy'], coordinates: { 'motor-copy': { x: 64, y: 104, width: 150, height: 100 } } },
    ] });
    expect(plan?.pastedIds).toEqual(['motor-copy']);
  });

  it('keeps the name of a cut element pasted back and numbers repeated copies', () => {
    const snapshot = createEmptyRepository();
    snapshot.definitions.motor = {
      id: 'motor', name: 'Motor', kind: 'block', namespace: ['model'], ownerId: 'model',
      isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [],
    } as BlockDefinition;
    const afterCut = createEmptyRepository();
    let n = 0;
    const cutPaste = buildSysmlPastePlan(snapshot, {}, ['motor'], 'bdd', () => `id-${n++}`, 24, afterCut);
    expect(cutPaste?.command).toMatchObject({ commands: [{ type: 'createElement', element: { name: 'Motor' } }, { type: 'addToDiagram' }] });

    const withCopy = structuredClone(snapshot);
    withCopy.definitions.motor2 = { ...snapshot.definitions.motor, id: 'motor2', name: 'Motor2' } as BlockDefinition;
    const third = buildSysmlPastePlan(snapshot, {}, ['motor'], 'bdd', () => `id-${n++}`, 24, withCopy);
    expect(third?.command).toMatchObject({ commands: [{ type: 'createElement', element: { name: 'Motor3' } }, { type: 'addToDiagram' }] });
  });
});
