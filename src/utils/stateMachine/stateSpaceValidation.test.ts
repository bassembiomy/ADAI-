import { describe, expect, it } from 'vitest';
import type { XBNodeV1, XBParameterValue } from './xbModel';
import {
  parseMatrixEditorValue,
  stateSpacePortShape,
  validate2DNumericMatrix,
  validateFiniteNumericVector,
  validateStateSpaceNode,
} from './stateSpaceValidation';

describe('stateSpaceValidation', () => {
  describe('stateSpacePortShape', () => {
    it('returns vector shape for length 1', () => {
      const shape = stateSpacePortShape(1);
      expect(shape.kind).toBe('vector');
      expect(shape.elementCount).toBe(1);
      expect(shape.dimensions).toEqual([1]);
    });

    it('returns vector shape for length > 1', () => {
      const shape = stateSpacePortShape(3);
      expect(shape.kind).toBe('vector');
      expect(shape.elementCount).toBe(3);
      expect(shape.dimensions).toEqual([3]);
    });
  });

  describe('parseMatrixEditorValue', () => {
    it('returns primitives and 2D arrays as is', () => {
      expect(parseMatrixEditorValue([[1, 2], [3, 4]])).toEqual([[1, 2], [3, 4]]);
      expect(parseMatrixEditorValue([[0.5]])).toEqual([[0.5]]);
    });

    it('unwraps known single-level UI row wrapper objects', () => {
      const wrapped = [{ value: [1, 2] }, { value: [3, 4] }];
      expect(parseMatrixEditorValue(wrapped)).toEqual([[1, 2], [3, 4]]);
    });

    it('does not flatten arbitrary 3D arrays into 2D', () => {
      const nested3D = [[[1]], [[0.5]]];
      expect(parseMatrixEditorValue(nested3D)).toEqual([[[1]], [[0.5]]]);
    });
  });

  describe('validate2DNumericMatrix', () => {
    it('accepts valid 2D rectangular numeric matrix', () => {
      const res = validate2DNumericMatrix([[1, 2], [3, 4]], 'A');
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.rows).toBe(2);
        expect(res.cols).toBe(2);
        expect(res.matrix).toEqual([[1, 2], [3, 4]]);
      }
    });

    it('rejects non-array or missing values', () => {
      expect(validate2DNumericMatrix(null, 'A').ok).toBe(false);
      expect(validate2DNumericMatrix(undefined, 'A').ok).toBe(false);
      expect(validate2DNumericMatrix(42, 'A').ok).toBe(false);
      expect(validate2DNumericMatrix('[[1]]', 'A').ok).toBe(false);
    });

    it('rejects empty matrix or empty rows', () => {
      expect(validate2DNumericMatrix([], 'A').ok).toBe(false);
      expect(validate2DNumericMatrix([[]], 'A').ok).toBe(false);
      expect(validate2DNumericMatrix([[1], []], 'A').ok).toBe(false);
    });

    it('rejects 1D arrays (mixed scalar and array rows)', () => {
      const res = validate2DNumericMatrix([1, 2], 'A');
      expect(res.ok).toBe(false);
    });

    it('rejects 3D nested arrays', () => {
      const res = validate2DNumericMatrix([[[1]], [[0.5]]], 'C');
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.reason).toContain('nested value at C[0][0]');
      }
    });

    it('rejects jagged matrices', () => {
      const res = validate2DNumericMatrix([[1, 2], [3]], 'A');
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.reason).toContain('jagged matrix');
      }
    });

    it('rejects NaN and Infinity', () => {
      expect(validate2DNumericMatrix([[NaN]], 'A').ok).toBe(false);
      expect(validate2DNumericMatrix([[Infinity]], 'A').ok).toBe(false);
      expect(validate2DNumericMatrix([[-Infinity]], 'A').ok).toBe(false);
    });

    it('rejects non-numeric elements', () => {
      expect(validate2DNumericMatrix([['1']], 'A').ok).toBe(false);
      expect(validate2DNumericMatrix([[true]], 'A').ok).toBe(false);
    });
  });

  describe('validateFiniteNumericVector', () => {
    it('accepts valid 1D array of finite numbers with expected length', () => {
      const res = validateFiniteNumericVector([0.5, -1.2], 2, 'x0');
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.vector).toEqual([0.5, -1.2]);
      }
    });

    it('rejects non-array scalars', () => {
      const res = validateFiniteNumericVector(0, 1, 'x0');
      expect(res.ok).toBe(false);
    });

    it('rejects 2D nested arrays like [[0]]', () => {
      const res = validateFiniteNumericVector([[0]], 1, 'x0');
      expect(res.ok).toBe(false);
    });

    it('rejects length mismatch', () => {
      const res = validateFiniteNumericVector([0, 0], 1, 'x0');
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.reason).toContain('must contain exactly 1 finite numeric value(s), as determined by A (1×1); received 2');
      }
    });

    it('rejects NaN or Infinity in vector', () => {
      expect(validateFiniteNumericVector([NaN], 1, 'x0').ok).toBe(false);
      expect(validateFiniteNumericVector([Infinity], 1, 'x0').ok).toBe(false);
    });
  });

  describe('validateStateSpaceNode', () => {
    const makeNode = (params: Record<string, unknown>): XBNodeV1 => ({
      id: 'XB10-StateSpace',
      type: 'STATE_SPACE',
      parameters: params as unknown as Readonly<Record<string, XBParameterValue>>,
    });

    it('passes for valid MIMO 1-state 2-input 2-output model (AC-1)', () => {
      const node = makeNode({
        A: [[0.5]],
        B: [[1, 1]],
        C: [[1], [0.5]],
        D: [[0, 0], [0, 0]],
        x0: [0],
      });
      const res = validateStateSpaceNode(node);
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.value.dimensions).toEqual({ nStates: 1, nInputs: 2, nOutputs: 2 });
      }
    });

    it('passes for valid SISO 1-state 1-input 1-output model', () => {
      const node = makeNode({
        A: [[0.5]],
        B: [[1]],
        C: [[1]],
        D: [[0]],
        x0: [0],
      });
      const res = validateStateSpaceNode(node);
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.value.dimensions).toEqual({ nStates: 1, nInputs: 1, nOutputs: 1 });
      }
    });

    it('passes for valid 2-state model (AC-4)', () => {
      const node = makeNode({
        A: [[1, 0.1], [0, 1]],
        B: [[0], [0.1]],
        C: [[1, 0]],
        D: [[0]],
        x0: [0, 0],
      });
      const res = validateStateSpaceNode(node);
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.value.dimensions).toEqual({ nStates: 2, nInputs: 1, nOutputs: 1 });
      }
    });

    it('reports structural 3D C error and does not report x0 mismatch (AC-2)', () => {
      const node = makeNode({
        A: [[0.5]],
        B: [[1, 1]],
        C: [[[1]], [[0.5]]],
        D: [[0, 0], [0, 0]],
        x0: [0],
      });
      const res = validateStateSpaceNode(node);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.parameter).toBe('C');
        expect(res.error.reason).toContain('nested value at C[0][0]');
      }
    });

    it('reports x0 count derived exclusively from A when x0 has wrong length (AC-3)', () => {
      const node = makeNode({
        A: [[0.5]],
        B: [[1, 1]],
        C: [[1], [0.5]],
        D: [[0, 0], [0, 0]],
        x0: [0, 0],
      });
      const res = validateStateSpaceNode(node);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.parameter).toBe('x0');
        expect(res.error.reason).toContain('must contain exactly 1 finite numeric value(s), as determined by A (1×1); received 2');
      }
    });

    it('reports non-square A (FR-3)', () => {
      const node = makeNode({
        A: [[1, 0, 0], [0, 1, 0]],
        B: [[1], [1]],
        C: [[1, 0]],
        D: [[0]],
        x0: [0, 0],
      });
      const res = validateStateSpaceNode(node);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.parameter).toBe('A');
        expect(res.error.reason).toContain('parameter \'A\' must be square; received 2×3');
      }
    });

    it('reports invalid B row count (FR-4)', () => {
      const node = makeNode({
        A: [[0.5]],
        B: [[1, 1], [2, 2]],
        C: [[1]],
        D: [[0, 0]],
        x0: [0],
      });
      const res = validateStateSpaceNode(node);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.parameter).toBe('B');
        expect(res.error.reason).toContain('parameter \'B\' must have 1 row(s); received 2×2');
      }
    });

    it('reports invalid C column count (FR-5)', () => {
      const node = makeNode({
        A: [[0.5]],
        B: [[1, 1]],
        C: [[1, 2]],
        D: [[0, 0]],
        x0: [0],
      });
      const res = validateStateSpaceNode(node);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.parameter).toBe('C');
        expect(res.error.reason).toContain('parameter \'C\' must have 1 column(s); received 1×2');
      }
    });

    it('reports inconsistent D dimensions (AC-5, FR-6)', () => {
      const node = makeNode({
        A: [[0.5]],
        B: [[1, 1]],
        C: [[1], [0.5]],
        D: [[0], [0]],
        x0: [0],
      });
      const res = validateStateSpaceNode(node);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.parameter).toBe('D');
        expect(res.error.reason).toContain('parameter \'D\' must have dimensions 2×2; received 2×1');
      }
    });
  });
});
