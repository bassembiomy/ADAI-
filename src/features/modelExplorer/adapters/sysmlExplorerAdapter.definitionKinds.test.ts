import { describe, expect, it } from 'vitest';
import { createSysmlExplorerAdapter } from './sysmlExplorerAdapter';
import { createModelExplorerCommandBus } from '../modelExplorerCommandBus';
import { createSysmlGatewayState, executeSysmlCommand, type SysmlGatewayState } from '../../../services/sysmlCommandGateway';

function harness() {
  let state: SysmlGatewayState = createSysmlGatewayState();
  return {
    getState: () => state,
    executeCommand: (command: any) => {
      const result = executeSysmlCommand(state, command);
      if (result.committed) {
        state = {
          repository: result.repository, history: result.history, store: result.store, patchHistory: result.patchHistory,
          coordinates: result.coordinates, diagramPresentations: result.diagramPresentations,
          presentationHistory: result.presentationHistory, actionStack: result.actionStack, redoStack: result.redoStack,
        };
      }
      return result;
    },
  };
}

describe('model explorer creates and shows Enumeration, Signal and ConstraintBlock', () => {
  it.each([
    ['enumeration', 'Enumeration'],
    ['signal', 'Signal'],
    ['constraintBlock', 'ConstraintBlock'],
  ])('creates a %s under the model and lists it in the tree', (elementKind, baseName) => {
    const h = harness();
    const adapter = createSysmlExplorerAdapter(h);
    const result = createModelExplorerCommandBus(adapter).dispatch({ type: 'createElement', ownerId: 'model', elementKind } as never);
    expect(result.committed).toBe(true);
    const id = result.selectedIds![0];
    expect(h.getState().repository.definitions[id]).toMatchObject({ kind: elementKind, ownerId: 'model' });
    expect(h.getState().repository.definitions[id].name).toContain(baseName);
    const node = adapter.project('containment').nodes[`sysml:element:${id}`];
    expect(node).toMatchObject({ semanticId: id, kind: elementKind });
  });

  it.each([
    ['unit', 'Unit'],
    ['quantityKind', 'QuantityKind'],
  ])('creates a %s under the model, lists it in the tree, and undoes the creation', (elementKind, baseName) => {
    const h = harness();
    const adapter = createSysmlExplorerAdapter(h);
    const result = createModelExplorerCommandBus(adapter).dispatch({ type: 'createElement', ownerId: 'model', elementKind } as never);
    expect(result.committed).toBe(true);
    const id = result.selectedIds![0];
    expect(h.getState().repository.definitions[id]).toMatchObject({ kind: elementKind, ownerId: 'model' });
    expect(h.getState().repository.definitions[id].name).toContain(baseName);
    if (elementKind === 'unit') expect((h.getState().repository.definitions[id] as { symbol: string }).symbol.length).toBeGreaterThan(0);
    expect(adapter.project('containment').nodes[`sysml:element:${id}`]).toMatchObject({ semanticId: id, kind: elementKind });
    const undone = h.executeCommand({ type: 'undo' });
    expect(undone.committed).toBe(true);
    expect(h.getState().repository.definitions[id]).toBeUndefined();
  });

  it('offers Unit and QuantityKind as things a Package can own', () => {
    const adapter = createSysmlExplorerAdapter(harness());
    const labels = adapter.capabilities(['model']).filter((c: { kind: string }) => c.kind === 'createElement').map((c: { elementKind?: string }) => c.elementKind);
    expect(labels).toEqual(expect.arrayContaining(['unit', 'quantityKind']));
  });

  it('offers them as things a Package can own', () => {
    const adapter = createSysmlExplorerAdapter(harness());
    const labels = adapter.capabilities(['model']).filter((c: { kind: string }) => c.kind === 'createElement').map((c: { elementKind?: string }) => c.elementKind);
    expect(labels).toEqual(expect.arrayContaining(['enumeration', 'signal', 'constraintBlock']));
  });
});
