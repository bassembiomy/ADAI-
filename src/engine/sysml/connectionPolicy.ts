import type { BlockData, PartData } from '../../types/sysml_types';
import type { SysmlEntity, SysmlUsage } from './model';

export type SysmlEndpointFamily =
  | 'block' | 'interfaceBlock' | 'interface' | 'valueType' | 'enumeration'
  | 'requirement' | 'verificationCase' | 'part' | 'port' | 'valueParameter' | 'unknown';

export interface ConnectionEndpoint {
  id: string;
  name: string;
  family: SysmlEndpointFamily;
  ownerId?: string;
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
  diagram: 'bdd' | 'ibd' | 'requirements' | 'rtm';
}

const BLOCK_FAMILY = new Set<SysmlEndpointFamily>(['block', 'interfaceBlock']);
const CLASSIFIER_FAMILY = new Set<SysmlEndpointFamily>(['block', 'interfaceBlock', 'interface', 'valueType', 'enumeration']);
const REQUIREMENT_KINDS = new Set(['requirementContainment', 'deriveReqt', 'copy', 'satisfy', 'verify', 'refine', 'trace']);

function endpointName(endpoint: ConnectionEndpoint): string {
  return endpoint.name || endpoint.id;
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
  if (['association', 'composition', 'sharedAggregation', 'aggregation', 'generalization', 'dependency', 'allocation'].includes(kind)) return diagram === 'bdd';
  if (['binding', 'assembly', 'delegation'].includes(kind)) return diagram === 'ibd';
  if (kind === 'requirementContainment') return diagram === 'requirements';
  if (REQUIREMENT_KINDS.has(kind)) return diagram === 'rtm';
  return false;
}

export function evaluateSysmlConnection(input: ConnectionPolicyInput): ConnectionPolicyDecision {
  const kind = input.relationshipKind === 'aggregation' ? 'sharedAggregation' : input.relationshipKind;
  const normalized = { ...input, relationshipKind: kind };
  const { source, target } = normalized;
  if (!validDiagram(kind, input.diagram)) return reject(normalized, 'INVALID_RELATIONSHIP_DIAGRAM', `This relationship is not valid on the ${input.diagram} diagram.`, 'Choose a relationship supported by the current diagram.');
  if (!source.id || !target.id) return reject(normalized, 'MISSING_RELATIONSHIP_ENDPOINT', 'Both relationship endpoints must be resolved model elements.', 'Choose existing endpoints before creating the relationship.');
  if (source.id === target.id) return reject(normalized, 'SELF_RELATIONSHIP', 'An endpoint cannot connect to itself.', 'Choose two distinct endpoints.');

  if (kind === 'association') {
    if (source.family === 'unknown' || target.family === 'unknown') return reject(normalized, 'UNKNOWN_STEREOTYPE_FAMILY', 'Association requires declared classifier endpoint families.', 'Declare a supported stereotype family before using an association.');
    if (!CLASSIFIER_FAMILY.has(source.family) || !CLASSIFIER_FAMILY.has(target.family)) return reject(normalized, 'INCOMPATIBLE_RELATIONSHIP_ENDPOINTS', 'Association requires compatible classifier endpoints.', 'Choose two Block, Interface, ValueType, or Enumeration classifiers.');
    return { allowed: true, diagnostics: [] };
  }
  if (kind === 'composition' || kind === 'sharedAggregation') {
    if (!BLOCK_FAMILY.has(source.family) || !BLOCK_FAMILY.has(target.family)) {
      const code = source.family === 'unknown' || target.family === 'unknown' ? 'UNKNOWN_STEREOTYPE_FAMILY' : 'INVALID_AGGREGATION_ENDPOINTS';
      return reject(normalized, code, `${kind} requires a Block-family whole and a Block-family part type.`, 'Declare a supported Block-family stereotype, or create a value property typed by the ValueType instead.');
    }
    return { allowed: true, diagnostics: [] };
  }
  if (kind === 'generalization') {
    const compatible = (BLOCK_FAMILY.has(source.family) && BLOCK_FAMILY.has(target.family)) || source.family === target.family && ['interface', 'valueType', 'enumeration'].includes(source.family);
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
    if ((!BLOCK_FAMILY.has(source.family) && source.family !== 'part') || target.family !== 'requirement') return reject(normalized, 'INVALID_SATISFY_DIRECTION', 'Satisfy requires a Block-family definition or Part usage to a Requirement.', 'Connect the design element or Part to a Requirement.');
    return { allowed: true, diagnostics: [] };
  }
  if (kind === 'verify') {
    if (source.family !== 'verificationCase' || target.family !== 'requirement') return reject(normalized, 'INVALID_VERIFY_DIRECTION', 'Verify requires a Verification Case to a Requirement.', 'Connect a Verification Case to the Requirement it verifies.');
    return { allowed: true, diagnostics: [] };
  }
  if (kind === 'refine') {
    if (source.family === 'requirement' || target.family !== 'requirement') return reject(normalized, 'INVALID_REFINE_DIRECTION', 'Refine requires a non-Requirement model element to a Requirement.', 'Connect a model element to the Requirement it refines.');
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
  return reject(normalized, 'UNSUPPORTED_RELATIONSHIP_KIND', `Relationship kind ${kind} is not supported by the SysML 1.6 profile.`, 'Choose a supported SysML relationship.');
}

function fromLegacyKind(kind: string | undefined): SysmlEndpointFamily {
  switch ((kind || '').toLowerCase()) {
    case 'block': return 'block';
    case 'interfaceblock': return 'interfaceBlock';
    case 'interface': return 'interface';
    case 'valuetype': return 'valueType';
    case 'enumeration': case 'enum': return 'enumeration';
    case 'requirement': return 'requirement';
    case 'verificationcase': case 'verification case': return 'verificationCase';
    case 'part': case 'usage': return 'part';
    case 'port': return 'port';
    case 'valueparameter': case 'value parameter': case 'constraintparameter': return 'valueParameter';
    default: return 'unknown';
  }
}

export function classifyLegacyEndpoint(endpoint: unknown): ConnectionEndpoint {
  const value = endpoint as Partial<BlockData & PartData> & { kind?: string; stereotype?: string; ownerId?: string };
  const family = fromLegacyKind(value.stereotype || value.kind);
  return { id: String(value.id || ''), name: String(value.name || value.id || ''), family, ownerId: value.ownerId };
}

export function classifyCanonicalEndpoint(endpoint: unknown): ConnectionEndpoint {
  const value = endpoint as Partial<SysmlEntity | SysmlUsage> & { kind?: string; stereotype?: string; ownerId?: string; metaclass?: string };
  const family = fromLegacyKind(value.stereotype || value.metaclass || value.kind);
  return { id: String(value.id || ''), name: String(value.name || value.id || ''), family, ownerId: value.ownerId };
}
