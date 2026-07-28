import type { ErrorItem } from '../../types/sm_types';
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

export interface CGeneratorOptions {
  includeTestShims?: boolean;
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

const renderActions = (
  ir: SemanticModel,
  actions: SemanticState['entryActions'],
  indent = '    ',
): string => actions.map((action) =>
  `${indent}${renderCAction(action, ir.variables)}`).join('\n');

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
      renderActions(ir, transition.actions, `${indent}    `))
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
    for (const stateId of topmostExitStateIds(ir, route.exitStateIds)) {
      statements.push(
        `${indent}SM_Exit_State(instance, ${stateNode(ir, stateId)}, true);`,
      );
    }
    for (const stateId of route.entryStateIds) {
      const state = ir.states[stateId];
      if (state.activeSlot < 0) continue;
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
    exits,
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
  '#include "sm_user_logic.h"',
  '',
  ...orderedStates(ir).flatMap((state) => [
    lines(
      `void ${stateNode(ir, state.id)}_Entry(ADIA_Instance_t *instance)`,
      '{',
      state.entryActions.length === 0
        ? '    (void)instance;'
        : renderActions(ir, state.entryActions),
      '}',
    ),
    lines(
      `void ${stateNode(ir, state.id)}_During(ADIA_Instance_t *instance)`,
      '{',
      state.duringActions.length === 0
        ? '    (void)instance;'
        : renderActions(ir, state.duringActions),
      '}',
    ),
    lines(
      `void ${stateNode(ir, state.id)}_Exit(ADIA_Instance_t *instance)`,
      '{',
      state.exitActions.length === 0
        ? '    (void)instance;'
        : renderActions(ir, state.exitActions),
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

export const renderSafetySource = (ir: SemanticModel): string => lines(
  '#include <stddef.h>',
  '#include "sm_safety.h"',
  ir.ioMappings.some((mapping) => mapping.direction === 'write')
    ? '#include "mcal_dio.h"'
    : null,
  '',
  'SM_Error_t SM_Validate_State_Consistency(const ADIA_Instance_t *instance)',
  '{',
  '    if (instance == NULL) {',
  '        return SM_ERR_NULL_INSTANCE;',
  '    }',
  '    return SM_ERR_NONE;',
  '}',
  '',
  'void SM_ApplySafeOutputs(ADIA_Instance_t *instance)',
  '{',
  '    (void)instance;',
  ir.ioMappings.some((mapping) => mapping.direction === 'write')
    ? '    MCAL_ApplySafeOutputs();'
    : null,
  '}',
);

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
    'void MCAL_ApplySafeOutputs(void);',
    'void MCAL_Watchdog_Kick(void);',
    options.includeTestShims
      ? lines(
        '',
        '#ifdef MCAL_TEST_STUBS',
        'static inline bool MCAL_Test_ReadChannel(uint32_t channel) { (void)channel; return false; }',
        'static inline void MCAL_Test_WriteChannel(uint32_t channel, bool level) { (void)channel; (void)level; }',
        '#endif',
      ).trimEnd()
      : null,
    '',
    '#endif /* MCAL_DIO_H */',
  );
};

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
  ];
  const readMappings = ir.ioMappings.filter((mapping) =>
    mapping.direction === 'read').map((mapping) => {
    const variable = ir.variables[mapping.variableId];
    const rawRead = `MCAL_Dio_ReadChannel(${channelMacro(mapping.channelId)})`;
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
    return `    MCAL_Dio_WriteChannel(${channelMacro(mapping.channelId)}, (bool)(${value}));`;
  });
  const faultEntry = ir.safetyMode && ir.safeStateId !== null
    ? lines(
      `        if (!instance->state_active[${stateIndex(ir, ir.safeStateId)}]) {`,
      `            SM_Exit_Layer(instance, ${layerMacro(rootLayer)});`,
      renderEnterStateAlongPath(
        ir,
        index,
        [
          ...[...ir.states[ir.safeStateId].ancestorStateIds].reverse(),
          ir.safeStateId,
        ],
        0,
        null,
        '            ',
      ),
      '        }',
      '        SM_ApplySafeOutputs(instance);',
    ).trimEnd()
    : '';
  return lines(
    '#include <limits.h>',
    '#include <stddef.h>',
    '#include "sm_core.h"',
    '#include "sm_safety.h"',
    '#include "sm_user_logic.h"',
    '#include "mcal_dio.h"',
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
    'SM_Error_t SM_Init(ADIA_Instance_t *instance)',
    '{',
    '    uint32_t layer_index;',
    '    uint32_t state_index;',
    '    if (instance == NULL) {',
    '        return SM_ERR_NULL_INSTANCE;',
    '    }',
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
    `    ${layerFunction(index, 'SM_Enter_Layer_Default', rootLayer.id)}(instance);`,
    '    return SM_ERR_NONE;',
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
    faultEntry || null,
    '        return instance->error_status;',
    '    }',
    '    if (delta_ms != SM_TICK_MS) {',
    '        instance->error_status = SM_ERR_TIMING;',
    faultEntry || null,
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
    '    return instance->error_status;',
    '}',
    '',
    'SM_Error_t SM_WriteOutputs(ADIA_Instance_t *instance)',
    '{',
    '    if (instance == NULL) {',
    '        return SM_ERR_NULL_INSTANCE;',
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

export const renderTestingReport = (ir: SemanticModel): string => lines(
  '# ADIA State Machine Generated-C Verification Report',
  '',
  '## Structural validation',
  '',
  `- States: ${Object.keys(ir.states).length}`,
  `- Layers: ${Object.keys(ir.layers).length}`,
  `- Active configuration slots: ${ir.activeSlotCount}`,
  '',
  '## Semantic validation',
  '',
  '- Rendering consumed an immutable, validated SemanticModel.',
  '- Terminal states are quiescent and do not trigger implicit reset.',
  '- Runtime order is outer transition, during action, inner transition, then active children.',
  '',
  '## Verification status',
  '',
  '- Host compilation: pending external build gate.',
  '- Host runtime: pending external differential harness.',
  '- Embedded compilation: pending configured target toolchain.',
  '- Formal MISRA compliance and safety certification are not claimed.',
);

export const generateCArtifacts = (
  ir: SemanticModel,
  options: CGeneratorOptions = {},
): CGeneratorResult => ({
  files: [
    { name: 'sm_config.h', content: renderConfigHeader(ir) },
    { name: 'sm_core.h', content: renderCoreHeader() },
    { name: 'sm_core.c', content: renderCoreSource(ir) },
    { name: 'sm_safety.h', content: renderSafetyHeader() },
    { name: 'sm_safety.c', content: renderSafetySource(ir) },
    { name: 'sm_user_logic.h', content: renderUserLogicHeader(ir) },
    { name: 'sm_user_logic.c', content: renderUserLogicSource(ir) },
    { name: 'mcal_dio.h', content: renderMcalHeader(ir, options) },
    { name: 'sm_testing_report.md', content: renderTestingReport(ir) },
  ],
  errors: [],
  warnings: [],
});
