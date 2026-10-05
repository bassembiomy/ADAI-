import { describe, expect, it } from 'vitest';
import { createEmptyRepository, type InteractionDefinition, type SysmlRepository } from '../engine/sysml/model';
import { computeImpactHash, createSysmlGatewayState, executeSysmlCommand, type SysmlEditorCommand } from './sysmlCommandGateway';
import { ensureDefaultSysmlDiagrams } from './sysmlDiagramWorkspace';

const block = (id: string, name: string, operations: string[] = [], properties: any[] = []) => ({
  id, name, kind: 'block' as const, namespace: ['model'], ownerId: 'model',
  isAbstract: false, isLeaf: false, properties, ports: [], operations, constraints: [],
});

function model(): SysmlRepository {
  const repo = ensureDefaultSysmlDiagrams(createEmptyRepository()).repository;
  repo.definitions.sys = block('sys', 'System', [], [
    { id: 'drvPart', name: 'controller', kind: 'part', typeId: 'ctrl', multiplicity: { lower: 1, upper: 1, ordered: false, unique: true } },
  ]) as any;
  repo.definitions.ctrl = block('ctrl', 'Controller', ['start()']) as any;
  repo.definitions.drv = block('drv', 'Driver', ['enable(on: Boolean)']) as any;
  repo.definitions.sig = { id: 'sig', kind: 'signal', name: 'Fault', namespace: ['model'], ownerId: 'model' } as any;
  repo.definitions.int1 = {
    id: 'int1', kind: 'interaction', name: 'Startup', namespace: ['model'], ownerId: 'model',
    lifelines: [
      { id: 'l1', name: 'c', representsId: 'ctrl' },
      { id: 'l2', name: 'd', representsId: 'drv' },
      { id: 'l3', name: 'p', representsId: 'drvPart' },
    ],
    messages: [
      { id: 'm1', name: '', sort: 'synchCall', sourceLifelineId: 'l1', targetLifelineId: 'l2', order: 1, signatureId: 'enable(on: Boolean)' },
      { id: 'm2', name: '', sort: 'asynchSignal', sourceLifelineId: 'l2', targetLifelineId: 'l1', order: 2, signatureId: 'sig' },
    ],
    fragments: [],
  } as InteractionDefinition;
  return repo;
}

/** Runs a delete the way the app does: preview, then confirm with the impact hash. */
function remove(state: ReturnType<typeof createSysmlGatewayState>, ids: string[]) {
  const command: SysmlEditorCommand = { type: 'deleteElements', elementIds: ids, authorizedBaselineIds: [] };
  const preview = executeSysmlCommand(state, command);
  if (preview.committed || !preview.impact) return { preview, result: preview };
  const result = executeSysmlCommand(state, { ...command, confirmedImpactHash: computeImpactHash(preview.impact) } as SysmlEditorCommand);
  return { preview, result };
}

const errors = (diagnostics: Array<{ severity: string; code: string }>) => diagnostics.filter(d => d.severity === 'error').map(d => d.code);
const interaction = (repo: SysmlRepository) => repo.definitions.int1 as InteractionDefinition;

