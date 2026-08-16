import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { ReportViewerModal } from './ReportViewerModal';
import { createMotorDriveTestReport } from '../../features/reporting/generators/createMotorDriveTestReport';

describe('ReportViewerModal', () => {
  it('exports ReportViewerModal component properly', () => {
    expect(ReportViewerModal).toBeDefined();
    expect(typeof ReportViewerModal).toBe('function');
  });

  it('creates valid React elements for open and closed states', () => {
    const doc = createMotorDriveTestReport();
    const closedEl = React.createElement(ReportViewerModal, { isOpen: false, onClose: vi.fn(), document: doc });
    expect(closedEl).toBeDefined();
    expect(closedEl.type).toBe(ReportViewerModal);
    expect(closedEl.props.isOpen).toBe(false);

    const openEl = React.createElement(ReportViewerModal, { isOpen: true, onClose: vi.fn(), document: doc });
    expect(openEl).toBeDefined();
    expect(openEl.type).toBe(ReportViewerModal);
    expect(openEl.props.isOpen).toBe(true);
    expect(openEl.props.document.header.documentTitle).toBe('Test and Fault-Isolation Procedure');
  });
});
