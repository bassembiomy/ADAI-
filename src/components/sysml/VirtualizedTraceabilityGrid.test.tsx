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
});