describe('renaming an operation that a message calls', () => {
  it('rewrites the call in the same step instead of being rejected', () => {
    const state = createSysmlGatewayState(model());
    const result = executeSysmlCommand(state, {
      type: 'updateElement', elementId: 'drv', patch: { operations: ['enableOutput(on: Boolean)'] },
    });
    expect(result.committed, JSON.stringify(result.diagnostics)).toBe(true);
    expect(interaction(result.repository).messages.find(message => message.id === 'm1')?.signatureId).toBe('enableOutput(on: Boolean)');
    expect((result.repository.definitions.drv as any).operations).toEqual(['enableOutput(on: Boolean)']);
  });

  it('undoes the Block and the message together', () => {
    const state = createSysmlGatewayState(model());
    const renamed = executeSysmlCommand(state, { type: 'updateElement', elementId: 'drv', patch: { operations: ['enableOutput(on: Boolean)'] } });
    const undone = executeSysmlCommand({ ...state, ...renamed }, { type: 'undo' });
    expect(undone.committed).toBe(true);
    expect((undone.repository.definitions.drv as any).operations).toEqual(['enable(on: Boolean)']);
    expect(interaction(undone.repository).messages.find(message => message.id === 'm1')?.signatureId).toBe('enable(on: Boolean)');
  });

  it('also follows a rename inherited by a subtype receiver', () => {
    const repo = model();
    repo.definitions.sub = { ...block('sub', 'SubDriver'), supertypeIds: ['drv'] } as any;
    repo.definitions.int1 = {
      ...interaction(repo),
      lifelines: interaction(repo).lifelines.map(lifeline => lifeline.id === 'l2' ? { ...lifeline, representsId: 'sub' } : lifeline),
    } as InteractionDefinition;
    const result = executeSysmlCommand(createSysmlGatewayState(repo), {
      type: 'updateElement', elementId: 'drv', patch: { operations: ['enableOutput(on: Boolean)'] },
    });
    expect(result.committed, JSON.stringify(result.diagnostics)).toBe(true);
    expect(interaction(result.repository).messages.find(message => message.id === 'm1')?.signatureId).toBe('enableOutput(on: Boolean)');
  });

  it('refuses to remove a called operation, naming how to fix it', () => {
    const result = executeSysmlCommand(createSysmlGatewayState(model()), {
      type: 'updateElement', elementId: 'drv', patch: { operations: [] },
    });
    expect(result.committed).toBe(false);
    expect(result.diagnostics.map(d => d.message).join(' ')).toMatch(/Rename the operation instead of removing it/);
  });

  it('leaves messages that call a different Block alone', () => {
    const repo = model();
    repo.definitions.ctrl = block('ctrl', 'Controller', ['start()', 'enable(on: Boolean)']) as any;
    const result = executeSysmlCommand(createSysmlGatewayState(repo), {
      type: 'updateElement', elementId: 'ctrl', patch: { operations: ['start()', 'enableAll(on: Boolean)'] },
    });
    expect(result.committed, JSON.stringify(result.diagnostics)).toBe(true);
    // m1 is received by Driver, not Controller, so it keeps its own operation.
    expect(interaction(result.repository).messages.find(message => message.id === 'm1')?.signatureId).toBe('enable(on: Boolean)');
  });
});

describe('deleting an element an interaction refers to', () => {
  it('leaves the lifeline untyped when its Block is deleted, and reports it for review', () => {
    const state = createSysmlGatewayState(model());
    const { preview, result } = remove(state, ['drv']);
    expect(preview.impact?.affectedBehaviorElementIds).toContain('l2');
    expect(preview.impact?.affectedDiagramKinds).toContain('sequence');
    expect(result.committed).toBe(true);
    expect(errors(result.diagnostics)).toEqual([]);
    const lifeline = interaction(result.repository).lifelines.find(candidate => candidate.id === 'l2');
    expect(lifeline).toMatchObject({ id: 'l2', name: 'd' });
    expect(lifeline?.representsId).toBeUndefined();
    // The lifeline is kept and so is every message that touches it.
    expect(interaction(result.repository).messages).toHaveLength(2);
  });

  it('leaves the message unassigned when its Signal is deleted', () => {
    const { result } = remove(createSysmlGatewayState(model()), ['sig']);
    expect(result.committed).toBe(true);
    expect(errors(result.diagnostics)).toEqual([]);
    const message = interaction(result.repository).messages.find(candidate => candidate.id === 'm2');
    expect(message?.sort).toBe('asynchSignal');
    expect(message?.signatureId).toBeUndefined();
  });

  it('clears lifelines that represent a part property when its owning Block is deleted', () => {
    const { result } = remove(createSysmlGatewayState(model()), ['sys']);
    expect(result.committed).toBe(true);
    expect(errors(result.diagnostics)).toEqual([]);
    expect(interaction(result.repository).lifelines.find(candidate => candidate.id === 'l3')?.representsId).toBeUndefined();
  });

  it('allows the next unrelated edit after such a deletion', () => {
    const { result } = remove(createSysmlGatewayState(model()), ['drv']);
    const next = executeSysmlCommand({ ...createSysmlGatewayState(result.repository), ...result }, {
      type: 'updateElement', elementId: 'ctrl', patch: { name: 'MainController' },
    });
    expect(next.committed, JSON.stringify(next.diagnostics)).toBe(true);
  });

  it('restores the references on undo', () => {
    const state = createSysmlGatewayState(model());
    const { result } = remove(state, ['drv']);
    const undone = executeSysmlCommand({ ...state, ...result }, { type: 'undo' });
    expect(undone.committed).toBe(true);
    expect(interaction(undone.repository).lifelines.find(candidate => candidate.id === 'l2')?.representsId).toBe('drv');
    expect(undone.repository.definitions.drv).toBeDefined();
  });

  it('does not touch an interaction that is deleted together with its Block', () => {
    const repo = model();
    repo.definitions.int1 = { ...interaction(repo), ownerId: 'ctrl' };
    const { preview, result } = remove(createSysmlGatewayState(repo), ['ctrl']);
    expect(result.committed, JSON.stringify(preview.diagnostics)).toBe(true);
    expect(result.repository.definitions.int1).toBeUndefined();
  });
});
