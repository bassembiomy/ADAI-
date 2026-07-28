import { describe, expect, it } from 'vitest';
import { analyzeSemanticModel } from '../smAnalysisEngine';
import { buildSemanticModel } from './smSemanticBuilder';
import {
  flatOrFixture,
  historyFixture,
  nestedAndFixture,
} from './smFixtures';
import {
  generateSemanticReport,
  renderTestingReport,
} from './smReports';

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
});
