import type { SMCStandard } from './smModel';
import {
  type ActivityEvidence,
  type CommandEvidence,
} from './smVerificationEvidence';
import { getNodeBuiltin, runTool, type ToolRunResult } from './smToolRunner';

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

/* ------------------------------------------------------------------------------------------------
 * Built-in cppcheck adapters: static analysis ('cppcheck') and MISRA C:2012 ('cppcheck-misra').
 * ---------------------------------------------------------------------------------------------- */

export const CPPCHECK_TOOL_ID = 'cppcheck';
export const CPPCHECK_MISRA_TOOL_ID = 'cppcheck-misra';

/** MISRA rules accepted as documented deviations of the generated code (see MISRA_DEVIATIONS.md). */
export const ACCEPTED_MISRA_DEVIATIONS: Readonly<Record<string, string>> = {
  '15.5': 'Advisory rule 15.5 (single point of exit): early returns for guard clauses and fault handling; bounded and reviewed (MISRA_DEVIATIONS.md).',
};

const MISRA_MANDATORY_RULES = new Set([
  '9.1', '12.5', '13.6', '17.3', '17.4', '17.6', '19.1', '21.13', '21.17', '21.18', '21.19', '21.20', '22.2', '22.4', '22.5',
]);
const MISRA_ADVISORY_RULES = new Set([
  '1.2', '2.3', '2.4', '2.5', '2.6', '2.7', '4.2', '5.9', '8.7', '8.9', '8.11', '8.13', '10.5', '11.4', '11.5', '12.1',
  '12.3', '12.4', '13.3', '13.4', '15.1', '15.4', '15.5', '17.5', '17.8', '18.4', '18.5', '19.2', '20.1', '20.5', '20.10', '21.12',
]);

const misraSeverity = (rule: string): AnalysisFinding['severity'] =>
  MISRA_MANDATORY_RULES.has(rule) ? 'mandatory' : MISRA_ADVISORY_RULES.has(rule) ? 'advisory' : 'required';

const MISRA_ADDON_CANDIDATES = [
  '/usr/lib/x86_64-linux-gnu/cppcheck/addons/misra.py',
  '/usr/lib/aarch64-linux-gnu/cppcheck/addons/misra.py',
  '/usr/lib/cppcheck/addons/misra.py',
  '/usr/share/cppcheck/addons/misra.py',
  '/usr/local/share/Cppcheck/addons/misra.py',
  '/usr/local/share/cppcheck/addons/misra.py',
  '/opt/homebrew/share/cppcheck/addons/misra.py',
  'C:\\Program Files\\Cppcheck\\addons\\misra.py',
];

const cppcheckStandard = (standard: SMCStandard): string =>
  standard === 'c90' ? 'c89' : standard;

const productionSourceNames = (sourceDir: string): string[] => {
  const fs = getNodeBuiltin('node:fs');
  if (!fs) return [];
  try {
    return (fs.readdirSync(sourceDir) as string[])
      .filter((name) => name.endsWith('.c') && !/stub|test|harness/i.test(name))
      .sort();
  } catch {
    return [];
  }
};

const findMisraAddon = (): string | null => {
  const fs = getNodeBuiltin('node:fs');
  if (!fs) return null;
  const override = typeof process !== 'undefined' ? process.env?.ADIA_MISRA_PY : undefined;
  for (const candidate of [...(override ? [override] : []), ...MISRA_ADDON_CANDIDATES]) {
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch {
      // keep looking
    }
  }
  return null;
};

const emptyDetails = (tool: string, version: string | null, rules: readonly string[]): AnalysisEvidenceDetails => ({
  tool,
  version,
  rules,
  mandatoryCount: 0,
  requiredCount: 0,
  advisoryCount: 0,
  deviations: [],
  suppressions: [],
  locations: [],
});

const notRun = (
  activity: AnalysisRunnerRequest['activity'],
  reason: string,
  tool: string,
  rules: readonly string[],
  command: CommandEvidence | null = null,
): ActivityEvidence<AnalysisEvidenceDetails> => ({
  activity,
  status: 'NOT_RUN',
  summary: reason,
  command,
  details: emptyDetails(tool, null, rules),
});

const CPPCHECK_TEMPLATE = '{file}:{line}:{column}:{severity}:{id}:{message}';
const CPPCHECK_STATIC_CLASSES = 'warning,style,performance,portability';

export const parseCppcheckFindings = (output: string): AnalysisFinding[] => {
  const findings: AnalysisFinding[] = [];
  for (const line of output.split(/\r?\n/)) {
    const match = /^(.+?):(\d+):(\d+):(error|warning|style|performance|portability|information):([A-Za-z0-9_.-]+):(.*)$/.exec(line);
    if (!match) continue;
    findings.push({
      file: match[1],
      line: Number(match[2]),
      column: Number(match[3]),
      severity: match[4] === 'error' ? 'error' : 'warning',
      ruleId: match[5],
      message: match[6].trim(),
    });
  }
  return findings;
};

