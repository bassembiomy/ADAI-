// src/engine/xbridges/MpcSolver.ts
import * as math from 'mathjs';

export interface MpcModel {
  A: number[][];
  B: number[][];
  C: number[][];
  D: number[][];
}

export interface MpcConfig {
  Np: number; // Prediction horizon
  Nc: number; // Control horizon
  Q: number[][]; // State weighting
  R: number[][]; // Input weighting
  u_min: number;
  u_max: number;
}

export class MpcSolver {
  private Sx: math.Matrix = math.matrix();
  private Su: math.Matrix = math.matrix();
  private H: math.Matrix = math.matrix();
  private L: number = 1; // Lipschitz constant (max eigenvalue of H)
  private model: MpcModel;
  private config: MpcConfig;

  constructor(model: MpcModel, config: MpcConfig) {
    this.model = model;
    this.config = config;
    this.formulatePredictionMatrices();
  }

  private formulatePredictionMatrices() {
    const { A, B, C } = this.model;
    const { Np, Nc, Q, R } = this.config;
    const nx = A.length;
    const nu = B[0].length;
    const ny = C.length;

    // Sx = [C*A; C*A^2; ...; C*A^Np]
    let Sx_rows: number[][] = [];
    let Ak = math.identity(nx) as math.Matrix;
    for (let i = 1; i <= Np; i++) {
      Ak = math.multiply(Ak, math.matrix(A)) as math.Matrix;
      const CAk = math.multiply(math.matrix(C), Ak) as math.Matrix;
      Sx_rows.push(...(CAk.toArray() as number[][]));
    }
    this.Sx = math.matrix(Sx_rows);

    // Su = [C*B 0 ...; C*A*B C*B ...; ...]
    let Su_rows: number[][] = Array.from({ length: Np * ny }, () => Array(Nc * nu).fill(0));
    for (let i = 0; i < Np; i++) {
      for (let j = 0; j < Nc; j++) {
        if (i >= j) {
          // Power of A is (i-j)
          let A_pow = math.identity(nx) as math.Matrix;
          for (let p = 0; p < (i - j); p++) {
            A_pow = math.multiply(A_pow, math.matrix(A)) as math.Matrix;
          }
          const CAB = math.multiply(math.multiply(math.matrix(C), A_pow), math.matrix(B)) as math.Matrix;
          const cab_arr = CAB.toArray() as number[][];
          
          for (let r = 0; r < ny; r++) {
            for (let c = 0; c < nu; c++) {
              Su_rows[i * ny + r][j * nu + c] = cab_arr[r][c];
            }
          }
        }
      }
    }
    this.Su = math.matrix(Su_rows);

    // Formulate Hessian H = 2 * (Su' * Qext * Su + Rext)
    const Qext = this.expandWeightingMatrix(Q, Np);
    const Rext = this.expandWeightingMatrix(R, Nc);

    const SuT = math.transpose(this.Su);
    const term1 = math.multiply(math.multiply(SuT, Qext), this.Su);
    this.H = math.multiply(2, math.add(term1, Rext)) as math.Matrix;

    // Estimate Lipschitz constant (spectral radius of H)
    // For simplicity in JS, we use Frobenius norm or a few power iterations
    this.L = (math.norm(this.H, 'fro') as number);
  }

  private expandWeightingMatrix(W: number[][], N: number): math.Matrix {
    const size = W.length;
    const expanded = Array.from({ length: size * N }, () => Array(size * N).fill(0));
    for (let i = 0; i < N; i++) {
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          expanded[i * size + r][i * size + c] = W[r][c];
        }
      }
    }
    return math.matrix(expanded);
  }

  public solve(x0: number[], reference: number[], u_prev_seq?: number[]): { u: number[], pred_y: number[] } {
    const { Np, Nc, u_min, u_max } = this.config;
    const ny = this.model.C.length;
    const nu = this.model.B[0].length;

    // reference is Np * ny length
    const Ref = math.matrix(reference);
    const x0_mat = math.matrix(x0);

    // Gradient f = 2 * Su' * Qext * (Sx * x0 - Ref)
    const Qext = this.expandWeightingMatrix(this.config.Q, Np);
    const error_term = math.subtract(math.multiply(this.Sx, x0_mat), Ref);
    const f = math.multiply(2, math.multiply(math.multiply(math.transpose(this.Su), Qext), error_term)) as math.Matrix;

    // Fast Gradient Method
    let U = u_prev_seq ? math.matrix(u_prev_seq) : math.zeros(Nc * nu) as math.Matrix;
    let Y = math.clone(U);
    let t = 1;

    const iterations = 20; // Fast real-time iterations
    for (let i = 0; i < iterations; i++) {
      const U_old = math.clone(U);
      
      // Gradient step: U = Y - (1/L) * (H*Y + f)
      const grad = math.add(math.multiply(this.H, Y), f);
      U = math.subtract(Y, math.multiply(1 / this.L, grad)) as math.Matrix;

      // Projection to [u_min, u_max]
      U = U.map(val => Math.max(u_min, Math.min(u_max, val as number)));

      // Momentum update
      const t_next = (1 + Math.sqrt(1 + 4 * t * t)) / 2;
      Y = math.add(U, math.multiply((t - 1) / t_next, math.subtract(U, U_old))) as math.Matrix;
      t = t_next;
    }

    const U_final = U.toArray() as number[];
    const first_u = U_final.slice(0, nu);

    // Predict Y = Sx * x0 + Su * U
    const PredY = math.add(math.multiply(this.Sx, x0_mat), math.multiply(this.Su, U)) as math.Matrix;

    return { 
      u: first_u, 
      pred_y: PredY.toArray() as number[]
    };
  }
}
