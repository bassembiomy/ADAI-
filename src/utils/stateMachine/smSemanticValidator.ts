import type {
  JunctionData,
  StateData,
  TransitionData,
} from '../../types/sm_types';
import {
  type ActionNode,
  type ExpressionNode,
  parseActions,
  parseCondition,
  parseInternalTransitions,
  toCIdentifier,
} from './smExpressions';
import type {
  ModelDiagnostic,
  StateMachineLayerV4,
  StateMachineModelV4,
} from './smModel';

const diagnostic = (
  code: string,
  message: string,
  elementId?: string,
): ModelDiagnostic => ({
  code,
  message,
  elementId,
  severity: 'error',
});

type SemanticValueType = 'boolean' | 'number';

const inferExpressionType = (
  expression: ExpressionNode,
  symbolTypes: ReadonlyMap<string, SemanticValueType>,
): SemanticValueType | null => {
  if (expression.kind === 'literal') {
    return typeof expression.value === 'boolean' ? 'boolean' : 'number';
  }
  if (expression.kind === 'variable') {
    return symbolTypes.get(expression.name) ?? null;
  }
  if (expression.kind === 'unary') {
    const operand = inferExpressionType(expression.operand, symbolTypes);
    if (expression.operator === '!') {
      return operand === 'boolean' ? 'boolean' : null;
    }
    return operand === 'number' ? 'number' : null;
  }
  const left = inferExpressionType(expression.left, symbolTypes);
  const right = inferExpressionType(expression.right, symbolTypes);
  if (['+', '-', '*', '/', '%'].includes(expression.operator)) {
    return left === 'number' && right === 'number' ? 'number' : null;
  }
  if (['<', '<=', '>', '>='].includes(expression.operator)) {
    return left === 'number' && right === 'number' ? 'boolean' : null;
  }
  if (expression.operator === '&&' || expression.operator === '||') {
    return left === 'boolean' && right === 'boolean' ? 'boolean' : null;
  }
  return left !== null && left === right ? 'boolean' : null;
};

const duplicateIds = <T extends { id: string }>(
  values: readonly T[],
  kind: string,
): ModelDiagnostic[] => {
  const seen = new Set<string>();
  const diagnostics: ModelDiagnostic[] = [];
  for (const value of values) {
    if (seen.has(value.id)) {
      diagnostics.push(diagnostic(
        `${kind}_ID_DUPLICATE`,
        `${kind.toLowerCase()} ID '${value.id}' is duplicated.`,
        value.id,
      ));
    }
    seen.add(value.id);
  }
  return diagnostics;
};

const C_KEYWORDS = new Set([
  'auto', 'break', 'case', 'char', 'const', 'continue', 'default', 'do',
  'double', 'else', 'enum', 'extern', 'float', 'for', 'goto', 'if', 'inline',
  'int', 'long', 'register', 'restrict', 'return', 'short', 'signed',
  'sizeof', 'static', 'struct', 'switch', 'typedef', 'union', 'unsigned',
  'void', 'volatile', 'while', '_Alignas', '_Alignof', '_Atomic', '_Bool',
  '_Complex', '_Generic', '_Imaginary', '_Noreturn', '_Static_assert',
  '_Thread_local',
]);

