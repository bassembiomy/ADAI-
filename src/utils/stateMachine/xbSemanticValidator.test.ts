import { describe, expect, it } from 'vitest';
import type { SemanticVariable } from './smSemanticModel';
import { DEFAULT_XB_EMBEDDED_LIMITS } from './xbEmbeddedProfile';
import type {
  XBParameterValue,
  XBPersistedModelV1,
  XBTargetCapabilities,
} from './xbModel';
import { validateXBModel } from './xbSemanticValidator';
import { resetXBConformanceStatus, setXBConformanceStatus } from './xbConformanceStatus';

const target: XBTargetCapabilities = {
  supportsFloat16: false,
  supportsFloat32: true,
  supportsFloat64: false,
  supportsMathLibrary: false,
  maxVectorLength: 8,
  maxMatrixDimension: 4,
  embeddedLimits: DEFAULT_XB_EMBEDDED_LIMITS,
};

const variables: Readonly<Record<string, SemanticVariable>> = {
  speed: {
    id: 'speed',
    name: 'speed',
    cName: 'speed',
    type: 'float',
    initialValue: 0,
  },
  enabled: {
    id: 'enabled',
    name: 'enabled',
    cName: 'enabled',
    type: 'bool',
    initialValue: false,
  },
};

const port = (
  id: string,
  direction: 'input' | 'output',
  extra: Record<string, XBParameterValue> = {},
) => ({
  id,
  direction,
  shape: 'scalar',
  dataType: 'float32',
  ...extra,
});

const node = (
  id: string,
  type = 'GAIN',
  parameters: Record<string, XBParameterValue> = {},
) => ({
  id,
  type,
  parameters: {
    inputs: [port('u', 'input')],
    outputs: [port('y', 'output')],
    ...parameters,
  },
});

const model = (
  overrides: Partial<XBPersistedModelV1> = {},
): XBPersistedModelV1 => ({
  schemaVersion: 1,
  nodes: [node('gain')],
  edges: [],
  mappings: [],
  solver: { kind: 'euler', stepSeconds: 0.01 },
  policy: { memory: 'reset', numericFault: 'escalate' },
  ...overrides,
});

const codes = (input: XBPersistedModelV1): string[] =>
  validateXBModel(input, variables, target).map((diagnostic) => diagnostic.code);

