import { renderArithSection } from './smCArith';
import { renderExternalArithSection } from './smCExternalHelpers';
import type { ErrorItem } from '../../types/sm_types';
import type { ModelDiagnostic } from './smModel';
import { analyzeSemanticModel } from '../smAnalysisEngine';

import { toCIdentifier } from './smExpressions';
import {
  renderCAction,
  renderCGuard,
  renderCExpression,
  renderCInitialValue,
  renderCType,
  unwrapTopLevelCondition,
} from './smCExpressions';
import type {
  SemanticLayer,
  SemanticModel,
  SemanticState,
  SemanticTransition,
  SemanticTransitionRoute,
} from './smSemanticModel';
import {
  historyStorageUsage,
  routeExitStateIds,
  SM_EVENT_QUEUE_LEN,
  SM_MAX_EXECUTIONS_PER_STEP,
  semanticEvents,
} from './smSemanticModel';
import {
  renderXBHeader,
  renderXBInstanceMembers,
  renderXBLifecycleSource,
  renderXBSource,
} from './xbCGenerator';
import {
  DEFAULT_VERIFICATION_EVIDENCE,
  renderStaticMetricsReport,
  renderTestingReport as renderSemanticTestingReport,
  type VerificationEvidence,
} from './smReports';
import { renderHostSmokeHarness } from './smHostHarness';
import { buildSMTestManifest } from './smTestPlanBuilder';
import { renderSMCTestPackage } from './smCTestSuiteRenderer';
import { applyCodePrefix, DEFAULT_CODE_PREFIX, preservedNamesOf } from './smCodePrefix';

export interface CGeneratorOptions {
  includeTestShims?: boolean;
  includeHostHarness?: boolean;
  includeVerificationPackage?: boolean;
  vectorCount?: number;
  reportSourceFiles?: readonly GeneratedCFile[];
  verificationEvidence?: VerificationEvidence;
}


export interface GeneratedCFile {
  name: string;
  content: string;
}

export interface CGeneratorResult {
  files: GeneratedCFile[];
  errors: ErrorItem[];
  warnings: string[];
}

type RenderIndex = {
  stateNumber: ReadonlyMap<string, number>;
  layerNumber: ReadonlyMap<string, number>;
};

const lines = (...parts: Array<string | false | null | undefined>): string =>
  `${parts.filter((part): part is string => typeof part === 'string')
    .join('\n')}\n`;

const orderedStates = (ir: SemanticModel): SemanticState[] =>
  Object.values(ir.states).sort((left, right) =>
    left.activityIndex - right.activityIndex);

const orderedLayers = (ir: SemanticModel): SemanticLayer[] =>
  Object.values(ir.layers).sort((left, right) => {
    const leftSlot = left.activeSlot ?? Number.MAX_SAFE_INTEGER;
    const rightSlot = right.activeSlot ?? Number.MAX_SAFE_INTEGER;
    return leftSlot - rightSlot || left.id.localeCompare(right.id);
  });

const buildIndex = (ir: SemanticModel): RenderIndex => {
  const states = orderedStates(ir);
  const layers = orderedLayers(ir);
  return {
    stateNumber: new Map(states.map((state, index) => [state.id, index + 1])),
    layerNumber: new Map(layers.map((layer, index) => [layer.id, index])),
  };
};

const stateNode = (ir: SemanticModel, stateId: string): string =>
  ir.states[stateId].enumName;

const stateIndex = (ir: SemanticModel, stateId: string): string =>
  `${stateNode(ir, stateId)}_IDX`;

const xbStateFunction = (
  state: SemanticState,
  phase: 'Init' | 'Enter' | 'Step',
): string => {
  const suffix = toCIdentifier(
    state.enumName.replace(/^SM_ST_/, ''),
  ).toUpperCase();
  return `SM_XB_${suffix}_${phase}`;
};

const stateFunction = (
  index: RenderIndex,
  prefix: string,
  stateId: string,
): string => `${prefix}_${index.stateNumber.get(stateId)!}`;

const layerFunction = (
  index: RenderIndex,
  prefix: string,
  layerId: string,
): string => `${prefix}_${index.layerNumber.get(layerId)!}`;

const layerMacro = (layer: SemanticLayer): string =>
  `SM_LYR_${toCIdentifier(layer.id).toUpperCase()}_IDX`;

const descendantsOfLayer = (
  ir: SemanticModel,
  layerId: string,
): SemanticState[] => orderedStates(ir).filter((state) => {
  let currentLayer = ir.layers[state.layerId];
  while (currentLayer !== undefined) {
    if (currentLayer.id === layerId) return true;
    if (currentLayer.parentStateId === null) return false;
    currentLayer = ir.layers[ir.states[currentLayer.parentStateId].layerId];
  }
  return false;
});

const descendantsOfState = (
  ir: SemanticModel,
  stateId: string,
): SemanticState[] => orderedStates(ir).filter((state) =>
  state.id === stateId || state.ancestorStateIds.includes(stateId));

const topmostExitStateIds = (
  ir: SemanticModel,
  stateIds: readonly string[],
): string[] => {
  const exits = new Set(stateIds);
  return stateIds.filter((stateId) =>
    !ir.states[stateId].ancestorStateIds.some((ancestorId) =>
      exits.has(ancestorId)));
};

const renderCStringLiteral = (value: string): string => {
  const escaped = Array.from(value).map((character) => {
    if (character === '\\') return '\\\\';
    if (character === '"') return '\\"';
    if (character === '\n') return '\\n';
    if (character === '\r') return '\\r';
    if (character === '\t') return '\\t';
    const code = character.charCodeAt(0);
    return code < 32 || code === 127
      ? `\\${code.toString(8).padStart(3, '0')}`
      : character;
  }).join('');
  return `"${escaped}"`;
};

const eventCName = (ir: SemanticModel, eventId: string): string => {
  const event = semanticEvents(ir).find((candidate) => candidate.id === eventId);
  if (event === undefined) throw new Error(`event '${eventId}' is absent from semantic IR`);
  return event.cName;
};

const eventUsage = (ir: SemanticModel): { any: boolean; input: boolean; local: boolean } => ({
  any: semanticEvents(ir).length > 0,
  input: semanticEvents(ir).some((event) => event.scope === 'input'),
  local: semanticEvents(ir).some((event) => event.scope === 'local'),
});

const renderActions = (
  ir: SemanticModel,
  actions: SemanticState['entryActions'],
  traceLabel: string,
  indent = '    ',
): string => lines(
  actions.map((action) => action.kind === 'send'
    ? `${indent}SM_Raise_Local_Event(instance, SM_EVENT_${eventCName(ir, action.event)});`
    : renderCAction(action, ir.variables, ir.verification.cStandard, indent, ir.fixedPointRounding)).join('\n'),
  actions.length === 0
    ? null
    : `${indent}SM_TraceAction(instance, ${renderCStringLiteral(traceLabel)});`,
).trimEnd();

const stateActionLabel = (state: SemanticState): string =>
  state.enumName.startsWith('SM_ST_') ? state.enumName.slice(6) : state.enumName;

const renderTransitionEnabled = (
  ir: SemanticModel,
  transition: SemanticTransition,
  timerStateId: string,
): string => {
  const guard = renderCGuard(transition.guard, ir.variables, ir.verification.cStandard, ir.fixedPointRounding);
  const temporal = transition.temporalThresholdMs === null
    ? 'false'
    : `(instance->state_timers[${stateIndex(ir, timerStateId)}] >= ${transition.temporalThresholdMs}U)`;
  const timing = (() => {
    switch (transition.triggerMode) {
      case 'condition': return guard;
      case 'after': return temporal;
      case 'and': return `(${guard} && ${temporal})`;
      case 'or': return `(${guard} || ${temporal})`;
    }
  })();
  if (transition.eventId == null) return timing;
  // The event is tested first: a guard of a transition whose event is not current is not evaluated.
  const current = `(instance->current_event == SM_EVENT_${eventCName(ir, transition.eventId)})`;
  const rest = unwrapTopLevelCondition(timing);
  return rest === 'true' ? current : `(${current} && (${rest}))`;
};

const renderRouteEnabled = (
  ir: SemanticModel,
  route: SemanticTransitionRoute,
  timerStateId: string,
): string => {
  const conds = route.transitionIds.map((transitionId) =>
    renderTransitionEnabled(ir, ir.transitions[transitionId], timerStateId));
  if (conds.length === 1) return unwrapTopLevelCondition(conds[0]);
  return conds.map((condition) => `(${unwrapTopLevelCondition(condition)})`).join(' && ');
};

const renderMarkEntered = (
  ir: SemanticModel,
  stateId: string,
  indent: string,
): string => {
  const state = ir.states[stateId];
  return lines(
    `${indent}instance->state_active[${stateIndex(ir, stateId)}] = true;`,
    `${indent}instance->state_timers[${stateIndex(ir, stateId)}] = 0U;`,
    state.activeSlot >= 0
      ? `${indent}instance->active_states[${state.activeSlot}U] = ${stateNode(ir, stateId)};`
      : null,
    state.xBridges?.policy.memory === 'reset'
      ? `${indent}${xbStateFunction(state, 'Enter')}(instance);`
      : null,
    `${indent}${stateNode(ir, stateId)}_Entry(instance);`,
  ).trimEnd();
};

const renderEnterLayerAlongPath = (
  ir: SemanticModel,
  index: RenderIndex,
  layerId: string,
  path: readonly string[],
  pathIndex: number,
  excludedLayerId: string | null,
  indent: string,
): string => {
  const layer = ir.layers[layerId];
  const selectedStateId = path[pathIndex];
  if (layer.decomposition === 'OR') {
    return renderEnterStateAlongPath(
      ir,
      index,
      path,
      pathIndex,
      excludedLayerId,
      indent,
    );
  }
  const activeSibling = layer.children
    .map((childId) => `instance->state_active[${stateIndex(ir, childId)}]`)
    .join(' || ') || 'false';
  const alreadyActive = renderEnterStateAlongPath(
    ir,
    index,
    path,
    pathIndex,
    excludedLayerId,
    `${indent}    `,
  );
  const fresh = layer.children.map((childId) =>
    childId === selectedStateId
      ? renderEnterStateAlongPath(
        ir,
        index,
        path,
        pathIndex,
        excludedLayerId,
        `${indent}    `,
      )
      : `${indent}    ${stateFunction(index, 'SM_Enter_Deep', childId)}(instance);`)
    .join('\n');
  return lines(
    `${indent}if (${activeSibling}) {`,
    alreadyActive,
    `${indent}} else {`,
    fresh,
    `${indent}}`,
  ).trimEnd();
};

function renderEnterStateAlongPath(
  ir: SemanticModel,
  index: RenderIndex,
  path: readonly string[],
  pathIndex: number,
  excludedLayerId: string | null,
  indent: string,
): string {
  const stateId = path[pathIndex];
  const state = ir.states[stateId];
  const nextStateId = path[pathIndex + 1];
  const selectedLayerId = nextStateId === undefined
    ? null
    : ir.states[nextStateId].layerId;
  const childEntries = state.childLayerIds
    .filter((layerId) => layerId !== excludedLayerId)
    .map((layerId) =>
      layerId === selectedLayerId
        ? renderEnterLayerAlongPath(
          ir,
          index,
          layerId,
          path,
          pathIndex + 1,
          excludedLayerId,
          indent,
        )
        : `${indent}${layerFunction(index, 'SM_Enter_Layer_Default', layerId)}(instance);`)
    .join('\n');
  return lines(
    renderMarkEntered(ir, stateId, indent),
    childEntries || null,
  ).trimEnd();
}

const renderRestoreStateBody = (
  ir: SemanticModel,
  index: RenderIndex,
  stateId: string,
): string => {
  const state = ir.states[stateId];
  const childCode = state.childLayerIds.map((layerId) => {
    const layer = ir.layers[layerId];
    const saved = layer.children
      .map((childId) =>
        `SM_DH_GET(instance, snapshot_layer, ${stateIndex(ir, childId)})`)
      .join(' || ') || 'false';
    if (layer.decomposition === 'OR') {
      /* The last choice needs no test: one saved child exists inside this branch (MISRA 15.7). */
      const choices = layer.children.map((childId, childIndex) => lines(
        childIndex === 0
          ? `        if (SM_DH_GET(instance, snapshot_layer, ${stateIndex(ir, childId)})) {`
          : (childIndex === layer.children.length - 1
            ? '        else {'
            : `        else if (SM_DH_GET(instance, snapshot_layer, ${stateIndex(ir, childId)})) {`),
        `            ${stateFunction(index, 'SM_Restore_State', childId)}(instance, snapshot_layer);`,
        '        }',
      ).trimEnd()).join('\n');
      return lines(
        `    if (${saved}) {`,
        choices,
        '    } else {',
        `        ${layerFunction(index, 'SM_Enter_Layer_Default', layerId)}(instance);`,
        '    }',
      ).trimEnd();
    }
    return layer.children.map((childId) => lines(
      `    if (SM_DH_GET(instance, snapshot_layer, ${stateIndex(ir, childId)})) {`,
      `        ${stateFunction(index, 'SM_Restore_State', childId)}(instance, snapshot_layer);`,
      '    } else {',
      `        ${stateFunction(index, 'SM_Enter_Deep', childId)}(instance);`,
      '    }',
    ).trimEnd()).join('\n');
  }).join('\n');
  return lines(
    '    (void)snapshot_layer;',
    renderMarkEntered(ir, stateId, '    '),
    childCode || null,
  );
};