const validateIdentifierNamespaces = (
  model: StateMachineModelV4,
): ModelDiagnostic[] => {
  const diagnostics: ModelDiagnostic[] = [];
  const stateIds = new Set(model.states.map((state) => state.id));
  for (const junction of model.junctions) {
    if (stateIds.has(junction.id)) {
      diagnostics.push(diagnostic(
        'ENDPOINT_ID_COLLISION',
        `State and junction endpoint ID '${junction.id}' collide.`,
        junction.id,
      ));
    }
  }

  const aliases = new Map<string, string>();
  for (const variable of model.variables) {
    for (const alias of [variable.id, variable.name]) {
      const owner = aliases.get(alias);
      if (owner !== undefined && owner !== variable.id) {
        diagnostics.push(diagnostic(
          'SYMBOL_ALIAS_COLLISION',
          `Symbol '${alias}' ambiguously refers to variables '${owner}' and '${variable.id}'.`,
          variable.id,
        ));
      }
      aliases.set(alias, variable.id);
    }
  }

  const generatedNames = new Map<string, string>();
  const register = (generated: string, sourceId: string): void => {
    const previous = generatedNames.get(generated);
    if (previous !== undefined && previous !== sourceId) {
      diagnostics.push(diagnostic(
        'C_IDENTIFIER_COLLISION',
        `Elements '${previous}' and '${sourceId}' normalize to C identifier '${generated}'.`,
        sourceId,
      ));
    }
    generatedNames.set(generated, sourceId);
  };
  for (const state of model.states) {
    register(`SM_ST_${toCIdentifier(state.id).toUpperCase()}`, state.id);
  }
  for (const variable of model.variables) {
    const cName = toCIdentifier(variable.name);
    register(`DATA_${cName}`, variable.id);
    if (C_KEYWORDS.has(cName)) {
      diagnostics.push(diagnostic(
        'C_IDENTIFIER_RESERVED',
        `Variable '${variable.id}' normalizes to reserved C keyword '${cName}'.`,
        variable.id,
      ));
    }
  }
  for (const element of [
    ...model.states,
    ...model.junctions,
    ...model.transitions,
    ...model.layers,
    ...model.variables,
  ]) {
    if (
      element.id === '__proto__'
      || element.id === 'prototype'
      || element.id === 'constructor'
    ) {
      diagnostics.push(diagnostic(
        'MODEL_ID_RESERVED',
        `Element ID '${element.id}' is reserved by the semantic record format.`,
        element.id,
      ));
    }
  }
  return diagnostics;
};

const buildMembership = (
  model: StateMachineModelV4,
): {
  stateLayers: Map<string, StateMachineLayerV4[]>;
  junctionLayers: Map<string, StateMachineLayerV4[]>;
} => {
  const stateLayers = new Map<string, StateMachineLayerV4[]>();
  const junctionLayers = new Map<string, StateMachineLayerV4[]>();
  for (const layer of model.layers) {
    for (const stateId of layer.stateIds) {
      const memberships = stateLayers.get(stateId) ?? [];
      memberships.push(layer);
      stateLayers.set(stateId, memberships);
    }
    for (const junctionId of layer.junctionIds) {
      const memberships = junctionLayers.get(junctionId) ?? [];
      memberships.push(layer);
      junctionLayers.set(junctionId, memberships);
    }
  }
  return { stateLayers, junctionLayers };
};

const validateMembership = (
  model: StateMachineModelV4,
  stateLayers: ReadonlyMap<string, StateMachineLayerV4[]>,
  junctionLayers: ReadonlyMap<string, StateMachineLayerV4[]>,
): ModelDiagnostic[] => {
  const diagnostics: ModelDiagnostic[] = [];
  const statesById = new Map(model.states.map((state) => [state.id, state]));
  const junctionsById = new Map(
    model.junctions.map((junction) => [junction.id, junction]),
  );

  for (const layer of model.layers) {
    for (const stateId of layer.stateIds) {
      if (!statesById.has(stateId)) {
        diagnostics.push(diagnostic(
          'STATE_MEMBERSHIP_UNKNOWN',
          `Layer '${layer.id}' contains unknown state '${stateId}'.`,
          stateId,
        ));
      }
    }
    for (const junctionId of layer.junctionIds) {
      if (!junctionsById.has(junctionId)) {
        diagnostics.push(diagnostic(
          'JUNCTION_MEMBERSHIP_UNKNOWN',
          `Layer '${layer.id}' contains unknown junction '${junctionId}'.`,
          junctionId,
        ));
      }
    }
  }

  for (const state of model.states) {
    const memberships = stateLayers.get(state.id) ?? [];
    if (memberships.length === 0) {
      diagnostics.push(diagnostic(
        'STATE_MEMBERSHIP_MISSING',
        `State '${state.id}' does not belong to a layer.`,
        state.id,
      ));
    } else if (memberships.length > 1) {
      diagnostics.push(diagnostic(
        'STATE_DUPLICATE_MEMBERSHIP',
        `State '${state.id}' belongs to multiple layers.`,
        state.id,
      ));
    }
  }

  for (const junction of model.junctions) {
    const memberships = junctionLayers.get(junction.id) ?? [];
    if (memberships.length === 0) {
      diagnostics.push(diagnostic(
        'JUNCTION_MEMBERSHIP_MISSING',
        `Junction '${junction.id}' does not belong to a layer.`,
        junction.id,
      ));
    } else if (memberships.length > 1) {
      diagnostics.push(diagnostic(
        'JUNCTION_DUPLICATE_MEMBERSHIP',
        `Junction '${junction.id}' belongs to multiple layers.`,
        junction.id,
      ));
    }
  }
  return diagnostics;
};

