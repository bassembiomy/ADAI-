import { describe, expect, it } from 'vitest';
import { generateTraceabilityReport } from './smTraceabilityEngine';
import { flatOrFixture } from './smFixtures';
import { buildSemanticModel } from './smSemanticBuilder';
import { generateCArtifacts } from './smCGenerator';

describe('smTraceabilityEngine', () => {
  it('parses traceId markers to resolve exact multi-location line ranges', () => {
    const model = flatOrFixture();
    const { ir } = buildSemanticModel(model);
    const artifacts = generateCArtifacts(ir!);
    const report = generateTraceabilityReport(ir!, artifacts.files);
    
    expect(report.mappings.length).toBeGreaterThan(0);
    const mapping = report.mappings[0];
    expect(mapping.traceId).toBeDefined();
    expect(mapping.locations.length).toBeGreaterThan(0);
    expect(mapping.locations[0].startLine).toBeGreaterThan(0);
    expect(mapping.locations[0].endLine).toBeGreaterThanOrEqual(mapping.locations[0].startLine);
  });

  it('throws TRACEABILITY_UNRESOLVED if a required element marker is missing', () => {
    const model = flatOrFixture();
    const { ir } = buildSemanticModel(model);
    expect(() => generateTraceabilityReport(ir!, [])).toThrow('TRACEABILITY_UNRESOLVED');
  });
});
