import type { Point } from './sm_types';

export interface PortData {
  id: string;
  name: string;
  type: string; // e.g. 'int', 'float', 'signal'
  kind?: 'standard' | 'flow' | 'proxy';
  direction?: 'in' | 'out' | 'inout';
  unit?: string;
  side?: 'top' | 'bottom' | 'left' | 'right';
  offset?: number;
  blockId?: string;
}

export interface ValuePropertyData {
  id: string;
  name: string;
  type: string;
  defaultValue?: string;
  kind?: 'value' | 'part' | 'reference' | 'flow';
  typeId?: string;
  multiplicity?: string;
  unit?: string;
  dimension?: string;
  ordered?: boolean;
  unique?: boolean;
  isDerived?: boolean;
  redefinesId?: string;
  subsetsId?: string;
}

export interface BlockData {
  id: string;
  name: string;
  stereotype: string; // 'block', 'requirement', 'interface', 'valueType'
  x: number;
  y: number;
  width: number;
  height: number;
  properties: ValuePropertyData[];
  operations: string[];
  constraints: string[];
  classes: string[]; // Nested classes/parts definitions
  ports: PortData[];
  reqId?: string;
  description?: string;
  status?: string;
  priority?: string;
  satisfiedReqIds?: string[];
  risk?: string;
  verificationMethod?: string;
  source?: string;
  ibdX?: number;
  ibdY?: number;
  ibdWidth?: number;
  ibdHeight?: number;
  attachedFiles?: { name: string; content: string }[];
  assignedTo?: string;
  layerId?: string; // Which requirements layer this block belongs to ('root' or a block id)
  namespace?: string[];
  isAbstract?: boolean;
  isLeaf?: boolean;
  version?: string;
  rationale?: string;
  baselineId?: string;
  verificationResult?: 'passed' | 'failed';
  executedAt?: string;
  artifactUri?: string;
  evidenceRevision?: number;
}

export interface RelationshipData {
  id: string;
  sourceId: string;
  targetId: string;
  type: 'association' | 'generalization' | 'composition' | 'aggregation' | 'allocation' | 'derive' | 'deriveReqt' | 'refine' | 'satisfy' | 'verify' | 'trace' | 'copy' | 'binding' | 'dependency' | 'requirementContainment';
  label: string;
  sourceMultiplicity?: string;
  targetMultiplicity?: string;
}

export interface PartData {
  id: string;
  name: string;
  blockId: string | null;
  typeId?: string | null;
  /**
   * Ownership semantics of this typed usage (OMG SysML 1.6 / UML).
   * Composite usages are lifetime-owned by their whole and cascade on
   * deletion; shared/reference usages never cascade implicitly and surface
   * as unresolved impacts instead. Absent means composite (legacy default).
   */
  aggregation?: 'composite' | 'shared' | 'reference';
  x: number;
  y: number;
  width: number;
  height: number;
  satisfiedReqIds?: string[];
  multiplicity?: string;
  portLayouts?: Record<string, { side: 'top' | 'bottom' | 'left' | 'right', offset: number }>;
  parentPartId?: string | null;
  parentBlockId?: string | null;
  typeBlockId?: string | null;
}

export interface ConnectorData {
  id: string;
  sourcePartId: string;
  sourcePortId: string;
  targetPartId: string;
  targetPortId: string;
  itemFlow?: string;
  label?: string;
  kind?: 'assembly' | 'delegation' | 'binding';
}

export interface InterfaceRealizationData {
  id: string;
  partId: string;
  portId: string;
  interfaceId: string;
}

// Interfaces for sysmlIntegrityService compatibility
export type SysMLPort = PortData | { id: string; name?: string; type?: string; kind?: string; direction?: string; unit?: string; side?: string; offset?: number; blockId?: string };
export type SysMLBlock = BlockData | { id: string; name?: string; stereotype?: string; x?: number; y?: number; width?: number; height?: number; properties?: any[]; operations?: any[]; constraints?: any[]; classes?: any[]; ports?: (SysMLPort | string)[]; parts?: (SysMLPart | string)[]; text?: string; reqId?: string; description?: string; status?: string; priority?: string; satisfiedReqIds?: string[]; risk?: string; verificationMethod?: string; source?: string; ibdX?: number; ibdY?: number; ibdWidth?: number; ibdHeight?: number; attachedFiles?: any[]; assignedTo?: string; layerId?: string };
export type SysMLRelation = RelationshipData | { id: string; sourceId: string; targetId: string; type: string; label?: string; sourceMultiplicity?: string; targetMultiplicity?: string };
export type RelationType = RelationshipData['type'] | string;
export type SysMLPart = { id: string; name?: string; blockId?: string | null; typeId?: string | null; x?: number; y?: number; width?: number; height?: number; satisfiedReqIds?: string[]; multiplicity?: string; portLayouts?: any; parentPartId?: string | null; parentBlockId?: string | null; typeBlockId?: string | null } | PartData;
export type SysMLConnector = ConnectorData | { id: string; sourcePartId?: string; sourcePortId?: string; targetPartId?: string; targetPortId?: string; itemFlow?: string; label?: string };
export type SysMLRequirement = SysMLBlock;

export interface SysMLDiagramState {
  blocks: SysMLBlock[];
  ports: SysMLPort[];
  parts: SysMLPart[];
  connectors: SysMLConnector[];
  relationships?: SysMLRelation[];
  requirements: SysMLRequirement[];
  relations: SysMLRelation[];
  interfaceRealizations?: InterfaceRealizationData[];
  customStereotypes?: string[];
}

export interface DeletionImpact {
  targetId?: string;
  targetType?: string;
  elementId?: string;
  elementType?: string;
  cascadeDeletedConnectors?: string[];
  cascadeDeletedRelations?: string[];
  danglingPorts?: string[];
  affectedParts?: string[];
  affectedConnectors?: string[];
  affectedRelations?: string[];
}

export interface ValidationResult {
  valid: boolean;
  errors?: string[];
  warnings?: string[];
  reason?: string;
}

export type HmiComponentType = 'toggle' | 'button' | 'slider' | 'input' | 'lamp' | 'led' | 'lcd' | 'gauge' | 'rotary' | 'hybrid-rotary' | 'buzzer' | 'oled' | 'encoder' | 'mode-selector' | 'mode-icon';

export interface HmiComponent {
  id: string;
  type: HmiComponentType;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  variableId: string | null;
  min?: number;
  max?: number;
  variableIds?: string[];
  hybridValues?: string[];
  soundType?: 'sine' | 'square' | 'sawtooth' | 'triangle';
  icon?: 'none' | 'power' | 'play' | 'light';
  color?: 'orange' | 'green' | 'red' | 'blue' | 'yellow' | 'grey';
  cursorVariableId?: string | null;
  pressVariableId?: string | null;
  oledModeVarId?: string | null;
  oledTempVarId?: string | null;
  oledTimeVarId?: string | null;
  oledStateVarId?: string | null;
  oledSteamVarId?: string | null;
  oledHeatVarId?: string | null;
  oledFanVarId?: string | null;
  oledLightVarId?: string | null;
  oledDuoVarId?: string | null;
  oledProgressVarId?: string | null;
  iconEmoji?: string;
  targetValue?: string;
  oledModeNames?: string;
  oledIndicatorEmojis?: string[];
  oledIndicatorVarIds?: (string | null)[];
  oledIndicatorLabels?: string[];
  oledTitle?: string;
  encoderValues?: string[];
}
