import { describe, expect, it } from 'vitest';
import { getXBBlockCapability } from './xbCapabilities';

describe('getXBBlockCapability', () => {
  it('marks deterministic arithmetic as codegen capable', () => {
    expect(getXBBlockCapability('GAIN')).toMatchObject({
      codegen: true,
      directFeedthrough: true,
      shapes: ['scalar', 'vector', 'matrix'],
    });
  });

  it('rejects host-only visualization and learning blocks', () => {
    expect(getXBBlockCapability('Scope')?.codegen).toBe(false);
    expect(getXBBlockCapability('LMS_ADAPTIVE_FILTER')?.codegen).toBe(false);
  });

  it('does not assume unknown block types are codegen capable', () => {
    expect(getXBBlockCapability('UNKNOWN_BLOCK')).toBeNull();
  });

  it('declares separate interpreter and C conformance IDs for every enabled Task 10 type', () => {
    for (const type of [
      'VectorAdd', 'VectorSub', 'VectorMul', 'VectorDiv', 'MatrixMul', 'Transpose', 'MatrixConcat', 'MatrixDiag', 'SubMatrix',
      'MatrixSolve', 'PID_BASIC', 'DISCRETE_TRANSFER_FUNCTION', 'STATE_SPACE',
      'CLARKE_TRANSFORM', 'PARK_TRANSFORM', 'INVERSE_PARK', 'INVERSE_CLARKE',
    ]) {
      const capability = getXBBlockCapability(type) as unknown as {
        readonly interpreterConformanceCaseIds?: readonly string[];
        readonly cConformanceCaseIds?: readonly string[];
        readonly inputShapes?: readonly string[];
        readonly outputShapes?: readonly string[];
      };
      expect(capability.interpreterConformanceCaseIds?.length).toBeGreaterThan(0);
      expect(capability.cConformanceCaseIds?.length).toBeGreaterThan(0);
    }
    const matrixDiag = getXBBlockCapability('MatrixDiag') as unknown as {
      readonly inputShapes?: readonly string[];
      readonly outputShapes?: readonly string[];
    };
    expect(matrixDiag.inputShapes).toEqual(['vector']);
    expect(matrixDiag.outputShapes).toEqual(['matrix']);
    expect(getXBBlockCapability('PID_CONTROLLER')?.codegen).toBe(false);
  });

  it.each(['constructor', 'toString'])('treats inherited name %s as unknown', (type) => {
    expect(getXBBlockCapability(type)).toBeNull();
  });
});
