import type { SysmlRepository } from '../../engine/sysml/model';
import type { DiagramPresentationInput } from '../../engine/sysml/presentationState';
import type { ModelTreeNode } from './modelExplorerTypes';
import type { StateMachineExplorerSnapshot } from './adapters/stateMachineExplorerAdapter';

/**
 * A diagram is a view over the model. It can group what it presents in the
 * tree, but it never becomes the semantic owner of those elements, so every
 * helper here keeps "where is this shown" strictly separate from "who owns
 * this".
 */
export interface DiagramTreeContextInput {
  sysml: SysmlRepository;
  stateMachine: StateMachineExplorerSnapshot;
  diagramPresentations: Record<string, DiagramPresentationInput>;
}

export const sysmlElementNodeId = (semanticId: string): string => `sysml:element:${semanticId}`;
export const sysmlDiagramNodeId = sysmlElementNodeId;
export const stateMachineDiagramNodeId = (diagramId: string): string => `sm:diagram:${diagramId}`;

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
    || repository.useCases?.[semanticId],
  );
}

/** Returns an exact, unambiguous diagram ID for a canvas symbol, if one exists. */
export function resolveCanvasSymbolDiagramTarget(
  semanticId: string,
  repository: SysmlRepository,
  stateMachine?: StateMachineExplorerSnapshot,
): string | null {
  const isSysmlSymbol = semanticId === 'model' || sysmlHasSemanticId(repository, semanticId);
  const isState = stateMachine?.states.some(state => state.id === semanticId) ?? false;
  if (!isSysmlSymbol && !isState) return null;

  const explicitReferences = isSysmlSymbol
    ? Object.values(repository.diagramReferences ?? {}).filter(reference => reference.sourceElementId === semanticId)
    : [];
  if (explicitReferences.length > 0) {
    const ids = new Set(explicitReferences.map(reference => reference.diagramId));
    const [onlyId] = ids;
    return ids.size === 1 && repository.diagrams[onlyId] ? onlyId : null;
  }

  const owned = isSysmlSymbol
    ? Object.values(repository.diagrams).filter(diagram => diagram.ownerId === semanticId).map(diagram => diagram.id)
    : [];
  if (isState && stateMachine) {
    const regions = new Set(stateMachine.layers.filter(layer => layer.parentStateId === semanticId).map(layer => layer.id));
    owned.push(...(stateMachine.diagrams ?? [])
      .filter(diagram => diagram.ownerId === semanticId || regions.has(diagram.contextRegionId))
      .map(diagram => diagram.id));
  }
  const ids = new Set(owned);
  return ids.size === 1 ? [...ids][0] : null;
}

/**
 * Builds `semanticId -> diagram tree node` for every element a diagram
 * presents. Later entries win deterministically because the tree shows one
 * primary location per semantic element.
 */
export function buildDiagramVisualParentIndex(input: DiagramTreeContextInput): Map<string, string> {
  const result = new Map<string, string>();

  for (const [diagramId, presentation] of Object.entries(input.diagramPresentations ?? {})) {
    if (!input.sysml.diagrams[diagramId]) continue;
    for (const semanticId of presentation.elementIds ?? []) {
      if (!semanticId || !sysmlHasSemanticId(input.sysml, semanticId)) continue;
      result.set(semanticId, sysmlElementNodeId(diagramId));
    }
  }

  for (const diagram of input.stateMachine.diagrams ?? []) {
    const layer = input.stateMachine.layers.find(candidate => candidate.id === diagram.contextRegionId);
    for (const stateId of layer?.stateIds ?? []) result.set(stateId, stateMachineDiagramNodeId(diagram.id));
    for (const junctionId of layer?.junctionIds ?? []) result.set(junctionId, stateMachineDiagramNodeId(diagram.id));
  }

  return result;
}
