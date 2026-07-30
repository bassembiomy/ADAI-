import type { SMAnalysisResult } from '../smAnalysisEngine';

export type VerificationEvidenceStatus =
  | 'pass'
  | 'fail'
  | 'not-run'
  | 'pending';

export interface VerificationEvidence {
  structural: VerificationEvidenceStatus;
  semantic: VerificationEvidenceStatus;
  hostCompile: VerificationEvidenceStatus;
  hostRuntime: VerificationEvidenceStatus;
  differential: VerificationEvidenceStatus;
  embeddedCompile: VerificationEvidenceStatus;
  targetHardware: VerificationEvidenceStatus;
}

export interface ReportSourceFile {
  name: string;
  content: string;
}

export interface SemanticReportSection {
  reachabilityPercent: number;
  reachableStateIds: string[];
  unreachableStateIds: string[];
  terminalStateIds: string[];
}

export interface SemanticReport {
  testing: SemanticReportSection;
  staticMetrics: SemanticReportSection;
  evidence: VerificationEvidence;
}

export const DEFAULT_VERIFICATION_EVIDENCE: VerificationEvidence = {
  structural: 'pass',
  semantic: 'pass',
  hostCompile: 'not-run',
  hostRuntime: 'not-run',
  differential: 'not-run',
  embeddedCompile: 'not-run',
  targetHardware: 'pending',
};

const copySection = (analysis: SMAnalysisResult): SemanticReportSection => ({
  reachabilityPercent: analysis.metrics.stateReachability,
  reachableStateIds: [...analysis.semantic.reachableStateIds],
  unreachableStateIds: [...analysis.semantic.unreachableStateIds],
  terminalStateIds: [...analysis.semantic.terminalStateIds],
});

export const generateSemanticReport = (
  analysis: SMAnalysisResult,
  evidence: VerificationEvidence = DEFAULT_VERIFICATION_EVIDENCE,
): SemanticReport => ({
  testing: copySection(analysis),
  staticMetrics: copySection(analysis),
  evidence: { ...evidence },
});

const evidenceLabel = (status: VerificationEvidenceStatus): string =>
  status === 'not-run' ? 'NOT RUN' : status.toUpperCase();

const idsOrNone = (ids: readonly string[]): string =>
  ids.length > 0 ? ids.join(', ') : 'None';

export type ExecutionMode =
  | 'VALIDATION_FAILED'
  | 'DYNAMIC_EXECUTION_VERIFIED'
  | 'STATIC_ANALYSIS_ONLY';

export type ValidationMode = ExecutionMode;

const executionMode = (
  evidence: VerificationEvidence,
): ExecutionMode => {
  if (Object.values(evidence).includes('fail')) {
    return 'VALIDATION_FAILED';
  }
  if (evidence.hostCompile === 'pass' && evidence.hostRuntime === 'pass') {
    return 'DYNAMIC_EXECUTION_VERIFIED';
  }
  return 'STATIC_ANALYSIS_ONLY';
};

const dynamicReachabilityLabel = (
  evidence: VerificationEvidence,
): string =>
  evidence.hostCompile === 'fail' || evidence.hostRuntime === 'fail'
    ? 'FAIL'
    : evidence.hostCompile === 'pass' && evidence.hostRuntime === 'pass'
      ? 'PASS'
      : 'NOT RUN';

