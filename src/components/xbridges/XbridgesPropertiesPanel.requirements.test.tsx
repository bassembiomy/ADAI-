// @vitest-environment jsdom
// WP-10b acceptance test (planner-owned): the X-Bridges properties panel hosts the requirement assignments of the selected block.
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { XbridgesPropertiesPanel } from './XbridgesPropertiesPanel';

const block = { id: 'i1', type: 'INTEGRATOR_CONTINUOUS', params: { initial_condition: 2 }, inputs: [{ id: 'u', label: 'u' }], outputs: [{ id: 'y', label: 'y' }] } as any;

describe('XbridgesPropertiesPanel requirement assignments', () => {
  afterEach(cleanup);

  it('renders the requirement assignments it is given for the selected block', () => {
    render(<XbridgesPropertiesPanel block={block} onUpdate={vi.fn()} onClose={vi.fn()} requirementAssignments={<section aria-label="Requirements of i1">REQ slot</section>} />);
    expect(screen.getByRole('region', { name: 'Requirements of i1' }).textContent).toBe('REQ slot');
  });

  it('renders as before without them', () => {
    render(<XbridgesPropertiesPanel block={block} onUpdate={vi.fn()} onClose={vi.fn()} />);
    expect(screen.queryByRole('region', { name: /Requirements of/ })).toBeNull();
  });
});
