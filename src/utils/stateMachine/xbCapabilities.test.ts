import { describe, expect, it } from 'vitest';
import { BLOCK_LIBRARY } from '../../engine/xbridges/BlockDefinitions';
import * as capabilityModule from './xbCapabilities';
import { XB_C_CONFORMANCE_CASE_IDS, XB_INTERPRETER_CONFORMANCE_CASE_IDS, getXBBlockCapability } from './xbCapabilities';
import { XB_EXECUTABLE_C_CASES } from './xbCConformanceCases';

describe('getXBBlockCapability', () => {
  it('requires every enabled capability case ID to resolve to an executed case', () => {
    for (const type of Object.keys(BLOCK_LIBRARY)) {
      const capability = getXBBlockCapability(type);
      if (!capability || !capability.codegen) continue;
      for (const id of capability.cConformanceCaseIds ?? []) {
        expect(XB_EXECUTABLE_C_CASES[id], `${type}: ${id}`).toBeDefined();
      }
    }
  });
  it('marks Subsystem, Inport, and Outport as codegen capable', () => {
    expect(getXBBlockCapability('Subsystem')?.codegen).toBe(true);
    expect(getXBBlockCapability('Inport')?.codegen).toBe(true);
    expect(getXBBlockCapability('Outport')?.codegen).toBe(true);
  });

  it('marks deterministic arithmetic as codegen capable', () => {
    expect(getXBBlockCapability('GAIN')).toMatchObject({
      codegen: true,
      directFeedthrough: true,
      shapes: ['scalar'],
    });
  });

  it('rejects host-only visualization and learning blocks', () => {
    expect(getXBBlockCapability('Scope')?.codegen).toBe(false);
    expect(getXBBlockCapability('LMS_ADAPTIVE_FILTER')?.codegen).toBe(false);
  });

  it('declares executable conformance coverage for all 24 Trigonometry blocks', () => {
    for (const type of [
      'SIN', 'COS', 'TAN', 'COT', 'SEC', 'COSEC', 'ASIN', 'ACOS', 'ATAN',
      'ACOT', 'ASEC', 'ACOSEC', 'SINH', 'COSH', 'TANH', 'COTH', 'SECH',
      'COSECH', 'ASINH', 'ACOSH', 'ATANH', 'ACOTH', 'ASECH', 'ACOSECH',
    ]) {
      const cap = getXBBlockCapability(type);
      expect(cap?.codegen).toBe(true);
      expect(cap?.requiredTargetCapabilities).toContain('math-library');
      expect(cap?.interpreterConformanceCaseIds).toContain('T10-INT-TRIGONOMETRY');
      expect(cap?.cConformanceCaseIds).toContain('T10-C99-TRIGONOMETRY');
    }
  });

  it('declares executable conformance coverage for IF_ELSE block', () => {
    const cap = getXBBlockCapability('IF_ELSE');
    expect(cap?.codegen).toBe(true);
    expect(cap?.interpreterConformanceCaseIds).toContain('T10-INT-SIGNAL-ROUTING');
    expect(cap?.cConformanceCaseIds).toContain('T10-C99-SIGNAL-ROUTING');
  });

  it('does not assume unknown block types are codegen capable', () => {
    expect(getXBBlockCapability('UNKNOWN_BLOCK')).toBeNull();
  });

  it('declares separate interpreter and C conformance IDs for every enabled Task 10 type', () => {
    for (const type of [
      'VectorAdd', 'VectorSub', 'VectorMul', 'VectorDiv', 'MatrixMul', 'Transpose', 'MatrixConcat', 'MatrixDiag', 'SubMatrix',
      'MatrixSolve', 'PID_BASIC', 'DISCRETE_TRANSFER_FUNCTION', 'STATE_SPACE',
      'CLARKE_TRANSFORM', 'PARK_TRANSFORM', 'INVERSE_PARK', 'INVERSE_CLARKE',
      'NAND', 'NOR', 'XOR', 'BitwiseAND', 'BitwiseOR', 'BitwiseXOR', 'BitwiseNOT', 'ShiftLeft', 'ShiftRight',
      'SWITCH', 'MUX', 'DEMUX', 'IF_ELSE',
      'SIN', 'COS', 'TAN', 'COT', 'SEC', 'COSEC', 'ASIN', 'ACOS', 'ATAN',
      'ACOT', 'ASEC', 'ACOSEC', 'SINH', 'COSH', 'TANH', 'COTH', 'SECH',
      'COSECH', 'ASINH', 'ACOSH', 'ATANH', 'ACOTH', 'ASECH', 'ACOSECH',
      'VectorPow', 'SumElements', 'Mean', 'Max', 'IdentityMatrix',
    ]) {
      const capability = getXBBlockCapability(type) as unknown as {
        readonly interpreterConformanceCaseIds?: readonly string[];
        readonly cConformanceCaseIds?: readonly string[];
        readonly inputShapes?: readonly string[];
        readonly outputShapes?: readonly string[];
      };
      expect(capability.interpreterConformanceCaseIds?.length).toBeGreaterThan(0);
      expect(capability.cConformanceCaseIds?.length).toBeGreaterThan(0);
      expect(capability.interpreterConformanceCaseIds?.every((id) =>
        XB_INTERPRETER_CONFORMANCE_CASE_IDS.includes(id as typeof XB_INTERPRETER_CONFORMANCE_CASE_IDS[number]))).toBe(true);
      expect(capability.cConformanceCaseIds?.every((id) =>
        XB_C_CONFORMANCE_CASE_IDS.includes(id as typeof XB_C_CONFORMANCE_CASE_IDS[number]))).toBe(true);
    }
    const matrixDiag = getXBBlockCapability('MatrixDiag') as unknown as {
      readonly inputShapes?: readonly string[];
      readonly outputShapes?: readonly string[];
    };
    expect(matrixDiag.inputShapes).toEqual(['vector']);
    expect(matrixDiag.outputShapes).toEqual(['matrix']);
    expect(getXBBlockCapability('PID_CONTROLLER')?.codegen).toBe(true);
  });

  it.each(['constructor', 'toString'])('treats inherited name %s as unknown', (type) => {
    expect(getXBBlockCapability(type)).toBeNull();
  });

  it('classifies every public X-Bridges block explicitly', () => {
    for (const type of Object.keys(BLOCK_LIBRARY)) {
      expect(getXBBlockCapability(type), type).not.toBeNull();
    }
  });

  it.each(['Inport', 'Outport'] as const)(
    'allows every scalar port declared by the real %s block',
    (type) => {
      const block = BLOCK_LIBRARY[type](`test-${type}`, {});
      const capability = getXBBlockCapability(type);
      expect(capability?.codegen).toBe(true);
      for (const port of block.inputs) {
        expect(port.direction).toBe('input');
        expect(port.dimensions ?? []).toEqual([]);
        expect(capability?.inputShapes).toContain('scalar');
      }
      for (const port of block.outputs) {
        expect(port.direction).toBe('output');
        expect(port.dimensions ?? []).toEqual([]);
        expect(capability?.outputShapes).toContain('scalar');
      }
      expect([block.inputs.length, block.outputs.length]).toEqual([1, 1]);
    },
  );

  it('declares executable conformance coverage for Batch 1 discontinuities blocks', () => {
    for (const type of ['SATURATION', 'DEADZONE', 'RATE_LIMITER', 'RELAY']) {
      const cap = getXBBlockCapability(type);
      expect(cap?.codegen).toBe(true);
      expect(cap?.interpreterConformanceCaseIds).toContain('T10-INT-DISCONTINUOUS');
      expect(cap?.cConformanceCaseIds).toContain('T10-C99-DISCONTINUOUS');
    }
    expect(getXBBlockCapability('SATURATION')?.requiredTargetCapabilities).toContain('math-library');
    expect(getXBBlockCapability('DEADZONE')?.requiredTargetCapabilities).toContain('math-library');
    expect(getXBBlockCapability('RATE_LIMITER')?.requiredTargetCapabilities).toContain('math-library');
  });

  it('links every code-generation-capable block to interpreter and compiled-C conformance cases', () => {
    const interpreterManifest = (capabilityModule as any).XB_INTERPRETER_CONFORMANCE_CASES as
      Record<string, readonly { blockType: string; inputShapes: readonly string[]; outputShapes: readonly string[] }[]> | undefined;
    const cManifest = (capabilityModule as any).XB_C_CONFORMANCE_CASES as
      Record<string, readonly { blockType: string; inputShapes: readonly string[]; outputShapes: readonly string[] }[]> | undefined;
    expect(interpreterManifest).toBeDefined();
    expect(cManifest).toBeDefined();

    for (const type of Object.keys(BLOCK_LIBRARY)) {
      const capability = getXBBlockCapability(type);
      if (capability?.codegen !== true) continue;

      expect(capability.interpreterConformanceCaseIds?.length, `${type}: interpreter`).toBeGreaterThan(0);
      expect(capability.cConformanceCaseIds?.length, `${type}: compiled C`).toBeGreaterThan(0);
      expect(capability.interpreterConformanceCaseIds?.every((id) =>
        XB_INTERPRETER_CONFORMANCE_CASE_IDS.includes(id as typeof XB_INTERPRETER_CONFORMANCE_CASE_IDS[number])), type).toBe(true);
      expect(capability.cConformanceCaseIds?.every((id) =>
        XB_C_CONFORMANCE_CASE_IDS.includes(id as typeof XB_C_CONFORMANCE_CASE_IDS[number])), type).toBe(true);

      for (const [label, ids, manifest] of [
        ['interpreter', capability.interpreterConformanceCaseIds!, interpreterManifest!],
        ['compiled C', capability.cConformanceCaseIds!, cManifest!],
      ] as const) {
        const records = ids.flatMap((id) => manifest[id] ?? [])
          .filter((entry) => entry.blockType === type);
        const coveredInputs = new Set(records.flatMap((entry) => entry.inputShapes));
        const coveredOutputs = new Set(records.flatMap((entry) => entry.outputShapes));
        expect(coveredInputs, `${type}: ${label} input shapes`).toEqual(
          new Set(capability.inputShapes ?? capability.shapes),
        );
        expect(coveredOutputs, `${type}: ${label} output shapes`).toEqual(
          new Set(capability.outputShapes ?? capability.shapes),
        );
      }
    }
  });

  it('registers Batch5C filters with a paired executable conformance case', () => {
    for (const type of ['LOW_PASS_FILTER', 'HIGH_PASS_FILTER', 'MOVING_AVERAGE']) {
      const cap = getXBBlockCapability(type);
      expect(cap?.codegen).toBe(true);
      expect(cap?.interpreterConformanceCaseIds).toContain('T10-INT-FILTERS');
      expect(cap?.cConformanceCaseIds).toContain('T10-C99-FILTERS');
      expect(cap?.pairedConformanceCaseIds).toContain('T10-PAIRED-FILTERS');
    }
  });
});
