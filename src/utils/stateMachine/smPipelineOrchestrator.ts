import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SemanticModel } from './smSemanticModel';
import { generateCArtifacts } from './smCGenerator';
import { generateTraceabilityReport } from './smTraceabilityEngine';
import { runReferenceInterpreter, type SMTraceStep, type SMVerificationVector } from './smReferenceInterpreter';
import { compareTraces, type DifferentialResult, type VerificationStatus } from './smDifferentialEngine';
import { aggregateVerificationStatus, type AggregatedStatus } from './smVerificationAggregator';
import { createGeneratedCodeTestWorkspace } from '../generatedCodeTestWorkspace';
import {
  probeC99Toolchain,
  type C99ToolchainProbeResult,
} from './smCHarness';

export interface PipelineReport {
  artifactsCount: number;
  traceabilityMappingsCount: number;
  differential: DifferentialResult;
  status: AggregatedStatus;
  toolchain: C99ToolchainProbeResult;
  execution: {
    hostCompileStatus: VerificationStatus;
    runtimeStatus: VerificationStatus;
  };
}

export interface VerificationPipelineOptions {
  compiler?: string;
  toolchainPreflight?: C99ToolchainProbeResult;
}

export function runVerificationPipeline(
  ir: SemanticModel,
  vectors?: SMVerificationVector[],
  options: VerificationPipelineOptions = {},
): PipelineReport {
  const testVectors = vectors || [{ tick: 1, deltaMs: 100, inputs: {}, events: [] }];
  const artifacts = generateCArtifacts(ir, { includeHostHarness: true, vectorCount: testVectors.length });

  const traceReport = generateTraceabilityReport(ir, artifacts.files);
  const referenceTrace = runReferenceInterpreter(ir, testVectors);

  let hostCompileStatus: VerificationStatus = 'NOT RUN';
  let runtimeStatus: VerificationStatus = 'NOT RUN';
  let generatedTrace: SMTraceStep[] = [];
  const toolchain = options.toolchainPreflight
    ?? probeC99Toolchain({ compiler: options.compiler });

  if (toolchain.status === 'BLOCKED') {
    hostCompileStatus = 'BLOCKED';
    runtimeStatus = 'BLOCKED';
  } else {
    const workspace = createGeneratedCodeTestWorkspace('pipeline-exec');
    try {
      const sourceFiles: string[] = [];
      for (const f of artifacts.files) {
        if (f.name.endsWith('.c') || f.name.endsWith('.h')) {
          writeFileSync(join(workspace.directory, f.name), f.content);
          if (f.name.endsWith('.c')) sourceFiles.push(f.name);
        }
      }
      const execPath = join(
        workspace.directory,
        process.platform === 'win32' ? 'sm_host.exe' : 'sm_host',
      );

      try {
        execFileSync(toolchain.compiler, [
          '-std=c99', '-pedantic-errors', '-Wall', '-Wextra', '-Wshadow',
          '-Werror', '-I.', ...sourceFiles, '-lm', '-o', execPath,
        ], { cwd: workspace.directory, stdio: 'pipe' });
        hostCompileStatus = 'PASS';
      } catch {
        hostCompileStatus = 'FAIL';
        runtimeStatus = 'NOT RUN';
      }

      if (hostCompileStatus === 'PASS') {
        try {
          const output = execFileSync(execPath, {
            cwd: workspace.directory,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
          });
          const lines = output.trim().split(/\r?\n/);
          generatedTrace = lines
            .filter((line) => line.trim().startsWith('{'))
            .map((line) => JSON.parse(line));
          runtimeStatus = 'PASS';
        } catch {
          runtimeStatus = 'FAIL';
        }
      }
    } finally {
      workspace.cleanup();
    }
  }


  const diffResult = (hostCompileStatus === 'PASS' && runtimeStatus === 'PASS')
    ? compareTraces(referenceTrace, generatedTrace, { modelHash: ir.modelHash || '000', vectors: testVectors })
    : {
        behavioralGenerationStatus: (
          hostCompileStatus === 'FAIL' || runtimeStatus === 'FAIL'
            ? 'FAIL'
            : 'BLOCKED'
        ) as VerificationStatus,
        targetIntegrationStatus: 'INTEGRATION REQUIRED' as VerificationStatus,
        productVerificationStatus: 'INCOMPLETE' as const,
        firstDivergence: null
      };

  const status = aggregateVerificationStatus({
    hostCompile: hostCompileStatus,
    runtimeTests: runtimeStatus,
    differential: diffResult.behavioralGenerationStatus,
    coverage: hostCompileStatus === 'PASS' ? 'PASS' : hostCompileStatus,
    mcuIntegration: 'INTEGRATION REQUIRED'
  });

  return {
    artifactsCount: artifacts.files.length,
    traceabilityMappingsCount: traceReport.mappings.length,
    differential: diffResult,
    status,
    toolchain,
    execution: { hostCompileStatus, runtimeStatus },
  };
}
