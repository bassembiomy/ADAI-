import { describe, expect, it } from 'vitest';
import {
  createStateMachineExplorerAdapter,
  ensureRootStateMachineDiagram,
  type StateMachineExplorerSnapshot,
  type StateMachineAdapterHarness,
} from './stateMachineExplorerAdapter';
import { hashImpact } from '../modelExplorerTypes';
import type { StateData, Layer, JunctionData, TransitionData } from '../../../types/sm_types';

function createSmHarness(initialSnapshot?: Partial<StateMachineExplorerSnapshot>): StateMachineAdapterHarness {
  let snapshot: StateMachineExplorerSnapshot = {
    states: initialSnapshot?.states ?? [],
    transitions: initialSnapshot?.transitions ?? [],
    junctions: initialSnapshot?.junctions ?? [],
    layers: initialSnapshot?.layers ?? [
      { id: 'root', name: 'Root Region', parentStateId: null, stateIds: [], transitionIds: [], junctionIds: [] },
    ],
    diagrams: initialSnapshot?.diagrams ?? [],
    revision: initialSnapshot?.revision ?? 1,
  };

  return {
    get snapshot() {
      return snapshot;
    },
    set snapshot(next) {
      snapshot = next;
    },
    getSnapshot: () => snapshot,
    onCommit: (nextSnapshot: StateMachineExplorerSnapshot, _description: string) => {
      snapshot = {
        ...nextSnapshot,
        revision: (snapshot.revision ?? 1) + 1,
      };
    },
  };
}

