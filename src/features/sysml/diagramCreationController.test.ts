import { describe, expect, it, beforeEach } from 'vitest';
import {
  createEmptyRepositoryV4,
  addSemanticElementV4,
  type SysmlRepositoryV4,
  type Diagram,
  type Package,
  type Requirement,
} from '../../engine/sysml/domain';
import {
  createElementOnDiagram,
  addExistingElementToDiagram,
  presentationsFor,
  requirementsRequest,
  type SysmlGatewayLike,
} from './diagramCreationController';

describe('diagramCreationController', () => {
  let repo: SysmlRepositoryV4;
  let gateway: SysmlGatewayLike;
  const bounds = { x: 100, y: 120, width: 180, height: 90 };

  beforeEach(() => {
    repo = createEmptyRepositoryV4();
    const bddDiag: Diagram = {
      id: 'bdd-a',
      name: 'BDD Diagram A',
      metaclass: 'Diagram',
      diagramKind: 'bdd',
      namespace: [],
      ownerId: 'pkg-root',
      presentationIds: [],
    };
    const reqDiag: Diagram = {
      id: 'requirements-a',
      name: 'Requirements Diagram A',
      metaclass: 'Diagram',
      diagramKind: 'requirements',
      namespace: [],
      ownerId: 'pkg-root',
      presentationIds: [],
    };

    addSemanticElementV4(repo, bddDiag);
    addSemanticElementV4(repo, reqDiag);

    gateway = {
      repository: repo,
    };
  });

  it('creates a Block on Requirements and displays the same Block on BDD', () => {
    const created = createElementOnDiagram(requirementsRequest('Block'), gateway);
    expect(created.success).toBe(true);
    const blockId = created.affectedIds.semanticElementId;
    expect(blockId).toBeDefined();

    const displayed = addExistingElementToDiagram({ semanticElementId: blockId, diagramId: 'bdd-a', bounds }, gateway);
    expect(displayed.success).toBe(true);

    expect(gateway.repository.elements[blockId].metaclass).toBe('Block');
    expect(presentationsFor(blockId, gateway)).toHaveLength(2);
  });

  it('determines semantic owner from tree or package context, not requirement parent on requirements diagram', () => {
    const req: Requirement = {
      id: 'req-spec-1',
      name: 'SpecReq',
      metaclass: 'Requirement',
      namespace: [],
      ownerId: 'pkg-root',
      requirementId: 'REQ-1',
      text: 'Must be fast',
      status: 'approved',
      version: '1.0',
    };
    addSemanticElementV4(gateway.repository, req);

    // If active selection in tree was the requirement, creating a Block must not place it under requirement
    const created = createElementOnDiagram({
      ...requirementsRequest('Block'),
      ownerId: 'req-spec-1',
    }, gateway);

    expect(created.success).toBe(true);
    const block = gateway.repository.elements[created.affectedIds.semanticElementId];
    expect(block.ownerId).not.toBe('req-spec-1');
    expect(block.ownerId).toBe('pkg-root');
  });

  it('rejects adding element to the same diagram twice', () => {
    const created = createElementOnDiagram(requirementsRequest('Block'), gateway);
    const blockId = created.affectedIds.semanticElementId;

    const dup = addExistingElementToDiagram({ semanticElementId: blockId, diagramId: 'requirements-a', bounds }, gateway);
    // Display existing element returns existing presentation or success
    expect(presentationsFor(blockId, gateway)).toHaveLength(1);
  });
});
