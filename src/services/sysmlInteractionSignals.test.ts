import { describe, expect, it } from 'vitest';
import { createEmptyRepository, type BlockDefinition, type InteractionDefinition, type SysmlRepository } from '../engine/sysml/model';
import { argumentCount, blockReceptions, operationParameterCount, validateInteraction } from '../engine/sysml/interaction';
import { loadRepository, serializeRepository } from '../engine/sysml/persistence';
import { computeImpactHash, createSysmlGatewayState, executeSysmlCommand, type SysmlEditorCommand } from './sysmlCommandGateway';
import { ensureDefaultSysmlDiagrams } from './sysmlDiagramWorkspace';
import {
  buildCreateOperationForMessageCommand, buildCreateSignalForMessageCommand, listSignalCandidates,
} from './sysmlInteractionCommands';

const block = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
  id, name, kind: 'block' as const, namespace: ['model'], ownerId: 'model',
  isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [], ...extra,
});
const signal = (id: string, name: string) => ({ id, name, kind: 'signal' as const, namespace: ['model'], ownerId: 'model' });

/** Driver receives Fault (and inherits Reset from BaseDriver); Plain declares no receptions. */
function model(): SysmlRepository {
  const repo = ensureDefaultSysmlDiagrams(createEmptyRepository()).repository;
  repo.definitions.fault = signal('fault', 'Fault') as any;
  repo.definitions.reset = signal('reset', 'Reset') as any;
  repo.definitions.alarm = signal('alarm', 'Alarm') as any;
  repo.definitions.baseDriver = block('baseDriver', 'BaseDriver', { receptions: ['reset'] }) as any;
  repo.definitions.driver = block('driver', 'Driver', { supertypeIds: ['baseDriver'], receptions: ['fault'], operations: ['enable(on: Boolean, level: Integer)'] }) as any;
  repo.definitions.plain = block('plain', 'Plain') as any;
  repo.definitions.ctrl = block('ctrl', 'Controller') as any;
  repo.definitions.int1 = {
    id: 'int1', kind: 'interaction', name: 'Run', namespace: ['model'], ownerId: 'model',
    lifelines: [
      { id: 'c', name: 'c', representsId: 'ctrl' },
      { id: 'd', name: 'd', representsId: 'driver' },
      { id: 'p', name: 'p', representsId: 'plain' },
    ],
    messages: [],
    fragments: [],
  } as InteractionDefinition;
  return repo;
}

const interaction = (repo: SysmlRepository) => repo.definitions.int1 as InteractionDefinition;
const withMessages = (repo: SysmlRepository, messages: Array<Record<string, unknown>>): InteractionDefinition => ({
  ...interaction(repo),
  messages: messages.map((message, index) => ({ id: `m${index + 1}`, name: '', order: index + 1, ...message })),
}) as InteractionDefinition;
const codes = (repo: SysmlRepository, next: InteractionDefinition) => validateInteraction(repo, next).map(d => `${d.severity}:${d.code}`);
const signalTo = (target: string, signatureId: string) => ({ sort: 'asynchSignal', sourceLifelineId: 'c', targetLifelineId: target, signatureId });

