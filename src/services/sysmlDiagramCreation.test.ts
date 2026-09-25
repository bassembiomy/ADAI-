import { describe, expect, it } from 'vitest';
import { createEmptyRepository } from '../engine/sysml/model';
import { buildDiagramCreationCommand } from './sysmlDiagramCreation';

describe('sysmlDiagramCreation', () => {
  it.each([
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
});
