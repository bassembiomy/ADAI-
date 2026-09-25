import { describe, it, expect } from 'vitest';
import {
  createSysmlGatewayState,
  executeSysmlCommand,
  computeImpactHash,
  buildCanonicalSysmlProjectPayload,
  loadCanonicalSysmlProject,
  projectLegacyDiagram,
  type SysmlGatewayState,
} from '../../services/sysmlCommandGateway';
import type { BlockDefinition } from './model';

describe('SysML Repository/Presentation Release Gate', () => {
  it('keeps one Block identity across Requirements and BDD and separates both deletion modes', () => {
    const block: BlockDefinition = {
      id: 'blk-motor',
      name: 'Motor',
      kind: 'block',
      namespace: [],
      ownerId: 'model',
      isAbstract: false,
      isLeaf: false,
      properties: [],
      ports: [],
      operations: [],
      constraints: [],
    };
    const initial = createSysmlGatewayState();
    const created = executeSysmlCommand(initial, {
      type: 'createAndPresent',
      element: block,
      diagramId: 'requirements',
      presentation: { x: 0, y: 0 },
    });
    let state: SysmlGatewayState = created;
    state = executeSysmlCommand(state, { type: 'addToDiagram', diagramId: 'bdd', elementIds: ['blk-motor'] });
    state = executeSysmlCommand(state, {
      type: 'updatePresentation', diagramId: 'requirements', elementId: 'blk-motor',
      presentation: { x: 10, y: 20 },
    });
    state = executeSysmlCommand(state, {
      type: 'updatePresentation', diagramId: 'bdd', elementId: 'blk-motor',
      presentation: { x: 400, y: 500 },
    });
    expect(Object.keys(state.repository.definitions)).toEqual(['blk-motor']);
    expect(state.diagramPresentations?.requirements?.presentations['blk-motor'].id)
      .not.toBe(state.diagramPresentations?.bdd?.presentations['blk-motor'].id);

    const saved = buildCanonicalSysmlProjectPayload(state, { version: '1', projectName: 'Release gate' });
    const loaded = loadCanonicalSysmlProject(saved);
    expect(Object.keys(loaded.repository.definitions)).toEqual(['blk-motor']);
    expect(projectLegacyDiagram(loaded.repository, loaded.coordinates, loaded.diagramPresentations, 'requirements').blocks[0])
      .toMatchObject({ id: 'blk-motor', x: 10, y: 20 });
    expect(projectLegacyDiagram(loaded.repository, loaded.coordinates, loaded.diagramPresentations, 'bdd').blocks[0])
      .toMatchObject({ id: 'blk-motor', x: 400, y: 500 });

    state = executeSysmlCommand(state, { type: 'removeFromDiagram', diagramId: 'requirements', elementIds: ['blk-motor'] });
    expect(state.repository.definitions['blk-motor']).toBeDefined();
    expect(state.diagramPresentations?.bdd?.elementIds).toContain('blk-motor');

    const preflight = executeSysmlCommand(state, { type: 'deleteElements', elementIds: ['blk-motor'] });
    const deleted = preflight.impact
      ? executeSysmlCommand(state, {
          type: 'deleteElements',
          elementIds: ['blk-motor'],
          confirmedImpactHash: computeImpactHash(preflight.impact),
        })
      : preflight;
    state = deleted;
    expect(state.repository.definitions['blk-motor']).toBeUndefined();
    expect(state.diagramPresentations?.bdd?.elementIds ?? []).not.toContain('blk-motor');
  });
});
