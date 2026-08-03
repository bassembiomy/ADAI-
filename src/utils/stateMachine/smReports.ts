import type { SMAnalysisResult } from '../smAnalysisEngine';
import { XB_CAPABILITIES } from './xbCapabilities';
import type { SemanticModel } from './smSemanticModel';
import type { XBNumericType } from './xbNumeric';

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
  dynamicReachability: VerificationEvidenceStatus;
  embeddedCompile: VerificationEvidenceStatus;
  targetHardware: VerificationEvidenceStatus;
  targetCompile?: VerificationEvidenceStatus;
  linkedImage?: VerificationEvidenceStatus;
  flash?: VerificationEvidenceStatus;
  selfTest?: VerificationEvidenceStatus;
  externalHil?: VerificationEvidenceStatus;
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
  xBridges: XBridgesReport;
}

export interface XBridgesReport {
  stateCount: number;
  blockCount: number;
  estimatedStaticMemoryLowerBoundBytes: number;
  memoryEstimateAccuracy: 'lower-bound-excludes-padding';
  solvers: Array<{
    stateId: string;
    kind: 'euler' | 'rk4';
    stepSeconds: number;
    substepsPerTick: number;
  }>;
  numericTypes: string[];
  capabilityDependencies: string[];
  unsupportedCapabilities: string[];
  operationEvaluationsPerTick: number;
}

export const DEFAULT_VERIFICATION_EVIDENCE: VerificationEvidence = {
  structural: 'pass',
  semantic: 'pass',
  hostCompile: 'not-run',
  hostRuntime: 'not-run',
  differential: 'not-run',
  dynamicReachability: 'not-run',
  embeddedCompile: 'not-run',
  targetHardware: 'pending',
};

const copySection = (analysis: SMAnalysisResult): SemanticReportSection => ({
  reachabilityPercent: analysis.metrics.stateReachability,
  reachableStateIds: [...analysis.semantic.reachableStateIds],
  unreachableStateIds: [...analysis.semantic.unreachableStateIds],
  terminalStateIds: [...analysis.semantic.terminalStateIds],
});

const numericTypeLabel = (type: XBNumericType): string => {
  if (type.kind === 'fixed') {
    return `${type.signed ? 's' : 'u'}fix${type.wordLength}_En${type.fractionLength}`;
  }
  return type.kind === 'float' ? type.precision : type.kind;
};

const numericStorageBytes = (type: XBNumericType): number => {
  if (type.kind === 'fixed') {
    return type.wordLength <= 8 ? 1 : type.wordLength <= 16 ? 2 : 4;
  }
  if (type.kind === 'boolean') return 1;
  const precision = type.kind === 'float' ? type.precision : type.kind;
  return precision === 'float64' ? 8 : 4;
};

const buildXBridgesReport = (ir?: SemanticModel): XBridgesReport => {
  const states = ir === undefined ? [] : Object.values(ir.states)
    .filter((state) => state.xBridges !== null)
    .sort((left, right) => left.id.localeCompare(right.id));
  const numericTypes = new Set<string>();
  const dependencies = new Set<string>();
  const usedOperationTypes = new Set<string>();
  let blockCount = 0;
  let staticMemoryBytes = 0;
  let operationEvaluationsPerTick = 0;
  for (const state of states) {
    const xb = state.xBridges!;
    blockCount += xb.executionOrder.length;
    operationEvaluationsPerTick += xb.executionOrder.length * xb.solver.substepsPerTick;
    for (const signal of Object.values(xb.signals)) {
      numericTypes.add(numericTypeLabel(signal.numericType));
      staticMemoryBytes += numericStorageBytes(signal.numericType) * signal.elementCount;
      if (signal.numericType.kind === 'fixed') staticMemoryBytes += 9 * signal.elementCount;
    }
    for (const operationId of xb.executionOrder) {
      const operation = xb.operations[operationId];
      usedOperationTypes.add(operation.type);
      staticMemoryBytes += 4;
      if (operation.outputSignalIds.length > 0) staticMemoryBytes += 1;
      for (const slot of operation.state?.slots ?? []) {
        numericTypes.add(numericTypeLabel(slot.numericType));
        staticMemoryBytes += numericStorageBytes(slot.numericType)
          * slot.initialValues.length;
      }
      for (const dependency of XB_CAPABILITIES[operation.type]
        ?.requiredTargetCapabilities ?? []) dependencies.add(dependency);
    }
  }
  return {
    stateCount: states.length,
    blockCount,
    estimatedStaticMemoryLowerBoundBytes: staticMemoryBytes,
    memoryEstimateAccuracy: 'lower-bound-excludes-padding',
    solvers: states.map((state) => ({
      stateId: state.id,
      kind: state.xBridges!.solver.kind,
      stepSeconds: state.xBridges!.solver.stepSeconds,
      substepsPerTick: state.xBridges!.solver.substepsPerTick,
    })),
    numericTypes: [...numericTypes].sort(),
    capabilityDependencies: [...dependencies].sort(),
    unsupportedCapabilities: [...usedOperationTypes]
      .filter((type) => XB_CAPABILITIES[type]?.codegen !== true)
      .sort()
      .map((type) => `${type}: ${XB_CAPABILITIES[type]?.reason ?? 'Not supported.'}`),
    operationEvaluationsPerTick,
  };
};

