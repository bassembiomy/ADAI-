import { describe, expect, it } from 'vitest';
import { resolveActiveSysmlDiagramTarget } from './sysmlDiagramTarget';

describe('resolveActiveSysmlDiagramTarget', () => {
  it('uses the concrete Requirements diagram id for presentation commands', () => {
    expect(resolveActiveSysmlDiagramTarget({
      diagramMode: 'requirements',
      activeDiagramId: 'adia-default-requirements',
      currentLayerId: 'root',
    })).toBe('adia-default-requirements');
  });

  it('keeps IBD commands scoped to the active block even with an owned diagram id', () => {
    expect(resolveActiveSysmlDiagramTarget({
      diagramMode: 'ibd',
      activeDiagramId: 'ibd-owned-vehicle',
      currentLayerId: 'block-vehicle',
    })).toBe('block-vehicle');
  });
});
