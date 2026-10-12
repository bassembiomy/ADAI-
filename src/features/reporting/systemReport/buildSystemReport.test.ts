import { describe, expect, it } from 'vitest';
import { createEmptyRepository } from '../../../engine/sysml/model';
import { buildTraceabilityMatrix, computeCoverageMetrics } from '../../../engine/sysml/rtm';
import type { SystemReportInput } from './buildSystemReport';
import { buildSystemReport } from './buildSystemReport';
import { generateArchitectureReport } from '../generateArchitectureReport';
import { FIXTURE_IDS, richHierarchy, richReportInput } from './systemReport.fixture';

const idsOf = (html: string): string[] => [...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);
const hrefsOf = (html: string): string[] => [...html.matchAll(/\shref="#([^"]+)"/g)].map(m => m[1]);

function visibleText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<[^>]+>/g, ' ');
}

function figureHtml(html: string, n: number): string {
  const m = new RegExp(`<figure[^>]*id="fig-${n}"[\\s\\S]*?</figure>`).exec(html);
  expect(m, `figure ${n}`).not.toBeNull();
  return m![0];
}

/** Html of the section whose heading carries `id`, up to the next heading of the same or a higher level. */
function sectionBody(html: string, id: string): string {
  const open = new RegExp(`<h([2-6]) id="${id}"`).exec(html);
  expect(open, `heading ${id}`).not.toBeNull();
  const level = Number(open![1]);
  const rest = html.slice(open!.index + 10);
  const next = new RegExp(`<h[2-${level}] id="`).exec(rest);
  return next ? rest.slice(0, next.index) : rest;
}

const rich = buildSystemReport(richReportInput());

