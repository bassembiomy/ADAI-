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
import type { AppNode, AppEdge, OPMLinkType, OpmLifecycleDiagnostic } from './EntropyTypes';
import type { SysMLDiagramState } from '../../types/sysml_types';

export type SysmlMappingStatus = 'mapped' | 'conceptual-only' | 'unsupported' | 'unresolved';

export interface SysmlConnectorMapping {
  sourceConnectorId: string;
  sourceBlockId?: string;
  targetBlockId?: string;
  sourcePortId?: string;
  targetPortId?: string;
  status: SysmlMappingStatus;
  diagnostic?: string;
}

export interface SysmlImportResult {
  nodes: AppNode[];
  edges: AppEdge[];
  warnings: string[];
  connectorMappings: SysmlConnectorMapping[];
  diagnostics: OpmLifecycleDiagnostic[];
}

const RELATION_MAP: Record<string, { link: OPMLinkType; flip?: boolean } | undefined> = {
  composition: { link: 'aggregation' },
  aggregation: { link: 'aggregation' },
  generalization: { link: 'generalization', flip: true },
  satisfy: { link: 'satisfies' },
  verify: { link: 'verifies' },
};

export function importSysmlToOpm(state: SysMLDiagramState): SysmlImportResult {
  const nodes: AppNode[] = [];
  const edges: AppEdge[] = [];
  const warnings: string[] = [];
  const connectorMappings: SysmlConnectorMapping[] = [];
  const diagnostics: OpmLifecycleDiagnostic[] = [];
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
      const msg = `Relationship [${rel.type}] from ${rel.sourceId} to ${rel.targetId} has no automatic OPM equivalent — model it manually (e.g. as an instrument or effect link).`;
      warnings.push(msg);
      connectorMappings.push({
        sourceConnectorId: rel.id,
        sourceBlockId: rel.sourceId,
        targetBlockId: rel.targetId,
        status: 'unsupported',
        diagnostic: msg,
      });
      diagnostics.push({
        code: 'SYSML_RELATION_UNSUPPORTED',
        severity: 'warning',
        message: msg,
        elementId: rel.id,
      });
      return;
    }
    const source = mapped.flip ? rel.targetId : rel.sourceId;
    const target = mapped.flip ? rel.sourceId : rel.targetId;
    edges.push({
      id: `imp-${rel.id}`,
      source,
      target,
      data: {
        type: mapped.link,
        sysmlMappingStatus: 'mapped',
        sysmlRelationId: rel.id,
      },
    } as AppEdge);
  });

  if ((state.connectors?.length ?? 0) > 0) {
    state.connectors!.forEach(c => {
      const msg = `IBD connector "${c.id}" (${c.name || 'unnamed'}) was not auto-mapped. In OPM, model the exchanged items as processes with consumption/result links.`;
      warnings.push(msg);
      connectorMappings.push({
        sourceConnectorId: c.id,
        sourceBlockId: c.sourceBlockId,
        targetBlockId: c.targetBlockId,
        sourcePortId: c.sourcePortId,
        targetPortId: c.targetPortId,
        status: 'unresolved',
        diagnostic: msg,
      });
      diagnostics.push({
        code: 'SYSML_CONNECTOR_UNRESOLVED',
        severity: 'warning',
        message: msg,
        elementId: c.id,
      });
    });
  }

  return { nodes, edges, warnings, connectorMappings, diagnostics };
}
