import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { UseCaseInspector } from './UseCaseInspector';

describe('UseCaseInspector', () => {
  it('renders tabs and SysML architecture details', () => {
    const html = renderToStaticMarkup(
      <UseCaseInspector
        selectedNode={{
          id: 'uc-1',
          type: 'useCase',
          position: { x: 0, y: 0 },
          data: { label: 'Engage Autopilot', extensionPoints: ['EmergencyBrake'] },
        }}
        sysmlBlocks={[{ id: 'b-1', name: 'FlightGuidanceBlock', stereotype: 'block' }]}
        onUpdateNodeData={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(html).toContain('Properties');
    expect(html).toContain('SysML Architecture');
    expect(html).toContain('Traceability');
    expect(html).toContain('Engage Autopilot');
  });
});