describe('buildSystemReport: structure', () => {
  it('is a full document with cover, document control, contents and print setup', () => {
    expect(rich.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(rich).toContain('class="cover"');
    expect(rich).toContain('System Architecture &amp; Design Report');
    expect(rich).toContain('Electric-Car-SAD-7');
    expect(rich).toContain('Prepared by');
    expect(rich).toContain('Reviewed by');
    expect(rich).toContain('Approved by');
    expect(rich).toContain('size:A4');
    expect(rich).toContain('break-before:page');
    expect(rich).toContain('display:table-header-group');
    expect(rich).toContain('<thead>');
    expect(rich).not.toMatch(/<script[^>]*src=/);
  });

  it('numbers sections 1-8, the app sections after them, and both appendices', () => {
    const titles: Record<string, string> = {
      'sec-1': 'Introduction', 'sec-2': 'Package structure', 'sec-3': 'Requirements', 'sec-4': 'Use cases',
      'sec-5': 'Structure', 'sec-6': 'Parametrics', 'sec-7': 'Behaviour', 'sec-8': 'Requirements Traceability Matrix',
      'sec-9': 'State Machine Analysis', 'sec-A': 'Diagnostics', 'sec-B': 'Glossary of SysML notation',
    };
    for (const [id, title] of Object.entries(titles)) {
      expect(rich, id).toMatch(new RegExp(`<h2 id="${id}"[^>]*><span class="sec-no">[^<]+</span> ${title}</h2>`));
    }
    expect(rich).toContain('<span class="sec-no">Appendix A</span>');
    expect(rich).toContain('<span class="sec-no">Appendix B</span>');
    for (const sub of ['sec-5-1', 'sec-5-2', 'sec-7-1', 'sec-7-2', 'sec-7-3', 'sec-8-1', 'sec-8-2', 'sec-8-3', 'sec-A-1', 'sec-A-2', 'sec-A-3']) {
      expect(idsOf(rich), sub).toContain(sub);
    }
  });

  it('numbers headings of app-supplied sections below their section', () => {
    expect(idsOf(rich)).toContain('sec-9-1');
    expect(idsOf(rich)).toContain('sec-9-2');
    expect(rich).toMatch(/<h3 id="sec-9-1"><span class="sec-no">9\.1<\/span> Critical Path Analysis<\/h3>/);
  });

  it('keeps scripts supplied by the app intact', () => {
    const html = buildSystemReport(richReportInput({
      extraSections: [{ id: 'proto', title: 'Interactive System Prototype', html: '<div id="sim-event-log"></div><script>window.ADIA_SIM = {};</script>' }],
    }));
    expect(html).toContain('<script>window.ADIA_SIM = {};</script>');
    expect(html).toContain('<h2 id="sec-9"><span class="sec-no">9</span> Interactive System Prototype</h2>');
  });

  it('every anchor in the contents and in the body resolves to an id', () => {
    const ids = new Set(idsOf(rich));
    const toc = /<ol class="toc">[\s\S]*?<\/ol>/.exec(rich)![0];
    const tocTargets = hrefsOf(toc);
    expect(tocTargets.length).toBeGreaterThan(25);
    for (const target of tocTargets) expect(ids.has(target), `toc target ${target}`).toBe(true);
    for (const target of hrefsOf(rich)) expect(ids.has(target), `anchor #${target}`).toBe(true);
    // ids are unique
    const all = idsOf(rich);
    expect(new Set(all).size).toBe(all.length);
    // markers and text paths still resolve after the ids were scoped per figure
    for (const m of rich.matchAll(/url\(#([^)]+)\)/g)) expect(ids.has(m[1]), `marker ${m[1]}`).toBe(true);
  });
});

describe('buildSystemReport: numbering', () => {
  it('numbers figures sequentially and uniquely and prefixes the caption', () => {
    const figureIds = [...rich.matchAll(/<figure class="report-figure[^"]*" id="fig-(\d+)"/g)].map(m => Number(m[1]));
    expect(figureIds.length).toBeGreaterThanOrEqual(13);
    expect(figureIds).toEqual(figureIds.map((_, i) => i + 1));
    for (const n of figureIds) expect(figureHtml(rich, n)).toContain(`<strong>Figure ${n} &#8212;</strong>`);
    const lof = /<ol class="lof">[\s\S]*?<\/ol>/.exec(rich)![0];
    expect((lof.match(/<li>/g) ?? []).length).toBe(figureIds.length);
  });

  it('numbers tables sequentially and lists them', () => {
    const tableIds = [...rich.matchAll(/<table class="data[^"]*" id="tbl-(\d+)"/g)].map(m => Number(m[1]));
    expect(tableIds).toEqual(tableIds.map((_, i) => i + 1));
    expect(tableIds.length).toBeGreaterThan(20);
    for (const n of tableIds) expect(rich).toContain(`<strong>Table ${n} &#8212;</strong>`);
    const lot = /<ol class="lot">[\s\S]*?<\/ol>/.exec(rich)![0];
    expect((lot.match(/<li>/g) ?? []).length).toBe(tableIds.length);
    // document control comes first in the document, so it holds the first table numbers
    expect(rich.indexOf('id="tbl-1"')).toBeLessThan(rich.indexOf('id="sec-1"'));
  });

  it('puts the contents after document control and before section 1', () => {
    const order = ['class="cover"', 'Document control', '<ol class="toc">', 'List of figures', 'List of tables', 'id="sec-1"'].map(s => rich.indexOf(s));
    expect(order.every(i => i >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });
});

describe('buildSystemReport: layers', () => {
  it('has one numbered subsection per IBD context, nested like the part hierarchy', () => {
    expect(rich).toMatch(/<h4 id="sec-5-2-1"[^>]*><span class="sec-no">5\.2\.1<\/span> Vehicle<\/h4>/);
    expect(rich).toMatch(/<h5 id="sec-5-2-1-1"[^>]*><span class="sec-no">5\.2\.1\.1<\/span> Vehicle &#8250; Powertrain<\/h5>|<h5 id="sec-5-2-1-1"[^>]*><span class="sec-no">5\.2\.1\.1<\/span> Vehicle › Powertrain<\/h5>/);
    expect(rich).toMatch(/<h6 id="sec-5-2-1-1-1"[^>]*><span class="sec-no">5\.2\.1\.1\.1<\/span> Vehicle (›|&#8250;) Powertrain (›|&#8250;) Engine<\/h6>/);
    const contexts = richHierarchy().blocks.filter(b => richHierarchy().parts.some(p => p.blockId === b.id));
    const ibdHeadings = [...rich.matchAll(/<h[4-6] id="sec-5-2-[\d-]+"/g)];
    expect(ibdHeadings).toHaveLength(contexts.length);
  });

  it('renders each IBD once: the second part typed by the same block links to the first section', () => {
    const vehicle = sectionBody(rich, 'sec-5-2-1').split('<h5 id="sec-5-2-1-1"')[0];
    const links = [...vehicle.matchAll(/<a href="#sec-5-2-1-1">Powertrain<\/a>/g)];
    expect(links).toHaveLength(2); // drivetrain and spareDrivetrain
    expect(rich.match(/<figcaption[^>]*>[^<]*(<strong>[^<]*<\/strong>)? Internal block diagram · Powertrain/g) ?? []).toHaveLength(1);
  });

  it('gives each IBD a breadcrumb path, a parts table and a connector table with names only', () => {
    const powertrain = sectionBody(rich, 'sec-5-2-1-1');
    expect(powertrain).toContain('Context path:');
    expect(powertrain).toContain('<a href="#sec-5-2-1">Vehicle</a>');
    expect(powertrain).toContain('Parts of Powertrain');
    expect(powertrain).toContain('<td><strong>motor</strong></td>');
    expect(powertrain).toContain('Connectors in Powertrain');
    expect(powertrain).toContain('<td>motor.shaft</td><td>transmission.input</td><td>rotation</td>');
    // the connector that crosses into the Vehicle context is reported on the figure, not silently dropped
    expect(powertrain).toContain('report-figure-omitted');
    expect(powertrain).toContain('motor.shaft → frame.driveIn');
  });

  it('has one subsection per state machine layer, nested by parent state, with state and transition tables', () => {
    expect(rich).toMatch(/<h4 id="sec-7-3-1"[^>]*><span class="sec-no">7\.3\.1<\/span> Main<\/h4>/);
    expect(rich).toMatch(/<h5 id="sec-7-3-1-1"[^>]*><span class="sec-no">7\.3\.1\.1<\/span> Running regions<\/h5>/);
    expect(rich).toMatch(/<h6 id="sec-7-3-1-1-1"[^>]*><span class="sec-no">7\.3\.1\.1\.1<\/span> Fast modes<\/h6>/);
    const running = sectionBody(rich, 'sec-7-3-1-1').split('<h6 id="sec-7-3-1-1-1"')[0];
    expect(running).toContain('sub-states of Running');
    expect(running).toContain('States of Running regions');
    expect(running).toContain('<code>log()</code>');
    expect(running).toContain('Slow &#8594; Fast');
    expect(running).toContain('<code>[speed &gt; 50]</code>');
  });

  it('links BDD, IBD and state machine nodes to their subsections and needs no script to navigate', () => {
    const bdd = figureHtml(rich, 4);
    expect(bdd).toMatch(/<a class="diagram-node has-child-layer"[^>]*href="#sec-5-2-1"/);
    expect(bdd).toMatch(/href="#sec-5-2-1-1"/);
    const ibdVehicle = figureHtml(rich, 5);
    expect(ibdVehicle).toMatch(/href="#sec-5-2-1-1"/);
    const ibdPowertrain = figureHtml(rich, 6);
    expect(ibdPowertrain).toMatch(/href="#sec-5-2-1-1-1"/);
    const smMain = figureHtml(rich, 11);
    expect(smMain).toMatch(/<a class="diagram-node has-child-layer"[^>]*href="#sec-7-3-1-1"/);
    expect(figureHtml(rich, 12)).toMatch(/href="#sec-7-3-1-1-1"/);
    expect(rich).not.toContain('ondblclick');
    expect(rich).not.toContain('ADIA_DIAGRAM_NAV');
  });

  it('terminates on cyclic part hierarchies and cyclic state layers and still gives every context a section', () => {
    const h = richHierarchy();
    const cyc = {
      ...h,
      parts: [
        { ...h.parts[0], id: 'pa', name: 'toB', blockId: 'blk_a', typeId: 'blk_b' },
        { ...h.parts[0], id: 'pb', name: 'toA', blockId: 'blk_b', typeId: 'blk_a' },
      ],
      connectors: [],
      blocks: [...h.blocks, { ...h.blocks[0], id: 'blk_a', name: 'Alpha' }, { ...h.blocks[0], id: 'blk_b', name: 'Beta' }],
      layers: [
        { id: 'l1', name: 'First', parentStateId: 'st_fast', stateIds: ['st_idle'], transitionIds: [], junctionIds: [] },
        { id: 'l2', name: 'Second', parentStateId: 'st_idle', stateIds: ['st_fast'], transitionIds: [], junctionIds: [] },
      ],
    };
    const html = buildSystemReport(richReportInput({ hierarchy: cyc }));
    expect(html).toContain('Alpha');
    expect(html).toContain('Beta');
    expect((html.match(/<h[4-6] id="sec-5-2-[\d-]+"/g) ?? []).length).toBe(2);
    expect((html.match(/<h[4-6] id="sec-7-3-[\d-]+"/g) ?? []).length).toBe(2);
  });
});

describe('buildSystemReport: content', () => {
  it('summarises the model with counts for every element kind', () => {
    const summary = /id="tbl-3"[\s\S]*?<\/table>/.exec(rich)![0];
    const count = (label: string): number => Number(new RegExp(`<td>${label}</td><td><span class="num">(\\d+)</span>`).exec(summary)![1]);
    expect(count('Packages')).toBe(2);
    expect(count('Blocks')).toBe(8);
    expect(count('Value types')).toBe(1);
    expect(count('Constraint blocks')).toBe(1);
    expect(count('Parts')).toBe(7);
    expect(count('Ports')).toBe(5);
    expect(count('Connectors')).toBe(3);
    expect(count('Requirements')).toBe(4);
    expect(count('Use cases')).toBe(1);
    expect(count('Actors')).toBe(1);
    expect(count('Activities')).toBe(1);
    expect(count('Interactions')).toBe(1);
    expect(count('State machine layers')).toBe(3);
    expect(count('State machine states')).toBe(6);
    expect(count('State machine transitions')).toBe(5);
    expect(count('Verification cases')).toBe(2);
    expect(count('Evidence records')).toBe(2);
  });

  it('draws every diagram kind and the scenario tables', () => {
    for (const caption of ['Package diagram', 'Requirements diagram', 'Use case diagram', 'Block definition diagram', 'Internal block diagram',
      'Parametric diagram', 'Activity diagram', 'Sequence diagram', 'State machine']) {
      expect(rich, caption).toContain(caption);
    }
    expect(rich).toContain('Scenario: Start Journey');
    expect(rich).toContain('start (driver → car)');
  });

  it('aggregates connections that are not drawn in Appendix A with the figure number and count', () => {
    const appendix = sectionBody(rich, 'sec-A-3');
    const withOmissions = [...rich.matchAll(/<figure class="report-figure[^"]*" id="fig-(\d+)"[^>]*data-omitted-edges="([1-9]\d*)"/g)];
    expect(withOmissions.length).toBeGreaterThanOrEqual(2);
    for (const m of withOmissions) {
      expect(appendix).toContain(`<a href="#fig-${m[1]}">Figure ${m[1]}</a>`);
      expect(appendix).toMatch(new RegExp(`Figure ${m[1]}</a></td><td>[^<]*</td><td>${m[2]}</td>`));
    }
    const total = withOmissions.reduce((sum, m) => sum + Number(m[2]), 0);
    expect(appendix).toContain(`${total} connection`);
  });

  it('reports consistency and traceability diagnostics by name, never by id', () => {
    const html = buildSystemReport(richReportInput({
      diagnostics: { errors: [{ code: 'DUPLICATE_ID', elementId: 'blk_eng', message: 'Duplicate block ID: blk_eng' }], removedRelationshipIds: ['hrel_c1'], removedConnectorIds: ['con_a', 'con_b'] },
      traceability: { ...richReportInput().traceability, diagnostics: [{ code: 'REQUIREMENT_CYCLE', message: 'Requirement cycle detected: req_range -> req_top -> req_range' }] },
    }));
    const appendix = sectionBody(html, 'sec-A-1') + sectionBody(html, 'sec-A-2');
    expect(appendix).toContain('Duplicate block ID: Engine');
    expect(appendix).toContain('Requirement cycle detected: Range -&gt; Top speed -&gt; Range');
    expect(appendix).toContain('3 dangling connections were removed');
    expect(visibleText(html)).toContain('removed connections: 3');
    for (const id of ['blk_eng', 'req_range', 'req_top']) expect(visibleText(appendix)).not.toContain(id);
  });

  it('never prints a model id in visible text', () => {
    const text = visibleText(rich);
    for (const id of [...FIXTURE_IDS, 'rel_s1', 'rel_d2', 'hrel_c1', 'port_engout', 'port_fuel', 'tr_1', 'll_c', 'mm1', 'prop_cc', 'bind1', 'pForce']) {
      expect(text, `raw id ${id} leaked`).not.toContain(id);
    }
  });

  it('escapes every user-supplied name', () => {
    const input = richReportInput({ projectName: '<img src=x onerror=1>', author: '"><script>alert(1)</script>' });
    const html = buildSystemReport(input);
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;img src=x onerror=1&gt;');
  });

  it('is deterministic for a fixed date', () => {
    expect(buildSystemReport(richReportInput())).toBe(rich);
  });
});

describe('buildSystemReport: empty model', () => {
  const repository = createEmptyRepository();
  const matrix = buildTraceabilityMatrix(repository);
  const empty: SystemReportInput = {
    projectName: 'Nothing', author: 'Nobody', engineVersion: '1', generatedAt: new Date('2026-01-01T00:00:00Z'),
    repository,
    hierarchy: { blocks: [], parts: [], connectors: [], relationships: [], states: [], layers: [], transitions: [], junctions: [] },
    traceability: { matrix, metrics: computeCoverageMetrics(matrix) },
  };
  const html = buildSystemReport(empty);

  it('still yields every numbered section and appendix', () => {
    for (const id of ['sec-1', 'sec-2', 'sec-3', 'sec-4', 'sec-5', 'sec-5-1', 'sec-5-2', 'sec-6', 'sec-7', 'sec-7-1', 'sec-7-2', 'sec-7-3', 'sec-8', 'sec-A', 'sec-B']) {
      expect(idsOf(html), id).toContain(id);
    }
  });

  it('says "Not modelled in this project." in every content section', () => {
    for (const id of ['sec-2', 'sec-3', 'sec-4', 'sec-5-1', 'sec-5-2', 'sec-6', 'sec-7-1', 'sec-7-2', 'sec-7-3', 'sec-8']) {
      expect(sectionBody(html, id), id).toContain('Not modelled in this project.');
    }
    expect(visibleText(html)).toContain('No figures.');
  });

  it('keeps all anchors resolvable', () => {
    const ids = new Set(idsOf(html));
    for (const target of hrefsOf(html)) expect(ids.has(target), target).toBe(true);
  });

  it('shows the model summary with zero counts', () => {
    expect(html).toMatch(/<td>Blocks<\/td><td><span class="num">0<\/span>/);
  });
});

describe('generateArchitectureReport', () => {
  it('delegates to the system report with an empty repository and matrix', () => {
    const html = generateArchitectureReport(richHierarchy(), undefined, { projectName: 'Legacy', author: 'Me', version: '2.0', generatedAt: new Date('2026-02-02T00:00:00Z') });
    expect(html).toContain('System Architecture &amp; Design Report');
    expect(html).toContain('Legacy-SAD-0');
    expect(idsOf(html)).toContain('sec-5-2-1-1-1');
    expect(sectionBody(html, 'sec-8')).toContain('Not modelled in this project.');
    expect(html).toContain('2.0');
  });
});
