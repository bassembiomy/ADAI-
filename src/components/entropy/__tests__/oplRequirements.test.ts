import { describe, test, expect } from 'vitest';
import { generateOpl, parseOpl } from '../OplParser';
import type { AppNode, AppEdge } from '../EntropyTypes';

const nodes: AppNode[] = [
  { id: 'p1', type: 'opmProcess', position: { x: 0, y: 0 },
    data: { name: 'Regulate', type: 'process', physical: false } },
  { id: 'r1', type: 'opmObject', position: { x: 0, y: 0 },
    data: { name: 'Fast_Response', type: 'requirement', physical: false,
      requirementText: 'System shall respond in under 2 seconds.' } },
];
const edges: AppEdge[] = [
  { id: 'e1', source: 'r1', target: 'p1', data: { type: 'satisfies' } },
];

describe('OPL requirement support', () => {
  test('generateOpl emits Requirement declaration and satisfies sentence', () => {
    const opl = generateOpl(nodes, edges);
    expect(opl).toContain('Requirement Fast_Response.');
    expect(opl).toContain('Fast_Response satisfies Regulate.');
  });

  test('parseOpl round-trips requirement declarations and satisfies links', () => {
    const { nodes: parsed, edges: parsedEdges, errors } = parseOpl(
      'Requirement Fast_Response.\nFast_Response satisfies Regulate.\nProcess Regulate.'
    );
    expect(errors).toHaveLength(0);
    expect(parsed.find(n => n.data.name === 'Fast_Response')?.data.type).toBe('requirement');
    expect(parsedEdges.find(e => e.data?.type === 'satisfies')).toBeTruthy();
  });

  test('parseOpl parses verifies links', () => {
    const { edges: parsedEdges, errors } = parseOpl(
      'Requirement Fast_Response.\nProcess Regulate.\nFast_Response verifies Regulate.'
    );
    expect(errors).toHaveLength(0);
    expect(parsedEdges.find(e => e.data?.type === 'verifies')).toBeTruthy();
  });
});
