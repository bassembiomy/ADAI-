/**
 * Drag-copy of State Machine states and junctions (right-drag or Ctrl + left-drag), built on the clipboard functions:
 * composite states keep their child states, layers and internal transitions; transitions between two copied nodes are
 * copied; the copies get unique names within the target layer (Name -> Name1) and the top-left of the copied group
 * lands at the drop point. The input model is never modified.
 */
import type { JunctionData, Layer, StateData, TransitionData } from '../types/sm_types';
import { createStateMachineClipboard, pasteStateMachineClipboard } from './stateMachineClipboard';
import { uniqueBlockLabel } from '../components/common/canvasCopy/blockCopy';

export interface StateMachineCopyModel {
  states: StateData[];
  junctions: JunctionData[];
  transitions: TransitionData[];
  layers: Layer[];
}

export interface DragCopyStatesResult extends StateMachineCopyModel {
  newTopLevelStateIds: string[];
  newTopLevelJunctionIds: string[];
}

/** A state inside a selected composite state is copied with it, not once more on its own. */
function withoutSelectedAncestors(model: StateMachineCopyModel, ids: string[]): string[] {
  const selected = new Set(ids);
  const ownerLayer = (id: string) => model.layers.find((l) => l.stateIds.includes(id) || l.junctionIds.includes(id));
  const hasSelectedAncestor = (id: string): boolean => {
    const seen = new Set<string>();
    let layer = ownerLayer(id);
    while (layer && layer.parentStateId && !seen.has(layer.id)) {
      if (selected.has(layer.parentStateId)) return true;
      seen.add(layer.id);
      layer = ownerLayer(layer.parentStateId);
    }
    return false;
  };
  return ids.filter((id) => !hasSelectedAncestor(id));
}

export function dragCopyStates(
  model: StateMachineCopyModel,
  sourceIds: string[],
  options: { layerId: string; drop: { x: number; y: number } },
): DragCopyStatesResult {
  const { states, junctions, transitions, layers } = model;
  sourceIds = withoutSelectedAncestors(model, sourceIds);
  const clipboard = createStateMachineClipboard(sourceIds, states, junctions, transitions, layers);
  const pasted = pasteStateMachineClipboard(clipboard, options.layerId, states, junctions, transitions, layers);

  const topStateSet = new Set(clipboard.topLevelStateIds);
  const topJunctionSet = new Set(clipboard.topLevelJunctionIds);
  const topSources = [
    ...clipboard.states.filter((s) => topStateSet.has(s.id)),
    ...clipboard.junctions.filter((j) => topJunctionSet.has(j.id)),
  ];
  const minX = topSources.length ? Math.min(...topSources.map((n) => n.x)) : 0;
  const minY = topSources.length ? Math.min(...topSources.map((n) => n.y)) : 0;
  const dx = options.drop.x - minX;
  const dy = options.drop.y - minY;

  const layer = layers.find((l) => l.id === options.layerId);
  const taken = new Set<string>([
    ...states.filter((s) => layer?.stateIds.includes(s.id)).map((s) => s.name),
    ...junctions.filter((j) => layer?.junctionIds.includes(j.id)).map((j) => j.name),
  ].filter(Boolean) as string[]);

  // pasteStateMachineClipboard keeps the order of the clipboard, so index i of the copies is index i of the originals.
  const newStates = pasted.newStates.map((copy, i) => {
    const source = clipboard.states[i];
    if (!topStateSet.has(source.id)) return { ...copy, name: source.name };
    const name = uniqueBlockLabel(source.name, taken);
    taken.add(name);
    return { ...copy, name, x: source.x + dx, y: source.y + dy };
  });
  const newJunctions = pasted.newJunctions.map((copy, i) => {
    const source = clipboard.junctions[i];
    if (!topJunctionSet.has(source.id)) return { ...copy, name: source.name };
    const name = source.name ? uniqueBlockLabel(source.name, taken) : source.name;
    if (name) taken.add(name);
    return { ...copy, name, x: source.x + dx, y: source.y + dy };
  });

  const newTopLevelStateIds = clipboard.topLevelStateIds.map((id) => newStates[clipboard.states.findIndex((s) => s.id === id)]?.id).filter(Boolean) as string[];
  const newTopLevelJunctionIds = clipboard.topLevelJunctionIds.map((id) => newJunctions[clipboard.junctions.findIndex((j) => j.id === id)]?.id).filter(Boolean) as string[];

  return {
    states: [...states, ...newStates],
    junctions: [...junctions, ...newJunctions],
    transitions: [...transitions, ...pasted.newTransitions],
    layers: pasted.updatedLayers,
    newTopLevelStateIds,
    newTopLevelJunctionIds,
  };
}
