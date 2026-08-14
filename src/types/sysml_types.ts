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
}

export interface RelationshipData {
  id: string;
  sourceId: string;
  targetId: string;
  type: 'association' | 'generalization' | 'composition' | 'aggregation' | 'allocation' | 'derive' | 'deriveReqt' | 'refine' | 'satisfy' | 'verify' | 'trace' | 'binding' | 'dependency';
  label: string;
  sourceMultiplicity?: string;
  targetMultiplicity?: string;
}

export interface PartData {
  id: string;
  name: string;
  blockId: string | null;
  typeId?: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  satisfiedReqIds?: string[];
  multiplicity?: string;
  portLayouts?: Record<string, { side: 'top' | 'bottom' | 'left' | 'right', offset: number }>;
  parentPartId?: string;
  parentBlockId?: string;
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
}

export interface InterfaceRealizationData {
  id: string;
  partId: string;
  portId: string;
  interfaceId: string;
}

// Aliases for sysmlIntegrityService compatibility
export type SysMLPort = PortData;
export type SysMLBlock = BlockData;
export type SysMLRequirement = BlockData;
export type SysMLRelation = RelationshipData;
export type RelationType = RelationshipData['type'];
export type SysMLPart = PartData;
export type SysMLConnector = ConnectorData;

export interface SysMLDiagramState {
  blocks: BlockData[];
  ports: PortData[];
  parts: PartData[];
  connectors: ConnectorData[];
  relationships: RelationshipData[];
  requirements?: BlockData[];
  relations?: RelationshipData[];
  interfaceRealizations?: InterfaceRealizationData[];
  customStereotypes?: string[];
}

export interface DeletionImpact {
  targetId: string;
  targetType: 'block' | 'port' | 'part' | 'connector' | 'relation';
  cascadeDeletedConnectors: string[];
  cascadeDeletedRelations: string[];
  danglingPorts: string[];
  affectedParts: string[];
  elementId?: string;
  elementType?: string;
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
