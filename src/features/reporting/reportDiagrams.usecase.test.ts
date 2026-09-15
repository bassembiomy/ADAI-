import { describe, expect, it } from 'vitest';
import { renderUseCaseDiagram, type ReportUseCaseSource } from './reportDiagrams';
import type { SysmlRepository } from '../../engine/sysml/model';
import { createEmptyRepository } from '../../engine/sysml/model';

describe('renderUseCaseDiagram', () => {
  it('renders actors, use cases, subjects, and typed relationships in SVG figure', () => {
    const source: ReportUseCaseSource = {
      diagramName: 'Avionics Flight Control',
      nodes: [
        { id: 'act-pilot', name: 'Pilot In Command', kind: 'actor' },
        { id: 'uc-autopilot', name: 'Engage Autopilot', kind: 'useCase', extensionPoints: ['Override'] },
        { id: 'uc-nav', name: 'Compute Navigation Vector', kind: 'useCase' },
        { id: 'subj-fcs', name: 'Flight Control System', kind: 'subject' },
      ],
      edges: [
        { id: 'rel-assoc', sourceId: 'act-pilot', targetId: 'uc-autopilot', kind: 'association' },
        { id: 'rel-inc', sourceId: 'uc-autopilot', targetId: 'uc-nav', kind: 'include' },
      ],
    };

    const html = renderUseCaseDiagram(source);
    expect(html).toContain('Pilot In Command');
    expect(html).toContain('Engage Autopilot');
    expect(html).toContain('Flight Control System');
    expect(html).toContain('«actor»');
    expect(html).toContain('«usecase»');
    expect(html).toContain('«subject»');
    expect(html).toContain('«include»');
    expect(html).toContain('Override');
  });

  it('renders directly from canonical SysmlRepository with use cases and relationships', () => {
    const repo: SysmlRepository = {
      ...createEmptyRepository(),
      actors: {
        'act-operator': { id: 'act-operator', name: 'Operator' } as any,
      },
      useCases: {
        'uc-monitor': { id: 'uc-monitor', name: 'Monitor Telemetry', subjectId: 'subj-ground' } as any,
      },
      subjects: {
        'subj-ground': { id: 'subj-ground', name: 'Ground Station' } as any,
      },
      relationships: {
        'rel-assoc-1': {
          id: 'rel-assoc-1',
          sourceId: 'act-operator',
          targetId: 'uc-monitor',
          kind: 'useCaseAssociation',
        },
      },
    };

    const html = renderUseCaseDiagram({ repository: repo, diagramName: 'Mission Ops' });
    expect(html).toContain('Operator');
    expect(html).toContain('Monitor Telemetry');
    expect(html).toContain('Ground Station');
    expect(html).toContain('Mission Ops');
  });

  it('renders empty figure gracefully when no use case elements exist', () => {
    const html = renderUseCaseDiagram({ nodes: [], edges: [] });
    expect(html).toContain('No use case elements available');
  });
});
