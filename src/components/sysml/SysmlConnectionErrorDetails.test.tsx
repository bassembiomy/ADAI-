import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { restoreConnectionErrorFocus, SysmlConnectionErrorDetails } from './SysmlConnectionErrorDetails';

describe('SysmlConnectionErrorDetails', () => {
  it('renders explicit source and target endpoint-family labels with corrective guidance', () => {
    const html = renderToStaticMarkup(
      <SysmlConnectionErrorDetails
        relationshipKind="composition"
        source={{ id: 'engine', name: 'Engine', family: 'block' }}
        target={{ id: 'mass', name: 'Mass', family: 'valueType' }}
        diagnostic={{
          code: 'INVALID_AGGREGATION_ENDPOINTS',
          message: 'composition is invalid',
          correctiveAction: 'Create a value property instead.',
        }}
      />,
    );

    expect(html).toContain('Relationship:</span> composition');
    expect(html).toContain('Source endpoint:</span> Engine (block)');
    expect(html).toContain('Target endpoint:</span> Mass (valueType)');
    expect(html).toContain('How to fix it:');
  });

  it('restores focus to the captured trigger through the supplied scheduler', () => {
    const focus = vi.fn();
    const schedule = vi.fn((callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });

    restoreConnectionErrorFocus({ focus } as unknown as HTMLElement, schedule);

    expect(schedule).toHaveBeenCalledOnce();
    expect(focus).toHaveBeenCalledOnce();
  });
});
