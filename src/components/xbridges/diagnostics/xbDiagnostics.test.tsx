// @vitest-environment jsdom
/**
 * Acceptance tests — X-Bridges run diagnostics: pop-up on run and status bar with meanings.
 * Plan: docs/superpowers/plans/2026-11-08-xbridges-diagnostics-popup-statusbar.md
 */
import React from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ModelDiagnostic } from '../../../engine/xbridges/types';
import {
  XBRIDGES_EMBEDDED_DIAGNOSTIC_GUIDANCE,
  XBRIDGES_SIMULATION_DIAGNOSTIC_GUIDANCE,
} from '../../../help/diagnosticGuidance';
import {
  countDiagnostics,
  describeDiagnostic,
  mergeDiagnostics,
  newDiagnostics,
} from './xbDiagnosticsModel';
import { XbridgesStatusBar } from './XbridgesStatusBar';
import { XbridgesDiagnosticPopup } from './XbridgesDiagnosticPopup';

afterEach(() => { cleanup(); vi.useRealTimers(); });

const divide: ModelDiagnostic = { severity: 'warning', code: 'DIVIDE_BY_ZERO', message: "Block 'Product': division by zero.", blockIds: ['p1'] };
const improper: ModelDiagnostic = { severity: 'error', code: 'TF_IMPROPER', message: "Transfer function 'TF' is improper.", blockIds: ['tf1'] };
const unconnected: ModelDiagnostic = { severity: 'warning', code: 'UNCONNECTED_INPUT_PORT', message: "Block 'Gain' input 'u' is not connected.", blockIds: ['g1'] };
const embedded: ModelDiagnostic = { severity: 'error', code: 'XB_PORT_DANGLING', message: "Scalar input 'b:u' requires exactly one driver; found 0." };
const unknown: ModelDiagnostic = { severity: 'info', code: 'SOMETHING_NEW', message: 'Something new happened.' };

const strip = (text: string) => text.replace(/^(Error|Warning|Info): /, '');

describe('diagnostic model', () => {
  it('describes a simulation code with its help meaning and chapter', () => {
    const d = describeDiagnostic(divide);
    expect(d).toMatchObject({ code: 'DIVIDE_BY_ZERO', severity: 'warning', message: divide.message, blockIds: ['p1'], helpTopicId: 'xbridges-simulation', helpSectionId: 'errors' });
    expect(d.meaning).toBe(strip(XBRIDGES_SIMULATION_DIAGNOSTIC_GUIDANCE.DIVIDE_BY_ZERO));
  });
  it('describes a code-generation code with the code-generation chapter', () => {
    const d = describeDiagnostic(embedded);
    expect(d.helpTopicId).toBe('xbridges-code-generation');
    expect(d.meaning).toBe(strip(XBRIDGES_EMBEDDED_DIAGNOSTIC_GUIDANCE.XB_PORT_DANGLING));
    expect(d.blockIds).toEqual([]);
  });
  it('falls back for a code without a help entry', () => {
    const d = describeDiagnostic(unknown);
    expect(d.helpTopicId).toBe('xbridges-simulation');
    expect(d.meaning).toMatch(/no help entry/i);
  });
  it('counts by severity', () => {
    expect(countDiagnostics([divide, improper, unconnected, unknown])).toEqual({ errors: 1, warnings: 2, infos: 1 });
  });
  it('merges without duplicates and reports only new items', () => {
    const merged = mergeDiagnostics([divide, improper], [improper, unconnected, { ...divide }]);
    expect(merged).toEqual([divide, improper, unconnected]);
    expect(newDiagnostics([divide, improper], [improper, unconnected, { ...divide }])).toEqual([unconnected]);
  });
  it('treats the same code on another block as a new item', () => {
    expect(newDiagnostics([divide], [{ ...divide, blockIds: ['p2'] }])).toHaveLength(1);
  });
});

