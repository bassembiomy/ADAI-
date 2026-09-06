import type { SMCStandard } from './smModel';
import {
  type ActivityEvidence,
  type CommandEvidence,
} from './smVerificationEvidence';
import { runTool } from './smToolRunner';

export interface AnalysisToolConfig {
  toolId: string;
  executable: string;
  args?: readonly string[];
  rules?: readonly string[];
  env?: Record<string, string>;
}

export interface AnalysisRunnerRequest {
  activity: 'static-analysis' | 'misra-analysis';
  sourceDir: string;
  standard: SMCStandard;
  tool: AnalysisToolConfig;
  outputFile?: string;
  timeoutMs?: number;
}

export interface FindingLocation {
  file: string;
  line: number;
  column: number;
  ruleId: string;
  severity: 'mandatory' | 'required' | 'advisory' | 'info' | 'warning' | 'error';
  message: string;
}

export interface AnalysisDeviation {
  ruleId: string;
  file?: string;
  line?: number;
  justification: string;
}

export interface AnalysisSuppression {
  ruleId: string;
  file?: string;
  line?: number;
  reason: string;
}

export interface AnalysisFinding {
  ruleId: string;
  severity: 'mandatory' | 'required' | 'advisory' | 'info' | 'warning' | 'error';
  message: string;
  file: string;
  line: number;
  column: number;
  suppressed?: boolean;
  suppressionReason?: string;
  deviationJustification?: string;
}

export interface AnalysisEvidenceDetails {
  tool: string;
  version: string | null;
  rules: readonly string[];
  mandatoryCount: number;
  requiredCount: number;
  advisoryCount: number;
  deviations: readonly AnalysisDeviation[];
  suppressions: readonly AnalysisSuppression[];
  locations: readonly FindingLocation[];
}

export interface SMAnalysisAdapter {
  probe(): Promise<{ available: boolean; tool: string; version: string | null }>;
  run(request: AnalysisRunnerRequest): Promise<ActivityEvidence<AnalysisEvidenceDetails>>;
}

const ALLOWED_TOKENS = new Set(['sourceDir', 'outputFile', 'standard']);

export function validateAnalyzerArgs(args: readonly string[] = []): void {
  for (const arg of args) {
    const matches = arg.matchAll(/\{([^{}]+)\}/g);
    for (const match of matches) {
      const token = match[1];
      if (!ALLOWED_TOKENS.has(token)) {
        throw new Error(
          `Unknown token in analyzer arguments: {${token}}. Allowed tokens are {sourceDir}, {outputFile}, {standard}.`,
        );
      }
    }
  }
}

export function substituteTokens(
  args: readonly string[] = [],
  tokens: { sourceDir: string; outputFile: string; standard: string },
): string[] {
  return args.map((arg) =>
    arg
      .replaceAll('{sourceDir}', tokens.sourceDir)
      .replaceAll('{outputFile}', tokens.outputFile)
      .replaceAll('{standard}', tokens.standard),
  );
}

export function normalizeAnalysisEvidence(params: {
  activity: 'static-analysis' | 'misra-analysis';
  tool: string;
  version?: string | null;
  rules?: readonly string[];
  findings: readonly AnalysisFinding[];
  command?: CommandEvidence | null;
}): ActivityEvidence<AnalysisEvidenceDetails> {
  const { activity, tool, version = null, rules = [], findings, command = null } = params;

  let mandatoryCount = 0;
  let requiredCount = 0;
  let advisoryCount = 0;
  let activeMandatoryCount = 0;
  let activeRequiredCount = 0;
  const deviations: AnalysisDeviation[] = [];
  const suppressions: AnalysisSuppression[] = [];
  const locations: FindingLocation[] = [];

  for (const finding of findings) {
    locations.push({
      file: finding.file,
      line: finding.line,
      column: finding.column,
      ruleId: finding.ruleId,
      severity: finding.severity,
      message: finding.message,
    });

    const isMandatory = finding.severity === 'mandatory' || finding.severity === 'error';
    const isRequired = finding.severity === 'required' || finding.severity === 'warning';

    if (isMandatory) {
      mandatoryCount++;
    } else if (isRequired) {
      requiredCount++;
    } else {
      advisoryCount++;
    }

    if (finding.deviationJustification) {
      deviations.push({
        ruleId: finding.ruleId,
        file: finding.file,
        line: finding.line,
        justification: finding.deviationJustification,
      });
    }

    if (finding.suppressed) {
      suppressions.push({
        ruleId: finding.ruleId,
        file: finding.file,
        line: finding.line,
        reason: finding.suppressionReason ?? 'Suppressed without explicit justification',
      });
    }

    const isCovered = Boolean(finding.deviationJustification || finding.suppressed);
    if (!isCovered) {
      if (isMandatory) {
        activeMandatoryCount++;
      } else if (isRequired) {
        activeRequiredCount++;
      }
    }
  }

  const status = (activeMandatoryCount === 0 && activeRequiredCount === 0) ? 'PASS' : 'FAIL';
  const summary = status === 'PASS'
    ? `${activity} passed: 0 unsuppressed mandatory/required violations (${advisoryCount} advisory, ${deviations.length} deviations, ${suppressions.length} suppressions).`
    : `${activity} failed: ${activeMandatoryCount} unsuppressed mandatory, ${activeRequiredCount} unsuppressed required violations found.`;

  return {
    activity,
    status,
    summary,
    command,
    details: {
      tool,
      version,
      rules,
      mandatoryCount,
      requiredCount,
      advisoryCount,
      deviations,
      suppressions,
      locations,
    },
  };
}

