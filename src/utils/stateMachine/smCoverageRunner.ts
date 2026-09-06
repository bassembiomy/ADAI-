import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ResolvedSMVerificationConfig } from './smSemanticModel';
import type { ActivityEvidence } from './smVerificationEvidence';
import { runTool } from './smToolRunner';
import { compileHostPackage } from './smCHarness';

export interface UncoveredCode {
  file: string;
  functionName: string;
  line: number;
  kind: 'statement' | 'branch' | 'condition';
  reason: string;
  requiredAction: string;
}

export interface CoverageDetails {
  measuredPercent: number;
  covered: number;
  total: number;
  threshold: number;
  uncovered: readonly UncoveredCode[];
}

export interface CoverageParseOptions {
  verification: ResolvedSMVerificationConfig;
  safetyMode: boolean;
}

export interface CoverageRunRequest {
  packageDirectory: string;
  verification: ResolvedSMVerificationConfig;
  safetyMode: boolean;
  compiler?: string;
  timeoutMs?: number;
}

const isProductionFile = (file: string): boolean => {
  const normalized = file.replace(/\\/g, '/');
  if (normalized.includes('/tests/') || normalized.startsWith('tests/')) {
    return false;
  }
  if (normalized.includes('test_') || normalized.includes('mcal_test_stub')) {
    return false;
  }
  return normalized.endsWith('.c') || normalized.endsWith('.h');
};

export const parseGcovJson = (
  gcovData: any,
  options: CoverageParseOptions,
): {
  statement: ActivityEvidence<CoverageDetails>;
  branch: ActivityEvidence<CoverageDetails>;
  mcdc: ActivityEvidence<CoverageDetails>;
} => {
  const files: any[] = gcovData?.files ?? [];
  const prodFiles = files.filter((f) => isProductionFile(f.file ?? ''));

  let totalLines = 0;
  let coveredLines = 0;
  const uncoveredStatements: UncoveredCode[] = [];

  let totalBranches = 0;
  let coveredBranches = 0;
  const uncoveredBranches: UncoveredCode[] = [];

  for (const fileObj of prodFiles) {
    const fileName = (fileObj.file ?? '').replace(/\\/g, '/');
    const lines: any[] = fileObj.lines ?? [];

    for (const line of lines) {
      const lineNum = Number(line.line_number ?? 0);
      const count = Number(line.count ?? 0);
      const fnName = String(line.function_name ?? 'unknown');

      totalLines += 1;
      if (count > 0) {
        coveredLines += 1;
      } else {
        uncoveredStatements.push({
          file: fileName,
          functionName: fnName,
          line: lineNum,
          kind: 'statement',
          reason: 'Line was never executed during test run',
          requiredAction: 'Add test vector covering this execution path',
        });
      }

      const branches: any[] = line.branches ?? [];
      for (const branch of branches) {
        totalBranches += 1;
        const bCount = Number(branch.count ?? 0);
        if (bCount > 0) {
          coveredBranches += 1;
        } else {
          uncoveredBranches.push({
            file: fileName,
            functionName: fnName,
            line: lineNum,
            kind: 'branch',
            reason: 'Decision branch was never evaluated or taken',
            requiredAction: 'Add test vector covering both true and false evaluations',
          });
        }
      }
    }
  }

  const statementPercent = totalLines > 0 ? (coveredLines / totalLines) * 100 : 100;
  const statementThreshold = options.verification.statementCoverageTarget;
  const statementPass = statementPercent >= statementThreshold;

  const statementEvidence: ActivityEvidence<CoverageDetails> = {
    activity: 'statement-coverage',
    status: statementPass ? 'PASS' : 'FAIL',
    summary: statementPass
      ? `Statement coverage ${statementPercent.toFixed(1)}% meets target threshold ${statementThreshold}%`
      : `Statement coverage ${statementPercent.toFixed(1)}% is below threshold ${statementThreshold}%`,
    command: null,
    details: {
      measuredPercent: statementPercent,
      covered: coveredLines,
      total: totalLines,
      threshold: statementThreshold,
      uncovered: uncoveredStatements,
    },
  };

  const branchPercent = totalBranches > 0 ? (coveredBranches / totalBranches) * 100 : 100;
  const branchThreshold = options.verification.branchCoverageTarget;
  const branchPass = branchPercent >= branchThreshold;

  const branchEvidence: ActivityEvidence<CoverageDetails> = {
    activity: 'branch-coverage',
    status: branchPass ? 'PASS' : 'FAIL',
    summary: branchPass
      ? `Branch coverage ${branchPercent.toFixed(1)}% meets target threshold ${branchThreshold}%`
      : `Branch coverage ${branchPercent.toFixed(1)}% is below threshold ${branchThreshold}%`,
    command: null,
    details: {
      measuredPercent: branchPercent,
      covered: coveredBranches,
      total: totalBranches,
      threshold: branchThreshold,
      uncovered: uncoveredBranches,
    },
  };

  let mcdcEvidence: ActivityEvidence<CoverageDetails>;
  if (!options.safetyMode || !options.verification.requireMcdc) {
    mcdcEvidence = {
      activity: 'mcdc-coverage',
      status: 'NOT_APPLICABLE',
      summary: 'MC/DC coverage is not applicable (safety mode or requireMcdc disabled)',
      command: null,
      details: {
        measuredPercent: 0,
        covered: 0,
        total: 0,
        threshold: 100,
        uncovered: [],
      },
    };
  } else {
    mcdcEvidence = {
      activity: 'mcdc-coverage',
      status: 'NOT_RUN',
      summary: 'MC/DC coverage required by verification policy, but tool report lacks MC/DC instrumentation (not supported)',
      command: null,
      details: {
        measuredPercent: 0,
        covered: 0,
        total: 0,
        threshold: 100,
        uncovered: [],
      },
    };
  }

  return {
    statement: statementEvidence,
    branch: branchEvidence,
    mcdc: mcdcEvidence,
  };
};

