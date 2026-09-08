import { describe, it, expect } from 'vitest';
import type { ReportModelInput } from '../../services/reportModelConsistency';
import type { BlockData, ConnectorData, PartData, RelationshipData } from '../../types/sysml_types';
import { createReportSnapshot, toHierarchySource } from './reportSnapshot';
import { generateArchitectureReport } from './generateArchitectureReport';

function modelWithDeletedRequirementLinkAndConnector(): ReportModelInput {
  const b1: BlockData = {
    id: 'b1',
    name: 'Engine',
    stereotype: 'block',
    x: 0,
    y: 0,
    width: 100,
    height: 80,
    properties: [],
    operations: [],
    constraints: [],
    classes: [],
    ports: [],
  };

  const p1: PartData = {
    id: 'p1',
    name: 'Piston',
    blockId: 'b1',
    x: 0,
    y: 0,
    width: 80,
    height: 60,
  };

  const danglingRel: RelationshipData = {
    id: 'deleted-rel',
    sourceId: 'b1',
    targetId: 'missing-req',
    type: 'satisfy',
    label: '',
  };

  const danglingConn: ConnectorData = {
    id: 'deleted-connector',
    sourcePartId: 'p1',
    targetPartId: 'missing-part',
    sourcePortId: 'p1',
    targetPortId: 'p2',
  };

  return {
    blocks: [b1],
    parts: [p1],
    relationships: [danglingRel],
    connectors: [danglingConn],
  };
}

describe('reportConsistency - Integration', () => {
  it('omits deleted requirement relationships and IBD connectors from the generated report', async () => {
    const snapshot = createReportSnapshot(modelWithDeletedRequirementLinkAndConnector());
    const html = generateArchitectureReport(toHierarchySource(snapshot), snapshot.diagnostics);

    expect(html).not.toContain('edge-deleted-rel');
    expect(html).not.toContain('edge-deleted-connector');
    expect(html).toContain('removed connections: 2');
  });
});
