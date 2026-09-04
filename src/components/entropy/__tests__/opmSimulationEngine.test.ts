import { describe, test, expect } from 'vitest';
import {
  createSimulationState,
  initializeSimulation,
  evaluateProcessEligibility,
  stepSimulation,
  applySimResultToNodes,
} from '../OpmSimulationEngine';
import type { AppNode, AppEdge } from '../EntropyTypes';

// Fixture: Home_System with states [Off, On], plus a process
export function makeFixtureNodes(): AppNode[] {
  return [
    { id: 'sys', type: 'opmObject', position: { x: 0, y: 0 },
      data: { name: 'Home_System', type: 'object', physical: false, parentId: null,
        states: [
          { id: 'sys-off', name: 'Off', isActive: false },
          { id: 'sys-on', name: 'On', isActive: false },
        ] } },
    { id: 'sys-off', type: 'opmState', position: { x: 15, y: 45 }, parentId: 'sys',
      data: { name: 'Off', type: 'state', physical: false, parentId: 'sys', isActive: false } },
    { id: 'sys-on', type: 'opmState', position: { x: 105, y: 45 }, parentId: 'sys',
      data: { name: 'On', type: 'state', physical: false, parentId: 'sys', isActive: false } },
    { id: 'proc', type: 'opmProcess', position: { x: 300, y: 0 },
      data: { name: 'Activate', type: 'process', physical: false, parentId: null } },
  ];
}

function edge(id: string, source: string, target: string, type: string): AppEdge {
  return { id, source, target, data: { type } } as AppEdge;
}

describe('OpmSimulationEngine — state & initialization', () => {
  test('createSimulationState returns a fresh idle state', () => {
    const s = createSimulationState();
    expect(s.tick).toBe(0);
    expect(s.objectActiveState).toEqual({});
    expect(s.pendingEvents).toEqual([]);
    expect(s.trace).toEqual([]);
    expect(s.finished).toBe(false);
  });

  test('initializeSimulation activates the first state of every stateful object', () => {
    const s = initializeSimulation(makeFixtureNodes());
    expect(s.objectActiveState['sys']).toBe('sys-off');
  });

  test('initializeSimulation leaves stateless objects unmapped', () => {
    const s = initializeSimulation(makeFixtureNodes());
    expect(s.objectActiveState['proc']).toBeUndefined();
  });
});

describe('OpmSimulationEngine — eligibility', () => {
  test('process with agent + consumption is eligible only when the consumed state is active', () => {
    const nodes = makeFixtureNodes();
    // Activate System to 'On'
    const active = { sys: 'sys-on' as string | null };
    const edges = [
      edge('e1', 'sys', 'proc', 'agent'),
      edge('e2', 'sys-on', 'proc', 'consumption'),
    ];
    const r1 = evaluateProcessEligibility(nodes, edges, active, []);
    expect(r1.eligible).toContain('proc');
    const r2 = evaluateProcessEligibility(nodes, edges, { sys: 'sys-off' }, []);
    expect(r2.eligible).not.toContain('proc');
    expect(r2.blocked['proc']).toContain('consumed state');
  });

  test('condition link gates eligibility on the active state', () => {
    const nodes = makeFixtureNodes();
    const edges = [edge('e1', 'sys-off', 'proc', 'condition')];
    const r1 = evaluateProcessEligibility(nodes, edges, { sys: 'sys-off' }, []);
    expect(r1.eligible).toContain('proc');
    const r2 = evaluateProcessEligibility(nodes, edges, { sys: 'sys-on' }, []);
    expect(r2.eligible).not.toContain('proc');
  });

  test('trigger link requires a pending event for the source state', () => {
    const nodes = makeFixtureNodes();
    const edges = [edge('e1', 'sys-off', 'proc', 'trigger')];
    const noEvent = evaluateProcessEligibility(nodes, edges, { sys: 'sys-off' }, []);
    expect(noEvent.eligible).not.toContain('proc');
    const withEvent = evaluateProcessEligibility(
      nodes, edges, { sys: 'sys-off' },
      [{ stateId: 'sys-off', objectId: 'sys', tick: 3 }]
    );
    expect(withEvent.eligible).toContain('proc');
  });

  test('agent object with states must have one active (enabler, not consumed)', () => {
    const nodes = makeFixtureNodes();
    const edges = [edge('e1', 'sys', 'proc', 'agent')];
    const r = evaluateProcessEligibility(nodes, edges, { sys: null }, []);
    expect(r.eligible).not.toContain('proc');
  });
});

