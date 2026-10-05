import type { InteractionDefinition, SysmlRepository } from '../model';
import { CALL_SORTS, blockOperations, lifelineBlock, listInteractions, operationName } from '../interaction';

export interface InteractionUsage {
  interactionId: string;
  /** The Sequence Diagrams that show this Interaction. */
  diagramIds: string[];
  /** The lifelines and messages of the interaction that refer to the element. */
  elementIds: string[];
}

function diagramsOf(repo: SysmlRepository, interaction: InteractionDefinition): string[] {
  return Object.values(repo.diagrams)
    .filter(diagram => diagram.diagramKind === 'sequence' && (diagram.contextElementId ?? diagram.ownerId) === interaction.id)
    .map(diagram => diagram.id)
    .sort();
}

function collect(repo: SysmlRepository, pick: (interaction: InteractionDefinition) => string[]): InteractionUsage[] {
  return listInteractions(repo)
    .map(interaction => ({ interaction, elementIds: pick(interaction) }))
    .filter(entry => entry.elementIds.length > 0)
    .map(({ interaction, elementIds }) => ({ interactionId: interaction.id, diagramIds: diagramsOf(repo, interaction), elementIds }))
    .sort((a, b) => a.interactionId.localeCompare(b.interactionId));
}

/**
 * Where a Block, part, Actor, Signal or connector is shown in Sequence Diagrams:
 * - a Block or Actor: the lifelines that represent it (or a part typed by it);
 * - a part: the lifelines that represent it;
 * - a Signal: the signal messages that send it;
 * - a connector: the messages that travel over it.
 */
export function whereUsedInInteractions(repo: SysmlRepository, elementId: string): InteractionUsage[] {
  return collect(repo, interaction => [
    ...interaction.lifelines
      .filter(lifeline => lifeline.representsId === elementId || lifelineBlock(repo, lifeline)?.id === elementId)
      .map(lifeline => lifeline.id),
    ...interaction.messages
      .filter(message => message.signatureId === elementId || message.connectorId === elementId)
      .map(message => message.id),
  ]);
}

/**
 * Where an operation of a Block is called: the call messages that name it and are received
 * by a lifeline of that Block. Operations are text lines without ids, so they are matched by name.
 */
export function whereOperationUsedInInteractions(repo: SysmlRepository, blockId: string, operation: string): InteractionUsage[] {
  const wanted = operationName(operation);
  return collect(repo, interaction => interaction.messages
    .filter(message => {
      if (!CALL_SORTS.has(message.sort) || !message.signatureId || operationName(message.signatureId) !== wanted) return false;
      const target = interaction.lifelines.find(lifeline => lifeline.id === message.targetLifelineId);
      const block = target ? lifelineBlock(repo, target) : undefined;
      return block?.id === blockId && blockOperations(repo, block).some(candidate => operationName(candidate) === wanted);
    })
    .map(message => message.id));
}
