import { describe, expect, it } from 'vitest';
import { createEmptyRepository, type BlockDefinition, type SysmlRepository } from '../engine/sysml/model';
import {
  buildCreateOwnedPortCommand,
  buildCreateOwnedPropertyCommand,
  createOwnedPort,
  createPortDefinitionFromIntent,
  type CreateOwnedPortIntent,
  type CreateOwnedPropertyIntent,
} from './sysmlOwnedFeatureCommands';

function createFixture(): SysmlRepository {
  const repo = createEmptyRepository();
  repo.definitions.canBus = {
    id: 'canBus',
    name: 'CANBusInterface',
    namespace: [],
    kind: 'interface',
    features: ['baudRate'],
  };
  repo.definitions.voltage = {
    id: 'voltage',
    name: 'Voltage',
    namespace: [],
    kind: 'valueType',
    unit: 'V',
  };
  repo.definitions.motor = {
    id: 'motor',
    name: 'Motor',
    namespace: [],
    kind: 'block',
    isAbstract: false,
    isLeaf: false,
    supertypeIds: [],
    properties: [],
    ports: [],
    operations: [],
    constraints: [],
  };
  repo.definitions.vehicle = {
    id: 'vehicle',
    name: 'Vehicle',
    namespace: [],
    kind: 'block',
    isAbstract: false,
    isLeaf: false,
    supertypeIds: [],
    properties: [],
    ports: [],
    operations: [],
    constraints: [],
  };
  return repo;
}

