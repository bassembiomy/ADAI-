import { describe, expect, it } from 'vitest';
import type { DiagramPresentation } from '../../engine/sysml/presentationState';
import { renderRequirementDiagramViews } from './reportRequirementDiagrams';
import { buildSystemReport } from './systemReport/buildSystemReport';
import { richHierarchy, richReportInput, richRepository } from './systemReport/systemReport.fixture';

const idsOf = (html: string): string[] => [...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);
const hrefsOf = (html: string): string[] => [...html.matchAll(/\shref="#([^"]+)"/g)].map(m => m[1]);

function presentation(diagramId: string, placed: Record<string, { x: number; y: number }>): DiagramPresentation {
  return {
    elementIds: Object.keys(placed),
    presentations: Object.fromEntries(Object.entries(placed).map(([id, at]) => [id, {
      id: `presentation:${diagramId}:${id}`, diagramId, semanticElementId: id, bounds: { ...at, width: 200, height: 110 },
    }])),
  };
}

function withDiagrams() {
  const repository = richRepository();
  repository.diagrams.req_perf = { id: 'req_perf', kind: 'diagram', name: 'Performance', namespace: [], ownerId: 'pkg_struct', diagramKind: 'requirements' };
  repository.diagrams.req_safety = { id: 'req_safety', kind: 'diagram', name: 'Safety', namespace: [], ownerId: 'pkg_struct', diagramKind: 'requirements' };
  const presentations = {
    req_perf: presentation('req_perf', { req_range: { x: 400, y: 40 }, req_top: { x: 100, y: 300 } }),
    req_safety: presentation('req_safety', { req_safe: { x: 0, y: 0 } }),
  };
  return { repository, presentations };
}

describe('renderRequirementDiagramViews', () => {
  it('draws one framed figure per Requirement diagram with the presented elements at their canvas positions', () => {
    const { repository, presentations } = withDiagrams();
    const h = richHierarchy();
    const relationships = [...h.relationships, { id: 'hrel_dr', sourceId: 'req_noise', targetId: 'req_range', type: 'derive' as const, label: '' }];
    presentations.req_perf = presentation('req_perf', { req_range: { x: 400, y: 40 }, req_top: { x: 100, y: 300 }, req_noise: { x: 700, y: 300 } });
    const views = renderRequirementDiagramViews({ repository, blocks: h.blocks, relationships, presentations, hrefFor: id => `#req-${id}` });

    expect(views.map(v => v.name)).toEqual(['Performance', 'Safety']);
    const perf = views[0];
    expect(perf.frameLabel).toBe('req [Package] Structure [Performance]');
    expect(perf.html).toContain('req [Package] Structure [Performance]');
    // Presented requirements keep the positions saved in the diagram.
    expect(perf.html).toMatch(/data-node-id="req_range" data-x="400" data-y="40"/);
    expect(perf.html).toMatch(/data-node-id="req_top" data-x="100" data-y="300"/);
    // Only what this diagram presents (plus the elements related to it) is drawn; the safety requirement is not.
    expect(perf.elementIds).toContain('req_range');
    expect(perf.elementIds).not.toContain('req_safe');
    expect(views[1].elementIds).toEqual(['req_safe']);
    // SysML notation: Id / Text compartments, «deriveReqt» keyword, requirement boxes link to their specification.
    expect(perf.html).toContain('Id = &quot;REQ-001&quot;');
    expect(perf.html).toContain('«deriveReqt»');
    expect(perf.html).toContain('marker-start="url(#requirement-containment-crosshair)"');
    expect(perf.html).toContain('href="#req-req_range"');
  });

  it('lays out presented elements that have no saved position instead of dropping them', () => {
    const { repository } = withDiagrams();
    const h = richHierarchy();
    const presentations = { req_perf: { elementIds: ['req_range', 'req_top'], presentations: {} } as unknown as DiagramPresentation };
    const [perf] = renderRequirementDiagramViews({ repository, blocks: h.blocks, relationships: h.relationships, presentations });
    expect(perf.html).toContain('data-node-id="req_range"');
    expect(perf.html).toContain('data-node-id="req_top"');
  });

  it('does not dump every requirement into an empty diagram when other diagrams hold them', () => {
    const { repository, presentations } = withDiagrams();
    repository.diagrams.req_main = { id: 'req_main', kind: 'diagram', name: 'Main', namespace: [], ownerId: 'model', diagramKind: 'requirements' };
    const h = richHierarchy();
    const main = renderRequirementDiagramViews({ repository, blocks: h.blocks, relationships: h.relationships, presentations }).find(v => v.name === 'Main')!;
    expect(main.elementIds).toEqual([]);
    expect(main.html).not.toContain('<figure');
    // When it is the only requirement diagram, the overview is drawn (paged by the overview renderer) instead.
    const only = richRepository();
    only.diagrams.req_main = repository.diagrams.req_main;
    const [overview] = renderRequirementDiagramViews({ repository: only, blocks: h.blocks, relationships: h.relationships });
    expect(overview.html).toContain('<figure');
    expect(overview.elementIds).toContain('req_range');
  });

  it('returns no view when the model has no Requirement diagram', () => {
    const h = richHierarchy();
    expect(renderRequirementDiagramViews({ repository: richRepository(), blocks: h.blocks, relationships: h.relationships })).toEqual([]);
  });
});

