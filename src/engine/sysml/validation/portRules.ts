import type { Port } from '../domain/ports';
import type { SemanticElement } from '../domain/base';
import type { SysmlDiagnostic } from '../validation';

export const PORT_DIAGNOSTICS = {
  PROXY_PORT_TYPE_NOT_INTERFACE_BLOCK: 'PROXY_PORT_TYPE_NOT_INTERFACE_BLOCK',
  PORT_SPECIALIZATION_CONFLICT: 'PORT_SPECIALIZATION_CONFLICT',
  INVALID_NESTED_PROXY_PORT: 'INVALID_NESTED_PROXY_PORT',
} as const;

export interface PortValidationContext {
  getElement: (id: string) => SemanticElement | undefined;
}

export function validatePort(port: Port, context: PortValidationContext): SysmlDiagnostic[] {
  const diagnostics: SysmlDiagnostic[] = [];

  // 1. Mutual exclusion between ProxyPort and FullPort
  const isProxy = port.portKind === 'proxyPort' || port.appliedStereotypeIds?.includes('ProxyPort');
  const isFull = port.portKind === 'fullPort' || port.appliedStereotypeIds?.includes('FullPort');

  if (isProxy && isFull) {
    diagnostics.push({
      code: PORT_DIAGNOSTICS.PORT_SPECIALIZATION_CONFLICT,
      severity: 'error',
      message: `Port "${port.name || port.id}" cannot be both a ProxyPort and a FullPort (SysML 1.6 Clause 9.3.2.8 / 9.3.2.12).`,
      elementId: port.id,
    });
  }

  // 2. Reject ProxyPort typed by a Block; accept InterfaceBlock
  if (port.portKind === 'proxyPort' && port.typeId) {
    const typeElement = context.getElement(port.typeId);
    if (typeElement) {
      if (typeElement.metaclass === 'Block') {
        diagnostics.push({
          code: PORT_DIAGNOSTICS.PROXY_PORT_TYPE_NOT_INTERFACE_BLOCK,
          severity: 'error',
          message: `ProxyPort "${port.name || port.id}" cannot be typed by Block "${typeElement.name}". ProxyPorts must be typed by an InterfaceBlock (SysML 1.6 Clause 9.3.2.12).`,
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

  return diagnostics;
}