const validateHierarchy = (
  model: StateMachineModelV4,
  stateLayers: ReadonlyMap<string, StateMachineLayerV4[]>,
): ModelDiagnostic[] => {
  const diagnostics: ModelDiagnostic[] = [];
  const statesById = new Map(model.states.map((state) => [state.id, state]));
  const rootLayers = model.layers.filter((layer) => layer.parentStateId === null);
  if (rootLayers.length !== 1) {
    diagnostics.push(diagnostic(
      'ROOT_LAYER_REQUIRED',
      `A model requires exactly one root layer; found ${rootLayers.length}.`,
    ));
  }

  for (const layer of model.layers) {
    if (layer.parentStateId !== null && !statesById.has(layer.parentStateId)) {
      diagnostics.push(diagnostic(
        'LAYER_PARENT_INVALID',
        `Layer '${layer.id}' has unknown parent state '${layer.parentStateId}'.`,
        layer.id,
      ));
    }
  }

  const parentOf = (stateId: string): string | null =>
    stateLayers.get(stateId)?.[0]?.parentStateId ?? null;
  const reported = new Set<string>();
  for (const state of model.states) {
    const path = new Set<string>();
    let current: string | null = state.id;
    while (current !== null) {
      if (path.has(current)) {
        if (!reported.has(current)) {
          diagnostics.push(diagnostic(
            'PARENT_HIERARCHY_CYCLE',
            `State parent ownership contains a cycle at '${current}'.`,
            current,
          ));
          reported.add(current);
        }
        break;
      }
      path.add(current);
      current = parentOf(current);
    }
  }
  return diagnostics;
};

const validateDecomposition = (
  model: StateMachineModelV4,
): ModelDiagnostic[] => {
  const diagnostics: ModelDiagnostic[] = [];
  const statesById = new Map(model.states.map((state) => [state.id, state]));
  const junctionsById = new Map(
    model.junctions.map((junction) => [junction.id, junction]),
  );

  for (const layer of model.layers) {
    const childStates = layer.stateIds
      .map((id) => statesById.get(id))
      .filter((state): state is StateData => state !== undefined);
    if (layer.decomposition === 'OR' && childStates.length > 0) {
      const defaultStateCount = childStates.filter((state) => state.autostart).length;
      const defaultJunctionCount = layer.junctionIds
        .map((id) => junctionsById.get(id))
        .filter((junction): junction is JunctionData => junction !== undefined)
        .filter((junction) => junction.autostart === true)
        .length;
      if (defaultStateCount + defaultJunctionCount !== 1) {
        diagnostics.push(diagnostic(
          'OR_DEFAULT_PATH_REQUIRED',
          `OR layer '${layer.id}' requires exactly one default path.`,
          layer.id,
        ));
      }
    }

    if (layer.decomposition === 'AND') {
      const priorities = new Set<number>();
      for (const state of childStates) {
        if (!Number.isInteger(state.priority) || state.priority < 0) {
          diagnostics.push(diagnostic(
            'AND_PRIORITY_INVALID',
            `AND child '${state.id}' has invalid priority '${state.priority}'.`,
            state.id,
          ));
        }
        if (priorities.has(state.priority)) {
          diagnostics.push(diagnostic(
            'AND_PRIORITY_DUPLICATE',
            `AND layer '${layer.id}' has duplicate priority '${state.priority}'.`,
            layer.id,
          ));
        }
        priorities.add(state.priority);
      }
    }
  }
  return diagnostics;
};

