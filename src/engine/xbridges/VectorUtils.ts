// src/engine/xbridges/VectorUtils.ts
import * as math from 'mathjs';
import { XValue } from './types';

export class VectorUtils {
  /**
   * Identifies dimensions of a scalar, vector, or matrix.
   */
  static getDimensions(val: XValue): number[] {
    if (!Array.isArray(val)) return []; // Scalar
    if (!Array.isArray(val[0])) return [val.length]; // 1D Vector
    return [val.length, (val[0] as any[]).length]; // 2D Matrix (assuming uniform)
  }

  /**
   * Broadcasts a scalar to match the dimensions of a vector/matrix if needed.
   * Performs element-wise operations with broadcasting support using math.js.
   * math.js automatically handles broadcasting and dimension checking for basic ops.
   */
  static applyElementWise(a: XValue, b: XValue, opName: 'add' | 'subtract' | 'multiply' | 'divide' | 'pow' | 'mod'): XValue {
    if (typeof a === 'object' && a !== null && !Array.isArray(a)) {
      const result: any = {};
      const mathOp = (math as any)[opName] || math.add;
      for (const key in a as any) {
        const valA = (a as any)[key];
        const valB = (typeof b === 'object' && b !== null && key in (b as any)) ? (b as any)[key] : b;
        if (typeof valA === 'object' && valA !== null) {
          result[key] = this.applyElementWise(valA, valB, opName);
        } else {
          if (opName === 'multiply') {
            result[key] = (Number(valA) || 0) * (Number(valB) || 0);
          } else if (opName === 'add') {
            result[key] = (Number(valA) || 0) + (Number(valB) || 0);
          } else {
            result[key] = mathOp(Number(valA) || 0, Number(valB) || 0);
          }
        }
      }
      return result;
    }
    if (typeof b === 'object' && b !== null && !Array.isArray(b)) {
      const result: any = {};
      const mathOp = (math as any)[opName] || math.add;
      for (const key in b as any) {
        const valB = (b as any)[key];
        const valA = (typeof a === 'object' && a !== null && key in (a as any)) ? (a as any)[key] : a;
        if (typeof valB === 'object' && valB !== null) {
          result[key] = this.applyElementWise(valA, valB, opName);
        } else {
          if (opName === 'multiply') {
            result[key] = (Number(valA) || 0) * (Number(valB) || 0);
          } else if (opName === 'add') {
            result[key] = (Number(valA) || 0) + (Number(valB) || 0);
          } else {
            result[key] = mathOp(Number(valA) || 0, Number(valB) || 0);
          }
        }
      }
      return result;
    }

    try {
      // Use math.js for robust element-wise operations with broadcasting
      const mathOp = (math as any)[opName] || math.add;
      if (opName === 'multiply' && Array.isArray(a) && Array.isArray(b)) {
        // math.multiply does dot/matrix mult for arrays. For element-wise, we need dotMultiply.
        return math.dotMultiply(a as any, b as any) as any;
      }
      if (opName === 'divide' && Array.isArray(a) && Array.isArray(b)) {
        return math.dotDivide(a as any, b as any) as any;
      }
      if (opName === 'pow' && (Array.isArray(a) || Array.isArray(b))) {
        return math.dotPow(a as any, b as any) as any;
      }
      
      return mathOp(a as any, b as any) as any;
    } catch (e: any) {
      throw new Error(`Broadcast Error in ${opName}: ${e.message}`);
    }
  }

  static applyUnaryElementWise(a: XValue, opName: 'unaryMinus' | 'abs' | 'sign'): XValue {
     if (typeof a === 'object' && a !== null && !Array.isArray(a)) {
       const result: any = {};
       const mathOp = (math as any)[opName] || math.abs;
       for (const key in a as any) {
         const val = (a as any)[key];
         if (typeof val === 'object' && val !== null) {
           result[key] = this.applyUnaryElementWise(val, opName);
         } else {
           result[key] = mathOp(Number(val) || 0);
         }
       }
       return result;
     }

     try {
        const mathOp = (math as any)[opName] || math.abs;
        return mathOp(a as any) as any;
     } catch (e: any) {
        throw new Error(`Unary Error in ${opName}: ${e.message}`);
     }
  }

  // --- Reductions ---
  static sum(arr: XValue): number {
    return math.sum(arr as any);
  }

  static mean(arr: XValue): number {
    return math.mean(arr as any);
  }
  
  static max(arr: XValue): number {
      return math.max(arr as any);
  }

  static min(arr: XValue): number {
      return math.min(arr as any);
  }

  // --- Linear Algebra ---
  static matMul(a: XValue, b: XValue): XValue {
    try {
      // math.multiply performs matrix multiplication when given matrices
      return math.multiply(a as any, b as any) as any;
    } catch (e: any) {
      throw new Error(`Matrix Multiply Error: ${e.message}`);
    }
  }

  static transpose(a: XValue): XValue {
    try {
      return math.transpose(a as any) as any;
    } catch (e: any) {
      throw new Error(`Transpose Error: ${e.message}`);
    }
  }
  
  static inverse(a: XValue): XValue {
    try {
      return math.inv(a as any) as any;
    } catch(e: any) {
      throw new Error(`Matrix Inverse Error: ${e.message}`);
    }
  }
  
  static determinant(a: XValue): number {
      try {
          return math.det(a as any);
      } catch (e:any) {
          throw new Error(`Determinant Error: ${e.message}`);
      }
  }

  // --- Utilities ---
  static flatten(arr: XValue): number[] {
    return math.flatten(arr as any) as number[];
  }

