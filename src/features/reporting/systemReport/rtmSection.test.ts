import { describe, expect, it } from 'vitest';
import { createEmptyRepository } from '../../../engine/sysml/model';
import { buildTraceabilityMatrix, computeCoverageMetrics } from '../../../engine/sysml/rtm';
import { ReportNumbering } from './numbering';
import { RTM_GRID_MAX_COLUMNS, renderRtmSection, rowPercentages } from './rtmSection';
import { richRepository } from './systemReport.fixture';

function render(repo = richRepository()): { html: string; numbering: ReportNumbering } {
  const matrix = buildTraceabilityMatrix(repo);
  const numbering = new ReportNumbering();
  const html = renderRtmSection({ repository: repo, matrix, metrics: computeCoverageMetrics(matrix), modelHash: 'h1', repositoryRevision: repo.revision }, numbering);
  return { html, numbering };
}

/** column name -> glyph letters, for one requirement row of the first grid table. */
function gridRow(html: string, reqId: string): Record<string, string> {
  const table = /<table class="data rtm-grid"[\s\S]*?<\/table>/.exec(html)![0];
  const cols = [...table.matchAll(/<span class="grid-col">([^<]*)<small>/g)].map(m => m[1]);
  const row = new RegExp(`<tr class="grid-row"><td><strong>${reqId}</strong>[\\s\\S]*?</tr>`).exec(table)![0];
  const cells = [...row.matchAll(/<td>([\s\S]*?)<\/td>/g)].slice(1).map(m => [...m[1].matchAll(/>([SVRDT])</g)].map(g => g[1]).join(''));
  expect(cells).toHaveLength(cols.length);
  return Object.fromEntries(cols.map((c, i) => [c, cells[i]]));
}

