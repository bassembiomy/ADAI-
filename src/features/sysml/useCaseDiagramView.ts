/**
 * Use Case Diagram projection (SysML 1.6 Clause 16 / UML 2.5 §18).
 *
 * Pure: repository + diagram presentation in, positioned notation out. The
 * workspace component only renders this and dispatches gateway commands.
 *
 *  - Actor: stick figure, name below.
 *  - Subject: rectangle with its name at the top; use cases drawn inside it are
 *    proposed (never silently committed) as members via `subjectId`.
 *  - Use Case: ellipse; an "extension points" compartment lists its points.
 *  - association: solid line · include/extend: dashed open arrow with a
 *    «keyword» · generalization: solid line, hollow triangle ·
 *    satisfy/refine/trace: dashed open arrow with the keyword.
 */
import type { SysmlRelationship, SysmlRepository, UseCaseRelationshipKind } from '../../engine/sysml/model';
import type { DiagramPresentation } from '../../engine/sysml/presentationState';
import {
  evaluateSysmlConnection,
  type ConnectionEndpoint,
  type ConnectionPolicyDiagnostic,
  type SysmlEndpointFamily,
} from '../../engine/sysml/connectionPolicy';
import { isUseCaseRelationshipKind } from '../../engine/sysml/useCases';
import { edgeBadgeLabel } from './edgeNotation';
import { sysmlObjectLabel } from './sysmlDisplayLabel';
import { rectContainsPoint, type NestingRect } from './packageNestingLayout';

export type UseCaseNodeKind = 'actor' | 'subject' | 'useCase' | 'requirement';
export interface Point { x: number; y: number }
export type Rect = NestingRect;

export interface UseCaseExtensionPointView { id: string; label: string; location?: string }

export interface UseCaseNodeView {
  id: string;
  kind: UseCaseNodeKind;
  label: string;
  bounds: Rect;
  /** Use cases only: extension points shown in the compartment, in declaration order. */
  extensionPoints: UseCaseExtensionPointView[];
  /** Use cases only: stored subject (may not be on this diagram). */
  subjectId?: string;
  /** Actors only: «external» systems are drawn with the same figure and a keyword. */
  isExternal?: boolean;
}

export type UseCaseEdgeLineStyle = 'solid' | 'dashed';
export type UseCaseEdgeHead = 'none' | 'openArrow' | 'hollowTriangle';

export interface UseCaseEdgeView {
  id: string;
  relationshipKind: UseCaseRelationshipKind;
  sourceId: string;
  targetId: string;
  /** «include», «extend», … — empty for association and generalization. */
  keyword: string;
  /** Extra note lines (extend: extension point name and condition). */
  noteLines: string[];
  lineStyle: UseCaseEdgeLineStyle;
  /** Arrowhead at the target end. */
  head: UseCaseEdgeHead;
  start: Point;
  end: Point;
  labelAt: Point;
}

export interface UseCaseDiagramView {
  nodes: UseCaseNodeView[];
  edges: UseCaseEdgeView[];
  /** Relationships whose ends are both shown but which the user removed from this diagram. */
  hiddenEdgeIds: string[];
  /** Presented ids that no longer resolve to an element (deleted elsewhere). */
  missingElementIds: string[];
}

export const ACTOR_SIZE = { width: 80, height: 110 } as const;
export const USE_CASE_SIZE = { width: 180, height: 72 } as const;
export const SUBJECT_SIZE = { width: 380, height: 360 } as const;
export const REQUIREMENT_SIZE = { width: 170, height: 64 } as const;
export const SUBJECT_HEADER_HEIGHT = 30;
const EXTENSION_POINT_LINE = 16;

/** Height needed for an ellipse showing its name and an extension-points compartment. */
export function useCaseMinHeight(extensionPointCount: number): number {
  if (extensionPointCount <= 0) return USE_CASE_SIZE.height;
  return USE_CASE_SIZE.height + 14 + extensionPointCount * EXTENSION_POINT_LINE;
}

const DRAW_ORDER: Record<UseCaseNodeKind, number> = { subject: 0, requirement: 1, actor: 2, useCase: 3 };

/** Notation per relationship kind (SysML 1.6 §16.4). */
export const USE_CASE_EDGE_NOTATION: Record<UseCaseRelationshipKind, { lineStyle: UseCaseEdgeLineStyle; head: UseCaseEdgeHead; keywordType: string }> = {
  useCaseAssociation: { lineStyle: 'solid', head: 'none', keywordType: 'association' },
  include: { lineStyle: 'dashed', head: 'openArrow', keywordType: 'include' },
  extend: { lineStyle: 'dashed', head: 'openArrow', keywordType: 'extend' },
  useCaseGeneralization: { lineStyle: 'solid', head: 'hollowTriangle', keywordType: 'generalization' },
  useCaseSatisfy: { lineStyle: 'dashed', head: 'openArrow', keywordType: 'satisfy' },
  useCaseRefine: { lineStyle: 'dashed', head: 'openArrow', keywordType: 'refine' },
  useCaseTrace: { lineStyle: 'dashed', head: 'openArrow', keywordType: 'trace' },
};

