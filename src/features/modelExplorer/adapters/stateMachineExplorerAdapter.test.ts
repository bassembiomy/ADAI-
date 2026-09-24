import { describe, expect, it } from 'vitest';
import {
  createStateMachineExplorerAdapter,
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
});
