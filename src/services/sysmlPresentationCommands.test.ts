import { describe, expect, it } from 'vitest';
import { buildDiagramPresentationBatch, buildPortLayoutCommand } from './sysmlPresentationCommands';
import { createEmptyRepository } from '../engine/sysml/model';
import { createSysmlGatewayState, executeSysmlCommand } from './sysmlCommandGateway';

describe('diagram-scoped SysML presentation commands', () => {
  it('batches requirements auto-layout as per-diagram updates', () => {
    expect(buildDiagramPresentationBatch('requirements', [{ elementId: 'req-1', x: 20, y: 40 }])).toEqual({
      type: 'batch',
      commands: [{ type: 'updatePresentation', diagramId: 'requirements', elementId: 'req-1', presentation: { x: 20, y: 40 } }],
    });
  });

  it('persists dragged port layout on the selected diagram presentation only', () => {
    expect(buildPortLayoutCommand('ibd-vehicle', 'left-motor', 'p-control', 'right', 1.2, { presentationExists: true })).toEqual({
      type: 'updatePresentation', diagramId: 'ibd-vehicle', elementId: 'left-motor', presentation: {},
      portLayouts: { 'p-control': { side: 'right', offset: 1 } },
    });
  });

  it('commits port layout to the scoped presentation and projects it without changing semantics', () => {
    const repository = createEmptyRepository();
    repository.definitions.vehicle = {
      id: 'vehicle', name: 'Vehicle', kind: 'block', namespace: ['model'], ownerId: 'model',
      isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [],
    };
    repository.definitions.motor = {
      id: 'motor', name: 'Motor', kind: 'block', namespace: ['model'], ownerId: 'model',
      isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [],
    };
    repository.usages['left-motor'] = {
      id: 'left-motor', kind: 'part', name: 'leftMotor', ownerId: 'vehicle', typeId: 'motor', aggregation: 'composite',
      multiplicity: { lower: 1, upper: 1, ordered: false, unique: true },
    };
    const state = createSysmlGatewayState(repository, {}, { 'ibd-vehicle': { elementIds: ['left-motor'] } });
    const result = executeSysmlCommand(state, buildPortLayoutCommand('ibd-vehicle', 'left-motor', 'p-control', 'right', 0.75, { presentationExists: true }));

    expect(result.committed).toBe(true);
    expect(result.diagramPresentations['ibd-vehicle'].presentations['left-motor'].portLayouts).toEqual({ 'p-control': { side: 'right', offset: 0.75 } });
    expect(result.repository.usages['left-motor']).not.toHaveProperty('portLayouts');
    expect(result.view.parts[0]?.portLayouts).toEqual({ 'p-control': { side: 'right', offset: 0.75 } });
  });

  it('creates the missing IBD context presentation before saving a dragged Block port layout', () => {
    const repository = createEmptyRepository();
    repository.definitions.vehicle = {
      id: 'vehicle', name: 'Vehicle', kind: 'block', namespace: ['model'], ownerId: 'model',
      isAbstract: false, isLeaf: false, properties: [],
      ports: [{
        id: 'p-control', name: 'control', kind: 'standard', typeId: 'if-control', direction: 'in', isConjugated: false,
        multiplicity: { lower: 1, upper: 1, ordered: false, unique: true },
      }],
      operations: [], constraints: [],
    };
    const originalRepository = structuredClone(repository);
    const state = createSysmlGatewayState(repository);

    const result = executeSysmlCommand(state, buildPortLayoutCommand('vehicle-ibd', 'vehicle', 'p-control', 'right', 0.75, {
      bounds: { x: 50, y: 50, width: 1200, height: 800 },
    }));

    expect(result.committed, JSON.stringify(result.diagnostics)).toBe(true);
    expect(result.diagramPresentations['vehicle-ibd']).toMatchObject({
      elementIds: ['vehicle'],
      presentations: { vehicle: { semanticElementId: 'vehicle', bounds: { x: 50, y: 50, width: 1200, height: 800 }, portLayouts: { 'p-control': { side: 'right', offset: 0.75 } } } },
    });
    expect(result.repository).toEqual(originalRepository);
    expect(result.coordinates.vehicle).toBeUndefined();
  });
});
