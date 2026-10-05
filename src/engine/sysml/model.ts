export * from './domain';
import type { DiagramKind } from './domain';
import type { ConnectorEnd } from './connectorEnds';

export interface Multiplicity {
  lower: number;
  upper: number | '*';
  ordered: boolean;
  unique: boolean;
}

export interface NamedElement { id: string; name: string; namespace: string[]; ownerId?: string; }
export interface PackageDefinition extends NamedElement {
  kind: 'package';
  /** SysML 1.6 §7.3.2.4 «modelLibrary»: a Package of reusable, shareable elements. */
  stereotype?: 'modelLibrary';
}
export interface ModelDiagramDefinition extends NamedElement {
  kind: 'diagram';
  /** Single source of truth: domain/presentations.ts DiagramKind. */
  diagramKind: DiagramKind;
  contextElementId?: string;
}
export interface ValueTypeDefinition extends NamedElement {
  kind: 'valueType';
  /** Legacy free-text unit/dimension kept so old files still load; prefer `unitId` / `quantityKindId`. */
  unit?: string;
  dimension?: string;
  /** SysML 1.6 §8.3.2.10: the Unit element this ValueType is measured in. */
  unitId?: string;
  /** SysML 1.6 §8.3.2.11: the QuantityKind this ValueType quantifies. */
  quantityKindId?: string;
}
export interface InterfaceDefinition extends NamedElement { kind: 'interface'; features: string[]; }
export interface PropertyDefinition { id: string; name: string; kind: 'value' | 'part' | 'reference' | 'flow' | 'constraint'; typeId: string; multiplicity: Multiplicity; unit?: string; dimension?: string; defaultValue?: string; isDerived?: boolean; redefinesId?: string; subsetsId?: string; inheritedFromId?: string; }
export interface PortDefinition { id: string; name: string; kind: 'standard' | 'proxy' | 'full' | 'flow'; portKind?: 'umlPort' | 'proxyPort' | 'fullPort' | 'flowPort'; appliedStereotypeIds?: string[]; typeId: string; direction: 'in' | 'out' | 'inout'; isConjugated: boolean; multiplicity: Multiplicity; inheritedFromId?: string; ownerPortId?: string; nestedPortPathIds?: string[]; }
export interface BlockDefinition extends NamedElement {
  kind: 'block'; isAbstract: boolean; isLeaf: boolean; supertypeIds?: string[]; properties: PropertyDefinition[]; ports: PortDefinition[]; operations: string[]; constraints: string[];
  /**
   * UML Receptions: the Signals instances of this Block accept (SysML 1.6 §8.3.2.1).
   * Optional and additive — a Block with none is simply not checked against signal messages.
   */
  receptions?: string[];
}
/** UML Enumeration (SysML 1.6 §8.3.2.4): a value type whose values are a fixed list of literals. */
export interface EnumerationDefinition extends NamedElement { kind: 'enumeration'; literals: string[]; }
/** UML Signal: an asynchronous message type, usable as a flow property type. */
export interface SignalDefinition extends NamedElement { kind: 'signal'; }
/** A parameter of a ConstraintBlock; parametric diagrams bind other properties to it. */
export interface ConstraintParameter { id: string; name: string; typeId: string; multiplicity?: Multiplicity; }
/**
 * SysML 1.6 §10.3.2.1: a ConstraintBlock packages a constraint expression over
 * named parameters so it can be reused as a constraint property.
 */
export interface ConstraintBlockDefinition extends NamedElement {
  kind: 'constraintBlock';
  parameters: ConstraintParameter[];
  /** Constraint expressions over the parameters, e.g. "F = m * a". */
  constraints: string[];
}
/** SysML 1.6 §8.3.2.11 (QUDV): the kind of a measurable quantity, e.g. Length. */
export interface QuantityKindDefinition extends NamedElement { kind: 'quantityKind'; symbol?: string; description?: string; }
/** SysML 1.6 §8.3.2.10 (QUDV): a unit of measure, optionally of one QuantityKind. */
export interface UnitDefinition extends NamedElement { kind: 'unit'; symbol: string; quantityKindId?: string; }
/**
 * SysML 1.6 §7.3.2.3 Stakeholder: a role/organisation with concerns.
 * `concerns` is free text (the V3 model has no Comment storage).
 */
