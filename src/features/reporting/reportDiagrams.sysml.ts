import type {
  ActivityDefinition, ActivityNode, ConnectorUsage, ConstraintBlockDefinition, InteractionDefinition, InteractionMessage,
  PropertyDefinition, SysmlRelationship, SysmlRepository,
} from '../../engine/sysml/model';
import { ACTIVITY_NODE_SIZES, LANE_HEADER_HEIGHT, PIN_SIZE, actionMinWidth } from '../sysml/activityDiagramView';
import { USE_CASE_EDGE_NOTATION, clipToNode } from '../sysml/useCaseDiagramView';
import { LABEL_LINE_HEIGHT, buildSequenceDiagramView, type SequenceDiagramView, type SequenceViewOptions } from '../sysml/sequenceDiagramView';
import { edgeBadgeLabel } from '../sysml/edgeNotation';
import { packageRelationshipKeyword } from '../sysml/packageRelationshipNotation';
import { friendlySysmlKind, sysmlObjectLabel } from '../sysml/sysmlDisplayLabel';
import { nodeLabel, resolveActivityEndpoint } from '../../engine/sysml/activity';
import { isUseCaseRelationshipKind } from '../../engine/sysml/useCases';
import { isParametricBinding, isParametricEnd } from '../../engine/sysml/parametric';
import { messageLabel, orderedMessages } from '../../engine/sysml/interaction';
import {
  DiagramRect, FigureAccounting, MAX_NODES_PER_FIGURE, SizedNode, boundsOf, chunkItems, connectionPages, escapeHtml, measureNode, renderEmptyFigure, wrapFigure,
} from './reportDiagramModel';
import { Box, textBox, textWidth } from './reportSvgGeometry';
import { PositionedNode, layoutGrid, layoutLayered, parallelEdgeOffsets, rankNodes, routeEdgeLabelPoint, routeEdgePath, routeManhattan } from './reportDiagramLayout';
import { ScopedConnection, hierarchyRankEdge, omittedForPage } from './reportDiagrams';

const STROKE = '#0b3445';
const EDGE = '#546e7a';
const TEXT = '#182231';
const MUTED = '#65717e';
const SOFT = '#f4f6f8';
const ACCENT = '#f97316';

interface TextOptions { size?: number; weight?: number | string; fill?: string; anchor?: 'start' | 'middle' | 'end'; italic?: boolean }

function txt(x: number, y: number, text: string, o: TextOptions = {}): string {
  if (!text) return '';
  return `<text x="${x}" y="${y}" font-size="${o.size ?? 11}"${o.weight ? ` font-weight="${o.weight}"` : ''}${o.italic ? ' font-style="italic"' : ''} fill="${o.fill ?? TEXT}" text-anchor="${o.anchor ?? 'middle'}">${escapeHtml(text)}</text>`;
}

function haloTxt(x: number, y: number, text: string, o: TextOptions = {}): string {
  if (!text) return '';
  return `<text class="rf-edge-label" x="${x}" y="${y}" font-size="${o.size ?? 9}" fill="${o.fill ?? MUTED}" text-anchor="${o.anchor ?? 'middle'}" stroke="#ffffff" stroke-width="3" paint-order="stroke">${escapeHtml(text)}</text>`;
}

/** Wraps node-like notation in a group whose geometry tests (and reviewers) can read back. */
function nodeGroup(kind: string, rect: DiagramRect, inner: string): string {
  return `<g class="rf-node" data-kind="${kind}" data-x="${rect.x}" data-y="${rect.y}" data-w="${rect.width}" data-h="${rect.height}">${inner}</g>`;
}

interface EdgeStyle { dashed?: boolean; markerEnd?: string; markerStart?: string }

function edgePath(id: string, d: string, style: EdgeStyle = {}): string {
  return `<path id="${id}" d="${d}" fill="none" stroke="${EDGE}" stroke-width="1.1"${style.dashed ? ' stroke-dasharray="5 4"' : ''}${style.markerEnd ? ` marker-end="url(#${style.markerEnd})"` : ''}${style.markerStart ? ` marker-start="url(#${style.markerStart})"` : ''}/>`;
}

function polyline(points: { x: number; y: number }[]): string {
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
}

function fig(inner: string, caption: string, bounds: DiagramRect, accounting: FigureAccounting): string {
  return wrapFigure(inner, caption, bounds, accounting);
}

const KIND_LABEL: Record<string, string> = {
  block: 'block', valueType: 'value type', interface: 'interface', enumeration: 'enumeration', signal: 'signal',
  constraintBlock: 'constraint block', quantityKind: 'quantity kind', unit: 'unit', view: 'view', viewpoint: 'viewpoint',
  stakeholder: 'stakeholder', activity: 'activity', interaction: 'interaction', requirement: 'requirement',
  verificationCase: 'verification case', actor: 'actor', subject: 'subject', useCase: 'use case', diagram: 'diagram',
};

function plural(n: number, label: string): string {
  if (n === 1) return `${n} ${label}`;
  return `${n} ${label.endsWith('s') ? label : label.endsWith('y') ? `${label.slice(0, -1)}ies` : `${label}s`}`;
}

// ---------------------------------------------------------------------------
// Package diagrams
// ---------------------------------------------------------------------------

const PACKAGE_RELATIONSHIP_KINDS = new Set(['packageImport', 'elementImport', 'packageMerge']);

function ownedElementCounts(repo: SysmlRepository): Map<string, Map<string, number>> {
  const counts = new Map<string, Map<string, number>>();
  const add = (ownerId: string | undefined, kind: string) => {
    if (!ownerId || !repo.packages[ownerId]) return;
    const m = counts.get(ownerId) ?? new Map<string, number>();
    m.set(kind, (m.get(kind) ?? 0) + 1);
    counts.set(ownerId, m);
  };
  for (const d of Object.values(repo.definitions ?? {})) add(d.ownerId, d.kind);
  for (const r of Object.values(repo.requirements ?? {})) add(r.ownerId, 'requirement');
  for (const v of Object.values(repo.verificationCases ?? {})) add(v.ownerId, 'verificationCase');
  for (const a of Object.values(repo.actors ?? {})) add(a.ownerId, 'actor');
  for (const s of Object.values(repo.subjects ?? {})) add(s.ownerId, 'subject');
  for (const u of Object.values(repo.useCases ?? {})) add(u.ownerId, 'useCase');
  for (const d of Object.values(repo.diagrams ?? {})) add(d.ownerId, 'diagram');
  return counts;
}

function importedElementKind(repo: SysmlRepository, id: string): string | undefined {
  const def = repo.definitions?.[id];
  if (def) return def.kind;
  if (repo.requirements?.[id]) return 'requirement';
  if (repo.useCases?.[id]) return 'useCase';
  if (repo.actors?.[id]) return 'actor';
  if (repo.subjects?.[id]) return 'subject';
  if (repo.verificationCases?.[id]) return 'verificationCase';
  return undefined;
}

