import { describe, expect, it } from 'vitest';
import { createEmptyRepository, type InteractionDefinition } from '../engine/sysml/model';
import { createSysmlGatewayState, executeSysmlCommand, isRejectingOnlyIntroducedErrors, setRejectOnlyIntroducedErrors } from './sysmlCommandGateway';
import { ensureDefaultSysmlDiagrams } from './sysmlDiagramWorkspace';
import { buildRemoveInteractionMessageCommand } from './sysmlInteractionCommands';
import { validateSysmlRepository } from '../engine/sysml/validation';

const block = (id: string, name: string, operations: string[] = []) => ({
  id, name, kind: 'block' as const, namespace: ['model'], ownerId: 'model',
  isAbstract: false, isLeaf: false, properties: [], ports: [], operations, constraints: [],
});

/** A model saved with a dangling lifeline, as older versions could produce. */
function brokenModel() {
  const repo = ensureDefaultSysmlDiagrams(createEmptyRepository()).repository;
  repo.definitions.ctrl = block('ctrl', 'Controller', ['start()']) as any;
  repo.definitions.int1 = {
    id: 'int1', kind: 'interaction', name: 'Startup', namespace: ['model'], ownerId: 'model',
    lifelines: [{ id: 'l1', name: 'ghost', representsId: 'deleted-block' }, { id: 'l2', name: 'c', representsId: 'ctrl' }],
    messages: [], fragments: [],
  } as InteractionDefinition;
  return repo;
}

describe('errors that already existed before a command', () => {
  it('are tolerated by default', () => {
    expect(isRejectingOnlyIntroducedErrors()).toBe(true);
  });

  it('block every edit again when the old contract is switched back on', () => {
    setRejectOnlyIntroducedErrors(false);
    try {
      const result = executeSysmlCommand(createSysmlGatewayState(brokenModel()), {
        type: 'updateElement', elementId: 'ctrl', patch: { name: 'MainController' },
      });
      expect(result.committed).toBe(false);
    } finally {
      setRejectOnlyIntroducedErrors(true);
    }
  });

  it('do not block an unrelated edit', () => {
    const result = executeSysmlCommand(createSysmlGatewayState(brokenModel()), {
      type: 'updateElement', elementId: 'ctrl', patch: { name: 'MainController' },
    });
    expect(result.committed, JSON.stringify(result.diagnostics)).toBe(true);
    // They are still reported so the UI can show them.
    expect(result.diagnostics.map(d => d.code)).toContain('MISSING_LIFELINE_REPRESENTS');
  });

  it('do not block an unrelated batch', () => {
    const result = executeSysmlCommand(createSysmlGatewayState(brokenModel()), {
      type: 'batch',
      commands: [
        { type: 'updateElement', elementId: 'ctrl', patch: { name: 'A' } },
        { type: 'updateElement', elementId: 'ctrl', patch: { name: 'B' } },
      ],
    });
    expect(result.committed, JSON.stringify(result.diagnostics)).toBe(true);
  });

  it('still reject a command that introduces a new error', () => {
    const state = createSysmlGatewayState(brokenModel());
    const result = executeSysmlCommand(state, {
      type: 'updateElement', elementId: 'int1',
      patch: { lifelines: [...(state.repository.definitions.int1 as InteractionDefinition).lifelines, { id: 'l3', name: 'new', representsId: 'also-missing' }] },
    });
    expect(result.committed).toBe(false);
    expect(result.diagnostics.some(d => d.code === 'MISSING_LIFELINE_REPRESENTS' && d.elementId === 'l3')).toBe(true);
  });

  it('are not mistaken for new errors when an earlier array item is removed', () => {
    const repo = ensureDefaultSysmlDiagrams(createEmptyRepository()).repository;
    repo.definitions.V = block('V', 'V', ['start()']) as any;
    repo.definitions.main = {
      id: 'main', kind: 'interaction', name: 'Main', namespace: ['model'], ownerId: 'model',
      lifelines: [{ id: 'a', name: 'a' }, { id: 'b', name: 'b', representsId: 'V' }],
      messages: [
        { id: 'm1', name: 'one', order: 1, sort: 'asynchCall', sourceLifelineId: 'a', targetLifelineId: 'b', signatureId: 'start()' },
        { id: 'm2', name: 'two', order: 2, sort: 'asynchCall', sourceLifelineId: 'a', targetLifelineId: 'b', signatureId: 'start()' },
        { id: 'm3', name: 'three', order: 3, sort: 'asynchCall', sourceLifelineId: 'a', targetLifelineId: 'b', signatureId: 'gone()' },
      ],
      fragments: [],
    } as InteractionDefinition;
    const state = createSysmlGatewayState(repo);
    expect(validateSysmlRepository(repo).diagnostics.some(d => d.code === 'UNKNOWN_MESSAGE_OPERATION')).toBe(true);
    const plan = buildRemoveInteractionMessageCommand(repo, { interactionId: 'main', messageId: 'm1' });
    if (!plan.ok) throw new Error(JSON.stringify(plan));
    const result = executeSysmlCommand(state, plan.command);
    expect(result.committed, JSON.stringify(result.diagnostics)).toBe(true);
    // The committed repository is seeded as the next baseline, so a following edit still works.
    const next = executeSysmlCommand({ ...state, ...result } as typeof state, { type: 'updateElement', elementId: 'V', patch: { name: 'W' } });
    expect(next.committed, JSON.stringify(next.diagnostics)).toBe(true);
  });

  it('can be repaired, after which a clean repository behaves as before', () => {
    const state = createSysmlGatewayState(brokenModel());
    const repaired = executeSysmlCommand(state, {
      type: 'updateElement', elementId: 'int1',
      patch: { lifelines: [{ id: 'l1', name: 'ghost' }, { id: 'l2', name: 'c', representsId: 'ctrl' }] },
    });
    expect(repaired.committed, JSON.stringify(repaired.diagnostics)).toBe(true);
    expect(repaired.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
  });
});
