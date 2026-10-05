import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { flatOrFixture } from '../src/utils/stateMachine/smFixtures';
import { migrateStateMachineModel } from '../src/utils/stateMachine/smModelMigration';
import { buildSemanticModel } from '../src/utils/stateMachine/smSemanticBuilder';
import { generateCArtifacts } from '../src/utils/stateMachine/smCGenerator';
import {
  createDefaultAdapters,
  runVerificationPipeline,
} from '../src/utils/stateMachine/smPipelineOrchestrator';
import { createGeneratedCodeTestWorkspace } from '../src/utils/generatedCodeTestWorkspace';
import { analyzeSemanticModel } from '../src/utils/smAnalysisEngine';
import { renderTestingReport } from '../src/utils/stateMachine/smReports';
import type { LegacyStateMachineModel } from '../src/utils/stateMachine/smModel';

export interface VerifySmCodegenOptions {
  modelPath?: string;
  outputDir?: string;
  targetId?: string;
  log?: (message: string) => void;
  error?: (message: string) => void;
}

export const runVerifySmCodegen = async (
  rawArgs: string[] = [],
  customOptions?: VerifySmCodegenOptions,
): Promise<number> => {
  const log = customOptions?.log ?? console.log;
  const errLog = customOptions?.error ?? console.error;

  let modelPath = customOptions?.modelPath;
  let outputDir = customOptions?.outputDir;
  let targetId = customOptions?.targetId;

  for (let i = 0; i < rawArgs.length; i++) {
    if (rawArgs[i] === '--model' && i + 1 < rawArgs.length) {
      modelPath = rawArgs[++i];
    } else if (rawArgs[i] === '--output' && i + 1 < rawArgs.length) {
      outputDir = rawArgs[++i];
    } else if (rawArgs[i] === '--target' && i + 1 < rawArgs.length) {
      targetId = rawArgs[++i];
    }
  }

  log('=== ADIA State Machine Code Verification Pipeline ===');

  let rawModel: LegacyStateMachineModel;
  if (modelPath) {
    const resolvedPath = resolve(process.cwd(), modelPath);
    if (!existsSync(resolvedPath)) {
      errLog(`[FAIL] Model file not found: ${resolvedPath}`);
      return 1;
    }
    try {
      const content = readFileSync(resolvedPath, 'utf-8');
      rawModel = JSON.parse(content);
      log(`Loaded model from: ${modelPath}`);
    } catch (e) {
      errLog(`[FAIL] Could not parse model JSON: ${String(e)}`);
      return 1;
    }
  } else {
    log('No --model specified, using default reviewed flat-or fixture');
    rawModel = flatOrFixture();
  }

  const migrated = migrateStateMachineModel(rawModel);
  const built = buildSemanticModel(migrated.model);
  const errorDiagnostics = built.diagnostics.filter((d) => d.severity === 'error');
  if (!built.ir || errorDiagnostics.length > 0) {
    errLog(`[FAIL] Model validation failed with ${errorDiagnostics.length} error(s):`);
    for (const d of errorDiagnostics) {
      errLog(`  - [${d.code}] ${d.message}`);
    }
    return 1;
  }

  const ir = targetId
    ? {
        ...built.ir,
        verification: {
          ...built.ir.verification,
          targetId,
        },
      }
    : built.ir;

  if (targetId) {
    log(`Applied target override: ${targetId}`);
  }

  log(`Model states: ${Object.keys(ir.states).length}, C standard: ${ir.verification.cStandard}`);

  // Render complete verification package
  const artifacts = generateCArtifacts(ir, {
    includeVerificationPackage: true,
  });

  const resolvedOutputDir = outputDir ? resolve(process.cwd(), outputDir) : undefined;
  if (resolvedOutputDir) {
    mkdirSync(resolvedOutputDir, { recursive: true });
    for (const file of artifacts.files) {
      const fullPath = join(resolvedOutputDir, file.name);
      mkdirSync(dirname(fullPath), { recursive: true });
      writeFileSync(fullPath, file.content, 'utf-8');
    }
    log(`Wrote ${artifacts.files.length} artifacts to: ${resolvedOutputDir}`);
  }

  // Run pipeline orchestration
  const pipelineOutputDir = resolvedOutputDir
    ?? createGeneratedCodeTestWorkspace('pipeline-cli').directory;

  const bundle = await runVerificationPipeline({
    ir,
    outputDirectory: pipelineOutputDir,
    adapters: createDefaultAdapters(),
  });

  log('');
  log('--- Independent Verification Activities ---');
  for (const [activityName, act] of Object.entries(bundle.activities)) {
    const statusStr = act.status.toUpperCase();
    const durStr = act.command?.durationMs !== undefined ? `${act.command.durationMs.toFixed(1)}ms` : 'N/A';
    const cmdStr = act.command ? ` [${act.command.executable} ${act.command.args.join(' ')}]` : '';
    log(`  ${activityName.padEnd(22)}: [${statusStr}] (${durStr})${cmdStr}`);
    if (act.summary) {
      log(`    -> ${act.summary}`);
    }
    if (act.status === 'FAIL' && act.command?.stderr) {
      log(`    -> STDERR:\n${act.command.stderr}`);
    }
  }

  log('');
  log('--- Final Acceptance Decision ---');
  log(`Overall Status: ${bundle.overallStatus}`);
  log(`Acceptance:     ${bundle.acceptance ? 'ACCEPTED (PASS)' : 'REJECTED (FAIL / UNMET GATES)'}`);
  const reasons: string[] = Array.isArray((bundle as any).reasons) ? [...(bundle as any).reasons] : [];
  if (reasons.length === 0 && !bundle.acceptance) {
    for (const [name, act] of Object.entries(bundle.activities)) {
      if (act.status !== 'PASS' && act.status !== 'NOT_APPLICABLE' && act.status !== 'PENDING') {
        reasons.push(`${name} was ${act.status}`);
      }
    }
  }
  if (reasons.length > 0) {
    log('Reasons:');
    for (const reason of reasons) {
      log(`  - ${reason}`);
    }
  }

  if (resolvedOutputDir) {
    const analysis = analyzeSemanticModel(ir);
    const reportContent = renderTestingReport(analysis, bundle, ir);
    const reportFile = join(resolvedOutputDir, 'verification', 'sm_testing_report.md');
    mkdirSync(dirname(reportFile), { recursive: true });
    writeFileSync(reportFile, reportContent, 'utf-8');
    const bundleFile = join(resolvedOutputDir, 'verification', 'sm_verification_bundle.json');
    writeFileSync(bundleFile, JSON.stringify(bundle, null, 2), 'utf-8');
    log(`\nUpdated honest verification bundle & report in ${resolvedOutputDir}/verification/`);
  }

  return bundle.acceptance ? 0 : 1;
};

const isMainModule = process.argv[1] && (
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
  || process.argv[1].endsWith('verify_sm_codegen.ts')
);

if (isMainModule) {
  runVerifySmCodegen(process.argv.slice(2)).then((code) => {
    process.exit(code);
  }).catch((err) => {
    console.error('Fatal CLI error:', err);
    process.exit(1);
  });
}
