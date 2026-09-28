import { describe, expect, it } from 'vitest';
import { createEmptyRepository } from '../engine/sysml/model';
import { buildDiagramCreationCommand } from './sysmlDiagramCreation';
import { createSysmlGatewayState, executeSysmlCommand } from './sysmlCommandGateway';

describe('sysmlDiagramCreation', () => {
  it.each([
    ['Package', 'package', 'pkg-'],
    ['Block', 'block', 'blk-'],
    ['Requirement', 'requirement', 'req-'],
    ['TestCase', 'verificationCase', 'vc-'],
    ['UseCase', 'useCase', 'uc-'],
  ] as const)('builds one %s semantic element and active-diagram presentation', (kind, repositoryKind, idPrefix) => {
    const result = buildDiagramCreationCommand({
      repository: createEmptyRepository(),
      kind,
      ownerId: 'model',
      diagramId: 'requirements',
      position: { x: 100, y: 120 },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.command.type).toBe('createAndPresent');
    expect((result.command.element as { kind?: string }).kind).toBe(repositoryKind);
    expect(result.command.element.id.startsWith(idPrefix)).toBe(true);
  });

  it('returns OWNER_NOT_FOUND instead of inventing an owner', () => {
    const result = buildDiagramCreationCommand({
      repository: createEmptyRepository(),
      kind: 'Block',
      ownerId: 'missing',
      diagramId: 'requirements',
      position: { x: 0, y: 0 },
    });
    expect(result).toMatchObject({ ok: false, diagnostic: { code: 'OWNER_NOT_FOUND' } });
  });

  it('returns DIAGRAM_NOT_FOUND when diagramId is empty', () => {
    const result = buildDiagramCreationCommand({
      repository: createEmptyRepository(),
      kind: 'Block',
      ownerId: 'model',
      diagramId: '',
      position: { x: 10, y: 20 },
    });
    expect(result).toMatchObject({ ok: false, diagnostic: { code: 'DIAGRAM_NOT_FOUND' } });
  });

  it('creates exactly one TestCase semantic record and one Requirement Diagram presentation with normative testCase stereotype', () => {
    const initialRepo = createEmptyRepository();
    const outcome = buildDiagramCreationCommand({
      repository: initialRepo,
      kind: 'TestCase',
      ownerId: 'model',
      diagramId: 'requirements',
      position: { x: 150, y: 250 },
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    const state = createSysmlGatewayState(initialRepo);
    state.diagramPresentations = { requirements: { elementIds: [], presentations: {} } };

    const result = executeSysmlCommand(state, outcome.command);
    expect(result.committed).toBe(true);

    const tcId = outcome.semanticId;
    // Exactly one semantic record in verificationCases
    expect(result.repository.verificationCases[tcId]).toBeDefined();
    expect(Object.keys(result.repository.verificationCases)).toHaveLength(1);

    // No surrogate Block created in definitions
    expect(result.repository.definitions[tcId]).toBeUndefined();
    expect(Object.keys(result.repository.definitions)).toHaveLength(0);

    // Presentation added to active diagram
    expect(result.diagramPresentations.requirements.elementIds).toContain(tcId);
    expect(result.diagramPresentations.requirements.presentations[tcId]).toBeDefined();

    // Projected block must use normative 'testCase' stereotype, not internal 'verificationCase'
    const projectedBlock = result.view.blocks.find(b => b.id === tcId);
    expect(projectedBlock).toBeDefined();
    expect(projectedBlock?.stereotype).toBe('testCase');
  });

  it('proves a Block created on a Package Diagram is owned by the diagram package', () => {
    const repo = createEmptyRepository();
    repo.packages['pkg-sub'] = {
      id: 'pkg-sub',
      kind: 'package',
      name: 'Subsystem',
      namespace: ['Model'],
      ownerId: 'model',
    };
    repo.diagrams['pkg-diag-1'] = {
      id: 'pkg-diag-1',
      kind: 'diagram',
      diagramKind: 'package',
      name: 'Subsystem Overview',
      namespace: ['Model', 'Subsystem'],
      ownerId: 'pkg-sub',
    };

    const outcome = buildDiagramCreationCommand({
      repository: repo,
      kind: 'Block',
      diagramId: 'pkg-diag-1',
      position: { x: 100, y: 100 },
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect((outcome.command.element as { ownerId?: string }).ownerId).toBe('pkg-sub');
  });

  it('returns OWNER_CONTEXT_REQUIRED without a command for invalid/missing IBD context', () => {
    const repo = createEmptyRepository();
    const outcome = buildDiagramCreationCommand({
      repository: repo,
      kind: 'Block',
      diagramId: 'ibd',
      diagramKind: 'ibd',
      position: { x: 100, y: 100 },
    });

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.diagnostic.code).toBe('OWNER_CONTEXT_REQUIRED');
    }
  });
});

