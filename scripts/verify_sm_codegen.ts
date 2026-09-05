import { flatOrFixture, hybridXBridgesFixture, xb6StepFixture } from '../src/utils/stateMachine/smFixtures';
import { generateCArtifacts } from '../src/utils/stateMachine/smCGenerator';
import {
  CProgramExecutionError,
  compileAndRunCTrace,
  probeC99Toolchain,
  runInterpreterTrace,
} from '../src/utils/stateMachine/smCHarness';
import { buildSemanticModel } from '../src/utils/stateMachine/smSemanticBuilder';
import { runVerificationPipeline } from '../src/utils/stateMachine/smPipelineOrchestrator';
import { compareSemanticTraces } from '../src/utils/stateMachine/smTrace';
import { XB_EXECUTABLE_C_CASES } from '../src/utils/stateMachine/xbCConformanceCases';

type FailureCategory =
  | 'environment'
  | 'model/fixture validation'
  | 'generation'
  | 'runtime'
  | 'differential'
  | 'assertion-contract';

interface CaseResult {
  id: string;
  status: 'PASS' | 'FAIL' | 'BLOCKED';
  category: FailureCategory | null;
  detail: string;
  traceFrames: number;
}

const compilerArgumentIndex = process.argv.indexOf('--compiler');
if (compilerArgumentIndex >= 0 && !process.argv[compilerArgumentIndex + 1]) {
  throw new Error('--compiler requires an executable name or path');
}
const explicitCompiler = compilerArgumentIndex >= 0
  ? process.argv[compilerArgumentIndex + 1]
  : undefined;
const toolchain = probeC99Toolchain({ compiler: explicitCompiler });

console.log('=== ADIA State Machine Code Generator Verification Baseline ===');
console.log(JSON.stringify({ toolchain }, null, 2));

const models = [
  { name: 'Flat OR Fixture', model: flatOrFixture() },
  { name: 'Hybrid XBridges Fixture', model: hybridXBridgesFixture() },
  { name: 'XB6 Step Fixture', model: xb6StepFixture() },
];

for (const item of models) {
  console.log(`\nRunning pipeline for: ${item.name}`);
  const { ir, diagnostics } = buildSemanticModel(item.model);
  if (!ir || diagnostics.some(d => d.severity === 'error')) {
    console.error(`[FAIL][model/fixture validation] Semantic validation failed for ${item.name}`);
    continue;
  }

  const report = runVerificationPipeline(ir, undefined, {
    toolchainPreflight: toolchain,
  });
  console.log(`[INFO] Generated ${report.artifactsCount} code artifacts.`);
  console.log(`[INFO] Traceability mappings resolved: ${report.traceabilityMappingsCount}`);
  console.log(
    `[${report.execution.hostCompileStatus}] Host compilation; `
    + `[${report.execution.runtimeStatus}] generated runtime`,
  );
  console.log(`[${report.status.behavioralGenerationStatus}] Behavioral Generation Status`);
  console.log(`[${report.status.targetIntegrationStatus}] Target Integration Status`);
  console.log(`[${report.status.productVerificationStatus}] Product Verification Status`);
}

const caseResults: CaseResult[] = [];
for (const [id, testCase] of Object.entries(XB_EXECUTABLE_C_CASES)) {
  const built = buildSemanticModel(testCase.fixture.model);
  const errors = built.diagnostics.filter((item) => item.severity === 'error');
  if (!built.ir || errors.length > 0) {
    caseResults.push({
      id,
      status: 'FAIL',
      category: 'model/fixture validation',
      detail: errors.map((item) => `${item.code}: ${item.message}`).join('; '),
      traceFrames: 0,
    });
    continue;
  }

  let expected;
  try {
    expected = runInterpreterTrace(testCase.fixture);
  } catch (error) {
    caseResults.push({
      id,
      status: 'FAIL',
      category: 'runtime',
      detail: error instanceof Error ? error.message : String(error),
      traceFrames: 0,
    });
    continue;
  }

  try {
    generateCArtifacts(built.ir, { includeTestShims: true });
  } catch (error) {
    caseResults.push({
      id,
      status: 'FAIL',
      category: 'generation',
      detail: error instanceof Error ? error.message : String(error),
      traceFrames: expected.length,
    });
    continue;
  }

  if (toolchain.status === 'BLOCKED') {
    caseResults.push({
      id,
      status: 'BLOCKED',
      category: 'environment',
      detail: `${toolchain.phase}: ${toolchain.detail}`,
      traceFrames: expected.length,
    });
    continue;
  }

  try {
    const actual = compileAndRunCTrace(testCase.fixture, {
      toolchainPreflight: toolchain,
    });
    const diff = compareSemanticTraces(expected, actual, testCase.tolerance);
    caseResults.push(diff === null ? {
      id,
      status: 'PASS',
      category: null,
      detail: `matched ${actual.length} trace frames`,
      traceFrames: actual.length,
    } : {
      id,
      status: 'FAIL',
      category: 'differential',
      detail: JSON.stringify(diff),
      traceFrames: actual.length,
    });
  } catch (error) {
    const category: FailureCategory = error instanceof CProgramExecutionError
      ? error.phase === 'compile-generated' ? 'generation' : 'runtime'
      : 'assertion-contract';
    caseResults.push({
      id,
      status: 'FAIL',
      category,
      detail: error instanceof Error ? error.message : String(error),
      traceFrames: expected.length,
    });
  }
}

console.log('\n=== Declared X-Bridges C99 Conformance (all cases attempted) ===');
for (const result of caseResults) {
  console.log(
    `[${result.status}][${result.category ?? 'none'}] ${result.id}: `
    + `${result.traceFrames} TS trace frames; ${result.detail}`,
  );
}

const summary = caseResults.reduce<Record<string, number>>((counts, result) => {
  const key = `${result.status}:${result.category ?? 'none'}`;
  counts[key] = (counts[key] ?? 0) + 1;
  return counts;
}, {});
console.log('\n=== Classification Summary ===');
console.log(JSON.stringify({ attempted: caseResults.length, summary }, null, 2));

if (caseResults.some((result) => result.status === 'FAIL')) process.exitCode = 1;
else if (caseResults.some((result) => result.status === 'BLOCKED')) process.exitCode = 2;