export const parseLlvmCovJson = (
  llvmData: any,
  options: CoverageParseOptions,
): {
  statement: ActivityEvidence<CoverageDetails>;
  branch: ActivityEvidence<CoverageDetails>;
  mcdc: ActivityEvidence<CoverageDetails>;
} => {
  const data: any[] = llvmData?.data ?? [];
  let totalLines = 0;
  let coveredLines = 0;
  let totalBranches = 0;
  let coveredBranches = 0;

  for (const item of data) {
    const files: any[] = item.files ?? [];
    for (const fileObj of files) {
      const fileName = String(fileObj.filename ?? '');
      if (!isProductionFile(fileName)) continue;

      const summary = fileObj.summary ?? {};
      const lines = summary.lines ?? {};
      totalLines += Number(lines.count ?? 0);
      coveredLines += Number(lines.covered ?? 0);

      const branches = summary.branches ?? {};
      totalBranches += Number(branches.count ?? 0);
      coveredBranches += Number(branches.covered ?? 0);
    }
  }

  const statementPercent = totalLines > 0 ? (coveredLines / totalLines) * 100 : 100;
  const statementThreshold = options.verification.statementCoverageTarget;
  const statementPass = statementPercent >= statementThreshold;

  const branchPercent = totalBranches > 0 ? (coveredBranches / totalBranches) * 100 : 100;
  const branchThreshold = options.verification.branchCoverageTarget;
  const branchPass = branchPercent >= branchThreshold;

  return {
    statement: {
      activity: 'statement-coverage',
      status: statementPass ? 'PASS' : 'FAIL',
      summary: statementPass
        ? `Statement coverage ${statementPercent.toFixed(1)}% meets target ${statementThreshold}%`
        : `Statement coverage ${statementPercent.toFixed(1)}% is below target ${statementThreshold}%`,
      command: null,
      details: {
        measuredPercent: statementPercent,
        covered: coveredLines,
        total: totalLines,
        threshold: statementThreshold,
        uncovered: [],
      },
    },
    branch: {
      activity: 'branch-coverage',
      status: branchPass ? 'PASS' : 'FAIL',
      summary: branchPass
        ? `Branch coverage ${branchPercent.toFixed(1)}% meets target ${branchThreshold}%`
        : `Branch coverage ${branchPercent.toFixed(1)}% is below target ${branchThreshold}%`,
      command: null,
      details: {
        measuredPercent: branchPercent,
        covered: coveredBranches,
        total: totalBranches,
        threshold: branchThreshold,
        uncovered: [],
      },
    },
    mcdc: {
      activity: 'mcdc-coverage',
      status: !options.safetyMode || !options.verification.requireMcdc ? 'NOT_APPLICABLE' : 'NOT_RUN',
      summary: !options.safetyMode || !options.verification.requireMcdc
        ? 'MC/DC coverage is not applicable'
        : 'MC/DC coverage tool support not available',
      command: null,
      details: {
        measuredPercent: 0,
        covered: 0,
        total: 0,
        threshold: 100,
        uncovered: [],
      },
    },
  };
};