const collectDefaultJunctionPaths = (
  ir: SemanticModel,
  junctionId: string,
  visited = new Set<string>(),
): string[][] => {
  if (visited.has(junctionId)) return [];
  const nextVisited = new Set(visited);
  nextVisited.add(junctionId);
  const transitions = [...(ir.transitionsBySource[junctionId] ?? [])]
    .map((id) => ir.transitions[id])
    .sort((left, right) =>
      left.priority - right.priority || left.id.localeCompare(right.id));
  return transitions.flatMap((transition) => {
    if (transition.destinationKind === 'state') return [[transition.id]];
    const destination = ir.junctions[transition.destinationStateId];
    if (destination?.kind !== 'junction') return [];
    return collectDefaultJunctionPaths(
      ir,
      transition.destinationStateId,
      nextVisited,
    ).map((suffix) => [transition.id, ...suffix]);
  });
};

const renderDefaultJunction = (
  ir: SemanticModel,
  index: RenderIndex,
  junctionId: string,
  indent = '    ',
): string => {
  const paths = collectDefaultJunctionPaths(ir, junctionId);
  return paths.map((transitionIds, pathIndex) => {
    const transitions = transitionIds.map((id) => ir.transitions[id]);
    const conds = transitions.map((transition) =>
      renderTransitionEnabled(ir, transition, transition.sourceStateId));
    const condition = conds.length === 1
      ? unwrapTopLevelCondition(conds[0])
      : conds.map((c) => `(${unwrapTopLevelCondition(c)})`).join(' && ');
    const actionCode = transitions.map((transition) =>
      renderActions(
        ir,
        transition.actions,
        `transition:${transition.id}`,
        `${indent}    `,
      ))
      .filter(Boolean)
      .join('\n');
    const destination = transitions[transitions.length - 1];
    return lines(
      `${indent}${pathIndex === 0 ? 'if' : 'else if'} (${condition}) {`,
      actionCode || null,
      `${indent}    ${stateFunction(index, 'SM_Enter_Deep', destination.destinationStateId)}(instance);`,
      `${indent}}`,
    ).trimEnd();
  }).join(' ');
};

const renderEnterFunctions = (
  ir: SemanticModel,
  index: RenderIndex,
): string => {
  const { deep: hasDeepHistory } = historyStorageUsage(ir);
  const stateFunctions = orderedStates(ir).map((state) => lines(
    `static void ${stateFunction(index, 'SM_Enter_Deep', state.id)}(ADIA_Instance_t *instance)`,
    '{',
    renderMarkEntered(ir, state.id, '    '),
    ...state.childLayerIds.map((layerId) =>
      `    ${layerFunction(index, 'SM_Enter_Layer_Default', layerId)}(instance);`),
    '}',
    ...(hasDeepHistory ? [
      '',
      `static void ${stateFunction(index, 'SM_Restore_State', state.id)}(ADIA_Instance_t *instance, uint32_t snapshot_layer)`,
      '{',
      renderRestoreStateBody(ir, index, state.id).trimEnd(),
      '}',
    ] : []),
  )).join('\n');

  const layerFunctions = orderedLayers(ir).map((layer) => {
    const body = layer.decomposition === 'AND'
      ? layer.children.map((childId) =>
        `    ${stateFunction(index, 'SM_Enter_Deep', childId)}(instance);`)
        .join('\n')
      : layer.defaultEntryId === null
        ? '    (void)instance;'
        : layer.defaultEntryKind === 'state'
          ? `    ${stateFunction(index, 'SM_Enter_Deep', layer.defaultEntryId)}(instance);`
          : renderDefaultJunction(ir, index, layer.defaultEntryId);
    return lines(
      `static void ${layerFunction(index, 'SM_Enter_Layer_Default', layer.id)}(ADIA_Instance_t *instance)`,
      '{',
      body,
      '}',
    );
  }).join('\n');
  return `${layerFunctions}\n${stateFunctions}`;
};

/* The statements that exit the children of a layer without recording history. */
const renderLayerChildExits = (
  ir: SemanticModel,
  index: RenderIndex,
  layer: SemanticLayer,
  indent: string,
): string => (layer.decomposition === 'OR' && layer.activeSlot !== null
  ? `${indent}${layerFunction(index, 'SM_Exit_Active', layer.id)}(instance);`
  : [...layer.children].reverse().map((childId) =>
    `${indent}${stateFunction(index, 'SM_Exit_State', childId)}(instance);`)
    .join('\n'));

/* Exit of a state followed by the history record of its containing layer, as a transition does. */
const renderRecordingStateExit = (
  ir: SemanticModel,
  index: RenderIndex,
  stateId: string,
  indent: string,
): string => lines(
  historyStorageUsage(ir).shallow
    ? `${indent}SM_Record_Layer_History(instance, ${layerMacro(ir.layers[ir.states[stateId].layerId])});`
    : null,
  `${indent}${stateFunction(index, 'SM_Exit_State', stateId)}(instance);`,
).trimEnd();

const renderExitFunctions = (
  ir: SemanticModel,
  index: RenderIndex,
): string => {
  const storage = historyStorageUsage(ir);
  const recordCases = orderedLayers(ir).map((layer) => lines(
    `        case ${layerMacro(layer)}:`,
    layer.activeSlot === null
      ? null
      : `            instance->history_states[${layer.activeSlot}U] = instance->active_states[${layer.activeSlot}U];`,
    ...(storage.deep ? descendantsOfLayer(ir, layer.id).map((state) =>
      `            if (instance->state_active[${stateIndex(ir, state.id)}]) { SM_DH_SET(instance, ${layerMacro(layer)}, ${stateIndex(ir, state.id)}); }`) : []),
    '            break;',
  ).trimEnd()).join('\n');

  /* One function per layer and per state: the state hierarchy is a tree, so the call graph is acyclic. */
  const activeDispatchers = orderedLayers(ir)
    .filter((layer) => layer.decomposition === 'OR' && layer.activeSlot !== null)
    .map((layer) => lines(
      `static void ${layerFunction(index, 'SM_Exit_Active', layer.id)}(ADIA_Instance_t *instance)`,
      '{',
      `    switch (instance->active_states[${layer.activeSlot}U]) {`,
      ...layer.children.map((childId) => lines(
        `        case ${stateNode(ir, childId)}:`,
        `            ${stateFunction(index, 'SM_Exit_State', childId)}(instance);`,
        '            break;',
      ).trimEnd()),
      '        default:',
      '            break;',
      '    }',
      '}',
    ).trimEnd()).join('\n\n');

  const layerExits = orderedLayers(ir).map((layer) => lines(
    `static void ${layerFunction(index, 'SM_Exit_Layer', layer.id)}(ADIA_Instance_t *instance)`,
    '{',
    storage.shallow ? `    SM_Record_Layer_History(instance, ${layerMacro(layer)});` : null,
    layer.children.length === 0 && !storage.shallow ? '    (void)instance;' : renderLayerChildExits(ir, index, layer, '    '),
    '}',
  ).trimEnd()).join('\n\n');

  const stateExits = orderedStates(ir).map((state) => lines(
    `static void ${stateFunction(index, 'SM_Exit_State', state.id)}(ADIA_Instance_t *instance)`,
    '{',
    `    if (instance->state_active[${stateIndex(ir, state.id)}]) {`,
    ...[...state.childLayerIds].reverse().map((layerId) =>
      `        ${layerFunction(index, 'SM_Exit_Layer', layerId)}(instance);`),
    `        ${stateNode(ir, state.id)}_Exit(instance);`,
    `        instance->state_active[${stateIndex(ir, state.id)}] = false;`,
    `        instance->state_timers[${stateIndex(ir, state.id)}] = 0U;`,
    state.activeSlot >= 0
      ? lines(
        `        if (instance->active_states[${state.activeSlot}U] == ${stateNode(ir, state.id)}) {`,
        `            instance->active_states[${state.activeSlot}U] = SM_NODE_INVALID;`,
        '        }',
      ).trimEnd()
      : null,
    '    }',
    '}',
  ).trimEnd()).join('\n\n');

  return lines(
    ...(storage.shallow ? [
      'static void SM_Record_Layer_History(ADIA_Instance_t *instance, uint32_t layer)',
      '{',
      storage.deep ? '    uint32_t byte_index;' : null,
      storage.deep ? '    for (byte_index = 0U; byte_index < SM_DEEP_HISTORY_BYTES; ++byte_index) {' : null,
      storage.deep ? '        instance->deep_history[layer][byte_index] = 0U;' : null,
      storage.deep ? '    }' : null,
      '    switch (layer) {',
      recordCases,
      '        default:',
      '            break;',
      '    }',
      '}',
      '',
    ] : []),
    activeDispatchers,
    activeDispatchers ? '' : null,
    layerExits,
    '',
    stateExits,
  );
};

const renderRestoreLayer = (
  ir: SemanticModel,
  index: RenderIndex,
  layerId: string,
  deep: boolean,
  indent: string,
): string => {
  const layer = ir.layers[layerId];
  if (deep) {
    if (layer.decomposition === 'OR') {
      const choices = layer.children.map((childId, childIndex) => lines(
        `${indent}${childIndex === 0 ? 'if' : 'else if'} (SM_DH_GET(instance, ${layerMacro(layer)}, ${stateIndex(ir, childId)})) {`,
        `${indent}    ${stateFunction(index, 'SM_Restore_State', childId)}(instance, ${layerMacro(layer)});`,
        `${indent}}`,
      ).trimEnd()).join(' ');
      return lines(
        choices,
        `${indent}else {`,
        `${indent}    ${layerFunction(index, 'SM_Enter_Layer_Default', layerId)}(instance);`,
        `${indent}}`,
      ).trimEnd();
    }
    return layer.children.map((childId) => lines(
      `${indent}if (SM_DH_GET(instance, ${layerMacro(layer)}, ${stateIndex(ir, childId)})) {`,
      `${indent}    ${stateFunction(index, 'SM_Restore_State', childId)}(instance, ${layerMacro(layer)});`,
      `${indent}} else {`,
      `${indent}    ${stateFunction(index, 'SM_Enter_Deep', childId)}(instance);`,
      `${indent}}`,
    ).trimEnd()).join('\n');
  }
  if (layer.decomposition === 'OR' && layer.activeSlot !== null) {
    const choices = layer.children.map((childId, childIndex) => lines(
      `${indent}${childIndex === 0 ? 'if' : 'else if'} (instance->history_states[${layer.activeSlot}U] == ${stateNode(ir, childId)}) {`,
      `${indent}    ${stateFunction(index, 'SM_Enter_Deep', childId)}(instance);`,
      `${indent}}`,
    ).trimEnd()).join(' ');
    return lines(
      choices,
      `${indent}else {`,
      `${indent}    ${layerFunction(index, 'SM_Enter_Layer_Default', layerId)}(instance);`,
      `${indent}}`,
    ).trimEnd();
  }
  return `${indent}${layerFunction(index, 'SM_Enter_Layer_Default', layerId)}(instance);`;
};

const renderCommitRoute = (
  ir: SemanticModel,
  index: RenderIndex,
  transition: SemanticTransition,
  route: SemanticTransitionRoute,
  indent: string,
): string => {
  const statements: string[] = [];
  if (transition.kind !== 'internal-action') {
    const exitedActiveSlots = new Set<number>();
    for (const stateId of topmostExitStateIds(ir, routeExitStateIds(ir, transition, route))) {
      statements.push(renderRecordingStateExit(ir, index, stateId, indent));
      const exitedState = ir.states[stateId];
      // An inner route lists the destination child even when it is inactive, so the
      // slot's active state may be a sibling that still needs the runtime check below.
      if (transition.kind === 'inner') continue;
      if (exitedState.activeSlot >= 0) {
        exitedActiveSlots.add(exitedState.activeSlot);
      }
      for (const childLayerId of exitedState.childLayerIds) {
        const childLayer = ir.layers[childLayerId];
        if (childLayer.activeSlot !== null) {
          exitedActiveSlots.add(childLayer.activeSlot);
        }
      }
    }
    for (const stateId of route.entryStateIds) {
      const state = ir.states[stateId];
      if (state.activeSlot < 0) continue;
      if (exitedActiveSlots.has(state.activeSlot)) continue;
      statements.push(lines(
        `${indent}if ((instance->active_states[${state.activeSlot}U] != SM_NODE_INVALID) &&`,
        `${indent}    (instance->active_states[${state.activeSlot}U] != ${stateNode(ir, stateId)})) {`,
        historyStorageUsage(ir).shallow
          ? `${indent}    SM_Record_Layer_History(instance, ${layerMacro(ir.layers[state.layerId])});`
          : null,
        `${indent}    ${layerFunction(index, 'SM_Exit_Active', state.layerId)}(instance);`,
        `${indent}}`,
      ).trimEnd());
    }
  }
  for (const transitionId of route.transitionIds) {
    const actionCode = renderActions(
      ir,
      ir.transitions[transitionId].actions,
      `transition:${transitionId}`,
      indent,
    );
    if (actionCode) statements.push(actionCode);
  }
  if (transition.kind !== 'internal-action') {
    if (route.destinationKind === 'history' && route.destinationJunctionId) {
      const junction = ir.junctions[route.destinationJunctionId];
      const historyLayer = ir.layers[junction.layerId];
      if (route.entryStateIds.length > 0) {
        statements.push(renderEnterStateAlongPath(
          ir,
          index,
          route.entryStateIds,
          0,
          historyLayer.id,
          indent,
        ));
      } else if (historyLayer.parentStateId !== null) {
        statements.push(
          `${indent}${layerFunction(index, 'SM_Exit_Layer_No_History', historyLayer.id)}(instance);`,
        );
      }
      statements.push(renderRestoreLayer(
        ir,
        index,
        historyLayer.id,
        junction.kind === 'deep-history',
        indent,
      ));
    } else if (route.entryStateIds.length > 0) {
      statements.push(renderEnterStateAlongPath(
        ir,
        index,
        route.entryStateIds,
        0,
        null,
        indent,
      ));
    } else if (route.destinationStateId !== null) {
      const destination = ir.states[route.destinationStateId];
      for (const layerId of destination.childLayerIds) {
        statements.push(lines(
          `${indent}if (instance->state_active[${stateIndex(ir, destination.id)}]) {`,
          `${indent}    ${layerFunction(index, 'SM_Enter_Layer_Default', layerId)}(instance);`,
          `${indent}}`,
        ).trimEnd());
      }
    }
  }
  return statements.join('\n');
};

