/**
 * One-time migration: converts an existing SysML diagram state into an OPM
 * (ISO 19450) model so the ENTROPY workspace can become the single source of truth.
 *
 * Mapping:
 *   block (stereotype 'block')          → object node
 *   requirement block                   → requirement node (requirementText = description)
 *   composition / aggregation relation   → aggregation link
 *   generalization relation              → generalization link
 *   satisfy / verify relation            → satisfies / verifies link (requirement → target)
 *   ports + connectors                   → NOT auto-mapped; reported as a warning
 *   association / allocation / others    → warning (author decides the OPM equivalent)
 */
import type { AppNode, AppEdge, OPMLinkType } from './EntropyTypes';
import type { SysMLDiagramState } from '../../types/sysml_types';

const RELATION_MAP: Record<string, { link: OPMLinkType; flip?: boolean } | undefined> = {
  composition: { link: 'aggregation' },
  aggregation: { link: 'aggregation' },
  generalization: { link: 'generalization', flip: true },
  satisfy: { link: 'satisfies' },
  verify: { link: 'verifies' },
};

export function importSysmlToOpm(state: SysMLDiagramState): {
  nodes: AppNode[];
  edges: AppEdge[];
  warnings: string[];
} {
  const nodes: AppNode[] = [];
  const edges: AppEdge[] = [];
  const warnings: string[] = [];
  const requirementIds = new Set((state.requirements || []).map(r => r.id));

  const makeNode = (
    id: string,
    name: string,
    type: 'object' | 'requirement',
    x: number,
    y: number,
    extra: Record<string, unknown> = {}
  ): AppNode => ({
    id,
    type: 'opmObject', // requirement nodes render via opmObject with data.type === 'requirement'
    position: { x, y },
    data: { name, type, physical: false, parentId: null, ...extra },
  });

  let reqX = 80;
  (state.blocks || [])
    .filter(b => !requirementIds.has(b.id))
    .forEach(b => {
      nodes.push(makeNode(b.id, b.name || 'Unnamed', 'object', b.x ?? 0, b.y ?? 0, {
        attributes: (b.properties || []).map(p => ({ key: p.name, value: p.defaultValue ?? p.type })),
      }));
    });

  (state.requirements || []).forEach(r => {
    nodes.push(makeNode(r.id, r.name || 'Unnamed Requirement', 'requirement', reqX, 420, {
      requirementText: r.description || (r as any).text || '',
    }));
    reqX += 200;
  });

  const relationSource = state.relations ?? [];
  relationSource.forEach(rel => {
    const mapped = RELATION_MAP[rel.type];
    if (!mapped) {
      warnings.push(
        `Relationship [${rel.type}] from ${rel.sourceId} to ${rel.targetId} has no automatic OPM equivalent — model it manually (e.g. as an instrument or effect link).`
      );
      return;
    }
    const source = mapped.flip ? rel.targetId : rel.sourceId;
    const target = mapped.flip ? rel.sourceId : rel.targetId;
    edges.push({
      id: `imp-${rel.id}`,
      source,
      target,
      data: { type: mapped.link },
    } as AppEdge);
  });

  if ((state.connectors?.length ?? 0) > 0) {
    warnings.push(
      `${state.connectors.length} IBD connector(s) were not auto-mapped: in OPM, model the exchanged items as processes with consumption/result links between the owning objects.`
    );
  }

  return { nodes, edges, warnings };
}
