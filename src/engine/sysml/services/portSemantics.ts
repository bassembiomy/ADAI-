import type { Port, PortKind } from '../domain/ports';
import type { Multiplicity, SemanticElement } from '../domain/base';
import type { FlowSpecification, InterfaceBlock } from '../domain/classifiers';
import type { FlowProperty } from '../domain/properties';

export interface CreatePortInput {
  id: string;
  name: string;
  namespace?: string[];
  ownerId: string | null;
  typeId?: string;
  portKind?: PortKind;
  direction?: 'in' | 'out' | 'inout';
  isConjugated?: boolean;
  multiplicity?: Multiplicity;
  appliedStereotypeIds?: string[];
  flowSpecificationId?: string;
  isAtomicFlowPort?: boolean;
}

export function createPort(input: CreatePortInput): Port {
  return {
    id: input.id,
    name: input.name,
    metaclass: 'Port',
    portKind: input.portKind ?? 'umlPort', // Default is generic standard UML port!
    namespace: input.namespace ?? [],
    ownerId: input.ownerId,
    typeId: input.typeId ?? '',
    direction: input.direction ?? 'inout',
    isConjugated: input.isConjugated ?? false,
    multiplicity: input.multiplicity ?? { lower: 1, upper: 1, ordered: false, unique: true },
    appliedStereotypeIds: input.appliedStereotypeIds ?? [],
    ...(input.flowSpecificationId ? { flowSpecificationId: input.flowSpecificationId } : {}),
    ...(input.isAtomicFlowPort === undefined ? {} : { isAtomicFlowPort: input.isAtomicFlowPort }),
  };
}

/**
 * Computes the effective flow direction taking conjugation and parent conjugation into account.
 * Recursive conjugation: (isConjugated XOR isParentConjugated).
 */
export function effectiveFlowDirection(port: Port, isParentConjugated = false): 'in' | 'out' | 'inout' {
  if (port.direction === 'inout') return 'inout';
  const effectiveInversion = Boolean(port.isConjugated) !== Boolean(isParentConjugated);
  if (!effectiveInversion) return port.direction;
  return port.direction === 'in' ? 'out' : 'in';
}

export interface PortSemanticContext {
  getElement: (id: string) => SemanticElement | undefined;
  getOwnedElements?: (ownerId: string) => SemanticElement[];
}

export function validatePortName(
  port: Port,
  context: PortSemanticContext,
): { code: 'PORT_NAME_REQUIRED' | 'PORT_NAME_NOT_UNIQUE'; message: string } | null {
  const name = port.name.trim();
  if (!name) return { code: 'PORT_NAME_REQUIRED', message: `Port "${port.id}" must have a non-empty name.` };
  const siblings = context.getOwnedElements?.(port.ownerId ?? '') ?? [];
  const duplicate = siblings.some(element => element.id !== port.id && element.metaclass === 'Port' && element.name === name);
  return duplicate
    ? { code: 'PORT_NAME_NOT_UNIQUE', message: `Port name "${name}" is already used by another port in the same owner.` }
    : null;
}

export function validateNestedPortPath(
  pathIds: readonly string[],
  leafPortId: string,
  context: PortSemanticContext,
): { code: 'NESTED_PORT_PATH_EMPTY' | 'NESTED_PORT_PATH_INVALID'; message: string } | null {
  if (pathIds.length === 0) {
    return { code: 'NESTED_PORT_PATH_EMPTY', message: `Nested port "${leafPortId}" requires a non-empty semantic path.` };
  }
  const path = pathIds.map(id => context.getElement(id));
  if (path.some(element => !element || element.metaclass !== 'Port')) {
    return { code: 'NESTED_PORT_PATH_INVALID', message: `Nested port path for "${leafPortId}" contains a missing or non-port element.` };
  }
  for (let i = 1; i < path.length; i += 1) {
    if (path[i]?.ownerId !== path[i - 1]?.id) {
      return { code: 'NESTED_PORT_PATH_INVALID', message: `Nested port path for "${leafPortId}" is not an ownership chain.` };
    }
  }
  if (path[path.length - 1]?.id !== leafPortId) {
    return { code: 'NESTED_PORT_PATH_INVALID', message: `Nested port path does not terminate at "${leafPortId}".` };
  }
  return null;
}

export function getProvidedRequiredInterfaces(
  port: Port,
  context: PortSemanticContext
): { provided: string[]; required: string[] } {
  if (!port.typeId) {
    return { provided: [], required: [] };
  }
  const typeElement = context.getElement(port.typeId);
  if (!typeElement) {
    return { provided: [], required: [] };
  }

  // Extract declared interfaces and semantic FlowProperties from InterfaceBlock.
  let baseProvided: string[] = [];
  let baseRequired: string[] = [];

  if (typeElement.metaclass === 'InterfaceBlock') {
    const ifBlock = typeElement as InterfaceBlock;
    const custom = ifBlock.customProperties ?? {};
    baseProvided = [...(ifBlock.providedInterfaceIds ?? (Array.isArray(custom.providedInterfaceIds) ? custom.providedInterfaceIds as string[] : []))];
    baseRequired = [...(ifBlock.requiredInterfaceIds ?? (Array.isArray(custom.requiredInterfaceIds) ? custom.requiredInterfaceIds as string[] : []))];
  } else if (typeElement.metaclass === 'FlowSpecification') {
    const flow = typeElement as FlowSpecification;
    const flowProperties = (flow.flowPropertyIds ?? [])
      .map(id => context.getElement(id))
      .filter((element): element is FlowProperty => element?.metaclass === 'FlowProperty');
    baseProvided = flowProperties.filter(property => property.direction === 'out').map(property => property.id);
    baseRequired = flowProperties.filter(property => property.direction === 'in').map(property => property.id);
  }

  if (port.isConjugated) {
    // Invert: provided becomes required, required becomes provided
    return {
      provided: [...baseRequired],
      required: [...baseProvided],
    };
  }

  return {
    provided: [...baseProvided],
    required: [...baseRequired],
  };
}
