import { describe, expect, it, beforeEach } from 'vitest';
import {
  createEmptyRepositoryV4,
  addSemanticElementV4,
  type SysmlRepositoryV4,
  type Block,
  type Requirement,
  type Package,
  type Diagram,
  type DiagramPresentation,
} from './domain';
import {
  createElementOnDiagram,
  addExistingElementToDiagram,
  presentationsFor,
  type SysmlGatewayLike,
} from '../../features/sysml/diagramCreationController';
import {
  createOwnedFeature,
  type CreateOwnedFeatureRequest,
} from '../../features/sysml/semanticFeatureController';
import {
  evaluateOwnership,
  getOwnedElementCapabilities,
} from './capabilities';
import { dispatchSysmlCommand } from './commands/dispatcher';
import { elementsOfKind, presentationsForElement, migrateV3ToV4 } from './persistence/migrateV3ToV4';
import { serializeRepository, loadRepository } from './persistence';
import { createEmptyRepository } from './model';

describe('Repository-First Model Tree and Diagram Viewpoints Release Gate (Task 10)', () => {
  let repository: SysmlRepositoryV4;
  let gateway: SysmlGatewayLike;

  beforeEach(() => {
    repository = createEmptyRepositoryV4();
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
    addSemanticElementV4(repository, bddDiag);
    addSemanticElementV4(repository, reqDiag);

    gateway = {
      get repository() {
        return repository;
      },
      set repository(next: SysmlRepositoryV4) {
        repository = next;
      },
    };
  });

  it('preserves one Block identity from Requirements Diagram to BDD', () => {
    // 1. Create a Block on Requirements Diagram
    const created = createElementOnDiagram({
      metaclass: 'Block',
      diagramId: 'requirements-a',
      name: 'motor',
      ownerId: 'pkg-root',
      id: 'motor',
    }, gateway);
    expect(created.success).toBe(true);

    // 2. Rename Block to BLDCMotor
    const renameRes = dispatchSysmlCommand(repository, {
      type: 'RenameElement',
      elementId: 'motor',
      newName: 'BLDCMotor',
    }, { source: 'ui' });
    expect(renameRes.success).toBe(true);
    repository = renameRes.state;

    // 3. Display the exact same Block on BDD Diagram
    const displayed = addExistingElementToDiagram({
      semanticElementId: 'motor',
      diagramId: 'bdd-a',
      bounds: { x: 50, y: 50, width: 200, height: 120 },
    }, gateway);
    expect(displayed.success).toBe(true);

    // Release gate assertions
    expect(repository.elements['motor'].name).toBe('BLDCMotor');
    expect(presentationsFor('motor', repository).map(p => p.diagramId).sort()).toEqual(['bdd-a', 'requirements-a']);
    expect(elementsOfKind(repository, 'Block').filter(b => b.id === 'motor')).toHaveLength(1);
  });

  it('keeps tree capabilities and backend preflight in parity', () => {
    // Fixture elements
    const pkg: Package = {
      id: 'pkg-eng',
      name: 'Engineering',
      metaclass: 'Package',
      namespace: [],
      ownerId: 'pkg-root',
    };
    const blk: Block = {
      id: 'blk-ctrl',
      name: 'Controller',
      metaclass: 'Block',
      namespace: [],
      ownerId: 'pkg-eng',
    };
    const req: Requirement = {
      id: 'req-perf',
      name: 'PerformanceReq',
      metaclass: 'Requirement',
      namespace: [],
      ownerId: 'pkg-root',
      requirementId: 'REQ-100',
      text: 'Shall respond in <10ms',
      status: 'approved',
      version: '1.0',
    };
    addSemanticElementV4(repository, pkg);
    addSemanticElementV4(repository, blk);
    addSemanticElementV4(repository, req);

    // Preflight helper matching capability evaluation
    function preflight(owner: any, childKind: any): { allowed: boolean } {
      return evaluateOwnership(owner, childKind);
    }

    // Verify for Package owner
    const pkgCaps = getOwnedElementCapabilities(pkg, repository);
    for (const cap of pkgCaps) {
      expect(preflight(pkg, cap.metaclass).allowed).toBe(cap.allowed);
    }

    // Verify for Block owner
    const blkCaps = getOwnedElementCapabilities(blk, repository);
    for (const cap of blkCaps) {
      expect(preflight(blk, cap.metaclass).allowed).toBe(cap.allowed);
    }

    // Illegal ownership parity
    expect(preflight(req, 'Block').allowed).toBe(false);
    expect(preflight(blk, 'Requirement').allowed).toBe(false);
  });

  it('rejects silent type creation with TYPE_NOT_FOUND', () => {
    const blk: Block = {
      id: 'blk-box',
      name: 'BlackBox',
      metaclass: 'Block',
      namespace: [],
      ownerId: 'pkg-root',
    };
    addSemanticElementV4(repository, blk);

    const missingTypeReq: CreateOwnedFeatureRequest = {
      ownerId: 'blk-box',
      featureKind: 'Port',
      portKind: 'proxyPort',
      name: 'missingPort',
      typeId: 'non-existent-interface-block',
    };

    const outcome = createOwnedFeature(missingTypeReq, gateway);
    expect(outcome.success).toBe(false);
    expect(outcome.code).toBe('TYPE_NOT_FOUND');
    expect(outcome.createNewTypeAction).toBeDefined();
    expect(repository.elements['missingPort']).toBeUndefined();
  });

  it('migrates legacy repository without mutating semantic IDs and preserves presentations', () => {
    const v3 = createEmptyRepository();
    v3.definitions['blk-engine'] = {
      id: 'blk-engine',
      name: 'Engine',
      kind: 'block',
      namespace: [],
      ownerId: 'model',
      isAbstract: false,
      isLeaf: false,
      properties: [],
      ports: [],
      operations: [],
      constraints: [],
    };
    const coords = {
      'blk-engine': { x: 100, y: 150, width: 180, height: 100 },
    };
    const diags = {
      'bdd-1': { elementIds: ['blk-engine'] },
      'ibd-1': { elementIds: ['blk-engine'] },
    };

    const v4 = migrateV3ToV4(v3, coords, diags);
    expect(v4.elements['blk-engine']).toBeDefined();
    expect(v4.elements['blk-engine'].id).toBe('blk-engine');
    expect(presentationsForElement(v4, 'blk-engine')).toHaveLength(2);

    const reloaded = loadRepository(serializeRepository(v4));
    expect(elementsOfKind(reloaded, 'Block')).toHaveLength(1);
    expect(presentationsForElement(reloaded, 'blk-engine')).toHaveLength(2);
  });
});