const center = (rect: Rect): Point => ({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 });

/** Point where the line from the node's centre towards `toward` leaves the node's outline. */
export function clipToNode(node: Pick<UseCaseNodeView, 'kind' | 'bounds'>, toward: Point): Point {
  const c = center(node.bounds);
  const dx = toward.x - c.x;
  const dy = toward.y - c.y;
  if (dx === 0 && dy === 0) return c;
  if (node.kind === 'useCase') {
    const a = node.bounds.width / 2;
    const b = node.bounds.height / 2;
    const t = 1 / Math.sqrt((dx / a) ** 2 + (dy / b) ** 2);
    return { x: c.x + dx * t, y: c.y + dy * t };
  }
  const halfW = node.bounds.width / 2;
  const halfH = node.bounds.height / 2;
  const t = Math.min(dx === 0 ? Infinity : halfW / Math.abs(dx), dy === 0 ? Infinity : halfH / Math.abs(dy));
  return { x: c.x + dx * t, y: c.y + dy * t };
}

function resolveNode(
  repo: SysmlRepository,
  id: string,
): Pick<UseCaseNodeView, 'kind' | 'label' | 'extensionPoints' | 'subjectId' | 'isExternal'> | undefined {
  const actor = repo.actors?.[id];
  if (actor) return { kind: 'actor', label: sysmlObjectLabel(actor, 'Actor'), extensionPoints: [], isExternal: actor.isExternal };
  const subject = repo.subjects?.[id];
  if (subject) return { kind: 'subject', label: sysmlObjectLabel(subject, 'Subject'), extensionPoints: [] };
  const useCase = repo.useCases?.[id];
  if (useCase) {
    const extensionPoints = (useCase.extensionPointIds ?? [])
      .map(epId => repo.extensionPoints?.[epId])
      .filter((ep): ep is NonNullable<typeof ep> => Boolean(ep))
      .map(ep => ({ id: ep.id, label: sysmlObjectLabel(ep, 'Extension Point'), ...(ep.location ? { location: ep.location } : {}) }));
    return { kind: 'useCase', label: sysmlObjectLabel(useCase, 'Use Case'), extensionPoints, subjectId: useCase.subjectId };
  }
  const requirement = repo.requirements?.[id];
  if (requirement) return { kind: 'requirement', label: sysmlObjectLabel(requirement, 'Requirement'), extensionPoints: [] };
  return undefined;
}

function defaultSize(kind: UseCaseNodeKind, extensionPointCount: number): { width: number; height: number } {
  switch (kind) {
    case 'actor': return ACTOR_SIZE;
    case 'subject': return SUBJECT_SIZE;
    case 'requirement': return REQUIREMENT_SIZE;
    default: return { width: USE_CASE_SIZE.width, height: useCaseMinHeight(extensionPointCount) };
  }
}

/** Free grid slot for presented elements that have no stored position yet. */
function autoPosition(index: number): Point {
  return { x: 60 + (index % 4) * 230, y: 60 + Math.floor(index / 4) * 150 };
}

