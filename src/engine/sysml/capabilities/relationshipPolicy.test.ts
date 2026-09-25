import { describe, expect, it, beforeEach } from 'vitest';
import {
  createEmptyRepositoryV4,
  addSemanticElementV4,
  type SysmlRepositoryV4,
  type Block,
  type Requirement,
  type Package,
  type Port,
  type SemanticRelationship,
} from '../domain';
import {
  getLegalRelationshipKinds,
  getLegalRelationshipTargets,
  validateRelationshipEndpoints,
} from './relationshipPolicy';

describe('relationshipPolicy', () => {
  let repo: SysmlRepositoryV4;
  let block: Block;
  let req1: Requirement;
  let req2: Requirement;
  let pkg: Package;
  let port: Port;

  function satisfy(sourceId: string, targetId: string): SemanticRelationship {
    return {
      id: `satisfy_${sourceId}_${targetId}`,
      metaclass: 'Satisfy',
      sourceId,
      targetId,
    };
  }

  beforeEach(() => {
    repo = createEmptyRepositoryV4();

    pkg = {
      id: 'pkg-1',
      name: 'Powertrain',
      metaclass: 'Package',
      namespace: [],
      ownerId: 'pkg-root',
    };

    block = {
      id: 'block-motor',
      name: 'Motor',
      metaclass: 'Block',
      namespace: [],
      ownerId: 'pkg-1',
      isAbstract: false,
      isLeaf: false,
    };

    req1 = {
      id: 'req-torque',
      name: 'TorqueRequirement',
      metaclass: 'Requirement',
      namespace: [],
      ownerId: 'pkg-root',
      requirementId: 'REQ-001',
      text: 'Motor shall provide 200Nm torque',
      status: 'approved',
      version: '1.0',
    };

    req2 = {
      id: 'req-safety',
      name: 'SafetyRequirement',
      metaclass: 'Requirement',
      namespace: [],
      ownerId: 'pkg-root',
      requirementId: 'REQ-002',
      text: 'Motor shall shut down on fault',
      status: 'draft',
      version: '1.0',
    };

    port = {
      id: 'port-power',
      name: 'pPower',
      metaclass: 'Port',
      portKind: 'umlPort',
      namespace: [],
      ownerId: 'block-motor',
      typeId: '',
      direction: 'in',
      isConjugated: false,
      isBehavior: false,
      isService: true,
      multiplicity: { lower: 1, upper: 1, ordered: false, unique: true },
    };

    addSemanticElementV4(repo, pkg);
    addSemanticElementV4(repo, block);
    addSemanticElementV4(repo, req1);
    addSemanticElementV4(repo, req2);
    addSemanticElementV4(repo, port);
  });

  it('returns only targets accepted by command validation', () => {
    const targets = getLegalRelationshipTargets(block, 'Satisfy', 'outgoing', repo);
    expect(targets.length).toBeGreaterThan(0);
    for (const target of targets) {
      expect(validateRelationshipEndpoints(satisfy(block.id, target.id), repo).allowed).toBe(true);
    }
  });

  it('does not silently map unsupported relationships to Trace', () => {
    const invalidRelationship: SemanticRelationship = {
      id: 'rel-invalid',
      metaclass: 'UnsupportedRelation' as any,
      sourceId: block.id,
      targetId: pkg.id,
    };
    expect(validateRelationshipEndpoints(invalidRelationship, repo)).toMatchObject({ allowed: false });
  });

  it('rejects Satisfy connecting Block to Package', () => {
    const rel: SemanticRelationship = {
      id: 'rel-sat-pkg',
      metaclass: 'Satisfy',
      sourceId: block.id,
      targetId: pkg.id,
    };
    const res = validateRelationshipEndpoints(rel, repo);
    expect(res.allowed).toBe(false);
  });

  it('restricts RequirementContainment to Requirement endpoints', () => {
    const validContainment: SemanticRelationship = {
      id: 'req-cont-1',
      metaclass: 'Containment',
      sourceId: req1.id,
      targetId: req2.id,
    };
    expect(validateRelationshipEndpoints(validContainment, repo).allowed).toBe(true);

    const invalidContainment: SemanticRelationship = {
      id: 'req-cont-2',
      metaclass: 'Containment',
      sourceId: block.id,
      targetId: req1.id,
    };
    expect(validateRelationshipEndpoints(invalidContainment, repo).allowed).toBe(false);
  });

  it('provides legal relationship kinds for a Block in outgoing and incoming directions', () => {
    const outgoingKinds = getLegalRelationshipKinds(block, 'outgoing', repo);
    expect(outgoingKinds).toContain('Satisfy');
    expect(outgoingKinds).toContain('Association');
    expect(outgoingKinds).not.toContain('RequirementContainment');

    const incomingKinds = getLegalRelationshipKinds(req1, 'incoming', repo);
    expect(incomingKinds).toContain('Satisfy');
  });
});
