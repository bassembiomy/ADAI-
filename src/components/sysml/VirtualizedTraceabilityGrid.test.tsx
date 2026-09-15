import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  computeVirtualWindow,
  nextGridFocusIndex,
  VirtualizedTraceabilityGrid,
  type VirtualGridColumn,
} from './VirtualizedTraceabilityGrid';
import type { RtmRow } from '../../engine/sysml/rtm';

function mockRows(count: number): RtmRow[] {
  return Array.from({ length: count }, (_, i) => ({
    requirement: {
      id: `req-${i}`,
      requirementId: `REQ-${i.toString().padStart(3, '0')}`,
      name: `Requirement ${i}`,
      text: `Shall perform function ${i}`,
      status: i % 2 === 0 ? 'verified' : 'implemented',
      owner: i % 3 === 0 ? 'Alice' : 'Bob',
      risk: i % 4 === 0 ? 'critical' : 'medium',
      version: '1.0',
      kind: 'requirement' as const,
      namespace: ['System'],
    },
    status: i === 0 ? 'verified' : i === 1 ? 'failed' : i === 2 ? 'suspect' : 'covered',
    changeKind: i === 0 ? 'modified' : i === 1 ? 'added' : i === 2 ? 'suspect' : 'unchanged',
    relationshipIds: [`rel-${i}`],
    parents: [],
    children: [],
    coveringBlocks: [],
    requirementRelations: [],
    blocks: [`blk-${i}`],
    parts: [],
    ports: [],
    connectors: [],
    behaviors: [],
    simulations: [],
    verificationCases: [`vc-${i}`],
    evidence: [`ev-${i}`],
    artifacts: [],
    unresolvedEndpointIds: [],
  }));
}

