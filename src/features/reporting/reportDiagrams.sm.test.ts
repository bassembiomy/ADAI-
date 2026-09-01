import { describe, expect, it } from 'vitest';
import { JunctionData, Layer, StateData, TransitionData } from '../../types/sm_types';
import { renderStateMachineDiagrams } from './reportDiagrams';

function state(partial: Partial<StateData> & { id: string; name: string }): StateData {
  return {
    x: 0, y: 0, width: 120, height: 60, entry: '', during: '', exit: '',
    isActive: false, color: '#ffffff', parentId: null, children: [], priority: 0,
    isParallel: false, regionId: null, autostart: false,
    ...partial,
  } as StateData;
}

function transition(partial: Partial<TransitionData> & { id: string; sourceId: string; targetId: string }): TransitionData {
  return { condition: '', action: '', afterTicks: null, type: 'condition', hasControlPoint: false, order: 0, ...partial } as TransitionData;
}

const states = [
  state({ id: 'idle', name: 'Idle', autostart: true }),
  state({ id: 'heat', name: 'Heating', entry: 'heater = on' }),
  state({ id: 'op', name: 'Operating', children: ['heat'] }),
  state({ id: 'cool', name: 'Cooling' }),
];
(states.find(s => s.id === 'heat') as StateData).parentId = 'op';

const junctions: JunctionData[] = [
  { id: 'h1', x: 0, y: 0, name: '', color: '#000000', parentId: null, type: 'history' } as JunctionData,
];

const transitions = [
  transition({ id: 't1', sourceId: 'idle', targetId: 'heat', condition: 'temperature < limit', action: 'fan = on' }),
  transition({ id: 't2', sourceId: 'heat', targetId: 'cool', condition: 'temperature > limit' }),
  transition({ id: 't3', sourceId: 'cool', targetId: 'cool', condition: 'recheck' }),
];

const layers: Layer[] = [
  { id: 'l1', name: 'Root Region', parentStateId: null, stateIds: ['idle', 'op', 'heat', 'cool'], transitionIds: ['t1', 't2', 't3'], junctionIds: ['h1'] },
  { id: 'l2', name: 'Safety Region', parentStateId: null, stateIds: [], transitionIds: [], junctionIds: [] },
];

describe('renderStateMachineDiagrams', () => {
  it('renders one figure per layer with escaped guards and actions', () => {
    const figures = renderStateMachineDiagrams({ layers, states, junctions, transitions });
    expect(figures).toHaveLength(2);
    expect(figures[0]).toContain('Root Region');
    expect(figures[0]).toContain('[temperature &lt; limit] / fan = on');
    expect(figures[0]).toContain('heater = on');
    expect(figures[0]).toContain('report-figure-caption');
  });

  it('renders history junctions as labeled circles', () => {
    const figures = renderStateMachineDiagrams({ layers, states, junctions, transitions });
    expect(figures[0]).toContain('<circle');
    expect(figures[0]).toContain('>H<');
  });

  it('renders parent states as containers that enclose their children', () => {
    const figures = renderStateMachineDiagrams({ layers, states, junctions, transitions });
    expect(figures[0]).toContain('Operating');
    const container = figures[0].match(/<rect[^>]*class="sm-container"[^>]*>/);
    expect(container).not.toBeNull();
  });

  it('splits layers with more than 20 nodes into multiple figures', () => {
    const many = Array.from({ length: 22 }, (_, i) => state({ id: `s${i}`, name: `S${i}`, autostart: i === 0 }));
    const manyLayer: Layer[] = [{
      id: 'big', name: 'Big Region', parentStateId: null,
      stateIds: many.map(s => s.id), transitionIds: [], junctionIds: [],
    }];
    const figures = renderStateMachineDiagrams({ layers: manyLayer, states: many, junctions: [], transitions: [] });
    expect(figures).toHaveLength(2);
    expect(figures[0]).toContain('view 1 of 2');
  });

  it('renders a formal empty figure for layers with no states', () => {
    expect(renderStateMachineDiagrams({ layers, states, junctions, transitions })[1]).toContain('No states in layer Safety Region');
  });

  it('renders an initial pseudostate filled circle for the autostart state', () => {
    const figures = renderStateMachineDiagrams({ layers, states, junctions, transitions });
    expect(figures[0]).toContain('initial-pseudostate');
    expect(figures[0]).toContain('<circle');
  });

  it('renders transitions that target parent composite states', () => {
    const parentTransitions = [
      transition({ id: 't4', sourceId: 'cool', targetId: 'op', condition: 'restart' }),
      transition({ id: 't5', sourceId: 'heat', targetId: 'op', condition: 'abort' }),
    ];
    const figures = renderStateMachineDiagrams({
      layers: [{
        id: 'l3', name: 'With Parent Target', parentStateId: null,
        stateIds: ['idle', 'op', 'heat', 'cool'],
        transitionIds: ['t1', 't2', 't3', 't4', 't5'],
        junctionIds: [],
      }],
      states,
      junctions: [],
      transitions: [...transitions, ...parentTransitions],
    });
    expect(figures[0]).toContain('edge-t4');
    expect(figures[0]).toContain('[restart]');
    expect(figures[0]).toContain('edge-t5');
    expect(figures[0]).toContain('[abort]');
  });
});