const renderTransitionPhase = (
  ir: SemanticModel,
  index: RenderIndex,
  stateId: string,
  phase: 'outer' | 'inner',
): string => {
  const kinds = phase === 'outer'
    ? new Set<SemanticTransition['kind']>(['outer', 'external-self'])
    : new Set<SemanticTransition['kind']>(['inner', 'internal-action']);
  const transitions = [...(ir.transitionsBySource[stateId] ?? [])]
    .map((id) => ir.transitions[id])
    .filter((transition) => kinds.has(transition.kind))
    .sort((left, right) =>
      left.priority - right.priority || left.id.localeCompare(right.id));
  const blocks: string[] = [];
  for (const transition of transitions) {
    const transTraceId = `TRACE-TRANS-${toCIdentifier(transition.id).toUpperCase()}`;
    for (const route of transition.routes) {
      const condition = renderRouteEnabled(ir, route, stateId);
      const isUnconditional = condition === '(true)' || condition === 'true';
      const commit = renderCommitRoute(
        ir,
        index,
        transition,
        route,
        isUnconditional ? '    ' : '        ',
      );
      if (isUnconditional) {
        blocks.push(lines(
          `    /* TRACE-BEGIN: traceId=${transTraceId} symbol=sm_trans_${toCIdentifier(transition.id).toLowerCase()}${traceRequirementsSuffix(ir, transition.id)} */`,
          commit,
          '    return true;',
          `    /* TRACE-END: traceId=${transTraceId} */`
        ).trimEnd());
        return blocks.join('\n');
      }
      blocks.push(lines(
        `    /* TRACE-BEGIN: traceId=${transTraceId} symbol=sm_trans_${toCIdentifier(transition.id).toLowerCase()}${traceRequirementsSuffix(ir, transition.id)} */`,
        `    if (${condition}) {`,
        commit,
        '        return true;',
        '    }',
        `    /* TRACE-END: traceId=${transTraceId} */`
      ).trimEnd());
    }
  }
  return blocks.join('\n');
};

const traceRequirementsSuffix = (ir: SemanticModel, id: string): string => {
  const ids = ir.traceableElements?.find((element) => element.id === id)?.requirementIds ?? [];
  return ids.length > 0
    ? ` requirements=${ids.map((id) => id.replace(/[^A-Za-z0-9_.:-]/g, '_')).join(',')}`
    : '';
};

const renderExecuteFunctions = (
  ir: SemanticModel,
  index: RenderIndex,
): string => {
  const stateFunctions = orderedStates(ir).map((state) => {
    if (state.terminal) {
      return lines(
        `static bool ${stateFunction(index, 'SM_Execute_State', state.id)}(ADIA_Instance_t *instance)`,
        '{',
        '    (void)instance;',
        '    return false;',
        '}',
      );
    }
    const childSteps = state.childLayerIds.map((layerId) => lines(
      `    transitioned = ${layerFunction(index, 'SM_Execute_Layer', layerId)}(instance) || transitioned;`,
      `    if (!instance->state_active[${stateIndex(ir, state.id)}]) {`,
      '        return transitioned;',
      '    }',
    ).trimEnd()).join('\n');
    const stateTraceId = `TRACE-STATE-${toCIdentifier(state.id).toUpperCase()}`;
    return lines(
      `/* TRACE-BEGIN: traceId=${stateTraceId} symbol=SM_ST_${toCIdentifier(state.id).toUpperCase()}${traceRequirementsSuffix(ir, state.id)} */`,
      `static bool ${stateFunction(index, 'SM_Execute_State', state.id)}(ADIA_Instance_t *instance)`,
      '{',
      state.childLayerIds.length > 0 ? '    bool transitioned = false;' : null,
      renderTransitionPhase(ir, index, state.id, 'outer') || null,
      `    ${stateNode(ir, state.id)}_During(instance);`,
      state.xBridges === null
        ? null
        : lines(
          `    ${xbStateFunction(state, 'Step')}(instance);`,
          '    if (instance->error_status != SM_ERR_NONE) {',
          '        return false;',
          '    }',
          `    SM_TraceAction(instance, ${renderCStringLiteral(
            `xbridges:${stateActionLabel(state)}`,
          )});`,
        ).trimEnd(),
      renderTransitionPhase(ir, index, state.id, 'inner') || null,
      childSteps || null,
      state.childLayerIds.length > 0
        ? '    return transitioned;'
        : '    return false;',
      '}',
      `/* TRACE-END: traceId=${stateTraceId} */`,
    );
  }).join('\n');

  const layerFunctions = orderedLayers(ir).map((layer) => {
    if (layer.decomposition === 'OR' && layer.activeSlot !== null) {
      const choices = layer.children.map((childId) => lines(
        `        case ${stateNode(ir, childId)}:`,
        `            return ${stateFunction(index, 'SM_Execute_State', childId)}(instance);`,
      ).trimEnd()).join('\n');
      return lines(
        `static bool ${layerFunction(index, 'SM_Execute_Layer', layer.id)}(ADIA_Instance_t *instance)`,
        '{',
        `    switch (instance->active_states[${layer.activeSlot}U]) {`,
        choices,
        '        default: return false;',
        '    }',
        '}',
      );
    }
    const children = layer.children.map((childId) => lines(
      `    if (instance->state_active[${stateIndex(ir, childId)}]) {`,
      `        transitioned = ${stateFunction(index, 'SM_Execute_State', childId)}(instance) || transitioned;`,
      layer.parentStateId === null
        ? null
        : lines(
          `        if (!instance->state_active[${stateIndex(ir, layer.parentStateId)}]) {`,
          '            return transitioned;',
          '        }',
        ).trimEnd(),
      '    }',
    ).trimEnd()).join('\n');
    return lines(
      `static bool ${layerFunction(index, 'SM_Execute_Layer', layer.id)}(ADIA_Instance_t *instance)`,
      '{',
      '    bool transitioned = false;',
      layer.children.length === 0 ? '    (void)instance;' : null,
      children,
      '    return transitioned;',
      '}',
    );
  }).join('\n');
  return `${layerFunctions}\n${stateFunctions}`;
};

const renderNoHistoryExitWrappers = (
  ir: SemanticModel,
  index: RenderIndex,
): string => orderedLayers(ir).map((layer) => lines(
  `static void ${layerFunction(index, 'SM_Exit_Layer_No_History', layer.id)}(ADIA_Instance_t *instance)`,
  '{',
  layer.children.length === 0 ? '    (void)instance;' : renderLayerChildExits(ir, index, layer, '    '),
  '}',
).trimEnd()).join('\n\n');

const cCommentText = (value: string): string => value
  .replaceAll('*/', '* /')
  .replace(/[\r\n]+/g, ' ');

const stateTraceComment = (state: SemanticState): string =>
  `/* State: ${cCommentText(state.name)} | Model ID: ${cCommentText(state.id)} | C enum: ${state.enumName} */`;

const renderEventResetLines = (ir: SemanticModel): string[] => [
  ...(eventUsage(ir).input ? [
    '    SM_ENTER_CRITICAL();',
    '    instance->pending_events = 0U;',
    '    SM_EXIT_CRITICAL();',
  ] : []),
  '    instance->current_event = SM_EVENT_NONE;',
  ...(eventUsage(ir).local ? [
    '    instance->event_head = 0U;',
    '    instance->event_count = 0U;',
  ] : []),
];

/*
 * The executions of one tick: one per pending input event in declaration order (one without an
 * event when none is pending), each followed by the queued local events (FIFO), at most
 * SM_MAX_EXECUTIONS_PER_STEP in total. Mirrors executeTickExecutions in smInterpreter.ts.
 */
const renderEventExecutionSource = (ir: SemanticModel, index: RenderIndex): string => {
  const usage = eventUsage(ir);
  const rootLayer = ir.layers[ir.rootLayerId];
  return lines(
    '/* Returns false when the tick must stop (an error other than ARITHMETIC is latched). */',
    'static bool SM_Execute_Event(ADIA_Instance_t *instance, uint32_t *executions, SM_Event_t event)',
    '{',
    '    if (*executions >= SM_MAX_EXECUTIONS_PER_STEP) {',
    '        if (instance->error_status == SM_ERR_NONE) {',
    '            instance->error_status = SM_ERR_EVENT_OVERFLOW;',
    '        }',
    '        return false;',
    '    }',
    '    *executions = *executions + 1U;',
    '    instance->current_event = event;',
    `    (void)${layerFunction(index, 'SM_Execute_Layer', rootLayer.id)}(instance);`,
    '    return (instance->error_status == SM_ERR_NONE) || (instance->error_status == SM_ERR_ARITHMETIC);',
    '}',
    '',
    'static bool SM_Run_Event(ADIA_Instance_t *instance, uint32_t *executions, SM_Event_t event)',
    '{',
    '    if (!SM_Execute_Event(instance, executions, event)) {',
    '        return false;',
    '    }',
    ...(usage.local ? [
      '    while (instance->event_count > 0U) {',
      '        const SM_Event_t next = instance->event_queue[instance->event_head];',
      '        instance->event_head = (instance->event_head + 1U) % SM_EVENT_QUEUE_LEN;',
      '        instance->event_count = instance->event_count - 1U;',
      '        if (!SM_Execute_Event(instance, executions, next)) {',
      '            return false;',
      '        }',
      '    }',
    ] : []),
    '    return true;',
    '}',
    '',
    `static void SM_Run_Executions(ADIA_Instance_t *instance${usage.input ? ', uint32_t pending_mask' : ''})`,
    '{',
    '    uint32_t executions = 0U;',
    ...(usage.input ? [
      '    if (pending_mask == 0U) {',
      '        (void)SM_Run_Event(instance, &executions, SM_EVENT_NONE);',
      '    } else {',
      '        uint32_t bit;',
      '        for (bit = 0U; bit < SM_NUM_INPUT_EVENTS; ++bit) {',
      '            if ((pending_mask & ((uint32_t)1U << bit)) != 0U) {',
      '                if (!SM_Run_Event(instance, &executions, (SM_Event_t)bit)) {',
      '                    break;',
      '                }',
      '            }',
      '        }',
      '    }',
    ] : [
      '    (void)SM_Run_Event(instance, &executions, SM_EVENT_NONE);',
    ]),
    '    instance->current_event = SM_EVENT_NONE;',
    '}',
  );
};

const renderEventConfig = (ir: SemanticModel): string[] => {
  const usage = eventUsage(ir);
  return [
    '',
    '/* Events: input events are posted with SM_PostEvent(), local events are queued by send() actions. */',
    'typedef uint32_t SM_Event_t;',
    ...semanticEvents(ir).map((event) => `#define SM_EVENT_${event.cName} ${event.index}U`),
    '#define SM_EVENT_NONE 0xFFFFFFFFU',
    `#define SM_MAX_EXECUTIONS_PER_STEP ${SM_MAX_EXECUTIONS_PER_STEP}U`,
    ...(usage.local ? [`#define SM_EVENT_QUEUE_LEN ${SM_EVENT_QUEUE_LEN}U`] : []),
    ...(usage.input ? [
      `#define SM_NUM_INPUT_EVENTS ${semanticEvents(ir).filter((event) => event.scope === 'input').length}U`,
      '/*',
      ' * SM_PostEvent() may be called from an interrupt. It brackets the update of the pending mask',
      ' * with SM_ENTER_CRITICAL()/SM_EXIT_CRITICAL(), as does SM_Step() when it takes the mask.',
      ' * The defaults do nothing: map them to your interrupt masking, for example',
      ' *   #define SM_ENTER_CRITICAL() __disable_irq()',
      ' *   #define SM_EXIT_CRITICAL()  __enable_irq()',
      ' * (or save and restore the interrupt state) before including this file.',
      ' */',
      '#ifndef SM_ENTER_CRITICAL',
      '#define SM_ENTER_CRITICAL() ((void)0)',
      '#endif',
      '#ifndef SM_EXIT_CRITICAL',
      '#define SM_EXIT_CRITICAL() ((void)0)',
      '#endif',
    ] : []),
    '',
  ];
};

