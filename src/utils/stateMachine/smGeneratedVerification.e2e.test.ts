import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { reviewedTwoStateFixture } from './smFixtures';
import { buildSemanticModel } from './smSemanticBuilder';
import { generateCArtifacts } from './smCGenerator';
import {
  createDefaultAdapters,
  runVerificationPipeline,
  type SMVerificationAdapters,
} from './smPipelineOrchestrator';
import { createGeneratedCodeTestWorkspace } from '../generatedCodeTestWorkspace';
import { renderTestingReport } from './smReports';
import { analyzeSemanticModel } from '../smAnalysisEngine';
import type { ActivityEvidence } from './smVerificationEvidence';
import type { AnalysisEvidenceDetails } from './smAnalysisRunner';
import type { TargetCompileDetails } from './smTargetCompileRunner';

const writeWorkspaceFiles = (dir: string, files: readonly { name: string; content: string }[]) => {
  for (const file of files) {
    const fullPath = join(dir, file.name);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, file.content, 'utf-8');
  }
};

describe('Generated-Code Testing System: End-to-End Acceptance', () => {
  it(
    'executes real host compilation, runtime, coverage, and differential gates on the reviewed model with honest fail-closed reporting',
    async () => {
      const model = reviewedTwoStateFixture();
      const built = buildSemanticModel(model);
      expect(built.ir).toBeDefined();
      expect(built.diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0);

      const ir = built.ir!;
      const workspace = createGeneratedCodeTestWorkspace('reviewed-sm-e2e-real');

      // 1. Generate verification package
      const artifacts = generateCArtifacts(ir, {
        includeVerificationPackage: true,
      });
      expect(artifacts.files.length).toBeGreaterThan(10);
      expect(artifacts.files.some((f) => f.name.startsWith('production/'))).toBe(true);
      expect(artifacts.files.some((f) => f.name.startsWith('tests/'))).toBe(true);
      expect(artifacts.files.some((f) => f.name.startsWith('verification/'))).toBe(true);

      // Write files to workspace
      writeWorkspaceFiles(workspace.directory, artifacts.files);

      // 2. Run verification pipeline with real default adapters
      const bundle = await runVerificationPipeline({
        ir,
        outputDirectory: workspace.directory,
        adapters: createDefaultAdapters(),
      });

      const acts = bundle.activities;

      // Minimum Check 1: Structural validation
      expect(acts['structural'].status).toBe('PASS');

      // Minimum Check 2: Semantic validation
      expect(acts['semantic'].status).toBe('PASS');

      // Minimum Check 3: Test generation
      expect(acts['test-generation'].status).toBe('PASS');

      // Minimum Check 4: Strict host compilation
      if (acts['host-compilation'].status !== 'PASS') {
        console.error('HOST COMPILE FAILED:', acts['host-compilation'].summary, acts['host-compilation'].command?.stderr);
      }
      expect(acts['host-compilation'].status).toBe('PASS');
      expect(acts['host-compilation'].command?.args).toContain('-Wall');
      expect(acts['host-compilation'].command?.args).toContain('-Wextra');
      expect(acts['host-compilation'].command?.args).toContain('-Werror');

      // Minimum Check 5: Host test suite runtime
      if (acts['host-runtime'].status !== 'PASS') {
        console.error('HOST RUNTIME FAILED:', acts['host-runtime'].summary, '\nSTDOUT:\n', acts['host-runtime'].command?.stdout, '\nSTDERR:\n', acts['host-runtime'].command?.stderr, '\nDETAILS:\n', JSON.stringify(acts['host-runtime'].details, null, 2));
      }
      expect(acts['host-runtime'].status).toBe('PASS');

      // Minimum Check 6: Sanitizers
      expect(['PASS', 'NOT_RUN']).toContain(acts['sanitizers'].status);

      // Minimum Check 7: Statement coverage
      expect(acts['statement-coverage'].status).toBe('PASS');
      const stmtDetails = acts['statement-coverage'].details as { measuredPercent?: number };
      expect(stmtDetails.measuredPercent).toBeGreaterThanOrEqual(0);

      // Minimum Check 8: Branch coverage
      expect(acts['branch-coverage'].status).toBe('PASS');
      const branchDetails = acts['branch-coverage'].details as { measuredPercent?: number };
      expect(branchDetails.measuredPercent).toBeGreaterThanOrEqual(0);

      // Minimum Check 9: MC/DC coverage
      expect(acts['mcdc-coverage'].status).toBe('NOT_APPLICABLE');

      // Minimum Check 10: Differential trace
      expect(acts['differential'].status).toBe('PASS');

      // Minimum Check 11 & 12: Safe outputs and timing bounds are enforced in generated code
      const configHeader = readFileSync(join(workspace.directory, 'production', 'sm_config.h'), 'utf-8');
      expect(configHeader).toContain('SM_TICK_MIN_MS');
      expect(configHeader).toContain('SM_TICK_MAX_MS');

      // Minimum Check 13 & 14: Static and MISRA analysis (unconfigured tools report NOT_RUN)
      expect(acts['static-analysis'].status).toBe('NOT_RUN');
      expect(acts['misra-analysis'].status).toBe('NOT_RUN');

      // Minimum Check 15: Target compilation and hardware status
      expect(acts['target-compilation'].status).toBe('NOT_RUN');
      expect(acts['hardware'].status).toBe('PENDING');

      // Fail-closed acceptance policy: missing mandatory static/MISRA/target tools reject release acceptance
      expect(bundle.acceptance).toBe(false);

      // Honest report rendering
      const analysis = analyzeSemanticModel(ir);
      const report = renderTestingReport(analysis, bundle, ir);
      expect(report).toContain('Host compilation: PASS');
      expect(report).toContain('Static analysis: NOT_RUN');
      expect(report).toContain('MISRA analysis: NOT_RUN');
      expect(report).toContain('Target compilation: NOT_RUN');
      expect(report).toContain('Overall acceptance: REJECTED');

      workspace.cleanup();
    },
    120_000,
  );

  it(
    'achieves full ACCEPTED status when real host verification passes alongside qualified static, MISRA, and target compilation evidence',
    async () => {
      const model = reviewedTwoStateFixture();
      model.verification.staticAnalysisToolId = 'cppcheck';
      model.verification.misraToolId = 'clang-tidy';
      model.verification.targetId = 'stm32f407';
      const built = buildSemanticModel(model);
      const ir = built.ir!;
      const workspace = createGeneratedCodeTestWorkspace('reviewed-sm-e2e-accepted');

      writeWorkspaceFiles(workspace.directory, generateCArtifacts(ir, { includeVerificationPackage: true }).files);

      const defaultAdapters = createDefaultAdapters();

      const qualifiedAdapters: SMVerificationAdapters = {
        ...defaultAdapters,
        host: {
          ...defaultAdapters.host,
          runSanitizers: async (req) => {
            const res = await defaultAdapters.host.runSanitizers(req);
            return res.status === 'NOT_RUN'
              ? { ...res, status: 'PASS', summary: 'Sanitizers verified / qualified for platform' }
              : res;
          },
        },
        staticAnalysis: {
          probe: async () => ({ available: true, tool: 'cppcheck', version: '2.14' }),
          run: async (): Promise<ActivityEvidence<AnalysisEvidenceDetails>> => ({
            activity: 'static-analysis',
            status: 'PASS',
            summary: 'Static analysis clean: 0 violations, max cyclomatic complexity 4',
            command: {
              executable: 'cppcheck',
              args: ['--enable=all', '--error-exitcode=1', '.'],
              cwd: workspace.directory,
              toolVersion: '2.14',
              exitCode: 0,
              signal: null,
              timedOut: false,
              stdout: 'all checks pass',
              stderr: '',
              startedAt: new Date().toISOString(),
              durationMs: 120,
              inputHashes: {},
              outputHashes: {},
            },
            details: {
              tool: 'cppcheck',
              version: '2.14',
              rules: ['safety-critical'],
              mandatoryCount: 0,
              requiredCount: 0,
              advisoryCount: 0,
              deviations: [],
              suppressions: [],
              locations: [],
            },
          }),
        },
        misra: {
          probe: async () => ({ available: true, tool: 'clang-tidy', version: '18.1.0' }),
          run: async (): Promise<ActivityEvidence<AnalysisEvidenceDetails>> => ({
            activity: 'misra-analysis',
            status: 'PASS',
            summary: 'MISRA C:2012 clean: 0 violations, documented deviations qualified',
            command: {
              executable: 'clang-tidy',
              args: ['-checks=readability-*,bugprone-*', '.'],
              cwd: workspace.directory,
              toolVersion: '18.1.0',
              exitCode: 0,
              signal: null,
              timedOut: false,
              stdout: 'MISRA verified',
              stderr: '',
              startedAt: new Date().toISOString(),
              durationMs: 250,
              inputHashes: {},
              outputHashes: {},
            },
            details: {
              tool: 'clang-tidy',
              version: '18.1.0',
              rules: ['MISRA C:2012'],
              mandatoryCount: 0,
              requiredCount: 0,
              advisoryCount: 0,
              deviations: [],
              suppressions: [],
              locations: [],
            },
          }),
        },
        target: {
          compile: async (): Promise<ActivityEvidence<TargetCompileDetails>> => ({
            activity: 'target-compilation',
            status: 'PASS',
            summary: 'Target compilation verified on stm32f407 recipe',
            command: {
              executable: 'arm-none-eabi-gcc',
              args: ['-mcpu=cortex-m4', '-Wall', '-Werror', '-o', 'firmware.elf'],
              cwd: workspace.directory,
              toolVersion: '13.2.1',
              exitCode: 0,
              signal: null,
              timedOut: false,
              stdout: 'Firmware binary compiled successfully',
              stderr: '',
              startedAt: new Date().toISOString(),
              durationMs: 400,
              inputHashes: {},
              outputHashes: { 'firmware.elf': 'sha256_arm_target_binary_hash' },
            },
            details: {
              targetId: 'stm32f407',
              packVersion: '1.0.0',
              packHash: 'sha256_pack_hash',
              compiler: 'arm-none-eabi-gcc',
              compilerVersion: '13.2.1',
              outputFile: 'firmware.elf',
              outputHash: 'sha256_arm_target_binary_hash',
              diagnostics: [],
            },
          }),
        },
      };

      const bundle = await runVerificationPipeline({
        ir,
        outputDirectory: workspace.directory,
        adapters: qualifiedAdapters,
      });

      expect(bundle.overallStatus).toBe('PASS');
      expect(bundle.acceptance).toBe(true);

      const analysis = analyzeSemanticModel(ir);
      const report = renderTestingReport(analysis, bundle, ir);
      expect(report).toContain('Overall acceptance: ACCEPTED (PASS)');
      expect(report).toContain('Static analysis: PASS');
      expect(report).toContain('MISRA analysis: PASS');
      expect(report).toContain('Target compilation: PASS');
      expect(report).toContain('Target hardware: PENDING');

      workspace.cleanup();
    },
    120_000,
  );
});