export function renderPackageDiagrams(repo: SysmlRepository): string[] {
  const packages = Object.values(repo.packages ?? {});
  const rels = Object.values(repo.relationships ?? {}).filter(r => PACKAGE_RELATIONSHIP_KINDS.has(r.kind)
    || (r.kind === 'dependency' && repo.packages[r.sourceId] && repo.packages[r.targetId]));
  const counts = ownedElementCounts(repo);
  const totalOwned = [...counts.values()].reduce((sum, m) => sum + [...m.values()].reduce((a, b) => a + b, 0), 0);
  if (packages.length === 0 || (packages.length <= 1 && rels.length === 0 && totalOwned === 0)) return [];

  const labelOf = new Map<string, string>();
  const sized = new Map<string, SizedNode>();
  const kindOf = new Map<string, 'package' | 'element'>();
  for (const pkg of packages) {
    const label = sysmlObjectLabel(pkg, 'Package');
    labelOf.set(pkg.id, label);
    const kinds = [...(counts.get(pkg.id) ?? new Map<string, number>()).entries()].sort((a, b) => b[1] - a[1]);
    const lines = kinds.slice(0, 3).map(([k, n]) => plural(n, KIND_LABEL[k] ?? friendlySysmlKind(k).toLowerCase()));
    if (kinds.length > 3) lines.push(`+ ${kinds.length - 3} more kinds`);
    sized.set(pkg.id, measureNode(pkg.id, [pkg.stereotype === 'modelLibrary' ? '«modelLibrary»' : '', label, ...(lines.length ? lines : ['empty'])], 'package', 120));
    kindOf.set(pkg.id, 'package');
  }

  const connections: (ScopedConnection & { label: string; keyword?: string })[] = [];
  for (const pkg of packages) {
    if (pkg.ownerId && pkg.ownerId !== pkg.id) {
      connections.push({ id: `own:${pkg.id}`, sourceId: pkg.ownerId, targetId: pkg.id, kind: 'containment', label: '' });
    }
  }
  for (const rel of rels) {
    const target = rel.kind === 'elementImport' ? (rel.importedElementId ?? rel.targetId) : rel.targetId;
    const source = rel.kind === 'elementImport' ? (rel.importingNamespaceId ?? rel.sourceId) : rel.sourceId;
    if (rel.kind === 'elementImport' && !repo.packages[target] && !kindOf.has(target)) {
      const kind = importedElementKind(repo, target);
      if (kind) {
        const def = (repo.definitions[target] ?? repo.requirements?.[target] ?? repo.useCases?.[target] ?? repo.actors?.[target]
          ?? repo.subjects?.[target] ?? repo.verificationCases?.[target]) as { name?: string; kind?: string };
        const label = sysmlObjectLabel(def, KIND_LABEL[kind] ?? 'Element');
        labelOf.set(target, label);
        sized.set(target, measureNode(target, [`«${KIND_LABEL[kind] ?? kind}»`, label], 'element', 96));
        kindOf.set(target, 'element');
      }
    }
    const keyword = packageRelationshipKeyword(rel) ?? (rel.kind === 'dependency' ? '«use»' : '');
    connections.push({ id: rel.id, sourceId: source, targetId: target, kind: rel.kind, label: rel.name?.trim() || keyword, keyword });
  }

  const nodeIds = new Set(sized.keys());
  const nameOf = (id: string) => labelOf.get(id) ?? 'Unknown element';
  const resolved = connections.filter(c => nodeIds.has(c.sourceId) && nodeIds.has(c.targetId));
  const pages = connectionPages([...sized.values()], resolved);
  return pages.map((page, pageIndex) => {
    const pageIds = new Set(page.map(n => n.id));
    const pageEdges = resolved.filter(c => pageIds.has(c.sourceId) && pageIds.has(c.targetId));
    const placed = layoutLayered(page, pageEdges.map(hierarchyRankEdge), { direction: 'TB' });
    const byId = new Map(placed.map(p => [p.id, p]));
    const offsets = parallelEdgeOffsets(pageEdges);
    const edgeEls = pageEdges.map(c => {
      const src = byId.get(c.sourceId)!;
      const tgt = byId.get(c.targetId)!;
      const offset = offsets.get(c.id) ?? 0;
      const contains = c.kind === 'containment';
      const id = `edge-pkg${pageIndex}-${c.id.replace(/[^A-Za-z0-9_-]/g, '_')}`;
      return edgePath(id, routeEdgePath(src, tgt, { direction: 'TB', offset, obstacles: placed }), contains
        ? { markerStart: 'requirement-containment-crosshair' }
        : { dashed: true, markerEnd: 'rf-arrow-open' })
        + (c.label ? (() => { const p = routeEdgeLabelPoint(src, tgt, { offset, obstacles: placed }); return haloTxt(p.x, p.y, c.label, { anchor: p.anchor }); })() : '');
    });
    const nodeEls = placed.map(pos => {
      const node = sized.get(pos.id)!;
      const isPackage = kindOf.get(pos.id) === 'package';
      const body = isPackage
        ? `<rect x="${pos.x}" y="${pos.y - 12}" width="${Math.min(60, pos.width / 2)}" height="12" fill="${SOFT}" stroke="${STROKE}" stroke-width="1.2"/>`
          + `<rect x="${pos.x}" y="${pos.y}" width="${pos.width}" height="${pos.height}" fill="#ffffff" stroke="${STROKE}" stroke-width="1.2"/>`
        : `<rect x="${pos.x}" y="${pos.y}" width="${pos.width}" height="${pos.height}" rx="6" fill="#ffffff" stroke="${EDGE}" stroke-width="1.1" stroke-dasharray="4 3"/>`;
      const nameIndex = node.lines[0]?.startsWith('«') ? 1 : 0;
      const textEls = node.lines.map((line, i) => txt(pos.x + pos.width / 2, pos.y + 18 + i * 15, line,
        { weight: i === nameIndex ? 600 : undefined, fill: i === nameIndex ? TEXT : '#44515e' })).join('');
      return nodeGroup(isPackage ? 'package' : 'element', pos, body + textEls);
    });
    const viewNote = pages.length > 1 ? ` · view ${pageIndex + 1} of ${pages.length}` : '';
    const packageCount = page.filter(n => kindOf.get(n.id) === 'package').length;
    return fig([...edgeEls, ...nodeEls].join(''),
      `Package diagram${viewNote} (${packageCount} packages, ${pageEdges.length} relationships)`,
      boundsOf(placed.map(p => ({ ...p, y: p.y - 12, height: p.height + 12 })), 24),
      { drawnNodes: page.length, drawnEdges: pageEdges.length, omitted: omittedForPage(connections, pageIds, nodeIds, nameOf) });
  });
}

// ---------------------------------------------------------------------------
// Use case diagrams
// ---------------------------------------------------------------------------

type OutsideKind = 'actor' | 'useCase' | 'requirement' | 'subject';
interface UcNode { id: string; kind: OutsideKind; label: string; rect: DiagramRect; extensionPoints: string[]; isExternal?: boolean }

const ACTOR_W = 80;
const ACTOR_H = 96;

function useCaseLabelLines(label: string, extensionPoints: string[]): string[] {
  return extensionPoints.length > 0 ? [label, 'extension points', ...extensionPoints] : [label];
}

function ellipseSize(label: string, extensionPoints: string[]): { width: number; height: number } {
  const m = measureNode('x', useCaseLabelLines(label, extensionPoints), 'useCase', 120);
  return { width: Math.max(150, Math.ceil(m.width * 1.3) + 16), height: Math.max(64, Math.ceil(m.height * 1.5) + 8) };
}

function drawActor(n: UcNode): string {
  const cx = n.rect.x + n.rect.width / 2;
  const top = n.rect.y;
  const parts = `<circle cx="${cx}" cy="${top + 10}" r="8" fill="#ffffff" stroke="${STROKE}" stroke-width="1.3"/>`
    + `<path d="M ${cx} ${top + 18} L ${cx} ${top + 46} M ${cx - 16} ${top + 28} L ${cx + 16} ${top + 28} M ${cx} ${top + 46} L ${cx - 13} ${top + 66} M ${cx} ${top + 46} L ${cx + 13} ${top + 66}" fill="none" stroke="${STROKE}" stroke-width="1.3"/>`;
  return nodeGroup('actor', n.rect, parts
    + (n.isExternal ? txt(cx, top + 78, '«external»', { size: 9, fill: MUTED }) : '')
    + txt(cx, top + (n.isExternal ? 90 : 80), n.label, { weight: 600 }));
}

function drawUseCase(n: UcNode): string {
  const { x, y, width, height } = n.rect;
  const cx = x + width / 2;
  const lines = useCaseLabelLines(n.label, n.extensionPoints);
  const total = lines.length;
  const startY = y + height / 2 - ((total - 1) * 14) / 2 + 4;
  const textEls = lines.map((line, i) => {
    const isLabel = i === 0;
    const isHeader = n.extensionPoints.length > 0 && i === 1;
    return txt(cx, startY + i * 14, line, { weight: isLabel ? 600 : undefined, size: isLabel ? 11 : 9, fill: isLabel ? TEXT : MUTED, italic: isHeader });
  }).join('');
  return nodeGroup('useCase', n.rect, `<ellipse cx="${cx}" cy="${y + height / 2}" rx="${width / 2}" ry="${height / 2}" fill="#ffffff" stroke="${STROKE}" stroke-width="1.3"/>${textEls}`);
}

function drawBox(n: UcNode, stereotype: string): string {
  const { x, y, width, height } = n.rect;
  return nodeGroup(n.kind, n.rect, `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="4" fill="#ffffff" stroke="${n.kind === 'requirement' ? ACCENT : STROKE}" stroke-width="1.2"/>`
    + txt(x + width / 2, y + height / 2 - 2, `«${stereotype}»`, { size: 9, fill: MUTED })
    + txt(x + width / 2, y + height / 2 + 12, n.label, { weight: 600 }));
}

interface UseCaseFigureDef { title: string; boundary: boolean; subjectLabel?: string; insideIds: string[]; extraActorIds: string[] }

function useCaseKind(repo: SysmlRepository, id: string): OutsideKind | undefined {
  if (repo.actors?.[id]) return 'actor';
  if (repo.useCases?.[id]) return 'useCase';
  if (repo.requirements?.[id]) return 'requirement';
  if (repo.subjects?.[id]) return 'subject';
  return undefined;
}

function useCaseScope(repo: SysmlRepository, rels: SysmlRelationship[], inside: Set<string>, extraActors: Set<string>): SysmlRelationship[] {
  const scope = new Map<string, SysmlRelationship>();
  const anchors = new Set([...inside, ...extraActors]);
  for (const r of rels) if (anchors.has(r.sourceId) || anchors.has(r.targetId)) scope.set(r.id, r);
  // Actor generalizations between actors already drawn here stay with the figure.
  for (let pass = 0; pass < 8; pass++) {
    const actors = new Set([...extraActors, ...[...scope.values()].flatMap(r => [r.sourceId, r.targetId]).filter(id => repo.actors?.[id])]);
    let changed = false;
    for (const r of rels) {
      if (scope.has(r.id) || !repo.actors?.[r.sourceId] || !repo.actors?.[r.targetId]) continue;
      if (actors.has(r.sourceId) || actors.has(r.targetId)) { scope.set(r.id, r); changed = true; }
    }
    if (!changed) break;
  }
  return [...scope.values()];
}

