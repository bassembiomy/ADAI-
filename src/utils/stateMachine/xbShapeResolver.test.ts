import { describe, expect, it } from 'vitest';
import type { XBPersistedModelV1 } from './xbModel';
import {
  resolveGraphShapes,
  type SemanticShape,
} from './xbShapeResolver';

const createBaseModel = (): XBPersistedModelV1 => ({
  schemaVersion: 1,
  solver: {
    kind: 'euler',
    stepSeconds: 0.01,
  },
  nodes: [],
  edges: [],
  mappings: [],
  policy: {
    memory: 'reset',
    numericFault: 'signal-only',
  },
});

describe('xbShapeResolver', () => {
  it('GEN-XB-SHAPE-003: infers MUX output shape from scalar inputs (Scalar + Scalar -> Vector[2])', () => {
    const model: XBPersistedModelV1 = {
      ...createBaseModel(),
      nodes: [
        { id: 'c1', type: 'Constant', parameters: { value: 7 } },
        { id: 'c2', type: 'Constant', parameters: { value: 9 } },
        { id: 'mux', type: 'MUX', parameters: {} },
      ],
      edges: [
        { id: 'e1', sourceNodeId: 'c1', sourcePortId: 'out', targetNodeId: 'mux', targetPortId: 'in1' },
        { id: 'e2', sourceNodeId: 'c2', sourcePortId: 'out', targetNodeId: 'mux', targetPortId: 'in2' },
      ],
    };

    const result = resolveGraphShapes(model);
    expect(result.diagnostics).toEqual([]);
    expect(result.portShapes.get('mux:out')).toEqual<SemanticShape>({
      kind: 'vector',
      dimensions: [2],
      elementCount: 2,
    });
  });

  it('GEN-XB-SHAPE-003: infers MUX output shape for Vector[2] + Scalar -> Vector[3] and Vector[2] + Vector[3] -> Vector[5]', () => {
    const model: XBPersistedModelV1 = {
      ...createBaseModel(),
      nodes: [
        {
          id: 'vec_const',
          type: 'Constant',
          parameters: {
            outputs: [{ id: 'out', shape: 'vector', dimensions: [2] }],
          },
        },
        { id: 'scal_const', type: 'Constant', parameters: { value: 5 } },
        { id: 'mux1', type: 'MUX', parameters: {} },
      ],
      edges: [
        { id: 'e1', sourceNodeId: 'vec_const', sourcePortId: 'out', targetNodeId: 'mux1', targetPortId: 'in1' },
        { id: 'e2', sourceNodeId: 'scal_const', sourcePortId: 'out', targetNodeId: 'mux1', targetPortId: 'in2' },
      ],
    };

    const result = resolveGraphShapes(model);
    expect(result.diagnostics).toEqual([]);
    expect(result.portShapes.get('mux1:out')).toEqual<SemanticShape>({
      kind: 'vector',
      dimensions: [3],
      elementCount: 3,
    });
  });

  it('GEN-XB-SHAPE-004 & GEN-XB-SHAPE-005: propagates MUX output through VectorAdd, VectorMul, VectorSub, and DEMUX', () => {
    const model: XBPersistedModelV1 = {
      ...createBaseModel(),
      nodes: [
        { id: 'c7', type: 'Constant', parameters: { value: 7 } },
        { id: 'c9', type: 'Constant', parameters: { value: 9 } },
        { id: 'XB6-Mux2', type: 'MUX', parameters: {} },
        { id: 'XB7-VectorAdd', type: 'VectorAdd', parameters: {} },
        { id: 'vec_mul', type: 'VectorMul', parameters: {} },
        { id: 'vec_sub', type: 'VectorSub', parameters: {} },
        { id: 'demux', type: 'DEMUX', parameters: { outputs: [{ id: 'out1' }, { id: 'out2' }] } },
      ],
      edges: [
        { id: 'e1', sourceNodeId: 'c7', sourcePortId: 'out', targetNodeId: 'XB6-Mux2', targetPortId: 'in1' },
        { id: 'e2', sourceNodeId: 'c9', sourcePortId: 'out', targetNodeId: 'XB6-Mux2', targetPortId: 'in2' },
        { id: 'e3', sourceNodeId: 'XB6-Mux2', sourcePortId: 'out', targetNodeId: 'XB7-VectorAdd', targetPortId: 'in1' },
        { id: 'e4', sourceNodeId: 'XB6-Mux2', sourcePortId: 'out', targetNodeId: 'XB7-VectorAdd', targetPortId: 'in2' },
        { id: 'e5', sourceNodeId: 'XB7-VectorAdd', sourcePortId: 'out', targetNodeId: 'vec_mul', targetPortId: 'in1' },
        { id: 'e6', sourceNodeId: 'XB6-Mux2', sourcePortId: 'out', targetNodeId: 'vec_mul', targetPortId: 'in2' },
        { id: 'e7', sourceNodeId: 'vec_mul', sourcePortId: 'out', targetNodeId: 'vec_sub', targetPortId: 'in1' },
        { id: 'e8', sourceNodeId: 'XB7-VectorAdd', sourcePortId: 'out', targetNodeId: 'vec_sub', targetPortId: 'in2' },
        { id: 'e9', sourceNodeId: 'vec_sub', sourcePortId: 'out', targetNodeId: 'demux', targetPortId: 'in' },
      ],
    };

    const result = resolveGraphShapes(model);
    expect(result.diagnostics).toEqual([]);

    expect(result.portShapes.get('XB6-Mux2:out')).toEqual<SemanticShape>({ kind: 'vector', dimensions: [2], elementCount: 2 });
    expect(result.portShapes.get('XB7-VectorAdd:in1')).toEqual<SemanticShape>({ kind: 'vector', dimensions: [2], elementCount: 2 });
    expect(result.portShapes.get('XB7-VectorAdd:in2')).toEqual<SemanticShape>({ kind: 'vector', dimensions: [2], elementCount: 2 });
    expect(result.portShapes.get('XB7-VectorAdd:out')).toEqual<SemanticShape>({ kind: 'vector', dimensions: [2], elementCount: 2 });
    expect(result.portShapes.get('vec_mul:out')).toEqual<SemanticShape>({ kind: 'vector', dimensions: [2], elementCount: 2 });
    expect(result.portShapes.get('vec_sub:out')).toEqual<SemanticShape>({ kind: 'vector', dimensions: [2], elementCount: 2 });

    // DEMUX output: 2 elements split into 2 outputs => 1 scalar each
    expect(result.portShapes.get('demux:out1')).toEqual<SemanticShape>({ kind: 'scalar', dimensions: [], elementCount: 1 });
    expect(result.portShapes.get('demux:out2')).toEqual<SemanticShape>({ kind: 'scalar', dimensions: [], elementCount: 1 });
  });

  it('GEN-XB-VECTOR-001: rejects true scalar source connected directly to VectorAdd', () => {
    const model: XBPersistedModelV1 = {
      ...createBaseModel(),
      nodes: [
        { id: 'c7', type: 'Constant', parameters: { value: 7 } },
        { id: 'c9', type: 'Constant', parameters: { value: 9 } },
        { id: 'vadd', type: 'VectorAdd', parameters: {} },
      ],
      edges: [
        { id: 'e1', sourceNodeId: 'c7', sourcePortId: 'out', targetNodeId: 'vadd', targetPortId: 'in1' },
        { id: 'e2', sourceNodeId: 'c9', sourcePortId: 'out', targetNodeId: 'vadd', targetPortId: 'in2' },
      ],
    };

    const result = resolveGraphShapes(model);
    expect(result.diagnostics.some((d) => d.code === 'XB_SHAPE_MISMATCH')).toBe(true);
  });

  it('GEN-XB-SHAPE-008: rejects incompatible operand dimensions (Vector[2] + Vector[3])', () => {
    const model: XBPersistedModelV1 = {
      ...createBaseModel(),
      nodes: [
        { id: 'v2', type: 'Constant', parameters: { outputs: [{ id: 'out', shape: 'vector', dimensions: [2] }] } },
        { id: 'v3', type: 'Constant', parameters: { outputs: [{ id: 'out', shape: 'vector', dimensions: [3] }] } },
        { id: 'vadd', type: 'VectorAdd', parameters: {} },
      ],
      edges: [
        { id: 'e1', sourceNodeId: 'v2', sourcePortId: 'out', targetNodeId: 'vadd', targetPortId: 'in1' },
        { id: 'e2', sourceNodeId: 'v3', sourcePortId: 'out', targetNodeId: 'vadd', targetPortId: 'in2' },
      ],
    };

    const result = resolveGraphShapes(model);
    expect(result.diagnostics.some((d) => d.code === 'XB_SHAPE_MISMATCH')).toBe(true);
  });

  it('GEN-XB-SHAPE-007: emits XB_SHAPE_UNRESOLVED diagnostic when shape cannot be inferred', () => {
    const model: XBPersistedModelV1 = {
      ...createBaseModel(),
      nodes: [
        { id: 'unknown_src', type: 'Subsystem', parameters: {} },
        { id: 'vadd', type: 'VectorAdd', parameters: {} },
      ],
      edges: [
        { id: 'e1', sourceNodeId: 'unknown_src', sourcePortId: 'out', targetNodeId: 'vadd', targetPortId: 'in1' },
      ],
    };

    const result = resolveGraphShapes(model);
    expect(result.diagnostics.some((d) => d.code === 'XB_SHAPE_UNRESOLVED')).toBe(true);
  });

  it('resolves VectorPow shapes for scalar, vector, and matrix bases', () => {
    const model: XBPersistedModelV1 = {
      ...createBaseModel(),
      nodes: [
        { id: 'base_vec', type: 'Constant', parameters: { outputs: [{ id: 'out', shape: 'vector', dimensions: [4] }] } },
        { id: 'exp_scal', type: 'Constant', parameters: { value: 2 } },
        { id: 'pow_node', type: 'VectorPow', parameters: {} },
      ],
      edges: [
        { id: 'e1', sourceNodeId: 'base_vec', sourcePortId: 'out', targetNodeId: 'pow_node', targetPortId: 'in1' },
        { id: 'e2', sourceNodeId: 'exp_scal', sourcePortId: 'out', targetNodeId: 'pow_node', targetPortId: 'in2' },
      ],
    };

    const result = resolveGraphShapes(model);
    expect(result.diagnostics).toEqual([]);
    expect(result.portShapes.get('pow_node:out')).toEqual<SemanticShape>({
      kind: 'vector',
      dimensions: [4],
      elementCount: 4,
    });
  });

  it('resolves SumElements, Mean, and Max to scalar outputs from vector inputs', () => {
    const model: XBPersistedModelV1 = {
      ...createBaseModel(),
      nodes: [
        { id: 'v', type: 'Constant', parameters: { outputs: [{ id: 'out', shape: 'vector', dimensions: [4] }] } },
        { id: 'sum_node', type: 'SumElements', parameters: {} },
        { id: 'mean_node', type: 'Mean', parameters: {} },
        { id: 'max_node', type: 'Max', parameters: {} },
      ],
      edges: [
        { id: 'e1', sourceNodeId: 'v', sourcePortId: 'out', targetNodeId: 'sum_node', targetPortId: 'in' },
        { id: 'e2', sourceNodeId: 'v', sourcePortId: 'out', targetNodeId: 'mean_node', targetPortId: 'in' },
        { id: 'e3', sourceNodeId: 'v', sourcePortId: 'out', targetNodeId: 'max_node', targetPortId: 'in' },
      ],
    };

    const result = resolveGraphShapes(model);
    expect(result.diagnostics).toEqual([]);
    expect(result.portShapes.get('sum_node:out')).toEqual<SemanticShape>({ kind: 'scalar', dimensions: [], elementCount: 1 });
    expect(result.portShapes.get('mean_node:out')).toEqual<SemanticShape>({ kind: 'scalar', dimensions: [], elementCount: 1 });
    expect(result.portShapes.get('max_node:out')).toEqual<SemanticShape>({ kind: 'scalar', dimensions: [], elementCount: 1 });
  });

  it('resolves IdentityMatrix to square matrix output', () => {
    const model: XBPersistedModelV1 = {
      ...createBaseModel(),
      nodes: [
        {
          id: 'id_node',
          type: 'IdentityMatrix',
          parameters: {
            dimension: 3,
            outputs: [{ id: 'out', shape: 'matrix', dimensions: [3, 3] }],
          },
        },
      ],
      edges: [],
    };

    const result = resolveGraphShapes(model);
    expect(result.diagnostics).toEqual([]);
    expect(result.portShapes.get('id_node:out')).toEqual<SemanticShape>({
      kind: 'matrix',
      dimensions: [3, 3],
      elementCount: 9,
    });
  });
});