export function buildUseCaseDiagramView(
  repo: SysmlRepository,
  presentation: DiagramPresentation | undefined,
): UseCaseDiagramView {
  const elementIds = presentation?.elementIds ?? [];
  const nodes: UseCaseNodeView[] = [];
  const missingElementIds: string[] = [];
  elementIds.forEach((id, index) => {
    if (repo.relationships?.[id]) return; // relationship paths are derived below, not nodes
    const resolved = resolveNode(repo, id);
    if (!resolved) {
      missingElementIds.push(id);
      return;
    }
    const stored = presentation?.presentations?.[id]?.bounds;
    const size = defaultSize(resolved.kind, resolved.extensionPoints.length);
    const fallback = autoPosition(index);
    const minHeight = resolved.kind === 'useCase' ? useCaseMinHeight(resolved.extensionPoints.length) : 0;
    nodes.push({
      id,
      ...resolved,
      bounds: {
        x: stored?.x ?? fallback.x,
        y: stored?.y ?? fallback.y,
        width: stored?.width ?? size.width,
        height: Math.max(stored?.height ?? size.height, minHeight),
      },
    });
  });
  nodes.sort((a, b) => DRAW_ORDER[a.kind] - DRAW_ORDER[b.kind]);

  const byId = new Map(nodes.map(node => [node.id, node]));
  const hidden = new Set(presentation?.hiddenElementIds ?? []);
  const hiddenEdgeIds: string[] = [];
  const candidates: SysmlRelationship[] = [];
  for (const relationship of Object.values(repo.relationships ?? {})) {
    if (!isUseCaseRelationshipKind(relationship.kind)) continue;
    if (!byId.has(relationship.sourceId) || !byId.has(relationship.targetId)) continue;
    if (hidden.has(relationship.id)) {
      hiddenEdgeIds.push(relationship.id);
      continue;
    }
    candidates.push(relationship);
  }
  candidates.sort((a, b) => a.id.localeCompare(b.id));
  hiddenEdgeIds.sort();

  // Parallel edges between the same pair are fanned out so none hides another.
  const pairKey = (r: SysmlRelationship) => [r.sourceId, r.targetId].sort().join('\u0000');
  const pairCounts = new Map<string, number>();
  for (const r of candidates) pairCounts.set(pairKey(r), (pairCounts.get(pairKey(r)) ?? 0) + 1);
  const pairSeen = new Map<string, number>();

  const edges: UseCaseEdgeView[] = candidates.map(relationship => {
    const kind = relationship.kind as UseCaseRelationshipKind;
    const notation = USE_CASE_EDGE_NOTATION[kind];
    const source = byId.get(relationship.sourceId)!;
    const target = byId.get(relationship.targetId)!;
    const key = pairKey(relationship);
    const index = pairSeen.get(key) ?? 0;
    pairSeen.set(key, index + 1);
    const total = pairCounts.get(key) ?? 1;
    const spread = (index - (total - 1) / 2) * 16;

    const sc = center(source.bounds);
    const tc = center(target.bounds);
    const len = Math.hypot(tc.x - sc.x, tc.y - sc.y) || 1;
    // Perpendicular offset, mirrored for edges stored in the opposite direction
    // so the fan is consistent regardless of direction.
    const sign = relationship.sourceId < relationship.targetId ? 1 : -1;
    const ox = (-(tc.y - sc.y) / len) * spread * sign;
    const oy = ((tc.x - sc.x) / len) * spread * sign;
    const sShift = { x: sc.x + ox, y: sc.y + oy };
    const tShift = { x: tc.x + ox, y: tc.y + oy };
    const start = clipToNode(source, tShift);
    const end = clipToNode(target, sShift);

    const noteLines: string[] = [];
    if (kind === 'extend') {
      const ep = relationship.extensionPointId ? repo.extensionPoints?.[relationship.extensionPointId] : undefined;
      if (ep) noteLines.push(`extension point: ${sysmlObjectLabel(ep, 'Extension Point')}`);
      else noteLines.push('extension point: (unresolved)');
      const condition = relationship.name?.trim();
      if (condition) noteLines.push(`[${condition}]`);
    }

    return {
      id: relationship.id,
      relationshipKind: kind,
      sourceId: relationship.sourceId,
      targetId: relationship.targetId,
      keyword: edgeBadgeLabel({ type: notation.keywordType }),
      noteLines,
      lineStyle: notation.lineStyle,
      head: notation.head,
      start,
      end,
      labelAt: { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 },
    };
  });

  return { nodes, edges, hiddenEdgeIds, missingElementIds };
}

/**
 * Presentation with some elements' bounds replaced (live drag/resize preview and
 * "what would the nesting be if I dropped here"). Never mutates its input.
 */
export function withBoundsOverrides(
  presentation: DiagramPresentation | undefined,
  overrides: Record<string, Rect>,
  diagramId = '',
): DiagramPresentation {
  const base: DiagramPresentation = presentation ?? { elementIds: [], presentations: {} };
  const presentations = { ...base.presentations };
  for (const [id, bounds] of Object.entries(overrides)) {
    const existing = presentations[id];
    presentations[id] = existing
      ? { ...existing, bounds: { ...existing.bounds, ...bounds } }
      : { id: `preview:${id}`, diagramId, semanticElementId: id, bounds: { ...bounds } };
  }
  return { ...base, presentations };
}

// ---------------------------------------------------------------------------
// Subject nesting (derived, never stored implicitly)
// ---------------------------------------------------------------------------

/** Innermost subject rectangle whose area contains the centre of `rect`. */
export function subjectContaining(rect: Rect, subjects: readonly Pick<UseCaseNodeView, 'id' | 'bounds'>[]): string | undefined {
  const point = center(rect);
  return subjects
    .filter(subject => rectContainsPoint(subject.bounds, point))
    .sort((a, b) => a.bounds.width * a.bounds.height - b.bounds.width * b.bounds.height)[0]?.id;
}

export interface SubjectAssignmentProposal {
  useCaseId: string;
  /** Subject currently stored on the use case. */
  fromSubjectId?: string;
  /** Subject implied by the geometry; undefined means "remove from subject". */
  toSubjectId?: string;
}

