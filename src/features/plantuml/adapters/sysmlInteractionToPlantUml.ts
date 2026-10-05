import type { CombinedFragment, InteractionDefinition, InteractionMessage, SysmlRepository } from '../../../engine/sysml/model';
import { FOUND_ENDPOINT, LOST_ENDPOINT, lifelineBlock, messageLabel, orderedMessages } from '../../../engine/sysml/interaction';
import { resolveSemanticEndpoint, type SemanticEndpointContext } from '../../../engine/sysml/semanticEndpointIndex';
import { sysmlObjectLabel } from '../../sysml/sysmlDisplayLabel';

const alias = (id: string) => `L_${id.replace(/[^a-zA-Z0-9_]/g, '_')}`;
const plain = (text: string) => text.replace(/\r?\n/g, ' ').trim();

function lifelineTitle(repo: SysmlRepository, interaction: InteractionDefinition, lifelineId: string): string {
  const lifeline = interaction.lifelines.find(candidate => candidate.id === lifelineId);
  if (!lifeline) return 'Lifeline';
  const represents = lifeline.representsId;
  const actor = represents ? repo.actors?.[represents] : undefined;
  if (actor) return lifeline.name?.trim() || sysmlObjectLabel(actor, 'Actor');
  const block = lifelineBlock(repo, lifeline);
  const name = lifeline.name?.trim();
  if (name && block) return `${name} : ${sysmlObjectLabel(block, 'Block')}`;
  return name || (block ? sysmlObjectLabel(block, 'Block') : 'Lifeline');
}

function messageText(repo: SysmlRepository, message: InteractionMessage): string {
  let label = messageLabel(message);
  if (message.sort === 'asynchSignal' && !message.name?.trim() && message.signatureId) label = sysmlObjectLabel(repo.definitions[message.signatureId], 'Signal');
  if (message.sort === 'createMessage' && !message.name?.trim()) label = '<<create>>';
  if (message.sort === 'deleteMessage' && !message.name?.trim()) label = '<<destroy>>';
  const args = message.arguments?.trim();
  if (args && message.sort !== 'reply' && message.sort !== 'createMessage' && message.sort !== 'deleteMessage') label = `${label}(${args})`;
  return plain(label);
}

const ARROWS: Record<InteractionMessage['sort'], string> = {
  synchCall: '->', asynchCall: '->>', asynchSignal: '->>', reply: '-->', createMessage: '->', deleteMessage: '->',
};

/** PlantUML keyword for a combined fragment operator (`seq` and `strict` have no keyword of their own). */
function groupKeyword(operator: CombinedFragment['operator']): string {
  return operator === 'seq' || operator === 'strict' || operator === 'neg' ? 'group' : operator;
}

/**
 * Exports an Interaction as PlantUML sequence text. Pure and one-way (importing PlantUML would
 * lose the model links). Participants are actors for Actor lifelines, messages keep their order and
 * arrow style, combined fragments become groups with their guards, ref frames become `ref over`
 * and state invariants become `hnote`. A fragment is assumed to span consecutive messages.
 */
