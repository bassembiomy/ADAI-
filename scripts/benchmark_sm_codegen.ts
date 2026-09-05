import { performance } from 'node:perf_hooks';
import { probeC99Toolchain } from '../src/utils/stateMachine/smCHarness';
import { generateCArtifacts } from '../src/utils/stateMachine/smCGenerator';
import {
  flatOrFixture,
  nestedAndFixture,
} from '../src/utils/stateMachine/smFixtures';
import { createRuntime, initializeRuntime, stepRuntime } from '../src/utils/stateMachine/smInterpreter';
import type { StateMachineModelV4 } from '../src/utils/stateMachine/smModel';
import { buildSemanticModel } from '../src/utils/stateMachine/smSemanticBuilder';
import type { SemanticModel } from '../src/utils/stateMachine/smSemanticModel';
import { XB_EXECUTABLE_C_CASES } from '../src/utils/stateMachine/xbCConformanceCases';

interface Distribution {
  samples: number[];
  median: number;
  p95: number;
  minimum: number;
  maximum: number;
  coefficientOfVariation: number;
}

if (process.argv.includes('--help')) {
  console.log('Usage: npm run benchmark:sm-codegen -- [--quick] [--compiler <path>]');
  console.log('Emits a repeatable JSON performance baseline to stdout.');
  process.exit(0);
}

const compilerIndex = process.argv.indexOf('--compiler');
if (compilerIndex >= 0 && !process.argv[compilerIndex + 1]) {
  throw new Error('--compiler requires an executable name or path');
}
const compiler = compilerIndex >= 0 ? process.argv[compilerIndex + 1] : undefined;
const quick = process.argv.includes('--quick');
const repetitions = quick ? 3 : 7;
const ticksPerSample = quick ? 200 : 1_000;
const seed = 0x5eed1234;

const summarize = (samples: number[]): Distribution => {
  const sorted = [...samples].sort((left, right) => left - right);
  const mean = samples.reduce((sum, value) => sum + value, 0) / samples.length;
  const variance = samples.reduce((sum, value) => sum + ((value - mean) ** 2), 0)
    / samples.length;
  const at = (quantile: number): number =>
    sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * quantile) - 1)];
  return {
    samples,
    median: at(0.5),
    p95: at(0.95),
    minimum: sorted[0],
    maximum: sorted[sorted.length - 1],
    coefficientOfVariation: mean === 0 ? 0 : Math.sqrt(variance) / mean,
  };
};

const seededGraph = (count: number): StateMachineModelV4 => {
  const model = flatOrFixture();
  let random = seed ^ count;
  const next = (): number => {
    random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
    return random;
  };
  const template = model.states[0];
  model.states = Array.from({ length: count }, (_, index) => ({
    ...structuredClone(template),
    id: 'seeded_state_' + index,
    name: 'Seeded state ' + index,
    autostart: index === 0,
    priority: index + 1,
    during: 'total = total + ' + ((next() % 17) + 1) + ';',
  }));
  model.transitions = [];
  model.layers = [{
    id: 'root',
    name: 'root',
    parentStateId: null,
    decomposition: 'OR',
    stateIds: model.states.map((state) => state.id),
    transitionIds: [],
    junctionIds: [],
  }];
  return model;
};

const conformanceModel = (id: string): StateMachineModelV4 =>
  structuredClone(XB_EXECUTABLE_C_CASES[id].fixture.model);

const withSubsteps = (substeps: 1 | 5 | 50): StateMachineModelV4 => {
  const model = conformanceModel('T14-C99-CORE-DIRECT');
  for (const state of model.states) {
    if (state.xBridgesModel) {
      state.xBridgesModel.solver = {
        kind: 'euler',
        stepSeconds: model.tickMs / 1_000 / substeps,
      };
    }
  }
  return model;
};

const delayModel = (): StateMachineModelV4 => {
  const model = conformanceModel('T14-C99-STATEFUL');
  const node = model.states
    .flatMap((state) => state.xBridgesModel?.nodes ?? [])
    .find((candidate) => candidate.id === 'ud1');
  if (!node) throw new Error('Stateful benchmark fixture is missing ud1.');
  node.type = 'DELAY';
  node.parameters = { ...node.parameters, delay_length: 1, initial_condition: -1 };
  return model;
};

