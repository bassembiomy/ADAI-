import { v4 as uuidv4 } from 'uuid';
import { StateData, JunctionData, TransitionData, Layer } from '../types/sm_types';

export interface StateMachineClipboardData {
  states: StateData[];
  junctions: JunctionData[];
  transitions: TransitionData[];
  layers: Layer[];
  blocks: any[];
  relationships: any[];
  parts: any[];
  connectors: any[];
  interfaceRealizations: any[];
  topLevelStateIds: string[];
  topLevelJunctionIds: string[];
  topLevelTransitionIds: string[];
}

export function createStateMachineClipboard(
  selectedIds: string[],
  states: StateData[],
  junctions: JunctionData[],
  transitions: TransitionData[],
  layers: Layer[],
  blocks: any[] = [],
  relationships: any[] = [],
  parts: any[] = [],
  connectors: any[] = [],
  interfaceRealizations: any[] = []
): StateMachineClipboardData {
  const topLevelStates = states.filter(s => selectedIds.includes(s.id));
  const topLevelJunctions = junctions.filter(j => selectedIds.includes(j.id));
  
  const selectedNodeIds = new Set([
    ...topLevelStates.map(s => s.id),
    ...topLevelJunctions.map(j => j.id)
  ]);

  // Include transitions explicitly selected or connecting two selected nodes
  const topLevelTransitionsMap = new Map<string, TransitionData>();
  transitions.filter(t => selectedIds.includes(t.id)).forEach(t => topLevelTransitionsMap.set(t.id, t));
  transitions.filter(t => selectedNodeIds.has(t.sourceId) && selectedNodeIds.has(t.targetId)).forEach(t => topLevelTransitionsMap.set(t.id, t));

  const topLevelTransitions = Array.from(topLevelTransitionsMap.values());
  const selectedBlocks = blocks.filter(b => selectedIds.includes(b.id));
  const selectedRelationships = relationships.filter(r => selectedIds.includes(r.id));
  const selectedParts = parts.filter(p => selectedIds.includes(p.id));
  const selectedConnectors = connectors.filter(c => selectedIds.includes(c.id));
  const selectedInterfaceRealizations = interfaceRealizations.filter(ir => selectedIds.includes(ir.id));

  const allStatesMap = new Map<string, StateData>();
  topLevelStates.forEach(s => allStatesMap.set(s.id, s));

  const allJunctionsMap = new Map<string, JunctionData>();
  topLevelJunctions.forEach(j => allJunctionsMap.set(j.id, j));

  const allTransitionsMap = new Map<string, TransitionData>();
  topLevelTransitions.forEach(t => allTransitionsMap.set(t.id, t));

  const collectedLayersMap = new Map<string, Layer>();

  // Recursively collect descendant states, junctions, transitions, and sub-layers
  const collectDescendants = (stateId: string) => {
    const childLayers = layers.filter(l => l.parentStateId === stateId);
    for (const childLayer of childLayers) {
      if (collectedLayersMap.has(childLayer.id)) continue;
      collectedLayersMap.set(childLayer.id, childLayer);

      const subStates = states.filter(s => childLayer.stateIds.includes(s.id));
      for (const subState of subStates) {
        if (!allStatesMap.has(subState.id)) {
          allStatesMap.set(subState.id, subState);
          collectDescendants(subState.id);
        }
      }

      const subJunctions = junctions.filter(j => childLayer.junctionIds.includes(j.id));
      for (const subJ of subJunctions) {
        allJunctionsMap.set(subJ.id, subJ);
      }

      const subTransitions = transitions.filter(t => childLayer.transitionIds.includes(t.id));
      for (const subT of subTransitions) {
        allTransitionsMap.set(subT.id, subT);
      }
    }
  };

  topLevelStates.forEach(s => collectDescendants(s.id));

  return {
    states: Array.from(allStatesMap.values()),
    junctions: Array.from(allJunctionsMap.values()),
    transitions: Array.from(allTransitionsMap.values()),
    layers: Array.from(collectedLayersMap.values()),
    blocks: selectedBlocks,
    relationships: selectedRelationships,
    parts: selectedParts,
    connectors: selectedConnectors,
    interfaceRealizations: selectedInterfaceRealizations,
    topLevelStateIds: topLevelStates.map(s => s.id),
    topLevelJunctionIds: topLevelJunctions.map(j => j.id),
    topLevelTransitionIds: topLevelTransitions.map(t => t.id),
  };
}

