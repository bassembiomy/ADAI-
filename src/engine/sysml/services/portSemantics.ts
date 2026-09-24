import type { Port, PortKind } from '../domain/ports';
import type { Multiplicity, SemanticElement } from '../domain/base';
import type { InterfaceBlock } from '../domain/classifiers';

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

  // Extract declared interfaces from InterfaceBlock
  let baseProvided: string[] = [];
  let baseRequired: string[] = [];

  if (typeElement.metaclass === 'InterfaceBlock') {
    const ifBlock = typeElement as InterfaceBlock;
    const custom = ifBlock.customProperties ?? {};
    if (Array.isArray(custom.providedInterfaceIds)) {
      baseProvided = custom.providedInterfaceIds as string[];
    }
    if (Array.isArray(custom.requiredInterfaceIds)) {
      baseRequired = custom.requiredInterfaceIds as string[];
    }
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