export function renderUseCaseDiagrams(repo: SysmlRepository): string[] {
  const useCases = Object.values(repo.useCases ?? {});
  const actors = Object.values(repo.actors ?? {});
  const subjects = Object.values(repo.subjects ?? {});
  if (useCases.length === 0 && actors.length === 0 && subjects.length === 0) return [];
  const rels = Object.values(repo.relationships ?? {}).filter(r => isUseCaseRelationshipKind(r.kind)) as SysmlRelationship[];

  const defs: UseCaseFigureDef[] = subjects.map(s => ({
    title: sysmlObjectLabel(s, 'Subject'), boundary: true, subjectLabel: sysmlObjectLabel(s, 'Subject'),
    insideIds: useCases.filter(u => u.subjectId === s.id).map(u => u.id), extraActorIds: [],
  }));
  const unassigned = useCases.filter(u => !u.subjectId || !repo.subjects?.[u.subjectId]).map(u => u.id);
  const placedActors = new Set<string>();
  const scopes = defs.map(def => useCaseScope(repo, rels, new Set(def.insideIds), new Set()));
  const unassignedScope = useCaseScope(repo, rels, new Set(unassigned), new Set());
  [...scopes, unassignedScope].forEach(scope => scope.forEach(r => [r.sourceId, r.targetId].forEach(id => { if (repo.actors?.[id]) placedActors.add(id); })));
  const orphanActors = actors.filter(a => !placedActors.has(a.id)).map(a => a.id);
  if (unassigned.length > 0 || orphanActors.length > 0) {
    defs.push({ title: 'Unassigned use cases', boundary: unassigned.length > 0, subjectLabel: 'No subject', insideIds: unassigned, extraActorIds: orphanActors });
  }

  const figures: string[] = [];
  for (const def of defs) {
    const pages = def.insideIds.length > MAX_NODES_PER_FIGURE ? chunkItems(def.insideIds, MAX_NODES_PER_FIGURE) : [def.insideIds];
    pages.forEach((insideIds, pageIndex) => {
      const inside = new Set(insideIds);
      const extra = new Set(pageIndex === 0 ? def.extraActorIds : []);
      const scope = useCaseScope(repo, rels, inside, extra);
      figures.push(renderUseCaseFigure(repo, def, insideIds, extra, scope, pageIndex, pages.length));
    });
  }
  return figures;
}

function renderUseCaseFigure(
  repo: SysmlRepository, def: UseCaseFigureDef, insideIds: string[], extra: Set<string>, fullScope: SysmlRelationship[], pageIndex: number, pageCount: number,
): string {
  const inside = new Set(insideIds);
  // A relationship between two use cases that live on different views is drawn once, on the view owning its source
  // (the owner always has both ends in scope); every other view lists it as not drawn instead of repeating it.
  const isUseCase = (id: string) => Boolean(repo.useCases?.[id]);
  const deferred = fullScope.filter(r => isUseCase(r.sourceId) && isUseCase(r.targetId) && !inside.has(r.sourceId) && inside.has(r.targetId));
  const scope = fullScope.filter(r => !deferred.includes(r));
  const ucName = (id: string) => sysmlObjectLabel(repo.useCases[id], 'Use Case');
  const deferredOmissions = deferred.map(r => ({
    id: r.id, reason: `${ucName(r.sourceId)} → ${ucName(r.targetId)} (${r.kind}; drawn on the view that owns ${ucName(r.sourceId)})`,
  }));
  const nodeFor = (id: string): UcNode | undefined => {
    const kind = useCaseKind(repo, id);
    if (!kind) return undefined;
    const e = repo.actors?.[id] ?? repo.useCases?.[id] ?? repo.requirements?.[id] ?? repo.subjects?.[id];
    const label = sysmlObjectLabel(e as { name?: string; kind?: string }, friendlySysmlKind(kind));
    if (kind === 'useCase') {
      const eps = (repo.useCases[id].extensionPointIds ?? []).map(epId => repo.extensionPoints?.[epId]).filter(Boolean).map(ep => sysmlObjectLabel(ep!, 'Extension Point'));
      const size = ellipseSize(label, eps);
      return { id, kind, label, extensionPoints: eps, rect: { x: 0, y: 0, ...size } };
    }
    if (kind === 'actor') return { id, kind, label, extensionPoints: [], isExternal: repo.actors[id].isExternal, rect: { x: 0, y: 0, width: Math.max(ACTOR_W, label.length * 6.5 + 12), height: ACTOR_H + (repo.actors[id].isExternal ? 12 : 0) } };
    return { id, kind, label, extensionPoints: [], rect: { x: 0, y: 0, width: Math.max(130, label.length * 6.5 + 20), height: 52 } };
  };

  const nodes = new Map<string, UcNode>();
  for (const id of [...insideIds, ...extra]) { const n = nodeFor(id); if (n) nodes.set(id, n); }
  const outsideIds = new Set<string>();
  for (const r of scope) for (const id of [r.sourceId, r.targetId]) if (!inside.has(id) && !extra.has(id)) outsideIds.add(id);
  for (const id of outsideIds) { const n = nodeFor(id); if (n) nodes.set(id, n); }

  const labelOf = (id: string) => nodes.get(id)?.label ?? 'Unknown element';
  const drawable = scope.filter(r => nodes.has(r.sourceId) && nodes.has(r.targetId));
  const omitted = [...scope.filter(r => !drawable.includes(r)).map(r => ({
    id: r.id, reason: `${labelOf(r.sourceId)} → ${labelOf(r.targetId)} (${r.kind}; an end is not in the model)`,
  })), ...deferredOmissions];

  // Inside the boundary: use cases, layered top-down. Everything else sits in columns beside it.
  const insideNodes = insideIds.map(id => nodes.get(id)).filter((n): n is UcNode => Boolean(n));
  const insideSized: SizedNode[] = insideNodes.map(n => ({ id: n.id, lines: [], width: n.rect.width, height: n.rect.height, kind: 'useCase' }));
  const insideEdges = drawable.filter(r => inside.has(r.sourceId) && inside.has(r.targetId)).map(r => hierarchyRankEdge({ sourceId: r.sourceId, targetId: r.targetId, kind: r.kind }));
  const placedInside = layoutLayered(insideSized, insideEdges, { direction: 'TB', hGap: 40, vGap: 40, maxRowWidth: 460 });
  for (const p of placedInside) nodes.get(p.id)!.rect = { x: p.x, y: p.y, width: p.width, height: p.height };
  const innerBounds = placedInside.length > 0 ? boundsOf(placedInside, 0) : { x: 0, y: 0, width: 220, height: 60 };
  const PAD = 26;
  const HEADER = 34;
  const frame: DiagramRect = def.boundary
    ? { x: innerBounds.x - PAD, y: innerBounds.y - HEADER - 10, width: Math.max(innerBounds.width + PAD * 2, (def.subjectLabel?.length ?? 0) * 7 + 40), height: innerBounds.height + HEADER + 10 + PAD }
    : { x: innerBounds.x - PAD, y: innerBounds.y - PAD, width: innerBounds.width + PAD * 2, height: innerBounds.height + PAD * 2 };

  const centreY = (n: UcNode) => n.rect.y + n.rect.height / 2;
  const peersOf = (id: string): UcNode[] => drawable.flatMap(r => r.sourceId === id ? [nodes.get(r.targetId)!] : r.targetId === id ? [nodes.get(r.sourceId)!] : []);
  const outside = [...nodes.values()].filter(n => !inside.has(n.id));
  const actorsOut = outside.filter(n => n.kind === 'actor' && !inside.has(n.id));
  const wantedY = (n: UcNode) => {
    const ys = peersOf(n.id).filter(p => inside.has(p.id)).map(centreY);
    return ys.length > 0 ? ys.reduce((a, b) => a + b, 0) / ys.length : frame.y + frame.height / 2;
  };
  actorsOut.sort((a, b) => wantedY(a) - wantedY(b));
  const leftActors = actorsOut.filter((_, i) => i % 2 === 0);
  const rightActors = actorsOut.filter((_, i) => i % 2 === 1);
  const rightOthers = outside.filter(n => n.kind !== 'actor').sort((a, b) => wantedY(a) - wantedY(b));
  const GAP = 24;
  const stack = (list: UcNode[], x: (n: UcNode) => number) => {
    let bottom = -Infinity;
    for (const n of list) {
      const y = Math.max(wantedY(n) - n.rect.height / 2, bottom + GAP);
      n.rect = { ...n.rect, x: x(n), y };
      bottom = y + n.rect.height;
    }
  };
  const leftEdge = frame.x - 80;
  const rightEdge = frame.x + frame.width + 80;
  stack(leftActors, n => leftEdge - n.rect.width);
  stack([...rightActors, ...rightOthers], () => rightEdge);

  // Edges: straight, clipped to the outlines (as the app's canvas does), fanned when parallel.
  const offsets = parallelEdgeOffsets(drawable, 16);
  const centre = (n: UcNode) => ({ x: n.rect.x + n.rect.width / 2, y: n.rect.y + n.rect.height / 2 });
  const edgeEls = drawable.map((r, i) => {
    const s = nodes.get(r.sourceId)!;
    const t = nodes.get(r.targetId)!;
    const notation = USE_CASE_EDGE_NOTATION[r.kind as keyof typeof USE_CASE_EDGE_NOTATION];
    const sc = centre(s);
    const tc = centre(t);
    const len = Math.hypot(tc.x - sc.x, tc.y - sc.y) || 1;
    const sign = r.sourceId < r.targetId ? 1 : -1;
    const spread = (offsets.get(r.id) ?? 0) * sign;
    const ox = (-(tc.y - sc.y) / len) * spread;
    const oy = ((tc.x - sc.x) / len) * spread;
    const clipFor = (n: UcNode) => ({ kind: n.kind === 'useCase' ? 'useCase' as const : 'actor' as const, bounds: n.rect });
    const start = clipToNode(clipFor(s), { x: tc.x + ox, y: tc.y + oy });
    const end = clipToNode(clipFor(t), { x: sc.x + ox, y: sc.y + oy });
    const keyword = edgeBadgeLabel({ type: notation.keywordType });
    const notes: string[] = [];
    if (r.kind === 'extend') {
      const ep = r.extensionPointId ? repo.extensionPoints?.[r.extensionPointId] : undefined;
      notes.push(`extension point: ${ep ? sysmlObjectLabel(ep, 'Extension Point') : '(unresolved)'}`);
      if (r.name?.trim()) notes.push(`[${r.name.trim()}]`);
    }
    const mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
    const markerEnd = notation.head === 'openArrow' ? 'rf-arrow-open' : notation.head === 'hollowTriangle' ? 'rf-triangle-hollow' : undefined;
    return edgePath(`edge-uc${pageIndex}-${i}`, `M ${start.x} ${start.y} L ${end.x} ${end.y}`, { dashed: notation.lineStyle === 'dashed', markerEnd })
      + haloTxt(mid.x, mid.y - 4, keyword) + notes.map((line, k) => haloTxt(mid.x, mid.y + 7 + k * 10, line)).join('');
  });

  const frameEls = def.boundary
    ? `<rect x="${frame.x}" y="${frame.y}" width="${frame.width}" height="${frame.height}" fill="none" stroke="${STROKE}" stroke-width="1.5"/>`
      + txt(frame.x + 10, frame.y + 20, def.subjectLabel ?? '', { weight: 600, anchor: 'start' })
    : '';
  const nodeEls = [...nodes.values()].map(n => n.kind === 'actor' ? drawActor(n)
    : n.kind === 'useCase' ? drawUseCase(n)
    : drawBox(n, n.kind));

  const viewNote = pageCount > 1 ? ` · view ${pageIndex + 1} of ${pageCount}` : '';
  const ucCount = [...nodes.values()].filter(n => n.kind === 'useCase' && inside.has(n.id)).length;
  const actorCount = [...nodes.values()].filter(n => n.kind === 'actor').length;
  const caption = `Use case diagram · ${def.title}${viewNote} (${ucCount} use cases, ${actorCount} actors, ${drawable.length} relationships)`;
  const all = [...nodes.values()].map(n => n.rect);
  const hasContent = nodes.size > 0 || def.boundary;
  if (!hasContent) return renderEmptyFigure(`${def.title}: nothing modelled.`);
  return fig(`${frameEls}${edgeEls.join('')}${nodeEls.join('')}`, caption, boundsOf([...all, ...(def.boundary ? [frame] : [])], 28),
    { drawnNodes: nodes.size, drawnEdges: drawable.length, omitted });
}