describe('status bar', () => {
  const props = {
    status: 'running' as const,
    time: 1.25,
    solver: 'Discrete (fixed-step, no continuous states)',
    stopTime: '10',
    fixedStep: 'auto',
    onSelectBlocks: vi.fn(),
    onOpenHelp: vi.fn(),
  };

  it('shows run status, time, solver and problem counts', () => {
    render(<XbridgesStatusBar {...props} diagnostics={[divide, improper, unconnected]} />);
    const bar = screen.getByRole('status', { name: 'X-Bridges status bar' });
    expect(bar.textContent).toContain('Running');
    expect(bar.textContent).toContain('t = 1.250 s');
    expect(bar.textContent).toContain('Discrete');
    expect(bar.textContent).toContain('1 error');
    expect(bar.textContent).toContain('2 warnings');
  });

  it('says there are no problems when the list is empty', () => {
    render(<XbridgesStatusBar {...props} status="idle" diagnostics={[]} />);
    const bar = screen.getByRole('status', { name: 'X-Bridges status bar' });
    expect(bar.textContent).toContain('Idle');
    expect(bar.textContent).toMatch(/no problems/i);
  });

  it('expands to list each problem with its message and meaning', () => {
    render(<XbridgesStatusBar {...props} diagnostics={[divide, improper]} />);
    const toggle = screen.getByRole('button', { name: /problems/i });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    const items = within(screen.getByRole('list', { name: 'Problems' })).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    const first = items.find((i) => i.textContent!.includes('TF_IMPROPER'))!;
    expect(first.textContent).toContain(improper.message);
    expect(first.textContent).toContain(strip(XBRIDGES_SIMULATION_DIAGNOSTIC_GUIDANCE.TF_IMPROPER).slice(0, 60));
  });

  it('lists errors before warnings', () => {
    render(<XbridgesStatusBar {...props} diagnostics={[divide, improper]} />);
    fireEvent.click(screen.getByRole('button', { name: /problems/i }));
    const items = within(screen.getByRole('list', { name: 'Problems' })).getAllByRole('listitem');
    expect(items[0].textContent).toContain('TF_IMPROPER');
  });

  it('selects the offending block and opens the matching help chapter', () => {
    const onSelectBlocks = vi.fn();
    const onOpenHelp = vi.fn();
    render(<XbridgesStatusBar {...props} onSelectBlocks={onSelectBlocks} onOpenHelp={onOpenHelp} diagnostics={[divide, embedded]} />);
    fireEvent.click(screen.getByRole('button', { name: /problems/i }));
    const list = screen.getByRole('list', { name: 'Problems' });
    const divideItem = within(list).getAllByRole('listitem').find((i) => i.textContent!.includes('DIVIDE_BY_ZERO'))!;
    fireEvent.click(within(divideItem).getByRole('button', { name: /show block/i }));
    expect(onSelectBlocks).toHaveBeenCalledWith(['p1']);
    fireEvent.click(within(divideItem).getByRole('button', { name: /help/i }));
    expect(onOpenHelp).toHaveBeenCalledWith('xbridges-simulation', 'errors');
    const embeddedItem = within(list).getAllByRole('listitem').find((i) => i.textContent!.includes('XB_PORT_DANGLING'))!;
    expect(within(embeddedItem).queryByRole('button', { name: /show block/i })).toBeNull();
    fireEvent.click(within(embeddedItem).getByRole('button', { name: /help/i }));
    expect(onOpenHelp).toHaveBeenLastCalledWith('xbridges-code-generation', 'errors');
  });
});

describe('pop-up on run', () => {
  it('renders nothing without new diagnostics', () => {
    const { container } = render(<XbridgesDiagnosticPopup diagnostics={[]} onDismiss={vi.fn()} onShowAll={vi.fn()} />);
    expect(container.innerHTML).toBe('');
  });

  it('announces errors as an alert with message and meaning, and does not hide itself', () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    render(<XbridgesDiagnosticPopup diagnostics={[improper, unconnected]} onDismiss={onDismiss} onShowAll={vi.fn()} />);
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('1 error');
    expect(alert.textContent).toContain('1 warning');
    expect(alert.textContent).toContain('TF_IMPROPER');
    expect(alert.textContent).toContain(improper.message);
    expect(alert.textContent).toContain(strip(XBRIDGES_SIMULATION_DIAGNOSTIC_GUIDANCE.TF_IMPROPER).slice(0, 60));
    act(() => { vi.advanceTimersByTime(60_000); });
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('announces warnings politely and hides them after the auto-hide delay', () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    render(<XbridgesDiagnosticPopup diagnostics={[divide]} onDismiss={onDismiss} onShowAll={vi.fn()} autoHideMs={8000} />);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('status').textContent).toContain('DIVIDE_BY_ZERO');
    act(() => { vi.advanceTimersByTime(7999); });
    expect(onDismiss).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(1); });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('shows at most three items and how many more', () => {
    const many = [1, 2, 3, 4, 5].map((n) => ({ ...unconnected, blockIds: [`g${n}`], message: `Block 'Gain${n}' input 'u' is not connected.` }));
    render(<XbridgesDiagnosticPopup diagnostics={many} onDismiss={vi.fn()} onShowAll={vi.fn()} />);
    const pop = screen.getByRole('status');
    expect(within(pop).getAllByRole('listitem')).toHaveLength(3);
    expect(pop.textContent).toContain('2 more');
  });

  it('can be dismissed or opened in the status bar', () => {
    const onDismiss = vi.fn();
    const onShowAll = vi.fn();
    render(<XbridgesDiagnosticPopup diagnostics={[improper]} onDismiss={onDismiss} onShowAll={onShowAll} />);
    fireEvent.click(screen.getByRole('button', { name: /view all/i }));
    expect(onShowAll).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