export interface StakeholderDefinition extends NamedElement { kind: 'stakeholder'; concerns: string[]; }
/**
 * SysML 1.6 §7.3.2.2 Viewpoint. `concernIds` references Requirements (the V3
 * model has no Comment storage); free-text concerns live on the Stakeholders.
 */
export interface ViewpointDefinition extends NamedElement {
  kind: 'viewpoint';
  stakeholderIds: string[];
  concernIds: string[];
  /** Free-text concerns this viewpoint frames (stand-in for Comments). */
  concerns?: string[];
  purpose: string;
  languages: string[];
  presentation: string[];
  methodText?: string;
}
/**
 * SysML 1.6 §7.3.2.1 View. The viewpoint it conforms to is derived from its
 * «conform» relationship (see `viewpointOf`); it is deliberately not stored.
 */
export interface ViewDefinition extends NamedElement { kind: 'view'; }
/** SysML 1.6 Clause 11 / UML activity node kinds (the Cameo core set). */
export type ActivityNodeKind =
  | 'action' | 'initial' | 'activityFinal' | 'flowFinal' | 'decision' | 'merge'
  | 'fork' | 'join' | 'objectNode' | 'activityParameterNode';
/** A pin on an action: the typed input/output through which object flows reach it. */
export interface ActivityPin { id: string; name: string; direction: 'in' | 'out'; typeId?: string; }
export interface ActivityNode {
  id: string;
  kind: ActivityNodeKind;
  name: string;
  /** `action` only: the behavior (Activity) this call-behavior action invokes. */
  behaviorId?: string;
  /** `action` only. */
  pins?: ActivityPin[];
  /** `objectNode` / `activityParameterNode`: the type of the values held. */
  typeId?: string;
  /** `activityParameterNode` only: the ActivityParameter it is bound to. */
  parameterId?: string;
}
export interface ActivityEdge {
  id: string;
  kind: 'controlFlow' | 'objectFlow';
  /** A node id, or (object flow only) a pin id. */
  sourceId: string;
  targetId: string;
  guard?: string;
}
/** A swimlane. Named ActivityPartitionGroup to stay clear of the V4 `ActivityPartition` element. */
export interface ActivityPartitionGroup { id: string; name: string; representsId?: string; nodeIds: string[]; }
export interface ActivityParameter { id: string; name: string; direction: 'in' | 'out' | 'inout'; typeId?: string; }
/**
 * SysML 1.6 Clause 11 Activity. Nodes, edges, pins, partitions and parameters
 * are nested content (like Block properties): globally unique ids, edited by
 * `updateElement` patches that carry the next arrays.
 */
export interface ActivityDefinition extends NamedElement {
  kind: 'activity';
  parameters: ActivityParameter[];
  nodes: ActivityNode[];
  edges: ActivityEdge[];
  partitions: ActivityPartitionGroup[];
}
/** SysML 1.6 Clause 12 / UML message sorts (the Cameo core set). */
export type InteractionMessageSort =
  | 'synchCall' | 'asynchCall' | 'asynchSignal' | 'reply' | 'createMessage' | 'deleteMessage';
/** A participant. `representsId` is a part/reference property of the context Block, or a Block. */
export interface Lifeline { id: string; name: string; representsId?: string; }
export interface InteractionMessage {
  id: string;
  name: string;
  sort: InteractionMessageSort;
  sourceLifelineId: string;
  targetLifelineId: string;
  /** Position along the lifelines, top to bottom. Unique within the interaction. */
  order: number;
  /**
   * `asynchSignal`: the Signal definition id. Call messages: the operation, as
   * written in `BlockDefinition.operations` (operations carry no id of their own).
   */
  signatureId?: string;
  arguments?: string;
  /**
   * The IBD connector (of the context Block) this message travels over. Both
   * lifelines must stand for parts the connector joins. Optional: most messages
   * do not name one, and the rules only warn when none exists.
   */
  connectorId?: string;
}
/**
 * UML InteractionUse (a `ref` frame): another Interaction referred to from this
 * one, shown as a frame over the lifelines it covers. It sits after the message
 * it is anchored to (`afterMessageId`, absent = before the first message), so it
 * does not take part in the message `order` numbering.
 */
