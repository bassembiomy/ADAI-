import type { SysmlRepository } from '../../engine/sysml/model';

/** SysML 1.6 Annex A diagram kind abbreviations used in frame headers. */
const DIAGRAM_KIND_ABBREVIATIONS: Record<string, string> = {
  package: 'pkg',
  bdd: 'bdd',
  ibd: 'ibd',
  requirements: 'req',
  rtm: 'req',
  parametric: 'par',
  stateMachine: 'stm',
  useCase: 'uc',
  activity: 'act',
  sequence: 'sd',
};

export function diagramKindAbbreviation(diagramKind: string): string {
  return DIAGRAM_KIND_ABBREVIATIONS[diagramKind] ?? diagramKind;
}

const DEFINITION_METACLASS: Record<string, string> = {
  block: 'Block',
  interface: 'Interface Block',
  valueType: 'Value Type',
  enumeration: 'Enumeration',
  signal: 'Signal',
  constraintBlock: 'Constraint Block',
  quantityKind: 'Quantity Kind',
  unit: 'Unit',
  view: 'View',
  viewpoint: 'Viewpoint',
  stakeholder: 'Stakeholder',
  activity: 'Activity',
  interaction: 'Interaction',
};

/** Metaclass of the diagram's context element, as shown in the frame header. */
function contextMetaclass(repo: SysmlRepository, contextId: string): string {
  if (contextId === 'model') return 'Model';
  if (repo.packages[contextId]) return 'Package';
  const definition = repo.definitions[contextId];
  if (definition) return DEFINITION_METACLASS[definition.kind] ?? 'Element';
  if (repo.requirements[contextId]) return 'Requirement';
  if (repo.verificationCases[contextId]) return 'Test Case';
  if (repo.useCases[contextId]) return 'Use Case';
  if (repo.actors[contextId]) return 'Actor';
  if (repo.subjects[contextId]) return 'Subject';
  return 'Element';
}

function contextName(repo: SysmlRepository, contextId: string): string {
  return repo.packages[contextId]?.name
    ?? repo.definitions[contextId]?.name
    ?? repo.requirements[contextId]?.name
    ?? repo.verificationCases[contextId]?.name
    ?? repo.useCases[contextId]?.name
    ?? repo.actors[contextId]?.name
    ?? repo.subjects[contextId]?.name
    ?? (contextId === 'model' ? 'Model' : 'Element');
}

/**
 * SysML frame header: `<kind> [<context metaclass>] <context name> [<diagram name>]`,
 * e.g. `pkg [Package] Power Subsystem [Structure]`. Undefined when the diagram is unknown.
 */
export function diagramFrameLabel(repo: SysmlRepository, diagramId: string): string | undefined {
  const diagram = repo.diagrams[diagramId];
  if (!diagram) return undefined;
  const contextId = diagram.contextElementId ?? diagram.ownerId ?? 'model';
  return `${diagramKindAbbreviation(diagram.diagramKind)} [${contextMetaclass(repo, contextId)}] ${contextName(repo, contextId)} [${diagram.name}]`;
}

export interface FrameRect { x: number; y: number; width: number; height: number; }

/** Visible canvas in screen space plus the world transform (screen = world * scale + offset). */
export interface FrameViewport { width: number; height: number; scale: number; offsetX: number; offsetY: number; }

const FRAME_PADDING = 40;
const FRAME_HEADER_HEIGHT = 24;
/** Screen-space inset of an empty frame: the top clears the floating canvas toolbar (~60px). */
const EMPTY_FRAME_INSET = { top: 72, side: 16, bottom: 16 };

/**
 * Rect of the derived diagram frame. Around content it is the union of the shown rects plus padding
 * and room for the header; with no content it is anchored to the visible viewport (inset so the
 * header clears the toolbar) so the header is visible at the default view.
 */
export function diagramFrameRect(contentRects: readonly FrameRect[], viewport?: FrameViewport): FrameRect {
  if (contentRects.length > 0) {
    const minX = Math.min(...contentRects.map(r => r.x)) - FRAME_PADDING;
    const minY = Math.min(...contentRects.map(r => r.y)) - FRAME_PADDING - FRAME_HEADER_HEIGHT;
    const maxX = Math.max(...contentRects.map(r => r.x + r.width)) + FRAME_PADDING;
    const maxY = Math.max(...contentRects.map(r => r.y + r.height)) + FRAME_PADDING;
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }
  const v = viewport ?? { width: 900, height: 600, scale: 1, offsetX: 0, offsetY: 0 };
  const scale = v.scale > 0 ? v.scale : 1;
  const toWorldX = (sx: number) => (sx - v.offsetX) / scale;
  const toWorldY = (sy: number) => (sy - v.offsetY) / scale;
  const x = toWorldX(EMPTY_FRAME_INSET.side);
  const y = toWorldY(EMPTY_FRAME_INSET.top);
  return {
    x,
    y,
    width: toWorldX(Math.max(v.width - EMPTY_FRAME_INSET.side, EMPTY_FRAME_INSET.side + 200)) - x,
    height: toWorldY(Math.max(v.height - EMPTY_FRAME_INSET.bottom, EMPTY_FRAME_INSET.top + 120)) - y,
  };
}
