import type { MetaclassKind } from '../../engine/sysml/domain/base';
import { getSupportedElementKinds } from '../../engine/sysml/capabilities/catalog';
import { OWNERSHIP_MATRIX } from '../../engine/sysml/capabilities/ownershipPolicy';

function metaclassToExplorerKinds(metaclass: MetaclassKind): string[] {
  switch (metaclass) {
    case 'Package':
      return ['package'];
    case 'Block':
      return ['block'];
    case 'InterfaceBlock':
      return ['interface'];
    case 'ValueType':
      return ['valueType'];
    case 'Requirement':
      return ['requirement'];
    case 'TestCase':
      return ['testCase'];
    case 'VerificationCase':
      return ['verificationCase'];
    case 'PartProperty':
      return ['part', 'sharedPart'];
    case 'ReferenceProperty':
      return ['reference'];
    case 'ValueProperty':
      return ['valueProperty'];
    case 'Port':
      return ['fullPort', 'proxyPort'];
    default:
      return [metaclass.charAt(0).toLowerCase() + metaclass.slice(1)];
  }
}

function deriveExplorerChildren(ownerKey: string): readonly string[] {
  const allowedMetaclasses = OWNERSHIP_MATRIX[ownerKey] ?? [];
  const kinds = allowedMetaclasses.flatMap(metaclassToExplorerKinds);
  // Return unique kinds preserving order
  return Array.from(new Set(kinds));
}

export const SYSML_CHILDREN: Record<string, readonly string[]> = {
  model: deriveExplorerChildren('Model'),
  package: deriveExplorerChildren('Package'),
  block: deriveExplorerChildren('Block'),
  requirement: deriveExplorerChildren('Requirement'),
};

export const SYSML_RELATIONSHIPS: Record<string, readonly string[]> = {
  block: ['association', 'sharedAggregation', 'composition', 'generalization', 'dependency', 'allocation', 'satisfy', 'verify', 'refine', 'trace'],
  requirement: ['requirementContainment', 'deriveReqt', 'refine', 'trace', 'copy'],
  part: ['connector', 'binding', 'itemFlow', 'allocation', 'satisfy'],
};

export const SYSML_DIAGRAM_KINDS: Record<string, readonly string[]> = {
  model: ['bdd', 'requirements', 'rtm'],
  package: ['bdd', 'requirements', 'rtm'],
  block: ['ibd', 'bdd', 'stateMachine'],
};

const BASE_ELEMENT_KIND_LABELS: Record<string, string> = {
  model: 'Model',
  package: 'Package',
  block: 'Block',
  valueType: 'Value Type',
  interface: 'Interface',
  requirement: 'Requirement',
  testCase: 'Test Case',
  verificationCase: 'Verification Case',
  part: 'Part',
  reference: 'Reference Property',
  sharedPart: 'Shared Part',
  fullPort: 'Full Port',
  proxyPort: 'Proxy Port',
  valueProperty: 'Value Property',
  constraintProperty: 'Constraint Property',
  flowProperty: 'Flow Property',
  operation: 'Operation',
  parameter: 'Parameter',
  reception: 'Reception',
  constraint: 'Constraint',
  comment: 'Comment',
  rationale: 'Rationale',
  // State Machine
  stateMachine: 'State Machine',
  region: 'Region',
  state: 'State',
  initial: 'Initial Pseudostate',
  final: 'Final State',
  choice: 'Choice Pseudostate',
  junction: 'Junction Pseudostate',
  fork: 'Fork Pseudostate',
  join: 'Join Pseudostate',
  history: 'Shallow History',
  'deep-history': 'Deep History',
  'entry-point': 'Entry Point',
  'exit-point': 'Exit Point',
  terminate: 'Terminate Pseudostate',
};

// Build derived label map from catalog plus explorer mappings
const DERIVED_LABELS: Record<string, string> = { ...BASE_ELEMENT_KIND_LABELS };
for (const def of getSupportedElementKinds()) {
  DERIVED_LABELS[def.metaclass] = def.label;
  const lowerCamel = def.metaclass.charAt(0).toLowerCase() + def.metaclass.slice(1);
  if (!DERIVED_LABELS[lowerCamel]) {
    DERIVED_LABELS[lowerCamel] = def.label;
  }
}

export const ELEMENT_KIND_LABELS: Record<string, string> = DERIVED_LABELS;

export const RELATIONSHIP_KIND_LABELS: Record<string, string> = {
  association: 'Association',
  sharedAggregation: 'Shared Aggregation',
  composition: 'Composition',
  generalization: 'Generalization',
  dependency: 'Dependency',
  allocation: 'Allocation',
  satisfy: 'Satisfy',
  verify: 'Verify',
  refine: 'Refine',
  trace: 'Trace',
  requirementContainment: 'Requirement Containment',
  deriveReqt: 'Derive Requirement',
  copy: 'Copy',
  connector: 'Connector',
  binding: 'Binding',
  itemFlow: 'Item Flow',
  transition: 'Transition',
};

export const DIAGRAM_KIND_LABELS: Record<string, string> = {
  bdd: 'Block Definition Diagram (BDD)',
  ibd: 'Internal Block Diagram (IBD)',
  requirements: 'Requirements Diagram',
  rtm: 'Requirements Traceability Matrix (RTM)',
  stateMachine: 'State Machine Diagram',
};

export function getElementKindLabel(kind: string): string {
  if (ELEMENT_KIND_LABELS[kind]) {
    return ELEMENT_KIND_LABELS[kind];
  }
  const catalogDef = getSupportedElementKinds().find(
    (k) => k.metaclass.toLowerCase() === kind.toLowerCase()
  );
  if (catalogDef) {
    return catalogDef.label;
  }
  return kind.charAt(0).toUpperCase() + kind.slice(1);
}

export function getRelationshipKindLabel(kind: string): string {
  return RELATIONSHIP_KIND_LABELS[kind] || kind.charAt(0).toUpperCase() + kind.slice(1);
}

export function getDiagramKindLabel(kind: string): string {
  return DIAGRAM_KIND_LABELS[kind] || kind.toUpperCase();
}
