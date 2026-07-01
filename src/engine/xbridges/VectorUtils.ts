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
      if (opName === 'pow' && Array.isArray(a) && Array.isArray(b)) {
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
    if (typeof state === 'number') {
      return state + (Number(deriv) || 0) * factor;
    }
    if (Array.isArray(state)) {
      return state.map((val, idx) => {
        const d = Array.isArray(deriv) ? deriv[idx] : deriv;
        return val + (Number(d) || 0) * factor;
      });
    }
    if (typeof state === 'object' && state !== null) {
      const nextState = { ...state };
      const keys = Object.keys(state);
      if (Array.isArray(deriv)) {
        deriv.forEach((d, idx) => {
          const key = keys[idx];
          if (key !== undefined) {
            nextState[key] = (Number(state[key]) || 0) + (Number(d) || 0) * factor;
          }
        });
      } else if (typeof deriv === 'object' && deriv !== null) {
        for (const key in deriv) {
          if (key in nextState) {
            nextState[key] = (Number(state[key]) || 0) + (Number(deriv[key]) || 0) * factor;
          }
        }
      } else {
        keys.forEach(key => {
          nextState[key] = (Number(state[key]) || 0) + (Number(deriv) || 0) * factor;
        });
      }
      return nextState;
    }
    return state;
  }
}
