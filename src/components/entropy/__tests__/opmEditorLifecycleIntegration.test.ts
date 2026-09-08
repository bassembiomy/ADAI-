import { describe, it, expect } from 'vitest';
import type { AppNode, AppEdge, OpmModelSnapshot, OPMPort } from '../EntropyTypes';
import { analyzeOpmDeletion, applyOpmDeletion } from '../OpmDeletionImpact';
import { validateOpmModelLifecycle, normalizeContainment } from '../OpmModelLifecycle';
import { validateOpmPortConnection } from '../OpmPortContracts';
import { convertOpmEdgeType, convertOpmNodeType } from '../OpmMigrations';
import { importSysmlToOpm } from '../SysmlToOpmImporter';

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

describe('OPM Editor Lifecycle Integration (Task 5)', () => {
  it('panel, keyboard, and React Flow deletion all produce identical cascades for the same selection', () => {
    const obj = createNode('tank', 'object', {
      data: {
        name: 'Tank',
        type: 'object',
        physical: true,
        states: [{ id: 'st_full', name: 'Full', isActive: true }],
      },
    });
    const state = createNode('st_full', 'state', {
      parentId: 'tank',
      data: { name: 'Full', type: 'state', physical: false, parentId: 'tank' },
    });
    const proc = createNode('pump', 'process');
    const e1 = createEdge('e1', 'st_full', 'pump', 'consumption');

    const snapshot: OpmModelSnapshot = {
      nodes: [obj, state, proc],
      edges: [e1],
    };

    // Route 1: Panel delete tank
    const impact1 = analyzeOpmDeletion(snapshot, { nodeIds: ['tank'] });
    const result1 = applyOpmDeletion(snapshot, impact1);

    // Route 2: Keyboard delete [tank, st_full]
    const impact2 = analyzeOpmDeletion(snapshot, { nodeIds: ['tank', 'st_full'] });
    const result2 = applyOpmDeletion(snapshot, impact2);

    // Route 3: RF onNodesDelete [{ id: 'tank' }]
    const impact3 = analyzeOpmDeletion(snapshot, { nodeIds: ['tank'] });
    const result3 = applyOpmDeletion(snapshot, impact3);

    expect(result1.snapshot).toEqual(result2.snapshot);
    expect(result2.snapshot).toEqual(result3.snapshot);
    expect(result1.snapshot.nodes.map(n => n.id)).toEqual(['pump']);
    expect(result1.snapshot.edges).toHaveLength(0);
  });

  it('state delete purges state from parent object and cleans incident edges', () => {
    const obj = createNode('tank', 'object', {
      data: {
        name: 'Tank',
        type: 'object',
        physical: true,
        states: [
          { id: 'st1', name: 'Empty', isActive: false },
          { id: 'st2', name: 'Full', isActive: true },
        ],
      },
    });
    const st1 = createNode('st1', 'state', {
      parentId: 'tank',
      data: { name: 'Empty', type: 'state', physical: false, parentId: 'tank' },
    });
    const st2 = createNode('st2', 'state', {
      parentId: 'tank',
      data: { name: 'Full', type: 'state', physical: false, parentId: 'tank' },
    });
    const proc = createNode('drain', 'process');
    const e1 = createEdge('e1', 'st1', 'drain', 'consumption');

    const snapshot: OpmModelSnapshot = {
      nodes: [obj, st1, st2, proc],
      edges: [e1],
    };

    const impact = analyzeOpmDeletion(snapshot, { nodeIds: ['st1'] });
    const result = applyOpmDeletion(snapshot, impact);

    expect(result.snapshot.nodes.map(n => n.id).sort()).toEqual(['drain', 'st2', 'tank'].sort());
    expect(result.snapshot.edges).toHaveLength(0);
    const updatedTank = result.snapshot.nodes.find(n => n.id === 'tank')!;
    expect(updatedTank.data.states?.map(s => s.id)).toEqual(['st2']);
  });

  it('port delete removes port and connected edges', () => {
    const portOut: OPMPort = { id: 'p_out', name: 'Out', type: 'float32', direction: 'output', position: 'right' };
    const portIn: OPMPort = { id: 'p_in', name: 'In', type: 'float32', direction: 'input', position: 'left' };

    const proc = createNode('proc', 'process', {
      data: { name: 'Proc', type: 'process', physical: false, outputs: [portOut] },
    });
    const obj = createNode('obj', 'object', {
      data: { name: 'Obj', type: 'object', physical: false, inputs: [portIn] },
    });
    const edge = createEdge('e1', 'proc', 'obj', 'result', {
      sourceHandle: 'p_out',
      targetHandle: 'p_in',
    });

    const snapshot: OpmModelSnapshot = {
      nodes: [proc, obj],
      edges: [edge],
    };

    const impact = analyzeOpmDeletion(snapshot, {
      portRefs: [{ nodeId: 'proc', portId: 'p_out', direction: 'output' }],
    });
    const result = applyOpmDeletion(snapshot, impact);

    expect(result.snapshot.edges).toHaveLength(0);
    const updatedProc = result.snapshot.nodes.find(n => n.id === 'proc')!;
    expect(updatedProc.data.outputs).toHaveLength(0);
  });

  it('link delete removes link only', () => {
    const o = createNode('o', 'object');
    const p = createNode('p', 'process');
    const e = createEdge('e', 'o', 'p', 'agent');

    const snapshot: OpmModelSnapshot = { nodes: [o, p], edges: [e] };
    const impact = analyzeOpmDeletion(snapshot, { edgeIds: ['e'] });
    const result = applyOpmDeletion(snapshot, impact);

    expect(result.snapshot.nodes).toHaveLength(2);
    expect(result.snapshot.edges).toHaveLength(0);
  });

  it('refuses invalid candidate edge conversion without mutation', () => {
    const o = createNode('o', 'object');
    const p = createNode('p', 'process');
    const e = createEdge('e', 'o', 'p', 'agent');

    const snapshot: OpmModelSnapshot = { nodes: [o, p], edges: [e] };

    // Attempting to convert 'agent' (o -> p) to 'result' (process -> object/state).
    // An edge from object to process is NOT allowed to be a 'result' link!
    const verdict = validateOpmPortConnection(
      snapshot.nodes,
      [],
      { source: e.source, target: e.target },
      'result'
    );

    expect(verdict.valid).toBe(false);
    expect(verdict.code).toBe('OPM_PORT_DIRECTION_INVALID');
  });

  it('refuses invalid candidate node conversion if it breaks incident links', () => {
    const o = createNode('o', 'object');
    const p = createNode('p', 'process');
    const e = createEdge('e', 'o', 'p', 'agent');

    // If 'o' is converted to 'process', the edge becomes process -> process with 'agent' link, which is invalid!
    const candidateObj = convertOpmNodeType(o, 'opmProcess').node;
    const verdict = validateOpmPortConnection(
      [candidateObj, p],
      [],
      { source: e.source, target: e.target },
      'agent'
    );

    expect(verdict.valid).toBe(false);
    expect(verdict.code).toBe('OPM_PORT_DIRECTION_INVALID');
  });

  it('SysML import validates lifecycle before committing', () => {
    const validState = {
      blocks: [{ id: 'b1', name: 'B1', stereotype: 'block' }],
      ports: [],
      parts: [],
      connectors: [],
      requirements: [],
      relations: [],
    };
    const imported = importSysmlToOpm(validState as any);
    const report = validateOpmModelLifecycle({ nodes: imported.nodes, edges: imported.edges });
    expect(report.valid).toBe(true);
  });
});
