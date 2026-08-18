import type { XBNodeV1, XBParameterValue } from './xbModel';

export interface SemanticShape {
  readonly kind: 'scalar' | 'vector' | 'matrix' | 'unresolved';
  readonly dimensions: readonly number[];
  readonly elementCount: number;
}

export const SCALAR_SHAPE: SemanticShape = Object.freeze({
  kind: 'scalar',
  dimensions: [],
  elementCount: 1,
});

export const vectorShape = (length: number): SemanticShape =>
  Object.freeze({
    kind: 'vector',
    dimensions: [length],
    elementCount: length,
  });

export interface StateSpaceDimensions {
  readonly nStates: number;
  readonly nInputs: number;
  readonly nOutputs: number;
}

export interface ValidatedStateSpaceParameters {
  readonly A: number[][];
  readonly B: number[][];
  readonly C: number[][];
  readonly D: number[][];
  readonly x0: number[];
  readonly dimensions: StateSpaceDimensions;
}

export interface StateSpaceValidationError {
  readonly parameter: 'A' | 'B' | 'C' | 'D' | 'x0';
  readonly code: string;
  readonly expected?: string;
  readonly actual?: string;
  readonly path?: string;
  readonly reason: string;
}

export type StateSpaceValidationResult =
  | { readonly ok: true; readonly value: ValidatedStateSpaceParameters }
  | { readonly ok: false; readonly error: StateSpaceValidationError };

export function stateSpacePortShape(length: number): SemanticShape {
  return vectorShape(length);
}

function isRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

export function parseMatrixEditorValue(val: unknown): unknown {
  if (Array.isArray(val) && val.length > 0) {
    if (val.every((row) => isRecord(row) && Array.isArray(row.value))) {
      return val.map((row) => (row as Record<string, unknown>).value);
    }
  }
  return val;
}

export function validate2DNumericMatrix(
  rawVal: unknown,
  paramName: 'A' | 'B' | 'C' | 'D',
): { ok: true; matrix: number[][]; rows: number; cols: number } | { ok: false; reason: string; path?: string } {
  const val = parseMatrixEditorValue(rawVal);

  if (val === undefined || val === null) {
    return { ok: false, reason: `Block parameter '${paramName}' is required.` };
  }

  if (!Array.isArray(val) || val.length === 0) {
    return { ok: false, reason: `Block parameter '${paramName}' must be a rectangular 2D numeric matrix.` };
  }

  const rows = val.length;
  let firstColCount: number | null = null;
  const matrix: number[][] = [];

  for (let r = 0; r < rows; r++) {
    const row = val[r];
    if (!Array.isArray(row)) {
      return {
        ok: false,
        reason: `Block parameter '${paramName}' must be a rectangular 2D numeric matrix; received mixed scalar and array rows or 1D array.`,
      };
    }
    if (row.length === 0) {
      return { ok: false, reason: `Block parameter '${paramName}' must be a rectangular 2D numeric matrix; received empty row at ${paramName}[${r}].` };
    }
    if (firstColCount === null) {
      firstColCount = row.length;
    } else if (row.length !== firstColCount) {
      return { ok: false, reason: `Block parameter '${paramName}' must be a rectangular 2D numeric matrix; received a jagged matrix.` };
    }

    const numericRow: number[] = [];
    for (let c = 0; c < row.length; c++) {
      const cell = row[c];
      if (Array.isArray(cell)) {
        return {
          ok: false,
          path: `${paramName}[${r}][${c}]`,
          reason: `Block parameter '${paramName}' must be a rectangular 2D numeric matrix; received a nested value at ${paramName}[0][0].`,
        };
      }
      if (typeof cell !== 'number' || !Number.isFinite(cell)) {
        return {
          ok: false,
          path: `${paramName}[${r}][${c}]`,
          reason: `Block parameter '${paramName}' must be a rectangular 2D numeric matrix; received non-finite or non-numeric value at ${paramName}[${r}][${c}].`,
        };
      }
      numericRow.push(cell);
    }
    matrix.push(numericRow);
  }

  return {
    ok: true,
    matrix,
    rows,
    cols: firstColCount!,
  };
}

export function validateFiniteNumericVector(
  val: unknown,
  expectedLength: number,
  paramName: 'x0',
  nStates?: number,
): { ok: true; vector: number[] } | { ok: false; reason: string } {
  if (val === undefined || val === null) {
    return { ok: false, reason: `Block parameter '${paramName}' is required.` };
  }

  if (!Array.isArray(val)) {
    return { ok: false, reason: `Block parameter '${paramName}' must be a 1D array of numeric values.` };
  }

  const n = nStates ?? expectedLength;
  const actualLength = val.length;

  for (let i = 0; i < actualLength; i++) {
    const item = val[i];
    if (Array.isArray(item) || typeof item !== 'number' || !Number.isFinite(item)) {
      return {
        ok: false,
        reason: `Block parameter '${paramName}' must contain exactly ${n} finite numeric value(s), as determined by A (${n}×${n}); received invalid element at index ${i}.`,
      };
    }
  }

  if (actualLength !== expectedLength) {
    return {
      ok: false,
      reason: `Block parameter '${paramName}' must contain exactly ${n} finite numeric value(s), as determined by A (${n}×${n}); received ${actualLength}.`,
    };
  }

  return { ok: true, vector: val as number[] };
}

