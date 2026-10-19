import { describe, expect, it } from 'vitest';
import type { JunctionData, Layer, StateData, TransitionData } from '../../types/sm_types';
import { renderStateMachineDiagrams } from './reportDiagrams';
import { PAGE_FIT, figurePageFit, minFontSizeOf } from './reportDiagramModel';
import { edgeNodeCollisions, labelCollisions, outsideViewBox, parseFigure } from './figureGeometry.testutil';

function state(id: string, name: string, extra: Partial<StateData> = {}): StateData {
  return {
    id, name, x: 0, y: 0, width: 120, height: 60, entry: '', during: '', exit: '', isActive: false, color: '#ffffff',
    parentId: null, children: [], priority: 0, isParallel: false, regionId: null, autostart: false, ...extra,
  } as StateData;
}
const tr = (id: string, sourceId: string, targetId: string, condition = '', action = ''): TransitionData =>
  ({ id, sourceId, targetId, condition, action, afterTicks: null, type: 'condition', hasControlPoint: false, order: 0 }) as TransitionData;

const names = ['Init_SelfTest', 'ImmoCheck', 'StartInhibit', 'Standby', 'Crank_SyncSearch', 'Crank_StartFuel'];
const states = names.map((n, i) => state(`s${i}`, n, { autostart: i === 0, entry: i % 2 ? `starter = ${i}; injMode = ${i}` : '' }));
const guards: [number, number, string, string][] = [
  [0, 1, 'after(70)', ''],
  [1, 2, '[keyValid==false]', ''],
  [1, 3, '[keyValid==true && immoOk]', '/ starter=0'],
  [2, 1, '[keyValid==true]', ''],
  [3, 4, '[kl50==true && rpm==0 && battery>11]', ''],
  [4, 3, '[kl50==false || engineStalled==true]', ''],
  [4, 5, '[synced==true && crankOk]', '/ injMode=1'],
  [5, 3, 'after(400)', ''],
  [5, 5, '[rpm>450]', ''],
];
const transitions = guards.map(([a, b, c, act], i) => tr(`t${i}`, `s${a}`, `s${b}`, c.replace(/^\[|\]$/g, ''), act.replace(/^\/ /, '')));
const layer: Layer = { id: 'l', name: 'Powered', parentStateId: null, stateIds: states.map(s => s.id), transitionIds: transitions.map(t => t.id), junctionIds: [] };
// "after(70)" is written as a plain guard text here, so the label reads "[after(70)]"
const render = (extraStates: StateData[] = [], extraTransitions: TransitionData[] = [], junctions: JunctionData[] = []) =>
  renderStateMachineDiagrams({
    layers: [{ ...layer, stateIds: [...layer.stateIds, ...extraStates.map(s => s.id)], transitionIds: [...layer.transitionIds, ...extraTransitions.map(t => t.id)] }],
    states: [...states, ...extraStates], junctions, transitions: [...transitions, ...extraTransitions],
  })[0];

describe('state machine report layout, folded when the left-to-right picture would print too small', () => {
  const fig = render();
  const g = parseFigure(fig);

  it('fits a portrait page legibly (min font x scale >= 8)', () => {
    const fit = figurePageFit(g.viewBox, minFontSizeOf(fig));
    expect(fit.orientation).toBe('portrait');
    expect(fit.legible).toBe(true);
    expect(g.viewBox.width).toBeLessThanOrEqual(740);
    expect(g.viewBox.height).toBeLessThanOrEqual(PAGE_FIT.portrait.height / 0.9);
  });

  it('has no label/label or label/state overlaps, no route through a foreign state, nothing outside the viewBox', () => {
    expect(labelCollisions(g)).toEqual([]);
    expect(edgeNodeCollisions(g)).toEqual([]);
    expect(outsideViewBox(g)).toEqual([]);
  });

  it('draws every transition and keeps the full text of each label', () => {
    expect(g.edges.filter(e => e.id.startsWith('edge-t'))).toHaveLength(9);
    for (const [, , cond, action] of guards) {
      const text = [cond.startsWith('[') || cond.startsWith('after') ? cond : `[${cond}]`, action].filter(Boolean).join(' ');
      expect(fig, text).toContain(text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'));
    }
  });

  it('wraps wide ranks onto several rows instead of one long row', () => {
    const wide = Array.from({ length: 8 }, (_, i) => state(`w${i}`, `Wide state number ${i}`, { entry: 'a long entry action text' }));
    const extra = wide.map((s, i) => tr(`wt${i}`, 's0', s.id, `cond${i}`));
    const wg = parseFigure(render(wide, extra));
    expect(wg.viewBox.width).toBeLessThanOrEqual(900);
    expect(labelCollisions(wg)).toEqual([]);
    expect(edgeNodeCollisions(wg)).toEqual([]);
  });

  it('keeps a composite state around its children and routes into them', () => {
    const child = state('c1', 'ChildA', { parentId: 's3' });
    const child2 = state('c2', 'ChildB', { parentId: 's3' });
    const composite = states.map(s => (s.id === 's3' ? { ...s, children: ['c1', 'c2'] } : s));
    const out = renderStateMachineDiagrams({
      layers: [{ ...layer, stateIds: [...layer.stateIds, 'c1', 'c2'], transitionIds: [...layer.transitionIds, 'x1'] }],
      states: [...composite, child, child2], junctions: [], transitions: [...transitions, tr('x1', 'c1', 'c2', 'inner==true')],
    })[0];
    expect(out).toContain('class="sm-container"');
    const cg = parseFigure(out);
    expect(edgeNodeCollisions(cg)).toEqual([]);
    expect(labelCollisions(cg)).toEqual([]);
  });
});
