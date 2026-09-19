/**
 * src/agent/toolAdapters/xbridgesAdapter.test.ts
 *
 * Tests for the XbridgesApplicationDelegate adapter.
 *
 * Strategy:
 * - Create a minimal in-memory store (nodes/edges arrays + setters) to simulate
 *   what App.tsx provides via useState.
 * - All tests operate against real BLOCK_LIBRARY types so we verify the factory
 *   integration, not just mock behaviour.
 * - Tests prove:
 *   - Approved add / connect / update actions change the actual node/edge arrays.
 *   - Unknown block types, unknown nodes, invalid ports, and duplicate edges
 *     fail without mutating the arrays.
 *   - save() calls the onSave callback with the current node/edge snapshot.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createXbridgesDelegate, XbridgesAdapterError, type ReactFlowXbridgesNode, type ReactFlowXbridgesEdge } from './xbridgesAdapter';
import { BLOCK_LIBRARY } from '../../engine/xbridges/BlockDefinitions';

// ---------------------------------------------------------------------------
// Minimal state store helper
// ---------------------------------------------------------------------------

function createStore(initialNodes: ReactFlowXbridgesNode[] = [], initialEdges: ReactFlowXbridgesEdge[] = []) {
  let nodes = [...initialNodes];
  let edges = [...initialEdges];

  return {
    getNodes: () => [...nodes],
    getEdges: () => [...edges],
    setNodes: (updater: (prev: ReactFlowXbridgesNode[]) => ReactFlowXbridgesNode[]) => {
      nodes = updater(nodes);
    },
    setEdges: (updater: (prev: ReactFlowXbridgesEdge[]) => ReactFlowXbridgesEdge[]) => {
      edges = updater(edges);
    },
    snapshot: () => ({ nodes: [...nodes], edges: [...edges] }),
  };
}

// Pick two well-known block types that exist in BLOCK_LIBRARY.
// GAIN: inputs=['u'], outputs=['y']
// Scope: inputs=['in1'], outputs=[]
const VALID_TYPE_1 = 'GAIN';
const VALID_TYPE_2 = 'Scope';

// Verify these types exist before the tests run.
if (!BLOCK_LIBRARY[VALID_TYPE_1] || !BLOCK_LIBRARY[VALID_TYPE_2]) {
  throw new Error(`BLOCK_LIBRARY is missing required test types: ${VALID_TYPE_1}, ${VALID_TYPE_2}`);
}

/** Create a minimal ReactFlow node that mimics what addBlock produces. */
function makeNode(type: string, id: string): ReactFlowXbridgesNode {
  const blockDef = BLOCK_LIBRARY[type](id, {});
  return {
    id: blockDef.id,
    type: 'xblock',
    position: { x: 0, y: 0 },
    data: { ...blockDef, selected: false } as ReactFlowXbridgesNode['data'],
  };
}

// ---------------------------------------------------------------------------
// Tests: getNodes / getEdges
// ---------------------------------------------------------------------------

describe('getNodes / getEdges', () => {
  it('restores the exact node and edge presentation snapshot', async () => {
    const node = makeNode(VALID_TYPE_1, 'gain-positioned');
    node.position = { x: 47, y: 93 };
    node.data.selected = true;
    const store = createStore([node]);
    const delegate = createXbridgesDelegate({ ...store, onSave: vi.fn() });
    const original = store.snapshot();
    const snapshotNodes = await delegate.getNodes();
    const snapshotEdges = await delegate.getEdges();
    await delegate.addBlock(VALID_TYPE_2, { id: 'temporary' });
    await delegate.restoreSnapshot!(snapshotNodes, snapshotEdges);
    expect(store.snapshot()).toEqual(original);
  });
  it('returns empty arrays when store is empty', async () => {
    const store = createStore();
    const delegate = createXbridgesDelegate({ ...store, onSave: vi.fn() });

    expect(await delegate.getNodes()).toEqual([]);
    expect(await delegate.getEdges()).toEqual([]);
  });

  it('returns current nodes as XbridgesNode shapes', async () => {
    const node = makeNode(VALID_TYPE_1, `${VALID_TYPE_1}-test`);
    const store = createStore([node]);
    const delegate = createXbridgesDelegate({ ...store, onSave: vi.fn() });

    const result = await delegate.getNodes();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(node.id);
    expect(result[0].type).toBe(VALID_TYPE_1);
  });
});

