import type { Port } from '../domain/ports';
import type { SemanticElement } from '../domain/base';
import { validateNestedPortPath, validatePortName } from '../services/portSemantics';
import type { SysmlDiagnostic } from '../validation';
import { isBlockDefinition, type BlockDefinition, type SysmlRepository } from '../model';

export const PORT_DIAGNOSTICS = {
  PROXY_PORT_TYPE_NOT_INTERFACE_BLOCK: 'INVALID_PROXY_PORT_TYPE',
  INVALID_PROXY_PORT_TYPE: 'INVALID_PROXY_PORT_TYPE',
  PROXY_PORT_TYPE_REQUIRED: 'PROXY_PORT_TYPE_REQUIRED',
  PORT_SPECIALIZATION_CONFLICT: 'PROXY_AND_FULL_PORT',
  PROXY_AND_FULL_PORT: 'PROXY_AND_FULL_PORT',
  INVALID_NESTED_PROXY_PORT: 'INVALID_NESTED_PROXY_PORT',
  FLOW_PORT_TYPE_NOT_FLOW_SPECIFICATION: 'FLOW_PORT_TYPE_NOT_FLOW_SPECIFICATION',
  FLOW_PORT_DEPRECATED: 'FLOW_PORT_DEPRECATED',
  PORT_NAME_REQUIRED: 'PORT_NAME_REQUIRED',
  PORT_NAME_NOT_UNIQUE: 'PORT_NAME_NOT_UNIQUE',
  NESTED_PORT_PATH_EMPTY: 'NESTED_PORT_PATH_EMPTY',
  NESTED_PORT_PATH_INVALID: 'NESTED_PORT_PATH_INVALID',
} as const;

export interface PortValidationContext {
  getElement: (id: string) => SemanticElement | undefined;
  getOwnedElements?: (ownerId: string) => SemanticElement[];
}

export function validatePort(port: Port, context: PortValidationContext): SysmlDiagnostic[] {
  const diagnostics: SysmlDiagnostic[] = [];

  // 1. Mutual exclusion between ProxyPort and FullPort
  const isProxy = port.portKind === 'proxyPort' || port.appliedStereotypeIds?.includes('ProxyPort');
  const isFull = port.portKind === 'fullPort' || port.appliedStereotypeIds?.includes('FullPort');

  const nameDiagnostic = validatePortName(port, context);
  if (nameDiagnostic) diagnostics.push({ ...nameDiagnostic, severity: 'error', elementId: port.id });

  if (isProxy && isFull) {
    diagnostics.push({
      code: PORT_DIAGNOSTICS.PROXY_AND_FULL_PORT,
      severity: 'error',
      message: `Port "${port.name || port.id}" cannot be both a ProxyPort and a FullPort (SysML 1.6 Clause 9.3.2.8 / 9.3.2.12).`,
      elementId: port.id,
    });
  }

  // 2. ProxyPorts must be typed by an InterfaceBlock, not merely not-a-Block.
  if (port.portKind === 'proxyPort' && port.typeId) {
    const typeElement = context.getElement(port.typeId);
    const isInterfaceBlock = typeElement && (
      typeElement.metaclass === 'InterfaceBlock' ||
      (typeElement as any).kind === 'interface' ||
      (typeElement as any).stereotype === 'interfaceBlock'
    );
    if (!isInterfaceBlock) {
      diagnostics.push({
        code: PORT_DIAGNOSTICS.INVALID_PROXY_PORT_TYPE,
        severity: 'error',
        message: `ProxyPort "${port.name || port.id}" must be typed by an InterfaceBlock (SysML 1.6 Clause 9.3.2.12).`,
        elementId: port.id,
      });
    }
  }

  if (port.portKind === 'proxyPort' && !port.typeId) {
    diagnostics.push({
      code: PORT_DIAGNOSTICS.PROXY_PORT_TYPE_REQUIRED,
      severity: 'error',
      message: `ProxyPort "${port.name || port.id}" requires an InterfaceBlock type.`,
      elementId: port.id,
    });
    diagnostics.push({
      code: PORT_DIAGNOSTICS.PROXY_PORT_TYPE_NOT_INTERFACE_BLOCK,
      severity: 'error',
      message: `ProxyPort "${port.name || port.id}" requires an InterfaceBlock type.`,
      elementId: port.id,
    });
  }


  if (port.portKind === 'flowPort') {
    diagnostics.push({
      code: PORT_DIAGNOSTICS.FLOW_PORT_DEPRECATED,
      severity: 'warning',
      message: `FlowPort "${port.name || port.id}" is a legacy construct deprecated in SysML 1.6 Annex C.`,
      elementId: port.id,
    });
    if (port.flowSpecificationId) {
      const flowSpecification = context.getElement(port.flowSpecificationId);
      if (!flowSpecification || flowSpecification.metaclass !== 'FlowSpecification') {
        diagnostics.push({
          code: PORT_DIAGNOSTICS.FLOW_PORT_TYPE_NOT_FLOW_SPECIFICATION,
          severity: 'error',
          message: `FlowPort "${port.name || port.id}" must reference a FlowSpecification.`,
          elementId: port.id,
        });
      }
    }
  }


  // 3. Nested ProxyPort rules: ports nested in a ProxyPort must also be ProxyPorts
  if (port.ownerId) {
    const ownerElement = context.getElement(port.ownerId);
    if (ownerElement && ownerElement.metaclass === 'Port') {
      const parentPort = ownerElement as Port;
      if (parentPort.portKind === 'proxyPort') {
        if (port.portKind !== 'proxyPort') {
          diagnostics.push({
            code: PORT_DIAGNOSTICS.INVALID_NESTED_PROXY_PORT,
            severity: 'error',
            message: `Nested port "${port.name || port.id}" inside ProxyPort "${parentPort.name || parentPort.id}" must also be a ProxyPort.`,
            elementId: port.id,
          });
        }
      }
    }
  }

  if (port.nestedPortPathIds) {
    const pathDiagnostic = validateNestedPortPath(port.nestedPortPathIds, port.id, context);
    if (pathDiagnostic) diagnostics.push({ ...pathDiagnostic, severity: 'error', elementId: port.id });
  }

  return diagnostics;
}

