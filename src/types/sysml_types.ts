export type PortDirection = 'in' | 'out' | 'inout';

export interface SysMLPort {
  id: string;
  name: string;
  direction: PortDirection;
  blockId: string;
}

export interface SysMLPart {
  id: string;
  name: string;
  typeBlockId: string;
  parentBlockId: string;
  parentPartId: string | null;
}

export interface SysMLBlock {
  id: string;
  name: string;
  ports: string[];
  parts: string[];
}

export interface SysMLConnector {
  id: string;
  name?: string;
  sourcePortId: string;
  targetPortId: string;
}

export interface SysMLRequirement {
  id: string;
  reqId: string;
  text: string;
}

export type RelationType = 'satisfy' | 'verify' | 'deriveReqt' | 'refines' | 'trace';

export interface SysMLRelation {
  id: string;
  sourceId: string;
  targetId: string;
  type: RelationType;
}

export interface SysMLDiagramState {
  blocks: SysMLBlock[];
  ports: SysMLPort[];
  parts: SysMLPart[];
  connectors: SysMLConnector[];
  requirements: SysMLRequirement[];
  relations: SysMLRelation[];
}

export interface ValidationResult {
  valid: boolean;
  reason?: string;
}

export interface DeletionImpact {
  elementId: string;
  elementType: 'block' | 'port' | 'part' | 'requirement';
  affectedParts: string[];
  affectedConnectors: string[];
  affectedRelations: string[];
}