// ---------------------------------------------------------------------------
// Tests: addBlock
// ---------------------------------------------------------------------------

describe('addBlock', () => {
  it('adds a block of a known type to the node array', async () => {
    const store = createStore();
    const delegate = createXbridgesDelegate({ ...store, onSave: vi.fn() });

    const node = await delegate.addBlock(VALID_TYPE_1, { gain: 5 });

    expect(node.type).toBe(VALID_TYPE_1);
    expect(typeof node.id).toBe('string');
    expect(node.id).toContain(VALID_TYPE_1);

    const { nodes } = store.snapshot();
    expect(nodes).toHaveLength(1);
    expect(nodes[0].id).toBe(node.id);
  });

  it('preserves existing nodes when adding a new block', async () => {
    const existing = makeNode(VALID_TYPE_2, 'scope-1');
    const store = createStore([existing]);
    const delegate = createXbridgesDelegate({ ...store, onSave: vi.fn() });

    await delegate.addBlock(VALID_TYPE_1, {});

    expect(store.snapshot().nodes).toHaveLength(2);
    expect(store.snapshot().nodes[0].id).toBe('scope-1');
  });

  it('rejects an unknown block type without mutating the array', async () => {
    const store = createStore();
    const delegate = createXbridgesDelegate({ ...store, onSave: vi.fn() });

    await expect(delegate.addBlock('__INVALID_BLOCK_TYPE__', {})).rejects.toThrow(XbridgesAdapterError);

    // No mutation occurred.
    expect(store.snapshot().nodes).toHaveLength(0);
  });

  it('uses params passed in from the agent', async () => {
    const store = createStore();
    const delegate = createXbridgesDelegate({ ...store, onSave: vi.fn() });

    await delegate.addBlock(VALID_TYPE_1, { gain: 42 });

    const { nodes } = store.snapshot();
    // The block factory merges agent params; verify the node data contains them.
    expect(nodes[0].data?.params?.gain).toBe(42);
  });
});

// ---------------------------------------------------------------------------
// Tests: connectPorts
// ---------------------------------------------------------------------------