  static integrateState(state: any, deriv: any, factor: number): any {
    if (typeof state === 'boolean') {
      return state;
    }
    if (typeof state === 'number') {
      return state + (Number(deriv) || 0) * factor;
    }
    if (Array.isArray(state)) {
      return state.map((val, idx) => {
        const d = Array.isArray(deriv) 
          ? deriv[idx] 
          : (typeof deriv === 'object' && deriv !== null ? (deriv[idx] ?? 0) : deriv);
        return this.integrateState(val, d, factor);
      });
    }
    if (typeof state === 'object' && state !== null) {
      const nextState = { ...state };
      if (typeof deriv === 'object' && deriv !== null && !Array.isArray(deriv)) {
        for (const key in deriv) {
          if (key in nextState) {
            nextState[key] = this.integrateState(state[key], deriv[key], factor);
          }
        }
      } else if (Array.isArray(deriv)) {
        const keys = Object.keys(state);
        deriv.forEach((d, idx) => {
          const key = keys[idx];
          if (key !== undefined) {
            nextState[key] = this.integrateState(state[key], d, factor);
          }
        });
      } else {
        const keys = Object.keys(state);
        keys.forEach(key => {
          nextState[key] = this.integrateState(state[key], deriv, factor);
        });
      }
      return nextState;
    }
    return state;
  }

  static zeroLike(val: any): any {
    if (typeof val === 'number') {
      return 0;
    }
    if (typeof val === 'boolean') {
      return false;
    }
    if (Array.isArray(val)) {
      return val.map(v => this.zeroLike(v));
    }
    if (typeof val === 'object' && val !== null) {
      const res: any = {};
      for (const key in val) {
        res[key] = this.zeroLike(val[key]);
      }
      return res;
    }
    return 0;
  }

  static identity(n: number): number[][] {
    try {
      const size = Math.max(1, Math.floor(n));
      const mat = math.identity(size) as any;
      return (mat.toArray ? mat.toArray() : mat) as number[][];
    } catch (e: any) {
      throw new Error(`Identity Matrix Error: ${e.message}`);
    }
  }

  static diag(a: XValue): XValue {
    try {
      if (!Array.isArray(a)) {
        return [[Number(a) || 0]];
      }
      const res = math.diag(a as any) as any;
      return (res && typeof res.toArray === 'function') ? res.toArray() : res;
    } catch (e: any) {
      throw new Error(`Diag Error: ${e.message}`);
    }
  }

  static solve(a: XValue, b: XValue): XValue {
    try {
      const res = math.lusolve(a as any, b as any) as any;
      return (res && typeof res.toArray === 'function') ? res.toArray() : res;
    } catch (e: any) {
      throw new Error(`Solve Error: ${e.message}`);
    }
  }

  static concat(a: XValue, b: XValue, axis: number): XValue {
    try {
      const res = math.concat(a as any, b as any, axis) as any;
      return (res && typeof res.toArray === 'function') ? res.toArray() : res;
    } catch (e: any) {
      throw new Error(`Concatenation Error: ${e.message}`);
    }
  }

  static submatrix(a: XValue, rowStart: number, rowEnd: number, colStart: number, colEnd: number): XValue {
    try {
      if (!Array.isArray(a)) {
        throw new Error("Input must be a vector or matrix");
      }
      if (!Array.isArray(a[0])) {
        const start = Math.max(0, rowStart);
        const end = Math.min(a.length - 1, rowEnd);
        return a.slice(start, end + 1) as any;
      }
      const mat = a as any[][];
      const rStart = Math.max(0, rowStart);
      const rEnd = Math.min(mat.length - 1, rowEnd);
      const cStart = Math.max(0, colStart);
      const cEnd = Math.min(mat[0].length - 1, colEnd);
      
      const result: any[][] = [];
      for (let i = rStart; i <= rEnd; i++) {
        result.push(mat[i].slice(cStart, cEnd + 1));
      }
      return result;
    } catch (e: any) {
      throw new Error(`Submatrix Extraction Error: ${e.message}`);
    }
  }

  /**
   * Parses a MATLAB-style vector/matrix string or JSON string into a number, array, or matrix.
   * e.g., "[1 2 3 4]" -> [1, 2, 3, 4], "[1 2; 3 4]" -> [[1, 2], [3, 4]]
   */
  static parseMatlabArray(val: any): any {
    if (typeof val !== 'string') return val;
    const trimmed = val.trim();
    if (trimmed === '') return '';

    // Check if it is a number
    if (!isNaN(Number(trimmed))) {
      return Number(trimmed);
    }

    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      // 1. Try direct JSON parse first (handles valid JSON arrays like [[1, 2], [3, 4]] or [[1], [0.5]])
      try {
        const jsonParsed = JSON.parse(trimmed);
        if (Array.isArray(jsonParsed)) {
          return jsonParsed;
        }
      } catch {
        // Not standard JSON array format, fall back to MATLAB array syntax parsing below
      }

      // 2. Parse MATLAB-style arrays (e.g. "[1 2 3]" or "[1 2; 3 4]")
      const content = trimmed.slice(1, -1).trim();
      if (content === '') return [];

      if (content.includes(';')) {
        // Matrix: rows separated by semicolons
        const rows = content.split(';');
        const matrix = rows
          .map((row) => {
            const parts = row.trim().split(/[\s,]+/).filter(Boolean);
            return parts.map((p) => Number(p)).filter((n) => !isNaN(n));
          })
          .filter((r: number[]) => r.length > 0);
        return matrix;
      } else {
        // 1D Vector: elements separated by spaces and/or commas
        const parts = content.split(/[\s,]+/).filter(Boolean);
        const arr = parts.map((p) => Number(p)).filter((n) => !isNaN(n));
        return arr;
      }
    }

    // Fallback to JSON parse directly for objects or primitives
    try {
      return JSON.parse(trimmed);
    } catch {
      return val;
    }
  }
}