export interface InteractionUse {
  id: string;
  /** The Interaction this one refers to. */
  refersToId: string;
  coveredLifelineIds: string[];
  afterMessageId?: string;
  /** Actual arguments, free text like a message's. */
  arguments?: string;
}
/**
 * A state invariant on a lifeline (UML StateInvariant): the lifeline's object is
 * in the named state at that point. `stateId` points to a state of the state
 * machine editor, which lives outside the SysML repository, so it may stop
 * resolving without any SysML command. It sits after `afterMessageId` (absent =
 * before the first message).
 */
export interface StateInvariant {
  id: string;
  lifelineId: string;
  stateId: string;
  afterMessageId?: string;
}
/**
 * A time or duration constraint (UML TimeConstraint / DurationConstraint) drawn as a
 * bracket beside the lifelines. A time constraint marks one message; a duration constraint
 * spans from one message to another. The expression is text only and is never evaluated.
 */
export interface InteractionConstraint {
  id: string;
  kind: 'time' | 'duration';
  fromMessageId: string;
  /** Duration constraints only. */
  toMessageId?: string;
  expression: string;
}
export type CombinedFragmentOperator =
  | 'alt' | 'opt' | 'loop' | 'par' | 'break' | 'critical' | 'neg' | 'seq' | 'strict';
export interface CombinedFragmentOperand { guard?: string; messageIds: string[]; }
export interface CombinedFragment {
  id: string;
  operator: CombinedFragmentOperator;
  operands: CombinedFragmentOperand[];
  coveredLifelineIds: string[];
}
/**
 * SysML 1.6 Clause 12 Interaction. Lifelines, messages and combined fragments
 * are nested content (like Block properties): globally unique ids, edited by
 * `updateElement` patches that carry the next arrays.
 */
export interface InteractionDefinition extends NamedElement {
  kind: 'interaction';
  lifelines: Lifeline[];
  messages: InteractionMessage[];
  fragments: CombinedFragment[];
  /** `ref` frames (additive; absent in files written before they existed). */
  uses?: InteractionUse[];
  /** State invariants on lifelines (additive; absent in older files). */
  stateInvariants?: StateInvariant[];
  /** Time and duration constraints (additive; absent in older files). */
  constraints?: InteractionConstraint[];
}
export type SysmlDefinition =
  | BlockDefinition | ValueTypeDefinition | InterfaceDefinition
  | EnumerationDefinition | SignalDefinition | ConstraintBlockDefinition
  | QuantityKindDefinition | UnitDefinition
  | ViewDefinition | ViewpointDefinition | StakeholderDefinition
  | ActivityDefinition | InteractionDefinition;

/** Every `kind` stored in `SysmlRepository.definitions`; routing code must use this, not a hand-written subset. */
export const DEFINITION_KINDS: ReadonlyArray<SysmlDefinition['kind']> =
  ['block', 'valueType', 'interface', 'enumeration', 'signal', 'constraintBlock', 'quantityKind', 'unit', 'view', 'viewpoint', 'stakeholder', 'activity', 'interaction'];

export function isDefinitionKind(kind: unknown): kind is SysmlDefinition['kind'] {
  return typeof kind === 'string' && (DEFINITION_KINDS as readonly string[]).includes(kind);
}

export function isBlockDefinition(def: SysmlDefinition | undefined | null): def is BlockDefinition {
  return def?.kind === 'block';
}

export interface PartUsage { id: string; kind: 'part'; name: string; ownerId: string; typeId: string; aggregation: 'composite' | 'shared' | 'reference'; multiplicity: Multiplicity; propertyId?: string; }
export interface PortUsage { id: string; kind: 'port'; name: string; ownerId: string; definitionId: string; }
export type SysmlUsage = PartUsage | PortUsage;
/**
 * End of a parametric binding connector (SysML 1.6 §10.3.2.3): a property of the
 * context Block and, when that property is a constraint property, the parameter
 * of its ConstraintBlock that is bound.
 */
