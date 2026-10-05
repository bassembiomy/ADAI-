import type { InteractionDefinition, SysmlRepository } from './model';
import { messageLabel, orderedMessages } from './interaction';

/** The part of a state machine transition this check reads. */
export interface TriggerTransition {
  sourceId: string;
  condition: string;
}

export interface SignalTriggerCoverage {
  messageId: string;
  lifelineId: string;
  /** The state the lifeline is in when the signal arrives (from its state invariant). */
  stateId: string;
  invariantId: string;
  /** Text matched against the transitions' conditions. */
  signalName: string;
  /** Whether a transition leaving that state names the signal. */
  covered: boolean;
}

const tokens = (text: string): Set<string> => new Set(text.toLowerCase().split(/[^a-z0-9_]+/).filter(Boolean));

/** The name a signal message is matched by: the Signal it references, else the message's own name. */
function signalNameOf(repo: SysmlRepository, interaction: InteractionDefinition, messageId: string): string {
  const message = interaction.messages.find(candidate => candidate.id === messageId);
  if (!message) return '';
  const signal = message.signatureId ? repo.definitions[message.signatureId] : undefined;
  return signal?.name?.trim() || messageLabel(message);
}

/**
 * For every signal message a lifeline with state invariants receives, whether the
 * state it is in has an outgoing transition whose condition names that signal.
 * The state machine lives outside the repository and its transitions have no
 * signal field, so this reads the condition text (whole-word, case-insensitive)
 * and is only ever shown as information, never as a diagnostic.
 */
export function signalTriggerCoverage(
  repo: SysmlRepository,
  interaction: InteractionDefinition,
  transitions: readonly TriggerTransition[],
): SignalTriggerCoverage[] {
  const invariants = interaction.stateInvariants ?? [];
  if (invariants.length === 0) return [];
  const sequence = orderedMessages(interaction);
  const position = new Map(sequence.map((message, index) => [message.id, index]));
  const result: SignalTriggerCoverage[] = [];
  for (const message of sequence) {
    if (message.sort !== 'asynchSignal') continue;
    const at = position.get(message.id)!;
    // The latest invariant on the receiving lifeline that is before this message
    // (an invariant without an anchor sits before the first message).
    let active: (typeof invariants)[number] | undefined;
    let activeAt = -2;
    for (const invariant of invariants) {
      if (invariant.lifelineId !== message.targetLifelineId) continue;
      const anchor = invariant.afterMessageId === undefined ? -1 : position.get(invariant.afterMessageId) ?? -1;
      if (anchor < at && anchor >= activeAt) { active = invariant; activeAt = anchor; }
    }
    if (!active) continue;
    const signalName = signalNameOf(repo, interaction, message.id);
    const wanted = tokens(signalName);
    const covered = wanted.size > 0 && transitions.some(transition => {
      if (transition.sourceId !== active!.stateId) return false;
      const present = tokens(transition.condition ?? '');
      return [...wanted].every(token => present.has(token));
    });
    result.push({ messageId: message.id, lifelineId: message.targetLifelineId, stateId: active.stateId, invariantId: active.id, signalName, covered });
  }
  return result;
}
