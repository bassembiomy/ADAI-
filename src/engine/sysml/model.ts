export interface Multiplicity {
  lower: number;
  upper: number | '*';
  ordered: boolean;
  unique: boolean;
}

export interface NamedElement { id: string; name: string; namespace: string[]; }
export interface ValueTypeDefinition extends NamedElement { kind: 'valueType'; unit?: string; dimension?: string; }
export interface InterfaceDefinition extends NamedElement { kind: 'interface'; features: string[]; }
export interface PropertyDefinition { id: string; name: string; kind: 'value' | 'part' | 'reference' | 'flow'; typeId: string; multiplicity: Multiplicity; isDerived?: boolean; redefinesId?: string; subsetsId?: string; }
export interface PortDefinition { id: string; name: string; kind: 'full' | 'proxy'; typeId: string; direction: 'in' | 'out' | 'inout'; isConjugated: boolean; multiplicity: Multiplicity; }
export interface BlockDefinition extends NamedElement { kind: 'block'; isAbstract: boolean; isLeaf: boolean; supertypeIds?: string[]; properties: PropertyDefinition[]; ports: PortDefinition[]; operations: string[]; constraints: string[]; }
export type SysmlDefinition = BlockDefinition | ValueTypeDefinition | InterfaceDefinition;

export interface PartUsage { id: string; kind: 'part'; name: string; ownerId: string; typeId: string; aggregation: 'composite' | 'shared' | 'reference'; multiplicity: Multiplicity; }
export interface PortUsage { id: string; kind: 'port'; name: string; ownerId: string; definitionId: string; }
export type SysmlUsage = PartUsage | PortUsage;
export interface ConnectorUsage { id: string; kind: 'assembly' | 'delegation' | 'binding'; ownerId: string; sourcePortId: string; targetPortId: string; itemFlowId?: string; }
export interface RequirementDefinition extends NamedElement { kind: 'requirement'; requirementId: string; text: string; status: 'draft' | 'approved' | 'implemented' | 'verified' | 'failed' | 'stale' | 'retired'; version: string; baselineId?: string; source?: string; rationale?: string; owner?: string; risk?: 'low' | 'medium' | 'high' | 'critical'; priority?: 'low' | 'medium' | 'high' | 'critical'; copiedFromId?: string; }
export interface VerificationCase extends NamedElement { kind: 'verificationCase'; method: string; verifiesRequirementIds: string[]; }
export interface VerificationEvidence { id: string; verificationCaseId: string; requirementId: string; revision: number; result: 'passed' | 'failed'; executedAt: string; artifactUri?: string; semanticFingerprint?: string; status?: 'current' | 'stale'; }
export interface ModelBaseline { id: string; name: string; revision: number; createdAt: string; protected: boolean; contentHash?: string; elementHashes?: Record<string, string>; }
export interface TraceArtifact { id: string; name: string; kind: 'behavior' | 'simulation' | 'generatedArtifact' | 'source'; ownerId?: string; revision: number; uri?: string; }
export interface ModelChangeRecord { id: string; revision: number; timestamp: string; command: string; elementIds: string[]; actor?: string; }
export interface SysmlRelationship { id: string; kind: 'association' | 'sharedAggregation' | 'composition' | 'generalization' | 'dependency' | 'allocation' | 'binding' | 'itemFlow' | 'deriveReqt' | 'satisfy' | 'verify' | 'refine' | 'trace' | 'copy'; sourceId: string; targetId: string; sourceMultiplicity?: Multiplicity; targetMultiplicity?: Multiplicity; suspect?: boolean; lastValidatedRevision?: number; }

export interface SysmlRepository {
  schemaVersion: 2;
  profileId: 'OMG-SysML-1.6-ADIA';
  revision: number;
  definitions: Record<string, SysmlDefinition>;
  usages: Record<string, SysmlUsage>;
  connectors: Record<string, ConnectorUsage>;
  relationships: Record<string, SysmlRelationship>;
  requirements: Record<string, RequirementDefinition>;
  verificationCases: Record<string, VerificationCase>;
  evidence: Record<string, VerificationEvidence>;
  baselines: Record<string, ModelBaseline>;
  artifacts: Record<string, TraceArtifact>;
  auditTrail: ModelChangeRecord[];
}

export function createEmptyRepository(): SysmlRepository {
  return { schemaVersion: 2, profileId: 'OMG-SysML-1.6-ADIA', revision: 0, definitions: {}, usages: {}, connectors: {}, relationships: {}, requirements: {}, verificationCases: {}, evidence: {}, baselines: {}, artifacts: {}, auditTrail: [] };
}

export function qualifiedName(namespace: readonly string[], name: string): string {
  return [...namespace.filter(Boolean), name].join('::');
}

export function parseMultiplicity(input: string): Multiplicity {
  const text = input.trim();
  const match = /^(\d+)(?:\.\.(\d+|\*))?(?:\s*\{([^}]+)\})?$/.exec(text);
  if (!match) throw new Error(`Invalid multiplicity: ${input}`);
  const lower = Number(match[1]);
  const upper: number | '*' = match[2] === '*' ? '*' : Number(match[2] ?? match[1]);
  if (!Number.isSafeInteger(lower) || lower < 0 || (upper !== '*' && (!Number.isSafeInteger(upper) || upper < lower))) throw new Error(`Invalid multiplicity: ${input}`);
  const modifiers = new Set((match[3] || '').split(',').map(v => v.trim().toLowerCase()).filter(Boolean));
  if ([...modifiers].some(v => !['ordered', 'unordered', 'unique', 'nonunique'].includes(v))) throw new Error(`Invalid multiplicity modifier: ${input}`);
  return { lower, upper, ordered: modifiers.has('ordered'), unique: !modifiers.has('nonunique') };
}
