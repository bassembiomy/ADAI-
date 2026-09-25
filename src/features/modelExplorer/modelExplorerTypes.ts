export type ExplorerDomain = 'project' | 'stateMachine' | 'sysml' | 'xbridges' | 'vlab';

export type ModelPillar = 'structural' | 'behavior' | 'parametric' | 'requirements';

export interface ActiveDiagramContext {
  diagramId: string;
  name: string;
  kind: string;
  domain: Exclude<ExplorerDomain, 'project'>;
  presentedSemanticIds: string[];
  contextSemanticIds?: string[];
}

export type ExplorerView = 'containment' | 'diagramContext' | 'search';

export type CapabilityKind =
  | 'createElement'
  | 'createOwnedFeature'
  | 'showAllTypes'
  | 'createDiagram'
  | 'createRelationship'
  | 'rename'
  | 'move'
  | 'copy'
  | 'paste'
  | 'duplicate'
  | 'delete'
  | 'addToDiagram'
  | 'openSpecification'
  | 'reveal';

export interface ModelTreeNode {
  nodeId: string;
  semanticId: string;
  domain: ExplorerDomain;
  kind: string;
  label: string;
  secondaryLabel?: string;
  parentNodeId: string | null;
  childNodeIds: string[];
  hasChildren: boolean;
  icon?: string;
  badges?: Array<{ kind: 'error' | 'warning' | 'info'; label: string }>;
  readOnly?: boolean;
  virtualKind?: 'model' | ModelPillar | 'group' | 'unresolved' | 'unclassified';
  ownerSemanticId?: string | null;
  diagramId?: string;
}

export interface ModelTreeProjection {
  roots: string[];
  nodes: Record<string, ModelTreeNode>;
  revision: number;
}

export interface VisibleTreeRow {
  node: ModelTreeNode;
  depth: number;
  index: number;
}

export interface ExplorerCapability {
  id: string;
  kind: CapabilityKind;
  label: string;
  enabled: boolean;
  reason?: string;
  elementKind?: string;
  relationshipKind?: string;
  direction?: 'incoming' | 'outgoing';
  capabilityGroup?: 'child' | 'feature' | 'diagram' | 'relationship' | 'edit' | 'allTypes' | string;
  authority?: 'OMG_SYSML_1_6' | 'UML_FOUNDATION' | 'CAMEO_TOOLING' | 'ADIA_EXTENSION';
  diagnosticCode?: string;
  catalogVisibility?: 'direct' | 'allTypes';
}

export interface ExplorerDiagnostic {
  code: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  semanticId?: string;
}

export interface ExplorerImpact {
  descendants: string[];
  relationships: string[];
  presentations: string[];
  invalidated: string[];
}

export interface ExplorerClipboardPayload {
  domain: ExplorerDomain;
  rootIds: string[];
  snapshots: Record<string, unknown>;
  copiedAtRevision: number;
}

export type ModelExplorerCommand =
  | { type: 'createElement'; ownerId: string; elementKind: string; name?: string }
  | { type: 'createDiagram'; ownerId: string; diagramKind: string; name?: string }
  | { type: 'rename'; elementId: string; name: string }
  | { type: 'move'; elementIds: string[]; targetOwnerId: string; confirmedImpactHash?: string }
  | { type: 'delete'; elementIds: string[]; confirmedImpactHash?: string }
  | { type: 'createRelationship'; relationshipKind: string; sourceId: string; targetId: string }
  | { type: 'addToDiagram'; elementIds: string[]; diagramId: string; position?: { x: number; y: number } }
  | { type: 'duplicate'; elementIds: string[]; targetOwnerId: string }
  | { type: 'paste'; payload: ExplorerClipboardPayload; targetOwnerId: string; mode: 'copy' | 'move' | 'reference' };

export interface ExplorerCommandResult {
  committed: boolean;
  revision: number;
  diagnostics: ExplorerDiagnostic[];
  selectedIds?: string[];
  impact?: ExplorerImpact;
}

export interface ModelExplorerAdapter {
  readonly domain: ExplorerDomain;
  getRevision(): number;
  project(view: ExplorerView, contextId?: string): ModelTreeProjection;
  capabilities(
    elementIds: readonly string[],
    activeDiagramId?: string,
    options?: { includeAllTypes?: boolean }
  ): ExplorerCapability[];
  preflight(command: ModelExplorerCommand): ExplorerCommandResult;
  execute(command: ModelExplorerCommand): ExplorerCommandResult;
  relationshipTargets(sourceId: string, relationshipKind: string, direction: 'incoming' | 'outgoing'): ModelTreeNode[];
}

export function hashImpact(impact: ExplorerImpact): string {
  const key = JSON.stringify({
    descendants: [...impact.descendants].sort(),
    relationships: [...impact.relationships].sort(),
    presentations: [...impact.presentations].sort(),
    invalidated: [...impact.invalidated].sort(),
  });
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
