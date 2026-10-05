import { describe, expect, it } from 'vitest';
import { createEmptyRepository, type ActivityDefinition, type ModelDiagramDefinition, type SysmlRepository } from '../engine/sysml/model';
import {
  buildCanonicalSysmlProjectPayload,
  computeImpactHash,
  createSysmlGatewayState,
  executeSysmlCommand,
  loadCanonicalSysmlProject,
  type SysmlCommandResult,
  type SysmlEditorCommand,
  type SysmlGatewayState,
} from './sysmlCommandGateway';
import { openExactDiagram } from './sysmlDiagramNavigation';
import { serializeRepository, loadRepository } from '../engine/sysml/persistence';
import { validateSysmlRepository } from '../engine/sysml/validation';
import { migrateV3ToV4 } from '../engine/sysml/persistence/migrateV3ToV4';
import { createActivity, createDiagramDefinition } from '../features/modelExplorer/adapters/modelExplorerFactories';
import { createSysmlExplorerAdapter } from '../features/modelExplorer/adapters/sysmlExplorerAdapter';
import { createModelExplorerCommandBus } from '../features/modelExplorer/modelExplorerCommandBus';
import { allowedDiagramKinds } from '../features/modelExplorer/modelExplorerCapabilities';
import { buildActivityDiagramView, proposeLaneAssignments } from '../features/sysml/activityDiagramView';
import { buildCreateAllocationCommand } from './sysmlAllocationCommands';
import { buildAllocationMatrix, listAllocationElements } from '../engine/sysml/allocation';
import {
  buildAddActivityEdgeCommand,
  buildAddActivityNodeCommand,
  buildAddActivityParameterCommand,
  buildAddActivityPinCommand,
  buildAddPartitionCommand,
  buildAssignNodesToPartitionsCommand,
  buildMoveActivityNodesCommand,
  buildMovePartitionCommand,
  buildRemoveActivityNodeCommand,
  buildRemoveActivityPinCommand,
  buildRemovePartitionCommand,
  buildRenameActivityElementCommand,
  buildSetEdgeGuardCommand,
  buildSetPartitionRepresentsCommand,
  buildUpdateActivityNodeCommand,
  buildUpdateActivityPinCommand,
  type ActivityCommandPlan,
} from './sysmlActivityCommands';

const DIAGRAM = 'act-diagram';
const ACTIVITY = 'act1';

interface Ctx { state: SysmlGatewayState }

function run(ctx: Ctx, command: SysmlEditorCommand): SysmlCommandResult {
  const result = executeSysmlCommand(ctx.state, command);
  if (result.committed) ctx.state = { ...ctx.state, ...result } as SysmlGatewayState;
  return result;
}