describe('SysML Owned Feature Commands', () => {
  it('maps all four Port kinds to canonical and live representations with no implicit stereotypes', () => {
    const repo = createFixture();

    // 1. umlPort -> standard
    const umlRes = buildCreateOwnedPortCommand(repo, {
      ownerBlockId: 'vehicle',
      portKind: 'umlPort',
      typeId: 'voltage',
    });
    expect(umlRes.ok).toBe(true);
    expect(umlRes.command?.type).toBe('createOwnedFeature');
    expect(umlRes.command?.intent.featureKind).toBe('port');
    const umlPort = createPortDefinitionFromIntent(repo.definitions.vehicle as BlockDefinition, umlRes.command!.intent as any);
    expect(umlPort.kind).toBe('standard');
    expect(umlPort.portKind).toBe('umlPort');
    expect(umlPort.appliedStereotypeIds ?? []).toHaveLength(0);

    // 2. proxyPort -> proxy (requires InterfaceBlock / interface)
    const proxyRes = buildCreateOwnedPortCommand(repo, {
      ownerBlockId: 'vehicle',
      portKind: 'proxyPort',
      typeId: 'canBus',
    });
    expect(proxyRes.ok).toBe(true);
    const proxyPort = createPortDefinitionFromIntent(repo.definitions.vehicle as BlockDefinition, proxyRes.command!.intent as any);
    expect(proxyPort.kind).toBe('proxy');
    expect(proxyPort.portKind).toBe('proxyPort');

    // 3. fullPort -> full
    const fullRes = buildCreateOwnedPortCommand(repo, {
      ownerBlockId: 'vehicle',
      portKind: 'fullPort',
      typeId: 'motor',
    });
    expect(fullRes.ok).toBe(true);
    const fullPort = createPortDefinitionFromIntent(repo.definitions.vehicle as BlockDefinition, fullRes.command!.intent as any);
    expect(fullPort.kind).toBe('full');
    expect(fullPort.portKind).toBe('fullPort');

    // 4. flowPort -> flow
    const flowRes = buildCreateOwnedPortCommand(repo, {
      ownerBlockId: 'vehicle',
      portKind: 'flowPort',
      typeId: 'canBus',
    });
    expect(flowRes.ok).toBe(true);
    const flowPort = createPortDefinitionFromIntent(repo.definitions.vehicle as BlockDefinition, flowRes.command!.intent as any);
    expect(flowPort.kind).toBe('flow');
    expect(flowPort.portKind).toBe('flowPort');
  });

  it('rejects ProxyPort without InterfaceBlock typing', () => {
    const repo = createFixture();

    // Attempting to type ProxyPort with a standard Block 'motor'
    const result = buildCreateOwnedPortCommand(repo, {
      ownerBlockId: 'vehicle',
      portKind: 'proxyPort',
      typeId: 'motor',
    });
    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'INVALID_PROXY_PORT_TYPE' }),
      ]),
    );
  });

  it('returns TYPE_NOT_FOUND, candidates, and CreateNewType action when typeId is missing or unresolvable', () => {
    const repo = createFixture();

    const result = buildCreateOwnedPortCommand(repo, {
      ownerBlockId: 'vehicle',
      portKind: 'proxyPort',
      // no typeId
    });

    expect(result).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'TYPE_NOT_FOUND' }],
      action: { kind: 'CreateNewType' },
    });
    expect(result.candidates).toBeDefined();
    expect(result.candidates!.every(candidate => candidate.id in repo.definitions)).toBe(true);
  });

  it('builds equivalent semantic patches for tree and canvas intents', () => {
    const repo = createFixture();

    const treeIntent: CreateOwnedPortIntent = {
      ownerBlockId: 'vehicle',
      portKind: 'umlPort',
      typeId: 'voltage',
    };
    const canvasIntent: CreateOwnedPortIntent = {
      ownerBlockId: 'vehicle',
      portKind: 'umlPort',
      typeId: 'voltage',
      diagramId: 'bdd-1',
      presentation: { x: 100, y: 150 },
    };

    const treeCmd = buildCreateOwnedPortCommand(repo, treeIntent);
    const canvasCmd = buildCreateOwnedPortCommand(repo, canvasIntent);

    expect(treeCmd.ok).toBe(true);
    expect(canvasCmd.ok).toBe(true);

    expect(treeCmd.command?.intent.featureKind).toBe('port');
    expect(canvasCmd.command?.intent.featureKind).toBe('port');
    if (treeCmd.command?.intent.featureKind === 'port' && canvasCmd.command?.intent.featureKind === 'port') {
      expect(treeCmd.command.intent.portKind).toBe(canvasCmd.command.intent.portKind);
      expect(treeCmd.command.intent.typeId).toBe(canvasCmd.command.intent.typeId);
    }

    // Canvas intent includes presentation metadata
    expect(canvasCmd.command?.presentation).toEqual({ x: 100, y: 150 });
    expect(treeCmd.command?.presentation).toBeUndefined();
  });

  it('supports creating typed owned properties', () => {
    const repo = createFixture();

    const partRes = buildCreateOwnedPropertyCommand(repo, {
      ownerBlockId: 'vehicle',
      propertyKind: 'part',
      typeId: 'motor',
    });
    expect(partRes.ok).toBe(true);
    expect(partRes.command?.type).toBe('createOwnedFeature');
    expect(partRes.command?.intent.featureKind).toBe('property');
    if (partRes.command?.intent.featureKind === 'property') {
      expect(partRes.command.intent.propertyKind).toBe('part');
      expect(partRes.command.intent.typeId).toBe('motor');
    }

    const valueRes = buildCreateOwnedPropertyCommand(repo, {
      ownerBlockId: 'vehicle',
      propertyKind: 'value',
      typeId: 'voltage',
    });
    expect(valueRes.ok).toBe(true);
    expect(valueRes.command?.type).toBe('createOwnedFeature');
    expect(valueRes.command?.intent.featureKind).toBe('property');
    if (valueRes.command?.intent.featureKind === 'property') {
      expect(valueRes.command.intent.propertyKind).toBe('value');
      expect(valueRes.command.intent.typeId).toBe('voltage');
    }
  });

  it('rejects owned feature creation when owner block is not found', () => {
    const repo = createFixture();

    const res = buildCreateOwnedPortCommand(repo, {
      ownerBlockId: 'nonexistent-block',
      portKind: 'umlPort',
      typeId: 'voltage',
    });
    expect(res.ok).toBe(false);
    expect(res.diagnostics[0]?.code).toBe('ELEMENT_NOT_FOUND');
  });

  it('implements createOwnedPort helper that creates port and validates against repository', () => {
    const repo = createFixture();

    const stdRes = createOwnedPort(repo, {
      ownerBlockId: 'vehicle',
      portKind: 'umlPort',
      typeId: 'voltage',
    });
    expect(stdRes.element?.portKind).toBe('umlPort');

    const badProxy = createOwnedPort(repo, {
      ownerBlockId: 'vehicle',
      portKind: 'proxyPort',
      typeId: 'motor',
    });
    expect(badProxy.diagnostics[0]?.code).toBe('INVALID_PROXY_PORT_TYPE');
  });

  it('returns a typed createOwnedFeature command without attaching undeclared fields to updateElement', () => {
    const repo = createFixture();
    const plan = buildCreateOwnedPortCommand(repo, {
      ownerBlockId: 'vehicle',
      portKind: 'umlPort',
      typeId: 'voltage',
      diagramId: 'bdd',
      presentation: { x: 10, y: 20 },
    });
    expect(plan.ok).toBe(true);
    expect(plan.command).toEqual({
      type: 'createOwnedFeature',
      intent: expect.objectContaining({ featureKind: 'port', ownerBlockId: 'vehicle' }),
      diagramId: 'bdd',
      presentation: expect.any(Object),
    });
  });
});