const validateTransitionPaths = (
  model: StateMachineModelV4,
): ModelDiagnostic[] => {
  const diagnostics: ModelDiagnostic[] = [];
  const stateIds = new Set(model.states.map((state) => state.id));
  const junctionIds = new Set(model.junctions.map((junction) => junction.id));
  const junctionsById = new Map(
    model.junctions.map((junction) => [junction.id, junction]),
  );
  const knownIds = new Set([...stateIds, ...junctionIds]);
  const parentByStateId = new Map<string, string | null>();
  for (const layer of model.layers) {
    for (const stateId of layer.stateIds) {
      parentByStateId.set(stateId, layer.parentStateId);
    }
  }
  const outgoing = new Map<string, TransitionData[]>();
  for (const transition of model.transitions) {
    const transitions = outgoing.get(transition.sourceId) ?? [];
    transitions.push(transition);
    outgoing.set(transition.sourceId, transitions);
  }

  const reachesState = (id: string, path: ReadonlySet<string>): boolean => {
    if (stateIds.has(id)) return true;
    const junction = junctionsById.get(id);
    if (junction?.type === 'history' || junction?.type === 'deep-history') {
      return true;
    }
    if (!junctionIds.has(id) || path.has(id)) return false;
    const nextPath = new Set(path);
    nextPath.add(id);
    return (outgoing.get(id) ?? []).some((item) =>
      reachesState(item.targetId, nextPath));
  };

  const reachableStateIds = (
    id: string,
    path: ReadonlySet<string>,
  ): Set<string> => {
    if (stateIds.has(id)) return new Set([id]);
    if (!junctionIds.has(id) || path.has(id)) return new Set();
    const nextPath = new Set(path);
    nextPath.add(id);
    const reachable = new Set<string>();
    for (const transition of outgoing.get(id) ?? []) {
      for (const stateId of reachableStateIds(transition.targetId, nextPath)) {
        reachable.add(stateId);
      }
    }
    return reachable;
  };

  const cycleState = new Map<string, 'visiting' | 'visited'>();
  const cyclicJunctions = new Set<string>();
  const visitJunction = (junctionId: string, path: string[]): void => {
    if (cycleState.get(junctionId) === 'visiting') {
      const cycleStart = path.indexOf(junctionId);
      for (const id of path.slice(cycleStart)) cyclicJunctions.add(id);
      return;
    }
    if (cycleState.get(junctionId) === 'visited') return;
    cycleState.set(junctionId, 'visiting');
    for (const edge of outgoing.get(junctionId) ?? []) {
      if (junctionIds.has(edge.targetId)) {
        visitJunction(edge.targetId, [...path, junctionId]);
      }
    }
    cycleState.set(junctionId, 'visited');
  };
  for (const junctionId of junctionIds) visitJunction(junctionId, []);
  for (const junctionId of [...cyclicJunctions].sort()) {
    diagnostics.push(diagnostic(
      'JUNCTION_PATH_CYCLE',
      `Junction '${junctionId}' participates in an unbounded cycle.`,
      junctionId,
    ));
  }

  const isDescendant = (candidateId: string, ancestorId: string): boolean => {
    let current = parentByStateId.get(candidateId) ?? null;
    const visited = new Set<string>();
    while (current !== null && !visited.has(current)) {
      if (current === ancestorId) return true;
      visited.add(current);
      current = parentByStateId.get(current) ?? null;
    }
    return false;
  };

  for (const transition of model.transitions) {
    if (
      (transition.type === 'after'
        || transition.type === 'and'
        || transition.type === 'or')
      && transition.afterTicks === null
    ) {
      diagnostics.push(diagnostic(
        'TEMPORAL_THRESHOLD_REQUIRED',
        `Transition '${transition.id}' requires afterTicks for '${transition.type}' mode.`,
        transition.id,
      ));
    }
    if (
      transition.afterTicks !== null
      && (
        !Number.isInteger(transition.afterTicks)
        || transition.afterTicks < 0
      )
    ) {
      diagnostics.push(diagnostic(
        'TEMPORAL_THRESHOLD_INVALID',
        `Transition '${transition.id}' has invalid afterTicks '${transition.afterTicks}'.`,
        transition.id,
      ));
    }
    if (
      !knownIds.has(transition.sourceId)
      || !knownIds.has(transition.targetId)
      || !reachesState(transition.targetId, new Set())
    ) {
      diagnostics.push(diagnostic(
        'TRANSITION_PATH_DANGLING',
        `Transition '${transition.id}' does not form a path to a state.`,
        transition.id,
      ));
    }
    const isInternal = transition.isInternal === true || transition.type === 'internal';
    const reachableInternalDestinations = junctionIds.has(transition.targetId)
      ? reachableStateIds(transition.targetId, new Set())
      : new Set<string>();
    const targetJunction = junctionsById.get(transition.targetId);
    const historyOwnerLayer = targetJunction
      ? model.layers.find((layer) => layer.junctionIds.includes(targetJunction.id))
      : undefined;
    const validHistoryTarget = (
      targetJunction?.type === 'history'
      || targetJunction?.type === 'deep-history'
    ) && historyOwnerLayer?.parentStateId !== null
      && historyOwnerLayer?.parentStateId !== undefined
      && (
        historyOwnerLayer.parentStateId === transition.sourceId
        || isDescendant(historyOwnerLayer.parentStateId, transition.sourceId)
      );
    const validInternalJunctionTarget = junctionIds.has(transition.targetId)
      && (
        validHistoryTarget
        || (
          reachableInternalDestinations.size > 0
          && [...reachableInternalDestinations].every((stateId) =>
            isDescendant(stateId, transition.sourceId))
        )
      );
    if (
      isInternal
      && (
        !stateIds.has(transition.sourceId)
        || (
          !validInternalJunctionTarget
          && (
            !stateIds.has(transition.targetId)
            || (
              transition.sourceId !== transition.targetId
              && !isDescendant(transition.targetId, transition.sourceId)
            )
          )
        )
      )
    ) {
      diagnostics.push(diagnostic(
        'INNER_DESTINATION_INVALID',
        `Internal transition '${transition.id}' must target its source or a descendant.`,
        transition.id,
      ));
    }
  }
  const childLayersByParent = new Map<string, StateMachineLayerV4[]>();
  for (const layer of model.layers) {
    if (layer.parentStateId === null) continue;
    const childLayers = childLayersByParent.get(layer.parentStateId) ?? [];
    childLayers.push(layer);
    childLayersByParent.set(layer.parentStateId, childLayers);
  }
  const collectStateSubtree = (
    stateId: string,
    collected: Set<string>,
  ): void => {
    if (collected.has(stateId)) return;
    collected.add(stateId);
    for (const childLayer of childLayersByParent.get(stateId) ?? []) {
      for (const childStateId of childLayer.stateIds) {
        collectStateSubtree(childStateId, collected);
      }
    }
  };
  for (const layer of model.layers) {
    if (layer.decomposition !== 'OR') continue;
    const defaultJunction = layer.junctionIds
      .map((id) => model.junctions.find((junction) => junction.id === id))
      .find((junction) => junction?.autostart === true);
    if (
      defaultJunction
      && !reachesState(defaultJunction.id, new Set())
    ) {
      diagnostics.push(diagnostic(
        'OR_DEFAULT_PATH_DANGLING',
        `Default junction '${defaultJunction.id}' does not reach a state.`,
        defaultJunction.id,
      ));
    }
    if (defaultJunction) {
      const allowedStates = new Set<string>();
      for (const stateId of layer.stateIds) {
        collectStateSubtree(stateId, allowedStates);
      }
      const destinations = reachableStateIds(defaultJunction.id, new Set());
      if ([...destinations].some((stateId) => !allowedStates.has(stateId))) {
        diagnostics.push(diagnostic(
          'OR_DEFAULT_PATH_ESCAPES_CONTAINER',
          `Default junction '${defaultJunction.id}' leaves OR layer '${layer.id}'.`,
          defaultJunction.id,
        ));
      }
    }
  }
  return diagnostics;
};

