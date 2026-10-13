// @vitest-environment jsdom
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { restoreConnectionErrorFocus, SysmlConnectionErrorDetails } from './SysmlConnectionErrorDetails';
import { rejectUiRelationship } from '../../services/sysmlConnectionUi';
import type { BlockData } from '../../types/sysml_types';

describe('SysmlConnectionErrorDetails', () => {
  afterEach(cleanup);
  it('keeps actual connection-policy reasons free of endpoint and type IDs', () => {
    const ids = ['65cb033e-421d-41e0-b789-87931d991010', '65cb033e-421d-41e0-b789-87931d991011'];
    const block = (id: string, stereotype: string): BlockData => ({ id, stereotype, name: '', x: 0, y: 0, width: 100, height: 80, properties: [], ports: [], operations: [], constraints: [], classes: [] });
    const rejection = rejectUiRelationship({ blocks: [block(ids[0], 'block'), block(ids[1], 'valueType')], parts: [], relationships: [] }, { id: 'rel', sourceId: ids[0], targetId: ids[1], type: 'composition', label: '' }, 'bdd')!;
    const { container } = render(<SysmlConnectionErrorDetails {...rejection} />);
    expect(rejection.source.id).toBe(ids[0]);
    expect(rejection.target.id).toBe(ids[1]);
    expect(container.textContent).toContain('Block (block)');
    expect(container.textContent).toContain('Value Type (valueType)');
    for (const id of ids) expect(container.textContent).not.toContain(id);
  });
  it('uses trimmed names and family labels for unnamed UUID endpoints', () => {
    const uuid = '65cb033e-421d-41e0-b789-87931d991010';
    const { container } = render(<SysmlConnectionErrorDetails
      relationshipKind="composition"
      source={{ id: 'source', name: '  Controller  ', family: 'block' }}
      target={{ id: uuid, name: ' ', family: 'block' }}
      diagnostic={{ code: 'INVALID', message: 'Invalid connection.', correctiveAction: 'Choose compatible endpoints.' }}
    />);
    expect(screen.getByText(/Controller \(block\)/)).toBeTruthy();
    expect(screen.getByText(/Block \(block\)/)).toBeTruthy();
    expect(screen.queryByText(uuid)).toBeNull();
    expect(container.textContent?.includes(uuid)).toBe(false);
  });
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

  it('backs error and warning text with semantic presentation tokens while keeping the text pairing', () => {
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

    expect(html).toContain('--sysml-sem-error');
    expect(html).toContain('--sysml-sem-warning');
    // Text pairing stays intact: color is never the sole indicator.
    expect(html).toContain('Reason:');
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
