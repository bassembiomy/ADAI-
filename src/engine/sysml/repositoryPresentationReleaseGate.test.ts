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
import type { BlockDefinition, VerificationCase } from './model';
import { requiresDeletionConfirmation } from '../../services/sysmlTransactionAdapter';

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
    expect(state.diagramPresentations?.requirements?.presentations['blk-motor']).toBeUndefined();
    expect(state.diagramPresentations?.bdd?.elementIds).toContain('blk-motor');
    expect(state.diagramPresentations?.bdd?.presentations['blk-motor']).toBeDefined();

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
    expect(state.diagramPresentations?.bdd?.presentations['blk-motor']).toBeUndefined();
  });

  it('requires impact confirmation for a presentation-only TestCase deletion while removeFromDiagram stays confirmation-free', () => {
    const testCase: VerificationCase = {
      id: 'tc-1',
      name: 'TC1',
      kind: 'verificationCase',
      namespace: [],
      ownerId: 'model',
      method: 'test',
      verifiesRequirementIds: [],
    };
    let state: SysmlGatewayState = createSysmlGatewayState();
    state = executeSysmlCommand(state, {
      type: 'createAndPresent',
      element: testCase,
      diagramId: 'requirements',
      presentation: { x: 0, y: 0 },
    });
    // Presentation-only impact: zero relationships touch the TestCase.
    expect(Object.values(state.repository.relationships).filter(
      rel => rel.sourceId === 'tc-1' || rel.targetId === 'tc-1'
    )).toHaveLength(0);

    // Direct-gateway deletion without a confirmed hash must not commit.
    const preflight = executeSysmlCommand(state, { type: 'deleteElements', elementIds: ['tc-1'] });
    expect(preflight.committed).toBe(false);
    expect(preflight.impact?.affectedPresentationIds).toEqual(['requirements:tc-1']);
    expect(preflight.impact?.severity).toBe('review');
    expect(requiresDeletionConfirmation(preflight.impact!)).toBe(true);
    expect(preflight.repository.verificationCases['tc-1']).toBeDefined();

    // Remove from Diagram is not deletion: it commits without confirmation
    // and preserves the semantic element.
    const removed = executeSysmlCommand(state, { type: 'removeFromDiagram', diagramId: 'requirements', elementIds: ['tc-1'] });
    expect(removed.committed).toBe(true);
    expect(removed.repository.verificationCases['tc-1']).toBeDefined();

    // Confirmed deletion commits and clears the presentation.
    const confirmed = executeSysmlCommand(state, {
      type: 'deleteElements',
      elementIds: ['tc-1'],
      confirmedImpactHash: computeImpactHash(preflight.impact!),
    });
    expect(confirmed.committed).toBe(true);
    expect(confirmed.repository.verificationCases['tc-1']).toBeUndefined();
    expect(confirmed.diagramPresentations?.requirements?.elementIds ?? []).not.toContain('tc-1');
  });
});
