import { describe, expect, it, beforeEach } from 'vitest';
import {
  createEmptyRepositoryV4,
  addSemanticElementV4,
  type SysmlRepositoryV4,
  type Block,
  type InterfaceBlock,
} from '../../engine/sysml/domain';
import {
  createOwnedFeature,
  updateOwnedFeature,
  deleteOwnedFeature,
  allFeatureProjections,
  type CreateOwnedFeatureRequest,
  type SysmlGatewayLike,
} from './semanticFeatureController';

describe('semanticFeatureController', () => {
  let repo: SysmlRepositoryV4;
  let gateway: SysmlGatewayLike;
  let block: Block;
  let ifBlock: InterfaceBlock;

  beforeEach(() => {
    repo = createEmptyRepositoryV4();
    block = {
      id: 'block-motor',
      name: 'Motor',
      metaclass: 'Block',
      namespace: [],
      ownerId: 'pkg-root',
      isAbstract: false,
      isLeaf: false,
    };
    ifBlock = {
      id: 'if-can',
      name: 'CANBusInterface',
      metaclass: 'InterfaceBlock',
      namespace: [],
      ownerId: 'pkg-root',
      isAbstract: false,
      isLeaf: false,
    };

    addSemanticElementV4(repo, block);
    addSemanticElementV4(repo, ifBlock);

    gateway = {
      repository: repo,
    };
  });

  const proxyPortRequest: CreateOwnedFeatureRequest = {
    ownerId: 'block-motor',
    featureKind: 'Port',
    portKind: 'proxyPort',
    name: 'pBus',
    typeId: 'if-can',
  };

  it('edits one Port identity from tree, BDD compartment, IBD, and specification view', () => {
    const createResult = createOwnedFeature(proxyPortRequest, gateway);
    expect(createResult.success).toBe(true);
    const portId = createResult.affectedIds![0];
    expect(portId).toBeDefined();

    const updateResult = updateOwnedFeature({ featureId: portId, patch: { name: 'canBus' } }, gateway);
    expect(updateResult.success).toBe(true);

    const projections = allFeatureProjections(portId, gateway);
    expect(projections.length).toBeGreaterThanOrEqual(4);
    expect(projections.every(view => view.name === 'canBus')).toBe(true);
  });

  it('rejects ProxyPort creation with TYPE_NOT_FOUND when InterfaceBlock type is missing', () => {
    const invalidRequest: CreateOwnedFeatureRequest = {
      ownerId: 'block-motor',
      featureKind: 'Port',
      portKind: 'proxyPort',
      name: 'pMissing',
      typeId: 'non-existent-type',
    };

    const result = createOwnedFeature(invalidRequest, gateway);
    expect(result.success).toBe(false);
    expect(result.code).toBe('TYPE_NOT_FOUND');
    expect(result.candidates).toBeDefined();
    expect(result.createNewTypeAction).toMatchObject({
      metaclass: 'InterfaceBlock',
    });
  });

  it('deletes owned feature and cleans up owner references', () => {
    const createResult = createOwnedFeature(proxyPortRequest, gateway);
    const portId = createResult.affectedIds![0];

    const delResult = deleteOwnedFeature({ featureId: portId }, gateway);
    expect(delResult.success).toBe(true);
    expect(gateway.repository.elements[portId]).toBeUndefined();
    expect(gateway.repository.indexes.byOwner['block-motor'] ?? []).not.toContain(portId);
  });
});
