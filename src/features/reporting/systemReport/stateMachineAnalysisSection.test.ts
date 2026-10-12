import { describe, expect, it } from 'vitest';
import type { SMAnalysisResult } from '../../../utils/smAnalysisEngine';
import { ReportNumbering } from './numbering';
import { renderStateMachineAnalysisHtml } from './stateMachineAnalysisSection';

function analysis(overrides: Partial<SMAnalysisResult> = {}): SMAnalysisResult {
  return {
    criticalPaths: [{ id: 'CP-1', name: 'Start <up>', states: ['Idle', 'Run'], transitions: ['go'], complexity: 3, description: 'Longest route' }],
    cornerCases: [{ id: 'CC-1', category: 'deadlock', severity: 'critical', elementId: 'x', elementName: 'Stuck', description: 'No exit', recommendation: 'Add one' }],
    testScenarios: [{
      id: 'TS-1', name: 'Reach Run', category: 'critical_path', preconditions: ['Powered'],
      steps: [{ action: 'start = true', expected: 'Run' }], expectedResult: 'Running',
    }],
    metrics: { totalPaths: 1, maxPathLength: 2, stateReachability: 100, branchCoverage: 100 },
    diagnostics: [],
    semantic: { tickMs: 100, stateCount: 2, transitionCount: 1 },
    ...overrides,
  } as unknown as SMAnalysisResult;
}

describe('renderStateMachineAnalysisHtml', () => {
  it('emits the critical path, corner case and test scenario parts as h3 headings, escaped', () => {
    const html = renderStateMachineAnalysisHtml(analysis());
    expect(html.match(/<h3>/g)).toHaveLength(3);
    expect(html).toContain('<h3>Critical Path Analysis</h3>');
    expect(html).toContain('<h3>Corner Case &amp; Behaviour Analysis</h3>');
    expect(html).toContain('<h3>Test Scenario Matrix</h3>');
    expect(html).toContain('Start &lt;up&gt;');
    expect(html).toContain('<span class="tag">Idle</span> &rarr; <span class="tag">Run</span>');
    expect(html).toContain('<thead>');
    expect(html).toContain('<code>start = true</code>');
  });

  it('adds the diagnostics part and withholds results when the model is invalid', () => {
    const html = renderStateMachineAnalysisHtml(analysis({
      criticalPaths: [], cornerCases: [], testScenarios: [],
      diagnostics: [{ severity: 'error', code: 'SM_BAD', message: 'broken' }] as any,
    }));
    expect(html.startsWith('<h3>Semantic Analysis Diagnostics</h3>')).toBe(true);
    expect(html).toContain('SM_BAD');
    expect(html).toContain('not run because semantic validation failed');
    expect(html).toContain('No test scenarios were derived');
  });

  it('is numbered below its section by the system report numbering', () => {
    const numbering = new ReportNumbering();
    const out = numbering.numberSubheadings(renderStateMachineAnalysisHtml(analysis()), '9');
    expect(out).toContain('<h3 id="sec-9-1"><span class="sec-no">9.1</span> Critical Path Analysis</h3>');
    expect(out).toContain('id="sec-9-3"');
    expect(numbering.toc.map(e => e.number)).toEqual(['9.1', '9.2', '9.3']);
    expect(numbering.toc[1].title).toBe('Corner Case & Behaviour Analysis');
  });
});
