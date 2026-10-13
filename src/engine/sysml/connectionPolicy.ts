import type { BlockData, PartData } from '../../types/sysml_types';
import type { SysmlEntity, SysmlUsage } from './model';
import { sysmlObjectLabel } from '../../features/sysml/sysmlDisplayLabel';

export type SysmlEndpointFamily =
  | 'block' | 'interfaceBlock' | 'interface' | 'valueType' | 'enumeration'
  | 'requirement' | 'verificationCase' | 'part' | 'port' | 'valueParameter'
  | 'actor' | 'useCase' | 'subject' | 'state' | 'property'
  | 'activity' | 'interaction' | 'operation' | 'signal' | 'constraintBlock' | 'package' | 'unit' | 'quantityKind' | 'view' | 'viewpoint' | 'stakeholder' | 'unknown';

export interface ConnectionEndpoint {
  id: string;
  name: string;
  family: SysmlEndpointFamily;
  ownerId?: string;
  typeId?: string;
  /** For a `property` endpoint: the property's kind. A part or reference property stands for the part the old PartUsage record was. */
  propertyKind?: 'value' | 'part' | 'reference' | 'flow' | 'constraint';
}

export interface ConnectionPolicyDiagnostic {
  code: string;
  message: string;
  correctiveAction: string;
}

export interface ConnectionPolicyDecision {
  allowed: boolean;
  diagnostics: ConnectionPolicyDiagnostic[];
}

export interface ConnectionPolicyInput {
  relationshipKind: string;
  source: ConnectionEndpoint;
  target: ConnectionEndpoint;
  diagram: 'bdd' | 'ibd' | 'requirements' | 'rtm' | 'useCase' | 'statemachine' | 'package' | 'activity';
}

const BLOCK_FAMILY = new Set<SysmlEndpointFamily>(['block', 'interfaceBlock']);
const CLASSIFIER_FAMILY = new Set<SysmlEndpointFamily>(['block', 'interfaceBlock', 'interface', 'valueType', 'enumeration']);
const ASSOCIATION_FAMILY = new Set<SysmlEndpointFamily>(['block', 'interfaceBlock', 'interface', 'valueType', 'enumeration', 'property', 'signal', 'constraintBlock']);
/**
 * SysML 1.6 §16.3.2.7: the client of «satisfy» is any named design element, not
 * only Blocks. Requirements, unresolved endpoints and Packages are excluded.
 */
const SATISFY_SOURCE_FAMILY = new Set<SysmlEndpointFamily>(['block', 'interfaceBlock', 'interface', 'part', 'port', 'property', 'state', 'useCase', 'activity', 'interaction', 'operation']);
/** «verify» clients are test cases or the behaviours/operations that realise them. */
const VERIFY_SOURCE_FAMILY = new Set<SysmlEndpointFamily>(['verificationCase', 'state', 'activity', 'interaction', 'operation']);
const SAME_FAMILY_GENERALIZATION = new Set<SysmlEndpointFamily>(['interface', 'valueType', 'enumeration', 'signal', 'constraintBlock']);
const REQUIREMENT_KINDS = new Set(['requirementContainment', 'deriveReqt', 'copy', 'satisfy', 'verify', 'refine', 'trace']);
const USE_CASE_KINDS = new Set(['useCaseAssociation', 'include', 'extend', 'useCaseGeneralization', 'useCaseSatisfy', 'useCaseRefine', 'useCaseTrace']);

function endpointName(endpoint: ConnectionEndpoint): string {
  return sysmlObjectLabel(endpoint, endpoint.family);
}

function familyLabel(endpoint: ConnectionEndpoint): string {
  return endpoint.family;
}

function diagnostic(input: ConnectionPolicyInput, code: string, reason: string, correctiveAction: string): ConnectionPolicyDiagnostic {
  const source = `${endpointName(input.source)} (${familyLabel(input.source)})`;
  const target = `${endpointName(input.target)} (${familyLabel(input.target)})`;
  return { code, message: `${input.relationshipKind} cannot connect ${source} to ${target}. ${reason}`, correctiveAction };
}