export const generateSemanticReport = (
  analysis: SMAnalysisResult,
  evidence: VerificationEvidence = DEFAULT_VERIFICATION_EVIDENCE,
  ir?: SemanticModel,
): SemanticReport => ({
  testing: copySection(analysis),
  staticMetrics: copySection(analysis),
  evidence: { ...evidence },
  xBridges: buildXBridgesReport(ir),
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
  evidence.dynamicReachability === 'fail'
    ? 'FAIL'
    : evidence.dynamicReachability === 'pass'
      ? 'PASS'
      : 'NOT RUN';

const compiledXBridgesEvidence = (
  evidence: VerificationEvidence,
): VerificationEvidenceStatus => {
  const required = [
    evidence.hostCompile,
    evidence.hostRuntime,
    evidence.differential,
  ];
  if (required.includes('fail')) return 'fail';
  return required.every((status) => status === 'pass') ? 'pass' : 'not-run';
};

const escapeMarkdown = (value: string): string => value
  .replaceAll('|', '\\|')
  .replace(/[\r\n]+/g, ' ');

const renderStateTraceabilityTable = (ir?: SemanticModel): string => {
  if (ir === undefined) return '';
  const states = Object.values(ir.states).sort((left, right) =>
    left.activityIndex - right.activityIndex);
  if (states.length === 0) return '';
  const rows = states.map((state) => {
    const name = escapeMarkdown(state.name);
    const id = escapeMarkdown(state.id);
    const enumName = escapeMarkdown(state.enumName);
    const layer = escapeMarkdown(state.parentStateId ?? 'root');
    const xBridges = state.xBridges !== null ? 'yes' : 'no';
    return `| ${name} | ${id} | ${enumName} | ${layer} | ${xBridges} |`;
  });
  return [
    '## State traceability',
    '',
    '| State name | Model ID | C enum | Layer | X-Bridges |',
    '|---|---|---|---|---|',
    ...rows,
    '',
  ].join('\n');
};

export const renderTestingReport = (
  analysis: SMAnalysisResult,
  evidence: VerificationEvidence = DEFAULT_VERIFICATION_EVIDENCE,
  ir?: SemanticModel,
): string => {
  const report = generateSemanticReport(analysis, evidence, ir);
  const section = report.testing;
  const xb = report.xBridges;

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
- Compiled X-Bridges execution: ${evidenceLabel(compiledXBridgesEvidence(report.evidence))}
- Embedded compilation: ${evidenceLabel(report.evidence.embeddedCompile)}
- Target hardware: ${evidenceLabel(report.evidence.targetHardware)}
- Formal MISRA compliance and safety certification: NOT CLAIMED

Evidence labels describe only the checks actually recorded for this generated package. A PASS at one level does not imply a PASS at any other level.

## X-Bridges code generation

- X-Bridges states: ${xb.stateCount}
- X-Bridges blocks: ${xb.blockCount}
- Operation evaluations per tick: ${xb.operationEvaluationsPerTick}
- Estimated X-Bridges static memory lower bound: ${xb.estimatedStaticMemoryLowerBoundBytes} bytes (${xb.memoryEstimateAccuracy}; excludes target ABI padding and linker allocation)
- Solver: ${xb.solvers.length === 0 ? 'None' : xb.solvers.map((solver) => `${solver.stateId}: ${solver.kind}, ${solver.stepSeconds} s, ${solver.substepsPerTick} substeps/tick`).join('; ')}
- Numeric types: ${idsOrNone(xb.numericTypes)}
- Required target capabilities: ${idsOrNone(xb.capabilityDependencies)}
- Unsupported embedded capabilities: ${idsOrNone(xb.unsupportedCapabilities)}

${renderStateTraceabilityTable(ir)}`;
};

export const renderStaticMetricsReport = (
  analysis: SMAnalysisResult,
  files: readonly ReportSourceFile[] = [],
  ir?: SemanticModel,
): string => {
  const report = generateSemanticReport(analysis, DEFAULT_VERIFICATION_EVIDENCE, ir);
  const section = report.staticMetrics;
  const xb = report.xBridges;
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

## X-Bridges static code-generation metrics

- X-Bridges states: ${xb.stateCount}
- X-Bridges blocks: ${xb.blockCount}
- Operation evaluations per tick: ${xb.operationEvaluationsPerTick}
- Estimated X-Bridges static memory lower bound: ${xb.estimatedStaticMemoryLowerBoundBytes} bytes (${xb.memoryEstimateAccuracy}; excludes target ABI padding and linker allocation)
- Solver: ${xb.solvers.length === 0 ? 'None' : xb.solvers.map((solver) => `${solver.stateId}: ${solver.kind}, ${solver.stepSeconds} s, ${solver.substepsPerTick} substeps/tick`).join('; ')}
- Numeric types: ${idsOrNone(xb.numericTypes)}
- Required target capabilities: ${idsOrNone(xb.capabilityDependencies)}
- Unsupported embedded capabilities: ${idsOrNone(xb.unsupportedCapabilities)}

These are structural metrics derived from the same validated semantic analysis used by the testing report. They are not formal MISRA, safety-certification, embedded-timing, or target-hardware evidence.
`;
};
