/**
 * The ADIA editor's own operations for the State Machine, the Variables panel and the HMI Dashboard,
 * for model build scripts. Nothing is written as raw project data:
 *
 *   states, regions, transitions, renames  -> the State Machine model-explorer adapter (its commands)
 *   state / transition properties          -> only the fields the State and Transition panels edit,
 *                                             with the panel's AutoStart rule (one per region, all parallel states)
 *   variables                              -> the Variables panel's "Add" (name rule, unique name, initial value)
 *   HMI widgets                            -> the HMI Dashboard's palette (createHmiComponent) and the fields its
 *                                             Properties panel edits
 */
import { createStateMachineExplorerAdapter, ensureRootStateMachineDiagram } from '../../src/features/modelExplorer/adapters/stateMachineExplorerAdapter';
import type { ModelExplorerCommand } from '../../src/features/modelExplorer/modelExplorerTypes';
import type { StateMachineExplorerSnapshot } from '../../src/utils/stateMachine/smStatePruner';
import type { EventDef, FixedPointFormat, StateData, TransitionData, VariableDef, VariableType } from '../../src/types/sm_types';
import { addEvent, renameEvent } from '../../src/utils/stateMachine/smEventEditing';
import { withVariableType } from '../../src/utils/stateMachine/smChartSettingsEditing';
import { isValidFixedPoint } from '../../src/utils/stateMachine/smFixedPoint';
import { applyStateHistoryChange, type StateHistoryType } from '../../src/utils/stateMachine/smHistoryRegion';
import { pruneXBBoundaryMappings } from '../../src/utils/stateMachine/xbBoundaryMappings';
import type { XBMappingV1 } from '../../src/utils/stateMachine/xbModel';
import { validateInitialValue } from '../../src/utils/stateMachineCodeGenerator';
import { createHmiComponent } from '../../src/features/hmi/hmiCatalog';
import { applyAutostartEdit } from '../../src/utils/stateMachine/smOrthogonalRegions';
import type { HmiComponent, HmiComponentType } from '../../src/types/sysml_types';

/** State panel fields, plus the geometry a state gets by moving / resizing it on the canvas. */
const STATE_FIELDS = ['name', 'entry', 'during', 'exit', 'autostart', 'historyType', 'internalTransitions', 'isParallel',
  'isSafeState', 'isTerminalState', 'priority', 'regionId', 'x', 'y', 'width', 'height', 'simulationOnly'] as const;
export type StatePanelEdit = Partial<Pick<StateData, typeof STATE_FIELDS[number]>>;
/** Transition panel fields. */
const TRANSITION_FIELDS = ['condition', 'action', 'type', 'afterTicks', 'order', 'isInternal', 'event'] as const;
export type TransitionPanelEdit = Partial<Pick<TransitionData, typeof TRANSITION_FIELDS[number]>>;

const only = <T extends object>(patch: T, fields: readonly string[], what: string): T => {
  const extra = Object.keys(patch).filter(key => !fields.includes(key));
  if (extra.length) throw new Error(`${what}: ${extra.join(', ')} cannot be edited in the editor`);
  return patch;
};