describe('VirtualizedTraceabilityGrid component', () => {
  it('computes correct virtual window based on scrollTop, containerHeight, and rowHeight', () => {
    const window = computeVirtualWindow({
      totalRows: 100,
      scrollTop: 400,
      containerHeight: 200,
      rowHeight: 40,
      overscan: 2,
    });
    // 400 / 40 = startIndex 10. With overscan 2: start 8.
    // 200 / 40 = 5 visible rows. End index: 10 + 5 + 2 = 17.
    expect(window.startIndex).toBe(8);
    expect(window.endIndex).toBe(17);
    expect(window.offsetY).toBe(320); // 8 * 40
    expect(window.totalHeight).toBe(4000); // 100 * 40
  });

  it('renders accessible grid with virtualized rows and change-set badges', () => {
    const rows = mockRows(50);
    const html = renderToStaticMarkup(
      <VirtualizedTraceabilityGrid
        rows={rows}
        containerHeight={200}
        rowHeight={40}
        scrollTop={0}
      />
    );

    // Verify grid semantics
    expect(html).toContain('role="grid"');
    expect(html).toContain('aria-rowcount="50"');
    expect(html).toContain('REQ-000');
    expect(html).toContain('Requirement 0');
    // Verify status & change indicators
    expect(html).toContain('[MODIFIED]');
    expect(html).toContain('[ADDED]');
    expect(html).toContain('[SUSPECT]');
    expect(html).toContain('data-status="verified"');
  });

  it('handles bounded keyboard navigation across rows', () => {
    expect(nextGridFocusIndex(0, 'ArrowDown', 10)).toBe(1);
    expect(nextGridFocusIndex(9, 'ArrowDown', 10)).toBe(9);
    expect(nextGridFocusIndex(5, 'ArrowUp', 10)).toBe(4);
    expect(nextGridFocusIndex(5, 'Home', 10)).toBe(0);
    expect(nextGridFocusIndex(5, 'End', 10)).toBe(9);
    expect(nextGridFocusIndex(5, 'PageDown', 10, 5)).toBe(9);
    expect(nextGridFocusIndex(5, 'PageUp', 10, 5)).toBe(0);
  });

  it('renders hierarchy and covering blocks with relationship connection types in virtual grid', () => {
    const row: RtmRow = {
      requirement: {
        id: 'r1',
        requirementId: 'REQ-001',
        name: 'Parent Requirement',
        text: 'Top level',
        status: 'approved',
        version: '1.0',
        kind: 'requirement',
        namespace: [],
      },
      status: 'covered',
      relationshipIds: ['rc1', 's1'],
      parents: [],
      children: [{ id: 'r2', requirementId: 'REQ-002', name: 'Child Requirement', kind: 'requirementContainment' }],
      coveringBlocks: [{ id: 'b1', name: 'SubsystemBlock', kind: 'satisfy', type: 'block' }],
      requirementRelations: [],
      blocks: ['b1'],
      parts: [],
      ports: [],
      connectors: [],
      behaviors: [],
      simulations: [],
      verificationCases: [],
      evidence: [],
      artifacts: [],
      unresolvedEndpointIds: [],
    };

    const html = renderToStaticMarkup(
      <VirtualizedTraceabilityGrid
        rows={[row]}
        containerHeight={200}
        rowHeight={40}
        scrollTop={0}
      />
    );

    expect(html).toContain('Hierarchy &amp; Relations');
    expect(html).toContain('«containment»');
    expect(html).toContain('REQ-002');
    expect(html).toContain('«satisfy»');
    expect(html).toContain('SubsystemBlock');
  });

  it('renders deriveReqt, copy, refine, trace, and verify directional badges in grid', () => {
    const row: RtmRow = {
      requirement: {
        id: 'r1',
        requirementId: 'REQ-100',
        name: 'Target Req',
        text: 'Spec',
        status: 'approved',
        version: '1.0',
        kind: 'requirement',
        namespace: [],
      },
      status: 'covered',
      relationshipIds: [],
      parents: [],
      children: [],
      coveringBlocks: [],
      requirementRelations: [],
      containmentParents: [{ id: 'r0', requirementId: 'REQ-099', name: 'Parent', kind: 'requirementContainment' }],
      containmentChildren: [],
      derivedFrom: [{ id: 'rSrc', requirementId: 'REQ-050', name: 'Source', kind: 'deriveReqt' }],
      derivedRequirements: [],
      copiedFrom: [{ id: 'rMaster', requirementId: 'REQ-010', name: 'Master', kind: 'copy' }],
      copiedRequirements: [],
      satisfiedBy: [{ id: 'b1', name: 'ControlBlock', kind: 'satisfy', type: 'block' }],
      verifiedBy: [{ id: 't1', name: 'PressureTest', kind: 'verificationCase', type: 'verificationCase' }],
      refinedBy: [{ id: 'b2', name: 'RefiningBlock', kind: 'refine', type: 'block' }],
      tracedElements: [{ id: 'b3', name: 'TracedBlock', kind: 'trace', type: 'block' }],
      satisfactionStatus: 'satisfied',
      verificationStatus: 'not-run',
      blocks: ['b1'],
      parts: [],
      ports: [],
      connectors: [],
      behaviors: [],
      simulations: [],
      verificationCases: [],
      evidence: [],
      artifacts: [],
      unresolvedEndpointIds: [],
    };

    const html = renderToStaticMarkup(
      <VirtualizedTraceabilityGrid
        rows={[row]}
        containerHeight={200}
        rowHeight={40}
        scrollTop={0}
      />
    );

    expect(html).toContain('«containment»');
    expect(html).toContain('REQ-099');
    expect(html).toContain('«deriveReqt»');
    expect(html).toContain('REQ-050');
    expect(html).toContain('«copy»');
    expect(html).toContain('REQ-010');
    expect(html).toContain('«refine»');
    expect(html).toContain('RefiningBlock');
    expect(html).toContain('«trace»');
    expect(html).toContain('TracedBlock');
    expect(html).toContain('«satisfy»');
    expect(html).toContain('ControlBlock');
    expect(html).toContain('«verify»');
    expect(html).toContain('PressureTest');
  });
});