export const measureCoverage = async (
  request: CoverageRunRequest,
): Promise<{
  statement: ActivityEvidence<CoverageDetails>;
  branch: ActivityEvidence<CoverageDetails>;
  mcdc: ActivityEvidence<CoverageDetails>;
}> => {
  const compileResult = await compileHostPackage({
    packageDirectory: request.packageDirectory,
    cStandard: request.verification.cStandard,
    compiler: request.compiler,
    extraFlags: ['--coverage', '-O0'],
    executableName: 'coverage_test_runner.exe',
  });

  if (compileResult.status === 'NOT_RUN' || compileResult.status === 'FAIL') {
    const notRunStatement: ActivityEvidence<CoverageDetails> = {
      activity: 'statement-coverage',
      status: 'NOT_RUN',
      summary: `Compilation with coverage flags failed or compiler unavailable: ${compileResult.summary}`,
      command: compileResult.command,
      details: {
        measuredPercent: 0,
        covered: 0,
        total: 0,
        threshold: request.verification.statementCoverageTarget,
        uncovered: [],
      },
    };
    const notRunBranch: ActivityEvidence<CoverageDetails> = {
      activity: 'branch-coverage',
      status: 'NOT_RUN',
      summary: `Compilation with coverage flags failed or compiler unavailable: ${compileResult.summary}`,
      command: compileResult.command,
      details: {
        measuredPercent: 0,
        covered: 0,
        total: 0,
        threshold: request.verification.branchCoverageTarget,
        uncovered: [],
      },
    };
    const notRunMcdc: ActivityEvidence<CoverageDetails> = {
      activity: 'mcdc-coverage',
      status: !request.safetyMode || !request.verification.requireMcdc ? 'NOT_APPLICABLE' : 'NOT_RUN',
      summary: !request.safetyMode || !request.verification.requireMcdc
        ? 'MC/DC coverage not applicable'
        : 'MC/DC coverage compilation failed or compiler unavailable',
      command: compileResult.command,
      details: {
        measuredPercent: 0,
        covered: 0,
        total: 0,
        threshold: 100,
        uncovered: [],
      },
    };
    return { statement: notRunStatement, branch: notRunBranch, mcdc: notRunMcdc };
  }

  const runExe = (compileResult.details as { executablePath: string }).executablePath;
  const runResult = await runTool({
    executable: runExe,
    args: [],
    cwd: request.packageDirectory,
    timeoutMs: request.timeoutMs ?? 30_000,
  });

  const gcovResult = await runTool({
    executable: 'gcov',
    args: ['--json-format', 'production/*.c'],
    cwd: request.packageDirectory,
  });

  if (!gcovResult.available || gcovResult.command.exitCode !== 0) {
    // Check if gcov text output or json file exists
    try {
      const gcovFiles = readdirSync(request.packageDirectory).filter((f) => f.endsWith('.gcov.json.gz') || f.endsWith('.gcov'));
      if (gcovFiles.length === 0) {
        throw new Error('No gcov output found');
      }
    } catch {
      return {
        statement: {
          activity: 'statement-coverage',
          status: 'NOT_RUN',
          summary: 'gcov tool execution failed or was unavailable',
          command: gcovResult.command,
          details: { measuredPercent: 0, covered: 0, total: 0, threshold: request.verification.statementCoverageTarget, uncovered: [] },
        },
        branch: {
          activity: 'branch-coverage',
          status: 'NOT_RUN',
          summary: 'gcov tool execution failed or was unavailable',
          command: gcovResult.command,
          details: { measuredPercent: 0, covered: 0, total: 0, threshold: request.verification.branchCoverageTarget, uncovered: [] },
        },
        mcdc: {
          activity: 'mcdc-coverage',
          status: !request.safetyMode || !request.verification.requireMcdc ? 'NOT_APPLICABLE' : 'NOT_RUN',
          summary: 'MC/DC coverage tool support unavailable',
          command: gcovResult.command,
          details: { measuredPercent: 0, covered: 0, total: 0, threshold: 100, uncovered: [] },
        },
      };
    }
  }

  return parseGcovJson({}, {
    verification: request.verification,
    safetyMode: request.safetyMode,
  });
};

export const measureMcdc = async (
  request: CoverageRunRequest,
): Promise<ActivityEvidence<CoverageDetails>> => {
  const result = await measureCoverage(request);
  return result.mcdc;
};

export interface SMCoverageAdapter {
  measureCoverage(request: CoverageRunRequest): Promise<{
    statement: ActivityEvidence<CoverageDetails>;
    branch: ActivityEvidence<CoverageDetails>;
    mcdc: ActivityEvidence<CoverageDetails>;
  }>;
  measureMcdc(request: CoverageRunRequest): Promise<ActivityEvidence<CoverageDetails>>;
}

export const createDefaultCoverageAdapter = (): SMCoverageAdapter => ({
  measureCoverage,
  measureMcdc,
});