const baseName = (file: string): string => file.replace(/^.*[\\/]/, '');

export const parseMisraReport = (output: string): Array<{ file: string; line: number; rule: string }> => {
  const violations: Array<{ file: string; line: number; rule: string }> = [];
  for (const line of output.split(/\r?\n/)) {
    const match = /^\[(.+?):(\d+)\].*\[misra-c2012-(\d+\.\d+)\]/.exec(line)
      ?? /^(\S+?):(\d+):\d+: \w+: .*\[misra-c2012-(\d+\.\d+)\]/.exec(line);
    if (match) violations.push({ file: baseName(match[1]), line: Number(match[2]), rule: match[3] });
  }
  return violations;
};

const probeCppcheck = async (): Promise<{ available: boolean; version: string | null }> => {
  const result = await runTool({ executable: 'cppcheck', args: ['--version'], cwd: '.', timeoutMs: 10_000 });
  const version = /\b\d+\.\d+(?:\.\d+)?\b/.exec(result.command.stdout)?.[0] ?? null;
  return { available: result.available && result.command.exitCode === 0, version };
};

export function createCppcheckStaticAdapter(): SMAnalysisAdapter {
  return {
    async probe() {
      const cppcheck = await probeCppcheck();
      return { available: cppcheck.available, tool: CPPCHECK_TOOL_ID, version: cppcheck.version };
    },
    async run(request) {
      const rules = CPPCHECK_STATIC_CLASSES.split(',').map((rule) => `--enable=${rule}`);
      const cppcheck = await probeCppcheck();
      if (!cppcheck.available) {
        return notRun(request.activity, "cppcheck is not available on this host (command 'cppcheck --version' failed); static analysis not run.", CPPCHECK_TOOL_ID, rules);
      }
      const sources = productionSourceNames(request.sourceDir);
      if (sources.length === 0) {
        return notRun(request.activity, `No production C sources found in ${request.sourceDir}; static analysis not run.`, CPPCHECK_TOOL_ID, rules);
      }
      const result = await runTool({
        executable: 'cppcheck',
        args: [
          `--enable=${CPPCHECK_STATIC_CLASSES}`,
          '--error-exitcode=1',
          `--std=${cppcheckStandard(request.standard)}`,
          '--inline-suppr',
          '--quiet',
          `--template=${CPPCHECK_TEMPLATE}`,
          '-I.',
          ...sources,
        ],
        cwd: request.sourceDir,
        timeoutMs: request.timeoutMs ?? 240_000,
        maxBufferBytes: 16 * 1024 * 1024,
      });
      if (!result.available) {
        return notRun(request.activity, 'cppcheck is not available on this host; static analysis not run.', CPPCHECK_TOOL_ID, rules, result.command);
      }
      const findings = parseCppcheckFindings(`${result.command.stderr}\n${result.command.stdout}`);
      const evidence = normalizeAnalysisEvidence({
        activity: request.activity,
        tool: CPPCHECK_TOOL_ID,
        version: cppcheck.version,
        rules,
        findings,
        command: result.command,
      });
      const failed = result.timedOut || result.command.exitCode !== 0 || findings.length > 0;
      if (!failed) return evidence;
      const listed = findings.slice(0, 10).map((finding) => `${finding.file}:${finding.line} ${finding.ruleId}`).join('; ');
      return {
        ...evidence,
        status: 'FAIL',
        summary: result.timedOut
          ? 'static-analysis failed: cppcheck timed out.'
          : `static-analysis failed: cppcheck reported ${findings.length} finding(s) (exit code ${result.command.exitCode})${listed ? `: ${listed}` : ''}.`,
      };
    },
  };
}

