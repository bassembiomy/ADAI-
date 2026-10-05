import { describe, expect, it } from 'vitest';
import { createEmptyRepository, type InteractionDefinition, type SysmlRepository } from '../engine/sysml/model';
import { validateInteraction } from '../engine/sysml/interaction';
import { loadRepository, serializeRepository } from '../engine/sysml/persistence';
import { computeImpactHash, createSysmlGatewayState, executeSysmlCommand, type SysmlEditorCommand } from './sysmlCommandGateway';
import { ensureDefaultSysmlDiagrams } from './sysmlDiagramWorkspace';
import { buildSequenceDiagramView } from '../features/sysml/sequenceDiagramView';
import {
  buildAddInteractionMessageCommand, buildCreateInteractionFromContextCommand, buildUpdateInteractionMessageCommand,
  listLifelineCandidates, listMessageConnectors,
} from './sysmlInteractionCommands';

const one = { lower: 1, upper: 1, ordered: false, unique: true };
const block = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
  id, name, kind: 'block' as const, namespace: ['model'], ownerId: 'model',
  isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [], ...extra,
});

/** Vehicle owns the interaction and has engine/gearbox parts; Wheel is an unrelated Block. */
function model(): SysmlRepository {
  const repo = ensureDefaultSysmlDiagrams(createEmptyRepository()).repository;
  repo.definitions.engine = block('engine', 'Engine') as any;
  repo.definitions.gearbox = block('gearbox', 'Gearbox') as any;
  repo.definitions.wheel = block('wheel', 'Wheel', { properties: [{ id: 'tyre', name: 'tyre', kind: 'part', typeId: 'engine', multiplicity: one }] }) as any;
  repo.definitions.base = block('base', 'BaseVehicle', {
    properties: [{ id: 'baseEngine', name: 'baseEngine', kind: 'part', typeId: 'engine', multiplicity: one }],
  }) as any;
  repo.definitions.vehicle = block('vehicle', 'Vehicle', {
    supertypeIds: ['base'],
    properties: [
      { id: 'eng', name: 'engine', kind: 'part', typeId: 'engine', multiplicity: one },
      { id: 'gbx', name: 'gearbox', kind: 'reference', typeId: 'gearbox', multiplicity: one },
    ],
  }) as any;
  repo.definitions.int1 = {
    id: 'int1', kind: 'interaction', name: 'Startup', namespace: ['model'], ownerId: 'vehicle',
    lifelines: [], messages: [], fragments: [],
  } as InteractionDefinition;
  return repo;
}

const withLifeline = (repo: SysmlRepository, representsId: string): InteractionDefinition => ({
  ...(repo.definitions.int1 as InteractionDefinition),
  lifelines: [{ id: 'l1', name: 'x', representsId }],
});
const codes = (repo: SysmlRepository, interaction: InteractionDefinition) => validateInteraction(repo, interaction).map(d => `${d.severity}:${d.code}`);

describe('lifelines against the context Block', () => {
  it.each([
    ['the context Block itself', 'vehicle'],
    ['a part of the context Block', 'eng'],
    ['a reference property of the context Block', 'gbx'],
    ['a part inherited from a supertype', 'baseEngine'],
  ])('accepts %s', (_label, representsId) => {
    const repo = model();
    expect(codes(repo, withLifeline(repo, representsId))).not.toContain('warning:LIFELINE_OUTSIDE_CONTEXT');
  });

  it('warns, but never errors, for a Block that is not the context or one of its parts', () => {
    const repo = model();
    expect(codes(repo, withLifeline(repo, 'wheel'))).toContain('warning:LIFELINE_OUTSIDE_CONTEXT');
    expect(codes(repo, withLifeline(repo, 'tyre'))).toContain('warning:LIFELINE_OUTSIDE_CONTEXT');
    expect(codes(repo, withLifeline(repo, 'wheel')).filter(code => code.startsWith('error:'))).toEqual([]);
  });

  it('does not warn when the interaction is owned by a Package (no context)', () => {
    const repo = model();
    const packageOwned = { ...withLifeline(repo, 'wheel'), ownerId: 'model' };
    expect(codes(repo, packageOwned)).not.toContain('warning:LIFELINE_OUTSIDE_CONTEXT');
  });

  it('still reports a missing target as an error, not as outside-context', () => {
    const repo = model();
    expect(codes(repo, withLifeline(repo, 'nothing'))).toEqual(['error:MISSING_LIFELINE_REPRESENTS']);
  });
});

