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

describe('OpmViewDeriver — lifecycle awareness & diagnostics', () => {
  test('BDD reports structural cycles and orphan edges in diagnostics', () => {
    const o1 = obj('o1', 'Obj1');
    const o2 = obj('o2', 'Obj2');
    const cycle1 = edge('e1', 'o1', 'o2', 'aggregation');
    const cycle2 = edge('e2', 'o2', 'o1', 'aggregation');
    const orphan = edge('e3', 'o1', 'missing_node', 'aggregation');

    const tree = deriveStructureView([o1, o2], [cycle1, cycle2, orphan]);
    expect((tree as any).diagnostics).toBeDefined();
    const codes = ((tree as any).diagnostics as any[]).map(d => d.code);
    expect(codes).toContain('OPM_STRUCTURAL_CYCLE');
    expect(codes).toContain('OPM_ORPHAN_EDGE');
  });

  test('IBD reports unresolved endpoint and port mappings', () => {
    const p1 = proc('p1', 'Process1');
    const badEdge = edge('e_orphan', 'missing_source', 'p1', 'consumption');

    const internal = deriveInternalView([p1], [badEdge], 'p1');
    expect(internal).not.toBeNull();
    expect(internal!.unresolvedMappings).toBeDefined();
    expect(internal!.unresolvedMappings!.length).toBeGreaterThan(0);
    expect(internal!.unresolvedMappings![0].edgeId).toBe('e_orphan');
  });

  test('Requirements distinguishes uncovered, covered, verified, failed, and stale', () => {
    const rUncovered = req('r_uncovered', 'UncoveredReq');
    const rCovered = req('r_covered', 'CoveredReq');
    const rVerified = req('r_verified', 'VerifiedReq');
    const rFailed = req('r_failed', 'FailedReq');
    (rFailed.data as any).status = 'failed';
    const rStale = req('r_stale', 'StaleReq');
    (rStale.data as any).status = 'stale';

    const o = obj('o', 'TargetObj');
    const p = proc('p', 'TargetProc');

    const eCovered = edge('e_cov', 'r_covered', 'o', 'satisfies');
    const eVerified = edge('e_ver', 'r_verified', 'p', 'verifies');

    const traces = deriveRequirementsView(
      [rUncovered, rCovered, rVerified, rFailed, rStale, o, p],
      [eCovered, eVerified]
    );

    const findStatus = (id: string) => traces.find((t: any) => t.requirementId === id)?.status;

    expect(findStatus('r_uncovered')).toBe('uncovered');
    expect(findStatus('r_covered')).toBe('covered');
    expect(findStatus('r_verified')).toBe('verified');
    expect(findStatus('r_failed')).toBe('failed');
    expect(findStatus('r_stale')).toBe('stale');
  });
});