export function createStateMachineEditor() {
  let snapshot: StateMachineExplorerSnapshot = ensureRootStateMachineDiagram({
    states: [], transitions: [], junctions: [], diagrams: [], revision: 1,
    // a new project's root region
    layers: [{ id: 'root', name: 'Root', parentStateId: null, stateIds: [], transitionIds: [], junctionIds: [] }],
  });
  const adapter = createStateMachineExplorerAdapter({
    getSnapshot: () => snapshot,
    onCommit: next => { snapshot = { ...next, revision: (snapshot.revision ?? 1) + 1 }; },
  });
  const execute = (command: ModelExplorerCommand): string => {
    const result = adapter.execute(command);
    if (!result.committed) throw new Error(`${command.type} refused: ${JSON.stringify(result.diagnostics)}`);
    return result.selectedIds?.[0] ?? '';
  };
  const rename = (id: string, name: string) => execute({ type: 'rename', elementId: id, name });

  const editState = (id: string, edit: StatePanelEdit) => {
    only(edit, STATE_FIELDS, 'state');
    if (!snapshot.states.some(s => s.id === id)) throw new Error(`no state ${id}`);
    const states = snapshot.states.map(s => s.id === id ? { ...s, ...edit } : s);
    // the panel keeps one AutoStart state per region, except among parallel states
    snapshot = { ...snapshot, states: edit.autostart ? applyAutostartEdit(states, id, true) : states };
  };
  const editTransition = (id: string, edit: TransitionPanelEdit) => {
    only(edit, TRANSITION_FIELDS, 'transition');
    if (!snapshot.transitions.some(t => t.id === id)) throw new Error(`no transition ${id}`);
    snapshot = { ...snapshot, transitions: snapshot.transitions.map(t => t.id === id ? { ...t, ...edit } : t) };
  };

  return {
    /** "New State" in a region; the name is typed in the dialog. */
    createState: (regionId: string, name: string) => execute({ type: 'createElement', ownerId: regionId, elementKind: 'state', name }),
    /** "New Region" on a state, renamed after the state as the canvas names the region it opens. */
    createRegion: (stateId: string, name: string) => {
      const id = execute({ type: 'createElement', ownerId: stateId, elementKind: 'region' });
      rename(id, name);
      return id;
    },
    /** "Transition" from a state to a state. */
    createTransition: (sourceId: string, targetId: string) =>
      execute({ type: 'createRelationship', relationshipKind: 'transition', sourceId, targetId }),
    /** "New X-Bridges state" in a region. */
    createXBridgesState: (regionId: string, name: string) => execute({ type: 'createElement', ownerId: regionId, elementKind: 'xBridgesState', name }),
    /** The State panel's History selector (None / Shallow / Deep): the history junction lives in the state's region. Returns the junction id. */
    setHistory: (stateId: string, type: StateHistoryType) => {
      const state = snapshot.states.find(s => s.id === stateId);
      if (!state) throw new Error(`no state ${stateId}`);
      const next = applyStateHistoryChange(
        { layers: snapshot.layers, junctions: snapshot.junctions, transitions: snapshot.transitions },
        { id: state.id, name: state.name }, type,
        { newLayerId: crypto.randomUUID(), newJunctionId: crypto.randomUUID() }, { x: 60, y: 60 }, '#ff9900');
      snapshot = { ...snapshot, ...next, states: snapshot.states.map(s => s.id === stateId ? { ...s, historyType: type } : s) };
      const layer = next.layers.find(l => l.parentStateId === stateId);
      const junction = layer?.junctionIds.map(id => next.junctions.find(j => j.id === id)).find(j => j?.type === 'deep-history' || j?.type === 'history');
      return junction?.id ?? '';
    },
    /** The X-Bridges editor's save (handleXBridgesSave): the workspace's nodes, edges and boundary mappings of the state. */
    saveXBridges: (stateId: string, nodes: unknown[], edges: unknown[], mappings: readonly XBMappingV1[]) => {
      const state = snapshot.states.find(s => s.id === stateId);
      if (!state?.isXBridges) throw new Error(`no X-Bridges state ${stateId}`);
      const pruned = pruneXBBoundaryMappings(mappings, nodes);
      snapshot = { ...snapshot, states: snapshot.states.map(s => s.id === stateId ? { ...s, xBridgesModel: { ...s.xBridgesModel, nodes, edges, mappings: Array.from(pruned) } as unknown as StateData['xBridgesModel'] } : s) };
    },
    /**
     * The embedded solver (step and execution) of an X-Bridges state. The application has NO control for these fields
     * (a new X-Bridges state is Euler, 10 ms, in-tick); this is the one place a model script writes data no screen edits.
     */
    setEmbeddedSolver: (stateId: string, solver: Record<string, unknown>) => {
      snapshot = { ...snapshot, states: snapshot.states.map(s => s.id === stateId ? { ...s, xBridgesModel: { ...s.xBridgesModel, solver } as unknown as StateData['xBridgesModel'] } : s) };
    },
    rename,
    editState,
    editTransition,
    get snapshot() { return snapshot; },
  };
}