const validateHistory = (
  model: StateMachineModelV4,
  junctionLayers: ReadonlyMap<string, StateMachineLayerV4[]>,
): ModelDiagnostic[] => {
  const diagnostics: ModelDiagnostic[] = [];
  for (const junction of model.junctions) {
    if (junction.type !== 'history' && junction.type !== 'deep-history') {
      continue;
    }
    const owners = junctionLayers.get(junction.id) ?? [];
    const owner = owners.length === 1 ? owners[0] : undefined;
    if (
      !owner
      || owner.parentStateId === null
      || (
        junction.parentId !== owner.id
        && junction.parentId !== owner.parentStateId
      )
    ) {
      diagnostics.push(diagnostic(
        'HISTORY_OWNERSHIP_INVALID',
        `History junction '${junction.id}' must belong to one non-root layer.`,
        junction.id,
      ));
    }
  }
  return diagnostics;
};

const validateMappings = (
  model: StateMachineModelV4,
): ModelDiagnostic[] => {
  if (!model.hilConfig) return [];
  const diagnostics: ModelDiagnostic[] = [];
  const variables = new Map<string, string>();
  for (const variable of model.variables) {
    variables.set(variable.id, variable.id);
    variables.set(variable.name, variable.id);
  }
  const channels = new Map(
    model.hilConfig.channels.map((channel) => [channel.id, channel]),
  );
  const mappingKeys = new Set<string>();
  const mappingIds = new Set<string>();
  const variablesById = new Map(
    model.variables.map((variable) => [variable.id, variable]),
  );

  for (const mapping of model.hilConfig.mappings) {
    if (mappingIds.has(mapping.id)) {
      diagnostics.push(diagnostic(
        'IO_MAPPING_ID_DUPLICATE',
        `I/O mapping ID '${mapping.id}' is duplicated.`,
        mapping.id,
      ));
    }
    mappingIds.add(mapping.id);
    const variableId = variables.get(mapping.adiaVarId);
    const key = `${variableId ?? mapping.adiaVarId}:${mapping.direction}`;
    if (mappingKeys.has(key)) {
      diagnostics.push(diagnostic(
        'IO_MAPPING_DUPLICATE',
        `Variable '${mapping.adiaVarId}' has duplicate '${mapping.direction}' mappings.`,
        mapping.id,
      ));
    }
    mappingKeys.add(key);

    const channel = channels.get(mapping.channelId);
    if (!variableId || !channel) {
      diagnostics.push(diagnostic(
        'IO_MAPPING_INVALID',
        `Mapping '${mapping.id}' references an unknown variable or channel.`,
        mapping.id,
      ));
      continue;
    }

    const expectedDirection = mapping.direction === 'read' ? 'In' : 'Out';
    if (channel.direction !== expectedDirection) {
      diagnostics.push(diagnostic(
        'IO_MAPPING_DIRECTION_INVALID',
        `Mapping '${mapping.id}' direction conflicts with channel '${channel.id}'.`,
        mapping.id,
      ));
    }

    if (mapping.conversionExpr?.trim()) {
      try {
        const conversion = parseCondition(
          mapping.conversionExpr,
          new Set(['x']),
        );
        const variable = variablesById.get(variableId);
        const variableType: SemanticValueType =
          variable?.type === 'bool' ? 'boolean' : 'number';
        const channelType: SemanticValueType =
          channel.dataType === 'bool' ? 'boolean' : 'number';
        const sourceType = mapping.direction === 'read'
          ? channelType
          : variableType;
        const targetType = mapping.direction === 'read'
          ? variableType
          : channelType;
        if (
          inferExpressionType(
            conversion,
            new Map([['x', sourceType]]),
          ) !== targetType
        ) {
          diagnostics.push(diagnostic(
            'IO_MAPPING_CONVERSION_TYPE_INVALID',
            `Mapping '${mapping.id}' conversion output type is incompatible.`,
            mapping.id,
          ));
        }
      } catch (error) {
        diagnostics.push(diagnostic(
          'IO_MAPPING_CONVERSION_INVALID',
          `Mapping '${mapping.id}' conversion is invalid: ${String(error)}`,
          mapping.id,
        ));
      }
    }
  }
  return diagnostics;
};