/* Width in bits of the smallest unsigned type holding every table index plus the "none" sentinel. */
const romIndexWidth = (ir: SemanticModel): 8 | 16 | 32 => {
  const largest = Math.max(
    Object.keys(ir.states).length,
    Object.keys(ir.layers).length,
    ir.activeSlotCount,
  );
  if (largest < 0xFF) return 8;
  return largest < 0xFFFF ? 16 : 32;
};

const romIndexType = (ir: SemanticModel): string => `uint${romIndexWidth(ir)}_t`;

/*
 * Constant tables are placed in flash on AVR (PROGMEM, read with pgm_read_*) and are plain const
 * data on every other target.
 */
const renderRomSection = (ir: SemanticModel): string[] => {
  const width = romIndexWidth(ir);
  const none = width === 8 ? '0xFFU' : width === 16 ? '0xFFFFU' : '0xFFFFFFFFU';
  return [
    '/* Constant tables: flash on AVR, ordinary const data elsewhere. */',
    '#if defined(__AVR__)',
    '#include <avr/pgmspace.h>',
    '#define SM_ROM const PROGMEM',
    '#define SM_ROM_READ_U8(item) pgm_read_byte(&(item))',
    '#define SM_ROM_READ_U16(item) pgm_read_word(&(item))',
    '#define SM_ROM_READ_U32(item) pgm_read_dword(&(item))',
    '#else',
    '#define SM_ROM const',
    '#define SM_ROM_READ_U8(item) (item)',
    '#define SM_ROM_READ_U16(item) (item)',
    '#define SM_ROM_READ_U32(item) (item)',
    '#endif',
    `typedef uint${width}_t SM_Rom_Index_t;`,
    `#define SM_ROM_INDEX_NONE ${none}`,
    `#define SM_ROM_READ_INDEX(item) SM_ROM_READ_U${width}(item)`,
  ];
};

export const renderConfigHeader = (ir: SemanticModel): string => {
  const index = buildIndex(ir);
  const states = orderedStates(ir);
  const layers = orderedLayers(ir);
  const variables = Object.values(ir.variables).sort((left, right) =>
    left.id.localeCompare(right.id));
  return lines(
    '#ifndef SM_CONFIG_H',
    '#define SM_CONFIG_H',
    '',
    ir.verification.cStandard === 'c90'
      ? lines(
          '#if defined(__STDC_VERSION__) && (__STDC_VERSION__ >= 199901L)',
          '#include <stdbool.h>',
          '#include <stdint.h>',
          '#else',
          '#ifndef __cplusplus',
          'typedef unsigned char bool;',
          '#define true 1',
          '#define false 0',
          '#endif',
          'typedef unsigned char uint8_t;',
          'typedef signed char int8_t;',
          'typedef unsigned short uint16_t;',
          'typedef signed short int16_t;',
          'typedef unsigned long uint32_t;',
          'typedef signed long int32_t;',
          '#ifndef UINT32_MAX',
          '#define UINT32_MAX 0xFFFFFFFFUL',
          '#endif',
          '#endif',
        )
      : lines(
          '#include <stdbool.h>',
          '#include <stdint.h>',
        ),
    '#ifndef SM_ADIA_INSTANCE_FWD',
    '#define SM_ADIA_INSTANCE_FWD',
    'typedef struct ADIA_Instance ADIA_Instance_t;',
    '#endif',
    orderedStates(ir).some((state) => state.xBridges !== null)
      ? '#include "sm_xbridges.h"'
      : false,
    '',
    ...renderRomSection(ir),
    '',
    `#define SM_TICK_MS ${ir.tickMs}U`,
    `#define SM_TICK_TOLERANCE_MS ${ir.verification.tickToleranceMs > 0 ? ir.verification.tickToleranceMs : Math.max(1, Math.floor(ir.tickMs / 10))}U`,
    `#define SM_TICK_MIN_MS ${Math.max(0, ir.tickMs - (ir.verification.tickToleranceMs > 0 ? ir.verification.tickToleranceMs : Math.max(1, Math.floor(ir.tickMs / 10))))}U`,
    `#define SM_TICK_MAX_MS ${ir.tickMs + (ir.verification.tickToleranceMs > 0 ? ir.verification.tickToleranceMs : Math.max(1, Math.floor(ir.tickMs / 10)))}U`,
    ir.executeAtInitialization === false ? '#define SM_EXECUTE_AT_INIT 0U' : null,
    `#define SM_NUM_STATES ${states.length}U`,
    `#define SM_NUM_LAYERS ${layers.length}U`,
    `#define SM_NUM_ACTIVE_SLOTS ${ir.activeSlotCount}U`,
    historyStorageUsage(ir).deep
      ? '#define SM_DEEP_HISTORY_BYTES (((SM_NUM_STATES + 1U) + 7U) / 8U)'
      : null,
    ...(eventUsage(ir).any ? renderEventConfig(ir) : []),
    ...layers.map((layer) =>
      `#define ${layerMacro(layer)} ${index.layerNumber.get(layer.id)!}U`),
    ...states.flatMap((state) => [
      stateTraceComment(state),
      `#define ${stateNode(ir, state.id)}_IDX ${index.stateNumber.get(state.id)!}U`,
    ]),
    '',
    'typedef enum {',
    '    SM_NODE_INVALID = 0,',
    ...states.map((state, stateOffset) =>
      `    ${stateNode(ir, state.id)} = ${stateOffset + 1}${stateOffset === states.length - 1 ? '' : ','}`),
    '} SM_Node_t;',
    '',
    historyStorageUsage(ir).deep
      ? lines(
        '/* Deep history is one bit per state per layer (state 0 is unused). */',
        '#define SM_DH_GET(inst, layer, idx) \\',
        '    ((((uint32_t)(inst)->deep_history[(layer)][(uint32_t)(idx) >> 3U] >> ((uint32_t)(idx) & 7U)) & 1U) != 0U)',
        '#define SM_DH_SET(inst, layer, idx) \\',
        '    ((inst)->deep_history[(layer)][(uint32_t)(idx) >> 3U] = (uint8_t)((uint32_t)(inst)->deep_history[(layer)][(uint32_t)(idx) >> 3U] | (1UL << ((uint32_t)(idx) & 7U))))',
        '#define SM_DH_CLR(inst, layer, idx) \\',
        '    ((inst)->deep_history[(layer)][(uint32_t)(idx) >> 3U] = (uint8_t)((uint32_t)(inst)->deep_history[(layer)][(uint32_t)(idx) >> 3U] & ~(1UL << ((uint32_t)(idx) & 7U))))',
      ).trimEnd()
      : null,
    '',
    'typedef enum {',
    '    SM_ERR_NONE = 0,',
    '    SM_ERR_NULL_INSTANCE,',
    '    SM_ERR_TIMING,',
    '    SM_ERR_CONFIGURATION,',
    '    SM_ERR_SAFETY_VIOLATION,',
    '    SM_ERR_XBRIDGES_NUMERIC,',
    '    SM_ERR_INVALID_ARGUMENT,',
    ...(eventUsage(ir).any
      ? ['    SM_ERR_ARITHMETIC,', '    SM_ERR_EVENT_OVERFLOW = 8']
      : ['    SM_ERR_ARITHMETIC']),
    '} SM_Error_t;',
    '',
    'typedef uint32_t SM_Group_t;',
    '',
    '#ifdef SM_TRACE_ENABLED',
    'typedef struct {',
    '    const char *action;',
    '} SM_TraceEvent_t;',
    'typedef void (*SM_TraceSink_t)(const SM_TraceEvent_t *event);',
    '#endif',
    '',
    'typedef struct {',
    variables.length === 0
      ? '    uint8_t reserved;'
      : variables.map((variable) =>
        `    ${renderCType(variable.type, variable.fixedPoint)} ${variable.cName};`).join('\n'),
    '} SM_Data_t;',
    '',
    'struct ADIA_Instance {',
    '    SM_Data_t data;',
    ...renderXBInstanceMembers(ir).map((member) => `    ${member}`),
    '    SM_Node_t active_states[(SM_NUM_ACTIVE_SLOTS > 0U) ? SM_NUM_ACTIVE_SLOTS : 1U];',
    historyStorageUsage(ir).shallow
      ? '    SM_Node_t history_states[(SM_NUM_ACTIVE_SLOTS > 0U) ? SM_NUM_ACTIVE_SLOTS : 1U];'
      : null,
    '    bool state_active[SM_NUM_STATES + 1U];',
    '    uint32_t state_timers[SM_NUM_STATES + 1U];',
    historyStorageUsage(ir).deep
      ? '    uint8_t deep_history[SM_NUM_LAYERS][SM_DEEP_HISTORY_BYTES];'
      : null,
    '    SM_Error_t error_status;',
    '    bool fault_latched;',
    '    bool arith_pending;',
    ir.executeAtInitialization === false ? '    bool chart_entered;' : null,
    ...(eventUsage(ir).any ? [
      eventUsage(ir).input
        ? '    volatile uint32_t pending_events; /* input events posted by SM_PostEvent(), possibly from an ISR */'
        : null,
      '    SM_Event_t current_event; /* event of the chart execution in progress, SM_EVENT_NONE if none */',
      ...(eventUsage(ir).local ? [
        '    SM_Event_t event_queue[SM_EVENT_QUEUE_LEN]; /* local events queued by send() */',
        '    uint32_t event_head;',
        '    uint32_t event_count;',
      ] : []),
    ].filter((line): line is string => line !== null) : []),
    '#ifdef SM_TRACE_ENABLED',
    '    SM_TraceSink_t trace_sink;',
    '#endif',
    '};',
    '',
    '#endif /* SM_CONFIG_H */',
  );
};

export const renderCoreHeader = (cStandard?: string, ir?: SemanticModel): string => lines(
  '#ifndef SM_CORE_H',
  '#define SM_CORE_H',
  '',
  '#include "sm_config.h"',
  '',
  renderArithSection(cStandard, ir !== undefined && Object.values(ir.variables).some((variable) => variable.type === 'fixdt')),
  '',
  ...(ir?.externalFunctions !== undefined && ir.externalFunctions.length > 0
    ? [renderExternalArithSection(cStandard), '']
    : []),
  ...(ir !== undefined && eventUsage(ir).local ? [
    '/* send(NAME): queues a local event; called by the generated actions only, not from interrupts. */',
    'void SM_Raise_Local_Event(ADIA_Instance_t *instance, SM_Event_t event);',
    '',
  ] : []),
  'SM_Error_t SM_Init(ADIA_Instance_t *instance);',
  'SM_Error_t SM_Reset(ADIA_Instance_t *instance);',
  'SM_Error_t SM_ReadInputs(ADIA_Instance_t *instance);',
  'SM_Error_t SM_Step(ADIA_Instance_t *instance, uint32_t delta_ms);',
  ...(ir !== undefined && eventUsage(ir).input ? [
    '/* Marks an input event pending for the next SM_Step(). Safe to call from an interrupt (see SM_ENTER_CRITICAL). */',
    'SM_Error_t SM_PostEvent(ADIA_Instance_t *instance, SM_Event_t event);',
  ] : []),
  'SM_Error_t SM_WriteOutputs(ADIA_Instance_t *instance);',
  'SM_Error_t SM_Sync_IO(ADIA_Instance_t *instance);',
  'SM_Node_t SM_GetActiveSlot(const ADIA_Instance_t *instance, uint32_t slot);',
  'SM_Node_t SM_GetLayerActive(const ADIA_Instance_t *instance, uint32_t layer);',
  'bool SM_IsStateActive(const ADIA_Instance_t *instance, SM_Node_t state);',
  '/* Deprecated: use SM_GetActiveSlot(). The argument is an active-slot ID. */',
  'SM_Node_t SM_GetActive(const ADIA_Instance_t *instance, SM_Group_t slot);',
  'SM_Error_t SM_GetError(const ADIA_Instance_t *instance);',
  '#ifdef SM_TRACE_ENABLED',
  'void SM_SetTraceSink(ADIA_Instance_t *instance, SM_TraceSink_t sink);',
  'void SM_TraceAction(ADIA_Instance_t *instance, const char *action);',
  '#else',
  '/* No trace sink compiled in: an empty inline function, not a macro of the same name (MISRA 5.5). */',
  'SM_ARITH_INLINE void SM_TraceAction(ADIA_Instance_t *instance, const char *action)',
  '{',
  '    (void)instance;',
  '    (void)action;',
  '}',
  '#endif',
  '',
  '#ifdef ADIA_TESTING',
  'SM_Error_t SM_Test_SetActiveState(ADIA_Instance_t *instance, uint32_t slot, SM_Node_t state);',
  'SM_Error_t SM_Test_SetStateActive(ADIA_Instance_t *instance, SM_Node_t state, bool active);',
  'SM_Error_t SM_Test_SetStateTimer(ADIA_Instance_t *instance, SM_Node_t state, uint32_t timer_ms);',
  'SM_Error_t SM_Test_SetHistoryState(ADIA_Instance_t *instance, uint32_t slot, SM_Node_t state);',
  'SM_Error_t SM_Test_SetDeepHistory(ADIA_Instance_t *instance, uint32_t layer, SM_Node_t state, bool active);',
  ...(ir !== undefined && eventUsage(ir).local ? [
    '/* Queues a local event as send() does, so that a test can drive a local-event-triggered transition. */',
    'SM_Error_t SM_Test_QueueLocalEvent(ADIA_Instance_t *instance, SM_Event_t event);',
  ] : []),
  '#endif',
  '',
  '#endif /* SM_CORE_H */',
);

