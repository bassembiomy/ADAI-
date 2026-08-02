import { describe, expect, it } from 'vitest';
import { analyzeSemanticModel } from '../smAnalysisEngine';
import { buildSemanticModel } from './smSemanticBuilder';
import {
  flatOrFixture,
  historyFixture,
  nestedAndFixture,
} from './smFixtures';
import {
  DEFAULT_VERIFICATION_EVIDENCE,
  generateSemanticReport,
  renderStaticMetricsReport,
  renderTestingReport,
} from './smReports';
import { hybridXBridgesFixture } from './smFixtures';

const analyzedUnreachableFixture = () => {
  const model = flatOrFixture();
  model.states.push({
    ...model.states[1],
    id: 'unreachable',
    name: 'Unreachable',
    priority: 3,
  });
  model.layers[0].stateIds.push('unreachable');
  const built = buildSemanticModel(model);
  if (built.ir === undefined) {
    throw new Error(`fixture failed to build: ${JSON.stringify(built.diagnostics)}`);
  }
  return analyzeSemanticModel(built.ir);
};

describe('semantic state-machine reports', () => {
  it('uses one reachability result in every report section', () => {
    const report = generateSemanticReport(analyzedUnreachableFixture());

    expect(report.testing.reachabilityPercent).toBe(2 / 3 * 100);
    expect(report.testing.reachabilityPercent)
      .toBe(report.staticMetrics.reachabilityPercent);
    expect(report.testing.unreachableStateIds)
      .toEqual(report.staticMetrics.unreachableStateIds);
  });

  it('labels verification evidence honestly', () => {
    const rendered = renderTestingReport(analyzedUnreachableFixture(), {
      structural: 'pass',
      semantic: 'pass',
      hostCompile: 'pass',
      hostRuntime: 'pass',
      differential: 'pass',
      embeddedCompile: 'not-run',
      targetHardware: 'pending',
    });

    expect(rendered).toContain('Embedded compilation: NOT RUN');
    expect(rendered).toContain('Target hardware: PENDING');
    expect(rendered).toContain('Differential trace: PASS');
    expect(rendered).not.toMatch(/MISRA[- ]C(?:\:2012)? compliant/i);
  });

  it('counts every child of a nested AND layer as reachable', () => {
    const built = buildSemanticModel(nestedAndFixture());
    if (built.ir === undefined) {
      throw new Error(`fixture failed to build: ${JSON.stringify(built.diagnostics)}`);
    }

    const analysis = analyzeSemanticModel(built.ir);

    expect(analysis.semantic.unreachableStateIds).toEqual([]);
    expect(analysis.metrics.stateReachability).toBe(100);
  });

  it('follows history-first entry through the owner default path', () => {
    const model = historyFixture('shallow');
    model.states.find((state) => state.id === 'workspace')!.autostart = false;
    model.states.find((state) => state.id === 'outside')!.autostart = true;
    const built = buildSemanticModel(model);
    if (built.ir === undefined) {
      throw new Error(`fixture failed to build: ${JSON.stringify(built.diagnostics)}`);
    }

    const analysis = analyzeSemanticModel(built.ir);

    expect(analysis.semantic.reachableStateIds).toContain('workspace');
    expect(analysis.semantic.reachableStateIds).toContain('parent_b');
  });

  it('does not traverse outgoing transitions from quiescent terminal states', () => {
    const model = flatOrFixture();
    model.states[0].isTerminalState = true;
    const built = buildSemanticModel(model);
    if (built.ir === undefined) {
      throw new Error(`fixture failed to build: ${JSON.stringify(built.diagnostics)}`);
    }

    const analysis = analyzeSemanticModel(built.ir);

    expect(analysis.semantic.reachableStateIds).toEqual(['a']);
    expect(analysis.semantic.unreachableStateIds).toEqual(['b']);
    expect(analysis.criticalPaths.flatMap((path) => path.states)).not.toContain('B');
  });

  it('distinguishes static and dynamic reachability in testing reports', () => {
    const failedReport = renderTestingReport(analyzedUnreachableFixture(), {
      structural: 'pass',
      semantic: 'pass',
      hostCompile: 'fail',
      hostRuntime: 'not-run',
      differential: 'not-run',
      dynamicReachability: 'fail',
      embeddedCompile: 'not-run',
      targetHardware: 'pending',
    });
    expect(failedReport).toContain('Execution mode: VALIDATION_FAILED');
    expect(failedReport).toContain('Dynamic executable reachability: FAIL');

    const verifiedReport = renderTestingReport(analyzedUnreachableFixture(), {
      structural: 'pass',
      semantic: 'pass',
      hostCompile: 'pass',
      hostRuntime: 'pass',
      differential: 'pass',
      dynamicReachability: 'pass',
      embeddedCompile: 'not-run',
      targetHardware: 'pending',
    });
    expect(verifiedReport).toContain('Execution mode: DYNAMIC_EXECUTION_VERIFIED');
    expect(verifiedReport).toContain('Dynamic executable reachability: PASS');

    const smokeOnly = renderTestingReport(analyzedUnreachableFixture(), {
      ...DEFAULT_VERIFICATION_EVIDENCE,
      hostCompile: 'pass',
      hostRuntime: 'pass',
    });
    expect(smokeOnly).toContain('Execution mode: DYNAMIC_EXECUTION_VERIFIED');
    expect(smokeOnly).toContain('Dynamic executable reachability: NOT RUN');
    expect(smokeOnly).toContain('Compiled X-Bridges execution: NOT RUN');

    const staticReport = renderTestingReport(analyzedUnreachableFixture());
    expect(staticReport).toContain('Execution mode: STATIC_ANALYSIS_ONLY');
    expect(staticReport).toContain('Dynamic executable reachability: NOT RUN');
  });

  it('reports deterministic X-Bridges code-generation evidence and limitations', () => {
    const model = hybridXBridgesFixture();
    const controller = model.states.find((state) => state.id === 'controller')!;
    controller.xBridgesModel = {
      schemaVersion: 1,
      nodes: [
        {
          id: 'source', type: 'Constant', parameters: {
            value: 1,
            inputs: [],
            outputs: [{ id: 'y', direction: 'output', shape: 'scalar', dimensions: [], dataType: 'float32' }],
          },
        },
        {
          id: 'park', type: 'PARK_TRANSFORM', parameters: {
            inputs: [{ id: 'u', direction: 'input', shape: 'scalar', dimensions: [], dataType: 'float32' }],
            outputs: [{ id: 'y', direction: 'output', shape: 'scalar', dimensions: [], dataType: 'float32' }],
          },
        },
      ],
      edges: [
        { id: 'source-to-park', sourceNodeId: 'source', sourcePortId: 'y', targetNodeId: 'park', targetPortId: 'u' },
      ],
      mappings: [],
      solver: { kind: 'rk4', stepSeconds: 0.002 },
      policy: { memory: 'reset', numericFault: 'signal-only' },
    };
    const built = buildSemanticModel(model);
    if (!built.ir) throw new Error(`fixture failed to build: ${JSON.stringify(built.diagnostics)}`);
    const analysis = analyzeSemanticModel(built.ir);

    const report = generateSemanticReport(
      analysis,
      DEFAULT_VERIFICATION_EVIDENCE,
      built.ir,
    );
    expect(report.xBridges).toMatchObject({
      blockCount: 2,
      solvers: [{ stateId: 'controller', kind: 'rk4', stepSeconds: 0.002, substepsPerTick: 5 }],
      numericTypes: ['float32'],
      capabilityDependencies: ['math-library'],
      unsupportedCapabilities: [],
    });
    expect(report.xBridges.estimatedStaticMemoryLowerBoundBytes).toBeGreaterThan(0);
    expect(report.xBridges.memoryEstimateAccuracy)
      .toBe('lower-bound-excludes-padding');

    const testing = renderTestingReport(
      analysis,
      DEFAULT_VERIFICATION_EVIDENCE,
      built.ir,
    );
    expect(testing).toContain('Execution mode: STATIC_ANALYSIS_ONLY');
    expect(testing).toContain('X-Bridges blocks: 2');
    expect(testing).toContain('Required target capabilities: math-library');
    expect(testing).toContain('Compiled X-Bridges execution: NOT RUN');

    const metrics = renderStaticMetricsReport(analysis, [], built.ir);
    expect(metrics).toContain('Estimated X-Bridges static memory lower bound:');
    expect(metrics).toContain('excludes target ABI padding and linker allocation');
    expect(metrics).toContain('Solver: controller: rk4, 0.002 s, 5 substeps/tick');
    expect(metrics).toContain('Numeric types: float32');
    expect(metrics).toContain('Unsupported embedded capabilities: None');
  });

  it('scopes unsupported capabilities to model-used operations, counts operation evaluations per tick, and renders state traceability', () => {
    const model = hybridXBridgesFixture();
    model.states[0].autostart = false;
    const controller = model.states.find((state) => state.id === 'controller')!;
    controller.autostart = true;
    const scalarPort = (id: string, direction: 'input' | 'output') => ({
      id, direction, shape: 'scalar' as const, dimensions: [], dataType: 'float32' as const,
    });
    controller.xBridgesModel = {
      schemaVersion: 1,
      nodes: [
        { id: 'constant1', type: 'Constant', parameters: { value: 1, inputs: [], outputs: [scalarPort('y', 'output')] } },
        { id: 'constant2', type: 'Constant', parameters: { value: 2, inputs: [], outputs: [scalarPort('y', 'output')] } },
        { id: 'sum', type: 'Sum', parameters: { signs: '++', inputs: [scalarPort('a', 'input'), scalarPort('b', 'input')], outputs: [scalarPort('y', 'output')] } },
        { id: 'terminator', type: 'TERMINATOR', parameters: { inputs: [scalarPort('u', 'input')], outputs: [] } },
      ],
      edges: [
        { id: 'c1_sum', sourceNodeId: 'constant1', sourcePortId: 'y', targetNodeId: 'sum', targetPortId: 'a' },
        { id: 'c2_sum', sourceNodeId: 'constant2', sourcePortId: 'y', targetNodeId: 'sum', targetPortId: 'b' },
        { id: 'sum_term', sourceNodeId: 'sum', sourcePortId: 'y', targetNodeId: 'terminator', targetPortId: 'u' },
      ],
      mappings: [],
      solver: { kind: 'euler', stepSeconds: 0.0002 },
      policy: { memory: 'reset', numericFault: 'signal-only' },
    };
    const built = buildSemanticModel(model);
    if (!built.ir) throw new Error(`model build failed: ${JSON.stringify(built.diagnostics)}`);
    const analysis = analyzeSemanticModel(built.ir);

    const report = generateSemanticReport(analysis, DEFAULT_VERIFICATION_EVIDENCE, built.ir);
    expect(report.xBridges.unsupportedCapabilities).toEqual([]);
    expect(report.xBridges.operationEvaluationsPerTick).toBe(200);

    const testing = renderTestingReport(analysis, DEFAULT_VERIFICATION_EVIDENCE, built.ir);
    expect(testing).toContain('| State name | Model ID | C enum | Layer | X-Bridges |');
    expect(testing).toContain('| Controller | controller | SM_ST_CONTROLLER | root | yes |');
    expect(testing).not.toContain('LMS_ADAPTIVE_FILTER');
  });

  it('does not claim compiled X-Bridges execution from differential evidence alone', () => {
    const evidence = {
      ...DEFAULT_VERIFICATION_EVIDENCE,
      differential: 'pass' as const,
      hostCompile: 'not-run' as const,
      hostRuntime: 'not-run' as const,
    };

    const rendered = renderTestingReport(analyzedUnreachableFixture(), evidence);

    expect(rendered).toContain('Execution mode: STATIC_ANALYSIS_ONLY');
    expect(rendered).toContain('Differential trace: PASS');
    expect(rendered).toContain('Compiled X-Bridges execution: NOT RUN');
  });
});
