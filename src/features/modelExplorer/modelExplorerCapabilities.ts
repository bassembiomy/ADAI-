import type { ExplorerCapability } from './modelExplorerTypes';

export const SYSML_CHILDREN: Record<string, readonly string[]> = {
  model: ['package', 'block', 'valueType', 'interface', 'requirement', 'verificationCase'],
  package: ['package', 'block', 'valueType', 'interface', 'requirement', 'verificationCase'],
  block: ['part', 'reference', 'sharedPart', 'fullPort', 'proxyPort', 'valueProperty'],
  requirement: ['requirement'],
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

export const ELEMENT_KIND_LABELS: Record<string, string> = {
  model: 'Model',
  package: 'Package',
  block: 'Block',
  valueType: 'Value Type',
  interface: 'Interface',
  requirement: 'Requirement',
  verificationCase: 'Verification Case',
  part: 'Part',
  reference: 'Reference Property',
  sharedPart: 'Shared Part',
  fullPort: 'Full Port',
  proxyPort: 'Proxy Port',
  valueProperty: 'Value Property',
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
  return ELEMENT_KIND_LABELS[kind] || kind.charAt(0).toUpperCase() + kind.slice(1);
}

export function getRelationshipKindLabel(kind: string): string {
  return RELATIONSHIP_KIND_LABELS[kind] || kind.charAt(0).toUpperCase() + kind.slice(1);
}

export function getDiagramKindLabel(kind: string): string {
  return DIAGRAM_KIND_LABELS[kind] || kind.toUpperCase();
}
