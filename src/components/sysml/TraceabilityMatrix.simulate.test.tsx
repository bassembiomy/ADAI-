// @vitest-environment jsdom
// WP-10 acceptance test (planner-owned): the RTM Simulate action is available in the standard and the virtualized view.
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEmptyRepository } from '../../engine/sysml/model';
import { TraceabilityMatrix } from './TraceabilityMatrix';

function repository() {
  const repo = createEmptyRepository();
  repo.requirements.r = { id: 'r', name: 'Safety', namespace: [], kind: 'requirement', requirementId: 'REQ-1', text: 'System shall be safe', status: 'implemented', version: '1' } as any;
  return repo;
}

describe('RTM Simulate action', () => {
  afterEach(cleanup);

  it.each([false, true])('opens simulation verification for a requirement (virtual=%s)', virtual => {
    const onSimulate = vi.fn();
    const onNavigate = vi.fn();
    render(<TraceabilityMatrix repository={repository()} onSimulate={onSimulate} onNavigate={onNavigate} />);
    if (virtual) fireEvent.click(screen.getByRole('button', { name: 'Virtualized Grid' }));
    fireEvent.click(screen.getByRole('button', { name: 'Simulate REQ-1' }));
    expect(onSimulate).toHaveBeenCalledWith('r');
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it.each([false, true])('shows no Simulate action without a handler (virtual=%s)', virtual => {
    render(<TraceabilityMatrix repository={repository()} />);
    if (virtual) fireEvent.click(screen.getByRole('button', { name: 'Virtualized Grid' }));
    expect(screen.queryByRole('button', { name: 'Simulate REQ-1' })).toBeNull();
  });
});
