// Child-process probe for xbEngine.test.ts (XBV-036): a batch variable-step run with a Step event inside the interval.
// Run in a separate process with a timeout, because a hang cannot be interrupted inside the test runner.
// Prints the integral of Step(stepTime) over [0, 1] as JSON.
import { XbridgesEngine } from '../../XbridgesEngine';
import { Solvers } from '../../Solvers';
import { buildModel } from '../../testkit';

const [solver, stepTime] = [process.argv[2], Number(process.argv[3])];
const e = new XbridgesEngine(buildModel({
  blocks: [{ id: 's', type: 'Step', params: { stepTime, initialValue: 0, finalValue: 1 } }, { id: 'i', type: 'Integrator', params: { initialCondition: 0 } }],
  wires: ['s.out -> i.in'],
}));
Solvers.runFixedStep(e, { solver, startTime: 0, stopTime: 1, fixedStep: 0.1, relTol: 1e-8, absTol: 1e-10 } as never);
process.stdout.write(JSON.stringify({ y: Number(e.getSignalValue('i', 'out')), errors: e.diagnostics.filter((d) => d.severity === 'error').map((d) => d.code) }));
