import { describe, test, expect } from 'vitest';
import { layoutOpmGraph } from '../OpmAutoLayout';
import { parseOpl } from '../OplParser';
import { OPM_EXAMPLES } from '../EntropyExamples';
import type { AppNode, AppEdge } from '../EntropyTypes';

describe('OpmAutoLayout', () => {
  test('arranges nodes in clean topological columns with zero overlap', () => {
    const airFryerOpl = OPM_EXAMPLES.smartAirFryer.oplText;
    const { nodes, edges } = parseOpl(airFryerOpl);

    const layouted = layoutOpmGraph(nodes, edges);
    expect(layouted.length).toBeGreaterThan(0);

    // Check parent objects & processes for overlaps
    const parents = layouted.filter(n => n.data.type !== 'state');

    for (let i = 0; i < parents.length; i++) {
      for (let j = i + 1; j < parents.length; j++) {
        const n1 = parents[i];
        const n2 = parents[j];

        // Check if same position (complete overlap)
        const isSamePosition = n1.position.x === n2.position.x && n1.position.y === n2.position.y;
        expect(isSamePosition).toBe(false);

        // If in same column, check vertical separation
        if (Math.abs(n1.position.x - n2.position.x) < 50) {
          const verticalDist = Math.abs(n1.position.y - n2.position.y);
          expect(verticalDist).toBeGreaterThanOrEqual(80);
        }
      }
    }
  });

  test('preserves child state positioning inside parent objects', () => {
    const { nodes, edges } = parseOpl(OPM_EXAMPLES.smartHome.oplText);
    const layouted = layoutOpmGraph(nodes, edges);

    const states = layouted.filter(n => n.data.type === 'state');
    states.forEach(s => {
      expect(s.position.x).toBeGreaterThanOrEqual(0);
      expect(s.position.y).toBeGreaterThanOrEqual(0);
    });
  });

  test('arranges sibling states horizontally with zero overlap', () => {
    const { nodes, edges } = parseOpl(OPM_EXAMPLES.smartAirFryer.oplText);
    const layouted = layoutOpmGraph(nodes, edges);

    const chamberDisplay = layouted.find(n => n.data.name === 'Chamber_Display');
    expect(chamberDisplay).toBeDefined();

    const chamberStates = layouted.filter(n => n.parentId === chamberDisplay!.id);
    expect(chamberStates.length).toBe(5);

    for (let i = 0; i < chamberStates.length - 1; i++) {
      const s1 = chamberStates[i];
      const s2 = chamberStates[i + 1];
      expect(s2.position.x - s1.position.x).toBeGreaterThanOrEqual(95);
      expect(s1.position.y).toBe(s2.position.y);
    }
  });
});