describe('buildSystemReport: requirements as drawn, connected to their specifications', () => {
  const { repository, presentations } = withDiagrams();
  const html = buildSystemReport({ ...richReportInput(), repository, diagramPresentations: presentations });

  it('gives every requirement diagram its own numbered subsection and figure', () => {
    expect(html).toMatch(/<h4 id="sec-3-1-1"><span class="sec-no">3\.1\.1<\/span> Performance<\/h4>/);
    expect(html).toMatch(/<h4 id="sec-3-1-2"><span class="sec-no">3\.1\.2<\/span> Safety<\/h4>/);
    expect(html).toContain('Requirements diagram · req [Package] Structure [Performance]');
  });

  it('writes one specification per requirement with its relationships and the diagrams that show it', () => {
    const spec = /<div class="req-spec" id="req-req_range">[\s\S]*?<\/div>\n<\/div>/.exec(html)![0];
    expect(spec).toContain('The system shall travel 400 km on one charge.');
    expect(spec).toMatch(/<th>Contains<\/th><td><a href="#req-req_top">REQ-002 Top speed<\/a>/);
    const child = /<div class="req-spec" id="req-req_top">[\s\S]*?<\/div>\n<\/div>/.exec(html)![0];
    expect(child).toMatch(/<th>Contained in<\/th><td><a href="#req-req_range">REQ-001 Range<\/a>/);
    expect(spec).toContain('Satisfied by');
    expect(spec).toContain('Verified by');
    expect(spec).toContain('Shown on: <a href="#sec-3-1-1">Performance</a>');
  });

  it('links the requirement table and the traceability matrix to the specifications, and every link resolves', () => {
    const table = /<table class="data req-table"[\s\S]*?<\/table>/.exec(html)![0];
    expect(table).toContain('href="#req-req_range"');
    const rtm = /<table class="data rtm-table"[\s\S]*?<\/table>/.exec(html)![0];
    expect(rtm).toContain('href="#req-req_range"');
    const ids = new Set(idsOf(html));
    for (const target of hrefsOf(html)) expect(ids.has(target), `anchor #${target}`).toBe(true);
    const all = idsOf(html);
    expect(new Set(all).size).toBe(all.length);
  });
});

describe('buildSystemReport: page fit', () => {
  it('scales HMI panels to the page width and keeps them inside the paper border', () => {
    const html = buildSystemReport(richReportInput({
      extraSections: [{ id: 'proto', title: 'Interactive System Prototype', html: '<div class="hmi-fit" data-w="1400" data-h="600"><div class="hmi-canvas-wrapper" style="width: 1400px; height: 600px;"></div></div>' }],
    }));
    expect(html).toContain('<div class="hmi-fit" data-w="1400" data-h="600">');
    expect(html).toContain("querySelectorAll('.hmi-fit')");
    expect(html).toContain("addEventListener('beforeprint',fitHmi)");
    expect(html).toMatch(/\.hmi-reference svg \{ max-width:100%; height:auto;/);
    expect(html).toMatch(/\.hmi-sim-container \{ max-width:100%; overflow:hidden; \}/);
    // Long identifiers and code wrap inside table cells instead of pushing tables past the page border.
    expect(html).toContain('.report td, .report th { overflow-wrap:anywhere; }');
  });
});
