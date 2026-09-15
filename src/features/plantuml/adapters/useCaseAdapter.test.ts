import { describe, expect, it } from 'vitest';
import { createVisualDiagram } from '../model/visualDiagramModel';
import {
  generateUseCasePlantUml,
  generateUseCasePlantUmlFromRepository,
  getUseCasePaletteItems,
} from './useCaseAdapter';

describe('use-case PlantUML adapter', () => {
  it('generates deterministic actors, use cases, boundaries, and associations', () => {
    const model = createVisualDiagram('use-case');
    model.elements = [
      { id: 'actor-1', kind: 'actor', label: 'Customer', position: { x: 0, y: 0 }, size: { width: 100, height: 60 }, style: {} },
      { id: 'case-1', kind: 'use-case', label: 'Sign in', position: { x: 0, y: 0 }, size: { width: 100, height: 60 }, style: {} },
    ];
    model.relationships = [{ id: 'rel-1', kind: 'association', sourceId: 'actor-1', targetId: 'case-1' }];
    const source = generateUseCasePlantUml(model);
    expect(source).toContain('actor "Customer" as actor_1');
    expect(source).toContain('( "Sign in" ) as case_1');
    expect(source).toContain('actor_1 --> case_1');
    expect(getUseCasePaletteItems().map((item) => item.kind)).toEqual(expect.arrayContaining(['actor', 'use-case', 'boundary']));
  });

  it('generates PlantUML from canonical SysmlRepository with extension points and relationships', () => {
    const repo = {
      definitions: {},
      usages: {},
      requirements: {},
      actors: {
        'act-pilot': { id: 'act-pilot', name: 'Pilot' },
      },
      subjects: {
        'subj-plane': { id: 'subj-plane', name: 'Airplane' },
      },
      useCases: {
        'uc-takeoff': {
          id: 'uc-takeoff',
          name: 'Takeoff',
          subjectId: 'subj-plane',
          extensionPoints: ['WindShearAbort'],
        },
        'uc-abort': {
          id: 'uc-abort',
          name: 'Abort Takeoff',
          subjectId: 'subj-plane',
        },
      },
      useCaseRelationships: {
        'rel-assoc': {
          id: 'rel-assoc',
          sourceId: 'act-pilot',
          targetId: 'uc-takeoff',
          kind: 'useCaseAssociation' as const,
        },
        'rel-extend': {
          id: 'rel-extend',
          sourceId: 'uc-abort',
          targetId: 'uc-takeoff',
          kind: 'extend' as const,
          extensionPoint: 'WindShearAbort',
        },
      },
      extensionPoints: {},
      diagramReferences: {},
      presentation: {},
      traceability: {},
      metadata: {},
    };

    const { plantUml, diagnostics } = generateUseCasePlantUmlFromRepository(repo as any);
    expect(plantUml).toContain('actor "Pilot" as act_pilot');
    expect(plantUml).toContain('rectangle "Airplane" as subj_plane');
    expect(plantUml).toContain('WindShearAbort');
    expect(plantUml).toContain('<<extend>>');
    expect(diagnostics).toHaveLength(0);
  });

  it('records diagnostic when encountering unsupported element or dangling endpoint', () => {
    const repo = {
      definitions: {},
      usages: {},
      requirements: {},
      actors: {},
      subjects: {},
      useCases: {},
      useCaseRelationships: {
        'rel-dangling': {
          id: 'rel-dangling',
          sourceId: 'missing-source',
          targetId: 'missing-target',
          kind: 'useCaseAssociation' as const,
        },
      },
      extensionPoints: {},
      diagramReferences: {},
      presentation: {},
      traceability: {},
      metadata: {},
    };

    const { diagnostics } = generateUseCasePlantUmlFromRepository(repo as any);
    expect(diagnostics.length).toBeGreaterThan(0);
    expect(diagnostics[0].code).toBe('DANGLING_RELATIONSHIP_ENDPOINT');
  });
});
