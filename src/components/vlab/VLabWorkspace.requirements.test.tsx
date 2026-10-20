// @vitest-environment jsdom
// WP-10b acceptance test (planner-owned): the V-Lab properties panel hosts the requirement assignments of the selected component.
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import rcCase from '../../../benchmarks/simscape/cases/rc_charging/vlab_model.json';
import { VLabWorkspace } from './VLabWorkspace';

beforeAll(() => {
  class RO { observe() {} unobserve() {} disconnect() {} }
  (globalThis as any).ResizeObserver = (globalThis as any).ResizeObserver ?? RO;
  (globalThis as any).DOMMatrixReadOnly = (globalThis as any).DOMMatrixReadOnly ?? class { m22 = 1; constructor() {} };
  (globalThis as any).requestAnimationFrame = (globalThis as any).requestAnimationFrame ?? ((cb: FrameRequestCallback) => setTimeout(() => cb(0), 0));
  window.HTMLElement.prototype.scrollIntoView = window.HTMLElement.prototype.scrollIntoView ?? (() => undefined);
});
afterEach(cleanup);

const nodes = () => (rcCase as any).nodes.map((n: any) => ({ ...n, data: { ...n.data, label: n.id } }));
const noop = () => undefined;

describe('V-Lab properties requirement assignments', () => {
  it('renders the requirement assignments for the selected component', async () => {
    const id = (rcCase as any).nodes[0].id as string;
    render(<VLabWorkspace nodes={nodes()} edges={(rcCase as any).edges} onNodesChange={noop as any} onEdgesChange={noop as any} onResult={noop as any} onSendToDOE={noop as any} onBack={noop}
      initialSelectedNodeId={id}
      renderRequirementAssignments={(blockId: string) => <section aria-label={`Requirements of ${blockId}`}>REQ slot</section>} />);
    expect((await screen.findByRole('region', { name: `Requirements of ${id}` }, { timeout: 5000 })).textContent).toBe('REQ slot');
  });

  it('renders nothing extra without it', async () => {
    render(<VLabWorkspace nodes={nodes()} edges={(rcCase as any).edges} onNodesChange={noop as any} onEdgesChange={noop as any} onResult={noop as any} onSendToDOE={noop as any} onBack={noop}
      initialSelectedNodeId={(rcCase as any).nodes[0].id} />);
    await screen.findByText('RUN SIMULATION');
    expect(screen.queryByRole('region', { name: /Requirements of/ })).toBeNull();
  });
});
