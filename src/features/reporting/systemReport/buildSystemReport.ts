import type { SysmlRepository } from '../../../engine/sysml/model';
import { diagramFrameLabel } from '../../sysml/diagramFrame';
import type { CoverageMetrics, TraceabilityMatrix } from '../../../engine/sysml/rtm';
import type { ReportModelDiagnostics } from '../../../services/reportModelConsistency';
import type { BlockData, ConnectorData, PartData } from '../../../types/sysml_types';
import type { Layer, StateData } from '../../../types/sm_types';
import { hasSysmlReference, resolveSysmlReferenceLabel, sysmlObjectLabel, friendlySysmlKind } from '../../sysml/sysmlDisplayLabel';
import { escapeHtml } from '../reportDiagramModel';
import {
  renderBddDiagram, renderIbdDiagram, renderRequirementsDiagram, renderStateMachineDiagrams,
} from '../reportDiagrams';
import {
  renderActivityDiagrams, renderPackageDiagrams, renderParametricDiagrams, renderSequenceDiagrams, renderUseCaseDiagrams,
} from '../reportDiagrams.sysml';
import type { HierarchySourceModel } from '../reportHierarchyEngine';
import { buildScenarioEntries } from '../scenariosSection';
import { ReportNumbering, notModelled, sectionId } from './numbering';
import { SYSTEM_REPORT_CSS } from './reportStyles';
import { renderRtmSection } from './rtmSection';

export interface SystemReportInput {
  projectName: string; author: string; engineVersion: string; generatedAt: Date;
  repository: SysmlRepository;            // canonical
  hierarchy: HierarchySourceModel;         // legacy projection (blocks/parts/connectors/relationships + SM)
  diagnostics?: ReportModelDiagnostics; revision?: string;
  traceability: { matrix: TraceabilityMatrix; metrics: CoverageMetrics; modelHash?: string; repositoryRevision?: number; diagnostics?: { code: string; message: string }[] };
  extraSections?: { id: string; title: string; html: string }[];   // App-supplied (SM analysis, scenarios, HMI, prototype)
}

const esc = escapeHtml;
const SEP = ' &#8250; ';
const dash = '<span class="muted">&#8212;</span>';
const NON_BLOCK_STEREOTYPES = new Set([
  'requirement', 'valueType', 'interface', 'view', 'viewpoint', 'stakeholder', 'testCase', 'constraintBlock', 'enumeration', 'signal',
]);

// ---------------------------------------------------------------------------
// Layer plans (numbers and anchors are known before any body is rendered, so diagrams can link forward).
// ---------------------------------------------------------------------------

interface IbdNode {
  block: BlockData;
  number: string;
  depth: number;
  parent?: IbdNode;
  /** Block names from the top-level context down to this one. */
  path: string[];
  ancestors: IbdNode[];
}

interface SmNode {
  layer: Layer;
  number: string;
  depth: number;
  parent?: SmNode;
  ancestors: SmNode[];
}

const layerLabel = (layer: Layer): string => layer.name?.trim() || (layer.parentStateId ? 'Sub-region' : 'Root region');

function planIbd(h: HierarchySourceModel, base: string): IbdNode[] {
  const blocksById = new Map(h.blocks.map(b => [b.id, b as BlockData]));
  const partsByBlock = new Map<string, PartData[]>();
  for (const p of h.parts) {
    if (!p.blockId) continue;
    const list = partsByBlock.get(p.blockId) ?? [];
    list.push(p as PartData);
    partsByBlock.set(p.blockId, list);
  }
  const contexts = h.blocks.filter(b => b.stereotype !== 'requirement' && (partsByBlock.get(b.id)?.length ?? 0) > 0) as BlockData[];
  const isContext = new Set(contexts.map(b => b.id));
  const typeIds = new Set(h.parts.map(p => p.typeId).filter((id): id is string => Boolean(id)));
  const roots = contexts.filter(b => !typeIds.has(b.id));
  const nodes: IbdNode[] = [];
  const visited = new Set<string>();

  const visit = (block: BlockData, number: string, parent?: IbdNode): void => {
    visited.add(block.id);
    const node: IbdNode = {
      block, number, depth: parent ? parent.depth + 1 : 0, parent,
      path: [...(parent?.path ?? []), block.name?.trim() || 'Unnamed block'],
      ancestors: parent ? [...parent.ancestors, parent] : [],
    };
    nodes.push(node);
    let child = 0;
    for (const part of partsByBlock.get(block.id) ?? []) {
      const typeBlock = part.typeId ? blocksById.get(part.typeId) : undefined;
      if (!typeBlock || !isContext.has(typeBlock.id) || visited.has(typeBlock.id)) continue;
      visit(typeBlock, `${number}.${++child}`, node);
    }
  };
  let top = 0;
  roots.forEach(b => { if (!visited.has(b.id)) visit(b, `${base}.${++top}`); });
  // Contexts only reachable through a cycle are never roots; they still get their own subsection.
  contexts.forEach(b => { if (!visited.has(b.id)) visit(b, `${base}.${++top}`); });
  return nodes;
}