/**
 * Geometry proposes, the gateway commits: the stored `subjectId` changes only
 * after the user confirms these proposals.
 *  - a use case drawn inside a subject rectangle that is not its subject → assign;
 *  - a use case whose subject is shown on this diagram but which is drawn
 *    outside that rectangle → unassign.
 * A use case whose subject is not shown here is left alone.
 */
export function proposeSubjectAssignments(
  view: Pick<UseCaseDiagramView, 'nodes'>,
  options: { useCaseIds?: Iterable<string> } = {},
): SubjectAssignmentProposal[] {
  const subjects = view.nodes.filter(node => node.kind === 'subject');
  const shownSubjects = new Set(subjects.map(subject => subject.id));
  const only = options.useCaseIds ? new Set(options.useCaseIds) : undefined;
  const proposals: SubjectAssignmentProposal[] = [];
  for (const node of view.nodes) {
    if (node.kind !== 'useCase' || (only && !only.has(node.id))) continue;
    const derived = subjectContaining(node.bounds, subjects);
    if (derived && derived !== node.subjectId) {
      proposals.push({ useCaseId: node.id, fromSubjectId: node.subjectId, toSubjectId: derived });
    } else if (!derived && node.subjectId && shownSubjects.has(node.subjectId)) {
      proposals.push({ useCaseId: node.id, fromSubjectId: node.subjectId });
    }
  }
  return proposals;
}

/** Use cases that belong to `subjectId` and are drawn inside it (they travel with the subject when it is dragged). */
export function subjectMemberIds(view: Pick<UseCaseDiagramView, 'nodes'>, subjectId: string): string[] {
  const subject = view.nodes.find(node => node.id === subjectId && node.kind === 'subject');
  if (!subject) return [];
  return view.nodes
    .filter(node => node.kind === 'useCase' && node.subjectId === subjectId && rectContainsPoint(subject.bounds, center(node.bounds)))
    .map(node => node.id);
}

// ---------------------------------------------------------------------------
// Relationship tools: endpoint legality (single source: connectionPolicy)
// ---------------------------------------------------------------------------

export interface UseCaseToolDefinition {
  kind: UseCaseRelationshipKind;
  label: string;
}

export const USE_CASE_RELATIONSHIP_TOOLS: readonly UseCaseToolDefinition[] = [
  { kind: 'useCaseAssociation', label: 'Association' },
  { kind: 'include', label: 'Include' },
  { kind: 'extend', label: 'Extend' },
  { kind: 'useCaseGeneralization', label: 'Generalization' },
  { kind: 'useCaseSatisfy', label: 'Satisfy' },
  { kind: 'useCaseRefine', label: 'Refine' },
  { kind: 'useCaseTrace', label: 'Trace' },
];

function familyOf(repo: SysmlRepository, id: string): SysmlEndpointFamily {
  if (repo.actors?.[id]) return 'actor';
  if (repo.subjects?.[id]) return 'subject';
  if (repo.useCases?.[id]) return 'useCase';
  if (repo.requirements?.[id]) return 'requirement';
  return 'unknown';
}

export function useCaseEndpoint(repo: SysmlRepository, id: string): ConnectionEndpoint {
  const element = repo.actors?.[id] ?? repo.subjects?.[id] ?? repo.useCases?.[id] ?? repo.requirements?.[id];
  const family = familyOf(repo, id);
  return { id: element ? id : '', name: sysmlObjectLabel(element, family), family, ownerId: element?.ownerId };
}

export interface UseCaseConnectionCheck {
  allowed: boolean;
  diagnostics: ConnectionPolicyDiagnostic[];
}

/** Whether `kind` may connect `sourceId` to `targetId` on a Use Case Diagram. */
export function checkUseCaseConnection(
  repo: SysmlRepository,
  kind: UseCaseRelationshipKind,
  sourceId: string,
  targetId: string,
): UseCaseConnectionCheck {
  const decision = evaluateSysmlConnection({
    relationshipKind: kind,
    source: useCaseEndpoint(repo, sourceId),
    target: useCaseEndpoint(repo, targetId),
    diagram: 'useCase',
  });
  if (!decision.allowed) return decision;
  const duplicate = Object.values(repo.relationships ?? {}).some(existing =>
    existing.kind === kind && existing.sourceId === sourceId && existing.targetId === targetId);
  if (duplicate) {
    return {
      allowed: false,
      diagnostics: [{
        code: 'DUPLICATE_RELATIONSHIP',
        message: `${kind} between ${useCaseEndpoint(repo, sourceId).name} and ${useCaseEndpoint(repo, targetId).name} already exists.`,
        correctiveAction: 'Select the existing relationship instead of creating a second one.',
      }],
    };
  }
  return decision;
}