/**
 * Adds `#include "<header>"` (deduplicated, in declaration order) for the external C functions
 * the generated source calls, right after the project's own includes.
 */
const withExternalIncludes = (ir: SemanticModel, source: string): string => {
  const headers: string[] = [];
  for (const def of ir.externalFunctions ?? []) {
    if (new RegExp(`\\b${def.name}\\s*\\(`).test(source) && !headers.includes(def.header)) headers.push(def.header);
  }
  if (headers.length === 0) return source;
  const anchor = '#include "sm_user_logic.h"';
  return source.replace(anchor, [anchor, ...headers.map((header) => `#include "${header}"`)].join('\n'));
};

export const renderUserLogicSource = (ir: SemanticModel): string =>
  withExternalIncludes(ir, renderUserLogicSourceBody(ir));

export const renderCoreSource = (ir: SemanticModel): string =>
  withExternalIncludes(ir, renderCoreSourceBody(ir));

export const renderUserLogicHeader = (ir: SemanticModel): string => lines(
  '#ifndef SM_USER_LOGIC_H',
  '#define SM_USER_LOGIC_H',
  '',
  '#include "sm_config.h"',
  '',
  ...orderedStates(ir).flatMap((state) => [
    stateTraceComment(state),
    `void ${stateNode(ir, state.id)}_Entry(ADIA_Instance_t *instance);`,
    `void ${stateNode(ir, state.id)}_During(ADIA_Instance_t *instance);`,
    `void ${stateNode(ir, state.id)}_Exit(ADIA_Instance_t *instance);`,
  ]),
  '',
  '#endif /* SM_USER_LOGIC_H */',
);

const renderUserLogicSourceBody = (ir: SemanticModel): string => lines(
  '#include <math.h>',
  '#include "sm_core.h"',
  '#include "sm_user_logic.h"',
  '',
  ...orderedStates(ir).flatMap((state) => [
    stateTraceComment(state),
    lines(
      `void ${stateNode(ir, state.id)}_Entry(ADIA_Instance_t *instance)`,
      '{',
      state.entryActions.length === 0
        ? '    (void)instance;'
        : renderActions(
          ir,
          state.entryActions,
          `entry:${stateActionLabel(state)}`,
        ),
      '}',
    ),
    lines(
      `void ${stateNode(ir, state.id)}_During(ADIA_Instance_t *instance)`,
      '{',
      state.duringActions.length === 0
        ? '    (void)instance;'
        : renderActions(
          ir,
          state.duringActions,
          `during:${stateActionLabel(state)}`,
        ),
      '}',
    ),
    lines(
      `void ${stateNode(ir, state.id)}_Exit(ADIA_Instance_t *instance)`,
      '{',
      state.exitActions.length === 0
        ? '    (void)instance;'
        : renderActions(
          ir,
          state.exitActions,
          `exit:${stateActionLabel(state)}`,
        ),
      '}',
    ),
  ]),
);

export const renderMappingHeader = (): string => lines(
  '#ifndef SM_MAPPING_H',
  '#define SM_MAPPING_H',
  '',
  '#include "sm_config.h"',
  '',
  'extern SM_ROM SM_Rom_Index_t SM_State_Parent_Layer_Map[SM_NUM_STATES + 1U];',
  'extern SM_ROM SM_Rom_Index_t SM_State_Active_Slot_Map[SM_NUM_STATES + 1U];',
  'extern SM_ROM SM_Rom_Index_t SM_Layer_Parent_State_Map[SM_NUM_LAYERS];',
  'extern SM_ROM SM_Rom_Index_t SM_Layer_Active_Slot_Map[SM_NUM_LAYERS];',
  '',
  'SM_Error_t SM_Validate_Mapping_Configuration(void);',
  '',
  '#endif /* SM_MAPPING_H */',
);

const slotInitializer = (slot: number | null): string =>
  slot === null || slot < 0 ? 'SM_ROM_INDEX_NONE' : `${slot}U`;

export const renderMappingSource = (ir: SemanticModel): string => {
  /* With no active slots the range test would compare an unsigned value with 0 (-Wtype-limits). */
  const slotCheck = ir.activeSlotCount === 0
    ? '        if (slot != SM_ROM_INDEX_NONE) {'
    : '        if ((slot != SM_ROM_INDEX_NONE) && (slot >= SM_NUM_ACTIVE_SLOTS)) {';
  const states = orderedStates(ir);
  const layers = orderedLayers(ir);
  const mappingRows = layers.map((layer) => {
    const slot = layer.activeSlot === null ? 'NONE' : layer.activeSlot.toString();
    return ` * ${cCommentText(layer.name || layer.id)} | ${slot}`;
  });
  return lines(
    '#include "sm_mapping.h"',
    '',
    '/*',
    ' * Active State Mapping',
    ' *',
    ' * Layer | Slot',
    ' * ------------------------------',
    ...mappingRows,
    ' *',
    ' * Parallel child states are tracked using state_active[].',
    ' * Layer IDs, active-slot IDs, and state IDs are distinct.',
    ' */',
    'SM_ROM SM_Rom_Index_t SM_State_Parent_Layer_Map[SM_NUM_STATES + 1U] = {',
    ...(ir.verification.cStandard === 'c90'
      ? ['    0U,', ...states.map((state) => `    ${layerMacro(ir.layers[state.layerId])},`)]
      : ['    [0] = 0U,', ...states.map((state) => `    [${stateIndex(ir, state.id)}] = ${layerMacro(ir.layers[state.layerId])},`)]),
    '};',
    '',
    'SM_ROM SM_Rom_Index_t SM_State_Active_Slot_Map[SM_NUM_STATES + 1U] = {',
    ...(ir.verification.cStandard === 'c90'
      ? ['    SM_ROM_INDEX_NONE,', ...states.map((state) => `    ${slotInitializer(state.activeSlot)},`)]
      : ['    [0] = SM_ROM_INDEX_NONE,', ...states.map((state) => `    [${stateIndex(ir, state.id)}] = ${slotInitializer(state.activeSlot)},`)]),
    '};',
    '',
    'SM_ROM SM_Rom_Index_t SM_Layer_Parent_State_Map[SM_NUM_LAYERS] = {',
    ...(ir.verification.cStandard === 'c90'
      ? layers.map((layer) => `    ${layer.parentStateId === null ? '0U' : stateIndex(ir, layer.parentStateId)},`)
      : layers.map((layer) => `    [${layerMacro(layer)}] = ${layer.parentStateId === null ? '0U' : stateIndex(ir, layer.parentStateId)},`)),
    '};',
    '',
    'SM_ROM SM_Rom_Index_t SM_Layer_Active_Slot_Map[SM_NUM_LAYERS] = {',
    ...(ir.verification.cStandard === 'c90'
      ? layers.map((layer) => `    ${slotInitializer(layer.activeSlot)},`)
      : layers.map((layer) => `    [${layerMacro(layer)}] = ${slotInitializer(layer.activeSlot)},`)),
    '};',
    '',
    'SM_Error_t SM_Validate_Mapping_Configuration(void)',
    '{',
    '    uint32_t layer_index;',
    '    uint32_t state_index;',
    '    uint32_t slot;',
    '    for (layer_index = 0U; layer_index < SM_NUM_LAYERS; ++layer_index) {',
    '        uint32_t parent_state;',
    '        slot = (uint32_t)SM_ROM_READ_INDEX(SM_Layer_Active_Slot_Map[layer_index]);',
    slotCheck,
    '            return SM_ERR_CONFIGURATION;',
    '        }',
    '        parent_state = (uint32_t)SM_ROM_READ_INDEX(SM_Layer_Parent_State_Map[layer_index]);',
    '        if (parent_state > SM_NUM_STATES) {',
    '            return SM_ERR_CONFIGURATION;',
    '        }',
    '    }',
    '    for (state_index = 1U; state_index <= SM_NUM_STATES; ++state_index) {',
    '        uint32_t parent_layer;',
    '        uint32_t layer_slot;',
    '        parent_layer = (uint32_t)SM_ROM_READ_INDEX(SM_State_Parent_Layer_Map[state_index]);',
    '        if (parent_layer >= SM_NUM_LAYERS) {',
    '            return SM_ERR_CONFIGURATION;',
    '        }',
    '        slot = (uint32_t)SM_ROM_READ_INDEX(SM_State_Active_Slot_Map[state_index]);',
    slotCheck,
    '            return SM_ERR_CONFIGURATION;',
    '        }',
    '        layer_slot = (uint32_t)SM_ROM_READ_INDEX(SM_Layer_Active_Slot_Map[parent_layer]);',
    '        if (slot != layer_slot) {',
    '            return SM_ERR_CONFIGURATION;',
    '        }',
    '    }',
    '    return SM_ERR_NONE;',
    '}',
  );
};

export const renderSafetyHeader = (): string => lines(
  '#ifndef SM_SAFETY_H',
  '#define SM_SAFETY_H',
  '',
  '#include "sm_config.h"',
  '',
  'SM_Error_t SM_Validate_State_Consistency(const ADIA_Instance_t *instance);',
  'void SM_ApplySafeOutputs(ADIA_Instance_t *instance);',
  '',
  '#endif /* SM_SAFETY_H */',
);

