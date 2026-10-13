import type { BlockCharacteristics } from '../../types';

/** How every V-Lab block is evaluated in the desktop simulation (DAE assembly + implicit step). */
export const SIM_DAE =
  'V-Lab blocks are not scheduled one after another. When the simulation starts, DAEAssembler.assemble() ' +
  'flattens subsystems, merges all wired ports into physical nodes (union-find), allocates one across-variable ' +
  '(pressure, temperature, speed, voltage or signal value) per node, one branch (through) variable per component ' +
  'branch and one variable per internal state, and builds a single residual F(x, dx/dt, t) = 0. Its rows are the ' +
  'component equations plus one equation per node: Kirchhoff conservation (sum of through variables = 0), a ' +
  'reference constraint for ground-type blocks, or the signal-sum rule for signal nodes. VLabPhysicsEngine.simulateStep() ' +
  'then advances the whole vector with an implicit step (BDF order 1/2, promoted to SDIRK-3 on convergence trouble) whose ' +
  'nonlinear system is solved by Newton iteration with a numerical Jacobian (ImplicitSolver), taking sub-steps inside ' +
  'each UI step. There is no per-block execution order, no sample time and no direct-feedthrough sorting; ordering is ' +
  'resolved simultaneously by the solver.';

/** Statement about code generation for any V-Lab block. */
export const EMB_NONE =
  'Not code-generated. V-Lab is a desktop simulation environment only: src/engine/hil/hilCodeGenerator.ts, ' +
  'src/engine/embedded/* and the state-machine/X-Bridges C generators contain no reference to V-Lab, ' +
  'DAEAssembler or the V-Lab block library, so no C source is produced from a V-Lab diagram and this block ' +
  'cannot appear in a HIL target pack or embedded layer. To obtain embedded code for the behaviour, reimplement it ' +
  'as an X-Bridges model or a state machine.';

export function acausal(domain: string, states: string, extra = ''): BlockCharacteristics {
  return {
    directFeedthrough: 'n/a',
    sampleTime: 'Acausal (DAE), continuous time; solved implicitly with the global V-Lab step',
    states,
    zeroCrossing: false,
    dataTypes: domain + (extra ? '; ' + extra : ''),
    codeGeneration: 'Simulation only (no C code generation)',
  };
}

export function signalChar(states: string, dataTypes: string): BlockCharacteristics {
  return {
    directFeedthrough: true,
    sampleTime: 'Continuous (algebraic signal path inside the global DAE), no sample time',
    states,
    zeroCrossing: false,
    dataTypes,
    codeGeneration: 'Simulation only (no C code generation)',
  };
}

export function placeSteps(name: string, domain: string, extra: string[]): string[] {
  return [
    `Open the V-Lab workspace and find "${name}" in the "${domain}" palette group (or use quick search); drag it onto the canvas.`,
    ...extra,
    'Click RUN SIMULATION in the top bar. The diagram is assembled into one DAE system and integrated until the End Time field (or the Solver Configuration stopTime) is reached; leave End Time empty for an unlimited run and use PAUSE/STOP to control it.',
  ];
}
