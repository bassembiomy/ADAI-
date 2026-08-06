import type { XBNumericType } from './xbNumeric';

export interface MatrixInverseResult {
  readonly matrix: number[][];
  readonly fault: boolean;
}

export const PIVOT_THRESHOLD_F32 = 1e-6;

export function matrixMultiply(
  a: readonly (readonly number[])[],
  b: readonly (readonly number[])[],
  rowsA: number,
  colsA: number,
  colsB: number,
  _type: XBNumericType = { kind: 'float32' },
): number[][] {
  const result: number[][] = Array.from({ length: rowsA }, () => Array.from({ length: colsB }, () => 0));
  for (let r = 0; r < rowsA; r++) {
    for (let c = 0; c < colsB; c++) {
      let sum = 0;
      for (let k = 0; k < colsA; k++) {
        sum += a[r][k] * b[k][c];
      }
      result[r][c] = sum;
    }
  }
  return result;
}

export function matrixAdd(
  a: readonly (readonly number[])[],
  b: readonly (readonly number[])[],
  rows: number,
  cols: number,
  _type: XBNumericType = { kind: 'float32' },
): number[][] {
  const result: number[][] = Array.from({ length: rows }, () => Array.from({ length: cols }, () => 0));
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      result[r][c] = a[r][c] + b[r][c];
    }
  }
  return result;
}

export function matrixTranspose(
  a: readonly (readonly number[])[],
  rows: number,
  cols: number,
): number[][] {
  const result: number[][] = Array.from({ length: cols }, () => Array.from({ length: rows }, () => 0));
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      result[c][r] = a[r][c];
    }
  }
  return result;
}

export function matrixInverseGaussJordan(
  a: readonly (readonly number[])[],
  n: number,
  type: XBNumericType = { kind: 'float32' },
): MatrixInverseResult {
  const threshold = type.kind === 'fixed'
    ? Math.pow(2, -type.fractionLength)
    : PIVOT_THRESHOLD_F32;

  // Augment matrix with N-by-N Identity
  const aug: number[][] = Array.from({ length: n }, (_, r) => [
    ...a[r],
    ...Array.from({ length: n }, (_, c) => (r === c ? 1 : 0)),
  ]);

  for (let i = 0; i < n; i++) {
    // Partial pivoting: find largest pivot in column i at or below row i
    let maxRow = i;
    let maxVal = Math.abs(aug[i][i]);
    for (let r = i + 1; r < n; r++) {
      const val = Math.abs(aug[r][i]);
      if (val > maxVal) {
        maxVal = val;
        maxRow = r;
      }
    }

    if (maxVal < threshold) {
      return {
        matrix: Array.from({ length: n }, () => Array.from({ length: n }, () => 0)),
        fault: true,
      };
    }

    // Swap pivot row
    if (maxRow !== i) {
      const temp = aug[i];
      aug[i] = aug[maxRow];
      aug[maxRow] = temp;
    }

    // Scale pivot row so pivot element becomes 1
    const pivot = aug[i][i];
    for (let c = 0; c < 2 * n; c++) {
      aug[i][c] /= pivot;
    }

    // Eliminate column elements in all other rows
    for (let r = 0; r < n; r++) {
      if (r !== i) {
        const factor = aug[r][i];
        for (let c = 0; c < 2 * n; c++) {
          aug[r][c] -= factor * aug[i][c];
        }
      }
    }
  }

  // Extract right N-by-N augmented matrix as inverse
  const inv: number[][] = Array.from({ length: n }, (_, r) =>
    aug[r].slice(n, 2 * n),
  );

  return { matrix: inv, fault: false };
}

/** Generate strict C99 code helper for static matrix inverse using Gauss-Jordan. */
export function renderCMatrixInverseGaussJordan(
  inputVar: string,
  outputVar: string,
  faultVar: string,
  n: number,
  threshold = PIVOT_THRESHOLD_F32,
): string[] {
  return [
    `    {`,
    `        double aug_${outputVar}[${n}][${2 * n}];`,
    `        for (uint32_t r = 0U; r < ${n}U; ++r) {`,
    `            for (uint32_t c = 0U; c < ${n}U; ++c) {`,
    `                aug_${outputVar}[r][c] = (double)(${inputVar}[r * ${n}U + c]);`,
    `                aug_${outputVar}[r][c + ${n}U] = (r == c) ? 1.0 : 0.0;`,
    `            }`,
    `        }`,
    `        bool inv_failed = false;`,
    `        for (uint32_t i = 0U; i < ${n}U; ++i) {`,
    `            uint32_t maxRow = i;`,
    `            double maxVal = fabs(aug_${outputVar}[i][i]);`,
    `            for (uint32_t r = i + 1U; r < ${n}U; ++r) {`,
    `                double val = fabs(aug_${outputVar}[r][i]);`,
    `                if (val > maxVal) { maxVal = val; maxRow = r; }`,
    `            }`,
    `            if (maxVal < ${threshold}) { inv_failed = true; break; }`,
    `            if (maxRow != i) {`,
    `                for (uint32_t c = 0U; c < ${2 * n}U; ++c) {`,
    `                    double tmp = aug_${outputVar}[i][c];`,
    `                    aug_${outputVar}[i][c] = aug_${outputVar}[maxRow][c];`,
    `                    aug_${outputVar}[maxRow][c] = tmp;`,
    `                }`,
    `            }`,
    `            double pivot = aug_${outputVar}[i][i];`,
    `            for (uint32_t c = 0U; c < ${2 * n}U; ++c) aug_${outputVar}[i][c] /= pivot;`,
    `            for (uint32_t r = 0U; r < ${n}U; ++r) {`,
    `                if (r != i) {`,
    `                    double factor = aug_${outputVar}[r][i];`,
    `                    for (uint32_t c = 0U; c < ${2 * n}U; ++c) aug_${outputVar}[r][c] -= factor * aug_${outputVar}[i][c];`,
    `                }`,
    `            }`,
    `        }`,
    `        if (inv_failed) {`,
    `            ${faultVar} = true;`,
    `        } else {`,
    `            for (uint32_t r = 0U; r < ${n}U; ++r) {`,
    `                for (uint32_t c = 0U; c < ${n}U; ++c) {`,
    `                    ${outputVar}[r * ${n}U + c] = aug_${outputVar}[r][c + ${n}U];`,
    `                }`,
    `            }`,
    `        }`,
    `    }`,
  ];
}
