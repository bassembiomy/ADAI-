import { describe, expect, it } from 'vitest';
import {
  createPort,
  effectiveFlowDirection,
  getProvidedRequiredInterfaces,
} from '../services/portSemantics';
import {
  PORT_DIAGNOSTICS,
  validatePort,
  type PortValidationContext,
} from './portRules';
import type { Port } from '../domain/ports';
import type { SemanticElement } from '../domain/base';
import type { Block, InterfaceBlock } from '../domain/classifiers';

describe('UML and SysML Port Semantics and Rules', () => {
  const elements: Record<string, SemanticElement> = {
    'blk-controller': {
      id: 'blk-controller',
      name: 'Controller',
      metaclass: 'Block',
      namespace: [],
      ownerId: null,
    } as Block,
    'ifb-can': {
      id: 'ifb-can',
      name: 'CANBusInterface',
      metaclass: 'InterfaceBlock',
      namespace: [],
      ownerId: null,
    } as InterfaceBlock,
  };

  const context: PortValidationContext = {
    getElement: (id: string) => elements[id],
  };

  it('creates a generic UML port with no implicit SysML stereotype by default', () => {
    const port = createPort({
      id: 'port-1',
      name: 'standardPort',
      namespace: ['System'],
      ownerId: 'blk-controller',
      typeId: 'ifb-can',
    });

    expect(port.portKind).toBe('umlPort');
    expect(port.appliedStereotypeIds ?? []).toHaveLength(0);
  });

  it('rejects mutual exclusion conflicts between ProxyPort and FullPort', () => {
    const conflictedPort: Port = {
      id: 'port-conflicted',
      name: 'badPort',
      metaclass: 'Port',
      portKind: 'proxyPort',
      appliedStereotypeIds: ['FullPort'], // conflicting stereotype
      namespace: [],
      ownerId: 'blk-controller',
      typeId: 'ifb-can',
      direction: 'inout',
      isConjugated: false,
      multiplicity: { lower: 1, upper: 1, ordered: false, unique: true },
    };

    const diagnostics = validatePort(conflictedPort, context);
    expect(diagnostics.some(d => d.code === PORT_DIAGNOSTICS.PORT_SPECIALIZATION_CONFLICT)).toBe(true);
  });

  it('rejects ProxyPort typed by a Block and accepts ProxyPort typed by an InterfaceBlock', () => {
    const invalidProxyPort: Port = {
      id: 'port-proxy-block',
      name: 'p1',
      metaclass: 'Port',
      portKind: 'proxyPort',
      namespace: [],
      ownerId: 'blk-controller',
      typeId: 'blk-controller', // Invalid: Block cannot type a ProxyPort
      direction: 'in',
      isConjugated: false,
      multiplicity: { lower: 1, upper: 1, ordered: false, unique: true },
    };

    const invalidDiag = validatePort(invalidProxyPort, context);
    expect(invalidDiag.some(d => d.code === PORT_DIAGNOSTICS.PROXY_PORT_TYPE_NOT_INTERFACE_BLOCK)).toBe(true);

    const validProxyPort: Port = {
      ...invalidProxyPort,
      id: 'port-proxy-valid',
      typeId: 'ifb-can', // Valid: InterfaceBlock
    };

    const validDiag = validatePort(validProxyPort, context);
    expect(validDiag.filter(d => d.severity === 'error')).toHaveLength(0);
  });

  it('rejects invalid nested ports on a ProxyPort', () => {
    const nestedFullPort: Port = {
      id: 'port-nested-full',
      name: 'innerFull',
      metaclass: 'Port',
      portKind: 'fullPort',
      namespace: [],
      ownerId: 'port-proxy-valid', // Nested inside a ProxyPort!
      typeId: 'ifb-can',
      direction: 'in',
      isConjugated: false,
      multiplicity: { lower: 1, upper: 1, ordered: false, unique: true },
    };

    const parentPort: Port = {
      id: 'port-proxy-valid',
      name: 'parentProxy',
      metaclass: 'Port',
      portKind: 'proxyPort',
      namespace: [],
      ownerId: 'blk-controller',
      typeId: 'ifb-can',
      direction: 'in',
      isConjugated: false,
      multiplicity: { lower: 1, upper: 1, ordered: false, unique: true },
    };

    const nestedContext: PortValidationContext = {
      getElement: (id: string) => (id === 'port-proxy-valid' ? parentPort : elements[id]),
    };

    const diagnostics = validatePort(nestedFullPort, nestedContext);
    expect(diagnostics.some(d => d.code === PORT_DIAGNOSTICS.INVALID_NESTED_PROXY_PORT)).toBe(true);
  });

  it('calculates effective flow direction correctly including recursive conjugation', () => {
    const port: Port = {
      id: 'port-flow',
      name: 'dataPort',
      metaclass: 'Port',
      portKind: 'proxyPort',
      namespace: [],
      ownerId: 'blk-controller',
      typeId: 'ifb-can',
      direction: 'in',
      isConjugated: false,
      multiplicity: { lower: 1, upper: 1, ordered: false, unique: true },
    };

    // Non-conjugated parent, non-conjugated port -> in
    expect(effectiveFlowDirection(port, false)).toBe('in');

    // Conjugated port -> out
    expect(effectiveFlowDirection({ ...port, isConjugated: true }, false)).toBe('out');

    // Conjugated parent + conjugated port -> back to in (recursive conjugation)
    expect(effectiveFlowDirection({ ...port, isConjugated: true }, true)).toBe('in');

    // inout remains inout
    expect(effectiveFlowDirection({ ...port, direction: 'inout', isConjugated: true }, false)).toBe('inout');
  });

  it('resolves provided and required interfaces based on conjugation', () => {
    const ifaceBlock: InterfaceBlock = {
      id: 'ifb-sensor',
      name: 'SensorIF',
      metaclass: 'InterfaceBlock',
      namespace: [],
      ownerId: null,
      customProperties: {
        providedInterfaceIds: ['if-read'],
        requiredInterfaceIds: ['if-power'],
      },
    };

    const testContext: PortValidationContext = {
      getElement: (id: string) => (id === 'ifb-sensor' ? ifaceBlock : elements[id]),
    };

    const regularPort: Port = {
      id: 'port-reg',
      name: 'p',
      metaclass: 'Port',
      portKind: 'proxyPort',
      namespace: [],
      ownerId: 'blk-controller',
      typeId: 'ifb-sensor',
      direction: 'inout',
      isConjugated: false,
      multiplicity: { lower: 1, upper: 1, ordered: false, unique: true },
    };

    const regular = getProvidedRequiredInterfaces(regularPort, testContext);
    expect(regular.provided).toEqual(['if-read']);
    expect(regular.required).toEqual(['if-power']);

    const conjugatedPort: Port = {
      ...regularPort,
      isConjugated: true,
    };
    const conjugated = getProvidedRequiredInterfaces(conjugatedPort, testContext);
    expect(conjugated.provided).toEqual(['if-power']); // inverted!
    expect(conjugated.required).toEqual(['if-read']);
  });
});