export function validateStateSpaceNode(node: XBNodeV1): StateSpaceValidationResult {
  const p = node.parameters ?? {};
  const blockId = node.id ?? 'STATE_SPACE';

  // Step 1: Structural matrix validation for A, B, C, D
  const resA = validate2DNumericMatrix(p.A, 'A');
  if (!resA.ok) {
    return {
      ok: false,
      error: {
        parameter: 'A',
        code: 'XB_PARAMETER_INVALID',
        reason: `Block '${blockId}' ${resA.reason.replace(/^Block parameter 'A' /, "parameter 'A' ")}`,
        path: resA.path,
      },
    };
  }

  const resB = validate2DNumericMatrix(p.B, 'B');
  if (!resB.ok) {
    return {
      ok: false,
      error: {
        parameter: 'B',
        code: 'XB_PARAMETER_INVALID',
        reason: `Block '${blockId}' ${resB.reason.replace(/^Block parameter 'B' /, "parameter 'B' ")}`,
        path: resB.path,
      },
    };
  }

  const resC = validate2DNumericMatrix(p.C, 'C');
  if (!resC.ok) {
    return {
      ok: false,
      error: {
        parameter: 'C',
        code: 'XB_PARAMETER_INVALID',
        reason: `Block '${blockId}' ${resC.reason.replace(/^Block parameter 'C' /, "parameter 'C' ")}`,
        path: resC.path,
      },
    };
  }

  const resD = validate2DNumericMatrix(p.D, 'D');
  if (!resD.ok) {
    return {
      ok: false,
      error: {
        parameter: 'D',
        code: 'XB_PARAMETER_INVALID',
        reason: `Block '${blockId}' ${resD.reason.replace(/^Block parameter 'D' /, "parameter 'D' ")}`,
        path: resD.path,
      },
    };
  }

  // Step 2: Dimension matching
  // n = rows(A) exclusively
  const n = resA.rows;
  if (resA.cols !== n) {
    return {
      ok: false,
      error: {
        parameter: 'A',
        code: 'XB_PARAMETER_INVALID',
        expected: `${n}×${n}`,
        actual: `${resA.rows}×${resA.cols}`,
        reason: `Block '${blockId}' parameter 'A' must be square; received ${resA.rows}×${resA.cols}.`,
      },
    };
  }

  // B must be n × m
  if (resB.rows !== n) {
    return {
      ok: false,
      error: {
        parameter: 'B',
        code: 'XB_PARAMETER_INVALID',
        expected: `${n} row(s)`,
        actual: `${resB.rows}×${resB.cols}`,
        reason: `Block '${blockId}' parameter 'B' must have ${n} row(s); received ${resB.rows}×${resB.cols}.`,
      },
    };
  }
  const m = resB.cols;

  // C must be p × n
  if (resC.cols !== n) {
    return {
      ok: false,
      error: {
        parameter: 'C',
        code: 'XB_PARAMETER_INVALID',
        expected: `${n} column(s)`,
        actual: `${resC.rows}×${resC.cols}`,
        reason: `Block '${blockId}' parameter 'C' must have ${n} column(s); received ${resC.rows}×${resC.cols}.`,
      },
    };
  }
  const pOutputs = resC.rows;

  // D must be p × m
  if (resD.rows !== pOutputs || resD.cols !== m) {
    return {
      ok: false,
      error: {
        parameter: 'D',
        code: 'XB_PARAMETER_INVALID',
        expected: `${pOutputs}×${m}`,
        actual: `${resD.rows}×${resD.cols}`,
        reason: `Block '${blockId}' parameter 'D' must have dimensions ${pOutputs}×${m}; received ${resD.rows}×${resD.cols}.`,
      },
    };
  }

  // Step 3: Initial state x0 validation
  const rawX0 = p.x0 !== undefined ? p.x0 : (p.initialCondition ?? p.initial_condition);
  const resX0 = validateFiniteNumericVector(rawX0, n, 'x0', n);
  if (!resX0.ok) {
    return {
      ok: false,
      error: {
        parameter: 'x0',
        code: 'XB_STATE_INITIAL_VALUE_INVALID',
        expected: `${n} finite numeric value(s)`,
        reason: `Block '${blockId}' ${resX0.reason.replace(/^Block parameter 'x0' /, "parameter 'x0' ")}`,
      },
    };
  }

  return {
    ok: true,
    value: {
      A: resA.matrix,
      B: resB.matrix,
      C: resC.matrix,
      D: resD.matrix,
      x0: resX0.vector,
      dimensions: {
        nStates: n,
        nInputs: m,
        nOutputs: pOutputs,
      },
    },
  };
}

export function resolveStateSpaceDimensions(parameters: Record<string, unknown>): StateSpaceDimensions | null {
  const dummyNode: XBNodeV1 = {
    id: 'temp',
    type: 'STATE_SPACE',
    parameters: parameters as unknown as Readonly<Record<string, XBParameterValue>>,
  };
  const res = validateStateSpaceNode(dummyNode);
  return res.ok ? res.value.dimensions : null;
}
