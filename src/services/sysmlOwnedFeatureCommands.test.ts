import { describe, expect, it } from 'vitest';
import { createEmptyRepository, type BlockDefinition, type SysmlRepository } from '../engine/sysml/model';
import {
  buildCreateOwnedPortCommand,
  buildCreateOwnedPropertyCommand,
  createOwnedPort,
  createPortDefinitionFromIntent,
  getCompatiblePortCandidates,
  getCompatiblePropertyCandidates,
  isCompatiblePortType,
  isCompatiblePropertyType,
  isInterfaceBlockDefinition,
  planOwnedPortCreation,
  planOwnedPropertyCreation,
  suggestedMetaclassForPortKind,
  suggestedMetaclassForPropertyKind,
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

  describe('Task 2 canvas parity: explicit compatibility predicates', () => {
    it('exposes InterfaceBlock detection matching the domain port validator', () => {
      const repo = createFixture();
      expect(isInterfaceBlockDefinition(repo.definitions.canBus)).toBe(true);
      expect(isInterfaceBlockDefinition(repo.definitions.motor)).toBe(false);
      expect(isInterfaceBlockDefinition(repo.definitions.voltage)).toBe(false);
    });

    it('accepts only InterfaceBlock types for ProxyPort candidates', () => {
      const repo = createFixture();
      const candidates = getCompatiblePortCandidates(repo, 'proxyPort');
      expect(candidates.map(c => c.id).sort()).toEqual(['canBus']);
      expect(isCompatiblePortType(repo.definitions.canBus, 'proxyPort')).toBe(true);
      expect(isCompatiblePortType(repo.definitions.motor, 'proxyPort')).toBe(false);
      expect(isCompatiblePortType(repo.definitions.voltage, 'proxyPort')).toBe(false);
    });

    it('excludes InterfaceBlock types from FullPort candidates', () => {
      const repo = createFixture();
      const ids = getCompatiblePortCandidates(repo, 'fullPort').map(c => c.id);
      expect(ids).toContain('motor');
      expect(ids).toContain('voltage');
      expect(ids).not.toContain('canBus');
      expect(isCompatiblePortType(repo.definitions.motor, 'fullPort')).toBe(true);
      expect(isCompatiblePortType(repo.definitions.canBus, 'fullPort')).toBe(false);
    });

    it('restricts property candidates by semantic kind, not names or ordering', () => {
      const repo = createFixture();
      const partIds = getCompatiblePropertyCandidates(repo, 'part').map(c => c.id).sort();
      const refIds = getCompatiblePropertyCandidates(repo, 'reference').map(c => c.id).sort();
      expect(partIds).toEqual(refIds);
      expect(partIds).toContain('motor');
      expect(partIds).not.toContain('voltage');
      expect(partIds).not.toContain('canBus');
      const valueIds = getCompatiblePropertyCandidates(repo, 'value').map(c => c.id);
      expect(valueIds).toEqual(['voltage']);
      expect(isCompatiblePropertyType(repo.definitions.motor, 'part')).toBe(true);
      expect(isCompatiblePropertyType(repo.definitions.voltage, 'part')).toBe(false);
      expect(isCompatiblePropertyType(repo.definitions.voltage, 'value')).toBe(true);
      expect(isCompatiblePropertyType(repo.definitions.motor, 'value')).toBe(false);
    });

    it('suggests canonical metaclasses for explicit CreateNewType actions', () => {
      expect(suggestedMetaclassForPortKind('proxyPort')).toBe('InterfaceBlock');
      expect(suggestedMetaclassForPortKind('fullPort')).toBe('Block');
      expect(suggestedMetaclassForPortKind('flowPort')).toBe('Block');
      expect(suggestedMetaclassForPortKind('umlPort')).toBe('Block');
      expect(suggestedMetaclassForPropertyKind('value')).toBe('ValueType');
      expect(suggestedMetaclassForPropertyKind('part')).toBe('Block');
      expect(suggestedMetaclassForPropertyKind('reference')).toBe('Block');
    });
  });

  describe('Task 2 canvas parity: surface-agnostic creation plans', () => {
    it('plans Standard Port as an immediate untyped UML Port command (explicit no-type exception)', () => {
      const repo = createFixture();
      const plan = planOwnedPortCreation(repo, { ownerBlockId: 'vehicle', portKind: 'umlPort' });
      expect(plan.outcome).toBe('command');
      if (plan.outcome !== 'command') return;
      expect(plan.command.type).toBe('createOwnedFeature');
      if (plan.command.intent.featureKind !== 'port') throw new Error('expected port intent');
      expect(plan.command.intent.portKind).toBe('umlPort');
      expect(plan.command.intent.typeId).toBeUndefined();
    });

    it.each(['proxyPort', 'fullPort', 'flowPort'] as const)(
      'plans canvas %s without a type as type-selection, never a silent command',
      (portKind) => {
        const repo = createFixture();
        const plan = planOwnedPortCreation(repo, {
          ownerBlockId: 'vehicle',
          portKind,
          diagramId: 'bdd-1',
          presentation: { x: 5, y: 5 },
        });
        expect(plan.outcome).toBe('typeSelection');
        if (plan.outcome !== 'typeSelection') return;
        expect(plan.request.ownerId).toBe('vehicle');
        expect(plan.request.candidates.length).toBeGreaterThan(0);
        expect(plan.request.action).toMatchObject({ kind: 'CreateNewType' });
        expect(plan.request.candidates.every(c => c.id in repo.definitions)).toBe(true);
      },
    );

    it('planning never mutates the repository, even when selection is cancelled', () => {
      const repo = createFixture();
      const before = JSON.stringify(repo);
      const plan = planOwnedPortCreation(repo, { ownerBlockId: 'vehicle', portKind: 'proxyPort' });
      expect(plan.outcome).toBe('typeSelection');
      // Cancel: no command is dispatched.
      expect(JSON.stringify(repo)).toBe(before);
    });

    it('produces identical property candidate IDs for tree and canvas intents', () => {
      const repo = createFixture();
      const cases: CreateOwnedPropertyIntent['propertyKind'][] = ['part', 'reference', 'value'];
      for (const propertyKind of cases) {
        const tree = planOwnedPropertyCreation(repo, { ownerBlockId: 'vehicle', propertyKind });
        const canvas = planOwnedPropertyCreation(repo, {
          ownerBlockId: 'vehicle',
          propertyKind,
          diagramId: 'bdd-1',
          presentation: { x: 1, y: 2 },
        });
        expect(tree.outcome).toBe('typeSelection');
        expect(canvas.outcome).toBe('typeSelection');
        if (tree.outcome !== 'typeSelection' || canvas.outcome !== 'typeSelection') continue;
        expect(canvas.request.candidates.map(c => c.id).sort())
          .toEqual(tree.request.candidates.map(c => c.id).sort());
        expect(canvas.request.action).toEqual(tree.request.action);
      }
    });

    it('produces equivalent OwnedFeatureIntent after selection on tree and canvas', () => {
      const repo = createFixture();
      const tree: CreateOwnedPropertyIntent = {
        ownerBlockId: 'vehicle', propertyKind: 'part', typeId: 'motor',
        name: 'engine', featureId: 'prop-engine', usageId: 'usage-engine',
      };
      const canvas: CreateOwnedPropertyIntent = {
        ownerBlockId: 'vehicle', propertyKind: 'part', typeId: 'motor',
        name: 'engine', featureId: 'prop-engine', usageId: 'usage-engine',
        diagramId: 'bdd-1', presentation: { x: 1, y: 2 },
      };
      const treePlan = planOwnedPropertyCreation(repo, tree);
      const canvasPlan = planOwnedPropertyCreation(repo, canvas);
      expect(treePlan.outcome).toBe('command');
      expect(canvasPlan.outcome).toBe('command');
      if (treePlan.outcome !== 'command' || canvasPlan.outcome !== 'command') return;
      expect(canvasPlan.command.intent).toEqual(treePlan.command.intent);
      expect(canvasPlan.command.diagramId).toBe('bdd-1');
      expect(canvasPlan.command.presentation).toEqual({ x: 1, y: 2 });
    });

    it('resumes port creation with the explicitly selected type and nothing else', () => {
      const repo = createFixture();
      const plan = planOwnedPortCreation(repo, { ownerBlockId: 'vehicle', portKind: 'proxyPort' });
      expect(plan.outcome).toBe('typeSelection');
      if (plan.outcome !== 'typeSelection') return;
      const selected = plan.request.candidates[0];
      const resumed = buildCreateOwnedPortCommand(repo, {
        ownerBlockId: 'vehicle', portKind: 'proxyPort', typeId: selected.id,
      });
      expect(resumed.ok).toBe(true);
      expect(resumed.command?.intent).toMatchObject({ featureKind: 'port', portKind: 'proxyPort', typeId: selected.id });
    });
  });

  describe('Task 3 contract: caller-provided IDs pass through to the gateway intent', () => {
    it('preserves caller featureId and usageId on property commands', () => {
      const repo = createFixture();
      const res = buildCreateOwnedPropertyCommand(repo, {
        ownerBlockId: 'vehicle',
        propertyKind: 'part',
        typeId: 'motor',
        name: 'engine',
        featureId: 'prop-engine',
        usageId: 'usage-engine',
      });
      expect(res.ok).toBe(true);
      if (res.command?.intent.featureKind !== 'property') throw new Error('expected property intent');
      expect(res.command.intent.featureId).toBe('prop-engine');
      expect(res.command.intent.usageId).toBe('usage-engine');
    });

    it('preserves caller featureId on port commands', () => {
      const repo = createFixture();
      const res = buildCreateOwnedPortCommand(repo, {
        ownerBlockId: 'vehicle',
        portKind: 'umlPort',
        typeId: 'voltage',
        name: 'p',
        featureId: 'port-custom-1',
      });
      expect(res.ok).toBe(true);
      if (res.command?.intent.featureKind !== 'port') throw new Error('expected port intent');
      expect(res.command.intent.featureId).toBe('port-custom-1');
    });
  });
});

