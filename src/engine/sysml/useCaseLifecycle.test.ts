import { describe, expect, it } from 'vitest';
import {
  evaluateSysmlConnection,
  classifyCanonicalEndpoint,
} from './connectionPolicy';
import {
  classifyDeletionTarget,
  classifyRelationship,
} from './policy';
import {
  applyCommand,
  analyzeMutation,
} from './mutations';
import {
  createSysmlGatewayState,
  executeSysmlCommand,
} from '../../services/sysmlCommandGateway';
import {
  createEmptyRepository,
  type ActorDefinition,
  type SubjectDefinition,
  type UseCaseDefinition,
  type ExtensionPoint,
  type SysmlRelationship,
  type SysmlRepository,
} from './model';

describe('SysML Use-Case Lifecycle & Policy Integration', () => {
  describe('Connection Policy for Use-Case Diagram', () => {
    const actorEndpoint = {
      id: 'act-1',
      name: 'Pilot',
      family: 'actor' as const,
    };
    const useCaseEndpoint1 = {
      id: 'uc-1',
      name: 'FlyMission',
      family: 'useCase' as const,
    };
    const useCaseEndpoint2 = {
      id: 'uc-2',
      name: 'NavigateWaypoints',
      family: 'useCase' as const,
    };
    const blockEndpoint = {
      id: 'blk-1',
      name: 'FlightComputer',
      family: 'block' as const,
    };
    const reqEndpoint = {
      id: 'req-1',
      name: 'SafetyRequirement',
      family: 'requirement' as const,
    };

    it('allows valid actor <-> useCase association on useCase diagram', () => {
      const decision1 = evaluateSysmlConnection({
        relationshipKind: 'useCaseAssociation',
        source: actorEndpoint,
        target: useCaseEndpoint1,
        diagram: 'useCase',
      });
      expect(decision1.allowed).toBe(true);

      const decision2 = evaluateSysmlConnection({
        relationshipKind: 'useCaseAssociation',
        source: useCaseEndpoint1,
        target: actorEndpoint,
        diagram: 'useCase',
      });
      expect(decision2.allowed).toBe(true);
    });

    it('rejects invalid association endpoints', () => {
      const decision = evaluateSysmlConnection({
        relationshipKind: 'useCaseAssociation',
        source: blockEndpoint,
        target: useCaseEndpoint1,
        diagram: 'useCase',
      });
      expect(decision.allowed).toBe(false);
      expect(decision.diagnostics[0]?.code).toBe('INVALID_USE_CASE_ASSOCIATION_ENDPOINTS');
    });

    it('allows valid include relationship between use cases and rejects self-loops', () => {
      const valid = evaluateSysmlConnection({
        relationshipKind: 'include',
        source: useCaseEndpoint1,
        target: useCaseEndpoint2,
        diagram: 'useCase',
      });
      expect(valid.allowed).toBe(true);

      const selfLoop = evaluateSysmlConnection({
        relationshipKind: 'include',
        source: useCaseEndpoint1,
        target: useCaseEndpoint1,
        diagram: 'useCase',
      });
      expect(selfLoop.allowed).toBe(false);
      expect(selfLoop.diagnostics[0]?.code).toBe('SELF_RELATIONSHIP');
    });

    it('allows valid extend relationship between use cases and rejects self-loops', () => {
      const valid = evaluateSysmlConnection({
        relationshipKind: 'extend',
        source: useCaseEndpoint2,
        target: useCaseEndpoint1,
        diagram: 'useCase',
      });
      expect(valid.allowed).toBe(true);

      const selfLoop = evaluateSysmlConnection({
        relationshipKind: 'extend',
        source: useCaseEndpoint1,
        target: useCaseEndpoint1,
        diagram: 'useCase',
      });
      expect(selfLoop.allowed).toBe(false);
      expect(selfLoop.diagnostics[0]?.code).toBe('SELF_RELATIONSHIP');
    });

    it('allows generalization within same family (actor->actor or useCase->useCase) and rejects cross-family', () => {
      const actor2 = { id: 'act-2', name: 'Copilot', family: 'actor' as const };
      const validActorGen = evaluateSysmlConnection({
        relationshipKind: 'useCaseGeneralization',
        source: actor2,
        target: actorEndpoint,
        diagram: 'useCase',
      });
      expect(validActorGen.allowed).toBe(true);

      const crossFamily = evaluateSysmlConnection({
        relationshipKind: 'useCaseGeneralization',
        source: actorEndpoint,
        target: useCaseEndpoint1,
        diagram: 'useCase',
      });
      expect(crossFamily.allowed).toBe(false);
      expect(crossFamily.diagnostics[0]?.code).toBe('INVALID_GENERALIZATION_FAMILY');
    });

    it('allows traceability relationships from use case to requirement', () => {
      for (const kind of ['useCaseSatisfy', 'useCaseRefine', 'useCaseTrace'] as const) {
        const decision = evaluateSysmlConnection({
          relationshipKind: kind,
          source: useCaseEndpoint1,
          target: reqEndpoint,
          diagram: 'useCase',
        });
        expect(decision.allowed).toBe(true);
      }
    });

    it('fails closed for unsupported relationship kinds on useCase diagram', () => {
      const badDiagram = evaluateSysmlConnection({
        relationshipKind: 'composition',
        source: actorEndpoint,
        target: useCaseEndpoint1,
        diagram: 'useCase',
      });
      expect(badDiagram.allowed).toBe(false);
      expect(badDiagram.diagnostics[0]?.code).toBe('INVALID_RELATIONSHIP_DIAGRAM');
    });
  });

  describe('Deletion Policy & Cascades', () => {
    function createPopulatedRepo(): SysmlRepository {
      const repo = createEmptyRepository();
      repo.actors['act-1'] = { id: 'act-1', name: 'User', kind: 'actor', namespace: [], isExternal: true, generalizationIds: [] };
      repo.subjects['sub-1'] = { id: 'sub-1', name: 'App', kind: 'subject', namespace: [] };
      repo.useCases['uc-1'] = {
        id: 'uc-1',
        name: 'Login',
        kind: 'useCase',
        namespace: [],
        subjectId: 'sub-1',
        extensionPointIds: ['ep-1'],
        behaviorArtifactIds: [],
      };
      repo.extensionPoints['ep-1'] = {
        id: 'ep-1',
        name: 'TwoFactorAuth',
        kind: 'extensionPoint',
        namespace: [],
        useCaseId: 'uc-1',
      };
      repo.relationships['rel-assoc'] = {
        id: 'rel-assoc',
        kind: 'useCaseAssociation',
        sourceId: 'act-1',
        targetId: 'uc-1',
      };
      repo.diagramReferences['ref-1'] = {
        id: 'ref-1',
        diagramId: 'act-login',
        diagramKind: 'activity',
        role: 'elaborates',
        sourceElementId: 'uc-1',
      };
      return repo;
    }

    it('cascades deletion of useCase to owned extension points and touching relationships', () => {
      const repo = createPopulatedRepo();
      const target = classifyDeletionTarget(repo, 'uc-1');
      expect(target.targetKind).toBe('useCase');
      expect(target.cascadeIds).toContain('ep-1');

      const impact = analyzeMutation(repo, { kind: 'deleteElements', elementIds: ['uc-1'] });
      expect(impact.deletedElementIds).toContain('uc-1');
      expect(impact.deletedElementIds).toContain('ep-1');
      expect(impact.removedRelationshipIds).toContain('rel-assoc');
      expect(impact.affectedDiagramKinds).toContain('useCase');

      const res = applyCommand(repo, { kind: 'deleteElements', elementIds: ['uc-1'] });
      expect(res.applied).toBe(true);
      expect(res.repository.useCases['uc-1']).toBeUndefined();
      expect(res.repository.extensionPoints['ep-1']).toBeUndefined();
      expect(res.repository.relationships['rel-assoc']).toBeUndefined();
      expect(res.repository.diagramReferences['ref-1']).toBeUndefined();
      // Actor and subject should remain intact!
      expect(res.repository.actors['act-1']).toBeDefined();
      expect(res.repository.subjects['sub-1']).toBeDefined();
    });

    it('deleting a subject retains contained use cases with diagnostic rather than silently deleting them', () => {
      const repo = createPopulatedRepo();
      const res = applyCommand(repo, { kind: 'deleteElements', elementIds: ['sub-1'] });
      expect(res.applied).toBe(true);
      expect(res.repository.subjects['sub-1']).toBeUndefined();
      // Use case is retained!
      expect(res.repository.useCases['uc-1']).toBeDefined();
      expect(res.repository.useCases['uc-1'].subjectId).toBe('sub-1');
      // Validation reports missing subject
      expect(res.validation.diagnostics.some(d => d.code === 'MISSING_USE_CASE_SUBJECT')).toBe(true);
    });
  });

  describe('Command Gateway Integration & Undo/Redo', () => {
    it('creates use-case elements, increments revisions and supports undo/redo', () => {
      let state = createSysmlGatewayState();
      expect(state.repository.revision).toBe(0);

      const actor: ActorDefinition = {
        id: 'act-pilot',
        name: 'Pilot',
        kind: 'actor',
        namespace: [],
        isExternal: true,
        generalizationIds: [],
      };

      const res1 = executeSysmlCommand(state, {
        type: 'createElement',
        element: actor,
      });
      expect(res1.committed).toBe(true);
      expect(res1.repository.actors['act-pilot']).toBeDefined();
      expect(res1.repository.revision).toBe(1);
      state = { ...state, repository: res1.repository, history: res1.history, store: res1.store, patchHistory: res1.patchHistory };

      // Undo
      const undoRes = executeSysmlCommand(state, { type: 'undo' });
      expect(undoRes.committed).toBe(true);
      expect(undoRes.repository.actors['act-pilot']).toBeUndefined();
      state = { ...state, repository: undoRes.repository, history: undoRes.history, store: undoRes.store, patchHistory: undoRes.patchHistory };

      // Redo
      const redoRes = executeSysmlCommand(state, { type: 'redo' });
      expect(redoRes.committed).toBe(true);
      expect(redoRes.repository.actors['act-pilot']).toBeDefined();
    });
  });
});