export function interactionToPlantUml(repo: SysmlRepository, interactionId: string, endpoints?: SemanticEndpointContext): string {
  const interaction = repo.definitions[interactionId];
  if (interaction?.kind !== 'interaction') return '@startuml\n@enduml';
  const lines: string[] = ['@startuml', `title ${plain(sysmlObjectLabel(interaction, 'Interaction'))}`];
  const sequence = orderedMessages(interaction);
  const position = new Map(sequence.map((message, index) => [message.id, index]));
  const created = new Set(sequence.filter(message => message.sort === 'createMessage').map(message => message.targetLifelineId));

  for (const lifeline of interaction.lifelines) {
    const isActor = Boolean(lifeline.representsId && repo.actors?.[lifeline.representsId]);
    lines.push(`${isActor ? 'actor' : 'participant'} "${plain(lifelineTitle(repo, interaction, lifeline.id)).replace(/"/g, "'")}" as ${alias(lifeline.id)}${created.has(lifeline.id) ? ' #lightgrey' : ''}`);
  }

  // Fragment spans over the message positions of their operands.
  interface Span { fragment: CombinedFragment; start: number; end: number; firstOfOperand: Map<number, number> }
  const spans: Span[] = (interaction.fragments ?? []).flatMap(fragment => {
    const firstOfOperand = new Map<number, number>();
    let start = Infinity;
    let end = -1;
    fragment.operands.forEach((operand, index) => {
      const positions = operand.messageIds.map(id => position.get(id)).filter((value): value is number => value !== undefined);
      if (positions.length === 0) return;
      firstOfOperand.set(index, Math.min(...positions));
      start = Math.min(start, ...positions);
      end = Math.max(end, ...positions);
    });
    return end < 0 ? [] : [{ fragment, start, end, firstOfOperand }];
  }).sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));

  const guard = (operand: CombinedFragment['operands'][number] | undefined) => (operand?.guard?.trim() ? ` [${plain(operand.guard)}]` : '');
  const extrasAfter = (messageId: string | undefined) => {
    for (const use of interaction.uses ?? []) {
      if ((use.afterMessageId && position.has(use.afterMessageId) ? use.afterMessageId : undefined) !== messageId) continue;
      const covered = use.coveredLifelineIds.filter(id => interaction.lifelines.some(lifeline => lifeline.id === id));
      const name = sysmlObjectLabel(repo.definitions[use.refersToId], 'Interaction');
      const args = use.arguments?.trim();
      lines.push(`ref over ${(covered.length > 0 ? covered : interaction.lifelines.map(lifeline => lifeline.id)).map(alias).join(', ')} : ${plain(args ? `${name}(${args})` : name)}`);
    }
    for (const invariant of interaction.stateInvariants ?? []) {
      if ((invariant.afterMessageId && position.has(invariant.afterMessageId) ? invariant.afterMessageId : undefined) !== messageId) continue;
      if (!interaction.lifelines.some(lifeline => lifeline.id === invariant.lifelineId)) continue;
      lines.push(`hnote over ${alias(invariant.lifelineId)} : ${plain(resolveSemanticEndpoint(repo, invariant.stateId, endpoints ?? {})?.name?.trim() || 'unknown state')}`);
    }
  };

  extrasAfter(undefined);
  const open: Span[] = [];
  sequence.forEach((message, index) => {
    for (const span of spans) {
      if (span.start === index) {
        lines.push(`${groupKeyword(span.fragment.operator)}${span.fragment.operator === 'seq' || span.fragment.operator === 'strict' || span.fragment.operator === 'neg' ? ` ${span.fragment.operator}` : ''}${guard(span.fragment.operands[0])}`);
        open.push(span);
      }
    }
    for (const span of open) {
      for (const [operandIndex, first] of span.firstOfOperand) {
        if (operandIndex > 0 && first === index) lines.push(`else${guard(span.fragment.operands[operandIndex])}`);
      }
    }
    if (message.sort === 'createMessage') lines.push(`create ${alias(message.targetLifelineId)}`);
    // A lost message ends at the diagram border (`->]`), a found one starts from it (`[->`).
    const from = message.sourceLifelineId === FOUND_ENDPOINT ? '[' : alias(message.sourceLifelineId);
    const to = message.targetLifelineId === LOST_ENDPOINT ? ']' : alias(message.targetLifelineId);
    lines.push(`${from} ${ARROWS[message.sort]} ${to} : ${messageText(repo, message)}`.replace('[ ->', '[->').replace('-> ]', '->]').replace('->> ]', '->>]'));
    if (message.sort === 'deleteMessage') lines.push(`destroy ${alias(message.targetLifelineId)}`);
    for (let i = open.length - 1; i >= 0; i -= 1) {
      if (open[i].end === index) { lines.push('end'); open.splice(i, 1); }
    }
    extrasAfter(message.id);
  });
  for (let i = open.length - 1; i >= 0; i -= 1) lines.push('end');
  lines.push('@enduml');
  return lines.join('\n');
}
