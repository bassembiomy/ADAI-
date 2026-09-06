import { describe, expect, it } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { flatOrFixture } from './smFixtures';
import { buildSemanticModel } from './smSemanticBuilder';
import {
  runVerificationPipeline,
  type SMVerificationAdapters,
  type SMVerificationRequest,
} from './smPipelineOrchestrator';
import type { ActivityEvidence } from './smVerificationEvidence';
import type { AnalysisEvidenceDetails } from './smAnalysisRunner';
import type { TargetCompileDetails } from './smTargetCompileRunner';

describe('smPipelineOrchestrator gate-order and status truth-table', () => {
  const makeMockPassActivity = <T = unknown>(activity: any, details: T = null as T): ActivityEvidence<T> => ({
    activity,
    status: 'PASS',
    summary: `${activity} passed mock`,
    command: null,
    details,
  });

  const mockAnalysisDetails: AnalysisEvidenceDetails = {
    tool: 'mock_tool',
    version: '1.0',
    rules: [],
    mandatoryCount: 0,
    requiredCount: 0,
    advisoryCount: 0,
    deviations: [],
    suppressions: [],
    locations: [],
  };

  const mockTargetDetails: TargetCompileDetails = {
    targetId: 'mock_target',
    packVersion: '1.0.0',
    packHash: 'hash',
    compiler: 'mock_gcc',
    compilerVersion: '1.0',
    outputFile: 'firmware.elf',
    outputHash: 'deadbeef',
    diagnostics: [],
  };

  const createMockAdapters = (overrides?: Partial<SMVerificationAdapters>): SMVerificationAdapters => ({
    host: {
      compile: async () => makeMockPassActivity('host-compilation'),
      runTests: async () => makeMockPassActivity('host-runtime'),
      runSanitizers: async () => makeMockPassActivity('sanitizers'),
    },
    coverage: {
      measureCoverage: async () => ({
        statement: makeMockPassActivity('statement-coverage'),
        branch: makeMockPassActivity('branch-coverage'),
        mcdc: makeMockPassActivity('mcdc-coverage'),
      }),
      measureMcdc: async () => makeMockPassActivity('mcdc-coverage'),
    },
    staticAnalysis: {
      probe: async () => ({ available: true, tool: 'mock_static', version: '1.0' }),
      run: async () => makeMockPassActivity('static-analysis', mockAnalysisDetails),
    },
    misra: {
      probe: async () => ({ available: true, tool: 'mock_misra', version: '1.0' }),
      run: async () => makeMockPassActivity('misra-analysis', mockAnalysisDetails),
    },
    target: {
      compile: async () => makeMockPassActivity('target-compilation', mockTargetDetails),
    },
    ...overrides,
  });

  it('executes gates in dependency order and records atomic verification bundle', async () => {
    const model = flatOrFixture();
    const { ir } = buildSemanticModel(model);
    const outDir = path.join(process.cwd(), 'scratch_pipeline_test_order');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    try {
      const adapters = createMockAdapters();
      const request: SMVerificationRequest = {
        ir: ir!,
        outputDirectory: outDir,
        adapters,
      };

      const bundle = await runVerificationPipeline(request);

      expect(bundle.overallStatus).toBe('PASS');
      expect(bundle.acceptance).toBe(true);
      expect(bundle.activities['structural'].status).toBe('PASS');
      expect(bundle.activities['semantic'].status).toBe('PASS');
      expect(bundle.activities['test-generation'].status).toBe('PASS');
      expect(bundle.activities['host-compilation'].status).toBe('PASS');
      expect(bundle.activities['host-runtime'].status).toBe('PASS');
      expect(bundle.activities['sanitizers'].status).toBe('PASS');
      expect(bundle.activities['statement-coverage'].status).toBe('PASS');
      expect(bundle.activities['branch-coverage'].status).toBe('PASS');
      expect(bundle.activities['differential'].status).toBe('PASS');

      // Check bundle written to disk
      const bundlePath = path.join(outDir, 'verification_bundle.json');
      expect(fs.existsSync(bundlePath)).toBe(true);
      const parsed = JSON.parse(fs.readFileSync(bundlePath, 'utf8'));
      expect(parsed.schemaVersion).toBe(1);
      expect(parsed.acceptance).toBe(true);
    } finally {
      if (fs.existsSync(outDir)) fs.rmSync(outDir, { recursive: true, force: true });
    }
  });

  it('marks dependent gates NOT_RUN when host compilation fails', async () => {
    const model = flatOrFixture();
    const { ir } = buildSemanticModel(model);
    const outDir = path.join(process.cwd(), 'scratch_pipeline_test_compile_fail');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    try {
      const failingHostAdapter = {
        compile: async () => ({
          activity: 'host-compilation' as const,
          status: 'FAIL' as const,
          summary: 'Compiler error in sm_core.c: undeclared identifier',
          command: null,
          details: null,
        }),
        runTests: async () => makeMockPassActivity('host-runtime'),
        runSanitizers: async () => makeMockPassActivity('sanitizers'),
      };

      const adapters = createMockAdapters({ host: failingHostAdapter });
      const request: SMVerificationRequest = {
        ir: ir!,
        outputDirectory: outDir,
        adapters,
      };

      const bundle = await runVerificationPipeline(request);

      expect(bundle.overallStatus).toBe('FAIL');
      expect(bundle.acceptance).toBe(false);
      expect(bundle.activities['host-compilation'].status).toBe('FAIL');

      // Dependent activities MUST be NOT_RUN (fail-closed, never executed or guessed)
      expect(bundle.activities['host-runtime'].status).toBe('NOT_RUN');
      expect(bundle.activities['sanitizers'].status).toBe('NOT_RUN');
      expect(bundle.activities['statement-coverage'].status).toBe('NOT_RUN');
      expect(bundle.activities['branch-coverage'].status).toBe('NOT_RUN');
      expect(bundle.activities['differential'].status).toBe('NOT_RUN');
    } finally {
      if (fs.existsSync(outDir)) fs.rmSync(outDir, { recursive: true, force: true });
    }
  });

  it('stops generation immediately when model has structural or semantic errors', async () => {
    const badModel = flatOrFixture();
    badModel.states[0].autostart = false;
    badModel.states[1].autostart = false;
    const built = buildSemanticModel(badModel);

    const outDir = path.join(process.cwd(), 'scratch_pipeline_test_semantic_fail');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    try {
      const adapters = createMockAdapters();
      const request: SMVerificationRequest = {
        ir: built.ir!,
        outputDirectory: outDir,
        adapters,
      };

      const bundle = await runVerificationPipeline(request);

      // Expect semantic or structural failure
      expect(bundle.acceptance).toBe(false);
      expect(bundle.activities['semantic'].status).toBe('FAIL');
      expect(bundle.activities['test-generation'].status).toBe('NOT_RUN');
      expect(bundle.activities['host-compilation'].status).toBe('NOT_RUN');
    } finally {
      if (fs.existsSync(outDir)) fs.rmSync(outDir, { recursive: true, force: true });
    }
  });
});