describe('listLifelineCandidates', () => {
  it('leads with the context Block and its parts (inherited included), then everything else', () => {
    const candidates = listLifelineCandidates(model(), 'int1');
    expect(candidates.filter(candidate => candidate.group === 'context').map(candidate => candidate.id)).toEqual(['vehicle']);
    expect(candidates.filter(candidate => candidate.group === 'contextPart').map(candidate => candidate.id).sort()).toEqual(['baseEngine', 'eng', 'gbx']);
    expect(candidates.find(candidate => candidate.id === 'eng')?.label).toBe('engine : Engine');
    expect(candidates.find(candidate => candidate.id === 'wheel')?.group).toBe('block');
    expect(candidates.find(candidate => candidate.id === 'tyre')?.group).toBe('otherPart');
    const first = candidates.slice(0, 4).map(candidate => candidate.group);
    expect(first[0]).toBe('context');
    expect(first.slice(1)).toEqual(['contextPart', 'contextPart', 'contextPart']);
  });

  it('lists no context entries for a Package-owned interaction and never repeats an id', () => {
    const repo = model();
    repo.definitions.int1 = { ...(repo.definitions.int1 as InteractionDefinition), ownerId: 'model' };
    const candidates = listLifelineCandidates(repo, 'int1');
    expect(candidates.some(candidate => candidate.group === 'context' || candidate.group === 'contextPart')).toBe(false);
    expect(new Set(candidates.map(candidate => candidate.id)).size).toBe(candidates.length);
  });
});

/** Vehicle wires engine to gearbox; baseEngine is a part that nothing connects. */
function wiredModel(): SysmlRepository {
  const repo = model();
  repo.connectors.wire = {
    id: 'wire', kind: 'assembly', ownerId: 'vehicle', sourcePortId: '', targetPortId: '',
    sourceEnd: { path: ['eng'] }, targetEnd: { path: ['gbx'] },
  } as any;
  repo.definitions.int1 = {
    ...(repo.definitions.int1 as InteractionDefinition),
    lifelines: [
      { id: 'e', name: 'engine', representsId: 'eng' },
      { id: 'g', name: 'gearbox', representsId: 'gbx' },
      { id: 'b', name: 'base', representsId: 'baseEngine' },
    ],
    messages: [{ id: 'm1', name: 'go', sort: 'asynchCall', sourceLifelineId: 'e', targetLifelineId: 'g', order: 1 }],
  } as InteractionDefinition;
  return repo;
}
const msg = (repo: SysmlRepository, extra: Record<string, unknown>) => ({
  ...(repo.definitions.int1 as InteractionDefinition),
  messages: [{ id: 'm1', name: 'go', sort: 'asynchCall', sourceLifelineId: 'e', targetLifelineId: 'g', order: 1, ...extra }],
}) as InteractionDefinition;

