import { describe, expect, it } from 'vitest';
import {
  parseGcovJson,
  parseLlvmCovJson,
  type CoverageDetails,
  type UncoveredCode,
} from './smCoverageRunner';
import { defaultSMVerificationConfig } from './smModel';
import type { ResolvedSMVerificationConfig } from './smSemanticModel';

describe('smCoverageRunner parser and policy', () => {
  const dummyConfig: ResolvedSMVerificationConfig = {
    ...defaultSMVerificationConfig(),
    invalidInputPolicies: {},
    statementCoverageTarget: 100,
    branchCoverageTarget: 100,
    requireMcdc: false,
  };

  const sampleGcovJson = {
    files: [
      {
        file: 'production/sm_core.c',
        lines: [
          { line_number: 10, count: 5, function_name: 'SM_Init', unexecuted_block: false },
          { line_number: 11, count: 5, function_name: 'SM_Init', unexecuted_block: false },
          { line_number: 20, count: 0, function_name: 'SM_Step', unexecuted_block: true },
        ],
        functions: [
          { name: 'SM_Init', execution_count: 5 },
          { name: 'SM_Step', execution_count: 0 },
        ],
      },
      {
        file: 'tests/test_main.c',
        lines: [
          { line_number: 1, count: 0, function_name: 'main', unexecuted_block: true },
        ],
      },
    ],
  };

  it('measures only production code and excludes test files', () => {
    const result = parseGcovJson(sampleGcovJson, {
      verification: dummyConfig,
      safetyMode: false,
    });

    expect(result.statement.status).toBe('FAIL');
    expect(result.statement.details.total).toBe(3);
    expect(result.statement.details.covered).toBe(2);
    expect(result.statement.details.measuredPercent).toBeCloseTo(66.67, 1);
    expect(result.statement.details.uncovered).toHaveLength(1);
    expect(result.statement.details.uncovered[0].file).toBe('production/sm_core.c');
    expect(result.statement.details.uncovered[0].line).toBe(20);
    expect(result.statement.details.uncovered[0].functionName).toBe('SM_Step');
  });

  it('fails when measured coverage is below the required target threshold', () => {
    const result = parseGcovJson(sampleGcovJson, {
      verification: dummyConfig,
      safetyMode: false,
    });

    expect(result.statement.status).toBe('FAIL');
    expect(result.statement.summary).toContain('below threshold');
  });

  it('passes when measured coverage meets or exceeds the required target threshold', () => {
    const perfectGcovJson = {
      files: [
        {
          file: 'production/sm_core.c',
          lines: [
            { line_number: 1, count: 1, function_name: 'fn', unexecuted_block: false },
          ],
          functions: [{ name: 'fn', execution_count: 1 }],
        },
      ],
    };

    const result = parseGcovJson(perfectGcovJson, {
      verification: dummyConfig,
      safetyMode: false,
    });

    expect(result.statement.status).toBe('PASS');
    expect(result.statement.details.measuredPercent).toBe(100);
  });

  it('evaluates MC/DC as NOT_APPLICABLE for non-safety or when requireMcdc is false', () => {
    const result = parseGcovJson(sampleGcovJson, {
      verification: { ...dummyConfig, requireMcdc: false },
      safetyMode: false,
    });

    expect(result.mcdc.status).toBe('NOT_APPLICABLE');
    expect(result.mcdc.summary).toContain('not applicable');
  });

  it('evaluates MC/DC as NOT_RUN when requireMcdc is true but tool report lacks MC/DC', () => {
    const result = parseGcovJson(sampleGcovJson, {
      verification: { ...dummyConfig, requireMcdc: true },
      safetyMode: true,
    });

    expect(result.mcdc.status).toBe('NOT_RUN');
    expect(result.mcdc.summary).toContain('not supported');
  });

  it('parses llvm-cov export JSON format cleanly', () => {
    const sampleLlvmJson = {
      data: [
        {
          files: [
            {
              filename: 'production/sm_safety.c',
              summary: {
                lines: { count: 10, covered: 10, percent: 100 },
                branches: { count: 4, covered: 4, percent: 100 },
              },
            },
            {
              filename: 'tests/test_support.c',
              summary: {
                lines: { count: 50, covered: 10, percent: 20 },
                branches: { count: 20, covered: 2, percent: 10 },
              },
            },
          ],
        },
      ],
    };

    const result = parseLlvmCovJson(sampleLlvmJson, {
      verification: dummyConfig,
      safetyMode: false,
    });

    expect(result.statement.status).toBe('PASS');
    expect(result.statement.details.total).toBe(10);
    expect(result.statement.details.covered).toBe(10);
    expect(result.statement.details.measuredPercent).toBe(100);
    expect(result.branch.status).toBe('PASS');
    expect(result.branch.details.measuredPercent).toBe(100);
  });
});
