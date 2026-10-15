// WP-01 acceptance tests (planner-owned). Contract: docs/superpowers/plans/2026-10-14-trm-simulation-loop.md §2.1
import { describe, expect, it } from 'vitest';
import { formatSimTarget, isSimTargetId, parseSimTarget, type SimTarget } from './simTarget';

const cases: [SimTarget, string][] = [
  [{ domain: 'sm', kind: 'transition', id: 't1' }, 'sim:sm/transition/t1'],
  [{ domain: 'sm', kind: 'variable', id: 'v-42' }, 'sim:sm/var/v-42'],
  [{ domain: 'xb', canvas: 'global', kind: 'block', blockId: 'pid1' }, 'sim:xb/global/pid1'],
  [{ domain: 'xb', canvas: 'global', kind: 'port', blockId: 'pid1', portId: 'omega' }, 'sim:xb/global/pid1/omega'],
  [{ domain: 'xb', canvas: 'state:s7', kind: 'param', blockId: 'gain', name: 'k' }, 'sim:xb/state%3As7/gain/$param/k'],
  [{ domain: 'vlab', canvas: 'file-9', kind: 'port', blockId: 'motor', portId: 'w' }, 'sim:vlab/file-9/motor/w'],
  [{ domain: 'vlab', canvas: 'global', kind: 'param', blockId: 'r1', name: 'R' }, 'sim:vlab/global/r1/$param/R'],
  [{ domain: 'vlab', canvas: 'global', kind: 'solverVariable', name: 'Across_n3_(electrical)' }, 'sim:vlab/global/$var/Across_n3_(electrical)'],
];

describe('simTarget codec', () => {
  it.each(cases)('formats %j as %s and parses it back', (target, id) => {
    expect(formatSimTarget(target)).toBe(id);
    expect(parseSimTarget(id)).toEqual(target);
  });

  it('round-trips ids containing slashes, spaces, colons and dollar signs', () => {
    const target: SimTarget = { domain: 'xb', canvas: 'state:a/b', kind: 'port', blockId: 'blk/1 x', portId: '$param' };
    const id = formatSimTarget(target);
    expect(id.split('/')).toHaveLength(4);
    expect(parseSimTarget(id)).toEqual(target);
  });

  it('keeps the same port id on two blocks distinct', () => {
    const a = formatSimTarget({ domain: 'vlab', canvas: 'global', kind: 'port', blockId: 'r1', portId: 'p' });
    const b = formatSimTarget({ domain: 'vlab', canvas: 'global', kind: 'port', blockId: 'r2', portId: 'p' });
    expect(a).not.toBe(b);
  });

  it('a block literally named "$var" or "$param" never collides with the reserved segments', () => {
    const port = formatSimTarget({ domain: 'vlab', canvas: 'global', kind: 'port', blockId: '$var', portId: 'x' });
    expect(parseSimTarget(port)).toEqual({ domain: 'vlab', canvas: 'global', kind: 'port', blockId: '$var', portId: 'x' });
  });

  it('rejects ids that are not sim targets or are malformed', () => {
    for (const bad of ['', 'state-1', 'sim:', 'sim:sm/state/s1', 'sim:xb/global', 'sim:foo/global/b', 'sim:sm/var/', 'sim:xb/global/b/p/extra', 'sim:sm/transition/a%ZZ']) {
      expect(parseSimTarget(bad)).toBeNull();
    }
    expect(isSimTargetId('sim:xb/global/pid1/omega')).toBe(true);
    expect(isSimTargetId('state-1')).toBe(false);
  });

  it('refuses to format a target with an empty segment', () => {
    expect(() => formatSimTarget({ domain: 'xb', canvas: 'global', kind: 'port', blockId: '', portId: 'p' })).toThrow();
  });
});
