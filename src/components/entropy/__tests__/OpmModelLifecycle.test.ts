import { describe, it, expect } from 'vitest';
import type { AppNode, AppEdge, OpmModelSnapshot } from '../EntropyTypes';
import {
  getCanonicalParentId,
  hasContainmentConflict,
  normalizeContainment,
  validateOpmModelLifecycle,
} from '../OpmModelLifecycle';

function createNode(id: string, type: 'object' | 'process' | 'state' | 'requirement', overrides: Partial<AppNode> = {}): AppNode {
  return {
    id,
    type: type === 'object' ? 'opmObject' : type === 'process' ? 'opmProcess' : 'opmState',
    position: { x: 0, y: 0 },
    data: {
      name: id,
      type,
      physical: false,
      ...(overrides.data || {}),
    },
    ...overrides,
  } as AppNode;
}

function createEdge(id: string, source: string, target: string, linkType: string = 'effect', overrides: Partial<AppEdge> = {}): AppEdge {
  return {
    id,
    source,
    target,
    type: 'opmEdge',
    data: {
      type: linkType as any,
      ...(overrides.data || {}),
    },
    ...overrides,
  } as AppEdge;
}

describe('OpmModelLifecycle', () => {
  describe('getCanonicalParentId and containment conflict', () => {
    it('returns parentId when node.parentId and node.data.parentId match', () => {
      const node = createNode('s1', 'state', {
        parentId: 'obj1',
        data: { name: 's1', type: 'state', physical: false, parentId: 'obj1' },
      });
      expect(getCanonicalParentId(node)).toBe('obj1');
      expect(hasContainmentConflict(node)).toBe(false);
    });

    it('returns parentId when only node.parentId is set', () => {
      const node = createNode('s1', 'state', {
        parentId: 'obj1',
        data: { name: 's1', type: 'state', physical: false },
      });
      expect(getCanonicalParentId(node)).toBe('obj1');
      expect(hasContainmentConflict(node)).toBe(false);
    });

    it('returns parentId when only node.data.parentId is set', () => {
      const node = createNode('s1', 'state', {
        data: { name: 's1', type: 'state', physical: false, parentId: 'obj1' },
      });
      expect(getCanonicalParentId(node)).toBe('obj1');
      expect(hasContainmentConflict(node)).toBe(false);
    });

    it('returns null and detects conflict when node.parentId and node.data.parentId disagree', () => {
      const node = createNode('s1', 'state', {
        parentId: 'obj1',
        data: { name: 's1', type: 'state', physical: false, parentId: 'obj2' },
      });
      expect(getCanonicalParentId(node)).toBeNull();
      expect(hasContainmentConflict(node)).toBe(true);
    });

    it('returns null when neither is set', () => {
      const node = createNode('o1', 'object');
      expect(getCanonicalParentId(node)).toBeNull();
      expect(hasContainmentConflict(node)).toBe(false);
    });
  });

  describe('normalizeContainment', () => {
    it('synchronizes parentId and data.parentId when one is absent', () => {
      const obj = createNode('obj1', 'object');
      const stateNode = createNode('s1', 'state', {
        parentId: 'obj1',
        data: { name: 'Idle', type: 'state', physical: false, isInitial: true },
      });

      const snapshot: OpmModelSnapshot = {
        nodes: [obj, stateNode],
        edges: [],
      };

      const normalized = normalizeContainment(snapshot);
      const normalizedState = normalized.nodes.find(n => n.id === 's1')!;
      expect(normalizedState.parentId).toBe('obj1');
      expect(normalizedState.data.parentId).toBe('obj1');

      const normalizedObj = normalized.nodes.find(n => n.id === 'obj1')!;
      expect(normalizedObj.data.states).toBeDefined();
      expect(normalizedObj.data.states).toHaveLength(1);
      expect(normalizedObj.data.states![0]).toMatchObject({
        id: 's1',
        name: 'Idle',
        isInitial: true,
      });
    });

    it('does not silently overwrite conflicting parentIds', () => {
      const stateNode = createNode('s1', 'state', {
        parentId: 'obj1',
        data: { name: 's1', type: 'state', physical: false, parentId: 'obj2' },
      });
      const snapshot: OpmModelSnapshot = {
        nodes: [stateNode],
        edges: [],
      };

      const normalized = normalizeContainment(snapshot);
      const normalizedState = normalized.nodes.find(n => n.id === 's1')!;
      expect(normalizedState.parentId).toBe('obj1');
      expect(normalizedState.data.parentId).toBe('obj2');
    });

    it('prunes deleted states from parent object states array', () => {
      const obj = createNode('obj1', 'object', {
        data: {
          name: 'obj1',
          type: 'object',
          physical: false,
          states: [
            { id: 's_ghost', name: 'Ghost', isActive: false },
            { id: 's1', name: 'Active', isActive: true },
          ],
        },
      });
      const s1 = createNode('s1', 'state', {
        parentId: 'obj1',
        data: { name: 'Active', type: 'state', physical: false, parentId: 'obj1' },
      });

      const snapshot: OpmModelSnapshot = {
        nodes: [obj, s1],
        edges: [],
      };

      const normalized = normalizeContainment(snapshot);
      const normalizedObj = normalized.nodes.find(n => n.id === 'obj1')!;
      expect(normalizedObj.data.states).toHaveLength(1);
      expect(normalizedObj.data.states![0].id).toBe('s1');
    });
  });

  describe('validateOpmModelLifecycle', () => {
    it('passes for a valid model with objects, processes, states, and valid links', () => {
      const obj = createNode('obj1', 'object');
      const state = createNode('s1', 'state', {
        parentId: 'obj1',
        data: { name: 's1', type: 'state', physical: false, parentId: 'obj1' },
      });
      const proc = createNode('proc1', 'process');
      const edge = createEdge('e1', 'obj1', 'proc1', 'agent');

      const report = validateOpmModelLifecycle({
        nodes: [obj, state, proc],
        edges: [edge],
      });

      expect(report.valid).toBe(true);
      expect(report.diagnostics).toHaveLength(0);
      expect(report.orphanNodeIds).toHaveLength(0);
      expect(report.orphanEdgeIds).toHaveLength(0);
      expect(report.structuralCycleIds).toHaveLength(0);
      expect(report.conflictingContainmentIds).toHaveLength(0);
    });

    it('rejects duplicate node IDs', () => {
      const n1 = createNode('dup1', 'object');
      const n2 = createNode('dup1', 'process');

      const report = validateOpmModelLifecycle({
        nodes: [n1, n2],
        edges: [],
      });

      expect(report.valid).toBe(false);
      expect(report.diagnostics.some(d => d.code === 'OPM_DUPLICATE_NODE_ID' && d.elementId === 'dup1')).toBe(true);
    });

    it('rejects duplicate edge IDs', () => {
      const n1 = createNode('n1', 'object');
      const n2 = createNode('n2', 'process');
      const e1 = createEdge('e_dup', 'n1', 'n2', 'agent');
      const e2 = createEdge('e_dup', 'n1', 'n2', 'consumption');

      const report = validateOpmModelLifecycle({
        nodes: [n1, n2],
        edges: [e1, e2],
      });

      expect(report.valid).toBe(false);
      expect(report.diagnostics.some(d => d.code === 'OPM_DUPLICATE_EDGE_ID' && d.elementId === 'e_dup')).toBe(true);
    });

    it('rejects conflicting containment parentId vs data.parentId', () => {
      const state = createNode('s1', 'state', {
        parentId: 'objA',
        data: { name: 's1', type: 'state', physical: false, parentId: 'objB' },
      });
      const objA = createNode('objA', 'object');
      const objB = createNode('objB', 'object');

      const report = validateOpmModelLifecycle({
        nodes: [objA, objB, state],
        edges: [],
      });

      expect(report.valid).toBe(false);
      expect(report.conflictingContainmentIds).toContain('s1');
      expect(report.diagnostics.some(d => d.code === 'OPM_CONTAINMENT_CONFLICT' && d.elementId === 's1')).toBe(true);
    });

    it('rejects missing parent node', () => {
      const state = createNode('s1', 'state', {
        parentId: 'missing_obj',
        data: { name: 's1', type: 'state', physical: false, parentId: 'missing_obj' },
      });

      const report = validateOpmModelLifecycle({
        nodes: [state],
        edges: [],
      });

      expect(report.valid).toBe(false);
      expect(report.orphanNodeIds).toContain('s1');
      expect(report.diagnostics.some(d => d.code === 'OPM_CONTAINMENT_MISSING_PARENT' && d.elementId === 's1')).toBe(true);
    });

    it('rejects state without an owner object', () => {
      const state = createNode('s1', 'state'); // no parentId

      const report = validateOpmModelLifecycle({
        nodes: [state],
        edges: [],
      });

      expect(report.valid).toBe(false);
      expect(report.orphanNodeIds).toContain('s1');
      expect(report.diagnostics.some(d => d.code === 'OPM_STATE_MISSING_OWNER' && d.elementId === 's1')).toBe(true);
    });

    it('rejects state whose parent is not an Object', () => {
      const proc = createNode('proc1', 'process');
      const state = createNode('s1', 'state', {
        parentId: 'proc1',
        data: { name: 's1', type: 'state', physical: false, parentId: 'proc1' },
      });

      const report = validateOpmModelLifecycle({
        nodes: [proc, state],
        edges: [],
      });

      expect(report.valid).toBe(false);
      expect(report.conflictingContainmentIds).toContain('s1');
      expect(report.diagnostics.some(d => d.code === 'OPM_STATE_INVALID_OWNER' && d.elementId === 's1')).toBe(true);
    });

    it('rejects orphan edge whose endpoints do not exist', () => {
      const n1 = createNode('n1', 'object');
      const edge = createEdge('e1', 'n1', 'missing_target', 'agent');

      const report = validateOpmModelLifecycle({
        nodes: [n1],
        edges: [edge],
      });

      expect(report.valid).toBe(false);
      expect(report.orphanEdgeIds).toContain('e1');
      expect(report.diagnostics.some(d => d.code === 'OPM_ORPHAN_EDGE' && d.elementId === 'e1')).toBe(true);
    });

    it('detects structural cycles in aggregation / generalization edges', () => {
      const o1 = createNode('o1', 'object');
      const o2 = createNode('o2', 'object');
      const o3 = createNode('o3', 'object');

      // o1 -> o2 -> o3 -> o1
      const e1 = createEdge('e1', 'o1', 'o2', 'aggregation');
      const e2 = createEdge('e2', 'o2', 'o3', 'aggregation');
      const e3 = createEdge('e3', 'o3', 'o1', 'generalization');

      const report = validateOpmModelLifecycle({
        nodes: [o1, o2, o3],
        edges: [e1, e2, e3],
      });

      expect(report.valid).toBe(false);
      expect(report.structuralCycleIds.length).toBeGreaterThan(0);
      expect(report.diagnostics.some(d => d.code === 'OPM_STRUCTURAL_CYCLE')).toBe(true);
    });

    it('detects containment cycles', () => {
      const o1 = createNode('o1', 'object', {
        parentId: 'o2',
        data: { name: 'o1', type: 'object', physical: false, parentId: 'o2' },
      });
      const o2 = createNode('o2', 'object', {
        parentId: 'o1',
        data: { name: 'o2', type: 'object', physical: false, parentId: 'o1' },
      });

      const report = validateOpmModelLifecycle({
        nodes: [o1, o2],
        edges: [],
      });

      expect(report.valid).toBe(false);
      expect(report.structuralCycleIds.length).toBeGreaterThan(0);
      expect(report.diagnostics.some(d => d.code === 'OPM_STRUCTURAL_CYCLE')).toBe(true);
    });
  });
});
