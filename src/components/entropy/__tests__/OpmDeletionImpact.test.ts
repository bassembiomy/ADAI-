import { describe, it, expect } from 'vitest';
import type { AppNode, AppEdge, OpmModelSnapshot, OPMPort } from '../EntropyTypes';
import {
  analyzeOpmDeletion,
  applyOpmDeletion,
  type OpmDeletionTarget,
} from '../OpmDeletionImpact';

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

describe('OpmDeletionImpact', () => {
  it('deleting an Object cascades to direct and transitive child nodes and all incident edges', () => {
    const parentObj = createNode('parent', 'object');
    const childObj = createNode('child', 'object', {
      parentId: 'parent',
      data: { name: 'child', type: 'object', physical: false, parentId: 'parent' },
    });
    const childState = createNode('s1', 'state', {
      parentId: 'parent',
      data: { name: 's1', type: 'state', physical: false, parentId: 'parent' },
    });
    const grandchildState = createNode('s2', 'state', {
      parentId: 'child',
      data: { name: 's2', type: 'state', physical: false, parentId: 'child' },
    });
    const proc = createNode('proc', 'process');

    const e1 = createEdge('e1', 'parent', 'proc', 'agent');
    const e2 = createEdge('e2', 's1', 'proc', 'consumption');
    const e3 = createEdge('e3', 'proc', 's2', 'result');

    const snapshot: OpmModelSnapshot = {
      nodes: [parentObj, childObj, childState, grandchildState, proc],
      edges: [e1, e2, e3],
    };

    const impact = analyzeOpmDeletion(snapshot, { nodeIds: ['parent'] });

    expect(impact.closureNodeIds.sort()).toEqual(['child', 'parent', 's1', 's2'].sort());
    expect(impact.closureEdgeIds.sort()).toEqual(['e1', 'e2', 'e3'].sort());
    expect(impact.summary.descendantsCascadedCount).toBe(3);
    expect(impact.summary.isHighImpact).toBe(true);

    const result = applyOpmDeletion(snapshot, impact);
    expect(result.snapshot.nodes.map(n => n.id)).toEqual(['proc']);
    expect(result.snapshot.edges).toHaveLength(0);
    expect(result.invalidatesSimulation).toBe(true);
    expect(result.invalidatesEvidence).toBe(true);
  });

  it('deleting a Process removes incident procedural edges and reports affected simulation IDs', () => {
    const obj = createNode('obj', 'object');
    const proc = createNode('proc', 'process');
    const edge = createEdge('e1', 'obj', 'proc', 'agent');

    const snapshot: OpmModelSnapshot = {
      nodes: [obj, proc],
      edges: [edge],
    };

    const impact = analyzeOpmDeletion(snapshot, { nodeIds: ['proc'] });
    expect(impact.closureNodeIds).toEqual(['proc']);
    expect(impact.closureEdgeIds).toEqual(['e1']);
    expect(impact.affectedSimulationIds).toContain('proc');

    const result = applyOpmDeletion(snapshot, impact);
    expect(result.snapshot.nodes.map(n => n.id)).toEqual(['obj']);
    expect(result.snapshot.edges).toHaveLength(0);
  });

  it('deleting a State removes the state node, purges it from parent data.states, and removes incident edges', () => {
    const obj = createNode('obj', 'object', {
      data: {
        name: 'obj',
        type: 'object',
        physical: false,
        states: [
          { id: 's1', name: 's1', isActive: true },
          { id: 's2', name: 's2', isActive: false },
        ],
      },
    });
    const s1 = createNode('s1', 'state', {
      parentId: 'obj',
      data: { name: 's1', type: 'state', physical: false, parentId: 'obj' },
    });
    const s2 = createNode('s2', 'state', {
      parentId: 'obj',
      data: { name: 's2', type: 'state', physical: false, parentId: 'obj' },
    });
    const proc = createNode('proc', 'process');
    const e1 = createEdge('e1', 's1', 'proc', 'consumption');
    const e2 = createEdge('e2', 'proc', 's2', 'result');

    const snapshot: OpmModelSnapshot = {
      nodes: [obj, s1, s2, proc],
      edges: [e1, e2],
    };

    const impact = analyzeOpmDeletion(snapshot, { nodeIds: ['s1'] });
    expect(impact.closureNodeIds).toEqual(['s1']);
    expect(impact.closureEdgeIds).toEqual(['e1']);

    const result = applyOpmDeletion(snapshot, impact);
    expect(result.snapshot.nodes.map(n => n.id).sort()).toEqual(['obj', 'proc', 's2'].sort());
    expect(result.snapshot.edges.map(e => e.id)).toEqual(['e2']);

    const survivingObj = result.snapshot.nodes.find(n => n.id === 'obj')!;
    expect(survivingObj.data.states?.map(s => s.id)).toEqual(['s2']);
  });

  it('deleting a Requirement updates affected requirements and removes satisfies/verifies links', () => {
    const req = createNode('r1', 'requirement');
    const obj = createNode('obj', 'object');
    const edge = createEdge('e_sat', 'r1', 'obj', 'satisfies');

    const snapshot: OpmModelSnapshot = {
      nodes: [req, obj],
      edges: [edge],
    };

    const impact = analyzeOpmDeletion(snapshot, { nodeIds: ['r1'] });
    expect(impact.closureNodeIds).toEqual(['r1']);
    expect(impact.closureEdgeIds).toEqual(['e_sat']);
    expect(impact.affectedRequirementIds).toContain('r1');

    const result = applyOpmDeletion(snapshot, impact);
    expect(result.snapshot.nodes.map(n => n.id)).toEqual(['obj']);
    expect(result.snapshot.edges).toHaveLength(0);
  });

  it('deleting a Port removes the port and all incident edges connecting to that handle', () => {
    const p1: OPMPort = { id: 'p1', name: 'Port1', type: 'float32', direction: 'output', position: 'right' };
    const p2: OPMPort = { id: 'p2', name: 'Port2', type: 'float32', direction: 'input', position: 'left' };

    const proc = createNode('proc', 'process', {
      data: { name: 'proc', type: 'process', physical: false, outputs: [p1] },
    });
    const obj = createNode('obj', 'object', {
      data: { name: 'obj', type: 'object', physical: false, inputs: [p2] },
    });

    const edge = createEdge('e1', 'proc', 'obj', 'result', {
      sourceHandle: 'p1',
      targetHandle: 'p2',
    });

    const snapshot: OpmModelSnapshot = {
      nodes: [proc, obj],
      edges: [edge],
    };

    const impact = analyzeOpmDeletion(snapshot, {
      portRefs: [{ nodeId: 'proc', portId: 'p1', direction: 'output' }],
    });

    expect(impact.closureEdgeIds).toContain('e1');
    expect(impact.closureNodeIds).toHaveLength(0);

    const result = applyOpmDeletion(snapshot, impact);
    expect(result.snapshot.edges).toHaveLength(0);
    const updatedProc = result.snapshot.nodes.find(n => n.id === 'proc')!;
    expect(updatedProc.data.outputs).toHaveLength(0);
  });

  it('deleting a Link removes the edge only and preserves endpoint nodes', () => {
    const n1 = createNode('n1', 'object');
    const n2 = createNode('n2', 'process');
    const edge = createEdge('e1', 'n1', 'n2', 'agent');

    const snapshot: OpmModelSnapshot = {
      nodes: [n1, n2],
      edges: [edge],
    };

    const impact = analyzeOpmDeletion(snapshot, { edgeIds: ['e1'] });
    expect(impact.closureNodeIds).toHaveLength(0);
    expect(impact.closureEdgeIds).toEqual(['e1']);

    const result = applyOpmDeletion(snapshot, impact);
    expect(result.snapshot.nodes).toHaveLength(2);
    expect(result.snapshot.edges).toHaveLength(0);
  });

  it('different deletion entry points (panel, keyboard, RF) produce identical result snapshots for the same target', () => {
    const obj = createNode('obj', 'object');
    const state = createNode('s1', 'state', {
      parentId: 'obj',
      data: { name: 's1', type: 'state', physical: false, parentId: 'obj' },
    });
    const proc = createNode('proc', 'process');
    const edge = createEdge('e1', 's1', 'proc', 'consumption');

    const snapshot: OpmModelSnapshot = {
      nodes: [obj, state, proc],
      edges: [edge],
    };

    // Route A: panel delete selectedNode (obj)
    const targetA: OpmDeletionTarget = { nodeIds: ['obj'] };
    const impactA = analyzeOpmDeletion(snapshot, targetA);
    const resultA = applyOpmDeletion(snapshot, impactA);

    // Route B: multi-selection keyboard delete (obj and child state selected)
    const targetB: OpmDeletionTarget = { nodeIds: ['obj', 's1'] };
    const impactB = analyzeOpmDeletion(snapshot, targetB);
    const resultB = applyOpmDeletion(snapshot, impactB);

    expect(resultA.snapshot).toEqual(resultB.snapshot);
    expect(resultA.snapshot.nodes.map(n => n.id)).toEqual(['proc']);
    expect(resultA.snapshot.edges).toHaveLength(0);
  });
});