describe('connectPorts', () => {
  let store: ReturnType<typeof createStore>;

  beforeEach(() => {
    // Prepare two nodes with known port IDs.
    const gainNode = makeNode(VALID_TYPE_1, 'gain-1');
    const scopeNode = makeNode(VALID_TYPE_2, 'scope-1');
    store = createStore([gainNode, scopeNode]);
  });

  it('appends a valid edge and returns it', async () => {
    const delegate = createXbridgesDelegate({ ...store, onSave: vi.fn() });

    // Gain has output port 'y'; Scope has input port 'in1'.
    const gainOutputPort = (BLOCK_LIBRARY[VALID_TYPE_1]('x', {}) as any).outputs[0].id as string;
    const scopeInputPort = (BLOCK_LIBRARY[VALID_TYPE_2]('x', {}) as any).inputs[0].id as string;

    const edge = await delegate.connectPorts('gain-1', gainOutputPort, 'scope-1', scopeInputPort);

    expect(typeof edge.id).toBe('string');
    expect(edge.source).toBe('gain-1');
    expect(edge.target).toBe('scope-1');
    expect(edge.sourceHandle).toBe(gainOutputPort);
    expect(edge.targetHandle).toBe(scopeInputPort);

    const { edges } = store.snapshot();
    expect(edges).toHaveLength(1);
    expect(edges[0].id).toBe(edge.id);
  });

  it('preserves existing edges when connecting', async () => {
    const gainOutputPort = (BLOCK_LIBRARY[VALID_TYPE_1]('x', {}) as any).outputs[0].id as string;
    const scopeInputPort = (BLOCK_LIBRARY[VALID_TYPE_2]('x', {}) as any).inputs[0].id as string;

    // Pre-existing edge between two different hypothetical nodes
    const existing: ReactFlowXbridgesEdge = { id: 'e-existing', source: 'x', target: 'y' };
    const storeWithEdge = createStore(store.snapshot().nodes, [existing]);
    const delegate = createXbridgesDelegate({ ...storeWithEdge, onSave: vi.fn() });

    await delegate.connectPorts('gain-1', gainOutputPort, 'scope-1', scopeInputPort);
    expect(storeWithEdge.snapshot().edges).toHaveLength(2);
  });

  it('rejects connection when source node is unknown', async () => {
    const delegate = createXbridgesDelegate({ ...store, onSave: vi.fn() });

    await expect(delegate.connectPorts('NONEXISTENT', 'y', 'scope-1', 'in1')).rejects.toThrow(XbridgesAdapterError);
    expect(store.snapshot().edges).toHaveLength(0);
  });

  it('rejects connection when target node is unknown', async () => {
    const delegate = createXbridgesDelegate({ ...store, onSave: vi.fn() });

    const gainOutputPort = (BLOCK_LIBRARY[VALID_TYPE_1]('x', {}) as any).outputs[0].id as string;
    await expect(delegate.connectPorts('gain-1', gainOutputPort, 'NONEXISTENT', 'in1')).rejects.toThrow(XbridgesAdapterError);
    expect(store.snapshot().edges).toHaveLength(0);
  });

  it('rejects connection when source port ID does not exist in outputs', async () => {
    const delegate = createXbridgesDelegate({ ...store, onSave: vi.fn() });
    const scopeInputPort = (BLOCK_LIBRARY[VALID_TYPE_2]('x', {}) as any).inputs[0].id as string;

    await expect(
      delegate.connectPorts('gain-1', '__INVALID_OUTPUT_PORT__', 'scope-1', scopeInputPort),
    ).rejects.toThrow(XbridgesAdapterError);
    expect(store.snapshot().edges).toHaveLength(0);
  });

  it('rejects connection when target port ID does not exist in inputs', async () => {
    const delegate = createXbridgesDelegate({ ...store, onSave: vi.fn() });
    const gainOutputPort = (BLOCK_LIBRARY[VALID_TYPE_1]('x', {}) as any).outputs[0].id as string;

    await expect(
      delegate.connectPorts('gain-1', gainOutputPort, 'scope-1', '__INVALID_INPUT_PORT__'),
    ).rejects.toThrow(XbridgesAdapterError);
    expect(store.snapshot().edges).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Tests: updateParameters
// ---------------------------------------------------------------------------

describe('updateParameters', () => {
  it('immutably updates params while preserving other node data', async () => {
    const gainNode = makeNode(VALID_TYPE_1, 'gain-1');
    const store = createStore([gainNode]);
    const delegate = createXbridgesDelegate({ ...store, onSave: vi.fn() });

    const originalInputs = gainNode.data.inputs;
    const updated = await delegate.updateParameters('gain-1', { gain: 99 });

    expect(updated.id).toBe('gain-1');
    expect((updated.data.params as Record<string, unknown>)?.gain).toBe(99);

    // Verify the node in the store is also updated.
    const { nodes } = store.snapshot();
    expect((nodes[0].data.params as Record<string, unknown>).gain).toBe(99);
    // Other data fields must remain intact.
    expect(nodes[0].data.inputs).toEqual(originalInputs);
  });

  it('merges params without dropping existing keys', async () => {
    const gainNode = makeNode(VALID_TYPE_1, 'gain-1');
    // Set an initial gain value
    gainNode.data.params = { gain: 10, someOtherKey: 'preserve-me' };
    const store = createStore([gainNode]);
    const delegate = createXbridgesDelegate({ ...store, onSave: vi.fn() });

    await delegate.updateParameters('gain-1', { gain: 20 });

    const { nodes } = store.snapshot();
    expect((nodes[0].data.params as Record<string, unknown>).gain).toBe(20);
    expect((nodes[0].data.params as Record<string, unknown>).someOtherKey).toBe('preserve-me');
  });

  it('does not modify other nodes', async () => {
    const gainNode = makeNode(VALID_TYPE_1, 'gain-1');
    const scopeNode = makeNode(VALID_TYPE_2, 'scope-1');
    const store = createStore([gainNode, scopeNode]);
    const delegate = createXbridgesDelegate({ ...store, onSave: vi.fn() });

    await delegate.updateParameters('gain-1', { gain: 5 });

    const { nodes } = store.snapshot();
    const scope = nodes.find((n) => n.id === 'scope-1')!;
    expect(scope).toBeDefined();
    // Scope node data should be unmodified.
    expect(scope.data.params).toEqual(scopeNode.data.params);
  });

  it('throws XbridgesAdapterError when node is not found', async () => {
    const store = createStore();
    const delegate = createXbridgesDelegate({ ...store, onSave: vi.fn() });

    await expect(delegate.updateParameters('NONEXISTENT', { gain: 1 })).rejects.toThrow(XbridgesAdapterError);
    expect(store.snapshot().nodes).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Tests: save
// ---------------------------------------------------------------------------

describe('save', () => {
  it('calls onSave with the current nodes and edges', async () => {
    const gainNode = makeNode(VALID_TYPE_1, 'gain-1');
    const edge: ReactFlowXbridgesEdge = { id: 'e1', source: 'gain-1', target: 'scope-1' };
    const store = createStore([gainNode], [edge]);
    const onSave = vi.fn();
    const delegate = createXbridgesDelegate({ ...store, onSave });

    await delegate.save();

    expect(onSave).toHaveBeenCalledOnce();
    const [savedNodes, savedEdges] = onSave.mock.calls[0];
    expect(savedNodes).toHaveLength(1);
    expect(savedNodes[0].id).toBe('gain-1');
    expect(savedEdges).toHaveLength(1);
    expect(savedEdges[0].id).toBe('e1');
  });

  it('calls onSave with empty arrays when store is empty', async () => {
    const store = createStore();
    const onSave = vi.fn();
    const delegate = createXbridgesDelegate({ ...store, onSave });

    await delegate.save();

    expect(onSave).toHaveBeenCalledOnce();
    const [savedNodes, savedEdges] = onSave.mock.calls[0];
    expect(savedNodes).toHaveLength(0);
    expect(savedEdges).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Tests: removeBlock
// ---------------------------------------------------------------------------

describe('removeBlock', () => {
  it('removes block and cascades removal to connected edges', async () => {
    const gainNode = makeNode(VALID_TYPE_1, 'gain-1');
    const scopeNode = makeNode(VALID_TYPE_2, 'scope-1');
    const edge: ReactFlowXbridgesEdge = { id: 'e1', source: 'gain-1', target: 'scope-1' };
    const store = createStore([gainNode, scopeNode], [edge]);
    const delegate = createXbridgesDelegate({ ...store, onSave: vi.fn() });

    const result = await delegate.removeBlock('gain-1');
    expect(result.removedNodeId).toBe('gain-1');
    expect(result.removedEdgeIds).toEqual(['e1']);

    const snapshot = store.snapshot();
    expect(snapshot.nodes).toHaveLength(1);
    expect(snapshot.nodes[0].id).toBe('scope-1');
    expect(snapshot.edges).toHaveLength(0);
  });

  it('throws XbridgesAdapterError when trying to remove a nonexistent block', async () => {
    const store = createStore();
    const delegate = createXbridgesDelegate({ ...store, onSave: vi.fn() });

    await expect(delegate.removeBlock('nonexistent')).rejects.toThrow(XbridgesAdapterError);
  });
});

// ---------------------------------------------------------------------------
// Tests: moveBlock & renameBlock
// ---------------------------------------------------------------------------

describe('moveBlock', () => {
  it('updates position while preserving all other node attributes', async () => {
    const gainNode = makeNode(VALID_TYPE_1, 'gain-1');
    gainNode.position = { x: 10, y: 20 };
    gainNode.data.customField = 'preserve-me';
    const store = createStore([gainNode]);
    const delegate = createXbridgesDelegate({ ...store, onSave: vi.fn() });

    const moved = await delegate.moveBlock('gain-1', { x: 150, y: 300 });
    expect(moved.position).toEqual({ x: 150, y: 300 });
    expect(moved.data.customField).toBe('preserve-me');

    const nodeInStore = store.snapshot().nodes[0];
    expect(nodeInStore.position).toEqual({ x: 150, y: 300 });
  });

  it('throws XbridgesAdapterError on nonexistent block', async () => {
    const store = createStore();
    const delegate = createXbridgesDelegate({ ...store, onSave: vi.fn() });

    await expect(delegate.moveBlock('nonexistent', { x: 0, y: 0 })).rejects.toThrow(XbridgesAdapterError);
  });

  it('rejects moving to the exact same position (unchanged-state false success prevention)', async () => {
    const gainNode = makeNode(VALID_TYPE_1, 'gain-1');
    gainNode.position = { x: 10, y: 20 };
    const store = createStore([gainNode]);
    const delegate = createXbridgesDelegate({ ...store, onSave: vi.fn() });

    await expect(delegate.moveBlock('gain-1', { x: 10, y: 20 })).rejects.toThrow(XbridgesAdapterError);
  });
});

describe('renameBlock', () => {
  it('updates instanceName while preserving node type and parameters', async () => {
    const gainNode = makeNode(VALID_TYPE_1, 'gain-1');
    gainNode.data.instanceName = 'OldGain';
    const store = createStore([gainNode]);
    const delegate = createXbridgesDelegate({ ...store, onSave: vi.fn() });

    const renamed = await delegate.renameBlock('gain-1', 'NewGain');
    expect(renamed.data.instanceName).toBe('NewGain');
    expect(renamed.type).toBe(VALID_TYPE_1);

    const nodeInStore = store.snapshot().nodes[0];
    expect(nodeInStore.data.instanceName).toBe('NewGain');
  });

  it('throws XbridgesAdapterError on nonexistent block', async () => {
    const store = createStore();
    const delegate = createXbridgesDelegate({ ...store, onSave: vi.fn() });

    await expect(delegate.renameBlock('nonexistent', 'NewName')).rejects.toThrow(XbridgesAdapterError);
  });

  it('rejects renaming to the exact same name (unchanged-state false success prevention)', async () => {
    const gainNode = makeNode(VALID_TYPE_1, 'gain-1');
    gainNode.data.instanceName = 'SameName';
    const store = createStore([gainNode]);
    const delegate = createXbridgesDelegate({ ...store, onSave: vi.fn() });

    await expect(delegate.renameBlock('gain-1', 'SameName')).rejects.toThrow(XbridgesAdapterError);
  });
});

// ---------------------------------------------------------------------------
// Tests: disconnectPorts & duplicate edge/node handling
// ---------------------------------------------------------------------------

describe('disconnectPorts', () => {
  it('disconnects by endpoints', async () => {
    const gainNode = makeNode(VALID_TYPE_1, 'gain-1');
    const scopeNode = makeNode(VALID_TYPE_2, 'scope-1');
    const edge: ReactFlowXbridgesEdge = {
      id: 'e-gain-y-scope-in1',
      source: 'gain-1',
      sourceHandle: 'y',
      target: 'scope-1',
      targetHandle: 'in1',
    };
    const store = createStore([gainNode, scopeNode], [edge]);
    const delegate = createXbridgesDelegate({ ...store, onSave: vi.fn() });

    const result = await delegate.disconnectPorts({
      sourceNodeId: 'gain-1',
      sourcePortId: 'y',
      targetNodeId: 'scope-1',
      targetPortId: 'in1',
    });
    expect(result.disconnectedEdgeId).toBe('e-gain-y-scope-in1');
    expect(store.snapshot().edges).toHaveLength(0);
  });

  it('disconnects by edge ID', async () => {
    const edge: ReactFlowXbridgesEdge = { id: 'e1', source: 'a', target: 'b' };
    const store = createStore([], [edge]);
    const delegate = createXbridgesDelegate({ ...store, onSave: vi.fn() });

    const result = await delegate.disconnectPorts('e1');
    expect(result.disconnectedEdgeId).toBe('e1');
    expect(store.snapshot().edges).toHaveLength(0);
  });

  it('throws XbridgesAdapterError on nonexistent edge', async () => {
    const store = createStore();
    const delegate = createXbridgesDelegate({ ...store, onSave: vi.fn() });

    await expect(delegate.disconnectPorts('nonexistent')).rejects.toThrow(XbridgesAdapterError);
  });
});

describe('duplicate prevention', () => {
  it('rejects adding a block with an ID that already exists', async () => {
    const existing = makeNode(VALID_TYPE_1, 'gain-1');
    const store = createStore([existing]);
    const delegate = createXbridgesDelegate({ ...store, onSave: vi.fn() });

    await expect(delegate.addBlock(VALID_TYPE_1, { id: 'gain-1' })).rejects.toThrow(XbridgesAdapterError);
  });

  it('rejects connecting duplicate edge between same source and target ports', async () => {
    const gainNode = makeNode(VALID_TYPE_1, 'gain-1');
    const scopeNode = makeNode(VALID_TYPE_2, 'scope-1');
    const gainOutputPort = (BLOCK_LIBRARY[VALID_TYPE_1]('x', {}) as any).outputs[0].id as string;
    const scopeInputPort = (BLOCK_LIBRARY[VALID_TYPE_2]('x', {}) as any).inputs[0].id as string;

    const existingEdge: ReactFlowXbridgesEdge = {
      id: 'existing-edge',
      source: 'gain-1',
      sourceHandle: gainOutputPort,
      target: 'scope-1',
      targetHandle: scopeInputPort,
    };
    const store = createStore([gainNode, scopeNode], [existingEdge]);
    const delegate = createXbridgesDelegate({ ...store, onSave: vi.fn() });

    await expect(
      delegate.connectPorts('gain-1', gainOutputPort, 'scope-1', scopeInputPort),
    ).rejects.toThrow(XbridgesAdapterError);
  });
});

// ---------------------------------------------------------------------------
// Tests: validate, saveAndReadBack, and getRevisionFingerprint
// ---------------------------------------------------------------------------

describe('validate, saveAndReadBack, getRevisionFingerprint', () => {
  it('computes deterministic revision fingerprint that changes on mutations', async () => {
    const store = createStore();
    const delegate = createXbridgesDelegate({ ...store, onSave: vi.fn() });

    const fp1 = await delegate.getRevisionFingerprint();
    expect(typeof fp1).toBe('string');
    expect(fp1).toHaveLength(64);

    await delegate.addBlock(VALID_TYPE_1, { id: 'gain-1' });
    const fp2 = await delegate.getRevisionFingerprint();
    expect(fp2).not.toBe(fp1);

    await delegate.moveBlock('gain-1', { x: 50, y: 70 });
    const fp3 = await delegate.getRevisionFingerprint();
    expect(fp3).not.toBe(fp2);
  });

  it('validates model graph integrity and reports diagnostics for dangling edges', async () => {
    const gainNode = makeNode(VALID_TYPE_1, 'gain-1');
    const brokenEdge: ReactFlowXbridgesEdge = {
      id: 'dangling',
      source: 'gain-1',
      sourceHandle: 'y',
      target: 'missing-node',
      targetHandle: 'in',
    };
    const store = createStore([gainNode], [brokenEdge]);
    const delegate = createXbridgesDelegate({ ...store, onSave: vi.fn() });

    const report = await delegate.validate();
    expect(report.valid).toBe(false);
    expect(report.diagnostics.length).toBeGreaterThan(0);
    expect(report.diagnostics.some(d => d.code === 'DANGLING_EDGE')).toBe(true);
  });

  it('saveAndReadBack calls save and returns read-back state with fingerprint', async () => {
    const gainNode = makeNode(VALID_TYPE_1, 'gain-1');
    const store = createStore([gainNode]);
    const onSave = vi.fn();
    const delegate = createXbridgesDelegate({ ...store, onSave });

    const result = await delegate.saveAndReadBack();
    expect(onSave).toHaveBeenCalledOnce();
    expect(result.nodes).toHaveLength(1);
    expect(result.fingerprint).toHaveLength(64);
  });
});
