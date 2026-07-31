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
      embeddedCompile: 'not-run',
      targetHardware: 'pending',
    });
    expect(verifiedReport).toContain('Execution mode: DYNAMIC_EXECUTION_VERIFIED');
    expect(verifiedReport).toContain('Dynamic executable reachability: PASS');

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
          id: 'sine', type: 'SIN', parameters: {
            inputs: [{ id: 'u', direction: 'input', shape: 'scalar', dimensions: [], dataType: 'float32' }],
            outputs: [{ id: 'y', direction: 'output', shape: 'scalar', dimensions: [], dataType: 'float32' }],
          },
        },
      ],
      edges: [{ id: 'source-to-sine', sourceNodeId: 'source', sourcePortId: 'y', targetNodeId: 'sine', targetPortId: 'u' }],
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
    });
    expect(report.xBridges.staticMemoryBytes).toBeGreaterThan(0);
    expect(report.xBridges.unsupportedCapabilities).toContain(
      'LMS_ADAPTIVE_FILTER: Online learning is not in the embedded-safe set.',
    );

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
    expect(metrics).toContain('X-Bridges static memory bytes:');
    expect(metrics).toContain('Solver: controller: rk4, 0.002 s, 5 substeps/tick');
    expect(metrics).toContain('Numeric types: float32');
    expect(metrics).toContain('Unsupported embedded capabilities:');
  });
});
