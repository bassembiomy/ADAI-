import type { SMAnalysisResult } from '../../../utils/smAnalysisEngine';
import { escapeHtml } from '../reportDiagramModel';

const th = (cells: string[]): string => `<thead><tr>${cells.map(c => `<th>${c}</th>`).join('')}</tr></thead>`;

/**
 * Pure HTML for the state-machine analysis (diagnostics, critical paths, corner cases, test scenarios).
 * Each part is an `<h3>`; the system report numbers them as sub-sections of the section it is placed in.
 */
export function renderStateMachineAnalysisHtml(analysis: SMAnalysisResult): string {
  const errors = analysis.diagnostics.filter(d => d.severity === 'error');
  let html = '';

  if (errors.length > 0) {
    html += '<h3>Semantic Analysis Diagnostics</h3>';
    html += '<p class="analysis-error">Semantic analysis was not completed because the model is invalid. The sections below are not verification evidence.</p>';
    html += `<ul>${errors.map(d => `<li><strong>${escapeHtml(d.code)}</strong>: ${escapeHtml(d.message)}</li>`).join('')}</ul>`;
  }

  html += '<h3>Critical Path Analysis</h3>';
  html += '<p>The execution path analysis evaluates the longest and most complex functional routes (critical batches) through the state machine.</p>';
  if (analysis.criticalPaths.length > 0) {
    html += `<table class="data">${th(['ID', 'Name', 'Execution sequence', 'Complexity'])}<tbody>${analysis.criticalPaths.map(cp =>
      `<tr><td><code>${escapeHtml(cp.id)}</code></td>`
      + `<td><strong>${escapeHtml(cp.name)}</strong><div class="req-text">${escapeHtml(cp.description)}</div></td>`
      + `<td>${cp.states.map(s => `<span class="tag">${escapeHtml(s)}</span>`).join(' &rarr; ')}</td>`
      + `<td class="num">${escapeHtml(String(cp.complexity))}</td></tr>`).join('')}</tbody></table>`;
  } else if (errors.length > 0) {
    html += '<p><em>Critical-path analysis was not run because semantic validation failed.</em></p>';
  } else {
    html += '<p><em>No critical paths identified. Check if an autostart state is configured.</em></p>';
  }

  html += '<h3>Corner Case &amp; Behaviour Analysis</h3>';
  html += '<p>Systematic audit of risk-prone states, deadlock conditions, race risks, and boundaries in the designed logic.</p>';
  if (analysis.cornerCases.length > 0) {
    html += `<table class="data">${th(['ID', 'Category', 'Severity', 'Element', 'Description', 'Recommendation'])}<tbody>${analysis.cornerCases.map(cc => {
      const cls = cc.severity === 'critical' ? 'bad' : cc.severity === 'warning' ? 'warn' : 'info';
      return `<tr><td><code>${escapeHtml(cc.id)}</code></td><td>${escapeHtml(cc.category)}</td>`
        + `<td><span class="badge badge-${cls}">${escapeHtml(cc.severity.toUpperCase())}</span></td>`
        + `<td><strong>${escapeHtml(cc.elementName)}</strong></td><td>${escapeHtml(cc.description)}</td><td>${escapeHtml(cc.recommendation)}</td></tr>`;
    }).join('')}</tbody></table>`;
  } else if (errors.length > 0) {
    html += '<p class="analysis-error">Corner-case analysis was not run because semantic validation failed.</p>';
  } else {
    html += '<p class="analysis-ok">&check; The validated semantic model has no structurally detected deadlocks, unreachable states, or unconditional loops. Runtime and target verification remain separate evidence gates.</p>';
  }

  html += '<h3>Test Scenario Matrix</h3>';
  html += errors.length > 0
    ? '<p class="analysis-error">No test scenarios were derived because semantic validation failed.</p>'
    : '<p>Structurally derived test scenarios for critical paths and detected corner cases. Execute them in host, differential, embedded, and target-hardware gates before treating them as runtime evidence.</p>';
  for (const ts of analysis.testScenarios) {
    html += `<div class="scenario-card"><div class="scenario-head"><span class="tag tag-accent">${escapeHtml(ts.category.toUpperCase())}</span> ${escapeHtml(ts.name)} <code class="scenario-id">${escapeHtml(ts.id)}</code></div>`;
    if (ts.preconditions.length > 0) {
      html += `<div><strong>Preconditions:</strong><ul>${ts.preconditions.map(p => `<li>${escapeHtml(p)}</li>`).join('')}</ul></div>`;
    }
    html += `<table class="data">${th(['Step', 'Action / input stimulus', 'Expected transition / output state'])}<tbody>${ts.steps.map((step, i) =>
      `<tr><td class="num">${i + 1}</td><td><code>${escapeHtml(step.action)}</code></td><td>${escapeHtml(step.expected)}</td></tr>`).join('')}</tbody></table>`;
    html += `<div class="analysis-ok"><strong>Expected outcome:</strong> ${escapeHtml(ts.expectedResult)}</div></div>`;
  }
  return html;
}
