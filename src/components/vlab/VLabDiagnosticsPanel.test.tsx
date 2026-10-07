// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { VLabDiagnosticsPanel, diagnosticTargets, toRunDiagnostic, topologyRunDiagnostic } from './VLabDiagnosticsPanel';
import { VLabWorkerError } from '../../services/vlabWorkerClient';
import type { VLabDiagnostic } from '../../engine/vlab/vlabDiagnostics';
import { VLabParamError } from '../../engine/vlab/vlabParams';
import { VLabNode } from './VLabNode';
import { ReactFlowProvider } from '@xyflow/react';

afterEach(cleanup);

const diag = (over: Partial<VLabDiagnostic>): VLabDiagnostic => ({
  code: 'DAE_STRUCTURE', message: 'Block "R1" supplies 1 equation rows but needs 2.', name: 'DAEStructureError',
  blockId: 'r1', blockIds: ['r1'], portId: undefined, details: {}, items: [], ...over,
});

describe('V-Lab diagnostics display (mocked worker responses)', () => {
  it.each([
    ['TOPOLOGY', 'Invalid topology'], ['PORT_WIDTH', 'Port width mismatch'], ['DAE_STRUCTURE', 'Ill-posed system structure'],
    ['NON_FINITE_RESIDUAL', 'Non-finite residual'], ['BLOCK_EQUATION', 'Block equation failed'], ['SCOPE_READ', 'Scope cannot read its signal'],
    ['SOLVER', 'Solver failure'], ['PARAM', 'Invalid parameter'], ['MULTIBODY_CONSTRAINT', 'Multibody constraint failure'], ['WORKER', 'Simulation worker failure'],
  ] as const)('shows the %s diagnostic message, title and the offending block', (code, title) => {
    const d = diag({ code, message: `message for ${code}`, blockId: 'blk', blockIds: ['blk'], portId: 'p' });
    render(<VLabDiagnosticsPanel diagnostic={d} labelOf={(id) => (id === 'blk' ? 'Spring 1' : id)} />);
    expect(screen.getByTestId('vlab-diagnostic-message').textContent).toBe(`message for ${code}`);
    expect(screen.getByTestId('vlab-diagnostic-title').textContent).toContain(title);
    expect(screen.getByTestId('vlab-diagnostics-panel').getAttribute('data-diagnostic-code')).toBe(code);
    expect(screen.getByTestId('vlab-diagnostic-blocks').textContent).toContain('Spring 1');
  });

  it('turns a rejected worker step (VLabWorkerError.diagnostic) into the displayed diagnostic', () => {
    const carried = diag({ code: 'PARAM', message: 'Parameter "R" of "R1": "abc" is not a number.', blockId: 'r1', blockIds: ['r1'] });
    const fromWorker = toRunDiagnostic(new VLabWorkerError(carried));
    expect(fromWorker).toBe(carried);
    render(<VLabDiagnosticsPanel diagnostic={fromWorker} />);
    expect(screen.getByRole('alert').textContent).toContain('"abc" is not a number');
  });

  it('serializes a plain engine error the same way (no worker)', () => {
    const d = toRunDiagnostic(new VLabParamError([{ blockId: 'c1', param: 'C', raw: 'x', reason: 'Parameter "C" of "c1": "x" is not a number.', code: 'invalid-parameter' }]));
    expect(d.code).toBe('PARAM');
    expect(d.blockIds).toEqual(['c1']);
    expect(toRunDiagnostic(new Error('boom')).code).toBe('UNKNOWN');
  });

  it('lists every underlying problem of a multi-item diagnostic with its block and port', () => {
    const d = diag({
      code: 'TOPOLOGY', message: 'Invalid V-Lab topology: 2 problem(s)', blockId: 'a', blockIds: ['a', 'b'], portId: 'p_t',
      items: [
        { code: 'unconnected-required-port', message: 'port p_t is not connected', blockId: 'a', portId: 'p_t', details: {} },
        { code: 'domain-mismatch', message: 'electrical to thermal', blockId: 'b', portId: 'n_s', details: { otherBlockId: 'c', otherPortId: 'p_s' } },
      ],
    });
    render(<VLabDiagnosticsPanel diagnostic={d} />);
    const items = screen.getByTestId('vlab-diagnostic-items').textContent!;
    expect(items).toContain('a.p_t');
    expect(items).toContain('b.n_s');
    expect(items).toContain('electrical to thermal');
    const targets = diagnosticTargets(d);
    expect([...targets.keys()].sort()).toEqual(['a', 'b', 'c']);
    expect([...targets.get('a')!]).toEqual(['p_t']);
    expect([...targets.get('c')!]).toEqual(['p_s']);
  });

  it('builds a TOPOLOGY diagnostic from the pre-run topology report', () => {
    const d = topologyRunDiagnostic('Invalid V-Lab topology: 1 problem(s)', [{ code: 'x', reason: 'r', blockId: 'gnd', portId: 'a' }]);
    expect(d.code).toBe('TOPOLOGY');
    expect(d.blockIds).toEqual(['gnd']);
    expect(d.portId).toBe('a');
  });

  it('selects the block when its button is clicked and can be dismissed', () => {
    const onSelect = vi.fn(); const onDismiss = vi.fn();
    render(<VLabDiagnosticsPanel diagnostic={diag({})} onSelectBlock={onSelect} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByRole('button', { name: 'r1' }));
    expect(onSelect).toHaveBeenCalledWith('r1');
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss diagnostic' }));
    expect(onDismiss).toHaveBeenCalled();
  });

  it('renders nothing without a diagnostic', () => {
    const { container } = render(<VLabDiagnosticsPanel diagnostic={null} />);
    expect(container.innerHTML).toBe('');
  });

  it('highlights the offending block and port on the canvas node', () => {
    const data = { type: 'resistor', label: 'R1', rotation: 0, ports: [{ id: 'p', pos: 'left', label: '+' }, { id: 'n', pos: 'right', label: '-' }], diagnosticPorts: ['n'] };
    const { container } = render(<ReactFlowProvider><VLabNode id="r1" data={data} selected={false} /></ReactFlowProvider>);
    expect(container.querySelector('.vlab-node')!.getAttribute('data-vlab-diagnostic')).toBe('true');
    const flagged = [...container.querySelectorAll('.vlab-handle-diagnostic')].map(h => h.getAttribute('data-handleid'));
    expect(flagged.length).toBe(2); // the source and the target handle of port n
    expect(flagged.every(id => id === 'r1-n')).toBe(true);
  });

  it('does not highlight a block that is not named by the diagnostic', () => {
    const data = { type: 'resistor', label: 'R1', rotation: 0, ports: [{ id: 'p', pos: 'left' }], };
    const { container } = render(<ReactFlowProvider><VLabNode id="r1" data={data} selected={false} /></ReactFlowProvider>);
    expect(container.querySelector('.vlab-node')!.getAttribute('data-vlab-diagnostic')).toBeNull();
    expect(container.querySelector('.vlab-handle-diagnostic')).toBeNull();
  });
});
