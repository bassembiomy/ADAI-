import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ReactFlowProvider } from '@xyflow/react';
import { UseCaseWorkspace } from './UseCaseWorkspace';

describe('UseCaseWorkspace', () => {
  it('renders workspace with toolbar and canvas controls', () => {
    const html = renderToStaticMarkup(
      <ReactFlowProvider>
        <UseCaseWorkspace
          diagram={{
            id: 'd-1',
            name: 'Powertrain Control',
            nodes: [
              { id: 'n-1', type: 'actor', position: { x: 50, y: 50 }, data: { label: 'Driver' } },
            ],
            edges: [],
          }}
          onChange={vi.fn()}
          onSave={vi.fn()}
        />
      </ReactFlowProvider>
    );

    expect(html).toContain('Powertrain Control');
    expect(html).toContain('+ Actor');
    expect(html).toContain('+ Use Case');
    expect(html).toContain('+ Subject');
    expect(html).toContain('Auto Layout');
    expect(html).toContain('Save');
  });

  it('renders correctly with default diagram name fallback', () => {
    const html = renderToStaticMarkup(
      <ReactFlowProvider>
        <UseCaseWorkspace
          diagram={{ id: 'd-empty', name: '', nodes: [], edges: [] }}
          onChange={vi.fn()}
          onSave={vi.fn()}
        />
      </ReactFlowProvider>
    );

    expect(html).toContain('Use Cases');
    expect(html).toContain('SysML /');
  });

  it('renders workspace projected from canonical repository', () => {
    const repo = {
      schemaVersion: 2 as const,
      profileId: 'OMG-SysML-1.6-ADIA' as const,
      revision: 1,
      definitions: {},
      usages: {},
      connectors: {},
      relationships: {},
      requirements: {},
      verificationCases: {},
      evidence: {},
      baselines: {},
      artifacts: {},
      auditTrail: [],
      actors: {
        'act-pilot': { id: 'act-pilot', name: 'Pilot', kind: 'actor' as const, namespace: [], isExternal: true, generalizationIds: [] },
      },
      subjects: {
        'sub-drone': { id: 'sub-drone', name: 'Drone System', kind: 'subject' as const, namespace: [] },
      },
      useCases: {
        'uc-survey': { id: 'uc-survey', name: 'Survey Field', kind: 'useCase' as const, namespace: [], subjectId: 'sub-drone', extensionPointIds: [], behaviorArtifactIds: [] },
      },
      extensionPoints: {},
      diagramReferences: {},
    };

    const html = renderToStaticMarkup(
      <ReactFlowProvider>
        <UseCaseWorkspace
          repository={repo}
          activeDiagramId="diag-uc-1"
          onChange={vi.fn()}
          onSave={vi.fn()}
        />
      </ReactFlowProvider>
    );

    expect(html).toContain('Main SysML Use Cases');
    expect(html).toContain('+ Actor');
    expect(html).toContain('+ Use Case');
    expect(html).toContain('+ Subject');
  });
});