export interface ParametricEnd { propertyId: string; parameterId?: string; }
export interface ConnectorUsage { id: string; kind: 'assembly' | 'delegation' | 'binding'; ownerId: string; sourcePortId: string; targetPortId: string;
  /** Present on a parametric binding; `sourcePortId`/`targetPortId` then hold the property ids. */
  sourceEnd?: ParametricEnd | ConnectorEnd; targetEnd?: ParametricEnd | ConnectorEnd; itemFlowId?: string; sourceParameterId?: string; targetParameterId?: string; itemProperty?: string; itemMultiplicity?: Multiplicity; itemUnit?: string; }
export interface RequirementDefinition extends NamedElement { kind: 'requirement'; requirementId: string; text: string; status: 'draft' | 'approved' | 'implemented' | 'verified' | 'failed' | 'stale' | 'retired'; version: string; baselineId?: string; source?: string; rationale?: string; owner?: string; risk?: 'low' | 'medium' | 'high' | 'critical'; priority?: 'low' | 'medium' | 'high' | 'critical'; copiedFromId?: string; }
export interface VerificationCase extends NamedElement {
  kind: 'verificationCase'; method: string; verifiesRequirementIds: string[];
  /** The Activity or Interaction that is this test case's procedure (additive). */
  behaviorId?: string;
}
export interface VerificationEvidence { id: string; verificationCaseId: string; requirementId: string; revision: number; result: 'passed' | 'failed'; executedAt: string; artifactUri?: string; semanticFingerprint?: string; status?: 'current' | 'stale'; }
export interface ModelBaseline { id: string; name: string; revision: number; createdAt: string; protected: boolean; contentHash?: string; elementHashes?: Record<string, string>; }
export interface TraceArtifact { id: string; name: string; kind: 'behavior' | 'simulation' | 'generatedArtifact' | 'source'; ownerId?: string; revision: number; uri?: string; }
export interface ModelChangeRecord { id: string; revision: number; timestamp: string; command: string; elementIds: string[]; actor?: string; }
export type RequirementRelationshipKind =
  | 'requirementContainment'
  | 'deriveReqt'
  | 'satisfy'
  | 'verify'
  | 'refine'
  | 'trace'
  | 'copy';

export interface ActorDefinition extends NamedElement {
  kind: 'actor';
  isExternal: boolean;
  generalizationIds: string[];
}

export interface SubjectDefinition extends NamedElement {
  kind: 'subject';
  realizedByBlockId?: string;
  representedBlockId?: string;
  classifierId?: string;
}

export interface UseCaseDefinition extends NamedElement {
  kind: 'useCase';
  subjectId?: string;
  description?: string;
  extensionPointIds: string[];
  behaviorArtifactIds: string[];
}

export interface ExtensionPoint extends NamedElement {
  kind: 'extensionPoint';
  useCaseId: string;
  location?: string;
}

export type UseCaseRelationshipKind =
  | 'useCaseAssociation'
  | 'include'
  | 'extend'
  | 'useCaseGeneralization'
  | 'useCaseRefine'
  | 'useCaseSatisfy'
  | 'useCaseTrace';

export interface DiagramReference {
  id: string;
  diagramId: string;
  // Behaviour diagrams live outside ModelDiagramDefinition, so references
  // accept them in addition to every repository DiagramKind (incl. 'package').
  diagramKind: DiagramKind | 'useCase' | 'activity' | 'sequence';
  role: 'elaborates' | 'realizes' | 'traces' | 'verifies';
  sourceElementId?: string;
  targetElementId?: string;
}