function reject(input: ConnectionPolicyInput, code: string, reason: string, correctiveAction: string): ConnectionPolicyDecision {
  return { allowed: false, diagnostics: [diagnostic(input, code, reason, correctiveAction)] };
}

function validDiagram(kind: string, diagram: ConnectionPolicyInput['diagram']): boolean {
  if (['association', 'composition', 'sharedAggregation', 'aggregation', 'generalization', 'dependency'].includes(kind)) return diagram === 'bdd';
  // SysML 1.6 Clause 15: «allocate» relates any named element to any other, so it is valid wherever
  // structure, behaviour or requirements are drawn.
  if (kind === 'allocation') return ['bdd', 'ibd', 'requirements', 'package', 'activity', 'useCase'].includes(diagram);
  if (['binding', 'assembly', 'delegation'].includes(kind)) return diagram === 'ibd';
  if (REQUIREMENT_KINDS.has(kind)) return diagram === 'requirements' || diagram === 'rtm' || diagram === 'statemachine';
  if (USE_CASE_KINDS.has(kind)) return diagram === 'useCase';
  if (kind === 'transition') return diagram === 'statemachine';
  // SysML 1.6 Clause 7: «conform» / «expose» are drawn on package diagrams (and BDDs, where views are classifiers).
  if (kind === 'conform' || kind === 'expose') return diagram === 'package' || diagram === 'bdd';
  return false;
}

