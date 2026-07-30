import type { ErrorItem } from '../../types/sm_types';
import { analyzeSemanticModel } from '../smAnalysisEngine';
import { toCIdentifier } from './smExpressions';
import {
  renderCAction,
  renderCExpression,
  renderCInitialValue,
  renderCType,
} from './smCExpressions';
import type {
  SemanticLayer,
  SemanticModel,
  SemanticState,
  SemanticTransition,
  SemanticTransitionRoute,
} from './smSemanticModel';
import {
  renderStaticMetricsReport,
  renderTestingReport as renderSemanticTestingReport,
} from './smReports';

export interface CGeneratorOptions {
  includeTestShims?: boolean;
  reportSourceFiles?: readonly GeneratedCFile[];
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

const renderActions = (
  ir: SemanticModel,
  actions: SemanticState['entryActions'],
  traceLabel: string,
  indent = '    ',
): string => lines(
  actions.map((action) =>
    `${indent}${renderCAction(action, ir.variables)}`).join('\n'),
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
  const guard = renderCExpression(transition.guard, ir.variables);
  const temporal = transition.temporalThresholdMs === null
    ? 'false'
    : `(instance->state_timers[${stateIndex(ir, timerStateId)}] >= ${transition.temporalThresholdMs}U)`;
  switch (transition.triggerMode) {
    case 'condition': return guard;
    case 'after': return temporal;
    case 'and': return `(${guard} && ${temporal})`;
    case 'or': return `(${guard} || ${temporal})`;
  }
};

const renderRouteEnabled = (
  ir: SemanticModel,
  route: SemanticTransitionRoute,
  timerStateId: string,
): string => route.transitionIds.map((transitionId) =>
  renderTransitionEnabled(ir, ir.transitions[transitionId], timerStateId))
  .map((condition) => `(${condition})`)
  .join(' && ');

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
        `instance->deep_history[snapshot_layer][${stateIndex(ir, childId)}]`)
      .join(' || ') || 'false';
    if (layer.decomposition === 'OR') {
      const choices = layer.children.map((childId, childIndex) => lines(
        `        ${childIndex === 0 ? 'if' : 'else if'} (instance->deep_history[snapshot_layer][${stateIndex(ir, childId)}]) {`,
        `            ${stateFunction(index, 'SM_Restore_State', childId)}(instance, snapshot_layer);`,
        '        }',
      ).trimEnd()).join(' ');
      return lines(
        `    if (${saved}) {`,
        choices,
        '    } else {',
        `        ${layerFunction(index, 'SM_Enter_Layer_Default', layerId)}(instance);`,
        '    }',
      ).trimEnd();
    }
    return layer.children.map((childId) => lines(
      `    if (instance->deep_history[snapshot_layer][${stateIndex(ir, childId)}]) {`,
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
    const condition = transitions.map((transition) =>
      `(${renderTransitionEnabled(ir, transition, transition.sourceStateId)})`)
      .join(' && ');
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
  const stateFunctions = orderedStates(ir).map((state) => lines(
    `static void ${stateFunction(index, 'SM_Enter_Deep', state.id)}(ADIA_Instance_t *instance)`,
    '{',
    renderMarkEntered(ir, state.id, '    '),
    ...state.childLayerIds.map((layerId) =>
      `    ${layerFunction(index, 'SM_Enter_Layer_Default', layerId)}(instance);`),
    '}',
    '',
    `static void ${stateFunction(index, 'SM_Restore_State', state.id)}(ADIA_Instance_t *instance, uint32_t snapshot_layer)`,
    '{',
    renderRestoreStateBody(ir, index, state.id).trimEnd(),
    '}',
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

const renderExitFunctions = (
  ir: SemanticModel,
  index: RenderIndex,
): string => {
  const recordCases = orderedLayers(ir).map((layer) => lines(
    `        case ${layerMacro(layer)}:`,
    layer.activeSlot === null
      ? null
      : `            instance->history_states[${layer.activeSlot}U] = instance->active_states[${layer.activeSlot}U];`,
    ...descendantsOfLayer(ir, layer.id).map((state) =>
      `            instance->deep_history[${layerMacro(layer)}][${stateIndex(ir, state.id)}] = instance->state_active[${stateIndex(ir, state.id)}];`),
    '            break;',
  ).trimEnd()).join('\n');

  const exitLayerCases = orderedLayers(ir).map((layer) => {
    const exitChildren = layer.decomposition === 'OR' && layer.activeSlot !== null
      ? lines(
        `            if (instance->active_states[${layer.activeSlot}U] != SM_NODE_INVALID) {`,
        `                SM_Exit_State(instance, instance->active_states[${layer.activeSlot}U], false);`,
        '            }',
      ).trimEnd()
      : [...layer.children].reverse().map((childId) =>
        `            SM_Exit_State(instance, ${stateNode(ir, childId)}, false);`)
        .join('\n');
    return lines(
      `        case ${layerMacro(layer)}:`,
      `            SM_Record_Layer_History(instance, ${layerMacro(layer)});`,
      exitChildren,
      '            break;',
    ).trimEnd();
  }).join('\n');

  const exitStateCases = orderedStates(ir).map((state) => lines(
    `        case ${stateNode(ir, state.id)}:`,
    `            if (!instance->state_active[${stateIndex(ir, state.id)}]) { break; }`,
    ...[...state.childLayerIds].reverse().map((layerId) =>
      `            SM_Exit_Layer(instance, ${layerMacro(ir.layers[layerId])});`),
    `            ${stateNode(ir, state.id)}_Exit(instance);`,
    `            instance->state_active[${stateIndex(ir, state.id)}] = false;`,
    `            instance->state_timers[${stateIndex(ir, state.id)}] = 0U;`,
    state.activeSlot >= 0
      ? lines(
        `            if (instance->active_states[${state.activeSlot}U] == ${stateNode(ir, state.id)}) {`,
        `                instance->active_states[${state.activeSlot}U] = SM_NODE_INVALID;`,
        '            }',
      ).trimEnd()
      : null,
    '            break;',
  ).trimEnd()).join('\n');

  return lines(
    'static void SM_Record_Layer_History(ADIA_Instance_t *instance, uint32_t layer)',
    '{',
    '    uint32_t state_index;',
    '    for (state_index = 0U; state_index <= SM_NUM_STATES; ++state_index) {',
    '        instance->deep_history[layer][state_index] = false;',
    '    }',
    '    switch (layer) {',
    recordCases,
    '        default: break;',
    '    }',
    '}',
    '',
    'static void SM_Exit_Layer(ADIA_Instance_t *instance, uint32_t layer)',
    '{',
    '    switch (layer) {',
    exitLayerCases,
    '        default: break;',
    '    }',
    '}',
    '',
    'static void SM_Exit_State(ADIA_Instance_t *instance, SM_Node_t state, bool record_containing_layer)',
    '{',
    '    if (record_containing_layer) {',
    '        switch (state) {',
    ...orderedStates(ir).map((state) =>
      `            case ${stateNode(ir, state.id)}: SM_Record_Layer_History(instance, ${layerMacro(ir.layers[state.layerId])}); break;`),
    '            default: break;',
    '        }',
    '    }',
    '    switch (state) {',
    exitStateCases,
    '        default: break;',
    '    }',
    '}',
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
        `${indent}${childIndex === 0 ? 'if' : 'else if'} (instance->deep_history[${layerMacro(layer)}][${stateIndex(ir, childId)}]) {`,
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
      `${indent}if (instance->deep_history[${layerMacro(layer)}][${stateIndex(ir, childId)}]) {`,
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
    for (const stateId of topmostExitStateIds(ir, route.exitStateIds)) {
      statements.push(
        `${indent}SM_Exit_State(instance, ${stateNode(ir, stateId)}, true);`,
      );
      const exitedState = ir.states[stateId];
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
        `${indent}    SM_Exit_State(instance, instance->active_states[${state.activeSlot}U], true);`,
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
    for (const route of transition.routes) {
      const condition = renderRouteEnabled(ir, route, stateId);
      const commit = renderCommitRoute(
        ir,
        index,
        transition,
        route,
        condition === '(true)' ? '    ' : '        ',
      );
      if (condition === '(true)') {
        blocks.push(lines(commit, '    return true;').trimEnd());
        return blocks.join('\n');
      }
      blocks.push(lines(
        `    if (${condition}) {`,
        commit,
        '        return true;',
        '    }',
      ).trimEnd());
    }
  }
  return blocks.join('\n');
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
    return lines(
      `static bool ${stateFunction(index, 'SM_Execute_State', state.id)}(ADIA_Instance_t *instance)`,
      '{',
      state.childLayerIds.length > 0 ? '    bool transitioned = false;' : null,
      renderTransitionPhase(ir, index, state.id, 'outer') || null,
      `    ${stateNode(ir, state.id)}_During(instance);`,
      renderTransitionPhase(ir, index, state.id, 'inner') || null,
      childSteps || null,
      state.childLayerIds.length > 0
        ? '    return transitioned;'
        : '    return false;',
      '}',
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
): string => orderedLayers(ir).map((layer) => {
  const exits = layer.decomposition === 'OR' && layer.activeSlot !== null
    ? lines(
      `    if (instance->active_states[${layer.activeSlot}U] != SM_NODE_INVALID) {`,
      `        SM_Exit_State(instance, instance->active_states[${layer.activeSlot}U], false);`,
      '    }',
    ).trimEnd()
    : [...layer.children].reverse().map((childId) =>
      `    SM_Exit_State(instance, ${stateNode(ir, childId)}, false);`)
      .join('\n');
  return lines(
    `static void ${layerFunction(index, 'SM_Exit_Layer_No_History', layer.id)}(ADIA_Instance_t *instance)`,
    '{',
    exits || '    (void)instance;',
    '}',
  );
}).join('\n');

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
    '#include <stdbool.h>',
    '#include <stdint.h>',
    '',
    `#define SM_TICK_MS ${ir.tickMs}U`,
    '#define SM_TICK_TOLERANCE_MS ((SM_TICK_MS / 10U) > 0U ? (SM_TICK_MS / 10U) : 1U)',
    `#define SM_NUM_STATES ${states.length}U`,
    `#define SM_NUM_LAYERS ${layers.length}U`,
    `#define SM_NUM_ACTIVE_SLOTS ${ir.activeSlotCount}U`,
    ...layers.map((layer) =>
      `#define ${layerMacro(layer)} ${index.layerNumber.get(layer.id)!}U`),
    ...states.map((state) =>
      `#define ${stateNode(ir, state.id)}_IDX ${index.stateNumber.get(state.id)!}U`),
    '',
    'typedef enum {',
    '    SM_NODE_INVALID = 0,',
    ...states.map((state, stateOffset) =>
      `    ${stateNode(ir, state.id)} = ${stateOffset + 1}${stateOffset === states.length - 1 ? '' : ','}`),
    '} SM_Node_t;',
    '',
    'typedef enum {',
    '    SM_ERR_NONE = 0,',
    '    SM_ERR_NULL_INSTANCE,',
    '    SM_ERR_TIMING,',
    '    SM_ERR_CONFIGURATION,',
    '    SM_ERR_SAFETY_VIOLATION',
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
        `    ${renderCType(variable.type)} ${variable.cName};`).join('\n'),
    '} SM_Data_t;',
    '',
    'typedef struct {',
    '    SM_Data_t data;',
    '    SM_Node_t active_states[(SM_NUM_ACTIVE_SLOTS > 0U) ? SM_NUM_ACTIVE_SLOTS : 1U];',
    '    SM_Node_t history_states[(SM_NUM_ACTIVE_SLOTS > 0U) ? SM_NUM_ACTIVE_SLOTS : 1U];',
    '    bool state_active[SM_NUM_STATES + 1U];',
    '    uint32_t state_timers[SM_NUM_STATES + 1U];',
    '    bool deep_history[SM_NUM_LAYERS][SM_NUM_STATES + 1U];',
    '    SM_Error_t error_status;',
    '    bool fault_latched;',
    '#ifdef SM_TRACE_ENABLED',
    '    SM_TraceSink_t trace_sink;',
    '#endif',
    '} ADIA_Instance_t;',
    '',
    '#endif /* SM_CONFIG_H */',
  );
};

export const renderCoreHeader = (): string => lines(
  '#ifndef SM_CORE_H',
  '#define SM_CORE_H',
  '',
  '#include "sm_config.h"',
  '',
  'SM_Error_t SM_Init(ADIA_Instance_t *instance);',
  'SM_Error_t SM_Reset(ADIA_Instance_t *instance);',
  'SM_Error_t SM_ReadInputs(ADIA_Instance_t *instance);',
  'SM_Error_t SM_Step(ADIA_Instance_t *instance, uint32_t delta_ms);',
  'SM_Error_t SM_WriteOutputs(ADIA_Instance_t *instance);',
  'SM_Error_t SM_Sync_IO(ADIA_Instance_t *instance);',
  'SM_Node_t SM_GetActive(const ADIA_Instance_t *instance, SM_Group_t group);',
  'SM_Error_t SM_GetError(const ADIA_Instance_t *instance);',
  '#ifdef SM_TRACE_ENABLED',
  'void SM_SetTraceSink(ADIA_Instance_t *instance, SM_TraceSink_t sink);',
  'void SM_TraceAction(ADIA_Instance_t *instance, const char *action);',
  '#else',
  '#define SM_TraceAction(instance, action) ((void)0)',
  '#endif',
  '',
  '#endif /* SM_CORE_H */',
);

export const renderUserLogicHeader = (ir: SemanticModel): string => lines(
  '#ifndef SM_USER_LOGIC_H',
  '#define SM_USER_LOGIC_H',
  '',
  '#include "sm_config.h"',
  '',
  ...orderedStates(ir).flatMap((state) => [
    `void ${stateNode(ir, state.id)}_Entry(ADIA_Instance_t *instance);`,
    `void ${stateNode(ir, state.id)}_During(ADIA_Instance_t *instance);`,
    `void ${stateNode(ir, state.id)}_Exit(ADIA_Instance_t *instance);`,
  ]),
  '',
  '#endif /* SM_USER_LOGIC_H */',
);

export const renderUserLogicSource = (ir: SemanticModel): string => lines(
  '#include "sm_core.h"',
  '#include "sm_user_logic.h"',
  '',
  ...orderedStates(ir).flatMap((state) => [
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
  const directChildCases = layers.map((layer) => lines(
    `        case ${layerMacro(layer)}:`,
    '            switch (state) {',
    ...layer.children.map((stateId) =>
      `                case ${stateNode(ir, stateId)}: return true;`),
    '                default: return false;',
    '            }',
  ).trimEnd());
  const descendantCases = layers.map((layer) => lines(
    `        case ${layerMacro(layer)}:`,
    '            switch (state) {',
    ...descendantsOfLayer(ir, layer.id).map((state) =>
      `                case ${stateNode(ir, state.id)}: return true;`),
    '                default: return false;',
    '            }',
  ).trimEnd());
  return lines(
    '#include <stddef.h>',
    '#include "sm_safety.h"',
    (ir.safetyMode || mappedOutputs.length > 0)
      ? '#include "mcal_dio.h"'
      : null,
    '',
    'static const SM_Node_t SM_State_Parent_Map[SM_NUM_STATES + 1U] = {',
    '    [0] = SM_NODE_INVALID,',
    ...states.map((state) =>
      `    [${stateIndex(ir, state.id)}] = ${state.parentStateId === null ? 'SM_NODE_INVALID' : stateNode(ir, state.parentStateId)},`),
    '};',
    '',
    'static const int32_t SM_State_Active_Slot_Map[SM_NUM_STATES + 1U] = {',
    '    [0] = -1,',
    ...states.map((state) =>
      `    [${stateIndex(ir, state.id)}] = ${state.activeSlot},`),
    '};',
    '',
    'static const SM_Node_t SM_Layer_Parent_Map[SM_NUM_LAYERS] = {',
    ...layers.map((layer) =>
      `    [${layerMacro(layer)}] = ${layer.parentStateId === null ? 'SM_NODE_INVALID' : stateNode(ir, layer.parentStateId)},`),
    '};',
    '',
    'static const int32_t SM_Layer_Active_Slot_Map[SM_NUM_LAYERS] = {',
    ...layers.map((layer) =>
      `    [${layerMacro(layer)}] = ${layer.activeSlot ?? -1},`),
    '};',
    '',
    'static const bool SM_Layer_Has_Children_Map[SM_NUM_LAYERS] = {',
    ...layers.map((layer) =>
      `    [${layerMacro(layer)}] = ${layer.children.length > 0 ? 'true' : 'false'},`),
    '};',
    '',
    'static bool SM_Is_Direct_Layer_Child(uint32_t layer_index, SM_Node_t state)',
    '{',
    '    switch (layer_index) {',
    ...directChildCases,
    '        default: return false;',
    '    }',
    '}',
    '',
    'static bool SM_Is_Layer_Descendant(uint32_t layer_index, SM_Node_t state)',
    '{',
    '    switch (layer_index) {',
    ...descendantCases,
    '        default: return false;',
    '    }',
    '}',
    '',
    'SM_Error_t SM_Validate_State_Consistency(const ADIA_Instance_t *instance)',
    '{',
    '    uint32_t layer_index;',
    '    uint32_t state_index;',
    ir.activeSlotCount > 0 ? '    uint32_t slot_index;' : null,
    '    SM_Node_t active_node;',
    '    SM_Node_t history_node;',
    '    int32_t active_slot;',
    '    SM_Node_t parent;',
    '    bool container_active;',
    '    if (instance == NULL) {',
    '        return SM_ERR_NULL_INSTANCE;',
    '    }',
    '    for (state_index = 1U; state_index <= SM_NUM_STATES; ++state_index) {',
    '        if (instance->state_active[state_index]) {',
    '            parent = SM_State_Parent_Map[state_index];',
    '            if ((parent != SM_NODE_INVALID)',
    '                && (!instance->state_active[(uint32_t)parent])) {',
    '                return SM_ERR_CONFIGURATION;',
    '            }',
    '            active_slot = SM_State_Active_Slot_Map[state_index];',
    '            if ((active_slot >= 0)',
    '                && (instance->active_states[(uint32_t)active_slot]',
    '                    != (SM_Node_t)state_index)) {',
    '                return SM_ERR_CONFIGURATION;',
    '            }',
    '        }',
    '    }',
    '    for (layer_index = 0U; layer_index < SM_NUM_LAYERS; ++layer_index) {',
    '        parent = SM_Layer_Parent_Map[layer_index];',
    '        container_active = (parent == SM_NODE_INVALID)',
    '            || instance->state_active[(uint32_t)parent];',
    '        active_slot = SM_Layer_Active_Slot_Map[layer_index];',
    '        if (container_active) {',
    '            if (active_slot >= 0) {',
    '                active_node = instance->active_states[(uint32_t)active_slot];',
    '                if ((active_node == SM_NODE_INVALID)',
    '                    || ((uint32_t)active_node > SM_NUM_STATES)',
    '                    || (!SM_Is_Direct_Layer_Child(layer_index, active_node))',
    '                    || (!instance->state_active[(uint32_t)active_node])) {',
    '                    return SM_ERR_CONFIGURATION;',
    '                }',
    '            } else if (SM_Layer_Has_Children_Map[layer_index]) {',
    '                for (state_index = 1U; state_index <= SM_NUM_STATES; ++state_index) {',
    '                    if (SM_Is_Direct_Layer_Child(layer_index, (SM_Node_t)state_index)',
    '                        && (!instance->state_active[state_index])) {',
    '                        return SM_ERR_CONFIGURATION;',
    '                    }',
    '                }',
    '            }',
    '        } else if ((active_slot >= 0)',
    '            && (instance->active_states[(uint32_t)active_slot] != SM_NODE_INVALID)) {',
    '            return SM_ERR_CONFIGURATION;',
    '        }',
    '        if (active_slot >= 0) {',
    '            history_node = instance->history_states[(uint32_t)active_slot];',
    '            if ((history_node != SM_NODE_INVALID)',
    '                && (((uint32_t)history_node > SM_NUM_STATES)',
    '                    || (!SM_Is_Direct_Layer_Child(layer_index, history_node)))) {',
    '                return SM_ERR_CONFIGURATION;',
    '            }',
    '        }',
    '        for (state_index = 1U; state_index <= SM_NUM_STATES; ++state_index) {',
    '            if (instance->deep_history[layer_index][state_index]',
    '                && (!SM_Is_Layer_Descendant(layer_index, (SM_Node_t)state_index))) {',
    '                return SM_ERR_CONFIGURATION;',
    '            }',
    '        }',
    '    }',
    ir.activeSlotCount > 0
      ? lines(
        '    for (slot_index = 0U; slot_index < SM_NUM_ACTIVE_SLOTS; ++slot_index) {',
        '        active_node = instance->active_states[slot_index];',
        '        if (active_node != SM_NODE_INVALID) {',
        '            if (((uint32_t)active_node > SM_NUM_STATES)',
        '                || (!instance->state_active[(uint32_t)active_node])',
        '                || (SM_State_Active_Slot_Map[(uint32_t)active_node]',
        '                    != (int32_t)slot_index)) {',
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
    '#include <stdbool.h>',
    '#include <stdint.h>',
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

export const renderCoreSource = (ir: SemanticModel): string => {
  const index = buildIndex(ir);
  const states = orderedStates(ir);
  const rootLayer = ir.layers[ir.rootLayerId];
  const forwardDeclarations = [
    ...orderedLayers(ir).flatMap((layer) => [
      `static void ${layerFunction(index, 'SM_Enter_Layer_Default', layer.id)}(ADIA_Instance_t *instance);`,
      `static void ${layerFunction(index, 'SM_Exit_Layer_No_History', layer.id)}(ADIA_Instance_t *instance);`,
      `static bool ${layerFunction(index, 'SM_Execute_Layer', layer.id)}(ADIA_Instance_t *instance);`,
    ]),
    ...states.flatMap((state) => [
      `static void ${stateFunction(index, 'SM_Enter_Deep', state.id)}(ADIA_Instance_t *instance);`,
      `static void ${stateFunction(index, 'SM_Restore_State', state.id)}(ADIA_Instance_t *instance, uint32_t snapshot_layer);`,
      `static bool ${stateFunction(index, 'SM_Execute_State', state.id)}(ADIA_Instance_t *instance);`,
    ]),
    'static void SM_Record_Layer_History(ADIA_Instance_t *instance, uint32_t layer);',
    'static void SM_Exit_Layer(ADIA_Instance_t *instance, uint32_t layer);',
    'static void SM_Exit_State(ADIA_Instance_t *instance, SM_Node_t state, bool record_containing_layer);',
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
    `    SM_Exit_Layer(instance, ${layerMacro(rootLayer)});`,
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
    '#include <limits.h>',
    '#include <stddef.h>',
    '#include <string.h>',
    '#include "sm_core.h"',
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
    'SM_Error_t SM_Init(ADIA_Instance_t *instance)',
    '{',
    '    uint32_t layer_index;',
    '    uint32_t state_index;',
    '    if (instance == NULL) {',
    '        return SM_ERR_NULL_INSTANCE;',
    '    }',
    '    (void)memset(instance, 0, sizeof(*instance));',
    '#ifdef SM_TRACE_ENABLED',
    '    instance->trace_sink = NULL;',
    '#endif',
    ...orderedLayers(ir).map((layer) =>
      `    (void)${layerFunction(index, 'SM_Exit_Layer_No_History', layer.id)};`),
    ...states.flatMap((state) => [
      `    (void)${stateFunction(index, 'SM_Enter_Deep', state.id)};`,
      `    (void)${stateFunction(index, 'SM_Restore_State', state.id)};`,
    ]),
    ...Object.values(ir.variables)
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((variable) =>
        `    instance->data.${variable.cName} = (${renderCType(variable.type)})(${renderCInitialValue(variable)});`),
    ir.activeSlotCount > 0
      ? lines(
        '    for (layer_index = 0U; layer_index < SM_NUM_ACTIVE_SLOTS; ++layer_index) {',
        '        instance->active_states[layer_index] = SM_NODE_INVALID;',
        '        instance->history_states[layer_index] = SM_NODE_INVALID;',
        '    }',
      ).trimEnd()
      : null,
    '    for (layer_index = 0U; layer_index < SM_NUM_LAYERS; ++layer_index) {',
    '        for (state_index = 0U; state_index <= SM_NUM_STATES; ++state_index) {',
    '            instance->deep_history[layer_index][state_index] = false;',
    '        }',
    '    }',
    '    for (state_index = 0U; state_index <= SM_NUM_STATES; ++state_index) {',
    '        instance->state_active[state_index] = false;',
    '        instance->state_timers[state_index] = 0U;',
    '    }',
    '    instance->error_status = SM_ERR_NONE;',
    '    instance->fault_latched = false;',
    `    ${layerFunction(index, 'SM_Enter_Layer_Default', rootLayer.id)}(instance);`,
    '    return SM_ERR_NONE;',
    '}',
    '',
    'SM_Error_t SM_Reset(ADIA_Instance_t *instance)',
    '{',
    '    uint32_t layer_index;',
    '    uint32_t state_index;',
    '    if (instance == NULL) {',
    '        return SM_ERR_NULL_INSTANCE;',
    '    }',
    `    SM_Exit_Layer(instance, ${layerMacro(rootLayer)});`,
    ...Object.values(ir.variables)
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((variable) =>
        `    instance->data.${variable.cName} = (${renderCType(variable.type)})(${renderCInitialValue(variable)});`),
    ir.activeSlotCount > 0
      ? lines(
        '    for (layer_index = 0U; layer_index < SM_NUM_ACTIVE_SLOTS; ++layer_index) {',
        '        instance->active_states[layer_index] = SM_NODE_INVALID;',
        '        instance->history_states[layer_index] = SM_NODE_INVALID;',
        '    }',
      ).trimEnd()
      : null,
    '    for (layer_index = 0U; layer_index < SM_NUM_LAYERS; ++layer_index) {',
    '        for (state_index = 0U; state_index <= SM_NUM_STATES; ++state_index) {',
    '            instance->deep_history[layer_index][state_index] = false;',
    '        }',
    '    }',
    '    for (state_index = 0U; state_index <= SM_NUM_STATES; ++state_index) {',
    '        instance->state_active[state_index] = false;',
    '        instance->state_timers[state_index] = 0U;',
    '    }',
    '    instance->error_status = SM_ERR_NONE;',
    '    instance->fault_latched = false;',
    `    ${layerFunction(index, 'SM_Enter_Layer_Default', rootLayer.id)}(instance);`,
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
    '    if (instance == NULL) {',
    '        return SM_ERR_NULL_INSTANCE;',
    '    }',
    '    if (instance->error_status != SM_ERR_NONE) {',
    '        SM_Enter_Fault(instance);',
    '        return instance->error_status;',
    '    }',
    '    uint32_t tick_delta;',
    '    if (delta_ms >= SM_TICK_MS) {',
    '        tick_delta = delta_ms - SM_TICK_MS;',
    '    } else {',
    '        tick_delta = SM_TICK_MS - delta_ms;',
    '    }',
    '    if (tick_delta > SM_TICK_TOLERANCE_MS) {',
    '        instance->error_status = SM_ERR_TIMING;',
    '        SM_Enter_Fault(instance);',
    '        return instance->error_status;',
    '    }',
    '    instance->error_status = SM_Validate_State_Consistency(instance);',
    '    if (instance->error_status != SM_ERR_NONE) {',
    '        SM_Enter_Fault(instance);',
    '        return instance->error_status;',
    '    }',
    '    for (state_index = 1U; state_index <= SM_NUM_STATES; ++state_index) {',
    '        if (instance->state_active[state_index]) {',
    '            if (delta_ms > (UINT32_MAX - instance->state_timers[state_index])) {',
    '                instance->state_timers[state_index] = UINT32_MAX;',
    '            } else {',
    '                instance->state_timers[state_index] += delta_ms;',
    '            }',
    '        }',
    '    }',
    `    (void)${layerFunction(index, 'SM_Execute_Layer', rootLayer.id)}(instance);`,
    '    if (instance->error_status != SM_ERR_NONE) {',
    '        SM_Enter_Fault(instance);',
    '    }',
    '    return instance->error_status;',
    '}',
    '',
    'SM_Error_t SM_WriteOutputs(ADIA_Instance_t *instance)',
    '{',
    '    if (instance == NULL) {',
    '        return SM_ERR_NULL_INSTANCE;',
    '    }',
    '    if (instance->error_status != SM_ERR_NONE) {',
    '        SM_Enter_Fault(instance);',
    '        return instance->error_status;',
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
    'SM_Node_t SM_GetActive(const ADIA_Instance_t *instance, SM_Group_t group)',
    '{',
    ir.activeSlotCount > 0
      ? '    if ((instance == NULL) || (group >= SM_NUM_ACTIVE_SLOTS)) {'
      : '    if (instance == NULL) {',
    '        return SM_NODE_INVALID;',
    '    }',
    ir.activeSlotCount > 0
      ? '    return instance->active_states[group];'
      : lines(
        '    (void)group;',
        '    return SM_NODE_INVALID;',
      ).trimEnd(),
    '}',
    '',
    'SM_Error_t SM_GetError(const ADIA_Instance_t *instance)',
    '{',
    '    return instance == NULL ? SM_ERR_NULL_INSTANCE : instance->error_status;',
    '}',
  );
};

export const renderTestingReport = (ir: SemanticModel): string =>
  renderSemanticTestingReport(analyzeSemanticModel(ir));

export const generateCArtifacts = (
  ir: SemanticModel,
  options: CGeneratorOptions = {},
): CGeneratorResult => {
  const implementationFiles: GeneratedCFile[] = [
    { name: 'sm_config.h', content: renderConfigHeader(ir) },
    { name: 'sm_core.h', content: renderCoreHeader() },
    { name: 'sm_core.c', content: renderCoreSource(ir) },
    { name: 'sm_safety.h', content: renderSafetyHeader() },
    { name: 'sm_safety.c', content: renderSafetySource(ir) },
    { name: 'sm_user_logic.h', content: renderUserLogicHeader(ir) },
    { name: 'sm_user_logic.c', content: renderUserLogicSource(ir) },
    { name: 'mcal_dio.h', content: renderMcalHeader(ir, options) },
    ...(options.includeTestShims
      ? [{ name: 'mcal_dio_test_stubs.c', content: renderMcalTestStubs() }]
      : []),
  ];
  const analysis = analyzeSemanticModel(ir);
  const measuredSourceFiles = [
    ...implementationFiles,
    ...(options.reportSourceFiles ?? []),
  ].filter((file) => /\.(?:c|h|cpp|ino)$/i.test(file.name));
  return {
    files: [
      ...implementationFiles,
      {
        name: 'sm_testing_report.md',
        content: renderSemanticTestingReport(analysis),
      },
      {
        name: 'static_metrics_report.md',
        content: renderStaticMetricsReport(analysis, measuredSourceFiles),
      },
    ],
    errors: [],
    warnings: [],
  };
};
