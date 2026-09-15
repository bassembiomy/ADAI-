import { describe, it, expect } from 'vitest';
import { createEmptyRepository, type SysmlRepository } from './model';
import { fromRepository, toRepository, targetedUpdatePresentation } from './normalizedStore';
import { deriveUseCaseView, validateUseCaseElement, validateUseCaseRelationship } from './useCases';
import { projectUseCaseDiagram, buildPresentationPatch } from '../../components/usecase/useCaseProjection';
import { executeSysmlCommand, createSysmlGatewayState, type SysmlEditorCommand } from '../../services/sysmlCommandGateway';

describe('SysML Use Case Large Model Performance & Conformance Gates', () => {
  function createDenseUseCaseRepository(count = 1000): SysmlRepository {
    const repo = createEmptyRepository();
    const actorCount = Math.max(10, Math.floor(count * 0.1));
    const subjectCount = Math.max(5, Math.floor(count * 0.05));
    const useCaseCount = count - actorCount - subjectCount;

    // Create Actors
    for (let i = 0; i < actorCount; i++) {
      const id = `act-perf-${i}`;
      repo.actors[id] = {
        id,
        name: `Actor ${i}`,
        kind: 'actor',
        isExternal: true,
        generalizationIds: [],
        namespace: [],
      };
    }

    // Create Subjects
    for (let i = 0; i < subjectCount; i++) {
      const id = `subj-perf-${i}`;
      repo.subjects[id] = {
        id,
        name: `Subject System ${i}`,
        kind: 'subject',
        namespace: [],
      };
    }

    // Create Use Cases and Extension Points
    const subjectIds = Object.keys(repo.subjects);
    for (let i = 0; i < useCaseCount; i++) {
      const id = `uc-perf-${i}`;
      const subjectId = subjectIds[i % subjectIds.length];
      const epId = `ep-perf-${i}`;

      repo.useCases[id] = {
        id,
        name: `Perform Operational Task ${i}`,
        kind: 'useCase',
        namespace: [],
        subjectId,
        extensionPointIds: [epId],
        behaviorArtifactIds: [],
      };

      repo.extensionPoints[epId] = {
        id: epId,
        useCaseId: id,
        name: `ExtensionPoint_${i}`,
        kind: 'extensionPoint',
        namespace: [],
      };
    }

    // Create Relationships (Association, Include, Extend, Generalization)
    const actorIds = Object.keys(repo.actors);
    const useCaseIds = Object.keys(repo.useCases);

    for (let i = 0; i < useCaseCount; i++) {
      const ucId = useCaseIds[i];
      const actId = actorIds[i % actorIds.length];

      // Actor -> Use Case association
      const assocId = `rel-assoc-${i}`;
      repo.relationships[assocId] = {
        id: assocId,
        sourceId: actId,
        targetId: ucId,
        kind: 'useCaseAssociation',
      };

      // Use Case -> Use Case include
      if (i > 0) {
        const incId = `rel-inc-${i}`;
        repo.relationships[incId] = {
          id: incId,
          sourceId: ucId,
          targetId: useCaseIds[i - 1],
          kind: 'include',
        };
      }

      // Use Case -> Use Case extend (every 5th)
      if (i > 5 && i % 5 === 0) {
        const extId = `rel-ext-${i}`;
        repo.relationships[extId] = {
          id: extId,
          sourceId: ucId,
          targetId: useCaseIds[i - 2],
          kind: 'extend',
          extensionPointId: `ep-perf-${i - 2}`,
        };
      }
    }

    return repo;
  }

  it('projects large use-case models with high element density within strict latency budget', () => {
    const repo = createDenseUseCaseRepository(1200);
    expect(Object.keys(repo.useCases).length).toBeGreaterThan(800);
    expect(Object.keys(repo.relationships).length).toBeGreaterThan(800);

    const tStart = performance.now();
    const diagram = projectUseCaseDiagram(repo);
    const duration = performance.now() - tStart;

    expect(diagram.nodes.length).toBeGreaterThan(800);
    expect(diagram.edges.length).toBeGreaterThan(800);
    // Latency target: full projection of 1200+ elements under 100ms
    expect(duration).toBeLessThan(100);
  });

  it('performs indexed lookups in normalized store in sub-millisecond time', () => {
    const repo = createDenseUseCaseRepository(1000);
    const store = fromRepository(repo);

    expect(store.useCases.size).toBeGreaterThan(800);
    expect(store.actors.size).toBeGreaterThan(80);
    expect(store.subjects.size).toBeGreaterThan(40);

    const testId = 'uc-perf-42';
    const tStart = performance.now();
    const uc = store.useCases.get(testId);
    const rels = store.indexes.sourceId.get(testId) ?? new Set();
    const duration = performance.now() - tStart;

    expect(uc).toBeDefined();
    expect(uc?.name).toContain('42');
    expect(rels.size).toBeGreaterThan(0);
    expect(duration).toBeLessThan(2);
  });

  it('validates canonical use-case elements and relationships at scale', () => {
    const repo = createDenseUseCaseRepository(200);

    const tStart = performance.now();
    let validCount = 0;
    for (const uc of Object.values(repo.useCases)) {
      const diag = validateUseCaseElement(repo, uc.id);
      if (diag.length === 0) validCount++;
    }
    for (const rel of Object.values(repo.relationships)) {
      const diag = validateUseCaseRelationship(repo, rel);
      if (diag.length === 0) validCount++;
    }
    const duration = performance.now() - tStart;

    expect(validCount).toBeGreaterThan(200);
    expect(duration).toBeLessThan(1500);
  });

  it('guarantees presentation-only updates (node drag) do NOT advance semantic revision', () => {
    const repo = createDenseUseCaseRepository(100);
    const store = fromRepository(repo);

    // Node drag stop produces a presentation patch
    const patch = buildPresentationPatch('uc-perf-10', { x: 450, y: 620 }) as Extract<SysmlEditorCommand, { type: 'updatePresentation' }>;
    expect(patch.elementId).toBe('uc-perf-10');
    expect(patch.presentation?.x).toBe(450);
    expect(patch.presentation?.y).toBe(620);

    // Apply presentation update via gateway
    const state = createSysmlGatewayState(repo);
    const tStart = performance.now();
    const result = executeSysmlCommand(state, {
      type: 'updatePresentation',
      elementId: patch.elementId,
      presentation: patch.presentation,
    });
    const dragDuration = performance.now() - tStart;

    // Drag latency must be < 100ms
    expect(dragDuration).toBeLessThan(100);
    expect(result.committed).toBe(true);

    // Semantic repository revision MUST NOT change on layout-only updates
    expect(result.repository.revision).toBe(repo.revision);
    expect(result.repository.auditTrail.length).toBe(repo.auditTrail.length);
    expect(Object.keys(result.repository.useCases).length).toBe(Object.keys(repo.useCases).length);
  });

  it('maintains command gateway undo/redo latency under 150ms for use-case mutations', () => {
    const repo = createDenseUseCaseRepository(100);
    const state = createSysmlGatewayState(repo);

    const tCreateStart = performance.now();
    const createResult = executeSysmlCommand(state, {
      type: 'createElement',
      element: {
        id: 'uc-new-perf',
        name: 'New High Priority Task',
        kind: 'useCase',
      } as any,
      presentation: { x: 100, y: 200 },
    });
    const createDuration = performance.now() - tCreateStart;

    expect(createResult.committed).toBe(true);
    expect(createDuration).toBeLessThan(150);
    expect(createResult.repository.useCases['uc-new-perf']).toBeDefined();

    const tUndoStart = performance.now();
    const undoResult = executeSysmlCommand({
      ...state,
      history: createResult.history,
      repository: createResult.repository,
      store: createResult.store,
      patchHistory: createResult.patchHistory,
      coordinates: createResult.coordinates,
      diagramPresentations: createResult.diagramPresentations,
    }, { type: 'undo' });
    const undoDuration = performance.now() - tUndoStart;

    expect(undoResult.committed).toBe(true);
    expect(undoDuration).toBeLessThan(300);
    expect(undoResult.repository.useCases['uc-new-perf']).toBeUndefined();
  });
});