export function evaluateSysmlConnection(input: ConnectionPolicyInput): ConnectionPolicyDecision {
  const kind = input.relationshipKind === 'aggregation' ? 'sharedAggregation' : input.relationshipKind;
  const normalized = { ...input, relationshipKind: kind };
  const { source, target } = normalized;
  if (!validDiagram(kind, input.diagram)) return reject(normalized, 'INVALID_RELATIONSHIP_DIAGRAM', `This relationship is not valid on the ${input.diagram} diagram.`, 'Choose a relationship supported by the current diagram.');
  if (!source.id || !target.id) return reject(normalized, 'MISSING_RELATIONSHIP_ENDPOINT', 'Both relationship endpoints must be resolved model elements.', 'Choose existing endpoints before creating the relationship.');
  if (source.id === target.id && kind !== 'transition') return reject(normalized, 'SELF_RELATIONSHIP', 'An endpoint cannot connect to itself.', 'Choose two distinct endpoints.');

  if (kind === 'association') {
    if (source.family === 'unknown' || target.family === 'unknown') return reject(normalized, 'UNKNOWN_STEREOTYPE_FAMILY', 'Association requires declared classifier endpoint families.', 'Declare a supported stereotype family before using an association.');
    if (!ASSOCIATION_FAMILY.has(source.family) || !ASSOCIATION_FAMILY.has(target.family)) return reject(normalized, 'INCOMPATIBLE_RELATIONSHIP_ENDPOINTS', 'Association requires compatible classifier endpoints.', 'Choose two Block, Interface, ValueType, or Enumeration classifiers.');
    if (source.family === 'property' && source.typeId && source.typeId !== target.id) {
      return reject(normalized, 'INCOMPATIBLE_PROPERTY_TYPE_ENDPOINT', `Property ${endpointName(source)} is typed by a different type than ${endpointName(target)}.`, 'Connect to the classifier that types this property.');
    }
    if (target.family === 'property' && target.typeId && target.typeId !== source.id) {
      return reject(normalized, 'INCOMPATIBLE_PROPERTY_TYPE_ENDPOINT', `Property ${endpointName(target)} is typed by a different type than ${endpointName(source)}.`, 'Connect to the classifier that types this property.');
    }
    return { allowed: true, diagnostics: [] };
  }
  if (kind === 'composition' || kind === 'sharedAggregation') {
    const validTarget = BLOCK_FAMILY.has(target.family) || target.family === 'part'
      || (target.family === 'property' && (target.propertyKind === 'part' || target.propertyKind === 'reference'));
    if (!BLOCK_FAMILY.has(source.family) || !validTarget) {
      const code = source.family === 'unknown' || target.family === 'unknown' ? 'UNKNOWN_STEREOTYPE_FAMILY' : 'INVALID_AGGREGATION_ENDPOINTS';
      return reject(normalized, code, `${kind} requires a Block-family whole and a Block-family or Part target.`, 'Declare a supported Block-family stereotype, or create a value property typed by the ValueType instead.');
    }
    return { allowed: true, diagnostics: [] };
  }
  if (kind === 'generalization') {
    const compatible = (BLOCK_FAMILY.has(source.family) && BLOCK_FAMILY.has(target.family)) || source.family === target.family && SAME_FAMILY_GENERALIZATION.has(source.family);
    if (source.family === 'unknown' || target.family === 'unknown') return reject(normalized, 'UNKNOWN_STEREOTYPE_FAMILY', 'Generalization requires declared compatible endpoint families.', 'Declare a supported stereotype family before using generalization.');
    if (!compatible) return reject(normalized, 'CROSS_FAMILY_GENERALIZATION', 'Generalization requires compatible endpoint families.', 'Use the same classifier family, or model the relationship as a dependency.');
    return { allowed: true, diagnostics: [] };
  }
  if (kind === 'dependency' || kind === 'allocation') {
    if (source.family === 'unknown' && !target.id) return reject(normalized, 'MISSING_RELATIONSHIP_ENDPOINT', 'The target endpoint is missing.', 'Choose a resolved model element.');
    return { allowed: true, diagnostics: [] };
  }
  if (kind === 'requirementContainment' || kind === 'deriveReqt' || kind === 'copy') {
    if (source.family !== 'requirement' || target.family !== 'requirement') return reject(normalized, 'INVALID_REQUIREMENT_RELATION_DIRECTION', `${kind} requires Requirement to Requirement endpoints.`, 'Connect the appropriate Requirement endpoints.');
    return { allowed: true, diagnostics: [] };
  }
  if (kind === 'satisfy') {
    if (!SATISFY_SOURCE_FAMILY.has(source.family) || target.family !== 'requirement') {
      const correctiveAction = (source.family === 'requirement' && target.family === 'state')
        ? 'Connect the State to the Requirement, not the Requirement to the State.'
        : 'Connect the design element, Part, or State to a Requirement.';
      return reject(normalized, 'INVALID_SATISFY_DIRECTION', 'Satisfy requires a design element (Block, Part, Port, Property, State, Use Case, Interaction or behaviour) to a Requirement.', correctiveAction);
    }
    return { allowed: true, diagnostics: [] };
  }
  if (kind === 'verify') {
    if (!VERIFY_SOURCE_FAMILY.has(source.family) || target.family !== 'requirement') return reject(normalized, 'INVALID_VERIFY_DIRECTION', 'Verify requires a Verification Case, behaviour or State to a Requirement.', 'Connect a Verification Case or State to the Requirement it verifies.');
    return { allowed: true, diagnostics: [] };
  }
  if (kind === 'refine') {
    if (target.family !== 'requirement' || (input.diagram === 'rtm' && source.family === 'requirement')) return reject(normalized, 'INVALID_REFINE_DIRECTION', 'Refine requires a target Requirement endpoint; RTM refinement must originate from a model element.', 'Connect a model element to the Requirement it refines.');
    return { allowed: true, diagnostics: [] };
  }
  if (kind === 'trace') {
    if (source.family !== 'requirement' && target.family !== 'requirement') return reject(normalized, 'INVALID_TRACE_ENDPOINTS', 'Trace requires at least one Requirement endpoint.', 'Connect one endpoint to a Requirement.');
    return { allowed: true, diagnostics: [] };
  }
  if (kind === 'binding') {
    if (source.family === 'unknown' || target.family === 'unknown') return reject(normalized, 'UNKNOWN_STEREOTYPE_FAMILY', 'Binding requires declared value-parameter endpoint families.', 'Declare the endpoint stereotype or choose value/constraint parameters.');
    if (source.family !== 'valueParameter' || target.family !== 'valueParameter') return reject(normalized, 'INVALID_BINDING_ENDPOINTS', 'Binding connects compatible value or constraint parameters.', 'Choose two value/constraint parameters in a parametric context.');
    return { allowed: true, diagnostics: [] };
  }
  if (kind === 'assembly' || kind === 'delegation') {
    if (source.family === 'unknown' || target.family === 'unknown') return reject(normalized, 'UNKNOWN_STEREOTYPE_FAMILY', `${kind} requires declared port endpoint families.`, 'Declare the endpoint stereotype or choose compatible ports.');
    if (source.family !== 'port' || target.family !== 'port') return reject(normalized, `INVALID_${kind.toUpperCase()}_ENDPOINTS`, `${kind} connects compatible ports.`, 'Choose two compatible ports in the IBD context.');
    return { allowed: true, diagnostics: [] };
  }
  if (kind === 'useCaseAssociation') {
    const isActorSource = source.family === 'actor';
    const isUseCaseSource = source.family === 'useCase';
    const isActorTarget = target.family === 'actor';
    const isUseCaseTarget = target.family === 'useCase';
    const valid = (isActorSource && isUseCaseTarget) || (isUseCaseSource && isActorTarget);
    if (!valid) {
      return reject(normalized, 'INVALID_USE_CASE_ASSOCIATION_ENDPOINTS', 'Use Case Association requires an Actor and a Use Case.', 'Connect an Actor to a Use Case, or vice versa.');
    }
    return { allowed: true, diagnostics: [] };
  }
  if (kind === 'include') {
    if (source.family !== 'useCase' || target.family !== 'useCase') {
      return reject(normalized, 'INVALID_INCLUDE_ENDPOINTS', 'Include requires Use Case to Use Case.', 'Connect an including Use Case to an included Use Case.');
    }
    return { allowed: true, diagnostics: [] };
  }
  if (kind === 'extend') {
    if (source.family !== 'useCase' || target.family !== 'useCase') {
      return reject(normalized, 'INVALID_EXTEND_ENDPOINTS', 'Extend requires Use Case to Use Case.', 'Connect an extending Use Case to an extended Use Case.');
    }
    return { allowed: true, diagnostics: [] };
  }
  if (kind === 'useCaseGeneralization') {
    const valid = (source.family === 'actor' && target.family === 'actor') || (source.family === 'useCase' && target.family === 'useCase');
    if (!valid) {
      return reject(normalized, 'INVALID_GENERALIZATION_FAMILY', 'Generalization on Use Case diagram must connect elements of the same family (Actor to Actor, or Use Case to Use Case).', 'Connect two Actors or two Use Cases.');
    }
    return { allowed: true, diagnostics: [] };
  }
  if (kind === 'useCaseSatisfy' || kind === 'useCaseRefine') {
    if (source.family !== 'useCase' || target.family !== 'requirement') {
      return reject(normalized, `INVALID_${kind.toUpperCase()}_ENDPOINTS`, `${kind} requires Use Case to Requirement.`, 'Connect a Use Case to a Requirement.');
    }
    return { allowed: true, diagnostics: [] };
  }
  if (kind === 'useCaseTrace') {
    const valid = (source.family === 'useCase' && target.family === 'requirement') || (source.family === 'requirement' && target.family === 'useCase');
    if (!valid) {
      return reject(normalized, 'INVALID_USE_CASE_TRACE_ENDPOINTS', 'Trace requires a Use Case and a Requirement.', 'Connect a Use Case and a Requirement.');
    }
    return { allowed: true, diagnostics: [] };
  }
  if (kind === 'conform') {
    if (source.family !== 'view' || target.family !== 'viewpoint') {
      return reject(normalized, 'INVALID_CONFORM_ENDPOINTS', 'Conform requires a View (source) and a Viewpoint (target).', 'Connect a View to the Viewpoint it conforms to.');
    }
    return { allowed: true, diagnostics: [] };
  }
  if (kind === 'expose') {
    if (source.family !== 'view') {
      return reject(normalized, 'INVALID_EXPOSE_SOURCE', 'Expose must start at a View.', 'Connect a View to the element it exposes.');
    }
    if (target.family === 'unknown') {
      return reject(normalized, 'MISSING_RELATIONSHIP_ENDPOINT', 'The exposed element must be a resolved model element.', 'Choose an existing model element to expose.');
    }
    return { allowed: true, diagnostics: [] };
  }
  if (kind === 'transition') {
    return { allowed: true, diagnostics: [] };
  }
  return reject(normalized, 'UNSUPPORTED_RELATIONSHIP_KIND', `Relationship kind ${kind} is not supported by the SysML 1.6 profile.`, 'Choose a supported SysML relationship.');
}