export const renderSafetySource = (ir: SemanticModel): string => {
  const states = orderedStates(ir);
  const layers = orderedLayers(ir);
  const mappedOutputs = ir.ioMappings.filter(
    (mapping) => mapping.direction === 'write',
  );
  const membershipCases = (membersOf: (layer: SemanticLayer) => string[]): string[] => layers
    .map((layer) => ({ layer, members: membersOf(layer) }))
    .filter((entry) => entry.members.length > 0)
    .map((entry) => lines(
      `        case ${layerMacro(entry.layer)}:`,
      `            result = ${entry.members.map((member) => `(state == ${member})`).join(' || ')};`,
      '            break;',
    ).trimEnd());
  const directChildCases = membershipCases((layer) =>
    layer.children.map((stateId) => stateNode(ir, stateId)));
  const descendantCases = membershipCases((layer) =>
    descendantsOfLayer(ir, layer.id).map((state) => stateNode(ir, state.id)));
  return lines(
    '#include <stddef.h>',
    '#include "sm_safety.h"',
    '#include "sm_mapping.h"',
    (ir.safetyMode || mappedOutputs.length > 0)
      ? '#include "mcal_dio.h"'
      : null,
    '',
    'static bool SM_Is_Direct_Layer_Child(uint32_t layer_index, SM_Node_t state)',
    '{',
    '    bool result = false;',
    '    switch (layer_index) {',
    ...directChildCases,
    '        default:',
    '            break;',
    '    }',
    '    return result;',
    '}',
    '',
    ...(historyStorageUsage(ir).deep ? [
      'static bool SM_Is_Layer_Descendant(uint32_t layer_index, SM_Node_t state)',
      '{',
      '    bool result = false;',
      '    switch (layer_index) {',
      ...descendantCases,
      '        default:',
      '            break;',
      '    }',
      '    return result;',
      '}',
      '',
    ] : []),
    'SM_Error_t SM_Validate_State_Consistency(const ADIA_Instance_t *instance)',
    '{',
    /* Parent state numbers (0 = none), kept in flash; read only by this function. */
    '    static SM_ROM SM_Rom_Index_t SM_State_Parent_Map[SM_NUM_STATES + 1U] = {',
    ...(ir.verification.cStandard === 'c90'
      ? ['        0U,', ...states.map((state) => `        ${state.parentStateId === null ? '0U' : stateIndex(ir, state.parentStateId)},`)]
      : ['        [0] = 0U,', ...states.map((state) => `        [${stateIndex(ir, state.id)}] = ${state.parentStateId === null ? '0U' : stateIndex(ir, state.parentStateId)},`)]),
    '    };',
    '    uint32_t layer_index;',
    '    uint32_t state_index;',
    ir.activeSlotCount > 0 ? '    uint32_t slot_index;' : null,
    '    SM_Node_t active_node;',
    historyStorageUsage(ir).shallow ? '    SM_Node_t history_node;' : null,
    '    uint32_t active_slot;',
    '    uint32_t parent;',
    '    if (instance == NULL) {',
    '        return SM_ERR_NULL_INSTANCE;',
    '    }',
    ...(ir.executeAtInitialization === false ? [
      '    if (!instance->chart_entered) {',
      '        for (state_index = 1U; state_index <= SM_NUM_STATES; ++state_index) {',
      '            if (instance->state_active[state_index]) {',
      '                return SM_ERR_CONFIGURATION;',
      '            }',
      '        }',
      '        return SM_ERR_NONE;',
      '    }',
    ] : []),
    '    for (state_index = 1U; state_index <= SM_NUM_STATES; ++state_index) {',
    '        if (instance->state_active[state_index]) {',
    '            parent = (uint32_t)SM_ROM_READ_INDEX(SM_State_Parent_Map[state_index]);',
    '            if ((parent != 0U) && (!instance->state_active[parent])) {',
    '                return SM_ERR_CONFIGURATION;',
    '            }',
    '            active_slot = (uint32_t)SM_ROM_READ_INDEX(SM_State_Active_Slot_Map[state_index]);',
    '            if ((active_slot != SM_ROM_INDEX_NONE)',
    '                && (instance->active_states[active_slot] != (SM_Node_t)state_index)) {',
    '                return SM_ERR_CONFIGURATION;',
    '            }',
    '        }',
    '    }',
    '    for (layer_index = 0U; layer_index < SM_NUM_LAYERS; ++layer_index) {',
    '        bool container_active;',
    '        parent = (uint32_t)SM_ROM_READ_INDEX(SM_Layer_Parent_State_Map[layer_index]);',
    '        container_active = (parent == 0U) || instance->state_active[parent];',
    '        active_slot = (uint32_t)SM_ROM_READ_INDEX(SM_Layer_Active_Slot_Map[layer_index]);',
    '        if (container_active) {',
    '            if (active_slot != SM_ROM_INDEX_NONE) {',
    '                active_node = instance->active_states[active_slot];',
    '                if ((active_node == SM_NODE_INVALID)',
    '                    || ((uint32_t)active_node > SM_NUM_STATES)',
    '                    || (!SM_Is_Direct_Layer_Child(layer_index, active_node))',
    '                    || (!instance->state_active[(uint32_t)active_node])) {',
    '                    return SM_ERR_CONFIGURATION;',
    '                }',
    '            } else {',
    '                for (state_index = 1U; state_index <= SM_NUM_STATES; ++state_index) {',
    '                    if (SM_Is_Direct_Layer_Child(layer_index, (SM_Node_t)state_index)',
    '                        && (!instance->state_active[state_index])) {',
    '                        return SM_ERR_CONFIGURATION;',
    '                    }',
    '                }',
    '            }',
    '        } else if ((active_slot != SM_ROM_INDEX_NONE)',
    '            && (instance->active_states[active_slot] != SM_NODE_INVALID)) {',
    '            return SM_ERR_CONFIGURATION;',
    '        } else {',
    '            /* Inactive container without a live slot: nothing to check. */',
    '        }',
    ...(historyStorageUsage(ir).shallow ? [
      '        if (active_slot != SM_ROM_INDEX_NONE) {',
      '            history_node = instance->history_states[active_slot];',
      '            if ((history_node != SM_NODE_INVALID)',
      '                && (((uint32_t)history_node > SM_NUM_STATES)',
      '                    || (!SM_Is_Direct_Layer_Child(layer_index, history_node)))) {',
      '                return SM_ERR_CONFIGURATION;',
      '            }',
      '        }',
    ] : []),
    ...(historyStorageUsage(ir).deep ? [
      '        for (state_index = 1U; state_index <= SM_NUM_STATES; ++state_index) {',
      '            if (SM_DH_GET(instance, layer_index, state_index)',
      '                && (!SM_Is_Layer_Descendant(layer_index, (SM_Node_t)state_index))) {',
      '                return SM_ERR_CONFIGURATION;',
      '            }',
      '        }',
    ] : []),
    '    }',
    ir.activeSlotCount > 0
      ? lines(
        '    for (slot_index = 0U; slot_index < SM_NUM_ACTIVE_SLOTS; ++slot_index) {',
        '        active_node = instance->active_states[slot_index];',
        '        if (active_node != SM_NODE_INVALID) {',
        '            if (((uint32_t)active_node > SM_NUM_STATES)',
        '                || (!instance->state_active[(uint32_t)active_node])) {',
        '                return SM_ERR_CONFIGURATION;',
        '            }',
        '            active_slot = (uint32_t)SM_ROM_READ_INDEX(SM_State_Active_Slot_Map[(uint32_t)active_node]);',
        '            if (active_slot != slot_index) {',
        '                return SM_ERR_CONFIGURATION;',
        '            }',
        '        }',
        '    }',
      ).trimEnd()
      : null,
    '    return SM_ERR_NONE;',
    '}',
    '',
    'void SM_ApplySafeOutputs(ADIA_Instance_t *instance)',
    '{',
    '    (void)instance;',
    mappedOutputs.length === 0
      ? null
      : mappedOutputs.map((mapping) =>
        mapping.channelDataType === 'bool'
          ? `    MCAL_Dio_WriteChannel(${channelMacro(mapping.channelId)}, ${mapping.safeValue === true ? 'true' : 'false'});`
          : `    MCAL_WriteChannelValue(${channelMacro(mapping.channelId)}, ${mapping.safeValue === null ? '0.0' : Number(mapping.safeValue).toString()});`).join('\n'),
    (ir.safetyMode || mappedOutputs.length > 0)
      ? '    MCAL_ApplySafeOutputs();'
      : null,
    '}',
  );
};

const channelMacro = (channelId: string): string =>
  `MCAL_CH_${toCIdentifier(channelId).toUpperCase()}`;

export const renderMcalHeader = (
  ir: SemanticModel,
  options: CGeneratorOptions = {},
): string => {
  const channels = [...new Set(ir.ioMappings.map((mapping) =>
    mapping.channelId))].sort((left, right) => left.localeCompare(right));
  return lines(
    '#ifndef MCAL_DIO_H',
    '#define MCAL_DIO_H',
    '',
    '#include "sm_config.h"',
    '',
    ...channels.map((channel, index) =>
      `#define ${channelMacro(channel)} ${index}U`),
    '',
    'bool MCAL_Dio_ReadChannel(uint32_t channel);',
    'void MCAL_Dio_WriteChannel(uint32_t channel, bool level);',
    'double MCAL_ReadChannelValue(uint32_t channel);',
    'void MCAL_WriteChannelValue(uint32_t channel, double value);',
    'void MCAL_ApplySafeOutputs(void);',
    'void MCAL_Watchdog_Kick(void);',
    '',
    '#endif /* MCAL_DIO_H */',
  );
};

export const renderMcalTestStubs = (): string => lines(
  '#include "mcal_dio.h"',
  '',
  'bool MCAL_Dio_ReadChannel(uint32_t channel)',
  '{',
  '    (void)channel;',
  '    return false;',
  '}',
  '',
  'void MCAL_Dio_WriteChannel(uint32_t channel, bool level)',
  '{',
  '    (void)channel;',
  '    (void)level;',
  '}',
  '',
  'double MCAL_ReadChannelValue(uint32_t channel)',
  '{',
  '    (void)channel;',
  '    return 0.0;',
  '}',
  '',
  'void MCAL_WriteChannelValue(uint32_t channel, double value)',
  '{',
  '    (void)channel;',
  '    (void)value;',
  '}',
  '',
  'void MCAL_ApplySafeOutputs(void)',
  '{',
  '}',
  '',
  'void MCAL_Watchdog_Kick(void)',
  '{',
  '}',
);