export function validateRepositoryPorts(repo: SysmlRepository): SysmlDiagnostic[] {
  const diagnostics: SysmlDiagnostic[] = [];

  const portsById = new Map<string, { block: BlockDefinition; port: import('../model').PortDefinition }>(
    Object.values(repo.definitions)
      .filter(isBlockDefinition)
      .flatMap(block => (block.ports ?? []).map(port => [port.id, { block, port }] as const)),
  );

  const cyclicPortIds = new Set<string>();
  for (const [portId, { port }] of portsById.entries()) {
    const visited = new Set<string>([portId]);
    let currentParentId = port.ownerPortId;
    while (currentParentId) {
      if (visited.has(currentParentId)) {
        cyclicPortIds.add(portId);
        break;
      }
      visited.add(currentParentId);
      const parentEntry = portsById.get(currentParentId);
      currentParentId = parentEntry?.port.ownerPortId;
    }
  }

  const portElementsById = new Map<string, Port>();
  for (const [portId, { block, port }] of portsById.entries()) {
    const canonicalPortKind = (port.portKind ?? (port.kind === 'proxy' ? 'proxyPort' : port.kind === 'full' ? 'fullPort' : port.kind === 'flow' ? 'flowPort' : 'umlPort')) as any;
    const ownerId = port.ownerPortId ?? block.id;
    const nestedPortPathIds = port.nestedPortPathIds ?? (port.ownerPortId ? [port.ownerPortId, port.id] : undefined);

    const portElement: Port = {
      id: port.id,
      name: port.name,
      metaclass: 'Port',
      portKind: canonicalPortKind,
      appliedStereotypeIds: port.appliedStereotypeIds,
      typeId: port.typeId,
      direction: port.direction,
      isConjugated: port.isConjugated,
      multiplicity: port.multiplicity,
      namespace: block.namespace,
      ownerId,
      nestedPortPathIds,
    };
    portElementsById.set(portId, portElement);
  }

  const context: PortValidationContext = {
    getElement: (id: string): SemanticElement | undefined => {
      if (portElementsById.has(id)) {
        return portElementsById.get(id);
      }
      const def = repo.definitions[id];
      if (def) {
        return {
          id: def.id,
          name: def.name,
          metaclass: def.kind === 'block' ? 'Block' : def.kind === 'interface' ? 'InterfaceBlock' : 'ValueType',
          namespace: def.namespace,
          ownerId: def.ownerId,
          kind: def.kind,
        } as any;
      }
      return undefined;
    },
    getOwnedElements: (ownerId: string): SemanticElement[] => {
      return Array.from(portElementsById.values()).filter(p => p.ownerId === ownerId);
    },
  };

  for (const portId of cyclicPortIds) {
    const entry = portsById.get(portId)!;
    diagnostics.push({
      code: PORT_DIAGNOSTICS.NESTED_PORT_PATH_INVALID,
      severity: 'error',
      message: `Port "${entry.port.name || entry.port.id}" has a cyclic nesting path.`,
      elementId: portId,
    });
  }

  for (const [portId, { port }] of portsById.entries()) {
    if (port.ownerPortId && !portsById.has(port.ownerPortId)) {
      diagnostics.push({
        code: PORT_DIAGNOSTICS.NESTED_PORT_PATH_INVALID,
        severity: 'error',
        message: `Parent port "${port.ownerPortId}" does not exist for nested port "${port.name || port.id}".`,
        elementId: portId,
      });
    }
  }

  for (const portElement of portElementsById.values()) {
    diagnostics.push(...validatePort(portElement, context));
  }

  // Deduplicate diagnostics
  const seen = new Set<string>();
  return diagnostics.filter(d => {
    const key = `${d.code}:${d.elementId}:${d.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

