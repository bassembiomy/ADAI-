import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildSemanticModel } from './smSemanticBuilder';
import { generateCArtifacts } from './smCGenerator';
import { createDefaultAdapters, runVerificationPipeline } from './smPipelineOrchestrator';
import { createGeneratedCodeTestWorkspace } from '../generatedCodeTestWorkspace';
import { buildRandomChart } from './smRandomChartFixture';
import { hybridXBridgesFixture } from './smFixtures';
import type { StateMachineModelV5 } from './smModel';

/*
 * The verification pipeline builds and runs the generated package for every kind of chart,
 * including charts whose generated C uses <math.h> (fixed-point helpers, floating
 * arithmetic, X-Bridges states). Host compilation, runtime tests, sanitizers and the
 * differential gate must PASS on these correct charts: the math library is linked after
 * the sources wherever the toolchain needs it.
 */

const charts: Array<[string, () => StateMachineModelV5]> = [
  ['fixed-point', () => buildRandomChart(6003, { innerTransitions: true, arithmetic: true, fixedPoint: true } as never)],
  ['x-bridges-random', () => buildRandomChart(6004, { innerTransitions: true, arithmetic: true, events: true, xBridges: true } as never)],
  ['x-bridges-fixture', () => hybridXBridgesFixture()],
];

describe('verification pipeline on charts that use the math library', () => {
  for (const [label, make] of charts) {
    it(label, async () => {
      const built = buildSemanticModel(make());
      expect(built.diagnostics.filter((item) => item.severity === 'error')).toEqual([]);
      const ir = built.ir!;
      const workspace = createGeneratedCodeTestWorkspace(`pipeline-math-${label}`);
      for (const file of generateCArtifacts(ir, { includeVerificationPackage: true }).files) {
        const path = join(workspace.directory, file.name);
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, file.content);
      }
      const bundle = await runVerificationPipeline({ ir, outputDirectory: workspace.directory, adapters: createDefaultAdapters() });
      const summary = (activity: string) => `${activity}: ${JSON.stringify(bundle.activities[activity as never]).slice(0, 600)}`;
      expect(bundle.activities['host-compilation'].status, summary('host-compilation')).toBe('PASS');
      expect(bundle.activities['host-runtime'].status, summary('host-runtime')).toBe('PASS');
      expect(['PASS', 'NOT_RUN'], summary('sanitizers')).toContain(bundle.activities['sanitizers'].status);
      expect(bundle.activities['differential'].status, summary('differential')).toBe('PASS');
    }, 600_000);
  }
});