// ---------------------------------------------------------------------------
// Activity diagrams
// ---------------------------------------------------------------------------

interface ActivityPlaced { node: ActivityNode; rect: DiagramRect; lane: number }
const LANE_PAD = 24;
const ROW_GAP = 52;
const COL_GAP = 28;

function activityNodeSize(node: ActivityNode, detail: string | undefined): { width: number; height: number } {
  const base = ACTIVITY_NODE_SIZES[node.kind];
  if (node.kind === 'action' || node.kind === 'objectNode' || node.kind === 'activityParameterNode') {
    const m = measureNode(node.id, [nodeLabel(node), detail ?? ''], 'activity', base.width);
    return { width: Math.max(m.width, node.kind === 'action' ? actionMinWidth(node) : base.width), height: Math.max(base.height, m.height + 6) };
  }
  return base;
}

function activityDetail(repo: SysmlRepository, activity: ActivityDefinition, node: ActivityNode): string | undefined {
  if (node.kind === 'action' && node.behaviorId) {
    const b = repo.definitions[node.behaviorId];
    return `«call» ${sysmlObjectLabel(b, b?.kind === 'interaction' ? 'Interaction' : 'Activity')}`;
  }
  if (node.kind === 'objectNode' || node.kind === 'activityParameterNode') {
    const parameter = (activity.parameters ?? []).find(p => p.id === node.parameterId);
    const typeId = node.typeId || parameter?.typeId;
    const typeText = typeId ? `: ${sysmlObjectLabel(repo.definitions[typeId], 'Type')}` : '';
    return node.kind === 'activityParameterNode' ? `«parameter»${typeText}` : typeText || undefined;
  }
  return undefined;
}

function partitionRepresents(repo: SysmlRepository, representsId: string | undefined): string | undefined {
  if (!representsId) return undefined;
  const target = repo.definitions[representsId] ?? repo.usages[representsId] ?? repo.actors?.[representsId]
    ?? Object.values(repo.definitions).flatMap(d => d.kind === 'block' ? d.properties : []).find(p => p.id === representsId);
  return target ? sysmlObjectLabel(target as { name?: string; kind?: string }, 'Block') : undefined;
}

