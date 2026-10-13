import { describe, expect, it } from 'vitest';
import { createSysmlGatewayState, executeSysmlCommand, type SysmlGatewayState } from './sysmlCommandGateway';
import { buildDiagramCreationCommand, type DiagramCreationInput } from './sysmlDiagramCreation';

export function executeCreateOnDiagram(
  state: SysmlGatewayState,
  input: Omit<DiagramCreationInput, 'repository'>,
): SysmlGatewayState {
  const outcome = buildDiagramCreationCommand({
    ...input,
    repository: state.repository,
  });
  if (!outcome.ok) {
    throw new Error(`Failed to build diagram creation command: ${outcome.diagnostic.message}`);
  }
  const result = executeSysmlCommand(state, outcome.command, input.diagramId);
  if (!result.committed) {
    throw new Error(`Command failed to commit: ${result.diagnostics.map(d => d.message).join(', ')}`);
  }
  return {
    repository: result.repository,
    history: result.history,
    store: result.store,
    patchHistory: result.patchHistory,
    coordinates: result.coordinates,
    diagramPresentations: result.diagramPresentations,
    presentationHistory: result.presentationHistory,
    actionStack: result.actionStack,
    redoStack: result.redoStack,
  };
}

describe('sysmlAppProjection', () => {
  it('creates a Block on Requirements and reuses its identity on BDD', () => {
    const initialState = createSysmlGatewayState();
    const first = executeCreateOnDiagram(initialState, {
      kind: 'Block',
      diagramId: 'requirements',
      ownerId: 'model',
      position: { x: 10, y: 20 },
    });
    const blockId = Object.keys(first.repository.definitions)[0];
    const second = executeSysmlCommand(first, { type: 'addToDiagram', diagramId: 'bdd', elementIds: [blockId] });
    expect(Object.keys(second.repository.definitions)).toHaveLength(1);
    expect(second.diagramPresentations.requirements.elementIds).toEqual([blockId]);
    expect(second.diagramPresentations.bdd.elementIds).toEqual([blockId]);
  });
});