const renderCoreSourceBody = (ir: SemanticModel): string => {
  const index = buildIndex(ir);
  const states = orderedStates(ir);
  const rootLayer = ir.layers[ir.rootLayerId];
  const forwardDeclarations = [
    ...orderedLayers(ir).flatMap((layer) => [
      `static void ${layerFunction(index, 'SM_Enter_Layer_Default', layer.id)}(ADIA_Instance_t *instance);`,
      `static void ${layerFunction(index, 'SM_Exit_Layer_No_History', layer.id)}(ADIA_Instance_t *instance);`,
      `static void ${layerFunction(index, 'SM_Exit_Layer', layer.id)}(ADIA_Instance_t *instance);`,
      ...(layer.decomposition === 'OR' && layer.activeSlot !== null
        ? [`static void ${layerFunction(index, 'SM_Exit_Active', layer.id)}(ADIA_Instance_t *instance);`]
        : []),
      `static bool ${layerFunction(index, 'SM_Execute_Layer', layer.id)}(ADIA_Instance_t *instance);`,
    ]),
    ...states.flatMap((state) => [
      `static void ${stateFunction(index, 'SM_Enter_Deep', state.id)}(ADIA_Instance_t *instance);`,
      `static void ${stateFunction(index, 'SM_Exit_State', state.id)}(ADIA_Instance_t *instance);`,
      ...(historyStorageUsage(ir).deep
        ? [`static void ${stateFunction(index, 'SM_Restore_State', state.id)}(ADIA_Instance_t *instance, uint32_t snapshot_layer);`]
        : []),
      `static bool ${stateFunction(index, 'SM_Execute_State', state.id)}(ADIA_Instance_t *instance);`,
    ]),
    historyStorageUsage(ir).shallow
      ? 'static void SM_Record_Layer_History(ADIA_Instance_t *instance, uint32_t layer);'
      : null,
    'static void SM_Exit_All(ADIA_Instance_t *instance);',
    'static void SM_Enter_Safe_State(ADIA_Instance_t *instance);',
    'static void SM_Enter_Fault(ADIA_Instance_t *instance);',
  ];
  const readMappings = ir.ioMappings.filter((mapping) =>
    mapping.direction === 'read').map((mapping) => {
    const variable = ir.variables[mapping.variableId];
    const rawRead = mapping.channelDataType === 'bool'
      ? `MCAL_Dio_ReadChannel(${channelMacro(mapping.channelId)})`
      : `MCAL_ReadChannelValue(${channelMacro(mapping.channelId)})`;
    const value = mapping.conversionExpression === null
      ? rawRead
      : renderCExpression(
        mapping.conversionExpression,
        ir.variables,
        variable.type,
        (node) => node.name === 'x' ? rawRead : undefined,
      );
    return `    instance->data.${variable.cName} = (${renderCType(variable.type)})(${value});`;
  });
  const writeMappings = ir.ioMappings.filter((mapping) =>
    mapping.direction === 'write').map((mapping) => {
    const variable = ir.variables[mapping.variableId];
    const rawValue = `instance->data.${variable.cName}`;
    const value = mapping.conversionExpression === null
      ? rawValue
      : renderCExpression(
        mapping.conversionExpression,
        ir.variables,
        'bool',
        (node) => node.name === 'x' ? rawValue : undefined,
      );
    return mapping.channelDataType === 'bool'
      ? `    MCAL_Dio_WriteChannel(${channelMacro(mapping.channelId)}, (bool)(${value}));`
      : `    MCAL_WriteChannelValue(${channelMacro(mapping.channelId)}, (double)(${value}));`;
  });
  const faultEntry = ir.safetyMode && ir.safeStateId !== null
    ? lines(
      `    if (!instance->state_active[${stateIndex(ir, ir.safeStateId)}]) {`,
      renderEnterStateAlongPath(
        ir,
        index,
        [
          ...[...ir.states[ir.safeStateId].ancestorStateIds].reverse(),
          ir.safeStateId,
        ],
        0,
        null,
        '        ',
      ),
      '    }',
    ).trimEnd()
    : '';
  const faultHelpers = lines(
    'static void SM_Exit_All(ADIA_Instance_t *instance)',
    '{',
    `    ${layerFunction(index, 'SM_Exit_Layer', rootLayer.id)}(instance);`,
    '}',
    '',
    'static void SM_Enter_Safe_State(ADIA_Instance_t *instance)',
    '{',
    faultEntry || '    (void)instance;',
    '}',
    '',
    'static void SM_Enter_Fault(ADIA_Instance_t *instance)',
    '{',
    '    if (!instance->fault_latched) {',
    '        SM_Exit_All(instance);',
    '        SM_Enter_Safe_State(instance);',
    '        SM_ApplySafeOutputs(instance);',
    '        instance->fault_latched = true;',
    '    }',
    '}',
  ).trimEnd();
  return lines(
    '#include <float.h>',
    '#include <limits.h>',
    '#include <math.h>',
    '#include <stddef.h>',
    '#include <string.h>',
    '#include "sm_core.h"',
      '#include "sm_mapping.h"',
    '#include "sm_safety.h"',
    '#include "sm_user_logic.h"',
    '#include "mcal_dio.h"',
    '',
    '#ifdef SM_TRACE_ENABLED',
    'void SM_SetTraceSink(ADIA_Instance_t *instance, SM_TraceSink_t sink)',
    '{',
    '    if (instance != NULL) {',
    '        instance->trace_sink = sink;',
    '    }',
    '}',
    '',
    'void SM_TraceAction(ADIA_Instance_t *instance, const char *action)',
    '{',
    '    if ((instance != NULL) && (instance->trace_sink != NULL)) {',
    '        const SM_TraceEvent_t event = { action };',
    '        instance->trace_sink(&event);',
    '    }',
    '}',
    '#endif',
    '',
    renderXBLifecycleSource(ir) || null,
    orderedStates(ir).some((state) => state.xBridges !== null) ? '' : null,
    ...forwardDeclarations,
    '',
    renderExitFunctions(ir, index).trimEnd(),
    '',
    renderNoHistoryExitWrappers(ir, index).trimEnd(),
    '',
    renderEnterFunctions(ir, index).trimEnd(),
    '',
    renderExecuteFunctions(ir, index).trimEnd(),
    '',
    faultHelpers,
    '',
    ...(eventUsage(ir).any ? [renderEventExecutionSource(ir, index), ''] : []),
    'SM_Error_t SM_Init(ADIA_Instance_t *instance)',
    '{',
    ...(historyStorageUsage(ir).deep ? ['    uint32_t layer_index;'] : []),
    ...(ir.activeSlotCount > 0 ? ['    uint32_t slot_index;'] : []),
    '    uint32_t state_index;',
    '    if (instance == NULL) {',
    '        return SM_ERR_NULL_INSTANCE;',
    '    }',
    '    (void)memset(instance, 0, sizeof(*instance));',
    '#ifdef SM_TRACE_ENABLED',
    '    instance->trace_sink = NULL;',
    '#endif',
    ...states
      .filter((state) => state.xBridges !== null)
      .map((state) => `    ${xbStateFunction(state, 'Init')}(instance);`),
    ...orderedLayers(ir).map((layer) =>
      `    (void)${layerFunction(index, 'SM_Exit_Layer_No_History', layer.id)};`),
    ...states.flatMap((state) => [
      `    (void)${stateFunction(index, 'SM_Enter_Deep', state.id)};`,
      historyStorageUsage(ir).deep
        ? `    (void)${stateFunction(index, 'SM_Restore_State', state.id)};`
        : null,
    ]),
    ...Object.values(ir.variables)
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((variable) =>
        `    instance->data.${variable.cName} = (${renderCType(variable.type, variable.fixedPoint)})(${renderCInitialValue(variable)});`),
    ir.activeSlotCount > 0
      ? lines(
        '    for (slot_index = 0U; slot_index < SM_NUM_ACTIVE_SLOTS; ++slot_index) {',
        '        instance->active_states[slot_index] = SM_NODE_INVALID;',
        ...(historyStorageUsage(ir).shallow
          ? ['        instance->history_states[slot_index] = SM_NODE_INVALID;']
          : []),
        '    }',
      ).trimEnd()
      : null,
    ...(historyStorageUsage(ir).deep ? [
      '    for (layer_index = 0U; layer_index < SM_NUM_LAYERS; ++layer_index) {',
      '        for (state_index = 0U; state_index < SM_DEEP_HISTORY_BYTES; ++state_index) {',
      '            instance->deep_history[layer_index][state_index] = 0U;',
      '        }',
      '    }',
    ] : []),
    '    for (state_index = 0U; state_index <= SM_NUM_STATES; ++state_index) {',
    '        instance->state_active[state_index] = false;',
    '        instance->state_timers[state_index] = 0U;',
    '    }',
    '    instance->error_status = SM_ERR_NONE;',
    '    instance->fault_latched = false;',
    '    instance->arith_pending = false;',
    ...(eventUsage(ir).any ? ['    instance->current_event = SM_EVENT_NONE;'] : []),
    '    instance->error_status = SM_Validate_Mapping_Configuration();',
    '    if (instance->error_status != SM_ERR_NONE) {',
    '        return SM_ERR_CONFIGURATION;',
    '    }',
    ...(ir.executeAtInitialization === false
      ? ['    instance->chart_entered = false;']
      : [
        `    ${layerFunction(index, 'SM_Enter_Layer_Default', rootLayer.id)}(instance);`,
        '    if (instance->error_status != SM_ERR_NONE) {',
        '        SM_Enter_Fault(instance);',
        '    }',
      ]),
    '    return instance->error_status;',
    '}',
    '',
    'SM_Error_t SM_Reset(ADIA_Instance_t *instance)',
    '{',
    ...(historyStorageUsage(ir).deep ? ['    uint32_t layer_index;'] : []),
    ...(ir.activeSlotCount > 0 ? ['    uint32_t slot_index;'] : []),
    '    uint32_t state_index;',
    '    if (instance == NULL) {',
    '        return SM_ERR_NULL_INSTANCE;',
    '    }',
    `    ${layerFunction(index, 'SM_Exit_Layer', rootLayer.id)}(instance);`,
    ...states
      .filter((state) => state.xBridges !== null)
      .map((state) => `    ${xbStateFunction(state, 'Init')}(instance);`),
    ...Object.values(ir.variables)
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((variable) =>
        `    instance->data.${variable.cName} = (${renderCType(variable.type, variable.fixedPoint)})(${renderCInitialValue(variable)});`),
    ir.activeSlotCount > 0
      ? lines(
        '    for (slot_index = 0U; slot_index < SM_NUM_ACTIVE_SLOTS; ++slot_index) {',
        '        instance->active_states[slot_index] = SM_NODE_INVALID;',
        ...(historyStorageUsage(ir).shallow
          ? ['        instance->history_states[slot_index] = SM_NODE_INVALID;']
          : []),
        '    }',
      ).trimEnd()
      : null,
    ...(historyStorageUsage(ir).deep ? [
      '    for (layer_index = 0U; layer_index < SM_NUM_LAYERS; ++layer_index) {',
      '        for (state_index = 0U; state_index < SM_DEEP_HISTORY_BYTES; ++state_index) {',
      '            instance->deep_history[layer_index][state_index] = 0U;',
      '        }',
      '    }',
    ] : []),
    '    for (state_index = 0U; state_index <= SM_NUM_STATES; ++state_index) {',
    '        instance->state_active[state_index] = false;',
    '        instance->state_timers[state_index] = 0U;',
    '    }',
    '    instance->error_status = SM_ERR_NONE;',
    '    instance->fault_latched = false;',
    '    instance->arith_pending = false;',
    ...(eventUsage(ir).any ? renderEventResetLines(ir) : []),
    ...(ir.executeAtInitialization === false
      ? ['    instance->chart_entered = false;']
      : [
        `    ${layerFunction(index, 'SM_Enter_Layer_Default', rootLayer.id)}(instance);`,
        '    if (instance->error_status != SM_ERR_NONE) {',
        '        SM_Enter_Fault(instance);',
        '    }',
      ]),
    '    return SM_WriteOutputs(instance);',
    '}',
    '',
    'SM_Error_t SM_ReadInputs(ADIA_Instance_t *instance)',
    '{',
    '    if (instance == NULL) {',
    '        return SM_ERR_NULL_INSTANCE;',
    '    }',
    readMappings.length === 0 ? '    (void)instance;' : readMappings.join('\n'),
    '    return SM_ERR_NONE;',
    '}',
    '',
    'SM_Error_t SM_Step(ADIA_Instance_t *instance, uint32_t delta_ms)',
    '{',
    '    uint32_t state_index;',
    ...(eventUsage(ir).input ? ['    uint32_t pending_mask;'] : []),
    '    if (instance == NULL) {',
    '        return SM_ERR_NULL_INSTANCE;',
    '    }',
    '    if (instance->fault_latched || (instance->error_status != SM_ERR_NONE)) {',
    '        SM_Enter_Fault(instance);',
    '        return (instance->error_status != SM_ERR_NONE) ? instance->error_status : SM_ERR_SAFETY_VIOLATION;',
    '    }',
    '    if ((delta_ms < SM_TICK_MIN_MS) || (delta_ms > SM_TICK_MAX_MS)) {',
    '        instance->error_status = SM_ERR_TIMING;',
    '        SM_Enter_Fault(instance);',
    '        return instance->error_status;',
    '    }',
    '    instance->error_status = SM_Validate_State_Consistency(instance);',
    '    if (instance->error_status != SM_ERR_NONE) {',
    '        SM_Enter_Fault(instance);',
    '        return instance->error_status;',
    '    }',
    ...(ir.executeAtInitialization === false ? [
      '    if (!instance->chart_entered) {',
      '        instance->chart_entered = true;',
      `        ${layerFunction(index, 'SM_Enter_Layer_Default', rootLayer.id)}(instance);`,
      '        if (instance->error_status != SM_ERR_NONE) {',
      '            SM_Enter_Fault(instance);',
      '        }',
      '        return instance->error_status;',
      '    }',
    ] : []),
    '    /* delta_ms is observed physical jitter; SM_TICK_MS is behavioral logical time. */',
    '    for (state_index = 1U; state_index <= SM_NUM_STATES; ++state_index) {',
    '        if (instance->state_active[state_index]) {',
    '            if (SM_TICK_MS > (UINT32_MAX - instance->state_timers[state_index])) {',
    '                instance->state_timers[state_index] = UINT32_MAX;',
    '            } else {',
    '                instance->state_timers[state_index] += SM_TICK_MS;',
    '            }',
    '        }',
    '    }',
    ...(eventUsage(ir).any
      ? [
        ...(eventUsage(ir).input ? [
          '    SM_ENTER_CRITICAL();',
          '    pending_mask = instance->pending_events;',
          '    instance->pending_events = 0U;',
          '    SM_EXIT_CRITICAL();',
        ] : []),
        `    SM_Run_Executions(instance${eventUsage(ir).input ? ', pending_mask' : ''});`,
      ]
      : [`    (void)${layerFunction(index, 'SM_Execute_Layer', rootLayer.id)}(instance);`]),
    '    if (instance->error_status != SM_ERR_NONE) {',
    '        SM_Enter_Fault(instance);',
    '    }',
    '    return instance->error_status;',
    '}',
    '',
    ...(eventUsage(ir).input ? [
      'SM_Error_t SM_PostEvent(ADIA_Instance_t *instance, SM_Event_t event)',
      '{',
      '    if (instance == NULL) {',
      '        return SM_ERR_NULL_INSTANCE;',
      '    }',
      '    if (event >= SM_NUM_INPUT_EVENTS) {',
      '        return SM_ERR_INVALID_ARGUMENT;',
      '    }',
      '    SM_ENTER_CRITICAL();',
      '    instance->pending_events = instance->pending_events | ((uint32_t)1U << event);',
      '    SM_EXIT_CRITICAL();',
      '    return SM_ERR_NONE;',
      '}',
      '',
    ] : []),
    ...(eventUsage(ir).local ? [
      'void SM_Raise_Local_Event(ADIA_Instance_t *instance, SM_Event_t event)',
      '{',
      '    uint32_t local_queue_count;',
      '    if (instance->event_count >= SM_EVENT_QUEUE_LEN) {',
      '        if (instance->error_status == SM_ERR_NONE) {',
      '            instance->error_status = SM_ERR_EVENT_OVERFLOW;',
      '        }',
      '        return;',
      '    }',
      '    local_queue_count = instance->event_count + 1U;',
      '    instance->event_queue[(instance->event_head + instance->event_count) % SM_EVENT_QUEUE_LEN] = event;',
      '    instance->event_count = local_queue_count;',
      '}',
      '',
    ] : []),
    'SM_Error_t SM_WriteOutputs(ADIA_Instance_t *instance)',
    '{',
    '    if (instance == NULL) {',
    '        return SM_ERR_NULL_INSTANCE;',
    '    }',
    '    if (instance->fault_latched || (instance->error_status != SM_ERR_NONE)) {',
    '        SM_Enter_Fault(instance);',
    '        return (instance->error_status != SM_ERR_NONE) ? instance->error_status : SM_ERR_SAFETY_VIOLATION;',
    '    }',
    '    instance->error_status = SM_Validate_State_Consistency(instance);',
    '    if (instance->error_status != SM_ERR_NONE) {',
    '        SM_Enter_Fault(instance);',
    '        return instance->error_status;',
    '    }',
    writeMappings.length === 0 ? '    (void)instance;' : writeMappings.join('\n'),
    ir.ioMappings.length > 0 ? '    MCAL_Watchdog_Kick();' : null,
    '    return SM_ERR_NONE;',
    '}',
    '',
    'SM_Error_t SM_Sync_IO(ADIA_Instance_t *instance)',
    '{',
    '    SM_Error_t error = SM_ReadInputs(instance);',
    '    if (error == SM_ERR_NONE) {',
    '        error = SM_WriteOutputs(instance);',
    '    }',
    '    return error;',
    '}',
    '',
    'SM_Node_t SM_GetActiveSlot(const ADIA_Instance_t *instance, uint32_t slot)',
    '{',
    ir.activeSlotCount > 0
      ? '    if ((instance == NULL) || (slot >= SM_NUM_ACTIVE_SLOTS)) {'
      : '    if (instance == NULL) {',
    '        return SM_NODE_INVALID;',
    '    }',
    ir.activeSlotCount > 0
      ? '    return instance->active_states[slot];'
      : lines(
        '    (void)slot;',
        '    return SM_NODE_INVALID;',
      ).trimEnd(),
    '}',
    '',
    'SM_Node_t SM_GetLayerActive(const ADIA_Instance_t *instance, uint32_t layer)',
    '{',
    '    uint32_t slot;',
    '    if ((instance == NULL) || (layer >= SM_NUM_LAYERS)) {',
    '        return SM_NODE_INVALID;',
    '    }',
    '    slot = (uint32_t)SM_ROM_READ_INDEX(SM_Layer_Active_Slot_Map[layer]);',
    '    if (slot == SM_ROM_INDEX_NONE) {',
    '        return SM_NODE_INVALID;',
    '    }',
    '    return SM_GetActiveSlot(instance, (uint32_t)slot);',
    '}',
    '',
    'bool SM_IsStateActive(const ADIA_Instance_t *instance, SM_Node_t state)',
    '{',
    '    if ((instance == NULL)',
    '        || (state <= SM_NODE_INVALID)',
    '        || ((uint32_t)state > SM_NUM_STATES)) {',
    '        return false;',
    '    }',
    '    return instance->state_active[(uint32_t)state];',
    '}',
    '',
    'SM_Node_t SM_GetActive(const ADIA_Instance_t *instance, SM_Group_t slot)',
    '{',
    '    return SM_GetActiveSlot(instance, (uint32_t)slot);',
    '}',
    '',
    'SM_Error_t SM_GetError(const ADIA_Instance_t *instance)',
    '{',
    '    return (instance == NULL) ? SM_ERR_NULL_INSTANCE : instance->error_status;',
    '}',
    '',
    '#ifdef ADIA_TESTING',
    'SM_Error_t SM_Test_SetActiveState(ADIA_Instance_t *instance, uint32_t slot, SM_Node_t state)',
    '{',
    '    if (instance == NULL) {',
    '        return SM_ERR_NULL_INSTANCE;',
    '    }',
    '    if ((slot >= SM_NUM_ACTIVE_SLOTS) || ((uint32_t)state > SM_NUM_STATES)) {',
    '        return SM_ERR_INVALID_ARGUMENT;',
    '    }',
    '    instance->active_states[slot] = state;',
    '    return SM_ERR_NONE;',
    '}',
    '',
    'SM_Error_t SM_Test_SetStateActive(ADIA_Instance_t *instance, SM_Node_t state, bool active)',
    '{',
    '    if (instance == NULL) {',
    '        return SM_ERR_NULL_INSTANCE;',
    '    }',
    '    if ((state <= SM_NODE_INVALID) || ((uint32_t)state > SM_NUM_STATES)) {',
    '        return SM_ERR_INVALID_ARGUMENT;',
    '    }',
    '    instance->state_active[(uint32_t)state] = active;',
    '    return SM_ERR_NONE;',
    '}',
    '',
    'SM_Error_t SM_Test_SetStateTimer(ADIA_Instance_t *instance, SM_Node_t state, uint32_t timer_ms)',
    '{',
    '    if (instance == NULL) {',
    '        return SM_ERR_NULL_INSTANCE;',
    '    }',
    '    if ((state <= SM_NODE_INVALID) || ((uint32_t)state > SM_NUM_STATES)) {',
    '        return SM_ERR_INVALID_ARGUMENT;',
    '    }',
    '    instance->state_timers[(uint32_t)state] = timer_ms;',
    '    return SM_ERR_NONE;',
    '}',
    '',
    ...(historyStorageUsage(ir).shallow ? [] : ['/* cppcheck-suppress constParameterPointer */']),
    'SM_Error_t SM_Test_SetHistoryState(ADIA_Instance_t *instance, uint32_t slot, SM_Node_t state)',
    '{',
    '    if (instance == NULL) {',
    '        return SM_ERR_NULL_INSTANCE;',
    '    }',
    '    if ((slot >= SM_NUM_ACTIVE_SLOTS) || ((uint32_t)state > SM_NUM_STATES)) {',
    '        return SM_ERR_INVALID_ARGUMENT;',
    '    }',
    ...(historyStorageUsage(ir).shallow
      ? ['    instance->history_states[slot] = state;', '    return SM_ERR_NONE;']
      : ['    return SM_ERR_INVALID_ARGUMENT;']),
    '}',
    '',
    ...(historyStorageUsage(ir).deep ? [] : ['/* cppcheck-suppress constParameterPointer */']),
    'SM_Error_t SM_Test_SetDeepHistory(ADIA_Instance_t *instance, uint32_t layer, SM_Node_t state, bool active)',
    '{',
    '    if (instance == NULL) {',
    '        return SM_ERR_NULL_INSTANCE;',
    '    }',
    '    if ((layer >= SM_NUM_LAYERS) || ((uint32_t)state > SM_NUM_STATES)) {',
    '        return SM_ERR_INVALID_ARGUMENT;',
    '    }',
    ...(historyStorageUsage(ir).deep
      ? [
        '    if (active) {',
        '        SM_DH_SET(instance, layer, (uint32_t)state);',
        '    } else {',
        '        SM_DH_CLR(instance, layer, (uint32_t)state);',
        '    }',
        '    return SM_ERR_NONE;',
      ]
      : ['    (void)active;', '    return SM_ERR_INVALID_ARGUMENT;']),
    '}',
    ...(eventUsage(ir).local ? [
      '',
      'SM_Error_t SM_Test_QueueLocalEvent(ADIA_Instance_t *instance, SM_Event_t event)',
      '{',
      '    if (instance == NULL) {',
      '        return SM_ERR_NULL_INSTANCE;',
      '    }',
      `    if (!(${semanticEvents(ir).filter((candidate) => candidate.scope === 'local').map((candidate) => `(event == SM_EVENT_${candidate.cName})`).join(' || ')})) {`,
      '        return SM_ERR_INVALID_ARGUMENT;',
      '    }',
      '    SM_Raise_Local_Event(instance, event);',
      '    return instance->error_status;',
      '}',
    ] : []),
    '#endif',
  );
};