describe('messages over connectors', () => {
  it('lets a message between connected parts name the connector, in either direction', () => {
    const repo = wiredModel();
    expect(codes(repo, msg(repo, { connectorId: 'wire' }))).toEqual([]);
    expect(codes(repo, msg(repo, { sourceLifelineId: 'g', targetLifelineId: 'e', connectorId: 'wire' }))).toEqual([]);
  });

  it('warns about a message between parts no connector joins, but only in a wired context', () => {
    const repo = wiredModel();
    expect(codes(repo, msg(repo, { targetLifelineId: 'b' }))).toEqual(['warning:MESSAGE_WITHOUT_CONNECTOR']);
    expect(codes(repo, msg(repo, {}))).toEqual([]);
    delete repo.connectors.wire;
    expect(codes(repo, msg(repo, { targetLifelineId: 'b' }))).toEqual([]);
  });

  it('never warns for a message a lifeline sends to itself', () => {
    const repo = wiredModel();
    expect(codes(repo, msg(repo, { targetLifelineId: 'e' }))).toEqual([]);
  });

  it('rejects a connector that does not join the two lifelines, or does not exist', () => {
    const repo = wiredModel();
    expect(codes(repo, msg(repo, { targetLifelineId: 'b', connectorId: 'wire' }))).toEqual(['error:MESSAGE_CONNECTOR_MISMATCH']);
    expect(codes(repo, msg(repo, { connectorId: 'nope' }))).toEqual(['error:MESSAGE_CONNECTOR_MISSING']);
  });

  it('matches connectors that end on a nested part or a port of the lifeline part', () => {
    const repo = wiredModel();
    repo.connectors.wire = { ...(repo.connectors.wire as any), sourceEnd: { path: ['eng', 'crank'], portId: 'p1' } };
    expect(codes(repo, msg(repo, { connectorId: 'wire' }))).toEqual([]);
  });

  it('lists the joining connectors, labelled by the parts they connect', () => {
    const repo = wiredModel();
    expect(listMessageConnectors(repo, 'int1', 'e', 'g')).toEqual([{ id: 'wire', label: 'engine — gearbox' }]);
    expect(listMessageConnectors(repo, 'int1', 'e', 'b')).toEqual([]);
  });

  it('stores the connector on a new message and on its reply, and refuses a wrong one', () => {
    const repo = wiredModel();
    const plan = buildAddInteractionMessageCommand(repo, {
      interactionId: 'int1', sort: 'synchCall', sourceLifelineId: 'e', targetLifelineId: 'g', connectorId: 'wire', withReply: true, id: 'call', replyId: 'ret',
    });
    expect(plan.ok).toBe(true);
    const result = executeSysmlCommand(createSysmlGatewayState(repo), (plan as any).command);
    expect(result.committed, JSON.stringify(result.diagnostics)).toBe(true);
    const stored = (result.repository.definitions.int1 as InteractionDefinition).messages;
    expect(stored.find(message => message.id === 'call')?.connectorId).toBe('wire');
    expect(stored.find(message => message.id === 'ret')?.connectorId).toBe('wire');

    const wrong = buildAddInteractionMessageCommand(repo, {
      interactionId: 'int1', sort: 'asynchCall', sourceLifelineId: 'e', targetLifelineId: 'b', connectorId: 'wire',
    });
    expect(wrong).toMatchObject({ ok: false, diagnostics: [{ code: 'MESSAGE_CONNECTOR_MISMATCH' }] });
  });

  it('sets and clears the connector on an existing message', () => {
    const repo = wiredModel();
    const set = buildUpdateInteractionMessageCommand(repo, { interactionId: 'int1', messageId: 'm1', connectorId: 'wire' });
    expect(set.ok).toBe(true);
    const withConnector = executeSysmlCommand(createSysmlGatewayState(repo), (set as any).command);
    expect((withConnector.repository.definitions.int1 as InteractionDefinition).messages[0].connectorId).toBe('wire');
    const cleared = buildUpdateInteractionMessageCommand(withConnector.repository, { interactionId: 'int1', messageId: 'm1', connectorId: null });
    const result = executeSysmlCommand(createSysmlGatewayState(withConnector.repository), (cleared as any).command);
    expect((result.repository.definitions.int1 as InteractionDefinition).messages[0].connectorId).toBeUndefined();
  });

  it('keeps the message but drops the connector when the connector is deleted', () => {
    const repo = wiredModel();
    repo.definitions.int1 = msg(repo, { connectorId: 'wire' });
    const state = createSysmlGatewayState(repo);
    const command = { type: 'deleteElements' as const, elementIds: ['wire'], authorizedBaselineIds: [] };
    const preview = executeSysmlCommand(state, command);
    const result = preview.committed ? preview : executeSysmlCommand(state, { ...command, confirmedImpactHash: computeImpactHash(preview.impact!) });
    expect(result.committed, JSON.stringify(result.diagnostics)).toBe(true);
    expect(result.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
    const kept = (result.repository.definitions.int1 as InteractionDefinition).messages[0];
    expect(kept).toMatchObject({ id: 'm1', name: 'go' });
    expect(kept.connectorId).toBeUndefined();
  });
});

describe('persistence', () => {
  it('keeps a message connector through save and load', () => {
    const repo = wiredModel();
    repo.definitions.int1 = msg(repo, { connectorId: 'wire' });
    const loaded = loadRepository(serializeRepository(repo)).repository;
    expect((loaded.definitions.int1 as InteractionDefinition).messages[0].connectorId).toBe('wire');
    expect(loaded.connectors.wire).toBeDefined();
  });
});

describe('moving an interaction to another owner', () => {
  const withDiagram = () => {
    const repo = wiredModel();
    repo.diagrams.sd = { id: 'sd', kind: 'diagram', name: 'SD', namespace: [], ownerId: 'int1', contextElementId: 'int1', diagramKind: 'sequence' } as any;
    return createSysmlGatewayState(repo);
  };

  it('keeps its diagram and only warns that lifelines fall outside the new context', () => {
    const state = withDiagram();
    const toWheel = executeSysmlCommand(state, { type: 'moveElements', elementIds: ['int1'], targetOwnerId: 'wheel' });
    expect(toWheel.committed, JSON.stringify(toWheel.diagnostics)).toBe(true);
    expect(toWheel.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
    expect(toWheel.diagnostics.map(d => d.code)).toContain('LIFELINE_OUTSIDE_CONTEXT');
    expect(toWheel.repository.diagrams.sd).toMatchObject({ ownerId: 'int1', contextElementId: 'int1' });
    expect(buildSequenceDiagramView(toWheel.repository, 'sd').lifelines).toHaveLength(3);
  });

  it('is quiet again once it moves to a Package, where no context applies', () => {
    const state = withDiagram();
    const toModel = executeSysmlCommand(state, { type: 'moveElements', elementIds: ['int1'], targetOwnerId: 'model' });
    expect(toModel.committed, JSON.stringify(toModel.diagnostics)).toBe(true);
    expect(toModel.diagnostics.map(d => d.code)).not.toContain('LIFELINE_OUTSIDE_CONTEXT');
  });
});

describe('creating a sequence diagram from structure', () => {
  const run = (repo: SysmlRepository, input: Parameters<typeof buildCreateInteractionFromContextCommand>[1]) => {
    const plan = buildCreateInteractionFromContextCommand(repo, input);
    if (!plan.ok) throw new Error(plan.diagnostics.map(d => d.code).join());
    const state = createSysmlGatewayState(repo);
    return { plan, state, result: executeSysmlCommand(state, plan.command as SysmlEditorCommand) };
  };

  it('creates the interaction, its lifelines and the diagram as one undoable step', () => {
    const repo = model();
    const { plan, state, result } = run(repo, { blockId: 'vehicle', partIds: ['eng', 'gbx'], name: 'Boot' });
    expect(result.committed, JSON.stringify(result.diagnostics)).toBe(true);
    const [interactionId, diagramId] = plan.ok ? plan.createdIds : [];
    const created = result.repository.definitions[interactionId] as InteractionDefinition;
    expect(created).toMatchObject({ kind: 'interaction', name: 'Boot', ownerId: 'vehicle' });
    expect(created.lifelines.map(lifeline => lifeline.representsId)).toEqual(['eng', 'gbx']);
    expect(result.repository.diagrams[diagramId]).toMatchObject({ diagramKind: 'sequence', ownerId: interactionId, contextElementId: interactionId });
    expect(result.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
    // The new diagram draws one typed column per part.
    expect(buildSequenceDiagramView(result.repository, diagramId).lifelines.map(lifeline => lifeline.label)).toEqual(['engine', 'gearbox']);

    const undone = executeSysmlCommand({ ...state, ...result }, { type: 'undo' });
    expect(undone.committed).toBe(true);
    expect(undone.repository.definitions[interactionId]).toBeUndefined();
    expect(undone.repository.diagrams[diagramId]).toBeUndefined();
  });

  it('defaults to every part of the Block, inherited ones included', () => {
    const { plan, result } = run(model(), { blockId: 'vehicle' });
    const created = result.repository.definitions[plan.ok ? plan.createdIds[0] : ''] as InteractionDefinition;
    expect(created.lifelines.map(lifeline => lifeline.representsId).sort()).toEqual(['baseEngine', 'eng', 'gbx']);
  });

  it('uses the Block itself as the lifeline when it has no parts', () => {
    const { plan, result } = run(model(), { blockId: 'engine' });
    expect(result.committed, JSON.stringify(result.diagnostics)).toBe(true);
    const created = result.repository.definitions[plan.ok ? plan.createdIds[0] : ''] as InteractionDefinition;
    expect(created.lifelines.map(lifeline => lifeline.representsId)).toEqual(['engine']);
  });

  it('refuses a non-Block context and parts that belong to another Block', () => {
    const repo = model();
    expect(buildCreateInteractionFromContextCommand(repo, { blockId: 'int1' })).toMatchObject({ ok: false });
    expect(buildCreateInteractionFromContextCommand(repo, { blockId: 'vehicle', partIds: ['tyre'] })).toMatchObject({ ok: false });
  });

  it('gives each new interaction a distinct name', () => {
    const first = run(model(), { blockId: 'vehicle' });
    const repo = { ...first.result.repository };
    const second = run(repo, { blockId: 'vehicle' });
    const names = [first, second].map(({ plan, result }) => (result.repository.definitions[plan.ok ? plan.createdIds[0] : ''] as InteractionDefinition).name);
    expect(new Set(names).size).toBe(2);
  });
});