function drawActivityNodeShape(placed: ActivityPlaced, detail: string | undefined): string {
  const { node, rect } = placed;
  const { x, y, width, height } = rect;
  const cx = x + width / 2;
  const cy = y + height / 2;
  const named = node.name?.trim();
  switch (node.kind) {
    case 'initial':
      return `<circle cx="${cx}" cy="${cy}" r="${width / 2}" fill="${TEXT}" stroke="${TEXT}"/>`;
    case 'activityFinal':
      return `<circle cx="${cx}" cy="${cy}" r="${width / 2}" fill="#ffffff" stroke="${TEXT}" stroke-width="1.4"/><circle cx="${cx}" cy="${cy}" r="${width / 2 - 6}" fill="${TEXT}"/>`;
    case 'flowFinal':
      return `<circle cx="${cx}" cy="${cy}" r="${width / 2}" fill="#ffffff" stroke="${TEXT}" stroke-width="1.4"/><path d="M ${cx - 6} ${cy - 6} L ${cx + 6} ${cy + 6} M ${cx + 6} ${cy - 6} L ${cx - 6} ${cy + 6}" stroke="${TEXT}" stroke-width="1.4"/>`;
    case 'decision':
    case 'merge':
      return `<path d="M ${cx} ${y} L ${x + width} ${cy} L ${cx} ${y + height} L ${x} ${cy} z" fill="#ffffff" stroke="${STROKE}" stroke-width="1.3"/>`
        + (named ? txt(x + width + 6, cy + 3, named, { size: 10, anchor: 'start', fill: '#44515e' }) : '');
    case 'fork':
    case 'join':
      return `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${TEXT}"/>${named ? txt(x + width + 6, cy + 3, named, { size: 10, anchor: 'start', fill: '#44515e' }) : ''}`;
    case 'objectNode':
    case 'activityParameterNode':
      return `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="#ffffff" stroke="${STROKE}" stroke-width="1.3"/>`
        + txt(cx, cy - (detail ? 2 : -4), nodeLabel(node), { weight: 600 }) + txt(cx, cy + 13, detail ?? '', { size: 9, fill: MUTED });
    default:
      return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="12" fill="#ffffff" stroke="${STROKE}" stroke-width="1.3"/>`
        + txt(cx, cy - (detail ? 2 : -4), nodeLabel(node), { weight: 600 }) + txt(cx, cy + 13, detail ?? '', { size: 9, fill: MUTED });
  }
}

export function renderActivityDiagrams(repo: SysmlRepository): string[] {
  const activities = Object.values(repo.definitions ?? {}).filter((d): d is ActivityDefinition => d.kind === 'activity');
  return activities.flatMap(activity => renderActivity(repo, activity));
}

function renderActivity(repo: SysmlRepository, activity: ActivityDefinition): string[] {
  const label = sysmlObjectLabel(activity, 'Activity');
  const nodes = activity.nodes ?? [];
  if (nodes.length === 0) return [renderEmptyFigure(`${label}: no actions or control nodes modelled.`)];
  const partitions = activity.partitions ?? [];
  const nodeById = new Map(nodes.map(n => [n.id, n]));
  const nameOfEnd = (id: string): string => {
    const end = resolveActivityEndpoint(activity, id);
    if (!end) return 'unknown node';
    return end.pin ? `${nodeLabel(end.node)}.${end.pin.name?.trim() || 'pin'}` : nodeLabel(end.node);
  };
  const owner = (id: string) => resolveActivityEndpoint(activity, id)?.node.id;
  const scope: ScopedConnection[] = (activity.edges ?? []).map(e => ({
    id: e.id, sourceId: owner(e.sourceId) ?? e.sourceId, targetId: owner(e.targetId) ?? e.targetId, kind: e.kind,
  }));
  const knownIds = new Set(nodes.map(n => n.id));
  const pages = connectionPages(nodes, scope.filter(c => knownIds.has(c.sourceId) && knownIds.has(c.targetId)));
  return pages.map((pageNodes, pageIndex) => {
    const pageIds = new Set(pageNodes.map(n => n.id));
    const laneIndexOf = (n: ActivityNode): number => {
      const i = partitions.findIndex(p => (p.nodeIds ?? []).includes(n.id));
      return i >= 0 ? i : partitions.length;
    };
    const hasUnassigned = partitions.length > 0 && pageNodes.some(n => laneIndexOf(n) === partitions.length);
    const laneCount = partitions.length === 0 ? 1 : partitions.length + (hasUnassigned ? 1 : 0);
    const laneOf = (n: ActivityNode) => partitions.length === 0 ? 0 : laneIndexOf(n);
    const details = new Map(pageNodes.map(n => [n.id, activityDetail(repo, activity, n)]));
    const sizes = new Map(pageNodes.map(n => [n.id, activityNodeSize(n, details.get(n.id))]));
    const pageEdges = (activity.edges ?? []).filter(e => {
      const s = owner(e.sourceId);
      const t = owner(e.targetId);
      return s && t && pageIds.has(s) && pageIds.has(t);
    });
    const flow = pageEdges.map(e => ({ sourceId: owner(e.sourceId)!, targetId: owner(e.targetId)! }));
    const roots = pageNodes.filter(n => n.kind === 'initial').map(n => n.id);
    const rank = rankNodes(pageNodes, flow, roots);
    const maxRank = Math.max(0, ...rank.values());

    const placeAll = (order: Map<string, number>): { placed: Map<string, ActivityPlaced>; laneX: number[]; laneW: number[]; height: number } => {
      const cell = (r: number, lane: number) => pageNodes.filter(n => rank.get(n.id) === r && laneOf(n) === lane)
        .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
      const laneW: number[] = Array.from({ length: laneCount }, () => 0);
      for (let r = 0; r <= maxRank; r++) {
        for (let l = 0; l < laneCount; l++) {
          const c = cell(r, l);
          const w = c.reduce((sum, n) => sum + sizes.get(n.id)!.width, 0) + COL_GAP * Math.max(0, c.length - 1);
          laneW[l] = Math.max(laneW[l], w + LANE_PAD * 2, partitions.length > 0 ? 190 : 0);
        }
      }
      const laneX: number[] = [];
      laneW.reduce((x, w, i) => { laneX[i] = x; return x + w; }, 0);
      const top = partitions.length > 0 ? LANE_HEADER_HEIGHT + 34 : 20;
      const placed = new Map<string, ActivityPlaced>();
      let y = top;
      for (let r = 0; r <= maxRank; r++) {
        let rowH = 0;
        for (let l = 0; l < laneCount; l++) {
          const c = cell(r, l);
          const w = c.reduce((sum, n) => sum + sizes.get(n.id)!.width, 0) + COL_GAP * Math.max(0, c.length - 1);
          let x = laneX[l] + (laneW[l] - w) / 2;
          for (const n of c) {
            const s = sizes.get(n.id)!;
            placed.set(n.id, { node: n, lane: l, rect: { x, y, width: s.width, height: s.height } });
            x += s.width + COL_GAP;
            rowH = Math.max(rowH, s.height);
          }
        }
        y += rowH + ROW_GAP;
      }
      return { placed, laneX, laneW, height: y };
    };
    // Pass 1 in model order; pass 2 orders each cell by the mean x of its predecessors to untangle flows.
    const first = placeAll(new Map(pageNodes.map((n, i) => [n.id, i])));
    const preds = new Map<string, string[]>(pageNodes.map(n => [n.id, []]));
    flow.forEach(f => preds.get(f.targetId)?.push(f.sourceId));
    const order = new Map(pageNodes.map((n, i) => {
      const ps = preds.get(n.id)!.map(p => first.placed.get(p)).filter((p): p is ActivityPlaced => Boolean(p));
      const mean = ps.length > 0 ? ps.reduce((sum, p) => sum + p.rect.x + p.rect.width / 2, 0) / ps.length : (first.placed.get(n.id)?.rect.x ?? 0);
      return [n.id, mean + i * 1e-6] as [string, number];
    }));
    const { placed, laneX, laneW, height } = placeAll(order);

    // Pins sit on the action's top (in) and bottom (out) border.
    const pinRects = new Map<string, DiagramRect>();
    const pinEls: string[] = [];
    for (const p of placed.values()) {
      for (const direction of ['in', 'out'] as const) {
        const pins = (p.node.pins ?? []).filter(pin => pin.direction === direction);
        pins.forEach((pin, i) => {
          const cx = p.rect.x + (p.rect.width * (i + 1)) / (pins.length + 1);
          const cy = direction === 'in' ? p.rect.y : p.rect.y + p.rect.height;
          const r = { x: cx - PIN_SIZE / 2, y: cy - PIN_SIZE / 2, width: PIN_SIZE, height: PIN_SIZE };
          pinRects.set(pin.id, r);
          pinEls.push(`<rect x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}" fill="#ffffff" stroke="${STROKE}" stroke-width="1"/>`
            + txt(cx + PIN_SIZE / 2 + 3, direction === 'in' ? cy - 8 : cy + 16, pin.name?.trim() ?? '', { size: 8, anchor: 'start', fill: MUTED }));
        });
      }
    }
    const actionRects = [...placed.values()].map(p => p.rect);
    const rectOfEnd = (id: string): DiagramRect | undefined => pinRects.get(id) ?? placed.get(id)?.rect;
    const offsets = parallelEdgeOffsets(pageEdges.map(e => ({ id: e.id, sourceId: e.sourceId, targetId: e.targetId })), 12);
    const edgeEls = pageEdges.map(e => {
      const s = rectOfEnd(e.sourceId);
      const t = rectOfEnd(e.targetId);
      if (!s || !t) return '';
      const offset = offsets.get(e.id) ?? 0;
      const guard = e.guard?.trim() ? `[${e.guard.trim()}]` : '';
      const lp = routeEdgeLabelPoint(s, t, { offset, obstacles: actionRects });
      return edgePath(`edge-act${pageIndex}-${e.id.replace(/[^A-Za-z0-9_-]/g, '_')}`, routeEdgePath(s, t, { direction: 'TB', offset, obstacles: actionRects }),
        { dashed: e.kind === 'objectFlow', markerEnd: 'rf-arrow-open' }) + haloTxt(lp.x, lp.y, guard, { anchor: lp.anchor, size: 9, fill: TEXT });
    });

    const laneEls: string[] = [];
    if (partitions.length > 0) {
      const lanes = [...partitions.map(p => ({ name: p.name?.trim() || 'Partition', represents: partitionRepresents(repo, p.representsId) })),
        ...(hasUnassigned ? [{ name: '(no partition)', represents: undefined }] : [])];
      lanes.forEach((lane, i) => {
        laneEls.push(`<rect x="${laneX[i]}" y="0" width="${laneW[i]}" height="${height - ROW_GAP + 24}" fill="none" stroke="${STROKE}" stroke-width="1.1"/>`
          + `<rect x="${laneX[i]}" y="0" width="${laneW[i]}" height="${LANE_HEADER_HEIGHT}" fill="${SOFT}" stroke="${STROKE}" stroke-width="1.1"/>`
          + txt(laneX[i] + laneW[i] / 2, lane.represents ? 18 : 27, lane.name, { weight: 600 })
          + (lane.represents ? txt(laneX[i] + laneW[i] / 2, 34, `«represents» ${lane.represents}`, { size: 9, fill: MUTED }) : ''));
      });
    }
    const totalW = laneW.reduce((a, b) => a + b, 0);
    const frameH = height - ROW_GAP + 24;
    const titleY = -10;
    const nodeEls = [...placed.values()].map(p => nodeGroup(p.node.kind, p.rect, drawActivityNodeShape(p, details.get(p.node.id))));
    const viewNote = pages.length > 1 ? ` · view ${pageIndex + 1} of ${pages.length}` : '';
    const offPage = omittedForPage(scope, pageIds, knownIds, id => nodeById.has(id) ? nodeLabel(nodeById.get(id)!) : 'unknown node');
    // Edges whose own ends are missing entirely are in no page's scope above: report them here (first page).
    const unresolved = pageIndex === 0
      ? (activity.edges ?? []).filter(e => !owner(e.sourceId) && !owner(e.targetId))
        .map(e => ({ id: e.id, reason: `${nameOfEnd(e.sourceId)} → ${nameOfEnd(e.targetId)} (${e.kind}; an end is not in the activity)` }))
      : [];
    const inner = txt(4, titleY, `act [Activity] ${label}`, { weight: 600, anchor: 'start' })
      + (partitions.length === 0 ? `<rect x="0" y="0" width="${totalW}" height="${frameH}" fill="none" stroke="${STROKE}" stroke-width="1.1" stroke-dasharray="6 4"/>` : '')
      + laneEls.join('') + edgeEls.join('') + nodeEls.join('') + pinEls.join('');
    return fig(inner, `Activity diagram · ${label}${viewNote} (${pageNodes.length} nodes, ${pageEdges.length} flows)`,
      { x: -12, y: -28, width: totalW + 24, height: frameH + 40 },
      { drawnNodes: pageNodes.length, drawnEdges: pageEdges.length, omitted: [...offPage, ...unresolved] });
  });
}

// ---------------------------------------------------------------------------
// Sequence diagrams
// ---------------------------------------------------------------------------

const REPORT_DIAGRAM_ID = '__report_sequence__';

/**
 * Page budget of one sequence figure (user units, font 10/9): a portrait page prints it at >= 8px when the viewBox is at most
 * ~740 wide and ~1020 tall. Tall diagrams cannot go landscape, so they are compacted and split instead.
 */