function fromLegacyKind(kind: string | undefined): SysmlEndpointFamily {
  switch ((kind || '').toLowerCase()) {
    case 'block': return 'block';
    case 'interfaceblock': return 'interfaceBlock';
    case 'interface': return 'interface';
    case 'valuetype': return 'valueType';
    case 'enumeration': case 'enum': return 'enumeration';
    case 'constraintblock': return 'constraintBlock';
    case 'requirement': return 'requirement';
    case 'verificationcase': case 'verification case': case 'testcase': case 'test case': return 'verificationCase';
    case 'part': case 'usage': return 'part';
    case 'port': return 'port';
    case 'valueparameter': case 'value parameter': case 'constraintparameter': return 'valueParameter';
    case 'actor': return 'actor';
    case 'usecase': case 'use_case': return 'useCase';
    case 'subject': return 'subject';
    case 'state': return 'state';
    case 'activity': return 'activity';
    case 'interaction': return 'interaction';
    case 'operation': return 'operation';
    case 'signal': return 'signal';
    case 'unit': return 'unit';
    case 'quantitykind': return 'quantityKind';
    case 'view': return 'view';
    case 'viewpoint': return 'viewpoint';
    case 'stakeholder': return 'stakeholder';
    case 'package': case 'model': return 'package';
    case 'property': case 'partproperty': case 'referenceproperty': case 'valueproperty': case 'reference': case 'value': return 'property';
    default: return 'unknown';
  }
}

