import { describe, expect, it } from 'vitest';
import { createEmptyRepository, type InteractionDefinition, type SysmlRepository } from '../engine/sysml/model';
import { FOUND_ENDPOINT, LOST_ENDPOINT, validateInteraction } from '../engine/sysml/interaction';
import { loadRepository, serializeRepository } from '../engine/sysml/persistence';
import { interactionToPlantUml } from '../features/plantuml/adapters/sysmlInteractionToPlantUml';
import { createSysmlGatewayState, executeSysmlCommand, type SysmlCommandResult, type SysmlEditorCommand, type SysmlGatewayState } from './sysmlCommandGateway';
import { ensureDefaultSysmlDiagrams } from './sysmlDiagramWorkspace';
import { buildSequenceDiagramView, messageSentence } from '../features/sysml/sequenceDiagramView';
import { buildAddFragmentCommand, buildAddInteractionMessageCommand, buildRemoveLifelineCommand, buildUpdateInteractionMessageCommand } from './sysmlInteractionCommands';

const msg = (id: string, order: number, sort: string, from: string, to: string, extra = {}) => ({ id, name: id, order, sort, sourceLifelineId: from, targetLifelineId: to, ...extra });

function model(messages: unknown[] = []): SysmlRepository {
  const repo = ensureDefaultSysmlDiagrams(createEmptyRepository()).repository;
  repo.definitions.main = {
    id: 'main', name: 'Main', kind: 'interaction', namespace: [], ownerId: 'model',
    lifelines: [{ id: 'a', name: 'a' }, { id: 'b', name: 'b' }],
    messages, fragments: [],
  } as InteractionDefinition;
  repo.diagrams.mainDiagram = { id: 'mainDiagram', kind: 'diagram', name: 'Main', namespace: [], ownerId: 'main', contextElementId: 'main', diagramKind: 'sequence' } as any;
  return repo;
}
const mainOf = (repo: SysmlRepository) => repo.definitions.main as InteractionDefinition;
const codes = (repo: SysmlRepository) => validateInteraction(repo, mainOf(repo)).map(d => `${d.severity}:${d.code}`);

interface Ctx { state: SysmlGatewayState }
function run(ctx: Ctx, command: SysmlEditorCommand): SysmlCommandResult {
  const result = executeSysmlCommand(ctx.state, command);
  if (result.committed) ctx.state = { ...ctx.state, ...result } as SysmlGatewayState;
  return result;
}

describe('lost and found message rules', () => {
  it('accepts an asynchronous call to a lost end and a signal from a found end', () => {
    expect(codes(model([msg('m1', 1, 'asynchCall', 'a', LOST_ENDPOINT), msg('m2', 2, 'asynchSignal', FOUND_ENDPOINT, 'b')]))).toEqual(['warning:SIGNAL_MESSAGE_WITHOUT_SIGNAL']);
  });

  it('rejects synchronous calls, a lost source, a found target, two sentinels and an unknown lifeline', () => {
    for (const bad of [
      msg('m', 1, 'synchCall', 'a', LOST_ENDPOINT),
      msg('m', 1, 'asynchCall', LOST_ENDPOINT, 'a'),
      msg('m', 1, 'asynchCall', 'a', FOUND_ENDPOINT),
      msg('m', 1, 'asynchCall', FOUND_ENDPOINT, LOST_ENDPOINT),
      msg('m', 1, 'asynchCall', 'nope', LOST_ENDPOINT),
    ]) {
      expect(codes(model([bad])), JSON.stringify(bad)).toEqual(['error:LOST_FOUND_INVALID']);
    }
  });

  it('still reports an ordinary message to a missing lifeline', () => {
    expect(codes(model([msg('m', 1, 'asynchCall', 'a', 'nope')]))).toEqual(['error:MESSAGE_ENDPOINT_MISSING']);
  });
});

describe('lost and found layout', () => {
  it('ends a lost message and starts a found message at a circle beside the real lifeline', () => {
    const repo = model([msg('m1', 1, 'asynchCall', 'a', LOST_ENDPOINT), msg('m2', 2, 'asynchCall', FOUND_ENDPOINT, 'b')]);
    const view = buildSequenceDiagramView(repo, 'mainDiagram');
    const [lost, found] = view.messages;
    const [a, b] = view.lifelines;
    expect(lost.lostFound).toBe('lost');
    expect(lost.circleAt!.x).toBeGreaterThan(a.centerX);
    expect(lost.points[lost.points.length - 1]).toEqual(lost.circleAt);
    expect(found.lostFound).toBe('found');
    // b is the last lifeline, so the circle goes to its left.
    expect(found.circleAt!.x).toBeLessThan(b.centerX);
    expect(found.points[0]).toEqual(found.circleAt);
    expect(view.messages.map(entry => entry.text)).toEqual(['1: m1', '2: m2']);
  });

  it('names the missing end in sentences, never an id', () => {
    const repo = model([msg('m1', 1, 'asynchCall', 'a', LOST_ENDPOINT), msg('m2', 2, 'asynchCall', FOUND_ENDPOINT, 'b')]);
    expect(messageSentence(repo, 'main', 'm1')).toBe('m1 (a → lost)');
    expect(messageSentence(repo, 'main', 'm2')).toBe('m2 (found → b)');
  });
});