const SEQ_MAX_WIDTH = 700;
const SEQ_MAX_HEIGHT = 1000;
const SEQ_HEAD_WIDTH = 128;
const SEQ_MIN_SPACING = 140;
/** Constraint brackets sit right of the last lifeline: their offset, wrapped text width and the extra width they need beyond the last head. */
const SEQ_CONSTRAINT_OFFSET = 56;
const SEQ_CONSTRAINT_TEXT = 130;
const SEQ_CONSTRAINT_GUTTER = SEQ_CONSTRAINT_OFFSET + SEQ_CONSTRAINT_TEXT + 8 - SEQ_HEAD_WIDTH / 2;
const SEQ_MAX_SPACING = 200;
const SEQ_MESSAGE_PITCH = 46;
/** Slot height spent besides messages: heads, first gap, lifeline tail, figure margins. */
const SEQ_OVERHEAD = 72 + 56 + 24 + 32;

/** Word-wraps a message label to `maxWidth` user units at font 10. Long identifiers break after "(" or "," and at camelCase humps; only a hump-less run wider than the line is split by characters. Nothing is cut. */
export function wrapSequenceLabel(text: string, maxWidth: number): string[] {
  const maxChars = Math.max(8, Math.floor(maxWidth / (10 * 0.58)));
  const pieces: { text: string; glue: boolean }[] = [];
  for (const word of text.split(/\s+/).filter(Boolean)) {
    word.split(/(?<=[(,])|(?<=[a-z0-9])(?=[A-Z])/).forEach((part, i) => pieces.push({ text: part, glue: i > 0 }));
  }
  const lines: string[] = [];
  let line = '';
  for (const piece of pieces) {
    let rest = piece.text;
    while (rest.length > maxChars) {
      if (line) { lines.push(line); line = ''; }
      lines.push(rest.slice(0, maxChars));
      rest = rest.slice(maxChars);
    }
    const sep = piece.glue ? '' : ' ';
    if (!line) line = rest;
    else if (line.length + sep.length + rest.length <= maxChars) line += sep + rest;
    else { lines.push(line); line = rest; }
  }
  if (line) lines.push(line);
  return lines.length > 0 ? lines : [text];
}

function sequenceOptions(lifelineCount: number, hasConstraints = false): SequenceViewOptions {
  const room = SEQ_MAX_WIDTH - SEQ_HEAD_WIDTH - (hasConstraints ? SEQ_CONSTRAINT_GUTTER : 0);
  const spacing = lifelineCount > 1
    ? Math.max(SEQ_MIN_SPACING, Math.min(SEQ_MAX_SPACING, Math.floor(room / (lifelineCount - 1))))
    : SEQ_MAX_SPACING;
  return {
    lifelineSpacing: spacing, headWidth: SEQ_HEAD_WIDTH, messageSpacing: SEQ_MESSAGE_PITCH, wrapLabel: wrapSequenceLabel,
    ...(hasConstraints ? { constraintOffset: SEQ_CONSTRAINT_OFFSET, constraintLaneWidth: SEQ_CONSTRAINT_TEXT + 12 } : {}),
  };
}

/** Estimated slot height of a message (pitch plus wrapped label lines), used to size the chunks before layout. */
function estimateRow(m: InteractionMessage, index: number, lifelineCount: number, hasConstraints: boolean): number {
  const opts = sequenceOptions(lifelineCount, hasConstraints);
  const lines = wrapSequenceLabel(`${index + 1}: ${messageLabel(m)}`, (opts.lifelineSpacing ?? SEQ_MAX_SPACING) - 34).length;
  return SEQ_MESSAGE_PITCH + (lines - 1) * LABEL_LINE_HEIGHT;
}

/** Splits the messages into consecutive chunks whose estimated height fits `budget`. */
function chunkByHeight(messages: InteractionMessage[], lifelineCount: number, hasConstraints: boolean, budget: number): InteractionMessage[][] {
  const chunks: InteractionMessage[][] = [];
  let current: InteractionMessage[] = [];
  let height = 0;
  messages.forEach((m, i) => {
    const row = estimateRow(m, i, lifelineCount, hasConstraints);
    if (current.length > 0 && (height + row > budget || current.length >= MAX_NODES_PER_FIGURE)) { chunks.push(current); current = []; height = 0; }
    current.push(m);
    height += row;
  });
  if (current.length > 0) chunks.push(current);
  return chunks;
}

function sliceInteraction(interaction: InteractionDefinition, chunk: InteractionMessage[], all: Set<string>, chunkIndex: number, ownerOf: Map<string, number>): InteractionDefinition {
  const inChunk = new Set(chunk.map(m => m.id));
  const belongs = (afterMessageId: string | undefined) => (afterMessageId && all.has(afterMessageId) ? ownerOf.get(afterMessageId) === chunkIndex : chunkIndex === 0);
  return {
    ...interaction,
    messages: chunk,
    fragments: (interaction.fragments ?? [])
      .filter(f => f.operands.some(o => o.messageIds.some(id => inChunk.has(id))) || (chunkIndex === 0 && f.operands.every(o => !o.messageIds.some(id => all.has(id)))))
      .map(f => ({ ...f, operands: f.operands.map(o => ({ ...o, messageIds: o.messageIds.filter(id => inChunk.has(id)) })) })),
    uses: (interaction.uses ?? []).filter(u => belongs(u.afterMessageId)),
    stateInvariants: (interaction.stateInvariants ?? []).filter(s => belongs(s.afterMessageId)),
    constraints: (interaction.constraints ?? []).filter(c => inChunk.has(c.fromMessageId) && (!c.toMessageId || inChunk.has(c.toMessageId))),
  };
}

/** Space kept below the last message / fragment before the lifelines end and the figure is cut. */
const SEQUENCE_TAIL = 24;

/**
 * Bounds of everything a sequence view draws except the full-height lifeline lines: heads, messages and their
 * labels, fragments, references, invariants, constraints, activations and destruction marks. The app's own canvas
 * is sized for editing room; the report trims to this plus a short lifeline tail.
 */
function sequenceContentRects(view: SequenceDiagramView): DiagramRect[] {
  const rects: DiagramRect[] = [];
  for (const l of view.lifelines) {
    rects.push(l.head);
    if (l.destroyedAtY !== undefined) rects.push({ x: l.centerX - 7, y: l.destroyedAtY - 7, width: 14, height: 14 });
  }
  for (const m of view.messages) {
    for (const p of m.points) rects.push({ x: p.x, y: p.y, width: 0, height: 0 });
    const lines = m.labelLines ?? [m.text];
    lines.forEach((line, i) => rects.push(textBox(m.labelAt.x, m.labelAt.y - (lines.length - 1 - i) * LABEL_LINE_HEIGHT, line, 10, m.isSelf ? 'start' : 'middle')));
  }
  for (const f of view.fragments) rects.push(f.bounds);
  for (const u of view.uses) rects.push(u.bounds);
  for (const s of view.stateInvariants) rects.push(s.bounds);
  for (const a of view.activations) rects.push(a.bounds);
  for (const c of view.constraints) {
    const lines = wrapSequenceLabel(c.text, SEQ_CONSTRAINT_TEXT);
    const mid = (c.yFrom + c.yTo) / 2;
    rects.push({ x: c.x - 8, y: Math.min(c.yFrom, c.yTo), width: 14 + Math.max(...lines.map(l => textWidth(l, 10))), height: Math.abs(c.yTo - c.yFrom) });
    lines.forEach((line, i) => rects.push(textBox(c.x + 6, mid + 3 + (i - (lines.length - 1) / 2) * LABEL_LINE_HEIGHT, line, 10, 'start')));
  }
  return rects;
}

function drawSequence(view: SequenceDiagramView, key: string, lifelineBottom: number): { svg: string; tagged: number } {
  const els: string[] = [];
  for (const f of view.fragments) {
    const { x, y, width, height } = f.bounds;
    const tagW = f.operator.length * 7 + 16;
    els.push(`<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="none" stroke="${STROKE}" stroke-width="1.1"/>`
      + `<path d="M ${x} ${y} h ${tagW} v 10 l -6 6 h ${-(tagW - 6)} z" fill="${SOFT}" stroke="${STROKE}" stroke-width="1.1"/>`
      + txt(x + 8, y + 12, f.operator, { size: 10, weight: 600, anchor: 'start' }));
    f.operands.forEach((o, i) => {
      if (i > 0) els.push(`<line x1="${x}" y1="${o.top}" x2="${x + width}" y2="${o.top}" stroke="${STROKE}" stroke-width="1" stroke-dasharray="6 4"/>`);
      els.push(txt(i === 0 ? x + tagW + 8 : x + 8, o.top + 13, o.guardLabel, { size: 9, anchor: 'start', fill: '#44515e' }));
    });
  }
  for (const l of view.lifelines) {
    els.push(`<line x1="${l.centerX}" y1="${l.lineTop}" x2="${l.centerX}" y2="${Math.min(l.lineBottom, lifelineBottom)}" stroke="${EDGE}" stroke-width="1.1" stroke-dasharray="6 5"/>`);
    if (l.destroyedAtY !== undefined) {
      els.push(`<path d="M ${l.centerX - 7} ${l.destroyedAtY - 7} L ${l.centerX + 7} ${l.destroyedAtY + 7} M ${l.centerX + 7} ${l.destroyedAtY - 7} L ${l.centerX - 7} ${l.destroyedAtY + 7}" stroke="${TEXT}" stroke-width="1.6"/>`);
    }
  }
  for (const a of view.activations) {
    els.push(`<rect x="${a.bounds.x}" y="${a.bounds.y}" width="${a.bounds.width}" height="${a.bounds.height}" fill="${SOFT}" stroke="${STROKE}" stroke-width="1"/>`);
  }
  for (const l of view.lifelines) {
    const cx = l.head.x + l.head.width / 2;
    const second = l.isActor ? '«actor»' : l.typeLabel ? `: ${l.typeLabel}` : '';
    els.push(nodeGroup('lifeline', l.head, `<rect x="${l.head.x}" y="${l.head.y}" width="${l.head.width}" height="${l.head.height}" rx="4" fill="#ffffff" stroke="${STROKE}" stroke-width="1.3"/>`
      + txt(cx, l.head.y + (second ? 20 : 29), l.label, { weight: 600 }) + txt(cx, l.head.y + 36, second, { size: 9, fill: MUTED })));
  }
  for (const m of view.messages) {
    const dashed = m.dashed;
    const markerEnd = m.head === 'filled' ? 'rf-arrow-filled' : 'rf-arrow-open';
    els.push(edgePath(`edge-seq${key}-${m.position}`, polyline(m.points), { dashed, markerEnd }));
    if (m.circleAt) els.push(`<circle cx="${m.circleAt.x}" cy="${m.circleAt.y}" r="5" fill="${TEXT}"/>`);
    const lines = m.labelLines ?? [m.text];
    lines.forEach((line, li) => els.push(haloTxt(m.labelAt.x, m.labelAt.y - (lines.length - 1 - li) * LABEL_LINE_HEIGHT, line, { size: 10, fill: TEXT, anchor: m.isSelf ? 'start' : 'middle' })));
    if (m.sort === 'deleteMessage') {
      const end = m.points[m.points.length - 1];
      els.push(`<path d="M ${end.x - 6} ${end.y - 6} L ${end.x + 6} ${end.y + 6} M ${end.x + 6} ${end.y - 6} L ${end.x - 6} ${end.y + 6}" stroke="${TEXT}" stroke-width="1.6"/>`);
    }
  }
  for (const u of view.uses) {
    const { x, y, width, height } = u.bounds;
    els.push(`<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="#ffffff" stroke="${STROKE}" stroke-width="1.2"/>`
      + `<path d="M ${x} ${y} h 34 v 8 l -6 6 h -28 z" fill="${SOFT}" stroke="${STROKE}" stroke-width="1.1"/>` + txt(x + 8, y + 11, 'ref', { size: 10, weight: 600, anchor: 'start' })
      + txt(x + width / 2, y + height / 2 + 12, u.text));
  }
  for (const s of view.stateInvariants) {
    els.push(`<rect x="${s.bounds.x}" y="${s.bounds.y}" width="${s.bounds.width}" height="${s.bounds.height}" rx="12" fill="#ffffff" stroke="${STROKE}" stroke-width="1.2"/>`
      + txt(s.bounds.x + s.bounds.width / 2, s.bounds.y + 18, `{${s.text}}`, { size: 10 }));
  }
  for (const c of view.constraints) {
    els.push(`<path d="M ${c.x - 8} ${c.yFrom} h 8 V ${c.yTo} h -8" fill="none" stroke="${EDGE}" stroke-width="1.1"/>` + wrapSequenceLabel(c.text, SEQ_CONSTRAINT_TEXT).map((line, i, all) =>
      txt(c.x + 6, (c.yFrom + c.yTo) / 2 + 3 + (i - (all.length - 1) / 2) * LABEL_LINE_HEIGHT, line, { size: 10, anchor: 'start' })).join(''));
  }
  return { svg: els.join(''), tagged: view.lifelines.length };
}

export function renderSequenceDiagrams(repo: SysmlRepository): string[] {
  const interactions = Object.values(repo.definitions ?? {}).filter((d): d is InteractionDefinition => d.kind === 'interaction');
  return interactions.flatMap(interaction => {
    const label = sysmlObjectLabel(interaction, 'Interaction');
    if ((interaction.lifelines ?? []).length === 0 && (interaction.messages ?? []).length === 0) {
      return [renderEmptyFigure(`${label}: no lifelines or messages modelled.`)];
    }
    const messages = orderedMessages(interaction);
    const all = new Set(messages.map(m => m.id));
    const lifelineCount = (interaction.lifelines ?? []).length;
    const hasConstraints = (interaction.constraints ?? []).length > 0;
    const viewOptions = sequenceOptions(lifelineCount, hasConstraints);
    const layout = (chunks: InteractionMessage[][], i: number) => {
      const ownerOf = new Map<string, number>();
      chunks.forEach((c, ci) => c.forEach(m => ownerOf.set(m.id, ci)));
      const slice = chunks.length > 1 ? sliceInteraction(interaction, chunks[i], all, i, ownerOf) : interaction;
      const synthetic = {
        ...repo,
        diagrams: { ...repo.diagrams, [REPORT_DIAGRAM_ID]: { id: REPORT_DIAGRAM_ID, kind: 'diagram' as const, name: label, namespace: [], diagramKind: 'sequence' as const, contextElementId: interaction.id } },
        definitions: { ...repo.definitions, [interaction.id]: slice },
      } as SysmlRepository;
      const view = buildSequenceDiagramView(synthetic, REPORT_DIAGRAM_ID, undefined, viewOptions);
      const content = sequenceContentRects(view);
      const contentBottom = content.length ? Math.max(...content.map(r => r.y + r.height)) : 0;
      return { view, content, lifelineBottom: contentBottom + SEQUENCE_TAIL };
    };
    // Split by the page budget; refs, invariants and fragments add height the estimate cannot see, so re-split tighter until every view fits.
    let budget = SEQ_MAX_HEIGHT - SEQ_OVERHEAD;
    let chunks = chunkByHeight(messages, lifelineCount, hasConstraints, budget);
    for (let attempt = 0; attempt < 8 && chunks.some(c => c.length > 1); attempt++) {
      const tooTall = chunks.some((_, i) => layout(chunks, i).lifelineBottom + 16 > SEQ_MAX_HEIGHT);
      if (!tooTall) break;
      budget = Math.floor(budget * 0.85);
      chunks = chunkByHeight(messages, lifelineCount, hasConstraints, budget);
    }
    if (chunks.length === 0) chunks = [messages];
    return chunks.map((chunk, i) => {
      const { view, content, lifelineBottom } = layout(chunks, i);
      const drawn = new Set(view.messages.map(m => m.id));
      const omitted = chunk.filter(m => !drawn.has(m.id)).map(m => {
        const lifelineName = (id: string) => (interaction.lifelines ?? []).find(l => l.id === id)?.name?.trim() || 'unknown lifeline';
        return { id: m.id, reason: `${messageLabel(m)} (${lifelineName(m.sourceLifelineId)} → ${lifelineName(m.targetLifelineId)}; a lifeline is not in the interaction)` };
      });
      const { svg } = drawSequence(view, String(i), lifelineBottom);
      const lifelineLines = view.lifelines.map(l => ({ x: l.centerX, y: l.lineTop, width: 0, height: Math.max(0, Math.min(l.lineBottom, lifelineBottom) - l.lineTop) }));
      const viewNote = chunks.length > 1 ? ` · view ${i + 1} of ${chunks.length}` : '';
      return fig(svg, `Sequence diagram · ${label}${viewNote} (${view.lifelines.length} lifelines, ${view.messages.length} messages)`,
        boundsOf([...content, ...lifelineLines], 16),
        { drawnNodes: view.lifelines.length, drawnEdges: view.messages.length, omitted });
    });
  });
}

// ---------------------------------------------------------------------------
// Parametric diagrams
// ---------------------------------------------------------------------------

const PARAM_SIZE = 10;
const PARAM_PITCH = 18;

interface ParamNode {
  prop: PropertyDefinition;
  isConstraint: boolean;
  block?: ConstraintBlockDefinition;
  lines: string[];
  rect: DiagramRect;
}

export function renderParametricDiagrams(repo: SysmlRepository): string[] {
  const blocks = Object.values(repo.definitions ?? {}).filter(d => d.kind === 'block');
  const figures: string[] = [];
  for (const block of blocks) {
    if (block.kind !== 'block') continue;
    const bindings = Object.values(repo.connectors ?? {}).filter(c => c.ownerId === block.id && isParametricBinding(c));
    const constraintProps = block.properties.filter(p => p.kind === 'constraint');
    if (bindings.length === 0 && constraintProps.length === 0) continue;
    figures.push(...renderParametric(repo, block.id, block.properties, bindings));
  }
  return figures;
}

function renderParametric(repo: SysmlRepository, blockId: string, properties: PropertyDefinition[], bindings: ConnectorUsage[]): string[] {
  const block = repo.definitions[blockId];
  const blockLabel = sysmlObjectLabel(block, 'Block');
  const drawProps = properties.filter(p => p.kind === 'constraint' || p.kind === 'value');
  const propById = new Map(properties.map(p => [p.id, p]));
  const propLabel = (id: string | undefined) => (id && propById.get(id) ? sysmlObjectLabel(propById.get(id), 'Property') : 'unknown property');

  const nodes = new Map<string, ParamNode>();
  for (const prop of drawProps) {
    const isConstraint = prop.kind === 'constraint';
    const typeDef = repo.definitions[prop.typeId];
    const cb = isConstraint && typeDef?.kind === 'constraintBlock' ? typeDef : undefined;
    const typeName = prop.typeId ? sysmlObjectLabel(typeDef, isConstraint ? 'Constraint Block' : 'Type') : '';
    const lines = isConstraint
      ? ['«constraint»', `${prop.name} : ${typeName}`, ...(cb?.constraints ?? []).map(e => `{${e}}`)]
      : [`${prop.name}${typeName ? ` : ${typeName}` : ''}${prop.unit ? ` [${prop.unit}]` : ''}`, prop.defaultValue ? `= ${prop.defaultValue}` : ''];
    const m = measureNode(prop.id, lines, isConstraint ? 'constraint' : 'value', isConstraint ? 150 : 110);
    const slots = isConstraint ? (cb?.parameters.length ?? 0) : 0;
    nodes.set(prop.id, { prop, isConstraint, block: cb, lines: m.lines, rect: { x: 0, y: 0, width: m.width, height: Math.max(m.height, 16 + slots * PARAM_PITCH) } });
  }

  const endInfo = (end: unknown): { propertyId?: string; parameterId?: string } => (isParametricEnd(end) ? end : {});
  const resolveEnd = (end: unknown): { ok: true; propertyId: string; parameterId?: string } | { ok: false; why: string } => {
    const e = endInfo(end);
    if (!e.propertyId) return { ok: false, why: 'an end is missing' };
    const prop = propById.get(e.propertyId);
    if (!prop) return { ok: false, why: `${propLabel(e.propertyId)} is not a property of ${blockLabel}` };
    if (!nodes.has(prop.id)) return { ok: false, why: `${prop.name} is a ${prop.kind} property; only value and constraint properties are drawn` };
    if (prop.kind === 'constraint') {
      const cb = nodes.get(prop.id)!.block;
      if (!e.parameterId || !cb?.parameters.some(p => p.id === e.parameterId)) return { ok: false, why: `${prop.name} has no such parameter` };
    }
    return { ok: true, propertyId: prop.id, parameterId: e.parameterId };
  };
  const endText = (end: unknown) => {
    const e = endInfo(end);
    const cb = e.propertyId ? nodes.get(e.propertyId)?.block : undefined;
    const param = cb?.parameters.find(p => p.id === e.parameterId)?.name;
    return `${propLabel(e.propertyId)}${param ? `.${param}` : ''}`;
  };

  const omitted: { id: string; reason: string }[] = [];
  const drawable: { conn: ConnectorUsage; s: { propertyId: string; parameterId?: string }; t: { propertyId: string; parameterId?: string } }[] = [];
  for (const conn of bindings) {
    const s = resolveEnd(conn.sourceEnd);
    const t = resolveEnd(conn.targetEnd);
    if (s.ok && t.ok) drawable.push({ conn, s, t });
    else omitted.push({ id: conn.id, reason: `${endText(conn.sourceEnd)} = ${endText(conn.targetEnd)} (binding; ${!s.ok ? s.why : (t as { why: string }).why})` });
  }

  const longestParam = Math.max(0, ...[...nodes.values()].flatMap(n => (n.block?.parameters ?? []).map(p => p.name.length)));
  const gutter = Math.min(240, Math.max(70, 2 * longestParam * 5.4 + 40));
  const sized: SizedNode[] = [...nodes.values()].map(n => ({ id: n.prop.id, lines: n.lines, width: n.rect.width, height: n.rect.height, kind: n.isConstraint ? 'constraint' : 'value' }));
  const layoutEdges = drawable.filter(d => d.s.propertyId !== d.t.propertyId).map(d => {
    const sConstraint = nodes.get(d.s.propertyId)!.isConstraint;
    const tConstraint = nodes.get(d.t.propertyId)!.isConstraint;
    return sConstraint && !tConstraint ? { sourceId: d.t.propertyId, targetId: d.s.propertyId } : { sourceId: d.s.propertyId, targetId: d.t.propertyId };
  });
  const placed: PositionedNode[] = layoutEdges.length > 0
    ? layoutLayered(sized, layoutEdges, { direction: 'LR', hGap: gutter, vGap: 28 })
    : layoutGrid(sized, undefined, gutter, 28);
  for (const p of placed) nodes.get(p.id)!.rect = { x: p.x, y: p.y, width: p.width, height: p.height };

  // Parameter squares sit on the side of the constraint property that faces what they are bound to.
  const centreX = (id: string) => nodes.get(id)!.rect.x + nodes.get(id)!.rect.width / 2;
  const paramPos = new Map<string, { x: number; y: number; side: 'left' | 'right' }>();
  for (const n of nodes.values()) {
    if (!n.block) continue;
    const slots = { left: 0, right: 0 };
    for (const param of n.block.parameters) {
      let peer: number | undefined;
      for (const d of drawable) {
        if (d.s.propertyId === n.prop.id && d.s.parameterId === param.id) peer = centreX(d.t.propertyId);
        else if (d.t.propertyId === n.prop.id && d.t.parameterId === param.id) peer = centreX(d.s.propertyId);
        if (peer !== undefined) break;
      }
      const own = n.rect.x + n.rect.width / 2;
      const side: 'left' | 'right' = peer !== undefined && peer < own ? 'left' : peer !== undefined && peer > own ? 'right' : (slots.left <= slots.right ? 'left' : 'right');
      const slot = slots[side]++;
      paramPos.set(`${n.prop.id}#${param.id}`, { side, x: side === 'left' ? n.rect.x : n.rect.x + n.rect.width, y: n.rect.y + 12 + slot * PARAM_PITCH });
    }
  }
  // Slots were handed out per side; ensure no side overflows the box (an unbound param falls on the shorter side).
  const nodeEls = [...nodes.values()].map(n => {
    const { x, y, width, height } = n.rect;
    if (!n.isConstraint) {
      return nodeGroup('valueProperty', n.rect, `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="#ffffff" stroke="${STROKE}" stroke-width="1.2"/>`
        + n.lines.map((line, i) => txt(x + width / 2, y + 18 + i * 15, line, { weight: i === 0 ? 600 : undefined, fill: i === 0 ? TEXT : '#44515e' })).join(''));
    }
    const paramEls = (n.block?.parameters ?? []).map(param => {
      const pos = paramPos.get(`${n.prop.id}#${param.id}`)!;
      const left = pos.side === 'left';
      return `<rect x="${pos.x - PARAM_SIZE / 2}" y="${pos.y}" width="${PARAM_SIZE}" height="${PARAM_SIZE}" fill="#ffffff" stroke="${STROKE}" stroke-width="1"/>`
        + txt(left ? pos.x - PARAM_SIZE / 2 - 4 : pos.x + PARAM_SIZE / 2 + 4, pos.y + 9, param.name, { size: 9, anchor: left ? 'end' : 'start', fill: '#44515e' });
    }).join('');
    return nodeGroup('constraintProperty', n.rect, `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="14" fill="#ffffff" stroke="${STROKE}" stroke-width="1.3"/>`
      + n.lines.map((line, i) => txt(x + width / 2, y + 18 + i * 15, line, { weight: i === 1 ? 600 : undefined, size: i === 0 ? 9 : 11, fill: i === 0 ? MUTED : TEXT })).join('') + paramEls);
  });

  const anchorOf = (propertyId: string, parameterId: string | undefined, peerId: string): { x: number; y: number } => {
    const n = nodes.get(propertyId)!;
    const pp = parameterId ? paramPos.get(`${propertyId}#${parameterId}`) : undefined;
    if (pp) return { x: pp.x, y: pp.y + PARAM_SIZE / 2 };
    const right = centreX(peerId) >= n.rect.x + n.rect.width / 2;
    return { x: right ? n.rect.x + n.rect.width : n.rect.x, y: n.rect.y + n.rect.height / 2 };
  };
  const edgeEls = drawable.map(({ conn, s, t }, i) => {
    const from = anchorOf(s.propertyId, s.parameterId, t.propertyId);
    const to = anchorOf(t.propertyId, t.parameterId, s.propertyId);
    return edgePath(`edge-par-${i}`, routeManhattan(from, to, ((i % 5) - 2) * 0.5));
  });

  const rects = [...nodes.values()].map(n => n.rect);
  const inner = boundsOf(rects, 34);
  const frameBounds: DiagramRect = { x: inner.x - 40, y: inner.y - 24, width: inner.width + 80, height: inner.height + 24 };
  const body = `<rect x="${frameBounds.x}" y="${frameBounds.y}" width="${frameBounds.width}" height="${frameBounds.height}" fill="none" stroke="${STROKE}" stroke-width="1.2" stroke-dasharray="6 4"/>`
    + txt(frameBounds.x + 8, frameBounds.y + 16, `par [Block] ${blockLabel}`, { weight: 600, anchor: 'start' })
    + edgeEls.join('') + nodeEls.join('');
  const caption = `Parametric diagram · ${blockLabel} (${nodes.size} properties, ${drawable.length} bindings)`;
  return [fig(body, caption, frameBounds, { drawnNodes: nodes.size, drawnEdges: drawable.length, omitted })];
}
