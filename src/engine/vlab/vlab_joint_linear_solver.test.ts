import { expect, it } from 'vitest';
import { SparseLinearSolver } from './SparseLinearSolver';
import { ImplicitSolver } from './ImplicitSolver';
it('retains independent equations with very different coefficient scales', () => {
  expect(
    SparseLinearSolver.solveRankDeficient(
      [
        [1, 1e8],
        [0, 1],
      ],
      [1, 0],
    ),
  ).toEqual([1, 0]);
});
it('solves a consistent redundant joint Jacobian without moving its free coordinate', () => {
  const x = SparseLinearSolver.solveRankDeficient(
    [
      [1, 0, 0],
      [0, 2, 1e-10],
      [0, 4, 0],
    ],
    [3, 8, 16],
  );
  [3, 4, 0].forEach((value, i) => expect(x[i]).toBeCloseTo(value, 12));
});
it('retains a free pose when measurement equations can update their output instead', () => {
  expect(
    SparseLinearSolver.solveRankDeficient(
      [
        [1, -1],
        [0, 0],
      ],
      [4, 0],
      [0],
    ),
  ).toEqual([0, -4]);
});
it('does not accept inconsistent joint residuals', () => {
  const solver = new ImplicitSolver();
  solver.configure({ allowUnderdetermined: true, maxIterations: 2 });
  expect(() =>
    solver.solve(() => [1e-4], [0], {
      dt: 0.01,
      time: 0,
      prevStates: [0],
      states: [0],
      parameters: {},
      stateDerivatives: [],
    }),
  ).toThrow(/did not converge/);
});