const cases = [
  ['seeded-small-8', 'scalar-chain', () => seededGraph(8)],
  ['seeded-medium-32', 'scalar-chain', () => seededGraph(32)],
  ['seeded-large-128', 'scalar-chain', () => seededGraph(128)],
  ['hierarchy-parallel', 'hierarchy/parallel', nestedAndFixture],
  ['vector-matrix', 'vector/matrix', () => conformanceModel('T10-C99-VECTOR-MATRIX')],
  ['pid', 'PID/DELAY', () => conformanceModel('T10-C99-PID-BASIC')],
  ['delay', 'PID/DELAY', delayModel],
  ['subsystem-gain-sum', 'subsystem', () => conformanceModel('subsystem_gain_sum')],
  ['substeps-1', 'solver-substeps', () => withSubsteps(1)],
  ['substeps-5', 'solver-substeps', () => withSubsteps(5)],
  ['substeps-50', 'solver-substeps', () => withSubsteps(50)],
] as const;

const build = (model: StateMachineModelV4): SemanticModel => {
  const result = buildSemanticModel(model);
  const errors = result.diagnostics.filter((item) => item.severity === 'error');
  if (!result.ir || errors.length > 0) {
    throw new Error(errors.map((item) => item.code + ': ' + item.message).join('; '));
  }
  return result.ir;
};

const time = (operation: () => number) => {
  const samples: number[] = [];
  let checksum = 0;
  for (let repetition = 0; repetition < repetitions; repetition += 1) {
    const started = performance.now();
    checksum += operation();
    samples.push(performance.now() - started);
  }
  return { distribution: summarize(samples), checksum };
};

const timeTicks = (ir: SemanticModel) => {
  const samples: number[] = [];
  let checksum = 0;
  for (let repetition = 0; repetition < repetitions; repetition += 1) {
    const runtime = createRuntime(ir);
    initializeRuntime(runtime);
    for (let tick = 0; tick < 100; tick += 1) stepRuntime(runtime, ir.tickMs);
    const started = performance.now();
    for (let tick = 0; tick < ticksPerSample; tick += 1) {
      const frame = stepRuntime(runtime, ir.tickMs);
      checksum += frame.sequence + frame.activeStateIds.length;
    }
    samples.push(((performance.now() - started) * 1_000_000) / ticksPerSample);
  }
  return { distribution: summarize(samples), checksum };
};

const toolchain = probeC99Toolchain({ compiler });
const results = cases.map(([name, category, factory]) => {
  const semanticBuild = time(() => {
    const ir = build(factory());
    return Object.keys(ir.states).length + Object.keys(ir.variables).length;
  });
  const ir = build(factory());
  const generation = time(() => generateCArtifacts(ir).files
    .reduce((sum, file) => sum + file.content.length, 0));
  const tick = timeTicks(ir);
  const sourceSize = generateCArtifacts(ir).files
    .filter((file) => file.name.endsWith('.c') || file.name.endsWith('.h'))
    .reduce((sum, file) => sum + Buffer.byteLength(file.content), 0);
  return {
    name,
    category,
    semanticBuildMs: semanticBuild.distribution,
    generationMs: generation.distribution,
    typescriptProductionTickNs: tick.distribution,
    generatedSourceBytes: { production: sourceSize, trace: sourceSize },
    observables: {
      semanticBuild: semanticBuild.checksum,
      generation: generation.checksum,
      typescriptTick: tick.checksum,
    },
    compiledC: toolchain.status === 'BLOCKED' ? {
      status: 'BLOCKED',
      reason: toolchain.phase + ': ' + toolchain.detail,
      productionTickNs: null,
      traceTickNs: null,
      sections: null,
      instanceBytes: null,
      stackReport: null,
    } : {
      status: 'NOT_MEASURED',
      reason: 'Compiled-C measurement runner is deferred; see baseline concerns.',
      productionTickNs: null,
      traceTickNs: null,
      sections: null,
      instanceBytes: null,
      stackReport: null,
    },
  };
});

console.log(JSON.stringify({
  schemaVersion: 1,
  recordedAt: new Date().toISOString(),
  machine: { platform: process.platform, arch: process.arch, node: process.version },
  configuration: {
    seed,
    quick,
    repetitions,
    warmupTicks: 100,
    ticksPerSample,
    compilerSelection: toolchain,
    timingNotes: [
      'Compilation, trace serialization, and differential comparison are outside TS tick timing.',
      'Each timed batch contributes to an observable checksum.',
      'Production and trace source sizes are recorded separately; trace is compile-time guarded.',
    ],
  },
  results,
}, null, 2));