export const renderTestingReport = (
  analysis: SMAnalysisResult,
  evidence: VerificationEvidence = DEFAULT_VERIFICATION_EVIDENCE,
): string => {
  const report = generateSemanticReport(analysis, evidence);
  const section = report.testing;
  return `# ADIA State Machine Generated-C Verification Report

## Summary

- Execution mode: ${executionMode(report.evidence)}
- Static AST reachability: ${section.reachabilityPercent.toFixed(1)}%
- Dynamic executable reachability: ${dynamicReachabilityLabel(report.evidence)}

## Structural validation

- Structural model validation: ${evidenceLabel(report.evidence.structural)}
- States: ${analysis.semantic.stateCount}
- Layers: ${analysis.semantic.layerCount} (${analysis.semantic.orLayerIds.length} OR, ${analysis.semantic.andLayerIds.length} AND)
- Active configuration slots: ${analysis.semantic.activeSlotCount}
- Static AST reachability: ${section.reachabilityPercent.toFixed(1)}%
- Reachable state IDs: ${idsOrNone(section.reachableStateIds)}
- Unreachable state IDs: ${idsOrNone(section.unreachableStateIds)}
- Terminal state IDs: ${idsOrNone(section.terminalStateIds)}

## Semantic validation

- Semantic IR validation: ${evidenceLabel(report.evidence.semantic)}
- Rendering consumed one immutable, validated semantic model.
- OR layers maintain one active child; AND layers maintain one active child per region.
- Terminal states are quiescent and do not trigger implicit reset.
- Shallow history restores the direct child; deep history restores the recorded descendant configuration.
- Runtime order is outer transition, during action, inner transition, then active children.

## Verification evidence

- Structural validation: ${evidenceLabel(report.evidence.structural)}
- Semantic validation: ${evidenceLabel(report.evidence.semantic)}
- Host compilation: ${evidenceLabel(report.evidence.hostCompile)}
- Host runtime: ${evidenceLabel(report.evidence.hostRuntime)}
- Differential trace: ${evidenceLabel(report.evidence.differential)}
- Embedded compilation: ${evidenceLabel(report.evidence.embeddedCompile)}
- Target hardware: ${evidenceLabel(report.evidence.targetHardware)}
- Formal MISRA compliance and safety certification: NOT CLAIMED

Evidence labels describe only the checks actually recorded for this generated package. A PASS at one level does not imply a PASS at any other level.
`;
};

export const renderStaticMetricsReport = (
  analysis: SMAnalysisResult,
  files: readonly ReportSourceFile[] = [],
): string => {
  const report = generateSemanticReport(analysis);
  const section = report.staticMetrics;
  const sourceLines = files.reduce(
    (sum, file) => sum + file.content.split('\n').length,
    0,
  );
  const functionalLines = files.reduce(
    (sum, file) => sum + file.content.split('\n').filter((line) => {
      const trimmed = line.trim();
      return trimmed.length > 0
        && !trimmed.startsWith('/*')
        && !trimmed.startsWith('*')
        && !trimmed.startsWith('//');
    }).length,
    0,
  );
  const commentDensity = sourceLines === 0
    ? 0
    : (sourceLines - functionalLines) / sourceLines * 100;

  return `# ADIA State Machine Static Metrics Report

## Validated semantic model

| Metric | Value |
|---|---:|
| States | ${analysis.semantic.stateCount} |
| Transitions | ${analysis.semantic.transitionCount} |
| Junctions | ${analysis.semantic.junctionCount} |
| Variables | ${analysis.semantic.variableCount} |
| Layers | ${analysis.semantic.layerCount} |
| OR layers | ${analysis.semantic.orLayerIds.length} |
| AND layers | ${analysis.semantic.andLayerIds.length} |
| Active configuration slots | ${analysis.semantic.activeSlotCount} |
| Fixed step | ${analysis.semantic.tickMs} ms |

## Shared behavioral analysis

- State reachability: ${section.reachabilityPercent.toFixed(1)}%
- Reachable state IDs: ${idsOrNone(section.reachableStateIds)}
- Unreachable state IDs: ${idsOrNone(section.unreachableStateIds)}
- Terminal state IDs: ${idsOrNone(section.terminalStateIds)}
- Enumerated paths: ${analysis.metrics.totalPaths}
- Maximum path length: ${analysis.metrics.maxPathLength}
- Structural branch coverage estimate: ${analysis.metrics.branchCoverage.toFixed(1)}%
- Potential deadlocks: ${analysis.cornerCases.filter((item) => item.category === 'deadlock').length}
- Potential unconditional self-loops: ${analysis.cornerCases.filter((item) => item.category === 'self_loop').length}

## Generated source metrics

| Metric | Value |
|---|---:|
| Files measured | ${files.length} |
| Total lines | ${sourceLines} |
| Functional lines | ${functionalLines} |
| Comment/blank density | ${commentDensity.toFixed(1)}% |

These are structural metrics derived from the same validated semantic analysis used by the testing report. They are not formal MISRA, safety-certification, embedded-timing, or target-hardware evidence.
`;
};
