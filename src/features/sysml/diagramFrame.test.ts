import { describe, expect, it } from 'vitest';
import { createEmptyRepository } from '../../engine/sysml/model';
import { diagramFrameLabel, diagramFrameRect, diagramKindAbbreviation } from './diagramFrame';

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

describe('diagramFrameLabel context metaclasses', () => {
  it('maps every definition kind to its SysML metaclass and looks names up in all collections', () => {
    const repo = createEmptyRepository();
    const defs: Array<[string, string, string]> = [
      ['constraintBlock', 'Constraint Block', 'CB'], ['enumeration', 'Enumeration', 'En'], ['signal', 'Signal', 'Sg'],
      ['unit', 'Unit', 'Un'], ['quantityKind', 'Quantity Kind', 'Qk'], ['view', 'View', 'Vw'],
      ['viewpoint', 'Viewpoint', 'Vp'], ['stakeholder', 'Stakeholder', 'Sh'], ['activity', 'Activity', 'Ac'],
      ['interaction', 'Interaction', 'In'], ['block', 'Block', 'Bl'], ['interface', 'Interface Block', 'If'], ['valueType', 'Value Type', 'Vt'],
    ];
    for (const [kind, , name] of defs) {
      repo.definitions[`d-${kind}`] = { id: `d-${kind}`, kind, name, namespace: [], ownerId: 'model' } as never;
      repo.diagrams[`g-${kind}`] = { id: `g-${kind}`, kind: 'diagram', diagramKind: 'bdd', name: 'D', namespace: [], ownerId: 'model', contextElementId: `d-${kind}` };
    }
    for (const [kind, metaclass, name] of defs) expect(diagramFrameLabel(repo, `g-${kind}`)).toBe(`bdd [${metaclass}] ${name} [D]`);
  });

  it('resolves verification case, use case, actor and requirement contexts', () => {
    const repo = createEmptyRepository();
    repo.verificationCases.tc = { id: 'tc', kind: 'verificationCase', name: 'Thermal Test', namespace: [], ownerId: 'model', method: 'test', verifiesRequirementIds: [] } as never;
    repo.useCases.uc = { id: 'uc', kind: 'useCase', name: 'Drive', namespace: [], ownerId: 'model', extensionPointIds: [], behaviorArtifactIds: [] } as never;
    repo.actors.ac = { id: 'ac', kind: 'actor', name: 'Driver', namespace: [], ownerId: 'model', isExternal: true, generalizationIds: [] } as never;
    repo.requirements.rq = { id: 'rq', kind: 'requirement', name: 'Speed', namespace: [], ownerId: 'model' } as never;
    const ctx: Array<[string, string]> = [['tc', 'Test Case [Thermal Test]'], ['uc', 'Use Case [Drive]'], ['ac', 'Actor [Driver]'], ['rq', 'Requirement [Speed]']];
    for (const [id] of ctx) repo.diagrams[`g-${id}`] = { id: `g-${id}`, kind: 'diagram', diagramKind: 'requirements', name: 'R', namespace: [], ownerId: 'model', contextElementId: id };
    for (const [id, text] of ctx) expect(diagramFrameLabel(repo, `g-${id}`)).toBe(`req [${text.split(' [')[0]}] ${text.split('[')[1].replace(']', '')} [R]`);
  });
});

describe('diagramFrameRect', () => {
  it('wraps the union of the shown rects with padding and header room', () => {
    const rect = diagramFrameRect([{ x: 100, y: 100, width: 50, height: 40 }, { x: 300, y: 200, width: 100, height: 60 }]);
    expect(rect).toEqual({ x: 60, y: 36, width: 380, height: 264 });
  });

  it('anchors an empty frame to the viewport below the toolbar at the default view', () => {
    const rect = diagramFrameRect([], { width: 1000, height: 700, scale: 1, offsetX: 0, offsetY: 0 });
    expect(rect.y).toBeGreaterThanOrEqual(60);
    expect(rect.x).toBe(16);
    expect(rect.x + rect.width).toBe(984);
  });

  it('keeps the empty frame header on screen when the view is panned and zoomed', () => {
    const view = { width: 1000, height: 700, scale: 2, offsetX: 100, offsetY: -50 };
    const rect = diagramFrameRect([], view);
    expect(rect.y * view.scale + view.offsetY).toBeCloseTo(72);
    expect(rect.x * view.scale + view.offsetX).toBeCloseTo(16);
  });
});
