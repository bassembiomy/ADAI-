import { describe, expect, it } from 'vitest';
import {
  calculateCFunctionMetrics,
  createGenericAnalysisAdapter,
  normalizeAnalysisEvidence,
  type AnalysisFinding,
  type AnalysisRunnerRequest,
  type AnalysisToolConfig,
} from './smAnalysisRunner';

describe('smAnalysisRunner', () => {
  describe('generic JSON analyzer adapter and token substitution', () => {
    it('accepts only {sourceDir}, {outputFile}, and {standard} tokens', () => {
      const validConfig: AnalysisToolConfig = {
        toolId: 'cppcheck',
        executable: 'cppcheck',
        args: ['--output-file={outputFile}', '{sourceDir}', '--std={standard}'],
      };

      const adapter = createGenericAnalysisAdapter(validConfig);
      expect(adapter).toBeDefined();

      const invalidConfig: AnalysisToolConfig = {
        toolId: 'bad_tool',
        executable: 'bad_tool',
        args: ['{sourceDir}', '{unknownToken}'],
      };

      expect(() => createGenericAnalysisAdapter(invalidConfig)).toThrowError(
        /Unknown token.*\{unknownToken\}/,
      );
    });

    it('returns NOT_RUN when configured analyzer tool is unavailable on host', async () => {
      const config: AnalysisToolConfig = {
        toolId: 'non_existent_misra_tool',
        executable: 'definitely_missing_tool_binary_12345',
        args: ['{sourceDir}'],
      };

      const adapter = createGenericAnalysisAdapter(config);
      const request: AnalysisRunnerRequest = {
        activity: 'misra-analysis',
        sourceDir: 'G:/adia project/fake_sources',
        standard: 'c90',
        tool: config,
      };

      const evidence = await adapter.run(request);
      expect(evidence.activity).toBe('misra-analysis');
      expect(evidence.status).toBe('NOT_RUN');
      expect(evidence.summary).toContain('definitely_missing_tool_binary_12345');
    });
  });

  describe('evidence normalization', () => {
    it('normalizes analysis findings with mandatory/required/advisory counts and locations', () => {
      const findings: readonly AnalysisFinding[] = [
        {
          ruleId: 'Rule 8.1',
          severity: 'mandatory',
          message: 'Types shall be explicitly specified',
          file: 'sm_core.c',
          line: 42,
          column: 5,
        },
        {
          ruleId: 'Rule 11.4',
          severity: 'required',
          message: 'A conversion should not be performed between a pointer to object and an integer type',
          file: 'sm_safety.c',
          line: 120,
          column: 10,
          deviationJustification: 'Hardware memory-mapped register pointer conversion',
        },
        {
          ruleId: 'Rule 2.2',
          severity: 'advisory',
          message: 'Dead code detected',
          file: 'sm_user_logic.c',
          line: 88,
          column: 1,
          suppressed: true,
          suppressionReason: 'Guarded by compile-time configuration macro',
        },
      ];

      const evidence = normalizeAnalysisEvidence({
        activity: 'misra-analysis',
        tool: 'PC-Lint Plus',
        version: '2.0.1',
        rules: ['MISRA C:2012 Amendment 2'],
        findings,
      });

      expect(evidence.activity).toBe('misra-analysis');
      expect(evidence.status).toBe('FAIL'); // Has unsuppressed mandatory violation
      expect(evidence.details.mandatoryCount).toBe(1);
      expect(evidence.details.requiredCount).toBe(1);
      expect(evidence.details.advisoryCount).toBe(1);
      expect(evidence.details.deviations).toHaveLength(1);
      expect(evidence.details.deviations[0].justification).toContain('Hardware memory-mapped');
      expect(evidence.details.suppressions).toHaveLength(1);
      expect(evidence.details.suppressions[0].reason).toContain('compile-time');
      expect(evidence.details.locations).toHaveLength(3);
    });

    it('evaluates to PASS when there are 0 unsuppressed violations', () => {
      const evidence = normalizeAnalysisEvidence({
        activity: 'static-analysis',
        tool: 'Clang-Tidy',
        version: '18.1.0',
        rules: ['bugprone-*', 'cert-*'],
        findings: [],
      });

      expect(evidence.status).toBe('PASS');
      expect(evidence.details.mandatoryCount).toBe(0);
      expect(evidence.details.requiredCount).toBe(0);
      expect(evidence.details.advisoryCount).toBe(0);
    });
  });

  describe('C source metrics calculation', () => {
    it('normalizes cyclomatic complexity, nesting depth, function length, parameter count, and stack estimation', () => {
      const sampleCode = `
/* Header comment */
#include "sm_core.h"

static int HelperFunction(int a, int b, int c)
{
    int result = 0;
    if (a > 0) {
        if (b > 0) {
            result = a + b;
        } else {
            result = a - b;
        }
    } else {
        result = c;
    }
    return result;
}

SM_Error_t SM_Step(ADIA_Instance_t *instance, uint32_t delta_ms)
{
    if (instance == NULL) {
        return SM_ERR_NULL_INSTANCE;
    }
    for (int i = 0; i < 10; ++i) {
        if (i == 5) {
            break;
        }
    }
    return SM_ERR_NONE;
}
`;

      const metrics = calculateCFunctionMetrics(sampleCode, 'sm_core.c');

      expect(metrics).toHaveLength(2);

      const helper = metrics.find((m) => m.name === 'HelperFunction')!;
      expect(helper).toBeDefined();
      expect(helper.parameterCount).toBe(3);
      // Complexity: 1 base + if(a>0) + if(b>0) = 3
      expect(helper.cyclomaticComplexity).toBe(3);
      // Nesting: HelperFunction { if { if { } } } -> depth 2 inside body
      expect(helper.nestingDepth).toBeGreaterThanOrEqual(2);
      expect(helper.linesOfCode).toBeGreaterThan(5);
      // Unsupported stack estimate must be NOT_RUN, never zero!
      expect(helper.stackEstimateBytes).toBe('NOT_RUN');

      const step = metrics.find((m) => m.name === 'SM_Step')!;
      expect(step).toBeDefined();
      expect(step.parameterCount).toBe(2);
      // Complexity: 1 base + if(instance == NULL) + for + if(i == 5) = 4
      expect(step.cyclomaticComplexity).toBe(4);
      expect(step.stackEstimateBytes).toBe('NOT_RUN');
    });
  });
});
