import { describe, it, expect } from 'vitest';
import type { AppNode, AppEdge, OpmModelSnapshot, OPMPort, OpmLifecycleDiagnostic } from '../EntropyTypes';
import {
  getCanonicalParentId,
  hasContainmentConflict,
  normalizeContainment,
  validateOpmModelLifecycle,
} from '../OpmModelLifecycle';
import { validateOpmPortConnection } from '../OpmPortContracts';

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
      const normalizedState = normalized.nodes.find((n: AppNode) => n.id === 's1')!;
      expect(normalizedState.parentId).toBe('obj1');
      expect(normalizedState.data.parentId).toBe('obj1');

      const normalizedObj = normalized.nodes.find((n: AppNode) => n.id === 'obj1')!;
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
      const normalizedState = normalized.nodes.find((n: AppNode) => n.id === 's1')!;
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
      const normalizedObj = normalized.nodes.find((n: AppNode) => n.id === 'obj1')!;
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
      expect(report.diagnostics.some((d: OpmLifecycleDiagnostic) => d.code === 'OPM_DUPLICATE_NODE_ID' && d.elementId === 'dup1')).toBe(true);
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
      expect(report.diagnostics.some((d: OpmLifecycleDiagnostic) => d.code === 'OPM_DUPLICATE_EDGE_ID' && d.elementId === 'e_dup')).toBe(true);
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
      expect(report.diagnostics.some((d: OpmLifecycleDiagnostic) => d.code === 'OPM_CONTAINMENT_CONFLICT' && d.elementId === 's1')).toBe(true);
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
      expect(report.diagnostics.some((d: OpmLifecycleDiagnostic) => d.code === 'OPM_CONTAINMENT_MISSING_PARENT' && d.elementId === 's1')).toBe(true);
    });

    it('rejects state without an owner object', () => {
      const state = createNode('s1', 'state'); // no parentId

      const report = validateOpmModelLifecycle({
        nodes: [state],
        edges: [],
      });

      expect(report.valid).toBe(false);
      expect(report.orphanNodeIds).toContain('s1');
      expect(report.diagnostics.some((d: OpmLifecycleDiagnostic) => d.code === 'OPM_STATE_MISSING_OWNER' && d.elementId === 's1')).toBe(true);
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
      expect(report.diagnostics.some((d: OpmLifecycleDiagnostic) => d.code === 'OPM_STATE_INVALID_OWNER' && d.elementId === 's1')).toBe(true);
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
      expect(report.diagnostics.some((d: OpmLifecycleDiagnostic) => d.code === 'OPM_ORPHAN_EDGE' && d.elementId === 'e1')).toBe(true);
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
      expect(report.diagnostics.some((d: OpmLifecycleDiagnostic) => d.code === 'OPM_STRUCTURAL_CYCLE')).toBe(true);
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
      expect(report.diagnostics.some((d: OpmLifecycleDiagnostic) => d.code === 'OPM_STRUCTURAL_CYCLE')).toBe(true);
    });
  });

  describe('validateOpmPortConnection', () => {
    const outPort: OPMPort = {
      id: 'out1',
      name: 'Out',
      type: 'float32',
      direction: 'output',
      position: 'right',
      multiplicity: 1,
    };
    const inPort: OPMPort = {
      id: 'in1',
      name: 'In',
      type: 'float32',
      direction: 'input',
      position: 'left',
    };
    const boolInPort: OPMPort = {
      id: 'in_bool',
      name: 'InBool',
      type: 'bool',
      direction: 'input',
      position: 'left',
    };

    it('resolves sourcePort and targetPort on valid connection', () => {
      const proc = createNode('proc1', 'process', {
        data: { name: 'P1', type: 'process', physical: false, outputs: [outPort] },
      });
      const obj = createNode('obj1', 'object', {
        data: { name: 'O1', type: 'object', physical: false, inputs: [inPort] },
      });

      const verdict = validateOpmPortConnection([proc, obj], [], {
        source: 'proc1',
        target: 'obj1',
        sourceHandle: 'out1',
        targetHandle: 'in1',
      }, 'result');

      expect(verdict.valid).toBe(true);
      expect(verdict.sourcePort).toMatchObject({ id: 'out1' });
      expect(verdict.targetPort).toMatchObject({ id: 'in1' });
    });

    it('rejects missing source handle', () => {
      const proc = createNode('proc1', 'process');
      const obj = createNode('obj1', 'object', {
        data: { name: 'O1', type: 'object', physical: false, inputs: [inPort] },
      });

      const verdict = validateOpmPortConnection([proc, obj], [], {
        source: 'proc1',
        target: 'obj1',
        sourceHandle: 'missing_h',
        targetHandle: 'in1',
      }, 'result');

      expect(verdict.valid).toBe(false);
      expect(verdict.code).toBe('OPM_PORT_HANDLE_MISSING');
    });

    it('rejects handle defined on the wrong node', () => {
      const proc1 = createNode('proc1', 'process', {
        data: { name: 'P1', type: 'process', physical: false, outputs: [outPort] },
      });
      const proc2 = createNode('proc2', 'process');
      const obj = createNode('obj1', 'object', {
        data: { name: 'O1', type: 'object', physical: false, inputs: [inPort] },
      });

      // Passing proc2 as source, but outPort exists on proc1
      const verdict = validateOpmPortConnection([proc1, proc2, obj], [], {
        source: 'proc2',
        target: 'obj1',
        sourceHandle: 'out1',
        targetHandle: 'in1',
      }, 'result');

      expect(verdict.valid).toBe(false);
      expect(verdict.code).toBe('OPM_PORT_HANDLE_WRONG_NODE');
    });

    it('rejects input port used as source', () => {
      const proc = createNode('proc1', 'process', {
        data: { name: 'P1', type: 'process', physical: false, inputs: [inPort] },
      });
      const obj = createNode('obj1', 'object', {
        data: { name: 'O1', type: 'object', physical: false, inputs: [inPort] },
      });

      const verdict = validateOpmPortConnection([proc, obj], [], {
        source: 'proc1',
        target: 'obj1',
        sourceHandle: 'in1',
        targetHandle: 'in1',
      }, 'result');

      expect(verdict.valid).toBe(false);
      expect(verdict.code).toBe('OPM_PORT_INPUT_AS_SOURCE');
    });

    it('rejects output port used as target', () => {
      const proc = createNode('proc1', 'process', {
        data: { name: 'P1', type: 'process', physical: false, outputs: [outPort] },
      });
      const obj = createNode('obj1', 'object', {
        data: { name: 'O1', type: 'object', physical: false, outputs: [outPort] },
      });

      const verdict = validateOpmPortConnection([proc, obj], [], {
        source: 'proc1',
        target: 'obj1',
        sourceHandle: 'out1',
        targetHandle: 'out1',
      }, 'result');

      expect(verdict.valid).toBe(false);
      expect(verdict.code).toBe('OPM_PORT_OUTPUT_AS_TARGET');
    });

    it('rejects incompatible scalar types between source and target ports', () => {
      const proc = createNode('proc1', 'process', {
        data: { name: 'P1', type: 'process', physical: false, outputs: [outPort] }, // float32
      });
      const obj = createNode('obj1', 'object', {
        data: { name: 'O1', type: 'object', physical: false, inputs: [boolInPort] }, // bool
      });

      const verdict = validateOpmPortConnection([proc, obj], [], {
        source: 'proc1',
        target: 'obj1',
        sourceHandle: 'out1',
        targetHandle: 'in_bool',
      }, 'result');

      expect(verdict.valid).toBe(false);
      expect(verdict.code).toBe('OPM_PORT_TYPE_INCOMPATIBLE');
    });

    it('rejects duplicate same-port links', () => {
      const proc = createNode('proc1', 'process', {
        data: { name: 'P1', type: 'process', physical: false, outputs: [outPort] },
      });
      const obj = createNode('obj1', 'object', {
        data: { name: 'O1', type: 'object', physical: false, inputs: [inPort] },
      });
      const existingEdge = createEdge('e1', 'proc1', 'obj1', 'result', {
        sourceHandle: 'out1',
        targetHandle: 'in1',
      });

      const verdict = validateOpmPortConnection([proc, obj], [existingEdge], {
        source: 'proc1',
        target: 'obj1',
        sourceHandle: 'out1',
        targetHandle: 'in1',
      }, 'result');

      expect(verdict.valid).toBe(false);
      expect(verdict.code).toBe('OPM_DUPLICATE_PORT_CONNECTION');
    });

    it('rejects multiplicity overflow', () => {
      const proc = createNode('proc1', 'process', {
        data: { name: 'P1', type: 'process', physical: false, outputs: [{ ...outPort, multiplicity: 1 }] },
      });
      const obj1 = createNode('obj1', 'object', {
        data: { name: 'O1', type: 'object', physical: false, inputs: [inPort] },
      });
      const obj2 = createNode('obj2', 'object', {
        data: { name: 'O2', type: 'object', physical: false, inputs: [inPort] },
      });
      // Existing edge from out1 on proc1 to obj1
      const existingEdge = createEdge('e1', 'proc1', 'obj1', 'result', {
        sourceHandle: 'out1',
        targetHandle: 'in1',
      });

      const verdict = validateOpmPortConnection([proc, obj1, obj2], [existingEdge], {
        source: 'proc1',
        target: 'obj2',
        sourceHandle: 'out1',
        targetHandle: 'in1',
      }, 'result');

      expect(verdict.valid).toBe(false);
      expect(verdict.code).toBe('OPM_PORT_MULTIPLICITY_OVERFLOW');
    });

    it('rejects conceptual-only / executable incompatibility when executable connection is requested', () => {
      const proc = createNode('proc1', 'process', {
        data: {
          name: 'P1',
          type: 'process',
          physical: false,
          processExecution: {
            enabled: true,
            activation: 'cyclic',
            inputAttributeIds: [],
            outputAttributeIds: [],
            guard: '',
            assignments: [],
            priority: 1,
            debounceMs: 0,
            reentrancy: 'reject',
          },
        },
      });
      const obj = createNode('obj1', 'object'); // conceptual-only!

      const verdict = validateOpmPortConnection([proc, obj], [], {
        source: 'proc1',
        target: 'obj1',
        isExecutable: true,
      }, 'result');

      expect(verdict.valid).toBe(false);
      expect(verdict.code).toBe('OPM_CONCEPTUAL_EXECUTABLE_INCOMPATIBLE');
    });

    it('rejects requirement aggregation with stable code OPM_REQUIREMENT_STRUCTURAL_LINK_INVALID', () => {
      const req = createNode('r1', 'requirement');
      const obj = createNode('o1', 'object');

      const verdict = validateOpmPortConnection([req, obj], [], {
        source: 'r1',
        target: 'o1',
      }, 'aggregation');

      expect(verdict.valid).toBe(false);
      expect(verdict.code).toBe('OPM_REQUIREMENT_STRUCTURAL_LINK_INVALID');
    });
  });
});