export function pasteStateMachineClipboard(
  clipboard: StateMachineClipboardData,
  currentLayerId: string,
  existingStates: StateData[],
  existingJunctions: JunctionData[],
  existingTransitions: TransitionData[],
  existingLayers: Layer[],
  existingBlocks: any[] = [],
  existingRelationships: any[] = [],
  existingParts: any[] = [],
  existingConnectors: any[] = [],
  existingInterfaceRealizations: any[] = []
) {
  const idMap = new Map<string, string>();

  // Generate new IDs for all copied items
  clipboard.states.forEach(s => idMap.set(s.id, uuidv4()));
  clipboard.junctions.forEach(j => idMap.set(j.id, uuidv4()));
  clipboard.layers.forEach(l => idMap.set(l.id, uuidv4()));
  (clipboard.blocks || []).forEach(b => idMap.set(b.id, uuidv4()));
  (clipboard.parts || []).forEach(p => idMap.set(p.id, uuidv4()));

  const topLevelSet = new Set(clipboard.topLevelStateIds);

  const newStates: StateData[] = clipboard.states.map(s => {
    const isTopLevel = topLevelSet.has(s.id);
    const newId = idMap.get(s.id)!;
    const parentId = isTopLevel
      ? currentLayerId
      : (idMap.get(s.parentId || '') || s.parentId);

    return {
      ...s,
      id: newId,
      parentId: parentId,
      name: `${s.name}_copy`,
      x: isTopLevel ? s.x + 20 : s.x,
      y: isTopLevel ? s.y + 20 : s.y,
    };
  });

  const topLevelJunctionSet = new Set(clipboard.topLevelJunctionIds);
  const newJunctions: JunctionData[] = clipboard.junctions.map(j => {
    const isTopLevel = topLevelJunctionSet.has(j.id);
    const newId = idMap.get(j.id)!;
    const parentId = isTopLevel
      ? currentLayerId
      : (idMap.get(j.parentId || '') || j.parentId);

    return {
      ...j,
      id: newId,
      parentId: parentId,
      name: `${j.name}_copy`,
      x: isTopLevel ? j.x + 20 : j.x,
      y: isTopLevel ? j.y + 20 : j.y,
    };
  });

  const pastedNodeIds = new Set([
    ...newStates.map(s => s.id),
    ...newJunctions.map(j => j.id),
  ]);

  const newTransitions: TransitionData[] = clipboard.transitions.map(t => {
    const newId = uuidv4();
    const newSourceId = idMap.get(t.sourceId) || t.sourceId;
    const newTargetId = idMap.get(t.targetId) || t.targetId;
    idMap.set(t.id, newId);

    return {
      ...t,
      id: newId,
      sourceId: newSourceId,
      targetId: newTargetId,
    };
  }).filter(t =>
    (pastedNodeIds.has(t.sourceId) || existingStates.some(s => s.id === t.sourceId) || existingJunctions.some(j => j.id === t.sourceId)) &&
    (pastedNodeIds.has(t.targetId) || existingStates.some(s => s.id === t.targetId) || existingJunctions.some(j => j.id === t.targetId))
  );

  const createdTransitionIdSet = new Set(newTransitions.map(t => t.id));

  // Cloned child layers
  const clonedLayers: Layer[] = clipboard.layers.map(l => {
    const newLayerId = idMap.get(l.id)!;
    const newParentStateId = idMap.get(l.parentStateId || '') || l.parentStateId;

    return {
      ...l,
      id: newLayerId,
      parentStateId: newParentStateId,
      stateIds: l.stateIds.map(sid => idMap.get(sid) || sid).filter(Boolean),
      junctionIds: l.junctionIds.map(jid => idMap.get(jid) || jid).filter(Boolean),
      transitionIds: l.transitionIds.map(tid => idMap.get(tid) || tid).filter(tid => createdTransitionIdSet.has(tid)),
    };
  });

  // BDD/IBD items
  const newBlocks = (clipboard.blocks || []).map(b => {
    const newId = idMap.get(b.id)!;
    const updatedBlock = { ...b, id: newId, x: b.x + 20, y: b.y + 20, name: `${b.name}_copy` };
    if (b.stereotype === 'requirement') updatedBlock.layerId = currentLayerId;
    return updatedBlock;
  });

  const newRelationships = (clipboard.relationships || []).map(r => ({
    ...r,
    id: uuidv4(),
    sourceId: idMap.get(r.sourceId) || r.sourceId,
    targetId: idMap.get(r.targetId) || r.targetId,
  })).filter(r => (idMap.has(r.sourceId) || existingBlocks.some(b => b.id === r.sourceId)) && (idMap.has(r.targetId) || existingBlocks.some(b => b.id === r.targetId)));

  const newParts = (clipboard.parts || []).map(p => {
    const newId = idMap.get(p.id)!;
    return { ...p, id: newId, x: p.x + 20, y: p.y + 20, name: `${p.name}_copy` };
  });

  const newConnectors = (clipboard.connectors || []).map(c => ({
    ...c,
    id: uuidv4(),
    sourcePartId: idMap.get(c.sourcePartId) || c.sourcePartId,
    targetPartId: idMap.get(c.targetPartId) || c.targetPartId,
  })).filter(c => (idMap.has(c.sourcePartId) || existingParts.some(p => p.id === c.sourcePartId)) && (idMap.has(c.targetPartId) || existingParts.some(p => p.id === c.targetPartId)));

  const newInterfaceRealizations = (clipboard.interfaceRealizations || []).map(ir => ({
    ...ir,
    id: uuidv4(),
    partId: idMap.get(ir.partId) || ir.partId,
    interfaceId: idMap.get(ir.interfaceId) || ir.interfaceId,
  })).filter(ir => (idMap.has(ir.partId) || existingParts.some(p => p.id === ir.partId)) && (idMap.has(ir.interfaceId) || existingBlocks.some(b => b.id === ir.interfaceId)));

  // Register top-level items in current active layer
  const topLevelPastedStateIds = clipboard.topLevelStateIds.map(id => idMap.get(id)!).filter(Boolean);
  const topLevelPastedJunctionIds = clipboard.topLevelJunctionIds.map(id => idMap.get(id)!).filter(Boolean);
  const topLevelPastedTransitionIds = clipboard.topLevelTransitionIds
    .map(id => idMap.get(id)!)
    .filter(id => id && createdTransitionIdSet.has(id));

  const updatedLayers = existingLayers.map(l => l.id === currentLayerId ? {
    ...l,
    stateIds: [...l.stateIds, ...topLevelPastedStateIds],
    junctionIds: [...l.junctionIds, ...topLevelPastedJunctionIds],
    transitionIds: [...l.transitionIds, ...topLevelPastedTransitionIds],
  } : l);

  // Combine existing layers with newly cloned sub-layers
  const finalLayers = [...updatedLayers, ...clonedLayers];

  const pastedTopLevelIds = [
    ...topLevelPastedStateIds,
    ...topLevelPastedJunctionIds,
    ...topLevelPastedTransitionIds,
    ...newBlocks.map(b => b.id),
    ...newRelationships.map(r => r.id),
    ...newParts.map(p => p.id),
    ...newConnectors.map(c => c.id),
    ...newInterfaceRealizations.map(ir => ir.id),
  ];

  return {
    newStates,
    newJunctions,
    newTransitions,
    updatedLayers: finalLayers,
    newBlocks,
    newRelationships,
    newParts,
    newConnectors,
    newInterfaceRealizations,
    pastedTopLevelIds,
  };
}