export function createGenericAnalysisAdapter(
  config: AnalysisToolConfig,
): SMAnalysisAdapter {
  validateAnalyzerArgs(config.args ?? []);

  return {
    async probe() {
      const result = await runTool({
        executable: config.executable,
        args: ['--version'],
        cwd: process.cwd(),
        timeoutMs: 5000,
        versionArgs: ['--version'],
      });

      if (!result.available || result.command.exitCode !== 0) {
        return {
          available: false,
          tool: config.toolId,
          version: null,
        };
      }

      const versionMatch = result.command.stdout.match(/\b\d+\.\d+(?:\.\d+)?\b/);
      return {
        available: true,
        tool: config.toolId,
        version: versionMatch ? versionMatch[0] : null,
      };
    },

    async run(request: AnalysisRunnerRequest) {
      const outputFile = request.outputFile
        ?? (request.sourceDir ? `${request.sourceDir.replace(/[/\\]+$/, '')}/analysis_output.json` : 'analysis_output.json');

      const args = substituteTokens(config.args ?? [], {
        sourceDir: request.sourceDir,
        outputFile,
        standard: request.standard,
      });

      const result = await runTool({
        executable: config.executable,
        args,
        cwd: request.sourceDir,
        env: config.env,
        timeoutMs: request.timeoutMs ?? 60_000,
        versionArgs: ['--version'],
      });

      if (!result.available) {
        return {
          activity: request.activity,
          status: 'NOT_RUN',
          summary: `Configured analysis tool '${config.executable}' is not available on host: ${result.command.stderr || 'Command not found'}`,
          command: result.command,
          details: {
            tool: config.toolId,
            version: null,
            rules: config.rules ?? [],
            mandatoryCount: 0,
            requiredCount: 0,
            advisoryCount: 0,
            deviations: [],
            suppressions: [],
            locations: [],
          },
        };
      }

      return normalizeAnalysisEvidence({
        activity: request.activity,
        tool: config.toolId,
        version: result.command.toolVersion,
        rules: config.rules ?? [],
        findings: [],
        command: result.command,
      });
    },
  };
}

export interface CFunctionMetrics {
  name: string;
  file?: string;
  cyclomaticComplexity: number;
  nestingDepth: number;
  linesOfCode: number;
  parameterCount: number;
  stackEstimateBytes: number | 'NOT_RUN';
}

/**
 * Calculates code metrics for functions in a C source string:
 * - Cyclomatic complexity (decision points)
 * - Maximum nesting depth
 * - Lines of code (body length)
 * - Parameter count
 * - Stack estimate (NOT_RUN when unsupported)
 */
export function calculateCFunctionMetrics(
  source: string,
  filename?: string,
): CFunctionMetrics[] {
  const results: CFunctionMetrics[] = [];

  // Match function signatures: return type, name, (params), followed by {
  // Exclude keywords like if, for, while, switch
  const funcRegex = /(?:^|\n)\s*(?:(?:static|inline|extern)\s+)*([a-zA-Z_][a-zA-Z0-9_*\s]+?)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(([\s\S]*?)\)\s*\{/g;

  const reservedKeywords = new Set([
    'if', 'for', 'while', 'switch', 'else', 'return', 'sizeof',
  ]);

  let match: RegExpExecArray | null;
  while ((match = funcRegex.exec(source)) !== null) {
    const funcName = match[2];
    if (reservedKeywords.has(funcName)) {
      continue;
    }

    const paramStr = match[3].trim();
    let parameterCount = 0;
    if (paramStr && paramStr !== 'void') {
      parameterCount = paramStr.split(',').length;
    }

    const bodyStartIndex = match.index + match[0].length - 1; // index of '{'
    let braceCount = 0;
    let maxDepth = 0;
    let bodyEndIndex = -1;

    for (let i = bodyStartIndex; i < source.length; i++) {
      const char = source[i];
      if (char === '{') {
        braceCount++;
        if (braceCount > maxDepth) {
          maxDepth = braceCount;
        }
      } else if (char === '}') {
        braceCount--;
        if (braceCount === 0) {
          bodyEndIndex = i;
          break;
        }
      }
    }

    if (bodyEndIndex === -1) {
      continue;
    }

    const body = source.slice(bodyStartIndex, bodyEndIndex + 1);
    const bodyLines = body.split('\n');
    const linesOfCode = bodyLines.length;

    // Cyclomatic complexity starts at 1
    let complexity = 1;
    // Count branching tokens: if, for, while, case, &&, ||, ?
    const decisionMatches = body.match(/\b(if|for|while|case)\b|&&|\|\||\?/g);
    if (decisionMatches) {
      complexity += decisionMatches.length;
    }

    // Function nesting depth relative to function scope: maxDepth - 1
    const nestingDepth = Math.max(0, maxDepth - 1);

    results.push({
      name: funcName,
      file: filename,
      cyclomaticComplexity: complexity,
      nestingDepth,
      linesOfCode,
      parameterCount,
      stackEstimateBytes: 'NOT_RUN', // Unsupported stack estimation is NOT_RUN, never zero!
    });
  }

  return results;
}
