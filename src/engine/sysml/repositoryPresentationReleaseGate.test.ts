import { describe, it, expect } from 'vitest';
import {
  createSysmlGatewayState,
  executeSysmlCommand,
  computeImpactHash,
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
    expect(Object.keys(state.repository.definitions)).toEqual(['blk-motor']);

    state = executeSysmlCommand(state, { type: 'removeFromDiagram', diagramId: 'requirements', elementIds: ['blk-motor'] });
    expect(state.repository.definitions['blk-motor']).toBeDefined();
    expect(state.diagramPresentations.bdd.elementIds).toContain('blk-motor');

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
    expect(state.diagramPresentations.bdd.elementIds).not.toContain('blk-motor');
  });
});
