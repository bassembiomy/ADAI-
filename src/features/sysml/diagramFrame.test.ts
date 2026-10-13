import { describe, expect, it } from 'vitest';
import { createEmptyRepository } from '../../engine/sysml/model';
import { diagramFrameLabel, diagramKindAbbreviation } from './diagramFrame';

describe('diagramFrameLabel', () => {
  it('builds the SysML frame header from the diagram context', () => {
    const repo = createEmptyRepository();
    repo.packages.power = { id: 'power', kind: 'package', name: 'Power', namespace: [], ownerId: 'model' };
    repo.diagrams.root = { id: 'root', kind: 'diagram', diagramKind: 'package', name: 'Overview', namespace: [], ownerId: 'model' };
    repo.diagrams.sub = { id: 'sub', kind: 'diagram', diagramKind: 'package', name: 'Structure', namespace: [], ownerId: 'power' };
    expect(diagramFrameLabel(repo, 'root')).toBe('pkg [Model] Model [Overview]');
    expect(diagramFrameLabel(repo, 'sub')).toBe('pkg [Package] Power [Structure]');
    expect(diagramFrameLabel(repo, 'missing')).toBeUndefined();
  });

  it('abbreviates kinds per SysML Annex A', () => {
    expect(diagramKindAbbreviation('requirements')).toBe('req');
    expect(diagramKindAbbreviation('stateMachine')).toBe('stm');
  });
});
