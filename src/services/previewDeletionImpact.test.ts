import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createEmptyRepository } from '../engine/sysml/model';
import { previewDeletionImpact } from './sysmlCommandGateway';
import { requiresDeletionConfirmation } from './sysmlTransactionAdapter';

describe('previewDeletionImpact', () => {
  it('reports the cascade of deleting a requirement only the canonical repository holds, without applying it', () => {
    const repository = createEmptyRepository();
    repository.requirements.parent = { id: 'parent', name: 'P', namespace: [], ownerId: 'model', kind: 'requirement', requirementId: 'R-1', text: 't', status: 'draft', version: '1' };
    repository.requirements.child = { id: 'child', name: 'C', namespace: [], ownerId: 'parent', kind: 'requirement', requirementId: 'R-2', text: 't', status: 'draft', version: '1' };
    repository.relationships.rel = { id: 'rel', kind: 'trace', sourceId: 'child', targetId: 'parent' } as any;
    const impact = previewDeletionImpact(repository, ['parent']);
    expect(impact).toBeDefined();
    expect(impact!.deletedElementIds).toEqual(expect.arrayContaining(['parent', 'rel']));
    expect(requiresDeletionConfirmation(impact!)).toBe(true);
    expect(repository.requirements.parent).toBeDefined();
  });

  it('is what Delete-key and inspector deletion review before they apply anything', () => {
    const source = readFileSync('src/App.tsx', 'utf8');
    const start = source.indexOf('const deleteNonStateElements = useCallback');
    const body = source.slice(start, start + 2600);
    expect(body).toContain('previewDeletionImpact(canonicalSysmlRepository');
    expect(body).toContain('setSysmlDeleteConfirm');
  });
});
