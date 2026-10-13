import type { ConnectorUsage, ParametricEnd, PropertyDefinition, SysmlRepository } from './model';
import type { SysmlDiagnostic } from './validation';
import { isSameOrSubtype } from './policy';

/**
 * Parametric diagram semantics (OMG SysML 1.6 Clause 10). The context is a
 * Block; its constraint properties are usages of ConstraintBlocks, and binding
 * connectors equate a value property with a constraint parameter (or two value
 * properties). The ends of such a binding are `ParametricEnd`s.
 */
export function isParametricEnd(end: unknown): end is ParametricEnd {
  return typeof end === 'object' && end !== null && 'propertyId' in end;
}

export function isParametricBinding(connector: ConnectorUsage): boolean {
  return connector.kind === 'binding' && (isParametricEnd(connector.sourceEnd) || isParametricEnd(connector.targetEnd));
}

export interface ResolvedParametricEnd {
  property: PropertyDefinition;
  /** Type of the value this end carries: the property's type, or the bound parameter's type. */
  typeId: string;
  parameterName?: string;
}

const diag = (code: string, elementId: string, propertyPath: string | undefined, message: string): SysmlDiagnostic =>
  ({ code, severity: 'error', elementId, propertyPath, message });

export function resolveParametricEnd(
  repo: SysmlRepository, contextId: string, end: ParametricEnd | undefined, which: 'sourceEnd' | 'targetEnd', connectorId: string,
): { resolved?: ResolvedParametricEnd; diagnostics: SysmlDiagnostic[] } {
  if (!end) return { diagnostics: [diag('MISSING_CONNECTOR_ENDPOINT', connectorId, which, 'A parametric binding needs both ends')] };
  const context = repo.definitions[contextId];
  if (context?.kind !== 'block') {
    return { diagnostics: [diag('INVALID_PARAMETRIC_CONTEXT', connectorId, 'ownerId', 'A parametric diagram belongs to a Block')] };
  }
  const property = context.properties.find(candidate => candidate.id === end.propertyId);
  if (!property) {
    return { diagnostics: [diag('MISSING_CONNECTOR_ENDPOINT', connectorId, which, `Property ${end.propertyId} is not a property of ${context.name}`)] };
  }
  if (property.kind === 'constraint') {
    const constraintBlock = repo.definitions[property.typeId];
    if (constraintBlock?.kind !== 'constraintBlock') {
      return { diagnostics: [diag('MISSING_PROPERTY_TYPE', property.id, 'typeId', `Constraint property ${property.name} is not typed by a ConstraintBlock`)] };
    }
    if (!end.parameterId) {
      return { diagnostics: [diag('PARAMETRIC_END_REQUIRES_PARAMETER', connectorId, which, `Bind a parameter of ${constraintBlock.name}, not the constraint property itself`)] };
    }
    const parameter = constraintBlock.parameters.find(candidate => candidate.id === end.parameterId);
    if (!parameter) {
      return { diagnostics: [diag('UNKNOWN_CONSTRAINT_PARAMETER', connectorId, which, `${constraintBlock.name} has no parameter ${end.parameterId}`)] };
    }
    return { resolved: { property, typeId: parameter.typeId, parameterName: parameter.name }, diagnostics: [] };
  }
  if (property.kind !== 'value') {
    return { diagnostics: [diag('INVALID_PARAMETRIC_END', connectorId, which, `${property.name} is a ${property.kind} property; only value and constraint properties can be bound`)] };
  }
  if (end.parameterId) {
    return { diagnostics: [diag('UNKNOWN_CONSTRAINT_PARAMETER', connectorId, which, `${property.name} is a value property and has no parameters`)] };
  }
  return { resolved: { property, typeId: property.typeId }, diagnostics: [] };
}

/** A bound value must have the same type at both ends, or a subtype at one (SysML 1.6 §10.3.2.3). */
function typesBindable(repo: SysmlRepository, a: string, b: string): boolean {
  return isSameOrSubtype(repo, a, b) || isSameOrSubtype(repo, b, a);
}

export function validateParametricBinding(repo: SysmlRepository, connector: ConnectorUsage): SysmlDiagnostic[] {
  const sourceEnd = isParametricEnd(connector.sourceEnd) ? connector.sourceEnd : undefined;
  const targetEnd = isParametricEnd(connector.targetEnd) ? connector.targetEnd : undefined;
  const source = resolveParametricEnd(repo, connector.ownerId, sourceEnd, 'sourceEnd', connector.id);
  const target = resolveParametricEnd(repo, connector.ownerId, targetEnd, 'targetEnd', connector.id);
  const diagnostics = [...source.diagnostics, ...target.diagnostics];
  if (!source.resolved || !target.resolved) return diagnostics;

  const sameEnd = sourceEnd!.propertyId === targetEnd!.propertyId
    && sourceEnd!.parameterId === targetEnd!.parameterId;
  if (sameEnd) diagnostics.push(diag('SELF_CONNECTOR', connector.id, 'targetEnd', 'A binding cannot bind a value to itself'));
  if (!typesBindable(repo, source.resolved.typeId, target.resolved.typeId)) {
    diagnostics.push(diag('INCOMPATIBLE_BINDING_TYPE', connector.id, 'targetEnd',
      `Binding connector cannot bind incompatible types ${source.resolved.typeId} and ${target.resolved.typeId}`));
  }
  const key = (end: ParametricEnd) => `${end.propertyId}#${end.parameterId ?? ''}`;
  const here = [key(sourceEnd!), key(targetEnd!)].sort().join('|');
  const duplicate = Object.values(repo.connectors).find(other => other.id !== connector.id && isParametricBinding(other)
    && other.ownerId === connector.ownerId && isParametricEnd(other.sourceEnd) && isParametricEnd(other.targetEnd)
    && [key(other.sourceEnd), key(other.targetEnd)].sort().join('|') === here);
  if (duplicate) diagnostics.push(diag('DUPLICATE_CONNECTOR', connector.id, undefined, `Binding duplicates ${duplicate.id}`));
  return diagnostics;
}