describe('validateXBModel', () => {
  it('rejects unknown and host-only block types', () => {
    const result = codes(model({
      nodes: [
        node('unknown', 'NOT_REGISTERED'),
        node('scope', 'Scope'),
      ],
    }));

    expect(result).toContain('XB_BLOCK_NOT_CODEGEN_CAPABLE');
  });

  it('accepts trigonometry blocks as codegen capable with paired conformance', () => {
    const diagnostics = validateXBModel(model({
      nodes: [node('sin', 'SIN')],
    }), variables, target);
    expect(diagnostics.find((d) => d.code === 'XB_BLOCK_NOT_CODEGEN_CAPABLE')).toBeUndefined();
  });

  it('accepts IF_ELSE blocks cleanly without XB_BLOCK_NOT_CODEGEN_CAPABLE error', () => {
    const diagnostics = validateXBModel(model({
      nodes: [node('ifelse', 'IF_ELSE')],
    }), variables, target);
    expect(diagnostics.find((d) => d.code === 'XB_BLOCK_NOT_CODEGEN_CAPABLE')).toBeUndefined();
  });

  it('rejects signal shapes outside a block capability declaration', () => {
    const result = codes(model({
      nodes: [node('sin', 'SIN', {
        inputs: [port('u', 'input', {
          shape: 'vector',
          dimensions: [2],
        })],
        outputs: [port('y', 'output', {
          shape: 'vector',
          dimensions: [2],
        })],
      })],
    }));

    expect(result).toContain('XB_BLOCK_NOT_CODEGEN_CAPABLE');
  });

  it('enforces Task 10 bounds, discrete controls, math support, and directional matrix shapes', () => {
    const matrixDiagShapeCodes = codes(model({
      nodes: [node('diag', 'MatrixDiag', {
        inputs: [port('u', 'input', { shape: 'scalar' })],
        outputs: [port('y', 'output', { shape: 'vector', dimensions: [2] })],
      })],
    }));
    const contractCodes = codes(model({
      nodes: [
        node('solve', 'MatrixSolve', { maxDimension: 9 }),
        node('pid', 'PID_BASIC', { sampleTime: 0 }),
        node('continuous', 'STATE_SPACE', { representation: 'continuous' }),
        node('clarke', 'CLARKE_TRANSFORM'),
      ],
    }));

    expect(matrixDiagShapeCodes).toContain('XB_BLOCK_NOT_CODEGEN_CAPABLE');
    expect(contractCodes).toEqual(expect.arrayContaining([
      'XB_MATRIX_SOLVE_BOUND_INVALID',
      'XB_DISCRETE_SAMPLE_TIME_REQUIRED',
      'XB_DISCRETE_REPRESENTATION_REQUIRED',
      'XB_TARGET_CAPABILITY_MISSING',
    ]));
  });

  it('accepts target-valid 9-element discrete realization vectors without applying MatrixSolve bounds', () => {
    const target16 = { ...target, maxVectorLength: 16 };
    const result = validateXBModel(model({ nodes: [node('ss9', 'STATE_SPACE', {
      representation: 'discrete',
      inputs: [port('u', 'input', { shape: 'vector', dimensions: [9] })],
      outputs: [port('y', 'output', { shape: 'vector', dimensions: [9] }), port('x', 'output', { shape: 'vector', dimensions: [9] })],
    })] }), variables, target16).map((diagnostic) => diagnostic.code);
    expect(result).not.toContain('XB_BLOCK_NOT_CODEGEN_CAPABLE');
    expect(result).not.toContain('XB_MATRIX_SOLVE_BOUND_INVALID');
  });

  it('rejects malformed canonical port collections', () => {
    const result = codes(model({
      nodes: [node('gain', 'GAIN', {
        inputs: 'not-an-array',
      })],
    }));

    expect(result).toContain('XB_PORT_DANGLING');
  });

  it('rejects omitted canonical port topology', () => {
    const bareNode = node('gain') as any;
    delete bareNode.parameters.inputs;
    delete bareNode.parameters.outputs;

    expect(codes(model({ nodes: [bareNode] }))).toContain('XB_PORT_DANGLING');
  });

  it('rejects malformed and duplicate generic port declarations', () => {
    const malformedCodes = codes(model({
      nodes: [node('gain', 'GAIN', {
        ports: [{ id: 'bad', direction: 'sideways' } as any],
      })],
      mappings: [{
        smVarId: 'speed',
        blockId: 'gain',
        portId: 'u',
        direction: 'in',
      }],
    }));
    const duplicateCodes = codes(model({
      nodes: [node('gain', 'GAIN', {
        ports: [port('u', 'input')],
      })],
      mappings: [{
        smVarId: 'speed',
        blockId: 'gain',
        portId: 'u',
        direction: 'in',
      }],
    }));

    expect(malformedCodes).toContain('XB_PORT_DANGLING');
    expect(duplicateCodes).toContain('XB_PORT_DANGLING');
  });

  it('rejects dangling handles and multiple scalar writers', () => {
    const result = codes(model({
      nodes: [node('a'), node('b')],
      edges: [
        {
          id: 'missing-port',
          sourceNodeId: 'a',
          sourcePortId: 'missing',
          targetNodeId: 'b',
          targetPortId: 'u',
        },
        {
          id: 'first-writer',
          sourceNodeId: 'a',
          sourcePortId: 'y',
          targetNodeId: 'b',
          targetPortId: 'u',
        },
        {
          id: 'second-writer',
          sourceNodeId: 'b',
          sourcePortId: 'y',
          targetNodeId: 'b',
          targetPortId: 'u',
        },
      ],
    }));

    expect(result).toContain('XB_PORT_DANGLING');
  });

  it('requires exactly one effective driver for every scalar input', () => {
    const undrivenCodes = codes(model());
    const multiplyDrivenCodes = codes(model({
      nodes: [
        node('source', 'Constant', {
          inputs: [],
          outputs: [port('y', 'output')],
        }),
        node('gain'),
      ],
      edges: [{
        id: 'source-gain',
        sourceNodeId: 'source',
        sourcePortId: 'y',
        targetNodeId: 'gain',
        targetPortId: 'u',
      }],
      mappings: [{
        smVarId: 'speed',
        blockId: 'gain',
        portId: 'u',
        direction: 'in',
      }],
    }));

    expect(undrivenCodes).toContain('XB_PORT_DANGLING');
    expect(multiplyDrivenCodes).toContain('XB_PORT_DANGLING');
  });

  it('rejects dynamic or non-positive dimensions', () => {
    expect(codes(model({
      nodes: [node('vector', 'GAIN', {
        inputs: [port('u', 'input', {
          shape: 'vector',
          dimensions: ['dynamic'],
        })],
      })],
    }))).toContain('XB_DIMENSION_DYNAMIC');
  });

  it('rejects an explicitly dynamic port shape', () => {
    expect(codes(model({
      nodes: [node('dynamic', 'GAIN', {
        inputs: [port('u', 'input', {
          shape: 'dynamic',
        })],
      })],
    }))).toContain('XB_DIMENSION_DYNAMIC');
  });

  it('rejects an unknown explicit port shape', () => {
    expect(codes(model({
      nodes: [node('unknown-shape', 'GAIN', {
        inputs: [port('u', 'input', {
          shape: 'tensor',
        })],
      })],
    }))).toContain('XB_DIMENSION_DYNAMIC');
  });

  it('rejects dimensions supplied for an explicitly scalar port', () => {
    expect(codes(model({
      nodes: [node('scalar-dimensions', 'GAIN', {
        inputs: [port('u', 'input', {
          shape: 'scalar',
          dimensions: [8],
        })],
      })],
    }))).toContain('XB_DIMENSION_DYNAMIC');
  });

  it('rejects invalid fixed-point formats', () => {
    const nestedFormatCodes = codes(model({
      nodes: [node('fixed', 'NUMERIC_REPRESENTATION', {
        outputType: {
          kind: 'fixed',
          signed: true,
          wordLength: 0,
          fractionLength: 8,
        },
      })],
    }));
    const persistedBlockCodes = codes(model({
      nodes: [node('flat-fixed', 'DATA_TYPE_CONVERSION', {
        output_type: 'fixed_point',
        wordLength: 0,
        fractionLength: 8,
      })],
    }));

    expect(nestedFormatCodes).toContain('XB_FIXED_FORMAT_INVALID');
    expect(persistedBlockCodes).toContain('XB_FIXED_FORMAT_INVALID');
  });

  it('rejects invalid solver and discrete sample schedules', () => {
    const camelCaseCodes = codes(model({
      nodes: [node('sampled', 'UNIT_DELAY', { sampleTime: 0.015 })],
    }));
    const persistedCodes = codes(model({
      nodes: [node('sampled', 'INTEGRATOR_DISCRETE', { sample_time: 0.015 })],
    }));

    expect(camelCaseCodes).toContain('XB_SAMPLE_TIME_INVALID');
    expect(persistedCodes).toContain('XB_SAMPLE_TIME_INVALID');
  });

  it('rejects pure direct-feedthrough algebraic loops', () => {
    expect(codes(model({
      nodes: [node('a'), node('b')],
      edges: [
        {
          id: 'a-to-b',
          sourceNodeId: 'a',
          sourcePortId: 'y',
          targetNodeId: 'b',
          targetPortId: 'u',
        },
        {
          id: 'b-to-a',
          sourceNodeId: 'b',
          sourcePortId: 'y',
          targetNodeId: 'a',
          targetPortId: 'u',
        },
      ],
    }))).toContain('XB_ALGEBRAIC_LOOP_UNSUPPORTED');
  });

  it('requires registry-declared target capabilities and numeric support', () => {
    const registryRequirementCodes = codes(model({
      nodes: [node('park', 'PARK_TRANSFORM')],
    }));
    const persistedNumericCodes = codes(model({
      nodes: [node('double', 'DATA_TYPE_CONVERSION', {
        output_type: 'float64',
      })],
    }));

    expect(registryRequirementCodes).toContain('XB_TARGET_CAPABILITY_MISSING');
    expect(persistedNumericCodes).toContain('XB_TARGET_CAPABILITY_MISSING');
  });

  it('rejects mappings with unstable references, wrong ports, or implicit conversions', () => {
    const result = codes(model({
      nodes: [node('gain')],
      mappings: [
        {
          smVarId: 'missing-variable',
          blockId: 'gain',
          portId: 'u',
          direction: 'in',
        },
        {
          smVarId: 'enabled',
          blockId: 'gain',
          portId: 'u',
          direction: 'in',
        },
      ],
    }));

    expect(result).toContain('XB_MAPPING_INVALID');
  });

  it('does not resolve inherited object properties as stable variable IDs', () => {
    const result = codes(model({
      nodes: [node('convert', 'DATA_TYPE_CONVERSION')],
      mappings: [{
        smVarId: 'constructor',
        blockId: 'convert',
        portId: 'u',
        direction: 'in',
      }],
    }));

    expect(result).toContain('XB_MAPPING_INVALID');
  });

  it('accepts a structurally complete acyclic mapped model', () => {
    expect(validateXBModel(model({
      nodes: [
        node('input', 'Inport', {
          inputs: [],
          outputs: [port('y', 'output')],
        }),
        node('gain'),
        node('output', 'Outport', {
          inputs: [port('u', 'input')],
          outputs: [],
        }),
      ],
      edges: [
        {
          id: 'input-gain',
          sourceNodeId: 'input',
          sourcePortId: 'y',
          targetNodeId: 'gain',
          targetPortId: 'u',
        },
        {
          id: 'gain-output',
          sourceNodeId: 'gain',
          sourcePortId: 'y',
          targetNodeId: 'output',
          targetPortId: 'u',
        },
      ],
      mappings: [{
        smVarId: 'speed',
        blockId: 'input',
        portId: 'y',
        direction: 'in',
      }],
    }), variables, {
      ...target,
      supportsMathLibrary: true,
    })).toEqual([]);
  });

  it('rejects multi-element MUX when output storage capacity is scalar (1) (XB_DIMENSION_MISMATCH)', () => {
    const result = codes(model({
      nodes: [
        node('mux1', 'MUX', {
          inputs: [port('u1', 'input'), port('u2', 'input')],
          outputs: [port('y', 'output', { shape: 'scalar' })],
        }),
      ],
    }));
    expect(result).toContain('XB_DIMENSION_MISMATCH');
  });

  it('rejects DEMUX when input storage capacity is scalar (1) for multiple output ports (XB_DIMENSION_MISMATCH)', () => {
    const result = codes(model({
      nodes: [
        node('demux1', 'DEMUX', {
          inputs: [port('u', 'input', { shape: 'scalar' })],
          outputs: [port('y1', 'output'), port('y2', 'output')],
        }),
      ],
    }));
    expect(result).toContain('XB_DIMENSION_MISMATCH');
  });

  it('Batch4 Vector Arithmetic Probe: accepts MUX output connected to VectorAdd inputs without scalar fallback', () => {
    const batch4Model: XBPersistedModelV1 = {
      schemaVersion: 1,
      solver: { kind: 'euler', stepSeconds: 0.01 },
      nodes: [
        {
          id: 'c7',
          type: 'Constant',
          parameters: {
            value: 7,
            inputs: [],
            outputs: [{ id: 'out', dataType: 'auto' }],
          },
        },
        {
          id: 'c9',
          type: 'Constant',
          parameters: {
            value: 9,
            inputs: [],
            outputs: [{ id: 'out', dataType: 'auto' }],
          },
        },
        {
          id: 'XB6-Mux2',
          type: 'MUX',
          parameters: {
            inputs: [
              { id: 'in1', dataType: 'auto' },
              { id: 'in2', dataType: 'auto' },
            ],
            outputs: [{ id: 'out', dataType: 'auto' }],
          },
        },
        {
          id: 'XB7-VectorAdd',
          type: 'VectorAdd',
          parameters: {
            inputs: [
              { id: 'in1', dataType: 'auto' },
              { id: 'in2', dataType: 'auto' },
            ],
            outputs: [{ id: 'out', dataType: 'auto' }],
          },
        },
      ],
      edges: [
        { id: 'e1', sourceNodeId: 'c7', sourcePortId: 'out', targetNodeId: 'XB6-Mux2', targetPortId: 'in1' },
        { id: 'e2', sourceNodeId: 'c9', sourcePortId: 'out', targetNodeId: 'XB6-Mux2', targetPortId: 'in2' },
        { id: 'e3', sourceNodeId: 'XB6-Mux2', sourcePortId: 'out', targetNodeId: 'XB7-VectorAdd', targetPortId: 'in1' },
        { id: 'e4', sourceNodeId: 'XB6-Mux2', sourcePortId: 'out', targetNodeId: 'XB7-VectorAdd', targetPortId: 'in2' },
      ],
      mappings: [],
      policy: { memory: 'reset', numericFault: 'signal-only' },
    };

    const diagnostics = validateXBModel(batch4Model, variables, target);
    expect(diagnostics).toEqual([]);
  });

  it('validates Batch5C filter blocks as codegen capable with paired executable conformance', () => {
    setXBConformanceStatus('T10-PAIRED-FILTERS', 'PASS');
    const batch5cModel: XBPersistedModelV1 = {
      schemaVersion: 1,
      solver: { kind: 'euler', stepSeconds: 0.01 },
      nodes: [
        node('lpf1', 'LOW_PASS_FILTER', { cutoff_frequency: 1, sample_time: 0.1, initial_condition: 0 }),
        node('hpf1', 'HIGH_PASS_FILTER', { cutoff_frequency: 1, sample_time: 0.1, initial_condition: 0 }),
        node('ma1', 'MOVING_AVERAGE', { window_size: 4, sample_time: 0.1, initial_condition: 0 }),
      ],
      edges: [],
      mappings: [],
      policy: { memory: 'reset', numericFault: 'escalate' },
    };

    const diagnostics = validateXBModel(batch5cModel, variables, target);
    expect(diagnostics.filter(d => d.code === 'XB_BLOCK_NOT_CODEGEN_CAPABLE')).toEqual([]);
    expect(diagnostics.filter(d => d.code === 'XB_PROGRAM_CONFORMANCE_GATE_BLOCKED')).toEqual([]);
  });

  it('blocks Batch5C filter generation when paired conformance has not passed', () => {
    resetXBConformanceStatus();
    const batch5cModel: XBPersistedModelV1 = {
      schemaVersion: 1,
      solver: { kind: 'euler', stepSeconds: 0.01 },
      nodes: [
        node('lpf1', 'LOW_PASS_FILTER', { cutoff_frequency: 1, sample_time: 0.1, initial_condition: 0 }),
      ],
      edges: [],
      mappings: [],
      policy: { memory: 'reset', numericFault: 'escalate' },
    };

    const diagnostics = validateXBModel(batch5cModel, variables, target);
    expect(diagnostics.map(d => d.code)).toContain('XB_PROGRAM_CONFORMANCE_GATE_BLOCKED');
    const blocked = diagnostics.find(d => d.code === 'XB_PROGRAM_CONFORMANCE_GATE_BLOCKED')!;
    expect(blocked.message).toContain('BLOCKED BY PROGRAM CONFORMANCE GATE');
  });

  it('validates IdentityMatrix square matrix output and maximum static limit 8', () => {
    const validModel = model({
      nodes: [node('id1', 'IdentityMatrix', {
        dimension: 4,
        inputs: [],
        outputs: [port('y', 'output', { shape: 'matrix', dimensions: [4, 4] })],
      })],
    });
    const invalidNonSquareModel = model({
      nodes: [node('id2', 'IdentityMatrix', {
        dimension: 4,
        inputs: [],
        outputs: [port('y', 'output', { shape: 'matrix', dimensions: [4, 3] })],
      })],
    });
    const invalidOversizedModel = model({
      nodes: [node('id3', 'IdentityMatrix', {
        dimension: 9,
        inputs: [],
        outputs: [port('y', 'output', { shape: 'matrix', dimensions: [9, 9] })],
      })],
    });

    setXBConformanceStatus('T10-C99-IDENTITY-MATRIX', 'PASS');
    expect(codes(validModel)).not.toContain('XB_SHAPE_MISMATCH');
    expect(codes(invalidNonSquareModel)).toContain('XB_SHAPE_MISMATCH');
    expect(codes(invalidOversizedModel)).toContain('XB_SHAPE_MISMATCH');
  });

  it('validates reductions require non-empty vector or matrix input (N >= 1)', () => {
    const validModel = model({
      nodes: [
        node('const1', 'Constant', { inputs: [], outputs: [port('out', 'output', { shape: 'vector', dimensions: [4] })] }),
        node('sum1', 'SumElements', { inputs: [port('in', 'input', { shape: 'vector', dimensions: [4] })], outputs: [port('y', 'output')] }),
      ],
      edges: [{ id: 'e1', sourceNodeId: 'const1', sourcePortId: 'out', targetNodeId: 'sum1', targetPortId: 'in' }],
    });
    const emptyModel = model({
      nodes: [
        node('const1', 'Constant', { inputs: [], outputs: [port('out', 'output', { shape: 'vector', dimensions: [0] })] }),
        node('sum1', 'SumElements', { inputs: [port('in', 'input', { shape: 'vector', dimensions: [0] })], outputs: [port('y', 'output')] }),
      ],
      edges: [{ id: 'e1', sourceNodeId: 'const1', sourcePortId: 'out', targetNodeId: 'sum1', targetPortId: 'in' }],
    });

    setXBConformanceStatus('T10-C99-REDUCTIONS', 'PASS');
    expect(codes(validModel).filter(c => c === 'XB_SHAPE_MISMATCH')).toEqual([]);
    expect(codes(emptyModel)).toContain('XB_SHAPE_MISMATCH');
  });

  it('validates SATURATION, DEADZONE, and RATE_LIMITER parameters and produces actionable diagnostics', () => {
    const invalidSat = model({
      nodes: [node('sat', 'SATURATION', { lowerLimit: 5, upperLimit: 2 })],
    });
    setXBConformanceStatus('T10-C99-DISCONTINUOUS', 'PASS');
    expect(codes(invalidSat)).toContain('XB_PARAMETER_INVALID');

    const invalidRl = model({
      nodes: [node('rl', 'RATE_LIMITER', { risingSlewRate: -1, fallingSlewRate: 1, sampleTime: 0 })],
    });
    expect(codes(invalidRl)).toContain('XB_PARAMETER_INVALID');
  });

  it('validates 1D scalar KALMAN_FILTER model with zero shape errors', () => {
    setXBConformanceStatus('XB-W5-KALMAN', 'PASS');
    const validScalarKf = model({
      nodes: [
        node('c_u', 'Constant', { inputs: [], outputs: [port('out', 'output', { shape: 'scalar', dimensions: [] })] }),
        node('c_y', 'Constant', { inputs: [], outputs: [port('out', 'output', { shape: 'scalar', dimensions: [] })] }),
        node('XBKF12A_Kalman', 'KALMAN_FILTER', {
          A: [[0.9]],
          B: [[0.1]],
          C: [[1.0]],
          D: [[0.0]],
          Q: [[0.01]],
          R: [[0.05]],
          P0: [[1.0]],
          x0: [0.0],
          inputs: [
            port('u', 'input', { shape: 'scalar', dimensions: [] }),
            port('y_meas', 'input', { shape: 'scalar', dimensions: [] }),
          ],
          outputs: [
            port('x_hat', 'output', { shape: 'scalar', dimensions: [] }),
            port('y_hat', 'output', { shape: 'scalar', dimensions: [] }),
          ],
        }),
      ],
      edges: [
        { id: 'e1', sourceNodeId: 'c_u', sourcePortId: 'out', targetNodeId: 'XBKF12A_Kalman', targetPortId: 'u' },
        { id: 'e2', sourceNodeId: 'c_y', sourcePortId: 'out', targetNodeId: 'XBKF12A_Kalman', targetPortId: 'y_meas' },
      ],
    });

    const result = validateXBModel(validScalarKf, variables, target);
    const shapeErrors = result.filter(d => d.code === 'XB_SHAPE_MISMATCH' || d.code === 'XB_BLOCK_NOT_CODEGEN_CAPABLE');
    expect(shapeErrors).toEqual([]);
  });

  it('rejects multi-input KALMAN_FILTER model when scalar u input is connected with XB_SHAPE_MISMATCH', () => {
    setXBConformanceStatus('XB-W5-KALMAN', 'PASS');
    const invalidMultiKf = model({
      nodes: [
        node('c_u', 'Constant', { inputs: [], outputs: [port('out', 'output', { shape: 'scalar', dimensions: [] })] }),
        node('c_y', 'Constant', { inputs: [], outputs: [port('out', 'output', { shape: 'scalar', dimensions: [] })] }),
        node('kf_multi', 'KALMAN_FILTER', {
          A: [[0.9, 0.0], [0.0, 0.9]],
          B: [[0.1, 0.2], [0.3, 0.4]],
          C: [[1.0, 0.0]],
          D: [[0.0, 0.0]],
          Q: [[0.01, 0.0], [0.0, 0.01]],
          R: [[0.05]],
          P0: [[1.0, 0.0], [0.0, 1.0]],
          x0: [0.0, 0.0],
          inputs: [
            port('u', 'input', { shape: 'vector', dimensions: [2] }),
            port('y_meas', 'input', { shape: 'scalar', dimensions: [] }),
          ],
          outputs: [
            port('x_hat', 'output', { shape: 'vector', dimensions: [2] }),
          ],
        }),
      ],
      edges: [
        { id: 'e1', sourceNodeId: 'c_u', sourcePortId: 'out', targetNodeId: 'kf_multi', targetPortId: 'u' },
        { id: 'e2', sourceNodeId: 'c_y', sourcePortId: 'out', targetNodeId: 'kf_multi', targetPortId: 'y_meas' },
      ],
    });

    const result = validateXBModel(invalidMultiKf, variables, target);
    expect(result.some(d => d.code === 'XB_SHAPE_MISMATCH')).toBe(true);
  });

  it('accepts XB6-DiagExtract block with matrix input shape without diagnostics', () => {
    const diagModel: XBPersistedModelV1 = {
      schemaVersion: 1,
      solver: { kind: 'euler', stepSeconds: 0.01 },
      nodes: [
        node('constMat', 'Constant', {
          outputs: [port('y', 'output', { shape: 'matrix', dimensions: [3, 3] })],
          value: [[1, 0, 0], [0, 2, 0], [0, 0, 3]],
        }),
        node('diagExt', 'XB6-DiagExtract', {
          inputs: [port('in', 'input', { shape: 'matrix', dimensions: [3, 3] })],
          outputs: [port('out', 'output', { shape: 'vector', dimensions: [3] })],
        }),
      ],
      edges: [
        { id: 'e1', sourceNodeId: 'constMat', sourcePortId: 'y', targetNodeId: 'diagExt', targetPortId: 'in' },
      ],
      mappings: [],
      policy: { memory: 'reset', numericFault: 'escalate' },
    };

    const diagnostics = validateXBModel(diagModel, variables, target);
    const shapeErrors = diagnostics.filter((d) => d.code === 'XB_PORT_SHAPE_UNSUPPORTED' || d.code === 'XB_SHAPE_MISMATCH');
    expect(shapeErrors).toEqual([]);
  });

  it('accepts various DiagExtract/MatrixDiag block type aliases (XB6-MatrixDiag, DIAG_EXTRACT, Diag_Extract) with matrix input shape', () => {
    for (const blockType of ['XB6-MatrixDiag', 'XB6-ExtractDiag', 'XB6-Diag', 'DIAG_EXTRACT', 'Diag_Extract', 'diag_extract']) {
      const model: XBPersistedModelV1 = {
        schemaVersion: 1,
        solver: { kind: 'euler', stepSeconds: 0.01 },
        nodes: [
          node('constMat', 'Constant', {
            outputs: [port('y', 'output', { shape: 'matrix', dimensions: [3, 3] })],
            value: [[1, 0, 0], [0, 2, 0], [0, 0, 3]],
          }),
          node('diagExt', blockType, {
            inputs: [{ id: 'in', direction: 'input', dataType: 'auto' }],
            outputs: [{ id: 'out', direction: 'output', dataType: 'auto' }],
          }),
        ],
        edges: [
          { id: 'e1', sourceNodeId: 'constMat', sourcePortId: 'y', targetNodeId: 'diagExt', targetPortId: 'in' },
        ],
        mappings: [],
        policy: { memory: 'reset', numericFault: 'escalate' },
      };

      const diagnostics = validateXBModel(model, variables, target);
      const shapeErrors = diagnostics.filter((d) => d.code === 'XB_PORT_SHAPE_UNSUPPORTED' || d.code === 'XB_SHAPE_MISMATCH');
      expect(shapeErrors, `Failed for blockType ${blockType}`).toEqual([]);
    }
  });


  it('accepts XB6-MatrixSolve block with vector in2 shape without shape diagnostics', () => {
    const solveModel: XBPersistedModelV1 = {
      schemaVersion: 1,
      solver: { kind: 'euler', stepSeconds: 0.01 },
      nodes: [
        node('matA', 'Constant', {
          outputs: [port('y', 'output', { shape: 'matrix', dimensions: [2, 2] })],
          value: [[1, 0], [0, 1]],
        }),
        node('vecB', 'Constant', {
          outputs: [port('y', 'output', { shape: 'vector', dimensions: [2] })],
          value: [3, 4],
        }),
        node('solveBlock', 'XB6-MatrixSolve', {
          inputs: [
            port('in1', 'input', { shape: 'matrix', dimensions: [2, 2] }),
            port('in2', 'input', { shape: 'vector', dimensions: [2] }),
          ],
          outputs: [port('out', 'output', { shape: 'vector', dimensions: [2] })],
          maxDimension: 4,
        }),
      ],
      edges: [
        { id: 'e1', sourceNodeId: 'matA', sourcePortId: 'y', targetNodeId: 'solveBlock', targetPortId: 'in1' },
        { id: 'e2', sourceNodeId: 'vecB', sourcePortId: 'y', targetNodeId: 'solveBlock', targetPortId: 'in2' },
      ],
      mappings: [],
      policy: { memory: 'reset', numericFault: 'escalate' },
    };

    const diagnostics = validateXBModel(solveModel, variables, target);
    const shapeErrors = diagnostics.filter((d) => d.code === 'XB_PORT_SHAPE_UNSUPPORTED' || d.code === 'XB_SHAPE_MISMATCH');
    expect(shapeErrors).toEqual([]);
  });

  describe('STATE_SPACE matrix validation and initial state inference', () => {
    const makeSSModel = (ssParams: Record<string, unknown>): XBPersistedModelV1 => {
      const uDim = (Array.isArray(ssParams.B) && Array.isArray((ssParams.B as any)[0])) ? (ssParams.B as any)[0].length : 1;
      const yDim = (Array.isArray(ssParams.C)) ? (ssParams.C as any).length : 1;
      const xDim = (Array.isArray(ssParams.A)) ? (ssParams.A as any).length : 1;
      return {
        schemaVersion: 1,
        solver: { kind: 'euler', stepSeconds: 0.01 },
        nodes: [
          node('driver', 'Constant', {
            inputs: [],
            outputs: [port('out', 'output', { shape: 'vector', dimensions: [uDim] })],
            value: Array(uDim).fill(1),
          }),
          node('ssBlock', 'STATE_SPACE', {
            representation: 'discrete',
            inputs: [port('u', 'input', { shape: 'vector', dimensions: [uDim] })],
            outputs: [
              port('y', 'output', { shape: 'vector', dimensions: [yDim] }),
              port('x', 'output', { shape: 'vector', dimensions: [xDim] }),
            ],
            ...ssParams,
          }),
        ],
        edges: [
          { id: 'e1', sourceNodeId: 'driver', sourcePortId: 'out', targetNodeId: 'ssBlock', targetPortId: 'u' },
        ],
        mappings: [],
        policy: { memory: 'reset', numericFault: 'escalate' },
      };
    };

    it('AC-1 (MIMO): passes for valid one-state 2-input 2-output MIMO model', () => {
      const model = makeSSModel({
        A: [[0.5]],
        B: [[1, 1]],
        C: [[1], [0.5]],
        D: [[0, 0], [0, 0]],
        x0: [0],
      });
      const diags = validateXBModel(model, variables, target);
      expect(diags).toEqual([]);
    });

    it('AC-1 (SISO): passes for valid one-state 1-input 1-output SISO model', () => {
      const model = makeSSModel({
        A: [[0.5]],
        B: [[1]],
        C: [[1]],
        D: [[0]],
        x0: [0],
      });
      const diags = validateXBModel(model, variables, target);
      expect(diags).toEqual([]);
    });

    it('AC-2: malformed 3D C matrix reports C error and does NOT report x0 mismatch', () => {
      const model = makeSSModel({
        A: [[0.5]],
        B: [[1, 1]],
        C: [[[1]], [[0.5]]],
        D: [[0, 0], [0, 0]],
        x0: [0],
      });
      const diags = validateXBModel(model, variables, target);
      expect(diags.length).toBeGreaterThan(0);
      const cDiag = diags.find((d) => d.message.includes("parameter 'C'"));
      expect(cDiag).toBeDefined();
      expect(cDiag?.message).toContain('nested value at C[0][0]');
      const x0Diag = diags.find((d) => d.message.includes("parameter 'x0'"));
      expect(x0Diag).toBeUndefined();
    });

    it('AC-3: x0 count derived exclusively from A when x0 has wrong length', () => {
      const model = makeSSModel({
        A: [[0.5]],
        B: [[1, 1]],
        C: [[1], [0.5]],
        D: [[0, 0], [0, 0]],
        x0: [0, 0],
      });
      const diags = validateXBModel(model, variables, target);
      expect(diags.length).toBe(1);
      expect(diags[0].message).toContain("parameter 'x0' must contain exactly 1 finite numeric value(s), as determined by A (1×1); received 2");
    });

    it('AC-4: 2-state model with x0 [0, 0] passes validation', () => {
      const model = makeSSModel({
        A: [[1, 0.1], [0, 1]],
        B: [[0], [0.1]],
        C: [[1, 0]],
        D: [[0]],
        x0: [0, 0],
      });
      const diags = validateXBModel(model, variables, target);
      expect(diags).toEqual([]);
    });

    it('AC-5: inconsistent D dimensions is rejected', () => {
      const model = makeSSModel({
        A: [[0.5]],
        B: [[1, 1]],
        C: [[1], [0.5]],
        D: [[0], [0]],
        x0: [0],
      });
      const diags = validateXBModel(model, variables, target);
      expect(diags.length).toBe(1);
      expect(diags[0].message).toContain("parameter 'D' must have dimensions 2×2; received 2×1");
    });

    it('rejects non-square A (FR-3)', () => {
      const model = makeSSModel({
        A: [[1, 0, 0], [0, 1, 0]],
        B: [[1], [1]],
        C: [[1, 0]],
        D: [[0]],
        x0: [0, 0],
      });
      const diags = validateXBModel(model, variables, target);
      expect(diags.length).toBe(1);
      expect(diags[0].message).toContain("parameter 'A' must be square; received 2×3");
    });

    it('rejects 2D nested array x0: [[0]] and non-array scalar x0: 0', () => {
      const model2D = makeSSModel({
        A: [[0.5]],
        B: [[1]],
        C: [[1]],
        D: [[0]],
        x0: [[0]],
      });
      const diags2D = validateXBModel(model2D, variables, target);
      expect(diags2D.length).toBe(1);
      expect(diags2D[0].message).toContain("parameter 'x0'");

      const modelScalar = makeSSModel({
        A: [[0.5]],
        B: [[1]],
        C: [[1]],
        D: [[0]],
        x0: 0,
      });
      const diagsScalar = validateXBModel(modelScalar, variables, target);
      expect(diagsScalar.length).toBe(1);
      expect(diagsScalar[0].message).toContain("parameter 'x0'");
    });

    it('isolates error to invalid STATE_SPACE node and continues validating independent valid node', () => {
      const modelWithTwoNodes: XBPersistedModelV1 = {
        schemaVersion: 1,
        solver: { kind: 'euler', stepSeconds: 0.01 },
        nodes: [
          node('driver1', 'Constant', {
            inputs: [],
            outputs: [port('out', 'output', { shape: 'vector', dimensions: [1] })],
            value: [1],
          }),
          node('invalidSS', 'STATE_SPACE', {
            representation: 'discrete',
            inputs: [port('u', 'input', { shape: 'vector', dimensions: [1] })],
            outputs: [port('y', 'output', { shape: 'vector', dimensions: [1] }), port('x', 'output', { shape: 'vector', dimensions: [1] })],
            A: [[0.5]],
            B: [[1]],
            C: [[[1]]],
            D: [[0]],
            x0: [0],
          }),
          node('driver2', 'Constant', {
            inputs: [],
            outputs: [port('out', 'output', { shape: 'scalar' })],
            value: 2,
          }),
          node('validGain', 'GAIN', {
            inputs: [port('u', 'input', { shape: 'scalar' })],
            outputs: [port('y', 'output', { shape: 'scalar' })],
            gain: 2,
          }),
        ],
        edges: [
          { id: 'e1', sourceNodeId: 'driver1', sourcePortId: 'out', targetNodeId: 'invalidSS', targetPortId: 'u' },
          { id: 'e2', sourceNodeId: 'driver2', sourcePortId: 'out', targetNodeId: 'validGain', targetPortId: 'u' },
        ],
        mappings: [],
        policy: { memory: 'reset', numericFault: 'escalate' },
      };
      const diags = validateXBModel(modelWithTwoNodes, variables, target);
      const ssDiags = diags.filter((d) => d.elementId === 'invalidSS');
      const gainDiags = diags.filter((d) => d.elementId === 'validGain');
      expect(ssDiags.length).toBe(1);
      expect(ssDiags[0].message).toContain("parameter 'C'");
      expect(gainDiags).toEqual([]);
    });
  });
});



