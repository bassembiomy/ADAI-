export type RequirementRelationshipKind =
  | 'requirementContainment'
  | 'deriveReqt'
  | 'copy'
  | 'refine'
  | 'trace'
  | 'satisfy'
  | 'verify';

export interface RelationshipMeta {
  label: string;
  displayLabel: string;
  directionLabel: string;
  lineStyle: 'solid' | 'dashed';
  sourceMarker: string | null;
  targetMarker: string | null;
  acyclic: boolean;
}

export const RELATIONSHIP_DEFINITIONS: Record<RequirementRelationshipKind, RelationshipMeta> = {
  requirementContainment: {
    label: 'Containment',
    displayLabel: '«contains»',
    directionLabel: 'Parent Requirement → Child Requirement',
    lineStyle: 'solid',
    sourceMarker: 'requirement-containment-crosshair',
    targetMarker: null,
    acyclic: true,
  },
  deriveReqt: {
    label: 'Derive Requirement',
    displayLabel: '«deriveReqt»',
    directionLabel: 'Derived Requirement → Source Requirement',
    lineStyle: 'dashed',
    sourceMarker: null,
    targetMarker: 'open-arrow',
    acyclic: true,
  },
  copy: {
    label: 'Copy',
    displayLabel: '«copy»',
    directionLabel: 'Copied Requirement → Master Requirement',
    lineStyle: 'dashed',
    sourceMarker: null,
    targetMarker: 'open-arrow',
    acyclic: true,
  },
  refine: {
    label: 'Refine',
    displayLabel: '«refine»',
    directionLabel: 'Detailed Element → Refined Requirement',
    lineStyle: 'dashed',
    sourceMarker: null,
    targetMarker: 'open-arrow',
    acyclic: false,
  },
  trace: {
    label: 'Trace',
    displayLabel: '«trace»',
    directionLabel: 'Client Element → Supplier Element',
    lineStyle: 'dashed',
    sourceMarker: null,
    targetMarker: 'open-arrow',
    acyclic: false,
  },
  satisfy: {
    label: 'Satisfy',
    displayLabel: '«satisfy»',
    directionLabel: 'Design Element → Satisfied Requirement',
    lineStyle: 'dashed',
    sourceMarker: null,
    targetMarker: 'open-arrow',
    acyclic: false,
  },
  verify: {
    label: 'Verify',
    displayLabel: '«verify»',
    directionLabel: 'Test Case → Verified Requirement',
    lineStyle: 'dashed',
    sourceMarker: null,
    targetMarker: 'open-arrow',
    acyclic: false,
  },
} as const;

export function getRelationshipDefinition(kind: RequirementRelationshipKind): RelationshipMeta {
  return RELATIONSHIP_DEFINITIONS[kind];
}