describe('receptions', () => {
  it('lists the Signals a Block receives, inherited ones included', () => {
    const repo = model();
    expect(blockReceptions(repo, repo.definitions.driver as BlockDefinition).sort()).toEqual(['fault', 'reset']);
    expect(blockReceptions(repo, repo.definitions.plain as BlockDefinition)).toEqual([]);
  });

  it('accepts a Signal the receiver receives, own or inherited', () => {
    const repo = model();
    expect(codes(repo, withMessages(repo, [signalTo('d', 'fault'), signalTo('d', 'reset')]))).toEqual([]);
  });

  it('warns, never errors, about a Signal the receiver does not receive', () => {
    const repo = model();
    expect(codes(repo, withMessages(repo, [signalTo('d', 'alarm')]))).toEqual(['warning:SIGNAL_NOT_RECEIVED']);
  });

  it('stays quiet for a receiver that declares no receptions, or an untyped one', () => {
    const repo = model();
    expect(codes(repo, withMessages(repo, [signalTo('p', 'alarm')]))).toEqual([]);
    const untyped = { ...withMessages(repo, [signalTo('x', 'alarm')]), lifelines: [...interaction(repo).lifelines, { id: 'x', name: 'x' }] };
    expect(codes(repo, untyped)).toEqual([]);
  });

  it('reports a reception that names a missing Signal as a repository error', () => {
    const result = executeSysmlCommand(createSysmlGatewayState(model()), { type: 'updateElement', elementId: 'driver', patch: { receptions: ['gone'] } });
    expect(result.committed).toBe(false);
    expect(result.diagnostics.map(d => d.code)).toContain('MISSING_RECEPTION_SIGNAL');
  });

  it('survives save and load', () => {
    const loaded = loadRepository(serializeRepository(model())).repository;
    expect((loaded.definitions.driver as BlockDefinition).receptions).toEqual(['fault']);
  });

  it('drops a deleted Signal from receptions and from the message that sent it, and undoes together', () => {
    const repo = model();
    repo.definitions.int1 = withMessages(repo, [signalTo('d', 'fault')]);
    const state = createSysmlGatewayState(repo);
    const command = { type: 'deleteElements' as const, elementIds: ['fault'], authorizedBaselineIds: [] };
    const preview = executeSysmlCommand(state, command);
    const result = preview.committed ? preview : executeSysmlCommand(state, { ...command, confirmedImpactHash: computeImpactHash(preview.impact!) });
    expect(result.committed, JSON.stringify(result.diagnostics)).toBe(true);
    expect(result.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
    expect((result.repository.definitions.driver as BlockDefinition).receptions).toEqual([]);
    expect(interaction(result.repository).messages[0].signatureId).toBeUndefined();

    const undone = executeSysmlCommand({ ...state, ...result }, { type: 'undo' });
    expect((undone.repository.definitions.driver as BlockDefinition).receptions).toEqual(['fault']);
    expect(interaction(undone.repository).messages[0].signatureId).toBe('fault');
  });
});

describe('signal and operation pickers', () => {
  it('lists received Signals first, then the rest', () => {
    const repo = model();
    const candidates = listSignalCandidates(repo, 'int1', 'd');
    expect(candidates.map(candidate => [candidate.id, candidate.received])).toEqual([['fault', true], ['reset', true], ['alarm', false]]);
    expect(listSignalCandidates(repo, 'int1', 'p').every(candidate => !candidate.received)).toBe(true);
  });

  it('creates an operation on the receiving Block and points the call at it, as one undoable step', () => {
    const repo = model();
    repo.definitions.int1 = withMessages(repo, [{ sort: 'asynchCall', sourceLifelineId: 'c', targetLifelineId: 'p' }]);
    const plan = buildCreateOperationForMessageCommand(repo, { interactionId: 'int1', messageId: 'm1' });
    expect(plan.ok).toBe(true);
    const state = createSysmlGatewayState(repo);
    const result = executeSysmlCommand(state, (plan as any).command as SysmlEditorCommand);
    expect(result.committed, JSON.stringify(result.diagnostics)).toBe(true);
    expect((result.repository.definitions.plain as BlockDefinition).operations).toEqual(['operation()']);
    expect(interaction(result.repository).messages[0].signatureId).toBe('operation()');
    expect(result.diagnostics.filter(d => d.severity === 'error')).toEqual([]);

    const again = buildCreateOperationForMessageCommand(result.repository, { interactionId: 'int1', messageId: 'm1' });
    const second = executeSysmlCommand({ ...state, ...result }, (again as any).command);
    expect((second.repository.definitions.plain as BlockDefinition).operations).toEqual(['operation()', 'operation_1()']);

    const undone = executeSysmlCommand({ ...state, ...result }, { type: 'undo' });
    expect((undone.repository.definitions.plain as BlockDefinition).operations).toEqual([]);
    expect(interaction(undone.repository).messages[0].signatureId).toBeUndefined();
  });

  it('refuses an operation for a message that is not a call, or whose receiver has no Block', () => {
    const repo = model();
    repo.definitions.int1 = withMessages(repo, [signalTo('d', 'fault'), { sort: 'asynchCall', sourceLifelineId: 'c', targetLifelineId: 'c' }]);
    expect(buildCreateOperationForMessageCommand(repo, { interactionId: 'int1', messageId: 'm1' })).toMatchObject({ ok: false, diagnostics: [{ code: 'MESSAGE_NOT_A_CALL' }] });
    const untyped = withMessages(repo, [{ sort: 'asynchCall', sourceLifelineId: 'c', targetLifelineId: 'x' }]);
    repo.definitions.int1 = { ...untyped, lifelines: [...untyped.lifelines, { id: 'x', name: 'x' }] };
    expect(buildCreateOperationForMessageCommand(repo, { interactionId: 'int1', messageId: 'm1' })).toMatchObject({ ok: false, diagnostics: [{ code: 'NO_RECEIVING_BLOCK' }] });
  });

  it('creates a Signal, assigns it, and adds it to a receiver that lists its receptions', () => {
    const repo = model();
    repo.definitions.int1 = withMessages(repo, [{ sort: 'asynchSignal', sourceLifelineId: 'c', targetLifelineId: 'd' }]);
    const plan = buildCreateSignalForMessageCommand(repo, { interactionId: 'int1', messageId: 'm1', signalId: 'newSig' });
    expect(plan.ok).toBe(true);
    const result = executeSysmlCommand(createSysmlGatewayState(repo), (plan as any).command);
    expect(result.committed, JSON.stringify(result.diagnostics)).toBe(true);
    expect(result.repository.definitions.newSig).toMatchObject({ kind: 'signal', name: 'Signal', ownerId: 'model' });
    expect(interaction(result.repository).messages[0].signatureId).toBe('newSig');
    expect((result.repository.definitions.driver as BlockDefinition).receptions).toEqual(['fault', 'newSig']);
    expect(result.diagnostics.filter(d => d.severity === 'error' || d.code === 'SIGNAL_NOT_RECEIVED')).toEqual([]);
  });

  it('leaves a receiver without receptions alone when creating a Signal', () => {
    const repo = model();
    repo.definitions.int1 = withMessages(repo, [{ sort: 'asynchSignal', sourceLifelineId: 'c', targetLifelineId: 'p' }]);
    const plan = buildCreateSignalForMessageCommand(repo, { interactionId: 'int1', messageId: 'm1', signalId: 'newSig' });
    const result = executeSysmlCommand(createSysmlGatewayState(repo), (plan as any).command);
    expect(result.committed, JSON.stringify(result.diagnostics)).toBe(true);
    expect((result.repository.definitions.plain as BlockDefinition).receptions).toBeUndefined();
  });
});

describe('argument count', () => {
  it('counts parameters and arguments, ignoring commas inside brackets and quotes', () => {
    expect(operationParameterCount('start()')).toBe(0);
    expect(operationParameterCount('enable(on: Boolean, level: Integer)')).toBe(2);
    expect(operationParameterCount('put(map: Map<K, V>, key: String)')).toBe(2);
    expect(operationParameterCount('noParens')).toBe(0);
    expect(argumentCount(undefined)).toBe(0);
    expect(argumentCount('true, 3')).toBe(2);
    expect(argumentCount('f(1, 2), "a, b"')).toBe(2);
  });

  const call = (args?: string) => ({ sort: 'synchCall', sourceLifelineId: 'c', targetLifelineId: 'd', signatureId: 'enable(on: Boolean, level: Integer)', ...(args === undefined ? {} : { arguments: args }) });

  it('warns when the number of arguments differs from the parameters', () => {
    const repo = model();
    expect(codes(repo, withMessages(repo, [call('true')]))).toEqual(['warning:ARGUMENT_COUNT_MISMATCH']);
    expect(codes(repo, withMessages(repo, [call('true, 3, 9')]))).toEqual(['warning:ARGUMENT_COUNT_MISMATCH']);
  });

  it('accepts a matching count, and says nothing when no arguments were written', () => {
    const repo = model();
    expect(codes(repo, withMessages(repo, [call('true, 3')]))).toEqual([]);
    expect(codes(repo, withMessages(repo, [call()]))).toEqual([]);
  });
});