function apply(ctx: Ctx, plan: ActivityCommandPlan): SysmlCommandResult {
  if (!plan.ok) throw new Error(`plan failed: ${plan.diagnostics.map(d => d.code).join(',')}`);
  const result = run(ctx, plan.command);
  expect(result.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
  expect(result.committed).toBe(true);
  return result;
}

const activity = (ctx: Ctx): ActivityDefinition => ctx.state.repository.definitions[ACTIVITY] as ActivityDefinition;

function setup(extra?: (repo: SysmlRepository) => void): Ctx {
  const repo = createEmptyRepository();
  repo.definitions.Real = { id: 'Real', kind: 'valueType', name: 'Real', namespace: [], ownerId: 'model' };
  repo.definitions.Vehicle = { id: 'Vehicle', kind: 'block', name: 'Vehicle', namespace: [], ownerId: 'model', isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [] };
  repo.definitions.Car = { id: 'Car', kind: 'block', name: 'Car', namespace: [], ownerId: 'model', isAbstract: false, isLeaf: false, supertypeIds: ['Vehicle'], properties: [], ports: [], operations: [], constraints: [] };
  repo.definitions.Wheel = { id: 'Wheel', kind: 'block', name: 'Wheel', namespace: [], ownerId: 'model', isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [] };
  extra?.(repo);
  const ctx: Ctx = { state: createSysmlGatewayState(repo) };
  expect(run(ctx, { type: 'createElement', element: createActivity({ id: ACTIVITY, name: 'Drive', ownerId: 'model' }) }).committed).toBe(true);
  const diagram: ModelDiagramDefinition = createDiagramDefinition({ id: DIAGRAM, name: 'Drive', ownerId: ACTIVITY, diagramKind: 'activity' });
  expect(run(ctx, { type: 'createDiagram', diagram }).committed).toBe(true);
  return ctx;
}

const addNode = (ctx: Ctx, kind: Parameters<typeof buildAddActivityNodeCommand>[1]['kind'], id: string, x: number, y: number, extra: Record<string, unknown> = {}) =>
  apply(ctx, buildAddActivityNodeCommand(ctx.state.repository, { activityId: ACTIVITY, kind, id, diagramId: DIAGRAM, position: { x, y }, ...extra }));

describe('Activity as a definition kind', () => {
  it('is created under the Model, a Package and a Block, and refused under a Requirement or an Activity', () => {
    const ctx = setup(repo => {
      repo.packages.pkg = { id: 'pkg', kind: 'package', name: 'Pkg', namespace: [], ownerId: 'model' };
      repo.requirements.req = { id: 'req', kind: 'requirement', name: 'R', namespace: [], ownerId: 'model', requirementId: 'R1', text: 't', status: 'draft', version: '1' };
    });
    const bus = createModelExplorerCommandBus(createSysmlExplorerAdapter({
      getState: () => ctx.state,
      executeCommand: command => run(ctx, command),
    }));
    for (const ownerId of ['model', 'pkg', 'Vehicle']) {
      const result = bus.dispatch({ type: 'createElement', ownerId, elementKind: 'Activity', name: `From ${ownerId}` });
      expect(result.committed, `${ownerId}: ${JSON.stringify(result.diagnostics)}`).toBe(true);
    }
    const denied = bus.dispatch({ type: 'createElement', ownerId: 'req', elementKind: 'Activity', name: 'Nope' });
    expect(denied.committed).toBe(false);
    expect(denied.diagnostics[0].code).toBe('ILLEGAL_OWNERSHIP');
    const nested = bus.dispatch({ type: 'createElement', ownerId: ACTIVITY, elementKind: 'Activity', name: 'Nope' });
    expect(nested.committed).toBe(false);
    expect(Object.values(ctx.state.repository.definitions).filter(def => def.kind === 'activity').map(def => def.ownerId).sort())
      .toEqual(['Vehicle', 'model', 'model', 'pkg']);
  });

  it('offers Activity in the explorer capabilities of Model, Package and Block, and Activity Diagram only on an Activity', () => {
    const ctx = setup(repo => {
      repo.packages.pkg = { id: 'pkg', kind: 'package', name: 'Pkg', namespace: [], ownerId: 'model' };
    });
    const adapter = createSysmlExplorerAdapter({ getState: () => ctx.state, executeCommand: command => run(ctx, command) });
    for (const owner of ['model', 'pkg', 'Vehicle']) {
      expect(adapter.capabilities([owner]).some(cap => cap.id === 'create:Activity' && cap.enabled), owner).toBe(true);
      expect(adapter.capabilities([owner]).some(cap => cap.id === 'createDiagram:activity'), owner).toBe(false);
    }
    const onActivity = adapter.capabilities([ACTIVITY]);
    expect(onActivity.filter(cap => cap.kind === 'createDiagram').map(cap => cap.elementKind)).toEqual(['activity']);
    expect(onActivity.find(cap => cap.id === 'createDiagram:activity')?.label).toBe('Activity Diagram');
    expect(allowedDiagramKinds({ id: 'x', name: 'x', metaclass: 'Activity', namespace: [], ownerId: null })).toEqual(['activity']);
    expect(allowedDiagramKinds({ id: 'x', name: 'x', metaclass: 'Package', namespace: [], ownerId: null })).not.toContain('activity');
  });

  it('createDiagram requires an Activity owner and names the diagram readably', () => {
    const ctx = setup(repo => {
      repo.packages.pkg = { id: 'pkg', kind: 'package', name: 'Pkg', namespace: [], ownerId: 'model' };
    });
    expect(createDiagramDefinition({ ownerId: ACTIVITY, diagramKind: 'activity' }).name).toBe('ActivityDiagram');
    for (const ownerId of ['model', 'pkg', 'Vehicle']) {
      const bad = executeSysmlCommand(ctx.state, { type: 'createDiagram', diagram: createDiagramDefinition({ ownerId, diagramKind: 'activity' }) });
      expect(bad.committed, ownerId).toBe(false);
      expect(bad.diagnostics[0].code).toBe('INVALID_DIAGRAM_OWNER');
    }
    expect(ctx.state.repository.diagrams[DIAGRAM]).toMatchObject({ diagramKind: 'activity', ownerId: ACTIVITY, contextElementId: ACTIVITY });
  });

  it('opening the diagram by id reports the activity kind for the workspace to mount', () => {
    const ctx = setup();
    const nav = openExactDiagram({ activeDiagramId: 'x', diagramKind: 'bdd', returnStack: [] }, ctx.state.repository, DIAGRAM);
    expect(nav).toMatchObject({ activeDiagramId: DIAGRAM, diagramKind: 'activity' });
  });

  it('maps to the V4 Activity, ActivityPartition and Parameter metaclasses', () => {
    const ctx = setup();
    addNode(ctx, 'action', 'a1', 40, 100);
    apply(ctx, buildAddPartitionCommand(ctx.state.repository, { activityId: ACTIVITY, name: 'Crew', id: 'lane1' }));
    apply(ctx, buildAddActivityParameterCommand(ctx.state.repository, { activityId: ACTIVITY, name: 'speed', id: 'par1', typeId: 'Real' }));
    const v4 = migrateV3ToV4(ctx.state.repository);
    expect(v4.elements[ACTIVITY]).toMatchObject({ metaclass: 'Activity', nodeIds: ['a1'], partitionIds: ['lane1'], parameterIds: ['par1'] });
    expect(v4.elements.lane1).toMatchObject({ metaclass: 'ActivityPartition', ownerId: ACTIVITY });
    expect(v4.elements.par1).toMatchObject({ metaclass: 'Parameter', ownerId: ACTIVITY });
  });
});

describe('activity command builders', () => {
  it('adds a node and its diagram position in one command, and one undo removes both', () => {
    const ctx = setup();
    const before = ctx.state;
    addNode(ctx, 'action', 'a1', 100, 120);
    expect(activity(ctx).nodes).toMatchObject([{ id: 'a1', kind: 'action', name: 'Action', pins: [] }]);
    expect(ctx.state.diagramPresentations![DIAGRAM].elementIds).toEqual(['a1']);
    expect(ctx.state.diagramPresentations![DIAGRAM].presentations.a1.bounds).toMatchObject({ x: 100, y: 120, width: 140, height: 56 });

    const undone = executeSysmlCommand(ctx.state, { type: 'undo' });
    expect(undone.committed).toBe(true);
    expect((undone.repository.definitions[ACTIVITY] as ActivityDefinition).nodes).toEqual([]);
    expect(undone.diagramPresentations![DIAGRAM]?.elementIds ?? []).toEqual([]);
    expect(before.repository.revision).toBeLessThan(ctx.state.repository.revision);
  });

  it('gives actions unique default names and control nodes none', () => {
    const ctx = setup();
    addNode(ctx, 'action', 'a1', 0, 0);
    addNode(ctx, 'action', 'a2', 0, 100);
    addNode(ctx, 'initial', 'i1', 0, 200);
    expect(activity(ctx).nodes.map(node => node.name)).toEqual(['Action', 'Action2', '']);
  });

  it('refuses a second initial node without touching the repository', () => {
    const ctx = setup();
    addNode(ctx, 'initial', 'i1', 0, 0);
    const revision = ctx.state.repository.revision;
    const plan = buildAddActivityNodeCommand(ctx.state.repository, { activityId: ACTIVITY, kind: 'initial', diagramId: DIAGRAM });
    expect(plan).toMatchObject({ ok: false, diagnostics: [{ code: 'MULTIPLE_INITIAL_NODES' }] });
    expect(ctx.state.repository.revision).toBe(revision);
  });

  it('the gateway also rejects a colliding nested id', () => {
    const ctx = setup();
    addNode(ctx, 'action', 'a1', 0, 0);
    const bad = executeSysmlCommand(ctx.state, {
      type: 'updateElement', elementId: ACTIVITY,
      patch: { nodes: [...activity(ctx).nodes, { id: 'Vehicle', kind: 'action', name: 'Clash' }] },
    });
    expect(bad.committed).toBe(false);
    expect(bad.diagnostics.some(d => d.code === 'DUPLICATE_ELEMENT_ID')).toBe(true);
  });

  it('moves nodes through updatePresentation without changing the repository', () => {
    const ctx = setup();
    addNode(ctx, 'action', 'a1', 100, 120);
    addNode(ctx, 'initial', 'i1', 10, 10);
    const revision = ctx.state.repository.revision;
    const command = buildMoveActivityNodesCommand(DIAGRAM, { a1: { x: 300, y: 340, width: 160, height: 56 }, i1: { x: 50, y: 50 } })!;
    expect(run(ctx, command).committed).toBe(true);
    expect(ctx.state.repository.revision).toBe(revision);
    expect(ctx.state.diagramPresentations![DIAGRAM].presentations.a1.bounds).toMatchObject({ x: 300, y: 340, width: 160 });
    const undone = executeSysmlCommand(ctx.state, { type: 'undo' });
    expect(undone.diagramPresentations![DIAGRAM].presentations.a1.bounds).toMatchObject({ x: 100, y: 120 });
    expect(undone.diagramPresentations![DIAGRAM].presentations.i1.bounds).toMatchObject({ x: 10, y: 10 });
    expect(buildMoveActivityNodesCommand(DIAGRAM, {})).toBeUndefined();
  });

  it('adds control and object flows, infers the kind, and validates before building', () => {
    const ctx = setup();
    addNode(ctx, 'initial', 'i1', 0, 0);
    addNode(ctx, 'action', 'a1', 0, 100);
    addNode(ctx, 'objectNode', 'o1', 0, 200, { typeId: 'Real' });
    apply(ctx, buildAddActivityEdgeCommand(ctx.state.repository, { activityId: ACTIVITY, sourceId: 'i1', targetId: 'a1', id: 'e1' }));
    expect(activity(ctx).edges[0]).toMatchObject({ id: 'e1', kind: 'controlFlow' });

    const toObject = buildAddActivityEdgeCommand(ctx.state.repository, { activityId: ACTIVITY, sourceId: 'a1', targetId: 'o1', id: 'e2' });
    expect(toObject).toMatchObject({ ok: false, diagnostics: [{ code: 'OBJECT_FLOW_ENDPOINT' }] });

    expect(buildAddActivityEdgeCommand(ctx.state.repository, { activityId: ACTIVITY, sourceId: 'a1', targetId: 'i1' }))
      .toMatchObject({ ok: false, diagnostics: [{ code: 'INITIAL_NODE_HAS_INCOMING' }] });
    expect(buildAddActivityEdgeCommand(ctx.state.repository, { activityId: ACTIVITY, sourceId: 'i1', targetId: 'a1' }))
      .toMatchObject({ ok: false, diagnostics: [{ code: 'DUPLICATE_ACTIVITY_EDGE' }] });
  });

  it('pins carry object flows with type checking', () => {
    const ctx = setup();
    addNode(ctx, 'action', 'a1', 0, 0);
    addNode(ctx, 'action', 'a2', 0, 200);
    apply(ctx, buildAddActivityPinCommand(ctx.state.repository, { activityId: ACTIVITY, nodeId: 'a1', direction: 'out', typeId: 'Vehicle', id: 'p-out' }));
    apply(ctx, buildAddActivityPinCommand(ctx.state.repository, { activityId: ACTIVITY, nodeId: 'a2', direction: 'in', typeId: 'Car', id: 'p-in-car' }));
    apply(ctx, buildAddActivityPinCommand(ctx.state.repository, { activityId: ACTIVITY, nodeId: 'a2', direction: 'in', typeId: 'Vehicle', id: 'p-in-vehicle' }));
    expect(buildAddActivityEdgeCommand(ctx.state.repository, { activityId: ACTIVITY, sourceId: 'p-out', targetId: 'p-in-car' }))
      .toMatchObject({ ok: false, diagnostics: [{ code: 'OBJECT_FLOW_TYPE_MISMATCH' }] });
    apply(ctx, buildAddActivityEdgeCommand(ctx.state.repository, { activityId: ACTIVITY, sourceId: 'p-out', targetId: 'p-in-vehicle', id: 'of1' }));
    expect(activity(ctx).edges[0]).toMatchObject({ id: 'of1', kind: 'objectFlow' });

    // Re-typing the target pin to an unrelated type would break the flow: rejected, nothing changes.
    const retype = buildUpdateActivityPinCommand(ctx.state.repository, { activityId: ACTIVITY, pinId: 'p-in-vehicle', typeId: 'Wheel' });
    expect(retype).toMatchObject({ ok: false, diagnostics: [{ code: 'OBJECT_FLOW_TYPE_MISMATCH' }] });
    expect(buildAddActivityPinCommand(ctx.state.repository, { activityId: ACTIVITY, nodeId: 'a1', direction: 'in', typeId: 'ghost' }))
      .toMatchObject({ ok: false, diagnostics: [{ code: 'MISSING_PIN_TYPE' }] });

    // Removing a pin drops the flows that used it, in one command.
    apply(ctx, buildRemoveActivityPinCommand(ctx.state.repository, { activityId: ACTIVITY, pinId: 'p-in-vehicle' }));
    expect(activity(ctx).edges).toEqual([]);
    expect(activity(ctx).nodes.find(node => node.id === 'a2')?.pins?.map(pin => pin.id)).toEqual(['p-in-car']);
  });

  it('only actions can have pins', () => {
    const ctx = setup();
    addNode(ctx, 'decision', 'd1', 0, 0);
    expect(buildAddActivityPinCommand(ctx.state.repository, { activityId: ACTIVITY, nodeId: 'd1', direction: 'in' }))
      .toMatchObject({ ok: false, diagnostics: [{ code: 'ACTIVITY_NODE_INVALID_FEATURE' }] });
  });

  it('a parameter node creates and binds its parameter in the same command', () => {
    const ctx = setup();
    addNode(ctx, 'activityParameterNode', 'pn1', 0, 0, { typeId: 'Real', newParameterId: 'par1' });
    expect(activity(ctx).parameters).toMatchObject([{ id: 'par1', name: 'parameter', direction: 'in', typeId: 'Real' }]);
    expect(activity(ctx).nodes[0]).toMatchObject({ id: 'pn1', parameterId: 'par1', typeId: 'Real' });
    expect(ctx.state.repository.revision).toBeGreaterThan(0);
    const undone = executeSysmlCommand(ctx.state, { type: 'undo' });
    expect((undone.repository.definitions[ACTIVITY] as ActivityDefinition).parameters).toEqual([]);
  });

  it('renames the activity, nodes, pins, swimlanes and parameters; one command each', () => {
    const ctx = setup();
    addNode(ctx, 'action', 'a1', 0, 0);
    apply(ctx, buildAddActivityPinCommand(ctx.state.repository, { activityId: ACTIVITY, nodeId: 'a1', direction: 'in', id: 'pin1' }));
    apply(ctx, buildAddPartitionCommand(ctx.state.repository, { activityId: ACTIVITY, id: 'lane1' }));
    apply(ctx, buildAddActivityParameterCommand(ctx.state.repository, { activityId: ACTIVITY, id: 'par1' }));
    for (const [id, name] of [[ACTIVITY, 'Cruise'], ['a1', 'Throttle'], ['pin1', 'demand'], ['lane1', 'Engine'], ['par1', 'speed']] as const) {
      apply(ctx, buildRenameActivityElementCommand(ctx.state.repository, { activityId: ACTIVITY, elementId: id, name }));
    }
    const current = activity(ctx);
    expect(current.name).toBe('Cruise');
    expect(current.nodes[0].name).toBe('Throttle');
    expect(current.nodes[0].pins?.[0].name).toBe('demand');
    expect(current.partitions[0].name).toBe('Engine');
    expect(current.parameters[0].name).toBe('speed');
    expect(buildRenameActivityElementCommand(ctx.state.repository, { activityId: ACTIVITY, elementId: 'nope', name: 'x' })).toMatchObject({ ok: false });
  });

  it('sets a guard, clears it, and sets the called behavior', () => {
    const ctx = setup();
    addNode(ctx, 'decision', 'd1', 0, 0);
    addNode(ctx, 'action', 'a1', 0, 100);
    apply(ctx, buildAddActivityEdgeCommand(ctx.state.repository, { activityId: ACTIVITY, sourceId: 'd1', targetId: 'a1', id: 'e1' }));
    apply(ctx, buildSetEdgeGuardCommand(ctx.state.repository, { activityId: ACTIVITY, edgeId: 'e1', guard: ' x > 0 ' }));
    expect(activity(ctx).edges[0].guard).toBe('x > 0');
    apply(ctx, buildSetEdgeGuardCommand(ctx.state.repository, { activityId: ACTIVITY, edgeId: 'e1', guard: '' }));
    expect('guard' in activity(ctx).edges[0]).toBe(false);

    const other = createActivity({ id: 'act2', name: 'Other', ownerId: 'model' });
    expect(run(ctx, { type: 'createElement', element: other }).committed).toBe(true);
    apply(ctx, buildUpdateActivityNodeCommand(ctx.state.repository, { activityId: ACTIVITY, nodeId: 'a1', behaviorId: 'act2' }));
    expect(activity(ctx).nodes.find(node => node.id === 'a1')?.behaviorId).toBe('act2');
    expect(buildUpdateActivityNodeCommand(ctx.state.repository, { activityId: ACTIVITY, nodeId: 'a1', behaviorId: 'ghost' }))
      .toMatchObject({ ok: false, diagnostics: [{ code: 'MISSING_CALLED_BEHAVIOR' }] });
    apply(ctx, buildUpdateActivityNodeCommand(ctx.state.repository, { activityId: ACTIVITY, nodeId: 'a1', behaviorId: null }));
    expect('behaviorId' in activity(ctx).nodes.find(node => node.id === 'a1')!).toBe(false);
  });

  it('removes a node with its edges, its lane membership and its presentation in one undo step', () => {
    const ctx = setup();
    addNode(ctx, 'initial', 'i1', 0, 0);
    addNode(ctx, 'action', 'a1', 0, 100);
    apply(ctx, buildAddActivityEdgeCommand(ctx.state.repository, { activityId: ACTIVITY, sourceId: 'i1', targetId: 'a1', id: 'e1' }));
    apply(ctx, buildAddPartitionCommand(ctx.state.repository, { activityId: ACTIVITY, id: 'lane1' }));
    apply(ctx, buildAssignNodesToPartitionsCommand(ctx.state.repository, ACTIVITY, [{ nodeId: 'a1', toPartitionId: 'lane1' }]));
    expect(activity(ctx).partitions[0].nodeIds).toEqual(['a1']);

    apply(ctx, buildRemoveActivityNodeCommand(ctx.state.repository, { activityId: ACTIVITY, nodeId: 'a1', diagramPresentations: ctx.state.diagramPresentations }));
    expect(activity(ctx).nodes.map(node => node.id)).toEqual(['i1']);
    expect(activity(ctx).edges).toEqual([]);
    expect(activity(ctx).partitions[0].nodeIds).toEqual([]);
    expect(ctx.state.diagramPresentations![DIAGRAM].elementIds).toEqual(['i1']);

    const undone = executeSysmlCommand(ctx.state, { type: 'undo' });
    expect((undone.repository.definitions[ACTIVITY] as ActivityDefinition).nodes.map(node => node.id)).toEqual(['i1', 'a1']);
    expect((undone.repository.definitions[ACTIVITY] as ActivityDefinition).edges).toHaveLength(1);
    expect(undone.diagramPresentations![DIAGRAM].elementIds).toEqual(['i1', 'a1']);
  });
});

describe('swimlanes and allocation', () => {
  it('lane proposals are applied as one confirmed command, and a second proposal moves the node', () => {
    const ctx = setup();
    apply(ctx, buildAddPartitionCommand(ctx.state.repository, { activityId: ACTIVITY, name: 'Pilot', id: 'l1' }));
    apply(ctx, buildAddPartitionCommand(ctx.state.repository, { activityId: ACTIVITY, name: 'System', id: 'l2' }));
    addNode(ctx, 'action', 'a1', 40, 120);
    addNode(ctx, 'action', 'a2', 300, 120);

    const view = buildActivityDiagramView(ctx.state.repository, DIAGRAM, ctx.state.diagramPresentations![DIAGRAM]);
    const proposals = proposeLaneAssignments(view);
    expect(proposals.map(p => [p.nodeId, p.toPartitionId])).toEqual([['a1', 'l1'], ['a2', 'l2']]);
    expect(activity(ctx).partitions.every(partition => partition.nodeIds.length === 0)).toBe(true);

    const revision = ctx.state.repository.revision;
    apply(ctx, buildAssignNodesToPartitionsCommand(ctx.state.repository, ACTIVITY, proposals));
    expect(ctx.state.repository.revision).toBe(revision + 1);
    expect(activity(ctx).partitions.map(partition => partition.nodeIds)).toEqual([['a1'], ['a2']]);

    apply(ctx, buildAssignNodesToPartitionsCommand(ctx.state.repository, ACTIVITY, [{ nodeId: 'a1', fromPartitionId: 'l1', toPartitionId: 'l2' }]));
    expect(activity(ctx).partitions.map(partition => partition.nodeIds)).toEqual([[], ['a2', 'a1']]);
    expect(buildAssignNodesToPartitionsCommand(ctx.state.repository, ACTIVITY, [])).toMatchObject({ ok: false });
  });

  it('a swimlane represents a Block (allocation in swimlane form); other targets are refused', () => {
    const ctx = setup();
    apply(ctx, buildAddPartitionCommand(ctx.state.repository, { activityId: ACTIVITY, id: 'l1' }));
    expect(buildSetPartitionRepresentsCommand(ctx.state.repository, { activityId: ACTIVITY, partitionId: 'l1', representsId: 'Real' }))
      .toMatchObject({ ok: false, diagnostics: [{ code: 'MISSING_PARTITION_REPRESENTS' }] });
    apply(ctx, buildSetPartitionRepresentsCommand(ctx.state.repository, { activityId: ACTIVITY, partitionId: 'l1', representsId: 'Vehicle' }));
    expect(activity(ctx).partitions[0].representsId).toBe('Vehicle');
    apply(ctx, buildSetPartitionRepresentsCommand(ctx.state.repository, { activityId: ACTIVITY, partitionId: 'l1' }));
    expect('representsId' in activity(ctx).partitions[0]).toBe(false);
  });

  it('reorders swimlanes and refuses to move past the edge', () => {
    const ctx = setup();
    apply(ctx, buildAddPartitionCommand(ctx.state.repository, { activityId: ACTIVITY, id: 'l1' }));
    apply(ctx, buildAddPartitionCommand(ctx.state.repository, { activityId: ACTIVITY, id: 'l2' }));
    apply(ctx, buildMovePartitionCommand(ctx.state.repository, { activityId: ACTIVITY, partitionId: 'l2', direction: -1 }));
    expect(activity(ctx).partitions.map(partition => partition.id)).toEqual(['l2', 'l1']);
    expect(buildMovePartitionCommand(ctx.state.repository, { activityId: ACTIVITY, partitionId: 'l2', direction: -1 })).toMatchObject({ ok: false });
  });

  it('«allocate» from an action and from a swimlane to a Block goes through the allocation tools, shows in the matrix, and survives save/load', () => {
    const ctx = setup();
    addNode(ctx, 'action', 'a1', 0, 0, { name: 'Steer' });
    apply(ctx, buildAddPartitionCommand(ctx.state.repository, { activityId: ACTIVITY, id: 'l1', name: 'Chassis' }));
    expect(run(ctx, buildCreateAllocationCommand(ctx.state.repository, 'a1', 'Vehicle')).committed).toBe(true);
    expect(run(ctx, buildCreateAllocationCommand(ctx.state.repository, 'l1', 'Car')).committed).toBe(true);
    expect(run(ctx, buildCreateAllocationCommand(ctx.state.repository, ACTIVITY, 'Wheel')).committed).toBe(true);

    const rows = listAllocationElements(ctx.state.repository, ['activity', 'action', 'partition']);
    expect(rows.map(row => `${row.kind}:${row.name}`).sort()).toEqual(['action:Steer', 'activity:Drive', 'partition:Chassis']);
    const matrix = buildAllocationMatrix(ctx.state.repository, { rowKinds: ['action', 'partition', 'activity'], columnKinds: ['block'] });
    expect(matrix.coverage.unallocatedRowIds).toEqual([]);
    expect(Object.values(matrix.cells).flat()).toHaveLength(3);

    const view = buildActivityDiagramView(ctx.state.repository, DIAGRAM, ctx.state.diagramPresentations![DIAGRAM]);
    expect(view.nodes[0].allocatedTo).toEqual(['Vehicle']);
    expect(view.lanes[0].allocatedTo).toEqual(['Car']);

    const reloaded = loadRepository(serializeRepository(ctx.state.repository));
    expect(Object.values(reloaded.repository.relationships).filter(rel => rel.kind === 'allocation')).toHaveLength(3);
    expect(reloaded.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
  });

  it('a node or swimlane that is an allocation end cannot be removed until the relationship goes', () => {
    const ctx = setup();
    addNode(ctx, 'action', 'a1', 0, 0);
    apply(ctx, buildAddPartitionCommand(ctx.state.repository, { activityId: ACTIVITY, id: 'l1' }));
    run(ctx, buildCreateAllocationCommand(ctx.state.repository, 'a1', 'Vehicle'));
    run(ctx, buildCreateAllocationCommand(ctx.state.repository, 'l1', 'Vehicle'));
    expect(buildRemoveActivityNodeCommand(ctx.state.repository, { activityId: ACTIVITY, nodeId: 'a1' }))
      .toMatchObject({ ok: false, diagnostics: [{ code: 'ACTIVITY_ELEMENT_HAS_RELATIONSHIPS' }] });
    expect(buildRemovePartitionCommand(ctx.state.repository, { activityId: ACTIVITY, partitionId: 'l1' }))
      .toMatchObject({ ok: false, diagnostics: [{ code: 'ACTIVITY_ELEMENT_HAS_RELATIONSHIPS' }] });
  });

  it('deleting the Activity removes its allocations, its diagrams and its presentations', () => {
    const ctx = setup();
    addNode(ctx, 'action', 'a1', 0, 0);
    run(ctx, buildCreateAllocationCommand(ctx.state.repository, 'a1', 'Vehicle'));
    const first = executeSysmlCommand(ctx.state, { type: 'deleteElements', elementIds: [ACTIVITY] });
    expect(first.committed).toBe(false);
    expect(first.impact?.deletedElementIds).toEqual(expect.arrayContaining([ACTIVITY, DIAGRAM]));
    expect(first.impact?.removedRelationshipIds).toHaveLength(1);
    const done = executeSysmlCommand(ctx.state, { type: 'deleteElements', elementIds: [ACTIVITY], confirmedImpactHash: computeImpactHash(first.impact!) });
    expect(done.committed).toBe(true);
    expect(done.repository.definitions[ACTIVITY]).toBeUndefined();
    expect(done.repository.diagrams[DIAGRAM]).toBeUndefined();
    expect(Object.keys(done.repository.relationships)).toEqual([]);
    expect(validateSysmlRepository(done.repository).diagnostics.filter(d => d.severity === 'error')).toEqual([]);
  });
});

describe('Activity Diagram presentation rules', () => {
  it('presents only the nodes of the activity that owns the diagram', () => {
    const ctx = setup();
    addNode(ctx, 'action', 'a1', 0, 0);
    expect(run(ctx, { type: 'addToDiagram', diagramId: DIAGRAM, elementIds: ['Vehicle'] }).committed).toBe(false);
    const other = createActivity({ id: 'act2', name: 'Other', ownerId: 'model' });
    run(ctx, { type: 'createElement', element: { ...other, nodes: [{ id: 'foreign', kind: 'action', name: 'F' }] } });
    const result = run(ctx, { type: 'addToDiagram', diagramId: DIAGRAM, elementIds: ['foreign'] });
    expect(result.committed).toBe(false);
    expect(result.diagnostics[0].code).toBe('INVALID_DIAGRAM_ELEMENT');
    expect(run(ctx, { type: 'addToDiagram', diagramId: DIAGRAM, elementIds: ['ghost'] }).diagnostics[0].code).toBe('ELEMENT_NOT_FOUND');
  });

  it('the gateway accepts a nested node id as a presentation key', () => {
    const ctx = setup();
    apply(ctx, buildAddActivityNodeCommand(ctx.state.repository, { activityId: ACTIVITY, kind: 'action', id: 'a1' }));
    const added = run(ctx, { type: 'addToDiagram', diagramId: DIAGRAM, elementIds: ['a1'], coordinates: { a1: { x: 5, y: 6 } } });
    expect(added.committed).toBe(true);
    const moved = run(ctx, { type: 'updatePresentation', diagramId: DIAGRAM, elementId: 'a1', presentation: { x: 70, y: 80 } });
    expect(moved.committed).toBe(true);
    expect(ctx.state.diagramPresentations![DIAGRAM].presentations.a1.bounds).toMatchObject({ x: 70, y: 80 });
  });
});

describe('persistence', () => {
  it('survives serializeRepository -> loadRepository and the project payload round trip, including positions', () => {
    const ctx = setup();
    addNode(ctx, 'initial', 'i1', 20, 20);
    addNode(ctx, 'action', 'a1', 200, 120, { name: 'Brake' });
    apply(ctx, buildAddActivityPinCommand(ctx.state.repository, { activityId: ACTIVITY, nodeId: 'a1', direction: 'in', typeId: 'Real', id: 'pin1' }));
    addNode(ctx, 'objectNode', 'o1', 200, 300, { typeId: 'Real' });
    apply(ctx, buildAddActivityEdgeCommand(ctx.state.repository, { activityId: ACTIVITY, sourceId: 'i1', targetId: 'a1', id: 'e1', guard: 'go' }));
    apply(ctx, buildAddActivityEdgeCommand(ctx.state.repository, { activityId: ACTIVITY, sourceId: 'o1', targetId: 'pin1', id: 'e2' }));
    apply(ctx, buildAddPartitionCommand(ctx.state.repository, { activityId: ACTIVITY, name: 'Driver', representsId: 'Vehicle', id: 'l1' }));
    apply(ctx, buildAssignNodesToPartitionsCommand(ctx.state.repository, ACTIVITY, [{ nodeId: 'a1', toPartitionId: 'l1' }]));
    run(ctx, buildCreateAllocationCommand(ctx.state.repository, 'a1', 'Car'));

    const expected = activity(ctx);
    const reloaded = loadRepository(serializeRepository(ctx.state.repository));
    expect(reloaded.repository.definitions[ACTIVITY]).toEqual(expected);
    expect(validateSysmlRepository(reloaded.repository).diagnostics.filter(d => d.severity === 'error')).toEqual([]);

    const payload = buildCanonicalSysmlProjectPayload(ctx.state, { version: '1', projectName: 'p' });
    const loaded = loadCanonicalSysmlProject(JSON.parse(JSON.stringify(payload)));
    expect(loaded.valid).toBe(true);
    expect(loaded.repository.definitions[ACTIVITY]).toEqual(expected);
    expect(loaded.repository.diagrams[DIAGRAM].diagramKind).toBe('activity');
    const before = buildActivityDiagramView(ctx.state.repository, DIAGRAM, ctx.state.diagramPresentations![DIAGRAM]);
    const after = buildActivityDiagramView(loaded.repository, DIAGRAM, loaded.diagramPresentations[DIAGRAM]);
    expect(after).toEqual(before);
    expect(after.nodes.find(node => node.id === 'a1')?.bounds).toMatchObject({ x: 200, y: 120 });
    // The allocation to a nested node was not quarantined by the load.
    expect(Object.values(loaded.repository.relationships).filter(rel => rel.kind === 'allocation')).toHaveLength(1);
  });
});
