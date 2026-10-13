// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { asV3, divergentModel, flatModel } from '../../engine/sysml/fixtures/formatV3Models';
import { loadRepository } from '../../engine/sysml/persistence';
import { SysmlUpgradeReportDialog, groupUpgradeChanges } from './SysmlUpgradeReportDialog';

describe('SysmlUpgradeReportDialog', () => {
  afterEach(cleanup);
  it('lists every change by name, groups them, and closes only when the user continues', () => {
    const report = loadRepository(asV3(flatModel())).upgradeReport!;
    const onClose = vi.fn();
    render(<SysmlUpgradeReportDialog report={report} backupPath="C:\\work\\Car.v3-backup.json" onClose={onClose} />);

    expect(screen.getByRole('dialog').textContent).toContain('format 5');
    expect(screen.getByTestId('upgrade-backup').textContent).toContain('Car.v3-backup.json');
    for (const change of report.changes) expect(screen.getAllByText(change.message).length).toBeGreaterThan(0);
    expect(screen.getByText(/Part Vehicle\.engine is now the property engine of Block Vehicle/)).toBeTruthy();
    // Nothing on screen is an internal id.
    const text = screen.getByRole('dialog').textContent ?? '';
    for (const id of ['u-eng', 'pu-eng-torque', 'pr-engine', 'b-veh', 'c-asm']) expect(text).not.toContain(id);

    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('highlights the changes to review and says so when the backup failed or there is none', () => {
    const report = loadRepository(asV3(divergentModel())).upgradeReport!;
    const { rerender } = render(<SysmlUpgradeReportDialog report={report} backupError="disk is full" onClose={vi.fn()} />);
    expect(screen.getByRole('alert').textContent).toContain('disk is full');
    expect(screen.getByText(/to review/)).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Blocks specialised to keep nested contents apart' })).toBeTruthy();

    rerender(<SysmlUpgradeReportDialog report={report} onClose={vi.fn()} />);
    expect(screen.getByTestId('upgrade-backup').textContent).toContain('was not changed');
  });

  it('is shown even when no model element needed to change', () => {
    render(<SysmlUpgradeReportDialog report={{ fromVersion: 3, toVersion: 5, changed: false, changes: [], keyMap: {} }} onClose={vi.fn()} />);
    expect(screen.getByTestId('upgrade-empty').textContent).toContain('No model elements needed to change');
  });

  it('orders the groups so that what needs a decision comes first', () => {
    const report = loadRepository(asV3(divergentModel())).upgradeReport!;
    const titles = groupUpgradeChanges(report.changes).map(group => group.kind);
    expect(titles[0]).toBe('type-specialised');
    expect(titles).toContain('part-to-property');
  });
});