describe('OpmSimulationEngine — step', () => {
  test('fired process yields the target state and emits an event', () => {
    const nodes = makeFixtureNodes();
    const edges = [
      edge('e1', 'sys', 'proc', 'agent'),
      edge('e2', 'sys-off', 'proc', 'consumption'),
      edge('e3', 'proc', 'sys-on', 'result'),
    ];
    const init = initializeSimulation(nodes); // sys -> sys-off
    const r = stepSimulation(nodes, edges, init);

    expect(r.firingProcessIds).toEqual(['proc']);
    expect(r.state.objectActiveState['sys']).toBe('sys-on');
    // 'On' entry emits an event for the next tick
    expect(r.state.pendingEvents.map((ev: any) => ev.stateId)).toContain('sys-on');
    expect(r.state.tick).toBe(1);
    expect(r.state.trace[0].processId).toBe('proc');
    expect(r.state.trace[0].kind).toBe('fired');
  });

  test('without an enabler no process fires and the state becomes finished', () => {
    const nodes = makeFixtureNodes();
    const edges = [edge('e1', 'sys', 'proc', 'agent')];
    const init = initializeSimulation(nodes);
    const r = stepSimulation(nodes, edges, { ...init, objectActiveState: { sys: null } });
    expect(r.firingProcessIds).toEqual([]);
    expect(r.state.finished).toBe(true);
  });

  test('two processes consuming the same state resolve deterministically (name order)', () => {
    const nodes: AppNode[] = [
      ...makeFixtureNodes(),
      { id: 'proc-b', type: 'opmProcess', position: { x: 300, y: 150 },
        data: { name: 'Activate', type: 'process', physical: false, parentId: null } },
    ];
    // proc (id 'proc') and proc-b both consume sys-off
    const edges = [
      edge('e1', 'sys', 'proc', 'agent'),
      edge('e2', 'sys-off', 'proc', 'consumption'),
      edge('e3', 'sys', 'proc-b', 'agent'),
      edge('e4', 'sys-off', 'proc-b', 'consumption'),
    ];
    const init = initializeSimulation(nodes);
    const r = stepSimulation(nodes, edges, init);
    // Deterministic tie-break: identical names fall back to id order → 'proc' wins
    expect(r.firingProcessIds).toEqual(['proc']);
    expect(r.state.trace.some((t: any) => t.processId === 'proc-b' && t.kind === 'blocked')).toBe(true);
  });

  test('triggered process fires only on the tick after its state event', () => {
    const nodes = makeFixtureNodes();
    // 'On' entry triggers proc; proc has no other enabler requirements
    const edges = [edge('e1', 'sys-on', 'proc', 'trigger')];
    const init = initializeSimulation(nodes);
    const r1 = stepSimulation(nodes, edges, init);
    expect(r1.firingProcessIds).toEqual([]); // no event yet
    // Simulate 'On' having been entered externally at tick 1
    const r2 = stepSimulation(nodes, edges, {
      ...r1.state,
      objectActiveState: { sys: 'sys-on' },
      pendingEvents: [{ stateId: 'sys-on', objectId: 'sys', tick: 1 }],
    });
    expect(r2.firingProcessIds).toEqual(['proc']);
  });

  test('applySimResultToNodes syncs isActive/isFiring onto React Flow nodes', () => {
    const nodes = makeFixtureNodes();
    const edges = [
      edge('e1', 'sys', 'proc', 'agent'),
      edge('e2', 'sys-off', 'proc', 'consumption'),
      edge('e3', 'proc', 'sys-on', 'result'),
    ];
    const init = initializeSimulation(nodes);
    const r = stepSimulation(nodes, edges, init);
    const updated = applySimResultToNodes(nodes, r.state, r.firingProcessIds);

    const onNode = updated.find((n: any) => n.id === 'sys-on')!;
    const offNode = updated.find((n: any) => n.id === 'sys-off')!;
    const procNode = updated.find((n: any) => n.id === 'proc')!;
    expect((onNode.data as any).isActive).toBe(true);
    expect((offNode.data as any).isActive).toBe(false);
    expect((procNode.data as any).isFiring).toBe(true);
    const sysNode = updated.find((n: any) => n.id === 'sys')!;
    expect(sysNode.data.states!.find((s: any) => s.id === 'sys-on')!.isActive).toBe(true);
  });
});
