import { describe, it, expect } from 'vitest';
import { handleReportWorkerMessage, type ReportWorkerRequest } from './reportWorker';
import { buildTraceabilityMatrix, computeCoverageMetrics } from './rtm';
import { createEmptyRepository, type SysmlRepository } from './model';
import { renderRequirementsDiagram } from '../../features/reporting/reportDiagrams';
import { layoutLayered } from '../../features/reporting/reportDiagramLayout';

describe('SysML Report & Analysis Worker', () => {
  const createMockRepo = (reqCount = 5): SysmlRepository => {
    const repo = createEmptyRepository();
    for (let i = 1; i <= reqCount; i++) {
      repo.requirements[`req-${i}`] = {
        id: `req-${i}`,
        requirementId: `REQ-00${i}`,
        name: `Requirement ${i}`,
        text: `Specification text for requirement ${i}`,
        status: 'approved',
        owner: 'Engineering',
        risk: 'medium',
        derived: false,
      };
      // Add a block to satisfy it
      repo.definitions[`block-${i}`] = {
        id: `block-${i}`,
        name: `Subsystem ${i}`,
        stereotype: 'block',
      };
      // Add relationship
      repo.relationships[`rel-${i}`] = {
        id: `rel-${i}`,
        type: 'satisfy',
        sourceId: `block-${i}`,
        targetId: `req-${i}`,
      };
    }
    return repo;
  };

  it('produces RTM and metrics matching direct buildTraceabilityMatrix', () => {
    const repo = createMockRepo(10);
    const directMatrix = buildTraceabilityMatrix(repo);
    const directMetrics = computeCoverageMetrics(directMatrix);

    const request: ReportWorkerRequest = {
      requestId: 1,
      type: 'rtm',
      payload: repo,
    };

    const response = handleReportWorkerMessage(request);
    expect(response.ok).toBe(true);
    expect(response.result.matrix.rows.length).toBe(directMatrix.rows.length);
    expect(response.result.metrics.totalRequirements).toBe(directMetrics.totalRequirements);
    expect(response.result.metrics.coveragePercent).toBeCloseTo(directMetrics.coveragePercent, 4);
  });

  it('handles cyclic requirement containment graphs with visited-set protection without freezing or infinite loop', () => {
    // Cyclic requirement containment: REQ-1 contains REQ-2, REQ-2 contains REQ-1
    const cyclicBlocks: any[] = [
      { id: 'r1', name: 'Req 1', stereotype: 'requirement', reqId: 'REQ-1' },
      { id: 'r2', name: 'Req 2', stereotype: 'requirement', reqId: 'REQ-2' },
    ];
    const cyclicRels: any[] = [
      { id: 'c1', type: 'requirementContainment', sourceId: 'r1', targetId: 'r2' },
      { id: 'c2', type: 'requirementContainment', sourceId: 'r2', targetId: 'r1' },
    ];

    // Testing layoutLayered directly with cycle
    const sizedNodes = cyclicBlocks.map(b => ({ id: b.id, width: 100, height: 50, lines: [b.name] }));
    const placed = layoutLayered(sizedNodes, cyclicRels.map(r => ({ sourceId: r.sourceId, targetId: r.targetId })));
    expect(placed).toHaveLength(2);

    // Testing renderRequirementsDiagram with cycle
    expect(() => {
      renderRequirementsDiagram({ blocks: cyclicBlocks, relationships: cyclicRels });
    }).not.toThrow();
  });

  it('generates report diagrams off-thread for large models', () => {
    const repo = createMockRepo(25);
    const blocks: any[] = Object.values(repo.requirements).map(r => ({
      id: r.id,
      name: r.name,
      stereotype: 'requirement',
      reqId: r.requirementId,
    }));
    const relationships: any[] = Object.values(repo.relationships).map(rel => ({
      id: rel.id,
      sourceId: rel.sourceId,
      targetId: rel.targetId,
      type: rel.type,
    }));

    const req: ReportWorkerRequest = {
      requestId: 5,
      type: 'diagram',
      payload: { blocks, relationships },
    };

    const res = handleReportWorkerMessage(req);
    expect(res.ok).toBe(true);
    expect(res.result.svg).toContain('<svg');
    expect(res.result.svg).toContain('REQ-001');
  });
});
