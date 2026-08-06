import { type XBNumericFault, type XBNumericType } from './xbSemanticModel';
import { convertValue } from './xbInterpreter';

export interface MatrixResult {
  matrix: number[][];
  fault: boolean;
}

const q = (value: number, type: XBNumericType, faults: XBNumericFault[]): number => {
  return Number(convertValue(value, type, faults));
};

export function matrixMultiply(
  a: readonly (readonly number[])[],
  b: readonly (readonly number[])[],
  type: XBNumericType,
  faults: XBNumericFault[] = []
): number[][] {
  const m = a.length;
  const n = a[0]?.length || 0;
  const p = b[0]?.length || 0;
  
  if (b.length !== n) throw new Error('Dimension mismatch for matrix multiplication');
  
  const result: number[][] = [];
  for (let i = 0; i < m; i++) {
    result[i] = [];
    for (let j = 0; j < p; j++) {
      let sum = 0;
      for (let k = 0; k < n; k++) {
        // Accumulate in higher precision then quantize at every multiply-accumulate step
        const product = q(a[i]![k]! * b[k]![j]!, type, faults);
        sum = q(sum + product, type, faults);
      }
      result[i]![j] = sum;
    }
  }
  return result;
}

export function matrixAdd(
  a: readonly (readonly number[])[],
  b: readonly (readonly number[])[],
  type: XBNumericType,
  faults: XBNumericFault[] = []
): number[][] {
  const m = a.length;
  const n = a[0]?.length || 0;
  
  const result: number[][] = [];
  for (let i = 0; i < m; i++) {
    result[i] = [];
    for (let j = 0; j < n; j++) {
      result[i]![j] = q(a[i]![j]! + b[i]![j]!, type, faults);
    }
  }
  return result;
}

export function matrixSubtract(
  a: readonly (readonly number[])[],
  b: readonly (readonly number[])[],
  type: XBNumericType,
  faults: XBNumericFault[] = []
): number[][] {
  const m = a.length;
  const n = a[0]?.length || 0;
  
  const result: number[][] = [];
  for (let i = 0; i < m; i++) {
    result[i] = [];
    for (let j = 0; j < n; j++) {
      result[i]![j] = q(a[i]![j]! - b[i]![j]!, type, faults);
    }
  }
  return result;
}

export function matrixTranspose(
  a: readonly (readonly number[])[]
): number[][] {
  const m = a.length;
  const n = a[0]?.length || 0;
  
  const result: number[][] = [];
  for (let i = 0; i < n; i++) {
    result[i] = [];
    for (let j = 0; j < m; j++) {
      result[i]![j] = a[j]![i]!;
    }
  }
  return result;
}

export function matrixInverseGaussJordan(
  a: readonly (readonly number[])[],
  type: XBNumericType,
  faults: XBNumericFault[] = []
): MatrixResult {
  const n = a.length;
  if (n === 0 || a[0]?.length !== n) throw new Error('Matrix must be square');
  
  // Clone and augment with identity matrix
  const mat: number[][] = [];
  for (let i = 0; i < n; i++) {
    mat[i] = [];
    for (let j = 0; j < n; j++) mat[i]![j] = a[i]![j]!;
    for (let j = 0; j < n; j++) mat[i]![j + n] = i === j ? q(1, type, faults) : 0;
  }
  
  const eps = type.kind === 'float32' || type.kind === 'float64'
    ? 1e-6
    : Math.pow(2, -type.fractionalBits);
    
  for (let i = 0; i < n; i++) {
    // Partial pivoting
    let maxRow = i;
    let maxVal = Math.abs(mat[i]![i]!);
    for (let k = i + 1; k < n; k++) {
      const val = Math.abs(mat[k]![i]!);
      if (val > maxVal) {
        maxVal = val;
        maxRow = k;
      }
    }
    
    if (maxVal < eps) {
      return { matrix: a, fault: true };
    }
    
    // Swap rows
    if (maxRow !== i) {
      const temp = mat[i]!;
      mat[i] = mat[maxRow]!;
      mat[maxRow] = temp;
    }
    
    // Scale row
    const pivot = mat[i]![i]!;
    for (let j = i; j < 2 * n; j++) {
      mat[i]![j] = q(mat[i]![j]! / pivot, type, faults);
    }
    
    // Eliminate other rows
    for (let k = 0; k < n; k++) {
      if (k !== i) {
        const factor = mat[k]![i]!;
        for (let j = i; j < 2 * n; j++) {
          mat[k]![j] = q(mat[k]![j]! - q(factor * mat[i]![j]!, type, faults), type, faults);
        }
      }
    }
  }
  
  // Extract inverse
  const inverse: number[][] = [];
  for (let i = 0; i < n; i++) {
    inverse[i] = [];
    for (let j = 0; j < n; j++) {
      inverse[i]![j] = mat[i]![j + n]!;
    }
  }
  
  return { matrix: inverse, fault: false };
}