export function createCppcheckMisraAdapter(): SMAnalysisAdapter {
  return {
    async probe() {
      const cppcheck = await probeCppcheck();
      return { available: cppcheck.available && findMisraAddon() !== null, tool: CPPCHECK_MISRA_TOOL_ID, version: cppcheck.version };
    },
    async run(request) {
      const rules = ['MISRA C:2012 (cppcheck misra.py addon)'];
      const cppcheck = await probeCppcheck();
      if (!cppcheck.available) {
        return notRun(request.activity, "cppcheck is not available on this host (command 'cppcheck --version' failed); MISRA analysis not run.", CPPCHECK_MISRA_TOOL_ID, rules);
      }
      const addon = findMisraAddon();
      if (addon === null) {
        return notRun(request.activity, 'The cppcheck MISRA addon (misra.py) was not found; set ADIA_MISRA_PY or install cppcheck with its addons. MISRA analysis not run.', CPPCHECK_MISRA_TOOL_ID, rules);
      }
      const sources = productionSourceNames(request.sourceDir);
      if (sources.length === 0) {
        return notRun(request.activity, `No production C sources found in ${request.sourceDir}; MISRA analysis not run.`, CPPCHECK_MISRA_TOOL_ID, rules);
      }
      const dumps: string[] = [];
      for (const source of sources) {
        const dump = await runTool({
          executable: 'cppcheck',
          args: ['--dump', `--std=${cppcheckStandard(request.standard)}`, '--quiet', '-I.', source],
          cwd: request.sourceDir,
          timeoutMs: request.timeoutMs ?? 240_000,
          maxBufferBytes: 16 * 1024 * 1024,
        });
        if (!dump.available || dump.command.exitCode !== 0) {
          return {
            activity: request.activity,
            status: 'FAIL',
            summary: `misra-analysis failed: cppcheck --dump failed on ${source} (exit code ${dump.command.exitCode}).`,
            command: dump.command,
            details: emptyDetails(CPPCHECK_MISRA_TOOL_ID, cppcheck.version, rules),
          };
        }
        dumps.push(`${source}.dump`);
      }
      let report: ToolRunResult | null = null;
      for (const python of ['python3', 'python']) {
        report = await runTool({
          executable: python,
          args: [addon, ...dumps],
          cwd: request.sourceDir,
          timeoutMs: request.timeoutMs ?? 240_000,
          maxBufferBytes: 16 * 1024 * 1024,
        });
        if (report.available) break;
      }
      const fs = getNodeBuiltin('node:fs');
      const directory = request.sourceDir.replace(/[\\/]+$/, '');
      for (const dump of dumps) {
        try {
          fs?.rmSync(`${directory}/${dump}`, { force: true });
          fs?.rmSync(`${directory}/${dump.replace(/\.dump$/, '.ctu-info')}`, { force: true });
        } catch {
          // best-effort cleanup
        }
      }
      if (report === null || !report.available) {
        return notRun(request.activity, 'python3 is not available on this host; the MISRA addon cannot run. MISRA analysis not run.', CPPCHECK_MISRA_TOOL_ID, rules);
      }
      const violations = parseMisraReport(`${report.command.stdout}\n${report.command.stderr}`);
      const accepted = violations.filter((violation) => ACCEPTED_MISRA_DEVIATIONS[violation.rule] !== undefined);
      const active = violations.filter((violation) => ACCEPTED_MISRA_DEVIATIONS[violation.rule] === undefined);
      const locations: FindingLocation[] = active.map((violation) => ({
        file: violation.file,
        line: violation.line,
        column: 0,
        ruleId: violation.rule,
        severity: misraSeverity(violation.rule),
        message: `MISRA C:2012 rule ${violation.rule}`,
      }));
      const acceptedRules = [...new Set(accepted.map((violation) => violation.rule))].sort();
      const deviations: AnalysisDeviation[] = acceptedRules.map((rule) => ({
        ruleId: rule,
        justification: `${ACCEPTED_MISRA_DEVIATIONS[rule]} (${accepted.filter((violation) => violation.rule === rule).length} occurrences)`,
      }));
      const details: AnalysisEvidenceDetails = {
        tool: CPPCHECK_MISRA_TOOL_ID,
        version: cppcheck.version,
        rules,
        mandatoryCount: locations.filter((location) => location.severity === 'mandatory').length,
        requiredCount: locations.filter((location) => location.severity === 'required').length,
        advisoryCount: locations.filter((location) => location.severity === 'advisory').length + accepted.length,
        deviations,
        suppressions: [],
        locations,
      };
      if (active.length === 0) {
        return {
          activity: request.activity,
          status: 'PASS',
          summary: `misra-analysis passed: no violations besides ${accepted.length} accepted deviation(s)${acceptedRules.length ? ` of rule ${acceptedRules.join(', ')}` : ''}.`,
          command: report.command,
          details,
        };
      }
      const listed = active.slice(0, 20).map((violation) => `${violation.rule} ${violation.file}:${violation.line}`).join('; ');
      return {
        activity: request.activity,
        status: 'FAIL',
        summary: `misra-analysis failed: ${active.length} violation(s) not covered by an accepted deviation: ${listed}${active.length > 20 ? '; ...' : ''}.`,
        command: report.command,
        details,
      };
    },
  };
}

/** Dispatches on the configured tool id; an id without a built-in runner reports NOT_RUN honestly. */
export function createDefaultAnalysisAdapter(): SMAnalysisAdapter {
  const staticAdapter = createCppcheckStaticAdapter();
  const misraAdapter = createCppcheckMisraAdapter();
  return {
    probe: () => staticAdapter.probe(),
    async run(request) {
      if (request.tool.toolId === CPPCHECK_TOOL_ID) return staticAdapter.run(request);
      if (request.tool.toolId === CPPCHECK_MISRA_TOOL_ID) return misraAdapter.run(request);
      return notRun(
        request.activity,
        `No built-in runner for tool id '${request.tool.toolId}'; supported ids are '${CPPCHECK_TOOL_ID}' and '${CPPCHECK_MISRA_TOOL_ID}'. Analysis not run.`,
        request.tool.toolId,
        request.tool.rules ?? [],
      );
    },
  };
}