function planSm(h: HierarchySourceModel, base: string): SmNode[] {
  let layers: readonly Layer[] = h.layers;
  if (layers.length === 0 && h.states.length > 0) {
    layers = [{
      id: '__all_states', name: 'State machine', parentStateId: null,
      stateIds: h.states.map(s => s.id), transitionIds: h.transitions.map(t => t.id), junctionIds: h.junctions.map(j => j.id),
    }];
  }
  const layerOfState = new Map<string, Layer>();
  for (const l of layers) for (const id of l.stateIds) if (!layerOfState.has(id)) layerOfState.set(id, l);
  const parentLayer = (l: Layer): Layer | undefined => {
    const p = l.parentStateId ? layerOfState.get(l.parentStateId) : undefined;
    return p && p !== l ? p : undefined;
  };
  const children = new Map<string, Layer[]>();
  const roots: Layer[] = [];
  for (const l of layers) {
    const p = parentLayer(l);
    if (!p) { roots.push(l); continue; }
    const list = children.get(p.id) ?? [];
    list.push(l);
    children.set(p.id, list);
  }
  const nodes: SmNode[] = [];
  const visited = new Set<string>();
  const visit = (layer: Layer, number: string, parent?: SmNode): void => {
    visited.add(layer.id);
    const node: SmNode = { layer, number, depth: parent ? parent.depth + 1 : 0, parent, ancestors: parent ? [...parent.ancestors, parent] : [] };
    nodes.push(node);
    let child = 0;
    for (const c of children.get(layer.id) ?? []) if (!visited.has(c.id)) visit(c, `${number}.${++child}`, node);
  };
  let top = 0;
  roots.forEach(l => { if (!visited.has(l.id)) visit(l, `${base}.${++top}`); });
  // Layers that only reach a root through a cycle of parent states.
  layers.forEach(l => { if (!visited.has(l.id)) visit(l, `${base}.${++top}`); });
  return nodes;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function slug(text: string): string {
  return text.trim().replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'Project';
}

function formatDate(date: Date): string {
  return Number.isNaN(date.getTime()) ? 'unknown' : `${date.toISOString().replace('T', ' ').slice(0, 16)} UTC`;
}

/** Replaces any model id found in a diagnostic message by the element's name. */
/** Annex A frame header of the Internal Block Diagram owned by the block, when the repository has one. */
function ibdFrameLabel(repo: SysmlRepository, blockId: string): string | undefined {
  const diagram = Object.values(repo.diagrams).find(d => d.diagramKind === 'ibd' && (d.contextElementId ?? d.ownerId) === blockId);
  return diagram ? diagramFrameLabel(repo, diagram.id) : undefined;
}

function makeHumanizer(repo: SysmlRepository, h: HierarchySourceModel): (message: string) => string {
  const labels = new Map<string, string>();
  for (const b of h.blocks) labels.set(b.id, b.name?.trim() || friendlySysmlKind(b.stereotype, 'Block'));
  for (const p of h.parts) labels.set(p.id, p.name?.trim() || 'Part');
  for (const c of h.connectors) labels.set(c.id, 'connector');
  for (const r of h.relationships) labels.set(r.id, `${friendlySysmlKind(r.type, 'Relationship')} relationship`);
  for (const s of h.states) labels.set(s.id, s.name?.trim() || 'State');
  return message => message.replace(/[A-Za-z0-9_:/-]+/g, token => {
    const known = labels.get(token);
    if (known) return known;
    if (token.length >= 3 && hasSysmlReference(repo, token)) return resolveSysmlReferenceLabel(repo, token, 'Element');
    return token;
  });
}

// ---------------------------------------------------------------------------
// The document
// ---------------------------------------------------------------------------

export function buildSystemReport(input: SystemReportInput): string {
  const { repository: repo, hierarchy: h } = input;
  const num = new ReportNumbering();
  const humanize = makeHumanizer(repo, h);
  const blocksById = new Map(h.blocks.map(b => [b.id, b as BlockData]));
  const partsById = new Map(h.parts.map(p => [p.id, p as PartData]));
  const stateById = new Map(h.states.map(s => [s.id, s as StateData]));
  const revision = input.revision ?? String(repo.revision);
  const docId = `${slug(input.projectName)}-SAD-${slug(revision)}`;

  const ibdNodes = planIbd(h, '5.2');
  const ibdByBlock = new Map(ibdNodes.map(n => [n.block.id, n]));
  const smNodes = planSm(h, '7.3');
  const smByParentState = new Map<string, SmNode>();
  for (const n of smNodes) if (n.layer.parentStateId && !smByParentState.has(n.layer.parentStateId)) smByParentState.set(n.layer.parentStateId, n);

  const linkFor = (layerId: string): string | undefined => {
    if (!layerId.startsWith('ibd-')) return undefined;
    const node = ibdByBlock.get(layerId.slice(4));
    return node ? `#${sectionId(node.number)}` : undefined;
  };
  const linkForState = (stateId: string): string | undefined => {
    const node = smByParentState.get(stateId);
    return node ? `#${sectionId(node.number)}` : undefined;
  };

  /** A reference to a raw type id or type name from the legacy projection, as a readable name. */
  const typeText = (raw: string | undefined | null): string => {
    if (!raw) return '';
    if (blocksById.has(raw)) return blocksById.get(raw)!.name;
    return hasSysmlReference(repo, raw) ? resolveSysmlReferenceLabel(repo, raw, 'Type') : raw;
  };

  const body: string[] = [];

  // Document-control tables come first in the document, so they are numbered first.
  const control = [
    `<h2 class="first">Document control</h2>`,
    num.table({
      caption: 'Revision history',
      head: ['Revision', 'Date', 'Author', 'Description'],
      rows: [[esc(revision), esc(formatDate(input.generatedAt).slice(0, 10)), esc(input.author), `Generated from canonical model revision ${esc(String(repo.revision))}`]],
    }),
    num.table({
      caption: 'Approvals',
      className: 'doc-control',
      head: ['Role', 'Name', 'Signature', 'Date'],
      rows: ['Prepared by', 'Reviewed by', 'Approved by'].map((role, i) => [
        `<strong>${role}</strong>`, i === 0 ? esc(input.author) : '', '<div class="sig"></div>', '<div class="sig"></div>',
      ]),
    }),
  ].join('\n');

  // ---- 1 Introduction -----------------------------------------------------
  {
    body.push(num.heading(2, '1', 'Introduction'));
    body.push(num.heading(3, '1.1', 'Purpose'));
    body.push(`<p>This document is the system architecture and design report of <strong>${esc(input.projectName)}</strong>. It presents the SysML model as numbered, printable diagrams and tables: package structure, requirements, use cases, block and internal block structure, parametrics, behaviour and the requirements traceability matrix.</p>`);
    body.push(num.heading(3, '1.2', 'Scope'));
    body.push(`<p>The report covers canonical model revision <strong>${esc(String(repo.revision))}</strong> as generated on ${esc(formatDate(input.generatedAt))}. Every diagram reports the connections it could not draw; they are collected in Appendix A.</p>`);

    const count = (n: number) => String(n);
    const defs = Object.values(repo.definitions);
    const repoBlocks = defs.filter(d => d.kind === 'block');
    const legacyBlocks = h.blocks.filter(b => !NON_BLOCK_STEREOTYPES.has(b.stereotype));
    const legacyReqs = h.blocks.filter(b => b.stereotype === 'requirement');
    const repoPartCount = Object.values(repo.usages).filter(u => u.kind === 'part').length;
    const repoPortCount = repoBlocks.reduce((sum, b) => sum + (b.kind === 'block' ? b.ports.length : 0), 0);
    const legacyPortCount = h.blocks.reduce((sum, b) => sum + (b.ports?.length ?? 0), 0);
    // The legacy projection and the repository describe the same model; when only one is populated, use it.
    const either = (a: number, b: number) => Math.max(a, b);
    const summary: [string, number][] = [
      ['Packages', Object.values(repo.packages).filter(p => p.id !== 'model').length],
      ['Blocks', either(repoBlocks.length, legacyBlocks.length)],
      ['Value types', either(defs.filter(d => d.kind === 'valueType').length, h.blocks.filter(b => b.stereotype === 'valueType').length)],
      ['Constraint blocks', defs.filter(d => d.kind === 'constraintBlock').length],
      ['Parts', either(repoPartCount, h.parts.length)],
      ['Ports', either(repoPortCount, legacyPortCount)],
      ['Connectors', either(Object.keys(repo.connectors).length, h.connectors.length)],
      ['Requirements', either(Object.keys(repo.requirements).length, legacyReqs.length)],
      ['Use cases', Object.keys(repo.useCases).length],
      ['Actors', Object.keys(repo.actors).length],
      ['Activities', defs.filter(d => d.kind === 'activity').length],
      ['Interactions', defs.filter(d => d.kind === 'interaction').length],
      ['State machine layers', h.layers.length],
      ['State machine states', h.states.length],
      ['State machine transitions', h.transitions.length],
      ['Verification cases', Object.keys(repo.verificationCases).length],
      ['Evidence records', Object.keys(repo.evidence).length],
    ];
    body.push(num.heading(3, '1.3', 'Model summary'));
    body.push(num.table({
      caption: 'Model summary: element counts by kind',
      className: 'summary',
      head: ['Element kind', 'Count'],
      rows: summary.map(([label, n]) => [esc(label), `<span class="num">${count(n)}</span>`]),
    }));

    body.push(num.heading(3, '1.4', 'Consistency summary'));
    if (input.diagnostics) {
      const rel = input.diagnostics.removedRelationshipIds?.length ?? 0;
      const conn = input.diagnostics.removedConnectorIds?.length ?? 0;
      const errors = input.diagnostics.errors?.length ?? 0;
      body.push(`<div class="consistency-summary"><strong>Model consistency:</strong> removed connections: ${rel + conn} (relationships: ${rel}, connectors: ${conn}) &bull; errors: ${errors}${errors || rel + conn ? ' &bull; details in Appendix A' : ''}</div>`);
    } else {
      body.push('<p class="muted">No consistency diagnostics were supplied for this report.</p>');
    }
  }

  // ---- 2 Package structure --------------------------------------------------
  {
    body.push(num.heading(2, '2', 'Package structure'));
    const figures = renderPackageDiagrams(repo);
    if (figures.length === 0) body.push(notModelled());
    else {
      body.push(num.numberFigures(figures.join('\n')));
      const owned = (id: string): number => [
        ...Object.values(repo.definitions), ...Object.values(repo.requirements), ...Object.values(repo.useCases),
        ...Object.values(repo.actors), ...Object.values(repo.verificationCases), ...Object.values(repo.packages),
      ].filter(e => e.ownerId === id && e.id !== id).length;
      body.push(num.table({
        caption: 'Packages and the number of elements each owns directly',
        head: ['Package', 'Owner', 'Kind', 'Owned elements'],
        rows: Object.values(repo.packages).filter(p => p.id !== 'model').map(p => [
          `<strong>${esc(sysmlObjectLabel(p, 'Package'))}</strong>`,
          p.ownerId && repo.packages[p.ownerId] ? esc(sysmlObjectLabel(repo.packages[p.ownerId], 'Package')) : dash,
          p.stereotype ? esc(`«${p.stereotype}»`) : 'Package',
          String(owned(p.id)),
        ]),
      }));
    }
  }

  // ---- 3 Requirements -------------------------------------------------------
  {
    body.push(num.heading(2, '3', 'Requirements'));
    const reqBlocks = h.blocks.filter(b => b.stereotype === 'requirement') as BlockData[];
    interface ReqRow { id: string; name: string; status: string; priority: string; owner: string; text: string; level: number }
    let reqRows: ReqRow[] = [];
    if (reqBlocks.length > 0) {
      body.push(num.numberFigures(renderRequirementsDiagram({ blocks: h.blocks, relationships: h.relationships })));
      const reqById = new Map(reqBlocks.map(r => [r.id, r]));
      const childrenMap = new Map<string, string[]>();
      const parentSet = new Set<string>();
      for (const rel of h.relationships) {
        if (!reqById.has(rel.sourceId) || !reqById.has(rel.targetId)) continue;
        if (rel.type === 'composition' || rel.type === 'derive' || rel.type === 'deriveReqt' || rel.type === 'requirementContainment') {
          childrenMap.set(rel.sourceId, [...(childrenMap.get(rel.sourceId) ?? []), rel.targetId]);
          parentSet.add(rel.targetId);
        }
      }
      const seen = new Set<string>();
      const walk = (r: BlockData, level: number): void => {
        if (seen.has(r.id)) return;
        seen.add(r.id);
        reqRows.push({ id: r.reqId || '', name: sysmlObjectLabel(r, 'Requirement'), status: r.status || 'Draft', priority: r.priority || 'Medium', owner: r.assignedTo || 'Unassigned', text: r.description || '', level });
        for (const childId of childrenMap.get(r.id) ?? []) { const c = reqById.get(childId); if (c) walk(c, level + 1); }
      };
      const roots = reqBlocks.filter(r => !parentSet.has(r.id));
      (roots.length > 0 ? roots : reqBlocks).forEach(r => walk(r, 0));
      reqBlocks.forEach(r => walk(r, 0)); // anything only reachable through a cycle
    } else {
      reqRows = Object.values(repo.requirements)
        .sort((a, b) => a.requirementId.localeCompare(b.requirementId))
        .map(r => ({ id: r.requirementId, name: sysmlObjectLabel(r, 'Requirement'), status: r.status, priority: r.priority ?? 'Medium', owner: r.owner ?? 'Unassigned', text: r.text, level: 0 }));
    }
    if (reqRows.length === 0) body.push(notModelled());
    else {
      body.push(num.table({
        caption: 'Requirements (indented by derivation / containment)',
        head: ['ID', 'Name', 'Status', 'Priority', 'Assigned to', 'Description'],
        rows: reqRows.map(r => [
          `<code>${esc(r.id)}</code>`,
          `<div style="margin-left:${r.level * 14}px">${r.level > 0 ? '&#8627; ' : ''}<strong>${esc(r.name)}</strong></div>`,
          esc(r.status), esc(r.priority), esc(r.owner), esc(r.text),
        ]),
      }));
    }
  }

  // ---- 4 Use cases ----------------------------------------------------------
  {
    body.push(num.heading(2, '4', 'Use cases'));
    const figures = renderUseCaseDiagrams(repo);
    const useCases = Object.values(repo.useCases);
    const actors = Object.values(repo.actors);
    if (figures.length === 0 && useCases.length === 0 && actors.length === 0) body.push(notModelled());
    else {
      if (figures.length > 0) body.push(num.numberFigures(figures.join('\n')));
      if (useCases.length > 0) {
        body.push(num.table({
          caption: 'Use cases',
          head: ['Use case', 'Subject', 'Extension points', 'Description'],
          rows: useCases.map(u => [
            `<strong>${esc(sysmlObjectLabel(u, 'Use Case'))}</strong>`,
            u.subjectId ? esc(resolveSysmlReferenceLabel(repo, u.subjectId, 'Subject')) : dash,
            u.extensionPointIds.length ? esc(u.extensionPointIds.map(id => resolveSysmlReferenceLabel(repo, id, 'Extension Point')).join(', ')) : dash,
            u.description ? esc(u.description) : dash,
          ]),
        }));
      }
      if (actors.length > 0) {
        body.push(num.table({
          caption: 'Actors',
          head: ['Actor', 'Kind', 'Specialises'],
          rows: actors.map(a => [
            `<strong>${esc(sysmlObjectLabel(a, 'Actor'))}</strong>`,
            a.isExternal ? 'External system' : 'Human role',
            a.generalizationIds.length ? esc(a.generalizationIds.map(id => resolveSysmlReferenceLabel(repo, id, 'Actor')).join(', ')) : dash,
          ]),
        }));
      }
    }
  }

  // ---- 5 Structure ----------------------------------------------------------
  {
    body.push(num.heading(2, '5', 'Structure'));
    body.push(num.heading(3, '5.1', 'Block definition diagram'));
    const bddBlocks = h.blocks.filter(b => b.stereotype !== 'requirement') as BlockData[];
    if (bddBlocks.length === 0) body.push(notModelled());
    else {
      body.push(num.numberFigures(renderBddDiagram({ blocks: h.blocks, relationships: h.relationships, parts: h.parts, linkFor })));
      body.push(num.table({
        caption: 'Blocks, their properties and ports',
        head: ['Element', 'Properties', 'Ports', 'Internal structure'],
        rows: bddBlocks.map(b => {
          const node = ibdByBlock.get(b.id);
          return [
            `<strong>${esc(sysmlObjectLabel(b, 'Block'))}</strong><div class="req-text">${esc(`«${b.stereotype}»`)}</div>`,
            b.properties?.length ? b.properties.map(p => `<div>${esc(p.name)} : ${esc(typeText(p.type))}${p.defaultValue ? ` = ${esc(p.defaultValue)}` : ''}</div>`).join('') : dash,
            b.ports?.length ? b.ports.map(p => `<div>${esc(p.name)} : ${esc(typeText(p.type))}${p.direction ? ` (${esc(p.direction)})` : ''}</div>`).join('') : dash,
            node ? `<a href="#${sectionId(node.number)}">Section ${esc(node.number)}</a>` : dash,
          ];
        }),
      }));
    }

    body.push(num.heading(3, '5.2', 'Internal structure'));
    if (ibdNodes.length === 0) body.push(notModelled());
    else {
      body.push('<p>One subsection per internal block diagram, nested to mirror the part hierarchy. A part whose type has its own internal structure links to that subsection in the diagram.</p>');
      for (const node of ibdNodes) body.push(renderIbdSection(node));
    }
  }

  function renderIbdSection(node: IbdNode): string {
    const block = node.block;
    const blockParts = h.parts.filter(p => p.blockId === block.id) as PartData[];
    const partIds = new Set(blockParts.map(p => p.id));
    const envPortIds = new Set((block.ports ?? []).map(p => p.id));
    const validEnd = (partId: string, portId: string): boolean =>
      partIds.has(partId) || ((!partId || partId === block.id) && envPortIds.has(portId));
    // Same scoping as renderInteractiveDiagramHierarchy: both ends in this context ...
    const scoped = h.connectors.filter(c => validEnd(c.sourcePartId, c.sourcePortId) && validEnd(c.targetPartId, c.targetPortId)) as ConnectorData[];
    // ... plus connectors with only one end here, so the figure reports them as "not drawn" instead of hiding them.
    const touching = h.connectors.filter(c => validEnd(c.sourcePartId, c.sourcePortId) || validEnd(c.targetPartId, c.targetPortId)) as ConnectorData[];

    const title = node.path.join(' › ');
    let html = num.heading(Math.min(6, 4 + node.depth), node.number, title);
    const crumbs = node.ancestors.map(a => `<a href="#${sectionId(a.number)}">${esc(a.block.name)}</a>`);
    html += `<p class="path-line">Context path: ${[...crumbs, `<strong>${esc(block.name)}</strong>`].join(SEP)}${node.parent ? '' : ' (top-level context)'}</p>`;
    html += num.numberFigures(renderIbdDiagram({
      contextBlock: block, parts: blockParts, connectors: touching, blocks: h.blocks, allParts: h.parts, linkFor,
      frameLabel: ibdFrameLabel(repo, block.id),
    }));

    html += num.table({
      caption: `Parts of ${block.name}`,
      head: ['Part', 'Type', 'Multiplicity'],
      rows: blockParts.map(p => {
        const typeBlock = p.typeId ? blocksById.get(p.typeId) : undefined;
        const target = typeBlock ? ibdByBlock.get(typeBlock.id) : undefined;
        const typeCell = !typeBlock
          ? '<span class="muted">Unresolved type</span>'
          : target ? `<a href="#${sectionId(target.number)}">${esc(typeBlock.name)}</a>` : esc(typeBlock.name);
        return [`<strong>${esc(p.name?.trim() || 'Unnamed part')}</strong>`, typeCell, p.multiplicity ? esc(p.multiplicity) : dash];
      }),
    });

    const endText = (partId: string, portId: string): string => {
      const part = partId ? partsById.get(partId) : undefined;
      const owner = part ? (part.typeId ? blocksById.get(part.typeId) : undefined) : block;
      const portSource = [owner, block, ...h.blocks].filter((b): b is BlockData => Boolean(b));
      const port = portId ? portSource.flatMap(b => b.ports ?? []).find(pt => pt.id === portId) : undefined;
      const partName = part ? (part.name?.trim() || 'Unnamed part') : block.name;
      return port ? `${partName}.${sysmlObjectLabel(port, 'Port')}` : partName;
    };
    if (scoped.length === 0) html += '<p class="muted">This context has no connectors between its parts.</p>';
    else {
      html += num.table({
        caption: `Connectors in ${block.name}`,
        head: ['Source (part.port)', 'Target (part.port)', 'Item flow'],
        rows: scoped.map(c => {
          const flowRaw = c.itemFlow ?? c.label ?? '';
          const flow = flowRaw && hasSysmlReference(repo, flowRaw) ? resolveSysmlReferenceLabel(repo, flowRaw, 'Item Flow') : flowRaw;
          return [esc(endText(c.sourcePartId, c.sourcePortId)), esc(endText(c.targetPartId, c.targetPortId)), flow ? esc(flow) : dash];
        }),
      });
    }
    return html;
  }

  // ---- 6 Parametrics --------------------------------------------------------
  {
    body.push(num.heading(2, '6', 'Parametrics'));
    const figures = renderParametricDiagrams(repo);
    body.push(figures.length === 0 ? notModelled() : num.numberFigures(figures.join('\n')));
  }

  // ---- 7 Behaviour ----------------------------------------------------------
  {
    body.push(num.heading(2, '7', 'Behaviour'));
    body.push(num.heading(3, '7.1', 'Activities'));
    const activities = renderActivityDiagrams(repo);
    body.push(activities.length === 0 ? notModelled() : num.numberFigures(activities.join('\n')));

    body.push(num.heading(3, '7.2', 'Sequences and scenarios'));
    const sequences = renderSequenceDiagrams(repo);
    const scenarios = buildScenarioEntries(repo);
    if (sequences.length === 0 && scenarios.length === 0) body.push(notModelled());
    else {
      if (sequences.length > 0) body.push(num.numberFigures(sequences.join('\n')));
      scenarios.forEach((entry, i) => {
        body.push(num.heading(4, `7.2.${i + 1}`, `Scenario: ${entry.title}`));
        if (entry.context) body.push(`<p class="path-line">Scenario of ${esc(entry.context)}</p>`);
        body.push(entry.messages.length === 0
          ? '<p class="muted">No messages.</p>'
          : num.table({ caption: `Messages of ${entry.title}`, head: ['#', 'Message'], rows: entry.messages.map(m => [String(m.position), esc(m.sentence)]) }));
        if (entry.links.length > 0) {
          body.push(num.table({
            caption: `Relationships of ${entry.title}`,
            head: ['Relationship', 'From', 'To'],
            rows: entry.links.map(l => [esc(l.kind), esc(l.from), esc(l.to)]),
          }));
        }
      });
    }

    body.push(num.heading(3, '7.3', 'State machines'));
    if (smNodes.length === 0) body.push(notModelled());
    else {
      body.push('<p>One subsection per state-machine layer, nested by the state that owns it. A state with sub-states links to its layer in the diagram.</p>');
      for (const node of smNodes) body.push(renderSmSection(node));
    }
  }

  function renderSmSection(node: SmNode): string {
    const layer = node.layer;
    const nameOf = (id: string): string => {
      const s = stateById.get(id);
      if (s) return s.name?.trim() || 'Unnamed state';
      const j = h.junctions.find(x => x.id === id);
      return j ? (j.name?.trim() || `${friendlySysmlKind(j.type, 'Junction')} junction`) : 'Unknown state';
    };
    let html = num.heading(Math.min(6, 4 + node.depth), node.number, layerLabel(layer));
    const parentState = layer.parentStateId ? stateById.get(layer.parentStateId) : undefined;
    const crumbs = node.ancestors.map(a => `<a href="#${sectionId(a.number)}">${esc(layerLabel(a.layer))}</a>`);
    html += `<p class="path-line">Region path: ${[...crumbs, `<strong>${esc(layerLabel(layer))}</strong>`].join(SEP)}${parentState ? ` &mdash; sub-states of ${esc(parentState.name?.trim() || 'a state')}` : ' (top-level region)'}</p>`;
    html += num.numberFigures(renderStateMachineDiagrams({
      layers: [layer], states: h.states, junctions: h.junctions, transitions: h.transitions, linkForState,
    }).join('\n'));

    const layerStates = h.states.filter(s => layer.stateIds.includes(s.id));
    if (layerStates.length === 0) html += '<p class="muted">This region has no states.</p>';
    else {
      html += num.table({
        caption: `States of ${layerLabel(layer)}`,
        head: ['State', 'Entry', 'During', 'Exit'],
        rows: layerStates.map(s => [
          `<strong>${esc(s.name?.trim() || 'Unnamed state')}</strong>${s.autostart ? ' <span class="tag">initial</span>' : ''}`,
          s.entry ? `<code>${esc(s.entry)}</code>` : dash,
          s.during ? `<code>${esc(s.during)}</code>` : dash,
          s.exit ? `<code>${esc(s.exit)}</code>` : dash,
        ]),
      });
    }
    const layerTransitions = h.transitions.filter(t => layer.transitionIds.includes(t.id));
    if (layerTransitions.length === 0) html += '<p class="muted">This region has no transitions.</p>';
    else {
      html += num.table({
        caption: `Transitions of ${layerLabel(layer)}`,
        head: ['Source &#8594; target', 'Guard', 'Action'],
        rows: layerTransitions.map(t => [
          `${esc(nameOf(t.sourceId))} &#8594; ${esc(nameOf(t.targetId))}`,
          t.condition ? `<code>[${esc(t.condition)}]</code>` : t.afterTicks != null ? `<code>after(${esc(String(t.afterTicks))})</code>` : dash,
          t.action ? `<code>${esc(t.action)}</code>` : dash,
        ]),
      });
    }
    return html;
  }

  // ---- 8 RTM ----------------------------------------------------------------
  {
    body.push(num.heading(2, '8', 'Requirements Traceability Matrix'));
    body.push(renderRtmSection({
      repository: repo,
      matrix: input.traceability.matrix,
      metrics: input.traceability.metrics,
      modelHash: input.traceability.modelHash,
      repositoryRevision: input.traceability.repositoryRevision,
    }, num, '8'));
  }

  // ---- 9.. App-supplied sections -------------------------------------------
  (input.extraSections ?? []).forEach((extra, i) => {
    const number = String(9 + i);
    body.push(`<section class="extra" data-extra="${esc(extra.id)}">${num.heading(2, number, extra.title)}${num.numberSubheadings(extra.html, number)}</section>`);
  });

  // ---- Appendix A -----------------------------------------------------------
  {
    body.push(num.heading(2, 'A', 'Diagnostics', 'appendix-h', 'Appendix A'));
    body.push(num.heading(3, 'A.1', 'Model consistency diagnostics'));
    const errors = input.diagnostics?.errors ?? [];
    const removed = [
      ...(input.diagnostics?.removedRelationshipIds ?? []).map(() => 'relationship'),
      ...(input.diagnostics?.removedConnectorIds ?? []).map(() => 'connector'),
    ];
    if (!input.diagnostics) body.push('<p class="muted">No consistency diagnostics were supplied.</p>');
    else if (errors.length === 0 && removed.length === 0) body.push('<p class="analysis-ok">&check; No consistency problems were found.</p>');
    else {
      if (removed.length > 0) body.push(`<p>${removed.length} dangling connection${removed.length === 1 ? ' was' : 's were'} removed before the report was built (${removed.filter(r => r === 'relationship').length} relationships, ${removed.filter(r => r === 'connector').length} connectors).</p>`);
      if (errors.length > 0) {
        body.push(num.table({
          caption: 'Model consistency errors',
          head: ['Code', 'Detail'],
          rows: errors.map(e => [`<code>${esc(e.code)}</code>`, esc(humanize(e.message))]),
        }));
      }
    }

    body.push(num.heading(3, 'A.2', 'Traceability diagnostics'));
    const traceDiagnostics = input.traceability.diagnostics ?? [];
    body.push(traceDiagnostics.length === 0
      ? '<p class="analysis-ok">&check; No traceability problems were found.</p>'
      : num.table({
        caption: 'Traceability diagnostics',
        head: ['Code', 'Detail'],
        rows: traceDiagnostics.map(d => [`<code>${esc(d.code)}</code>`, esc(humanize(d.message))]),
      }));

    body.push(num.heading(3, 'A.3', 'Connections not drawn'));
    if (num.accounting.length === 0) body.push('<p class="analysis-ok">&check; Every connection in scope is drawn in the figures of this report.</p>');
    else {
      const total = num.accounting.reduce((sum, a) => sum + a.omitted, 0);
      body.push(`<p>${total} connection${total === 1 ? '' : 's'} in scope of ${num.accounting.length} figure${num.accounting.length === 1 ? '' : 's'} could not be drawn in that view.</p>`);
      body.push(num.table({
        caption: 'Figures with connections that are not drawn',
        head: ['Figure', 'Diagram', 'Not drawn', 'Detail'],
        rows: num.accounting.map(a => [
          `<a href="#fig-${a.figure}">Figure ${a.figure}</a>`, a.caption, String(a.omitted), a.note || dash,
        ]),
      }));
    }

    // ---- Appendix B ---------------------------------------------------------
    body.push(num.heading(2, 'B', 'Glossary of SysML notation', 'appendix-h', 'Appendix B'));
    const glossary: [string, string, string][] = [
      ['&laquo;block&raquo;', 'Block', 'A modular unit of system structure; compartments list its properties, operations and ports.'],
      ['Part', 'Part property', 'A usage of a block inside another block, drawn as a box in an internal block diagram. Written name : Type [multiplicity].'],
      ['Small square', 'Port', 'An interaction point on a block or part. Position follows the flow direction where it is declared.'],
      ['Solid line with arrow', 'Connector / item flow', 'Links two ports or parts; the label names the item that flows along it.'],
      ['Filled diamond', 'Composition', 'The whole owns the part; the part cannot outlive the whole.'],
      ['Hollow diamond', 'Aggregation', 'The whole references shared parts.'],
      ['Hollow triangle', 'Generalization', 'Points from the specific element to the general one.'],
      ['Dashed arrow', 'Dependency', 'Labelled with its keyword, for example &laquo;satisfy&raquo;, &laquo;verify&raquo;, &laquo;refine&raquo;, &laquo;deriveReqt&raquo;, &laquo;trace&raquo;, &laquo;allocate&raquo;.'],
      ['Circle with cross', 'Containment', 'A requirement contains the requirements nested under it.'],
      ['Orange outline', 'Requirement', 'A statement of need with an identifier, text, status and priority.'],
      ['Ellipse / stick figure', 'Use case / actor', 'A use case lives inside its subject boundary; actors stand outside. &laquo;include&raquo; and &laquo;extend&raquo; are dashed.'],
      ['Rounded box, bars', 'Activity', 'Actions with control flow (solid) and object flow (dashed); decision/merge diamonds, fork/join bars; swimlanes are partitions.'],
      ['Lifeline, arrows', 'Sequence', 'Messages run top to bottom: filled head = synchronous call, open head = asynchronous, dashed = reply. Frames are combined fragments (alt, opt, loop, par).'],
      ['Rounded rectangle with squares', 'Constraint property', 'A parametric constraint; the small squares are its parameters, bound to value properties by binding connectors.'],
      ['Rounded state box', 'State', 'Shows entry / during / exit actions. A container box holds sub-states; a linked state has its own subsection.'],
      ['[guard] / action', 'Transition label', 'The transition fires when the guard holds and then runs the action; after(n) is a timed trigger.'],
      ['H, H*', 'History', 'Shallow and deep history pseudostates.'],
      ['S V R D T', 'Grid glyphs', 'Requirement to element grid: satisfy, verify, refine, derive, trace.'],
    ];
    body.push(num.table({
      caption: 'Notation used in this report',
      className: 'glossary',
      head: ['Symbol', 'Name', 'Meaning'],
      rows: glossary.map(([s, n, m]) => [s, `<strong>${n}</strong>`, m]),
    }));
  }

  // ---- Front matter (built last so the lists know every figure and table) ----


  const cover = `<section class="cover">
<div class="kicker">${esc(input.projectName)}</div>
<h1>System Architecture &amp; Design Report</h1>
<div class="subtitle">${esc(input.projectName)}</div>
<table class="meta">
<tr><th>Document ID</th><td>${esc(docId)}</td></tr>
<tr><th>Revision</th><td>${esc(revision)}</td></tr>
<tr><th>Date</th><td>${esc(formatDate(input.generatedAt))}</td></tr>
<tr><th>Author</th><td>${esc(input.author)}</td></tr>
<tr><th>Engine</th><td>${esc(input.engineVersion)}</td></tr>
</table>
<div class="classification">COMPANY CONFIDENTIAL</div>
</section>`;

  const front = `<section class="front">${control}
<h2 class="first">Contents</h2>
${num.tableOfContents()}
<h3>List of figures</h3>
${num.listOfFigures()}
<h3>List of tables</h3>
${num.listOfTables()}
</section>`;

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>${esc(input.projectName)} - System Architecture &amp; Design Report</title><style>${SYSTEM_REPORT_CSS}</style></head>
<body><div class="report">
${cover}
${front}
${body.join('\n')}
</div><div class="print-footer">${esc(docId)} &middot; ${esc(input.projectName)}</div></body></html>`;
}
