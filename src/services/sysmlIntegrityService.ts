import {
  SysMLDiagramState,
  SysMLPort,
  SysMLPart,
  SysMLBlock,
  SysMLConnector,
  SysMLRequirement,
  SysMLRelation,
  RelationType,
} from '../types/sysml_types';

export function migrateSysMLState(rawState: any): SysMLDiagramState {
  if (!rawState || typeof rawState !== 'object') {
    return {
      blocks: [],
      ports: [],
      parts: [],
      connectors: [],
      requirements: [],
      relations: [],
    };
  }

  const blocks: SysMLBlock[] = Array.isArray(rawState.blocks)
    ? rawState.blocks.map((b: any) => ({
        id: String(b.id || ''),
        name: String(b.name || ''),
        ports: Array.isArray(b.ports) ? b.ports.map(String) : [],
        parts: Array.isArray(b.parts) ? b.parts.map(String) : [],
      }))
    : [];

  const ports: SysMLPort[] = Array.isArray(rawState.ports)
    ? rawState.ports.map((p: any) => ({
        id: String(p.id || ''),
        name: String(p.name || ''),
        direction: p.direction === 'in' || p.direction === 'out' || p.direction === 'inout' ? p.direction : 'inout',
        blockId: String(p.blockId || ''),
      }))
    : [];

  const parts: SysMLPart[] = Array.isArray(rawState.parts)
    ? rawState.parts.map((pt: any) => ({
        id: String(pt.id || ''),
        name: String(pt.name || ''),
        typeBlockId: String(pt.typeBlockId || ''),
        parentBlockId: String(pt.parentBlockId || ''),
        parentPartId: pt.parentPartId ? String(pt.parentPartId) : null,
      }))
    : [];

  const connectors: SysMLConnector[] = Array.isArray(rawState.connectors)
    ? rawState.connectors.map((c: any) => ({
        id: String(c.id || ''),
        name: c.name ? String(c.name) : undefined,
        sourcePortId: String(c.sourcePortId || ''),
        targetPortId: String(c.targetPortId || ''),
      }))
    : [];

  const requirements: SysMLRequirement[] = Array.isArray(rawState.requirements)
    ? rawState.requirements.map((r: any) => ({
        id: String(r.id || ''),
        reqId: String(r.reqId || r.id || ''),
        text: String(r.text || ''),
      }))
    : [];

  const relations: SysMLRelation[] = Array.isArray(rawState.relations)
    ? rawState.relations.map((rel: any) => {
        let relType: RelationType = 'trace';
        if (rel.type === 'derive' || rel.type === 'deriveReqt') {
          relType = 'deriveReqt';
        } else if (rel.type === 'satisfy' || rel.type === 'verify' || rel.type === 'refines' || rel.type === 'trace') {
          relType = rel.type;
        }
        return {
          id: String(rel.id || ''),
          sourceId: String(rel.sourceId || ''),
          targetId: String(rel.targetId || ''),
          type: relType,
        };
      })
    : [];

  return {
    blocks,
    ports,
    parts,
    connectors,
    requirements,
    relations,
  };
}