const validateExpressions = (
  model: StateMachineModelV4,
): ModelDiagnostic[] => {
  const diagnostics: ModelDiagnostic[] = [];
  const symbols = new Set<string>();
  const symbolTypes = new Map<string, SemanticValueType>();
  for (const variable of model.variables) {
    symbols.add(variable.id);
    symbols.add(variable.name);
    const type = variable.type === 'bool' ? 'boolean' : 'number';
    symbolTypes.set(variable.id, type);
    symbolTypes.set(variable.name, type);
  }

  const actionsHaveValidTypes = (actions: readonly ActionNode[]): boolean =>
    actions.every((action) => {
      const targetType = symbolTypes.get(action.target);
      return targetType !== undefined
        && inferExpressionType(action.value, symbolTypes) === targetType;
    });

  const validateAction = (source: string, elementId: string): void => {
    try {
      const actions = parseActions(source, symbols);
      if (!actionsHaveValidTypes(actions)) {
        diagnostics.push(diagnostic(
          'ACTION_TYPE_INVALID',
          `Action on '${elementId}' assigns an incompatible expression type.`,
          elementId,
        ));
      }
    } catch (error) {
      diagnostics.push(diagnostic(
        'ACTION_SYMBOL_INVALID',
        `Action on '${elementId}' is invalid: ${String(error)}`,
        elementId,
      ));
    }
  };

  for (const state of model.states) {
    validateAction(state.entry, state.id);
    validateAction(state.during, state.id);
    validateAction(state.exit, state.id);
    try {
      const parsed = parseInternalTransitions(state.internalTransitions ?? '', symbols);
      if (
        parsed.some((transition) =>
          inferExpressionType(transition.guard, symbolTypes) !== 'boolean'
          || !actionsHaveValidTypes(transition.actions))
      ) {
        diagnostics.push(diagnostic(
          'INTERNAL_TRANSITION_TYPE_INVALID',
          `Internal transition on '${state.id}' has incompatible expression types.`,
          state.id,
        ));
      }
    } catch (error) {
      diagnostics.push(diagnostic(
        'INTERNAL_TRANSITION_INVALID',
        `Internal transition on '${state.id}' is invalid: ${String(error)}`,
        state.id,
      ));
    }
  }

  const explicitTransitionIds = new Set(
    model.transitions.map((transition) => transition.id),
  );
  for (const state of model.states) {
    const internalCount = (state.internalTransitions ?? '')
      .split(/\r?\n/)
      .filter((line) => line.trim() !== '')
      .length;
    for (let index = 0; index < internalCount; index += 1) {
      const generatedId = `$internal_${state.id}_${index}`;
      if (explicitTransitionIds.has(generatedId)) {
        diagnostics.push(diagnostic(
          'INTERNAL_TRANSITION_ID_COLLISION',
          `Internal transition ID '${generatedId}' collides with an explicit transition.`,
          generatedId,
        ));
      }
    }
  }

  for (const transition of model.transitions) {
    validateAction(transition.action, transition.id);
    try {
      const guard = parseCondition(transition.condition, symbols);
      if (inferExpressionType(guard, symbolTypes) !== 'boolean') {
        diagnostics.push(diagnostic(
          'GUARD_TYPE_INVALID',
          `Guard on '${transition.id}' must be boolean.`,
          transition.id,
        ));
      }
    } catch (error) {
      diagnostics.push(diagnostic(
        'GUARD_EXPRESSION_INVALID',
        `Guard on '${transition.id}' is invalid: ${String(error)}`,
        transition.id,
      ));
    }
  }
  return diagnostics;
};

