// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { VLabDiagnostic } from '../../engine/vlab/vlabDiagnostics';
import rcCase from '../../../benchmarks/simscape/cases/rc_charging/vlab_model.json';

// A mocked worker: every step rejects with the typed diagnostic the test installs.
const mocks = vi.hoisted(() => ({ diagnostic: null as null | VLabDiagnostic, listeners: [] as ((d: VLabDiagnostic, id: number) => void)[] }));
vi.mock('../../services/vlabWorkerClient', () => {
  class VLabWorkerError extends Error {
    constructor(readonly diagnostic: VLabDiagnostic) { super(diagnostic.message); this.name = 'VLabWorkerError'; }
  }
  class VLabWorkerClient {
    available = true;
    lastDiagnostic: VLabDiagnostic | null = null;
    onDiagnostics(l: (d: VLabDiagnostic, id: number) => void) { mocks.listeners.push(l); return () => undefined; }
    step() {
      const d = mocks.diagnostic!;
      this.lastDiagnostic = d;
      mocks.listeners.forEach(l => l(d, 1));
      return Promise.reject(new VLabWorkerError(d));
    }
    dispose() { /* nothing */ }
  }
  return { VLabWorkerClient, VLabWorkerError };
});

import { VLabWorkspace } from './VLabWorkspace';

beforeAll(() => {
  class RO { observe() {} unobserve() {} disconnect() {} }
  (globalThis as any).ResizeObserver = (globalThis as any).ResizeObserver ?? RO;
  (globalThis as any).DOMMatrixReadOnly = (globalThis as any).DOMMatrixReadOnly ?? class { m22 = 1; constructor() {} };
  (globalThis as any).requestAnimationFrame = (globalThis as any).requestAnimationFrame ?? ((cb: FrameRequestCallback) => setTimeout(() => cb(0), 0));
  window.HTMLElement.prototype.scrollIntoView = window.HTMLElement.prototype.scrollIntoView ?? (() => undefined);
});
afterEach(() => { cleanup(); mocks.listeners.length = 0; mocks.diagnostic = null; });

const rcNodes = () => (rcCase as any).nodes.map((n: any) => ({ ...n, data: { ...n.data, label: n.id } }));
const rcEdges = () => (rcCase as any).edges;
const noop = () => undefined;
const mount = (nodes: any[], edges: any[], extra: Record<string, unknown> = {}) =>
  render(<VLabWorkspace nodes={nodes} edges={edges} onNodesChange={noop as any} onEdgesChange={noop as any} onResult={noop as any} onSendToDOE={noop as any} onBack={noop} {...extra} />);

describe('V-Lab workspace: diagnostics and migration notices', () => {
  it('shows a migration notice list once on load and hides it after dismissal', async () => {
    const nodes = rcNodes();
    nodes[0] = { ...nodes[0], data: { ...nodes[0].data, migrationNotices: ['Kt differed from Ke; Kt was discarded (Kt = Ke now).'] } };
    nodes[1] = { ...nodes[1], data: { ...nodes[1].data, migrationNotices: ['thermal reference is now +293.15 K'] } };
    mount(nodes, rcEdges());
    const banner = await screen.findByTestId('vlab-migration-banner');
    expect(banner.textContent).toContain('Kt differed from Ke');
    expect(banner.textContent).toContain('thermal reference is now +293.15 K');
    expect(banner.textContent).toContain('src');
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss migration notices' }));
    expect(screen.queryByTestId('vlab-migration-banner')).toBeNull();
  });

  it('shows no banner for a model without notices', async () => {
    mount(rcNodes(), rcEdges());
    await screen.findByText('RUN SIMULATION');
    expect(screen.queryByTestId('vlab-migration-banner')).toBeNull();
  });

  it('a failed run shows the worker diagnostic message and names the offending block (never a silent empty scope)', async () => {
    mocks.diagnostic = {
      code: 'BLOCK_EQUATION', message: 'Equation of block "res" threw: boom', name: 'BlockEquationError', blockId: 'res', blockIds: ['res'],
      portId: undefined, details: {}, items: [],
    };
    mount(rcNodes(), rcEdges());
    fireEvent.click(await screen.findByText('RUN SIMULATION'));
    const panel = await screen.findByTestId('vlab-diagnostics-panel', {}, { timeout: 5000 });
    expect(panel.getAttribute('data-diagnostic-code')).toBe('BLOCK_EQUATION');
    expect(screen.getByTestId('vlab-diagnostic-message').textContent).toContain('Equation of block "res" threw: boom');
    expect(screen.getByTestId('vlab-diagnostic-blocks').textContent).toContain('res');
    await waitFor(() => expect(document.querySelector('.vlab-node[data-vlab-diagnostic="true"]')).not.toBeNull());
  });

  it('edits a real parameter through the inspector: fractions and sci notation commit, out-of-bounds shows an error, and it persists through save/open', async () => {
    const saved: any[][] = [];
    const nodes = [{
      id: 'r1', type: 'default', position: { x: 0, y: 0 },
      data: { type: 'resistor', label: 'R1', params: { R: { value: 100, unit: 'Ω', label: 'Resistance' } } },
    }];
    const { unmount } = mount(nodes, [], { onNodesChange: (n: any[]) => saved.push(n) });
    fireEvent.click(await screen.findByText('R1'));
    const field = await screen.findByTestId('vlab-param-R');
    const input = field.querySelector('input')!;
    expect(field.textContent).toContain('Ω');
    expect(input.getAttribute('data-help-feature')).toBe('ui:vlab/VLabWorkspace:b5a7c9d05554');

    fireEvent.change(input, { target: { value: '2.5e-3' } });
    fireEvent.blur(input);
    expect(input.value).toBe('2.5e-3');
    fireEvent.change(input, { target: { value: '0' } });
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(input.value).toBe('0');

    await waitFor(() => expect(saved.length).toBeGreaterThan(0), { timeout: 3000 });
    const last = saved[saved.length - 1].find(n => n.id === 'r1');
    expect(last.data.params.R.value).toBe(0.0025);       // the invalid 0 was NOT written
    expect(last.data.params.R.unit).toBe('Ω');

    // save -> open
    const reopened = JSON.parse(JSON.stringify(saved[saved.length - 1]));
    unmount();
    mount(reopened, []);
    fireEvent.click(await screen.findByText('R1'));
    const again = (await screen.findByTestId('vlab-param-R')).querySelector('input')!;
    expect(again.value).toBe('0.0025');
  });

  it('keeps the pre-run topology diagnostics: a broken wiring is reported with the offending block', async () => {
    // an electrical conserving port wired straight to a scope input is not a valid connection
    const edges = [...rcEdges(), { id: 'bad', source: 'res', sourceHandle: 'p_s', target: 'scope', targetHandle: 'in1_t' }];
    mount(rcNodes(), edges);
    fireEvent.click(await screen.findByText('RUN SIMULATION'));
    const panel = await screen.findByTestId('vlab-diagnostics-panel');
    expect(panel.getAttribute('data-diagnostic-code')).toBe('TOPOLOGY');
    expect(screen.getByTestId('vlab-diagnostic-blocks').textContent).toContain('scope (in1)');
    await waitFor(() => expect(document.querySelector('.vlab-node[data-vlab-diagnostic="true"]')).not.toBeNull());
    expect(document.body.textContent).toContain('CANNOT RUN SIMULATION');
  });
});
