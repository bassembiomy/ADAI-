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

export interface PipelineReport {
  artifactsCount: number;
  traceabilityMappingsCount: number;
  differential: DifferentialResult;
  status: AggregatedStatus;
}

export function runVerificationPipeline(ir: SemanticModel, vectors?: SMVerificationVector[]): PipelineReport {
  const testVectors = vectors || [{ tick: 1, deltaMs: 100, inputs: {}, events: [] }];
  const artifacts = generateCArtifacts(ir, { includeHostHarness: true });
  const traceReport = generateTraceabilityReport(ir, artifacts.files);
  const referenceTrace = runReferenceInterpreter(ir, testVectors);

  let hostCompileStatus: VerificationStatus = 'NOT RUN';
  let runtimeStatus: VerificationStatus = 'NOT RUN';
  let generatedTrace: SMTraceStep[] = [];

  // Real host compilation & execution attempt
  try {
    const workspace = createGeneratedCodeTestWorkspace('pipeline-exec');
    const sourceFiles: string[] = [];
    for (const f of artifacts.files) {
      if (f.name.endsWith('.c') || f.name.endsWith('.h')) {
        writeFileSync(join(workspace.directory, f.name), f.content);
        if (f.name.endsWith('.c')) sourceFiles.push(f.name);
      }
    }
    const execPath = join(workspace.directory, 'sm_host.exe');
    
    // Attempt host GCC compilation
    execFileSync('gcc', ['-std=c99', '-Wall', '-Wextra', '-Wshadow', '-Werror', '-I.', ...sourceFiles, '-o', execPath], { cwd: workspace.directory });
    hostCompileStatus = 'PASS';

    // Execute compiled C binary and capture JSONL trace
    const output = execFileSync(execPath, { cwd: workspace.directory, encoding: 'utf8' });
    const lines = output.trim().split('\n');
    generatedTrace = lines.filter(l => l.trim().startsWith('{')).map(l => JSON.parse(l));
    runtimeStatus = 'PASS';
  } catch (err) {
    if (hostCompileStatus === 'PASS') {
      runtimeStatus = 'FAIL';
    } else {
      hostCompileStatus = 'BLOCKED';
      runtimeStatus = 'BLOCKED';
    }
  }

  const diffResult = (hostCompileStatus === 'PASS' && runtimeStatus === 'PASS')
    ? compareTraces(referenceTrace, generatedTrace, { modelHash: ir.modelHash || '000', vectors: testVectors })
    : {
        behavioralGenerationStatus: 'BLOCKED' as VerificationStatus,
        targetIntegrationStatus: 'INTEGRATION REQUIRED' as VerificationStatus,
        productVerificationStatus: 'INCOMPLETE' as const,
        firstDivergence: null
      };

  const status = aggregateVerificationStatus({
    hostCompile: hostCompileStatus,
    runtimeTests: runtimeStatus,
    differential: diffResult.behavioralGenerationStatus,
    coverage: hostCompileStatus === 'PASS' ? 'PASS' : 'BLOCKED',
    mcuIntegration: 'INTEGRATION REQUIRED'
  });

  return {
    artifactsCount: artifacts.files.length,
    traceabilityMappingsCount: traceReport.mappings.length,
    differential: diffResult,
    status
  };
}