/**
 * Maps a canonical (V4) metaclass to the endpoint family this policy reasons
 * about, so every rule table answers through `evaluateSysmlConnection`.
 * AssociationBlock is a Block specialisation; ConstraintBlock has its own family
 * (it may only be specialised by another ConstraintBlock).
 */
export function familyOfMetaclass(metaclass: string): SysmlEndpointFamily {
  switch (metaclass) {
    case 'Block': case 'AssociationBlock': return 'block';
    case 'ConstraintBlock': return 'constraintBlock';
    case 'InterfaceBlock': return 'interfaceBlock';
    case 'FlowSpecification': return 'interface';
    case 'ValueType': case 'DataType': return 'valueType';
    case 'Enumeration': return 'enumeration';
    case 'Signal': return 'signal';
    case 'Unit': return 'unit';
    case 'QuantityKind': return 'quantityKind';
    case 'View': return 'view';
    case 'Viewpoint': return 'viewpoint';
    case 'Stakeholder': return 'stakeholder';
    case 'PartProperty': return 'part';
    case 'ReferenceProperty': case 'ValueProperty': case 'FlowProperty': case 'ConstraintProperty': return 'property';
    case 'Port': return 'port';
    case 'Requirement': return 'requirement';
    case 'TestCase': case 'VerificationCase': return 'verificationCase';
    case 'UseCase': return 'useCase';
    case 'Activity': return 'activity';
    case 'Interaction': return 'interaction';
    case 'Operation': return 'operation';
    case 'Package': case 'Model': return 'package';
    default: return 'unknown';
  }
}

export function classifyLegacyEndpoint(endpoint: unknown): ConnectionEndpoint {
  const value = endpoint as Partial<BlockData & PartData> & { kind?: string; stereotype?: string; ownerId?: string };
  const family = fromLegacyKind(value.stereotype || value.kind);
  return { id: String(value.id || ''), name: sysmlObjectLabel(value, family), family, ownerId: value.ownerId };
}

export function classifyCanonicalEndpoint(endpoint: unknown): ConnectionEndpoint {
  const value = endpoint as Partial<SysmlEntity | SysmlUsage> & { kind?: string; stereotype?: string; ownerId?: string; metaclass?: string; name?: string };
  const family = fromLegacyKind(value.stereotype || value.metaclass || value.kind);
  return { id: String(value.id || ''), name: sysmlObjectLabel(value, family), family, ownerId: value.ownerId };
}