describe('lost and found commands', () => {
  const ctx = (): Ctx => ({ state: createSysmlGatewayState(model()) });

  it('adds a lost and a found message as one undo step each, and keeps them through save and load', () => {
    const c = ctx();
    for (const input of [
      { sourceLifelineId: 'a', targetLifelineId: LOST_ENDPOINT, id: 'm1' },
      { sourceLifelineId: FOUND_ENDPOINT, targetLifelineId: 'b', id: 'm2' },
    ]) {
      const plan = buildAddInteractionMessageCommand(c.state.repository, { interactionId: 'main', sort: 'asynchCall', ...input });
      expect(plan.ok).toBe(true);
      const result = run(c, (plan as { command: SysmlEditorCommand }).command);
      expect(result.committed, JSON.stringify(result.diagnostics)).toBe(true);
    }
    const loaded = loadRepository(serializeRepository(c.state.repository)).repository;
    expect((loaded.definitions.main as InteractionDefinition).messages.map(message => [message.sourceLifelineId, message.targetLifelineId]))
      .toEqual([['a', LOST_ENDPOINT], [FOUND_ENDPOINT, 'b']]);
    expect(mainOf(run(c, { type: 'undo' }).repository).messages).toHaveLength(1);
  });

  it('refuses a synchronous lost message and changing a lost message into a synchronous call', () => {
    const c = ctx();
    expect(buildAddInteractionMessageCommand(c.state.repository, { interactionId: 'main', sort: 'synchCall', sourceLifelineId: 'a', targetLifelineId: LOST_ENDPOINT }))
      .toMatchObject({ ok: false, diagnostics: [{ code: 'LOST_FOUND_INVALID' }] });
    const plan = buildAddInteractionMessageCommand(c.state.repository, { interactionId: 'main', sort: 'asynchCall', sourceLifelineId: 'a', targetLifelineId: LOST_ENDPOINT, id: 'm1' });
    run(c, (plan as { command: SysmlEditorCommand }).command);
    expect(buildUpdateInteractionMessageCommand(c.state.repository, { interactionId: 'main', messageId: 'm1', sort: 'synchCall' }))
      .toMatchObject({ ok: false, diagnostics: [{ code: 'LOST_FOUND_INVALID' }] });
  });

  it('encloses lost messages in a fragment that covers only the real lifeline', () => {
    const c: Ctx = { state: createSysmlGatewayState(model([msg('m1', 1, 'asynchCall', 'a', LOST_ENDPOINT)])) };
    const plan = buildAddFragmentCommand(c.state.repository, { interactionId: 'main', operator: 'opt', messageIds: ['m1'], id: 'f1' });
    expect(plan.ok).toBe(true);
    const result = run(c, (plan as { command: SysmlEditorCommand }).command);
    expect(result.committed, JSON.stringify(result.diagnostics)).toBe(true);
    expect(mainOf(c.state.repository).fragments[0].coveredLifelineIds).toEqual(['a']);
  });

  it('deleting the real lifeline deletes its lost message', () => {
    const c: Ctx = { state: createSysmlGatewayState(model([msg('m1', 1, 'asynchCall', 'a', LOST_ENDPOINT)])) };
    const plan = buildRemoveLifelineCommand(c.state.repository, { interactionId: 'main', lifelineId: 'a' });
    expect(plan.ok).toBe(true);
    run(c, (plan as { command: SysmlEditorCommand }).command);
    expect(mainOf(c.state.repository).messages).toEqual([]);
  });
});

describe('lost and found export', () => {
  it('exports them as messages to and from the diagram border', () => {
    const repo = model([msg('m1', 1, 'asynchCall', 'a', LOST_ENDPOINT), msg('m2', 2, 'asynchCall', FOUND_ENDPOINT, 'b')]);
    const text = interactionToPlantUml(repo, 'main').split('\n');
    expect(text).toContain('L_a ->>] : m1');
    expect(text).toContain('[->> L_b : m2');
  });
});