describe('renderRtmSection', () => {
  const { html } = render();

  it('has one table row per requirement', () => {
    const rows = html.match(/<tr class="rtm-row">/g) ?? [];
    expect(rows).toHaveLength(Object.keys(richRepository().requirements).length);
    for (const reqId of ['REQ-001', 'REQ-002', 'REQ-003', 'REQ-004']) expect(html).toContain(`<code>${reqId}</code>`);
  });

  it('shows the coverage summary cards and a status legend', () => {
    expect(html).toContain('Coverage summary');
    expect(html).toMatch(/rtm-card-value">4<\/div><div class="rtm-card-label">Requirements/);
    // REQ-001 (Vehicle) and REQ-002 (Engine, failed verification) are both satisfied: 2 of 4. (R3 defect 2: this was 25.0%.)
    expect(html).toMatch(/rtm-card-value">50\.0%<\/div><div class="rtm-card-label">Satisfied \(2 of 4\)/);
    expect(html).toMatch(/rtm-card-value">25\.0%<\/div><div class="rtm-card-label">Verified, evidence passed \(1 of 4\)/);
    expect(html).toMatch(/rtm-card-value">1<\/div><div class="rtm-card-label">Failed/);
    for (const status of ['verified', 'covered', 'uncovered', 'failed', 'stale', 'suspect', 'orphan', 'unresolved', 'unsupported']) {
      expect(html).toContain(`data-status="${status}"`);
    }
    expect(html).toContain('Status legend');
  });

  it('shows a status badge per row', () => {
    const row = (id: string) => new RegExp(`<code>${id}</code>[\\s\\S]*?</tr>`).exec(html)![0];
    expect(row('REQ-001')).toContain('data-status="verified"');
    expect(row('REQ-002')).toContain('data-status="failed"');
    expect(row('REQ-003')).toContain('data-status="uncovered"');
    expect(row('REQ-004')).toContain('data-status="orphan"');
  });

  it('lists verification cases with the result of their latest evidence', () => {
    const row = (id: string) => new RegExp(`<code>${id}</code>[\\s\\S]*?</tr>`).exec(html)![0];
    expect(row('REQ-001')).toContain('Range test <span class="ev ev-passed">passed</span>');
    expect(row('REQ-002')).toContain('Top speed test <span class="ev ev-failed">failed</span>');
    expect(row('REQ-004')).not.toContain('class="ev');
  });

  it('uses the most recent evidence when a case has several', () => {
    const repo = richRepository();
    (repo.evidence as any).ev_old = { id: 'ev_old', verificationCaseId: 'vc_top', requirementId: 'req_top', revision: 3, result: 'passed', executedAt: '2025-01-01T00:00:00Z' };
    const { html: h } = render(repo);
    expect(new RegExp('<code>REQ-002</code>[\\s\\S]*?</tr>').exec(h)![0]).toContain('Top speed test <span class="ev ev-failed">failed</span>');
  });

  it('lists derived-from, satisfied-by, refined-by and traced elements by name', () => {
    const row = (id: string) => new RegExp(`<code>${id}</code>[\\s\\S]*?</tr>`).exec(html)![0];
    expect(row('REQ-002')).toContain('derived from REQ-001 Range');
    expect(row('REQ-002')).toContain('<div>Engine</div>');
    expect(row('REQ-002')).toContain('<div>Gearbox</div>');
    expect(row('REQ-003')).toContain('<div>Drive Vehicle</div>');
  });

  it('marks S, V, R, D and T glyphs in the requirement x element grid', () => {
    expect(gridRow(html, 'REQ-001')).toEqual({
      'Drive Vehicle': '', Chassis: 'D', Engine: '', Gearbox: '', Vehicle: 'S', 'Range test': 'V', 'Top speed test': '',
    });
    expect(gridRow(html, 'REQ-002')).toEqual({
      'Drive Vehicle': '', Chassis: '', Engine: 'S', Gearbox: 'T', Vehicle: '', 'Range test': '', 'Top speed test': 'V',
    });
    expect(Object.values(gridRow(html, 'REQ-003')).join('')).toBe('R');
    expect(Object.values(gridRow(html, 'REQ-004')).join('')).toBe('');
  });

  it('computes the satisfied and verified shares from each row, not from the exclusive status buckets (defect 2)', () => {
    const repo = richRepository();
    const matrix = buildTraceabilityMatrix(repo);
    // the engine's metric counts only rows whose combined status is "covered" (REQ-002 is "failed"): 25%
    expect(computeCoverageMetrics(matrix).coveragePercent).toBe(25);
    const shares = rowPercentages(matrix);
    expect(shares).toMatchObject({ satisfied: 50, satisfiedCount: 2, verified: 25, verifiedCount: 1 });
    // a requirement that is satisfied but failed verification counts as satisfied and not verified
    const row = (id: string) => matrix.rows.find(r => r.requirement.requirementId === id)!;
    expect(row('REQ-002').satisfactionStatus).toBe('satisfied');
    expect(row('REQ-002').verificationStatus).toBe('failed');
    expect(html).toContain('Satisfied (2 of 4)');
    expect(html).toContain('Verified, evidence passed (1 of 4)');
  });

  it('marks D only for derive links to design elements and documents that in the legend and table (defect 3)', () => {
    // The fixture deliberately models rel_d2 (deriveReqt Chassis -> REQ-001); REQ-002 -> REQ-001 is req-to-req.
    const repo = richRepository();
    expect(Object.values(repo.relationships).filter(r => r.kind === 'deriveReqt').map(r => `${r.sourceId}>${r.targetId}`).sort())
      .toEqual(['blk_ch>req_range', 'req_top>req_range']);
    // the grid shows D for REQ-001 under Chassis (an element) and never for the requirement-to-requirement derive
    expect(gridRow(html, 'REQ-001').Chassis).toBe('D');
    expect(Object.values(gridRow(html, 'REQ-002')).join('')).not.toContain('D');
    // the same link is listed in the table row, so grid and table agree
    const row = (id: string) => new RegExp(`<code>${id}</code>[\\s\\S]*?</tr>`).exec(html)![0];
    expect(row('REQ-001')).toContain('derive link with Chassis');
    expect(row('REQ-002')).toContain('derived from REQ-001 Range');
    expect(row('REQ-002')).not.toContain('derive link with');
    // and the legend says what D means
    expect(html).toContain('derive link to such an element only');
    expect(html).toContain('derivations between two requirements are listed in the traceability table');
    // without the element link no D appears at all
    delete (repo.relationships as Record<string, unknown>).rel_d2;
    const { html: without } = render(repo);
    expect(without).not.toMatch(/class="glyph glyph-D" title="derive"/);
    expect(without).not.toContain('derive link with');
  });

  it('never prints a raw id', () => {
    const text = html.replace(/<[^>]+>/g, ' ');
    for (const id of ['req_range', 'blk_veh', 'vc_range', 'ev_pass', 'rel_s1', 'act_drive']) expect(text).not.toContain(id);
  });

  it('paginates the grid at 12 element columns per table', () => {
    const repo = createEmptyRepository();
    const R = repo as any;
    R.requirements.rq = { id: 'rq', kind: 'requirement', name: 'Big', namespace: [], requirementId: 'REQ-9', text: 't', status: 'approved', version: '1' };
    for (let i = 0; i < 30; i++) {
      R.definitions[`d${i}`] = { id: `d${i}`, kind: 'block', name: `Element ${String(i).padStart(2, '0')}`, namespace: [], isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [] };
      R.relationships[`r${i}`] = { id: `r${i}`, kind: 'satisfy', sourceId: `d${i}`, targetId: 'rq' };
    }
    const { html: big, numbering } = render(repo);
    const grids = big.match(/<table class="data rtm-grid"[\s\S]*?<\/table>/g) ?? [];
    expect(grids).toHaveLength(3);
    const widths = grids.map(g => (g.match(/<span class="grid-col">/g) ?? []).length);
    expect(widths).toEqual([RTM_GRID_MAX_COLUMNS, RTM_GRID_MAX_COLUMNS, 6]);
    expect(RTM_GRID_MAX_COLUMNS).toBe(12);
    expect(numbering.tables.filter(t => t.caption.includes('Requirement to element grid'))).toHaveLength(3);
    expect(big).toContain('elements 13-24 of 30');
    // every page repeats the requirement rows
    for (const g of grids) expect(g.match(/<tr class="grid-row">/g)).toHaveLength(1);
  });

  it('yields only "Not modelled" for an empty matrix', () => {
    const { html: empty } = render(createEmptyRepository());
    expect(empty).toBe('<p class="not-modelled">Not modelled in this project.</p>');
  });
});
