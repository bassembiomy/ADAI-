import { describe, test, expect } from 'vitest';
import {
  deriveStructureView,
  deriveBehaviorView,
  deriveRequirementsView,
  deriveInternalView,
} from '../OpmViewDeriver';
import type { AppNode, AppEdge } from '../EntropyTypes';

function obj(id: string, name: string, parentId: string | null = null): AppNode {
  return { id, type: 'opmObject', position: { x: 0, y: 0 },
    data: { name, type: 'object', physical: false, parentId } };
}
function req(id: string, name: string): AppNode {
  return { id, type: 'opmObject' as any, position: { x: 0, y: 0 },
    data: { name, type: 'requirement', physical: false, parentId: null, requirementText: 'shall work' } };
}
function proc(id: string, name: string): AppNode {
  return { id, type: 'opmProcess', position: { x: 0, y: 0 },
    data: { name, type: 'process', physical: false, parentId: null } };
}
function edge(id: string, source: string, target: string, type: string): AppEdge {
  return { id, source, target, data: { type } } as AppEdge;
}

const nodes: AppNode[] = [
  obj('sys', 'Home_System'),
  obj('sensor', 'Sensor'),
  obj('hvac', 'HVAC'),
  proc('p1', 'Monitor'),
  proc('p2', 'Regulate'),
  req('r1', 'Fast_Response'),
];
const edges: AppEdge[] = [
  edge('e1', 'sys', 'sensor', 'aggregation'),
  edge('e2', 'sys', 'hvac', 'aggregation'),
  edge('e3', 'sensor', 'p1', 'agent'),
  edge('e4', 'r1', 'p2', 'satisfies'),
];

describe('OpmViewDeriver — structure (replaces BDD)', () => {
  test('builds an aggregation tree with Home_System as root', () => {
    const tree = deriveStructureView(nodes, edges);
    expect(tree).toHaveLength(1);
    expect(tree[0].name).toBe('Home_System');
    expect(tree[0].children.map((c: any) => c.name).sort()).toEqual(['HVAC', 'Sensor']);
  });
});

describe('OpmViewDeriver — behavior (replaces state machine)', () => {
  test('collects result/consumption transitions per object', () => {
    const sysState: AppNode = { id: 's-on', type: 'opmState', position: { x: 0, y: 0 }, parentId: 'sys',
      data: { name: 'On', type: 'state', physical: false, parentId: 'sys' } };
    const behavior = deriveBehaviorView([nodes[0], sysState, proc('p3', 'Switch_On')], [
      edge('e5', 'p3', 's-on', 'result'),
      edge('e6', 's-on', 'p3', 'consumption'),
    ]);
    const sys = behavior.find((b: any) => b.objectName === 'Home_System')!;
    expect(sys.transitions).toHaveLength(2);
    expect(sys.transitions.some((t: any) => t.kind === 'result' && t.processName === 'Switch_On')).toBe(true);
    expect(sys.transitions.some((t: any) => t.kind === 'consumption' && t.fromStateId === 's-on')).toBe(true);
  });
});

describe('OpmViewDeriver — requirements (replaces requirements diagram)', () => {
  test('lists satisfied elements per requirement', () => {
    const trace = deriveRequirementsView(nodes, edges);
    expect(trace).toHaveLength(1);
    expect(trace[0].requirementName).toBe('Fast_Response');
    expect(trace[0].satisfiedBy).toEqual([{ id: 'p2', name: 'Regulate', kind: 'process' }]);
  });
});

describe('OpmViewDeriver — internal view (replaces IBD)', () => {
  test('splits links of a process into inputs and outputs', () => {
    const view = deriveInternalView(nodes, [...edges, edge('e7', 'p2', 'hvac', 'effect')], 'p2');
    expect(view!.processName).toBe('Regulate');
    expect(view!.inputs).toEqual([{ peerId: 'r1', peerName: 'Fast_Response', peerType: 'requirement', linkType: 'satisfies', direction: 'in' }]);
    expect(view!.outputs).toEqual([{ peerId: 'hvac', peerName: 'HVAC', peerType: 'object', linkType: 'effect', direction: 'out' }]);
  });

  test('returns null for unknown process id', () => {
    expect(deriveInternalView(nodes, edges, 'nope')).toBeNull();
  });
});
