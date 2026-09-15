import { describe, expect, it } from 'vitest';
import {
  createEmptyRepository,
  type ActorDefinition,
  type SubjectDefinition,
  type UseCaseDefinition,
  type ExtensionPoint,
  type SysmlRelationship,
  type SysmlRepository,
} from './model';
import {
  validateUseCaseElement,
  validateUseCaseRelationship,
  deriveUseCaseView,
  classifyUseCaseRelationship,
  isUseCaseRelationshipKind,
  detectUseCaseCycles,
} from './useCases';

describe('SysML Use-Case Metamodel and Validation', () => {
  function createPopulatedRepo(): SysmlRepository {
    const repo = createEmptyRepository();

    repo.definitions['block-ctrl'] = {
      id: 'block-ctrl',
      name: 'SystemController',
      kind: 'block',
      namespace: ['System'],
      isAbstract: false,
      isLeaf: false,
      properties: [],
      ports: [],
      operations: [],
      constraints: [],
    };

    repo.subjects.sub1 = {
      id: 'sub1',
      name: 'VehicleSystem',
      kind: 'subject',
      namespace: [],
      realizedByBlockId: 'block-ctrl',
    };

    repo.actors.act1 = {
      id: 'act1',
      name: 'Driver',
      kind: 'actor',
      namespace: [],
      isExternal: true,
      generalizationIds: [],
    };

    repo.actors.act2 = {
      id: 'act2',
      name: 'CommercialDriver',
      kind: 'actor',
      namespace: [],
      isExternal: true,
      generalizationIds: ['act1'],
    };

    repo.extensionPoints.ep1 = {
      id: 'ep1',
      name: 'HighSpeedCondition',
      kind: 'extensionPoint',
      namespace: [],
      useCaseId: 'uc1',
      location: 'At speed > 100km/h',
    };

    repo.useCases.uc1 = {
      id: 'uc1',
      name: 'CruiseControl',
      kind: 'useCase',
      namespace: [],
      subjectId: 'sub1',
      description: 'Maintain constant speed',
      extensionPointIds: ['ep1'],
      behaviorArtifactIds: [],
    };

    repo.useCases.uc2 = {
      id: 'uc2',
      name: 'EmergencyBraking',
      kind: 'useCase',
      namespace: [],
      subjectId: 'sub1',
      description: 'Trigger autonomous braking',
      extensionPointIds: [],
      behaviorArtifactIds: [],
    };

    repo.useCases.uc3 = {
      id: 'uc3',
      name: 'SpeedLimiter',
      kind: 'useCase',
      namespace: [],
      subjectId: 'sub1',
      description: 'Cap maximum velocity',
      extensionPointIds: [],
      behaviorArtifactIds: [],
    };

    repo.requirements.req1 = {
      id: 'req1',
      requirementId: 'REQ-001',
      name: 'SafetyBrakeReq',
      kind: 'requirement',
      namespace: [],
      text: 'Must brake within 20m at 60km/h',
      status: 'approved',
      version: '1.0',
    };

    return repo;
  }

  describe('Metamodel Entity Validation', () => {
    it('validates a well-formed actor', () => {
      const repo = createPopulatedRepo();
      const diags = validateUseCaseElement(repo, 'act1');
      expect(diags).toHaveLength(0);
    });

    it('detects missing actor generalization target', () => {
      const repo = createPopulatedRepo();
      repo.actors.act2.generalizationIds = ['non-existent-actor'];
      const diags = validateUseCaseElement(repo, 'act2');
      expect(diags.some(d => d.code === 'MISSING_ACTOR_GENERALIZATION')).toBe(true);
    });

    it('detects actor generalization cycle', () => {
      const repo = createPopulatedRepo();
      repo.actors.act1.generalizationIds = ['act2'];
      repo.actors.act2.generalizationIds = ['act1'];
      const diags = validateUseCaseElement(repo, 'act1');
      expect(diags.some(d => d.code === 'ACTOR_GENERALIZATION_CYCLE')).toBe(true);
    });

    it('validates a well-formed subject', () => {
      const repo = createPopulatedRepo();
      const diags = validateUseCaseElement(repo, 'sub1');
      expect(diags).toHaveLength(0);
    });

    it('detects invalid realizedByBlockId in subject', () => {
      const repo = createPopulatedRepo();
      repo.subjects.sub1.realizedByBlockId = 'unknown-block';
      const diags = validateUseCaseElement(repo, 'sub1');
      expect(diags.some(d => d.code === 'MISSING_SUBJECT_REALIZATION_BLOCK')).toBe(true);
    });

    it('validates a well-formed use case', () => {
      const repo = createPopulatedRepo();
      const diags = validateUseCaseElement(repo, 'uc1');
      expect(diags).toHaveLength(0);
    });

    it('detects missing subject reference on use case', () => {
      const repo = createPopulatedRepo();
      repo.useCases.uc1.subjectId = 'non-existent-sub';
      const diags = validateUseCaseElement(repo, 'uc1');
      expect(diags.some(d => d.code === 'MISSING_USE_CASE_SUBJECT')).toBe(true);
    });

    it('detects duplicate extension point names on the same use case', () => {
      const repo = createPopulatedRepo();
      repo.extensionPoints.ep2 = {
        id: 'ep2',
        name: 'HighSpeedCondition', // same name as ep1
        kind: 'extensionPoint',
        namespace: [],
        useCaseId: 'uc1',
      };
      repo.useCases.uc1.extensionPointIds = ['ep1', 'ep2'];
      const diags = validateUseCaseElement(repo, 'uc1');
      expect(diags.some(d => d.code === 'DUPLICATE_EXTENSION_POINT_NAME')).toBe(true);
    });

    it('detects mismatched extension point useCaseId', () => {
      const repo = createPopulatedRepo();
      repo.extensionPoints.ep1.useCaseId = 'uc2'; // mismatch: uc1 points to ep1, but ep1 says uc2
      const diags = validateUseCaseElement(repo, 'uc1');
      expect(diags.some(d => d.code === 'EXTENSION_POINT_OWNER_MISMATCH')).toBe(true);
    });
  });

  describe('Relationship Legality and Endpoints', () => {
    it('classifies use-case relationship kinds correctly', () => {
      expect(classifyUseCaseRelationship('include')).toBe(true);
      expect(classifyUseCaseRelationship('extend')).toBe(true);
      expect(classifyUseCaseRelationship('useCaseAssociation')).toBe(true);
      expect(classifyUseCaseRelationship('useCaseGeneralization')).toBe(true);
      expect(classifyUseCaseRelationship('useCaseRefine')).toBe(true);
      expect(classifyUseCaseRelationship('useCaseSatisfy')).toBe(true);
      expect(classifyUseCaseRelationship('useCaseTrace')).toBe(true);
      expect(classifyUseCaseRelationship('composition')).toBe(false);
      expect(isUseCaseRelationshipKind('include')).toBe(true);
      expect(isUseCaseRelationshipKind('notARelation')).toBe(false);
    });

    it('allows valid actor <-> useCase association', () => {
      const repo = createPopulatedRepo();
      const rel: SysmlRelationship = {
        id: 'rel-assoc-1',
        kind: 'useCaseAssociation',
        sourceId: 'act1',
        targetId: 'uc1',
      };
      repo.relationships[rel.id] = rel;
      const diags = validateUseCaseRelationship(repo, rel);
      expect(diags).toHaveLength(0);

      // Target to source inverted association is also valid
      const invertedRel: SysmlRelationship = {
        id: 'rel-assoc-2',
        kind: 'useCaseAssociation',
        sourceId: 'uc1',
        targetId: 'act1',
      };
      expect(validateUseCaseRelationship(repo, invertedRel)).toHaveLength(0);
    });

    it('rejects invalid association endpoints', () => {
      const repo = createPopulatedRepo();
      const badRel: SysmlRelationship = {
        id: 'bad-assoc',
        kind: 'useCaseAssociation',
        sourceId: 'act1',
        targetId: 'act2', // actor to actor is not useCaseAssociation
      };
      const diags = validateUseCaseRelationship(repo, badRel);
      expect(diags.some(d => d.code === 'INVALID_USE_CASE_RELATIONSHIP_ENDPOINTS')).toBe(true);
    });

    it('allows valid include from base use case to included use case', () => {
      const repo = createPopulatedRepo();
      const rel: SysmlRelationship = {
        id: 'rel-inc-1',
        kind: 'include',
        sourceId: 'uc1',
        targetId: 'uc3',
      };
      repo.relationships[rel.id] = rel;
      const diags = validateUseCaseRelationship(repo, rel);
      expect(diags).toHaveLength(0);
    });

    it('rejects include self-loops and include cycles', () => {
      const repo = createPopulatedRepo();
      const selfLoop: SysmlRelationship = {
        id: 'rel-inc-self',
        kind: 'include',
        sourceId: 'uc1',
        targetId: 'uc1',
      };
      expect(validateUseCaseRelationship(repo, selfLoop).some(d => d.code === 'INCLUDE_SELF_LOOP')).toBe(true);

      // Cycle uc1 -> uc2 and uc2 -> uc1
      const rel1: SysmlRelationship = {
        id: 'inc-1',
        kind: 'include',
        sourceId: 'uc1',
        targetId: 'uc2',
      };
      const rel2: SysmlRelationship = {
        id: 'inc-2',
        kind: 'include',
        sourceId: 'uc2',
        targetId: 'uc1',
      };
      repo.relationships[rel1.id] = rel1;
      repo.relationships[rel2.id] = rel2;
      const diags = validateUseCaseRelationship(repo, rel2);
      expect(diags.some(d => d.code === 'INCLUDE_CYCLE')).toBe(true);
    });

    it('allows valid extend from extending use case to base use case with target extension point', () => {
      const repo = createPopulatedRepo();
      const rel: SysmlRelationship = {
        id: 'rel-ext-1',
        kind: 'extend',
        sourceId: 'uc2', // extending use case
        targetId: 'uc1', // base use case owning ep1
        extensionPointId: 'ep1',
      };
      repo.relationships[rel.id] = rel;
      const diags = validateUseCaseRelationship(repo, rel);
      expect(diags).toHaveLength(0);
    });

    it('rejects extend without extensionPointId or with invalid extensionPointId', () => {
      const repo = createPopulatedRepo();
      const noEpRel: SysmlRelationship = {
        id: 'ext-no-ep',
        kind: 'extend',
        sourceId: 'uc2',
        targetId: 'uc1',
      };
      expect(validateUseCaseRelationship(repo, noEpRel).some(d => d.code === 'MISSING_EXTENSION_POINT')).toBe(true);

      const wrongEpRel: SysmlRelationship = {
        id: 'ext-wrong-ep',
        kind: 'extend',
        sourceId: 'uc2',
        targetId: 'uc1',
        extensionPointId: 'ep-non-existent',
      };
      expect(validateUseCaseRelationship(repo, wrongEpRel).some(d => d.code === 'INVALID_EXTENSION_POINT')).toBe(true);
    });

    it('allows valid useCaseGeneralization only within same metaclass family', () => {
      const repo = createPopulatedRepo();
      // Actor to Actor
      const actorGen: SysmlRelationship = {
        id: 'gen-act',
        kind: 'useCaseGeneralization',
        sourceId: 'act2',
        targetId: 'act1',
      };
      expect(validateUseCaseRelationship(repo, actorGen)).toHaveLength(0);

      // UseCase to UseCase
      const ucGen: SysmlRelationship = {
        id: 'gen-uc',
        kind: 'useCaseGeneralization',
        sourceId: 'uc3',
        targetId: 'uc1',
      };
      expect(validateUseCaseRelationship(repo, ucGen)).toHaveLength(0);

      // Cross-metaclass Actor to UseCase is illegal
      const crossGen: SysmlRelationship = {
        id: 'gen-cross',
        kind: 'useCaseGeneralization',
        sourceId: 'act1',
        targetId: 'uc1',
      };
      expect(validateUseCaseRelationship(repo, crossGen).some(d => d.code === 'INVALID_GENERALIZATION_FAMILY')).toBe(true);
    });

    it('validates traceability relationships (satisfy, refine, trace) between useCase and requirement', () => {
      const repo = createPopulatedRepo();
      const satisfyRel: SysmlRelationship = {
        id: 'rel-sat',
        kind: 'useCaseSatisfy',
        sourceId: 'uc2',
        targetId: 'req1',
      };
      repo.relationships[satisfyRel.id] = satisfyRel;
      expect(validateUseCaseRelationship(repo, satisfyRel)).toHaveLength(0);

      const invalidTargetRel: SysmlRelationship = {
        id: 'rel-bad-req',
        kind: 'useCaseSatisfy',
        sourceId: 'uc2',
        targetId: 'act1', // Target must be requirement
      };
      expect(validateUseCaseRelationship(repo, invalidTargetRel).some(d => d.code === 'INVALID_TRACEABILITY_ENDPOINTS')).toBe(true);
    });
  });

  describe('deriveUseCaseView Projection', () => {
    it('produces a stable, deterministically ordered projection view', () => {
      const repo = createPopulatedRepo();
      const view1 = deriveUseCaseView(repo);
      const view2 = deriveUseCaseView(repo);

      expect(view1.actors.map(a => a.id)).toEqual(['act1', 'act2']);
      expect(view1.useCases.map(u => u.id)).toEqual(['uc1', 'uc2', 'uc3']);
      expect(view1.subjects.map(s => s.id)).toEqual(['sub1']);
      expect(view1.extensionPoints.map(ep => ep.id)).toEqual(['ep1']);
      expect(view1).toEqual(view2);
    });

    it('filters by diagramId or subjectId if requested', () => {
      const repo = createPopulatedRepo();
      const view = deriveUseCaseView(repo, { subjectId: 'sub1' });
      expect(view.subjects).toHaveLength(1);
      expect(view.useCases).toHaveLength(3);
    });
  });

  describe('Cycle Detection Utility', () => {
    it('detects cycles in directed graphs of elements', () => {
      const edges = [
        { from: 'A', to: 'B' },
        { from: 'B', to: 'C' },
        { from: 'C', to: 'A' },
      ];
      expect(detectUseCaseCycles(edges)).toEqual(['A', 'B', 'C', 'A']);

      const acyclic = [
        { from: 'A', to: 'B' },
        { from: 'B', to: 'C' },
      ];
      expect(detectUseCaseCycles(acyclic)).toBeNull();
    });
  });
});
