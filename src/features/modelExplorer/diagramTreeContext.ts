import type { SysmlRepository } from '../../engine/sysml/model';
import { resolvePartLike } from '../../engine/sysml/partOccurrences';
import type { ModelTreeNode } from './modelExplorerTypes';
import type { StateMachineExplorerSnapshot } from './adapters/stateMachineExplorerAdapter';

/**
 * A diagram is a view over the model, never the semantic owner of what it
 * presents (SysML 1.6 / UML 2.5 §A.1: diagrams are not model elements), so the
 * containment tree lists every element under its owner and a diagram as a leaf
 * under its own owner.
 */

/**
 * Resolves the element that may legally own a new child created from a diagram
 * row. The diagram's own ID is never a semantic owner: SysML diagrams delegate
 * to their `ownerId`, state-machine diagrams delegate to the region they render.
 */
export function resolveDiagramSemanticOwner(
  node: ModelTreeNode,
  sysml: SysmlRepository,
  stateMachine: StateMachineExplorerSnapshot,
): string {
  if (node.domain === 'stateMachine') {
    return stateMachine.diagrams?.find(diagram => diagram.id === node.semanticId)?.contextRegionId ?? 'root';
  }
  return sysml.diagrams[node.semanticId]?.ownerId ?? node.ownerSemanticId ?? 'model';
}

/**
 * A presentation may outlive the semantic element it referenced (deleted
 * element, stale payload). Such IDs are dropped instead of materialising a
 * phantom tree node.
 */
function sysmlHasSemanticId(repository: SysmlRepository, semanticId: string): boolean {
  return Boolean(
    (semanticId !== 'model' && repository.packages[semanticId])
    || repository.definitions[semanticId]
    || repository.usages[semanticId]
    || repository.requirements[semanticId]
    || repository.verificationCases[semanticId]
    || repository.useCases?.[semanticId]
    || repository.actors?.[semanticId]
    || repository.subjects?.[semanticId]
    // Format 5: a part presented on an IBD is a Block property, addressed by id or property path.
    || resolvePartLike(repository, semanticId),
  );
}

/** Returns an exact, unambiguous diagram ID for a canvas symbol, if one exists. */
export function resolveCanvasSymbolDiagramTarget(
  semanticId: string,
  repository: SysmlRepository,
  stateMachine?: StateMachineExplorerSnapshot,
): string | null {
  const ids = resolveCanvasSymbolDiagramTargets(semanticId, repository, stateMachine);
  return ids.length === 1 && (repository.diagrams[ids[0]] || !sysmlHasSemanticId(repository, semanticId)) ? ids[0] : null;
}

/**
 * Every diagram a canvas symbol can navigate to: its explicit diagram
 * references when it has any, otherwise the diagrams it owns. Several
 * results mean the caller should let the user choose (Cameo behaviour).
 */
export function resolveCanvasSymbolDiagramTargets(
  semanticId: string,
  repository: SysmlRepository,
  stateMachine?: StateMachineExplorerSnapshot,
): string[] {
  const isSysmlSymbol = semanticId === 'model' || sysmlHasSemanticId(repository, semanticId);
  const isState = stateMachine?.states.some(state => state.id === semanticId) ?? false;
  if (!isSysmlSymbol && !isState) return [];

  const explicitReferences = isSysmlSymbol
    ? Object.values(repository.diagramReferences ?? {}).filter(reference => reference.sourceElementId === semanticId)
    : [];
  if (explicitReferences.length > 0) {
    // Stale references stay in the result so a stale/valid conflict is not
    // silently resolved; callers navigate only when every target exists.
    return [...new Set(explicitReferences.map(reference => reference.diagramId))];
  }

  const owned = isSysmlSymbol
    ? Object.values(repository.diagrams).filter(diagram => diagram.ownerId === semanticId).map(diagram => diagram.id)
    : [];
  // A Use Case is elaborated by the scenarios (Interactions/Activities) it owns,
  // so their diagrams are the use case's diagrams too.
  if (isSysmlSymbol && repository.useCases?.[semanticId]) {
    const scenarioIds = new Set(Object.values(repository.definitions)
      .filter(definition => (definition.kind === 'interaction' || definition.kind === 'activity') && definition.ownerId === semanticId)
      .map(definition => definition.id));
    if (scenarioIds.size > 0) {
      owned.push(...Object.values(repository.diagrams)
        .filter(diagram => scenarioIds.has(diagram.contextElementId ?? '') || scenarioIds.has(diagram.ownerId ?? ''))
        .map(diagram => diagram.id));
    }
  }
  if (isState && stateMachine) {
    const regions = new Set(stateMachine.layers.filter(layer => layer.parentStateId === semanticId).map(layer => layer.id));
    owned.push(...(stateMachine.diagrams ?? [])
      .filter(diagram => diagram.ownerId === semanticId || regions.has(diagram.contextRegionId))
      .map(diagram => diagram.id));
  }
  return [...new Set(owned)];
}

export interface ExactDiagramCanvasContext {
  layerId: string;
  layerStack: string[];
  layerPath: string[];
}

/** Resolves the canvas and breadcrumb state of an exact diagram before it opens. */
export function resolveExactDiagramCanvasContext(
  diagramId: string,
  repository: SysmlRepository,
  stateMachine?: StateMachineExplorerSnapshot,
): ExactDiagramCanvasContext | null {
  const stateMachineDiagram = stateMachine?.diagrams?.find(diagram => diagram.id === diagramId);
  if (stateMachineDiagram && stateMachine) {
    const contextRegionId = stateMachineDiagram.contextRegionId;
    const layerStack: string[] = [];
    const names: string[] = [];
    const visited = new Set<string>();
    let regionId = contextRegionId;
    while (regionId !== 'root') {
      if (visited.has(regionId)) return null;
      visited.add(regionId);
      const layer = stateMachine.layers.find(candidate => candidate.id === regionId);
      const state = stateMachine.states.find(candidate => candidate.id === layer?.parentStateId);
      if (!layer || !state) return null;
      const parentRegionId = state.parentId ?? 'root';
      if (!stateMachine.layers.some(candidate => candidate.id === parentRegionId)) return null;
      layerStack.unshift(parentRegionId);
      names.unshift(state.name);
      regionId = parentRegionId;
    }
    if (!stateMachine.layers.some(layer => layer.id === contextRegionId)) return null;
    return { layerId: contextRegionId, layerStack, layerPath: ['Root', ...names] };
  }

  const diagram = repository.diagrams[diagramId];
  if (!diagram) return null;
  if (diagram.diagramKind !== 'ibd') return { layerId: 'root', layerStack: [], layerPath: ['Root'] };
  const contextId = diagram.contextElementId ?? diagram.ownerId;
  const block = contextId ? repository.definitions[contextId] : undefined;
  return block?.kind === 'block'
    ? { layerId: block.id, layerStack: ['root'], layerPath: ['Root', block.name] }
    : null;
}