export interface SysmlRelationship {
  id: string;
  /** Human-readable relationship label/signature shown on diagrams. */
  name?: string;
  kind:
    | 'association'
    | 'sharedAggregation'
    | 'composition'
    | 'generalization'
    | 'dependency'
    | 'packageImport'
    | 'elementImport'
    | 'packageMerge'
    | 'allocation'
    | 'binding'
    | 'itemFlow'
    /** SysML 1.6 §7.3.2: View -> Viewpoint (a Generalization). */
    | 'conform'
    /** SysML 1.6 §7.3.2: View -> exposed element. */
    | 'expose'
    | RequirementRelationshipKind
    | UseCaseRelationshipKind;
  sourceId: string;
  targetId: string;
  importingNamespaceId?: string;
  importedPackageId?: string;
  importedElementId?: string;
  mergingPackageId?: string;
  mergedPackageId?: string;
  visibility?: 'public' | 'private';
  alias?: string;
  sourceMultiplicity?: Multiplicity;
  targetMultiplicity?: Multiplicity;
  sourceRole?: string;
  targetRole?: string;
  sourceNavigable?: boolean;
  targetNavigable?: boolean;
  sourceAggregation?: 'none' | 'shared' | 'composite';
  targetAggregation?: 'none' | 'shared' | 'composite';
  suspect?: boolean;
  lastValidatedRevision?: number;
  extensionPointId?: string;
  sourceFamily?: string;
  targetFamily?: string;
}

export interface LivePackageImport extends SysmlRelationship {
  kind: 'packageImport';
  importingNamespaceId: string;
  importedPackageId: string;
  visibility: 'public' | 'private';
}
export interface LiveElementImport extends SysmlRelationship {
  kind: 'elementImport';
  importingNamespaceId: string;
  importedElementId: string;
  visibility: 'public' | 'private';
  alias?: string;
}
export interface LivePackageMerge extends SysmlRelationship {
  kind: 'packageMerge';
  mergingPackageId: string;
  mergedPackageId: string;
}

export interface SysmlRepository {
  schemaVersion: 2 | 3;
  profileId: 'OMG-SysML-1.6-ADIA';
  revision: number;
  packages: Record<string, PackageDefinition>;
  diagrams: Record<string, ModelDiagramDefinition>;
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
  actors: Record<string, ActorDefinition>;
  subjects: Record<string, SubjectDefinition>;
  useCases: Record<string, UseCaseDefinition>;
  extensionPoints: Record<string, ExtensionPoint>;
  diagramReferences: Record<string, DiagramReference>;
}

export function createEmptyRepository(): SysmlRepository {
  return {
    schemaVersion: 3,
    profileId: 'OMG-SysML-1.6-ADIA',
    revision: 0,
    packages: {
      model: { id: 'model', kind: 'package', name: 'Model', namespace: [], ownerId: '' },
    },
    diagrams: {},
    definitions: {},
    usages: {},
    connectors: {},
    relationships: {},
    requirements: {},
    verificationCases: {},
    evidence: {},
    baselines: {},
    artifacts: {},
    auditTrail: [],
    actors: {},
    subjects: {},
    useCases: {},
    extensionPoints: {},
    diagramReferences: {},
  };
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

export type SysmlEntityCollection =
  | 'packages'
  | 'diagrams'
  | 'definitions'
  | 'usages'
  | 'connectors'
  | 'relationships'
  | 'requirements'
  | 'verificationCases'
  | 'evidence'
  | 'baselines'
  | 'artifacts'
  | 'actors'
  | 'subjects'
  | 'useCases'
  | 'extensionPoints'
  | 'diagramReferences';

export type SysmlEntity =
  | PackageDefinition
  | ModelDiagramDefinition
  | SysmlDefinition
  | SysmlUsage
  | ConnectorUsage
  | SysmlRelationship
  | RequirementDefinition
  | VerificationCase
  | VerificationEvidence
  | ModelBaseline
  | TraceArtifact
  | ActorDefinition
  | SubjectDefinition
  | UseCaseDefinition
  | ExtensionPoint
  | DiagramReference;

export interface ModelPersistenceMetadata {
  isChunked?: boolean;
  chunkCount?: number;
  chunkSize?: number;
  checksum?: string;
  lastSavedRevision?: number;
  lastSavedAt?: string;
  formatVersion?: string;
}
