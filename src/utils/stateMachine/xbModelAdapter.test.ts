import { describe, expect, it } from 'vitest';
import { adaptXBModel } from './xbModelAdapter';

const legacyModel = () => ({
  nodes: [{
    id: 'react-node-id',
    type: 'xblock',
    position: { x: 10, y: 20 },
    data: {
      id: 'stale-data-id',
      type: 'GAIN',
      label: 'Gain',
      params: { gain: 2 },
      inputs: [{
        id: 'u',
        direction: 'input',
        type: 'continuous',
        dimensions: [] as number[],
        value: 0,
      }],
      outputs: [{
        id: 'y',
        direction: 'output',
        type: 'continuous',
        dimensions: [],
        value: 0,
      }],
      execute: () => ({ outputs: [0] }),
    },
  }],
  edges: [{
    id: 'edge',
    source: 'react-node-id',
    sourceHandle: 'y',
    target: 'react-node-id',
    targetHandle: 'u',
  }],
});

describe('adaptXBModel', () => {
  it('normalizes an unversioned React Flow model using the outer node identity', () => {
    const result = adaptXBModel(legacyModel());

    expect(result.diagnostics).toEqual([]);
    expect(result.model).toMatchObject({
      schemaVersion: 1,
      nodes: [{
        id: 'react-node-id',
        type: 'GAIN',
        label: 'Gain',
        parameters: { gain: 2 },
      }],
      edges: [{
        id: 'edge',
        sourceNodeId: 'react-node-id',
        sourcePortId: 'y',
        targetNodeId: 'react-node-id',
        targetPortId: 'u',
      }],
      mappings: [],
    });
    expect(result.model?.nodes[0].id).not.toBe('stale-data-id');
  });

  it('applies only the approved omitted legacy defaults', () => {
    const result = adaptXBModel(legacyModel());

    expect(result.model?.solver).toEqual({
      kind: 'euler',
      stepSeconds: 0.01,
    });
    expect(result.model?.policy).toEqual({
      memory: 'reset',
      numericFault: 'escalate',
    });
  });

  it('preserves explicit solver, policy, and empty mappings', () => {
    const input = {
      ...legacyModel(),
      mappings: [],
      solver: { kind: 'rk4', stepSeconds: 0.002 },
      policy: { memory: 'retain', numericFault: 'signal-only' },
    };

    const result = adaptXBModel(input);

    expect(result.model?.mappings).toEqual([]);
    expect(result.model?.solver).toEqual(input.solver);
    expect(result.model?.policy).toEqual(input.policy);
  });

  it('deep-isolates the canonical result from legacy mutations', () => {
    const input = legacyModel();
    const result = adaptXBModel(input);

    input.nodes[0].data.params.gain = 9;
    input.nodes[0].data.inputs[0].dimensions.push(4);
    input.edges[0].sourceHandle = 'changed';

    expect(result.model?.nodes[0].parameters.gain).toBe(2);
    expect(result.model?.nodes[0].parameters.inputs).toEqual([
      expect.objectContaining({ id: 'u', dimensions: [] }),
    ]);
    expect(result.model?.edges[0].sourcePortId).toBe('y');
  });

  it('rejects malformed input without returning a guessed model', () => {
    const result = adaptXBModel({
      nodes: [{ id: 'node-without-type', data: { params: {} } }],
      edges: [],
    });

    expect(result.model).toBeNull();
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: 'XB_MODEL_INVALID',
      severity: 'error',
    }));
  });

  it('does not invent a missing legacy port direction', () => {
    const input = legacyModel();
    delete (input.nodes[0].data.inputs[0] as any).direction;

    const result = adaptXBModel(input);

    expect(result.model).toBeNull();
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: 'XB_MODEL_INVALID',
    }));
  });

  it('does not invent a missing legacy parameter object', () => {
    const input = legacyModel();
    delete (input.nodes[0].data as any).params;

    const result = adaptXBModel(input);

    expect(result.model).toBeNull();
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: 'XB_MODEL_INVALID',
    }));
  });

  it.each(['inputs', 'outputs'])(
    'does not invent a missing legacy %s port collection',
    (key) => {
      const input = legacyModel();
      delete (input.nodes[0].data as any)[key];

      const result = adaptXBModel(input);

      expect(result.model).toBeNull();
      expect(result.diagnostics).toContainEqual(expect.objectContaining({
        code: 'XB_MODEL_INVALID',
      }));
    },
  );

  it('rejects an explicit null legacy mappings value', () => {
    const result = adaptXBModel({
      ...legacyModel(),
      mappings: null,
    });

    expect(result.model).toBeNull();
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: 'XB_MODEL_INVALID',
    }));
  });

  it.each([
    ['solver', null],
    ['solver', 'euler'],
    ['policy', null],
    ['policy', 'reset'],
  ])('rejects an explicit malformed legacy %s value', (key, value) => {
    const input = {
      ...legacyModel(),
      [key]: value,
    };

    const result = adaptXBModel(input);

    expect(result.model).toBeNull();
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: 'XB_MODEL_INVALID',
    }));
  });
});
