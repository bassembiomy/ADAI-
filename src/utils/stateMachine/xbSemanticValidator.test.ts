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
        inputs: [port('u', 'input', { shape: 'vector', dimensions: [2] })],
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
        outputs: [port('y', 'output', { shape: 'matrix', dimensions: [4, 4] })],
      })],
    });
    const invalidNonSquareModel = model({
      nodes: [node('id2', 'IdentityMatrix', {
        dimension: 4,
        outputs: [port('y', 'output', { shape: 'matrix', dimensions: [4, 3] })],
      })],
    });
    const invalidOversizedModel = model({
      nodes: [node('id3', 'IdentityMatrix', {
        dimension: 9,
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
});

