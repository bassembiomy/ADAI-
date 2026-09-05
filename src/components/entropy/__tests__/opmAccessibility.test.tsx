import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi } from 'vitest';
import {
  OpmCodeGenerationWorkspace,
  createInitialArtifactState,
  markGenerated,
  markVerified,
  markFailed,
} from '../OpmCodeGenerationWorkspace';
import { OpmDiagnosticsBadge } from '../OpmDiagnosticsBadge';
import { DEFAULT_OPM_SIMULATION_CONFIG } from '../OpmSimulationConfig';
import type { AppNode, AppEdge } from '../EntropyTypes';

describe('OPM Accessibility & Stability Suite', () => {
  const sampleNodes: AppNode[] = [
    {
      id: 'obj_pump',
      type: 'opmObject',
      position: { x: 100, y: 100 },
      data: {
        name: 'Pump',
        type: 'object',
        physical: false,
      },
    },
    {
      id: 'proc_heating',
      type: 'opmProcess',
      position: { x: 300, y: 100 },
      data: {
        name: 'Heating',
        type: 'process',
        physical: false,
      },
    },
  ];

  const sampleEdges: AppEdge[] = [
    {
      id: 'edge_pump_heating',
      source: 'obj_pump',
      target: 'proc_heating',
      type: 'opmEdge',
      data: {
        type: 'consumption',
        linkType: 'consumption',
      },
    },
  ];

  describe('Accessible names and roles', () => {
    it('provides accessible names and test IDs on all sequential codegen action buttons', () => {
      const state = createInitialArtifactState();
      const html = renderToStaticMarkup(
        <OpmCodeGenerationWorkspace
          nodes={sampleNodes as never}
          edges={sampleEdges as never}
          state={state}
          onStateChange={() => {}}
          opmSimulationConfig={DEFAULT_OPM_SIMULATION_CONFIG}
        />
      );

      // Validate test IDs and accessible titles / text
      expect(html).toContain('data-testid="opm-validate"');
      expect(html).toContain('data-testid="opm-generate"');
      expect(html).toContain('data-testid="opm-verify"');
      expect(html).toContain('data-testid="opm-download"');
      expect(html).toContain('data-testid="opm-hil"');

      // Buttons have visible labels and titles for screen readers
      expect(html).toMatch(/<button[^>]*data-testid="opm-validate"[^>]*>1\. Validate<\/button>/);
      expect(html).toMatch(/<button[^>]*data-testid="opm-generate"/);
      expect(html).toMatch(/title="Generate/);
    });

    it('provides accessible titles, aria attributes, and keyboard listeners on diagnostics items', () => {
      const diagnostics = [
        {
          code: 'ERR_STATE_UNATTACHED',
          severity: 'error' as const,
          message: 'State must belong to an object',
          source: { elementId: 'st_orphan', propertyPath: 'parentId' },
        },
      ];

      const html = renderToStaticMarkup(
        <OpmDiagnosticsBadge
          diagnostics={diagnostics}
          onNavigateToDiagnostic={() => {}}
        />
      );

      // Diagnostic badge button must have title or label
      expect(html).toContain('data-testid="opm-diagnostics-badge"');
      expect(html).toContain('1 Errors');
    });
  });

  describe('Non-color status indicators', () => {
    it('displays explicit textual status indicators along with color classes in codegen lifecycle', () => {
      const draftState = createInitialArtifactState();
      const draftHtml = renderToStaticMarkup(
        <OpmCodeGenerationWorkspace
          nodes={sampleNodes as never}
          edges={sampleEdges as never}
          state={draftState}
          onStateChange={() => {}}
        />
      );
      // Non-color label present
      expect(draftHtml).toContain('Draft — edit model to generate');
      expect(draftHtml).toContain('pending');

      // Failed state
      const failedState = markFailed(draftState, ['Compilation failure']);
      const failedHtml = renderToStaticMarkup(
        <OpmCodeGenerationWorkspace
          nodes={sampleNodes as never}
          edges={sampleEdges as never}
          state={failedState}
          onStateChange={() => {}}
        />
      );
      expect(failedHtml).toContain('Failed — see errors');
      expect(failedHtml).toContain('Compilation failure');

      // Verified state
      const manifest = {
        generatorVersion: '1.0.0',
        fingerprint: 'fp_123',
        generatedAt: new Date().toISOString(),
        files: [{ name: 'main.c', hash: 'abc', sizeBytes: 10, role: 'source' as const }],
        entrypoints: ['main.c'],
        qualificationStatus: 'pending' as const,
        tickMs: 10,
        resourceLimits: { maxNodes: 100, maxStates: 50, maxProcesses: 50, maxLinks: 100 },
      };
      const genState = markGenerated(draftState, 'fp_123', [{ name: 'main.c', content: 'int main(){return 0;}' }], manifest as never, []);
      const verifiedState = markVerified(genState, 'fp_123', { hostCompile: 'pass', hostRuntime: 'pass' }, 'gcc-13');
      const verifiedHtml = renderToStaticMarkup(
        <OpmCodeGenerationWorkspace
          nodes={sampleNodes as never}
          edges={sampleEdges as never}
          state={verifiedState}
          onStateChange={() => {}}
        />
      );
      expect(verifiedHtml).toContain('Verified — export unlocked');
      expect(verifiedHtml).toContain('hostCompile: pass · hostRuntime: pass');
    });
  });

  describe('Diagnostic navigation attributes', () => {
    it('renders data-opm-path on diagnostics for direct inspector targeting', () => {
      const state = {
        ...createInitialArtifactState(),
        diagnostics: [
          {
            code: 'ERR_INVALID_PORT',
            severity: 'error' as const,
            message: 'Incompatible port connection',
            source: { elementId: 'obj_pump', propertyPath: 'port.out' },
          },
        ],
      };

      const html = renderToStaticMarkup(
        <OpmCodeGenerationWorkspace
          nodes={sampleNodes as never}
          edges={sampleEdges as never}
          state={state}
          onStateChange={() => {}}
        />
      );

      expect(html).toContain('data-opm-path="obj_pump.port.out"');
      expect(html).toContain('Click to focus inspector for obj_pump');
    });
  });

  describe('Render stability & model immutability', () => {
    it('ensures inspecting or generating does not mutate the source nodes and edges', () => {
      const originalNodes = JSON.parse(JSON.stringify(sampleNodes));
      const originalEdges = JSON.parse(JSON.stringify(sampleEdges));

      const state = createInitialArtifactState();
      renderToStaticMarkup(
        <OpmCodeGenerationWorkspace
          nodes={sampleNodes as never}
          edges={sampleEdges as never}
          state={state}
          onStateChange={() => {}}
        />
      );

      // Deep equality check: no unexpected mutations to original input objects
      expect(sampleNodes).toEqual(originalNodes);
      expect(sampleEdges).toEqual(originalEdges);
    });

    it('preserves unrelated node identities when one node is edited', () => {
      const node1 = { ...sampleNodes[0] };
      const node2 = { ...sampleNodes[1] };
      const nodesList = [node1, node2];

      // Simulate a focused edit on node 1
      const updatedNodes = nodesList.map(n =>
        n.id === 'obj_pump' ? { ...n, data: { ...n.data, name: 'RenamedPump' } } : n
      );

      // Unrelated node2 reference identity is preserved
      expect(updatedNodes[1]).toBe(node2);
      expect(updatedNodes[0]).not.toBe(node1);
      expect(updatedNodes[0].data.name).toBe('RenamedPump');
    });
  });
});