describe('stateMachineExplorerAdapter', () => {
  it('labels an unnamed region without its internal ID', () => {
    const id = '65cb033e-421d-41e0-b789-87931d991010';
    const harness = createSmHarness({ layers: [{ id, name: ' ', parentStateId: null, stateIds: [], transitionIds: [], junctionIds: [] }] });
    const adapter = createStateMachineExplorerAdapter(harness);
    const tree = adapter.project('containment');
    expect(tree.nodes[`sm:region:${id}`].label).toBe('Region');
  });
  it('projects regions, vertices, and transitions under their semantic owners', () => {
    const rootLayer: Layer = {
      id: 'root',
      name: 'Root Region',
      parentStateId: null,
      stateIds: ['idle'],
      transitionIds: ['t1'],
      junctionIds: [],
    };
    const idleState: StateData = {
      id: 'idle',
      name: 'Idle',
      x: 100,
      y: 100,
      width: 120,
      height: 60,
      entry: '',
      during: '',
      exit: '',
      isActive: false,
      color: '#fff',
      parentId: 'root',
      children: [],
      priority: 0,
      isParallel: false,
      regionId: 'root',
      autostart: false,
    };
    const runningState: StateData = {
      id: 'running',
      name: 'Running',
      x: 300,
      y: 100,
      width: 120,
      height: 60,
      entry: '',
      during: '',
      exit: '',
      isActive: false,
      color: '#fff',
      parentId: 'root',
      children: [],
      priority: 1,
      isParallel: false,
      regionId: 'root',
      autostart: false,
    };
    rootLayer.stateIds.push('running');
    const t1: TransitionData = {
      id: 't1',
      sourceId: 'idle',
      targetId: 'running',
      condition: 'start',
      action: '',
      afterTicks: null,
      type: 'condition',
      hasControlPoint: false,
      order: 0,
    };

    const harness = createSmHarness({
      layers: [rootLayer],
      states: [idleState, runningState],
      transitions: [t1],
    });

    const adapter = createStateMachineExplorerAdapter(harness);
    const projection = adapter.project('containment');

    expect(projection.nodes['sm:region:root']).toBeDefined();
    expect(projection.nodes['sm:region:root'].childNodeIds).toContain('sm:state:idle');
    expect(projection.nodes['sm:group:root:transitions'].childNodeIds).toContain('sm:transition:t1');
  });

  it('moves a state atomically and reports invalid connected transitions', () => {
    const rootLayer: Layer = {
      id: 'root',
      name: 'Root',
      parentStateId: null,
      stateIds: ['idle'],
      transitionIds: ['t1'],
      junctionIds: [],
    };
    const regionB: Layer = {
      id: 'region-b',
      name: 'Region B',
      parentStateId: null,
      stateIds: [],
      transitionIds: [],
      junctionIds: [],
    };
    const idleState: StateData = {
      id: 'idle',
      name: 'Idle',
      x: 100,
      y: 100,
      width: 120,
      height: 60,
      entry: '',
      during: '',
      exit: '',
      isActive: false,
      color: '#fff',
      parentId: 'root',
      children: [],
      priority: 0,
      isParallel: false,
      regionId: 'root',
      autostart: false,
    };
    const otherState: StateData = {
      id: 'other',
      name: 'Other',
      x: 300,
      y: 100,
      width: 120,
      height: 60,
      entry: '',
      during: '',
      exit: '',
      isActive: false,
      color: '#fff',
      parentId: 'root',
      children: [],
      priority: 1,
      isParallel: false,
      regionId: 'root',
      autostart: false,
    };
    rootLayer.stateIds.push('other');
    const t1: TransitionData = {
      id: 't1',
      sourceId: 'idle',
      targetId: 'other',
      condition: '',
      action: '',
      afterTicks: null,
      type: 'condition',
      hasControlPoint: false,
      order: 0,
    };

    const harness = createSmHarness({
      layers: [rootLayer, regionB],
      states: [idleState, otherState],
      transitions: [t1],
    });

    const adapter = createStateMachineExplorerAdapter(harness);
    const preflight = adapter.preflight({ type: 'move', elementIds: ['idle'], targetOwnerId: 'region-b' });
    expect(preflight.committed).toBe(false);
    expect(preflight.impact?.invalidated).toEqual(['t1']);

    const result = adapter.execute({
      type: 'move',
      elementIds: ['idle'],
      targetOwnerId: 'region-b',
      confirmedImpactHash: hashImpact(preflight.impact!),
    });
    expect(result.committed).toBe(true);
    expect(harness.snapshot!.layers.find((x: any) => x.id === 'region-b')?.stateIds).toContain('idle');
    expect(harness.snapshot!.transitions.map((t: any) => t.id)).not.toContain('t1');
  });

  it('ensures exactly one root state-machine diagram and stays idempotent', () => {
    const ensured = ensureRootStateMachineDiagram(createSmHarness().snapshot!);
    expect(ensured.diagrams).toHaveLength(1);
    expect(ensured.diagrams![0]).toMatchObject({
      id: 'adia-default-state-machine',
      name: 'Main State Machine Diagram',
      ownerId: 'root',
      contextRegionId: 'root',
    });
    expect(ensureRootStateMachineDiagram(ensured).diagrams).toHaveLength(1);
  });

  it('does not add a root default when root already owns a diagram', () => {
    const harness = createSmHarness({
      diagrams: [{ id: 'custom-sm', name: 'Custom', ownerId: 'root', contextRegionId: 'root' }],
    });
    const ensured = ensureRootStateMachineDiagram(harness.snapshot!);
    expect(ensured.diagrams!.map(diagram => diagram.id)).toEqual(['custom-sm']);
  });

  it('preserves nested-only diagrams while still adding the root default', () => {
    const harness = createSmHarness({
      layers: [
        { id: 'root', name: 'Root Region', parentStateId: null, stateIds: ['s1'], transitionIds: [], junctionIds: [] },
        { id: 'region-1', name: 'Region 1', parentStateId: 's1', stateIds: [], transitionIds: [], junctionIds: [] },
      ],
      diagrams: [{ id: 'nested-sm', name: 'Nested SM', ownerId: 'region-1', contextRegionId: 'region-1' }],
    });
    const ensured = ensureRootStateMachineDiagram(harness.snapshot!);
    expect(ensured.diagrams!.map(diagram => diagram.id)).toEqual(['nested-sm', 'adia-default-state-machine']);
    expect(ensured.diagrams![0]).toMatchObject({ ownerId: 'region-1', contextRegionId: 'region-1' });
    expect(ensured.diagrams![1]).toMatchObject({ ownerId: 'root', contextRegionId: 'root' });
  });

  it('appends root default for divergent owner/context diagram (owner-based guard)', () => {
    const harness = createSmHarness({
      diagrams: [{ id: 'divergent-sm', name: 'Divergent SM', ownerId: 'region-1', contextRegionId: 'root' }],
    });
    const ensured = ensureRootStateMachineDiagram(harness.snapshot!);
    expect(ensured.diagrams!.map(diagram => diagram.id)).toEqual(['divergent-sm', 'adia-default-state-machine']);
    expect(ensured.diagrams![1]).toMatchObject({ ownerId: 'root', contextRegionId: 'root' });
  });

  it('returns the exact new diagram ID when creating a state-machine diagram', () => {
    const harness = createSmHarness();
    const adapter = createStateMachineExplorerAdapter(harness);
    const result = adapter.execute({ type: 'createDiagram', ownerId: 'root', diagramKind: 'stateMachine' });
    expect(result.committed).toBe(true);
    const createdId = result.selectedIds![0];
    expect(harness.snapshot!.diagrams!.some(diagram => diagram.id === createdId)).toBe(true);
  });

  it('returns strictly State, Junction, and X-Bridges State as creatable children for regions', () => {
    const harness = createSmHarness();
    const adapter = createStateMachineExplorerAdapter(harness);

    const caps = adapter.capabilities(['root']);
    const createCaps = caps.filter(c => c.kind === 'createElement').map(c => c.elementKind);
    expect(createCaps).toEqual(['state', 'junction', 'xBridgesState']);
  });

  it('creates an X-Bridges state with isXBridges: true', () => {
    const harness = createSmHarness();
    const adapter = createStateMachineExplorerAdapter(harness);

    const res = adapter.execute({
      type: 'createElement',
      ownerId: 'root',
      elementKind: 'xBridgesState',
    });

    expect(res.committed).toBe(true);
    expect(harness.snapshot!.states).toHaveLength(1);
    expect(harness.snapshot!.states[0]).toMatchObject({
      isXBridges: true,
      parentId: 'root',
      regionId: 'root',
    });
  });
});
