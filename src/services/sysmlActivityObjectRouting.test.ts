import { it, expect } from 'vitest';
import type { ActivityDefinition } from '../engine/sysml/model';
import { inferEdgeKind } from './sysmlActivityCommands';

it('continues an object flow between routing nodes after a typed source pin', () => {
  const activity: ActivityDefinition = { id: 'activity', kind: 'activity', name: 'Route', namespace: [], ownerId: 'model', parameters: [], partitions: [],
    nodes: [
      { id: 'producer', name: 'Producer', kind: 'action', pins: [{ id: 'out', name: 'out', direction: 'out' }] },
      { id: 'decision', name: 'Decision', kind: 'decision' },
      { id: 'merge', name: 'Merge', kind: 'merge' },
    ], edges: [{ id: 'input', kind: 'objectFlow', sourceId: 'out', targetId: 'decision' }],
  };
  expect(inferEdgeKind(activity, 'decision', 'merge')).toBe('objectFlow');
  expect(inferEdgeKind({ ...activity, edges: [] }, 'decision', 'merge')).toBe('controlFlow');
});
