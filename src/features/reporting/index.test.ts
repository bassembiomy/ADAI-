import { describe, expect, it } from 'vitest';
import * as reporting from './index';

describe('Reporting module facade', () => {
  it('exports all expected diagram renderers and model helpers', () => {
    expect(reporting.renderRequirementsDiagram).toBeTypeOf('function');
    expect(reporting.renderBddDiagram).toBeTypeOf('function');
    expect(reporting.renderIbdDiagram).toBeTypeOf('function');
    expect(reporting.renderStateMachineDiagrams).toBeTypeOf('function');
    expect(reporting.renderXbridgesDiagram).toBeTypeOf('function');
    expect(reporting.renderHmiDiagram).toBeTypeOf('function');
    expect(reporting.escapeHtml).toBeTypeOf('function');
    expect(reporting.layoutLayered).toBeTypeOf('function');
    expect(reporting.validateReportDocument).toBeTypeOf('function');
    expect(reporting.exportReportToPdf).toBeTypeOf('function');
    expect(reporting.saveReportAsPdf).toBeTypeOf('function');
    expect(reporting.generateReportDocxBuffer).toBeTypeOf('function');
    expect(reporting.saveReportAsDocx).toBeTypeOf('function');
    expect(reporting.createStateMachineVerificationReport).toBeTypeOf('function');
    expect(reporting.createMotorDriveTestReport).toBeTypeOf('function');
  });
});
