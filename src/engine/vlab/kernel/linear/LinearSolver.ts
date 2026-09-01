// src/engine/vlab/kernel/linear/LinearSolver.ts
export interface LinearSolver {
  factorize(A: number[][], n: number): boolean;
  solve(b: number[]): number[];
}