const validateInitialValues = (
  model: StateMachineModelV4,
): ModelDiagnostic[] => {
  const diagnostics: ModelDiagnostic[] = [];
  for (const variable of model.variables) {
    const source = variable.initialValue.trim();
    const valid = variable.type === 'bool'
      ? ['true', 'false', '0', '1'].includes(source.toLowerCase())
      : Number.isFinite(Number(source.replace(/[uUlLfF]+$/, '')));
    if (!valid) {
      diagnostics.push(diagnostic(
        'VARIABLE_INITIAL_VALUE_INVALID',
        `Variable '${variable.id}' has invalid initial value '${variable.initialValue}'.`,
        variable.id,
      ));
    }
  }
  return diagnostics;
};

export const validateModelStructure = (
  model: StateMachineModelV4,
): ModelDiagnostic[] => {
  const diagnostics: ModelDiagnostic[] = [
    ...duplicateIds(model.states, 'STATE'),
    ...duplicateIds(model.layers, 'LAYER'),
    ...duplicateIds(model.junctions, 'JUNCTION'),
    ...duplicateIds(model.transitions, 'TRANSITION'),
    ...duplicateIds(model.variables, 'VARIABLE'),
    ...validateIdentifierNamespaces(model),
  ];
  const { stateLayers, junctionLayers } = buildMembership(model);
  diagnostics.push(
    ...validateMembership(model, stateLayers, junctionLayers),
    ...validateHierarchy(model, stateLayers),
    ...validateDecomposition(model),
    ...validateTransitionPaths(model),
    ...validateHistory(model, junctionLayers),
    ...validateMappings(model),
    ...validateExpressions(model),
    ...validateInitialValues(model),
  );
  return diagnostics;
};