export const renderTestingReport = (
  ir: SemanticModel,
  evidence?: VerificationEvidence,
): string =>
  renderSemanticTestingReport(analyzeSemanticModel(ir), evidence, ir);

const generateCArtifactsDefaultPrefix = (
  ir: SemanticModel,
  options: CGeneratorOptions = {},
): CGeneratorResult => {
  const implementationFiles: GeneratedCFile[] = [
    { name: 'sm_config.h', content: renderConfigHeader(ir) },
    { name: 'sm_mapping.h', content: renderMappingHeader() },
    { name: 'sm_mapping.c', content: renderMappingSource(ir) },
    { name: 'sm_core.h', content: renderCoreHeader(ir.verification.cStandard, ir) },
    { name: 'sm_core.c', content: renderCoreSource(ir) },
    { name: 'sm_safety.h', content: renderSafetyHeader() },
    { name: 'sm_safety.c', content: renderSafetySource(ir) },
    { name: 'sm_user_logic.h', content: renderUserLogicHeader(ir) },
    { name: 'sm_user_logic.c', content: renderUserLogicSource(ir) },
    { name: 'mcal_dio.h', content: renderMcalHeader(ir, options) },
    ...(orderedStates(ir).some((state) => state.xBridges !== null)
      ? [
          { name: 'sm_xbridges.h', content: renderXBHeader(ir) },
          { name: 'sm_xbridges.c', content: renderXBSource(ir) },
        ]
      : []),
    ...(options.includeTestShims
      ? [{ name: 'mcal_dio_test_stubs.c', content: renderMcalTestStubs() }]
      : []),
    ...(options.includeHostHarness
      ? [{ name: 'sm_host_test.c', content: renderHostSmokeHarness(ir, options.vectorCount) }]
      : []),

  ];
  const analysis = analyzeSemanticModel(ir);
  const measuredSourceFiles = [
    ...implementationFiles,
    ...(options.reportSourceFiles ?? []),
  ].filter((file) => /\.(?:c|h|cpp|ino)$/i.test(file.name));

  if (options.includeVerificationPackage) {
    const manifest = buildSMTestManifest(ir);
    const testPackage = renderSMCTestPackage(ir, manifest, {
      standard: ir.verification.cStandard,
    });

    const productionFiles: GeneratedCFile[] = implementationFiles.map((file) => ({
      name: `production/${file.name}`,
      content: file.content,
    }));

    const reportFiles: GeneratedCFile[] = [
      {
        name: 'verification/sm_testing_report.md',
        content: renderSemanticTestingReport(
          analysis,
          options.verificationEvidence ?? DEFAULT_VERIFICATION_EVIDENCE,
          ir,
        ),
      },
      {
        name: 'verification/static_metrics_report.md',
        content: renderStaticMetricsReport(analysis, measuredSourceFiles, ir),
      },
    ];

    const packageFiles: GeneratedCFile[] = [
      ...productionFiles,
      { name: 'production/MISRA_DEVIATIONS.md', content: renderMisraDeviations(ir) },
      ...testPackage,
      ...reportFiles,
    ];

    return {
      files: packageFiles,
      errors: [],
      warnings: [],
    };
  }

  const allFiles = [
    ...implementationFiles,
    {
      name: 'sm_testing_report.md',
      content: renderSemanticTestingReport(
        analysis,
        options.verificationEvidence ?? DEFAULT_VERIFICATION_EVIDENCE,
        ir,
      ),
    },
    {
      name: 'static_metrics_report.md',
      content: renderStaticMetricsReport(analysis, measuredSourceFiles, ir),
    },
    { name: 'MISRA_DEVIATIONS.md', content: renderMisraDeviations(ir) },
  ];

  const structCheck = verifyGeneratedCStructure(allFiles);
  const errors: ErrorItem[] = structCheck.diagnostics.map((diag, index) => ({
    id: `cgen-struct-${index}`,
    type: 'error',
    message: diag.message,
    timestamp: new Date(),
  }));

  return {
    files: allFiles,
    errors,
    warnings: [],
  };
};

/** Generates the chart's C files; a model `codePrefix` is applied by the isolated rename pass (smCodePrefix.ts). */
export const generateCArtifacts = (
  ir: SemanticModel,
  options: CGeneratorOptions = {},
): CGeneratorResult => {
  const generated = generateCArtifactsDefaultPrefix(ir, options);
  if (ir.codePrefix === undefined || ir.codePrefix === DEFAULT_CODE_PREFIX) return generated;
  return { ...generated, files: applyCodePrefix(generated.files, ir.codePrefix, preservedNamesOf(ir)) };
};

export const renderMisraDeviations = (ir: SemanticModel): string => [
  '# MISRA C:2012 deviations',
  '',
  `Generated production code (C standard: ${ir.verification.cStandard ?? 'c99'}).`,
  '',
  'The generated sm_*.c / sm_*.h files (including the inline helpers of sm_core.h, sm_xbridges.* and',
  'mcal_dio.h) are checked with the cppcheck MISRA C:2012 addon. Every required and mandatory rule it',
  'detects passes. The only accepted deviation is the advisory rule below.',
  '',
  '## Rule 15.5 (advisory): a function should have a single point of exit',
  '',
  '- Scope: all generated functions that return early.',
  '- Rationale: guard clauses (NULL instance, argument and range checks), fault handling and the',
  '  "stop at the first violation" validators return as soon as the condition is known. A single exit',
  '  would need nested conditions or status flags that obscure the control flow and add paths to test.',
  '- Safeguards: every early return is a plain `return` at the function top level or inside one level of',
  '  `if`; functions contain no `goto`, no recursion (the call graph is acyclic, rule 17.2) and loops are',
  '  bounded by compile-time constants. The returns are covered by the generated test vectors.',
  '- Decision: bounded and reviewed; accepted for this code base.',
  '',
  '## Other rules',
  '',
  'No other deviation is recorded. Rules that the addon cannot evaluate (for example directive 4.x',
  'documentation rules and rules needing whole-program information) remain subject to manual review.',
  '',
].join('\n');

export interface StructureVerificationResult {
  valid: boolean;
  diagnostics: ModelDiagnostic[];
  declaredMembers: string[];
  usedMembers: string[];
  undeclaredMembers: string[];
}

export function verifyGeneratedCStructure(
  files: readonly GeneratedCFile[]
): StructureVerificationResult {
  const diagnostics: ModelDiagnostic[] = [];
  const headerFile = files.find((f) => f.name.endsWith('.h') && f.content.includes('SM_Data_t'));
  const declaredMembers = new Set<string>();

  if (headerFile) {
    const structMatch = /typedef\s+struct\s*\{([\s\S]*?)\}\s*SM_Data_t;/m.exec(headerFile.content);
    if (structMatch) {
      const structBody = structMatch[1];
      const memberRegex = /\s*(?:[a-zA-Z_][a-zA-Z0-9_]*\s+)+([a-zA-Z_][a-zA-Z0-9_]*)(?:\s*\[[^\]]+\])*\s*;/g;
      let match: RegExpExecArray | null;
      while ((match = memberRegex.exec(structBody)) !== null) {
        declaredMembers.add(match[1]);
      }
    }
  }

  const usedMembers = new Set<string>();
  const undeclaredMembers = new Set<string>();
  const dataAccessRegex = /[a-zA-Z_][a-zA-Z0-9_]*->data\.([a-zA-Z_][a-zA-Z0-9_]*)/g;

  for (const file of files) {
    if (!file.name.endsWith('.c') && !file.name.endsWith('.h')) continue;
    let match: RegExpExecArray | null;
    while ((match = dataAccessRegex.exec(file.content)) !== null) {
      const member = match[1];
      usedMembers.add(member);
      if (headerFile && !declaredMembers.has(member)) {
        undeclaredMembers.add(member);
      }
    }
  }

  if (undeclaredMembers.size > 0) {
    for (const member of undeclaredMembers) {
      diagnostics.push({
        code: 'GEN_C_UNDECLARED_DATA_MEMBER',
        message: `Generated data access "instance->data.${member}" references undeclared field in SM_Data_t`,
        severity: 'error',
      });
    }
  }

  return {
    valid: diagnostics.length === 0,
    diagnostics,
    declaredMembers: Array.from(declaredMembers),
    usedMembers: Array.from(usedMembers),
    undeclaredMembers: Array.from(undeclaredMembers),
  };
}

