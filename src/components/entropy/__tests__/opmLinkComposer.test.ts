import { describe, it, expect } from 'vitest';
import { getValidTargetNodeIds } from '../OpmLinkComposer';
import type { AppNode } from '../EntropyTypes';
const nodes = [
  { id: 'o', type: 'opmObject', position: { x: 0, y: 0 }, data: { name: 'O', type: 'object', physical: false } },
  { id: 'p', type: 'opmProcess', position: { x: 0, y: 0 }, data: { name: 'P', type: 'process', physical: false } },
  { id: 'o2', type: 'opmObject', position: { x: 0, y: 0 }, data: { name: 'O2', type: 'object', physical: false } },
] as unknown as AppNode[];
describe('opm link composer', () => {
  it('lists only rule-valid targets for agent links', () => {
    expect(getValidTargetNodeIds(nodes, [], 'o', 'agent')).toEqual(['p']);
  });
});