/** The Variables panel: name, type, initial value, then "Add". */
export function createVariablesPanel() {
  const variables: VariableDef[] = [];
  const parse = (type: VariableType, value: string): number | boolean => type === 'bool' ? value === 'true' : Number(value);
  return {
    add(name: string, type: VariableType, initialValue: string, fixedPoint?: FixedPointFormat, id: string = crypto.randomUUID()) {
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) throw new Error(`invalid variable name ${name}`);
      if (variables.some(v => v.name === name)) throw new Error(`variable ${name} already exists`);
      if (validateInitialValue({ type, initialValue }) === null) throw new Error(`invalid initial value ${initialValue} for ${name}`);
      // the type selector gives a fixdt variable its format (default fixdt(1, 16, 8)); the fraction length input edits it
      let variable: VariableDef = {
        id, name, type, overflowPolicy: 'saturate', initialValue,
        currentValue: parse(type, initialValue), visibleInScope: true,
      };
      if (type === 'fixdt') {
        variable = withVariableType(variable, 'fixdt');
        if (fixedPoint) {
          if (!isValidFixedPoint(fixedPoint)) throw new Error(`invalid fixed-point format for ${name}`);
          variable = { ...variable, fixedPoint: { ...fixedPoint } };
        }
      } else if (fixedPoint) throw new Error(`${name}: only fixdt variables have a fixed-point format`);
      variables.push(variable);
      return variable;
    },
    idOf(name: string) {
      const found = variables.find(v => v.name === name);
      if (!found) throw new Error(`no variable ${name}`);
      return found.id;
    },
    variables,
  };
}

/** The Events editor: ADD EVENT (EVENT_n, Input), then the inline name edit. */
export function createEventsPanel() {
  let events: EventDef[] = [];
  return {
    add(name: string, scope: EventDef['scope'] = 'input') {
      const id = crypto.randomUUID();
      const added = addEvent(events, id, scope);
      if (!added.ok) throw new Error(added.error);
      const renamed = renameEvent(added.events, id, name);
      if (!renamed.ok) throw new Error(renamed.error);
      events = renamed.events;
      return id;
    },
    get events() { return events; },
  };
}

/** HMI Dashboard Properties panel fields (and the canvas drag / resize). */
const HMI_FIELDS = ['name', 'variableId', 'x', 'y', 'width', 'height', 'min', 'max', 'step', 'precision', 'alarmThreshold', 'activeValue',
  'inactiveValue', 'unit', 'text', 'imageUrl', 'iconEmoji', 'targetValue', 'oledTitle', 'oledModeNames', 'color', 'writable', 'stateId',
  'command', 'parentId', 'tabId', 'variableIds', 'options', 'tabs', 'encoderValues', 'hybridValues', 'soundType'] as const;
export type HmiPanelEdit = Partial<Pick<HmiComponent, typeof HMI_FIELDS[number]>>;

export function createHmiDashboard() {
  const components: HmiComponent[] = [];
  return {
    /** A palette entry, then its properties. */
    add(type: HmiComponentType, edit: HmiPanelEdit) {
      only(edit, HMI_FIELDS, `HMI ${type}`);
      const component = { ...createHmiComponent(type, crypto.randomUUID()), ...edit };
      for (const key of ['x', 'y', 'width', 'height'] as const) {
        component[key] = Math.max(key === 'width' || key === 'height' ? 40 : 0, component[key]);
      }
      components.push(component);
      return component.id;
    },
    components,
  };
}
