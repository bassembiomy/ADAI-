import { describe, expect, it } from 'vitest';
import { createEmptyRepository } from '../model';
import { ensureDefaultSysmlDiagrams } from '../../../services/sysmlDiagramWorkspace';
import { validateSysmlRepository } from '../validation';
import {
  validateScopedSysmlRepository,
  checkDuplicateQualifiedName,
  checkInheritanceCycleForBlock,
} from './dependencyScope';
import { generateSysmlModel } from '../largeModelGenerator';

describe('Dependency-scoped validation differential tests', () => {
  it('agrees with full validator on valid rename', () => {
    const fixture = generateSysmlModel({ targetElementCount: 200, seed: 42 });
    const repo = fixture.repository;
    const targetBlockId = Object.keys(repo.definitions)[0];
    const originalBlock = repo.definitions[targetBlockId];

    // Mutate name to a new unique name
    repo.definitions[targetBlockId] = { ...originalBlock, name: 'CompletelyUniqueRenamedBlock' } as any;

    const fullReport = validateSysmlRepository(repo);
    const scopedReport = validateScopedSysmlRepository(repo, {
      commandType: 'updateElement',
      affectedIds: [targetBlockId],
      changedProperties: ['name'],
    });

    expect(scopedReport).not.toBeNull();
    expect(scopedReport!.valid).toBe(fullReport.valid);
    // Neither should have introduced errors for targetBlockId
    const scopedErrors = scopedReport!.diagnostics.filter(d => d.elementId === targetBlockId);
    const fullErrors = fullReport.diagnostics.filter(d => d.elementId === targetBlockId);
    expect(scopedErrors).toEqual(fullErrors);
  });

  it('detects duplicate qualified name identically to full validator', () => {
    const fixture = generateSysmlModel({ targetElementCount: 200, seed: 42 });
    const repo = fixture.repository;
    const blockIds = Object.keys(repo.definitions);
    const firstBlock = repo.definitions[blockIds[0]];
    const secondBlock = repo.definitions[blockIds[1]];

    // Rename second block to first block's name in same namespace to induce collision
    repo.definitions[secondBlock.id] = {
      ...secondBlock,
      name: firstBlock.name,
      namespace: [...firstBlock.namespace],
    } as any;

    const fullReport = validateSysmlRepository(repo);
    const scopedReport = validateScopedSysmlRepository(repo, {
      commandType: 'updateElement',
      affectedIds: [secondBlock.id],
      changedProperties: ['name'],
    });

    expect(scopedReport).not.toBeNull();
    expect(scopedReport!.valid).toBe(false);
    expect(fullReport.valid).toBe(false);

    const scopedDupeError = scopedReport!.diagnostics.find(d => d.code === 'DUPLICATE_QUALIFIED_NAME');
    const fullDupeError = fullReport.diagnostics.find(
      d => d.code === 'DUPLICATE_QUALIFIED_NAME' && d.elementId === secondBlock.id
    );
    expect(scopedDupeError).toBeDefined();
    expect(fullDupeError).toBeDefined();
    expect(scopedDupeError?.message).toBe(fullDupeError?.message);
  });

  it('identifies presentation updates as semantically no-op', () => {
    const fixture = generateSysmlModel({ targetElementCount: 200, seed: 42 });
    const scopedReport = validateScopedSysmlRepository(fixture.repository, {
      commandType: 'updatePresentation',
      affectedIds: ['any-id'],
      isPresentationOnly: true,
    });

    expect(scopedReport).not.toBeNull();
    expect(scopedReport!.valid).toBe(true);
    expect(scopedReport!.diagnostics).toEqual([]);
  });

  it('validates property edits (isAbstract, description) matching full validator', () => {
    const fixture = generateSysmlModel({ targetElementCount: 200, seed: 42 });
    const repo = fixture.repository;
    const targetBlockId = Object.keys(repo.definitions)[0];
    const originalBlock = repo.definitions[targetBlockId];

    repo.definitions[targetBlockId] = {
      ...originalBlock,
      isAbstract: true,
      description: 'Updated abstract block description',
    } as any;

    const fullReport = validateSysmlRepository(repo);
    const scopedReport = validateScopedSysmlRepository(repo, {
      commandType: 'updateElement',
      affectedIds: [targetBlockId],
      changedProperties: ['isAbstract', 'description'],
    });

    expect(scopedReport).not.toBeNull();
    expect(scopedReport!.valid).toBe(fullReport.valid);
  });

  it('detects inheritance cycle during supertype update identically to full validator', () => {
    const fixture = generateSysmlModel({ targetElementCount: 200, seed: 42 });
    const repo = fixture.repository;
    const blocks = Object.values(repo.definitions).filter(d => d.kind === 'block');
    const a = blocks[0];
    const b = blocks[1];

    // Induce A -> B -> A cycle
    repo.definitions[a.id] = { ...a, supertypeIds: [b.id] } as any;
    repo.definitions[b.id] = { ...b, supertypeIds: [a.id] } as any;

    const fullReport = validateSysmlRepository(repo);
    const scopedReport = validateScopedSysmlRepository(repo, {
      commandType: 'updateElement',
      affectedIds: [a.id],
      changedProperties: ['supertypeIds'],
    });

    expect(scopedReport).not.toBeNull();
    expect(scopedReport!.valid).toBe(false);
    expect(fullReport.valid).toBe(false);
    const cycleDiag = scopedReport!.diagnostics.find(d => d.code === 'INHERITANCE_CYCLE');
    expect(cycleDiag).toBeDefined();
    expect(cycleDiag?.elementId).toBe(a.id);
  });
});
