import React, { useMemo, useState } from 'react';
import type { CombinedFragmentOperator, InteractionMessageSort, SysmlRepository } from '../../engine/sysml/model';
import { FRAGMENT_OPERATORS, MESSAGE_SORTS, MESSAGE_SORT_LABELS, findInteractionElement, orderedMessages } from '../../engine/sysml/interaction';
import type { SysmlCommandResult, SysmlEditorCommand } from '../../services/sysmlCommandGateway';
import {
  LIFELINE_CANDIDATE_GROUP_LABELS,
  buildRemoveFragmentCommand,
  buildRemoveInteractionConstraintCommand,
  buildUpdateInteractionConstraintCommand,
  buildRemoveInteractionMessageCommand,
  buildRemoveInteractionUseCommand,
  buildRemoveLifelineCommand,
  buildRemoveStateInvariantCommand,
  buildRenameInteractionElementCommand,
  buildSetFragmentOperatorCommand,
  buildSetLifelineRepresentsCommand,
  buildSetOperandGuardCommand,
  buildUpdateInteractionMessageCommand,
  buildUpdateInteractionUseCommand,
  listLifelineCandidates,
  listMessageConnectors,
  listReferableInteractions,
  listSignalCandidates,
  type InteractionCommandPlan,
  type LifelineCandidateGroup,
} from '../../services/sysmlInteractionCommands';
import { messageSentence } from '../../features/sysml/sequenceDiagramView';
import { sysmlObjectLabel } from '../../features/sysml/sysmlDisplayLabel';

export interface InteractionElementInspectorProps {
  repository: SysmlRepository;
  /** A lifeline, message, fragment, ref frame or state invariant. */
  elementId: string;
  /** Runs one gateway command: every edit is one undo step. */
  onExecute: (command: SysmlEditorCommand) => SysmlCommandResult;
}

const fieldClass = 'w-full h-8 bg-[#0a0a0a] border border-[#333] rounded px-2 text-sm text-[#e0e0e0] mt-1';
const labelClass = 'block text-[11px] uppercase tracking-wide text-[#888]';

/**
 * Right-panel editor for content nested in an Interaction. Nested content has ids but is not
 * a repository entity, so it is resolved with `findInteractionElement` and edited with the
 * interaction command builders.
 */
export function InteractionElementInspector({ repository, elementId, onExecute }: InteractionElementInspectorProps) {
  const found = useMemo(() => findInteractionElement(repository, elementId), [repository, elementId]);
  const [message, setMessage] = useState('');
  const [draft, setDraft] = useState<{ key: string; value: string } | null>(null);
  if (!found) return null;
  const interaction = found.interaction;
  const interactionId = interaction.id;

  const run = (plan: InteractionCommandPlan, failure: string): boolean => {
    if (!plan.ok) { setMessage(plan.diagnostics.map(d => d.message).join(' ') || failure); return false; }
    const result = onExecute(plan.command);
    if (!result.committed) { setMessage(result.diagnostics.filter(d => d.severity === 'error').map(d => d.message).join(' ') || failure); return false; }
    setMessage('');
    return true;
  };
  const text = (fieldKey: string, stored: string, commit: (value: string) => void, label: string) => {
    // Drafts are keyed by element as well as field, so a draft never follows the selection to another element.
    const key = `${elementId}:${fieldKey}`;
    const value = draft?.key === key ? draft.value : stored;
    return (
      <div>
        <label className={labelClass}>{label}</label>
        <input
          aria-label={label} className={fieldClass} value={value}
          onChange={event => setDraft({ key, value: event.target.value })}
          onBlur={() => { if (draft?.key !== key) return; const next = draft.value; setDraft(null); if (next.trim() !== stored.trim()) commit(next); }}
          onKeyDown={event => { if (event.key === 'Enter') (event.target as HTMLInputElement).blur(); }}
        />
      </div>
    );
  };
  const deleteButton = (plan: InteractionCommandPlan, label: string) => (
    <button
      type="button" onClick={() => run(plan, 'It could not be deleted.')}
      className="w-full rounded border border-red-800 px-2 py-1.5 text-sm text-red-400 hover:bg-red-950/30"
    >{label}</button>
  );
  const sequence = orderedMessages(interaction);
  const anchorOptions = sequence.map(entry => <option key={entry.id} value={entry.id}>{messageSentence(repository, interactionId, entry.id)}</option>);
  const owner = sysmlObjectLabel(interaction, 'Interaction');

  let body: React.ReactNode = null;
  let title = '';
  if (found.elementKind === 'lifeline') {
    const lifeline = interaction.lifelines.find(candidate => candidate.id === elementId)!;
    title = 'Lifeline';
    const candidates = listLifelineCandidates(repository, interactionId);
    body = (
      <>
        {text('name', lifeline.name ?? '', value => run(buildRenameInteractionElementCommand(repository, { interactionId, elementId, name: value }), 'The name could not be changed.'), 'Name')}
        <div>
          <label className={labelClass}>Represents</label>
          <select
            aria-label="Lifeline represents" className={fieldClass} value={lifeline.representsId ?? ''}
            onChange={event => run(buildSetLifelineRepresentsCommand(repository, { interactionId, lifelineId: elementId, representsId: event.target.value || undefined }), 'The lifeline could not be changed.')}
          >
            <option value="">(nothing)</option>
            {(Object.keys(LIFELINE_CANDIDATE_GROUP_LABELS) as LifelineCandidateGroup[]).map(group => {
              const options = candidates.filter(candidate => candidate.group === group);
              return options.length === 0 ? null : (
                <optgroup key={group} label={LIFELINE_CANDIDATE_GROUP_LABELS[group]}>
                  {options.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
                </optgroup>
              );
            })}
          </select>
        </div>
        {deleteButton(buildRemoveLifelineCommand(repository, { interactionId, lifelineId: elementId }), 'Delete Lifeline')}
      </>
    );
  } else if (found.elementKind === 'message') {
    const stored = interaction.messages.find(candidate => candidate.id === elementId)!;
    title = 'Message';
    const signals = stored.sort === 'asynchSignal' ? listSignalCandidates(repository, interactionId, stored.targetLifelineId) : [];
    const connectors = listMessageConnectors(repository, interactionId, stored.sourceLifelineId, stored.targetLifelineId);
    const position = sequence.findIndex(entry => entry.id === elementId);
    body = (
      <>
        <p className="text-xs text-[#aaa]">{messageSentence(repository, interactionId, elementId)}</p>
        {text('name', stored.name ?? '', value => run(buildRenameInteractionElementCommand(repository, { interactionId, elementId, name: value }), 'The name could not be changed.'), 'Name')}
        <div>
          <label className={labelClass}>Kind</label>
          <select
            aria-label="Message kind" className={fieldClass} value={stored.sort}
            onChange={event => run(buildUpdateInteractionMessageCommand(repository, { interactionId, messageId: elementId, sort: event.target.value as InteractionMessageSort }), 'The message kind was rejected.')}
          >
            {MESSAGE_SORTS.map(sort => <option key={sort} value={sort}>{MESSAGE_SORT_LABELS[sort]}</option>)}
          </select>
        </div>
        {stored.sort === 'asynchSignal' && (
          <div>
            <label className={labelClass}>Signal</label>
            <select
              aria-label="Signal" className={fieldClass} value={stored.signatureId ?? ''}
              onChange={event => run(buildUpdateInteractionMessageCommand(repository, { interactionId, messageId: elementId, signatureId: event.target.value || null }), 'The signal was rejected.')}
            >
              <option value="">(none)</option>
              {signals.map(option => <option key={option.id} value={option.id}>{option.received ? option.label : `${option.label} (not received)`}</option>)}
            </select>
          </div>
        )}
        {text('arguments', stored.arguments ?? '', value => run(buildUpdateInteractionMessageCommand(repository, { interactionId, messageId: elementId, arguments: value }), 'The arguments could not be changed.'), 'Arguments')}
        {connectors.length > 0 && (
          <div>
            <label className={labelClass}>Connector</label>
            <select
              aria-label="Connector" className={fieldClass} value={stored.connectorId ?? ''}
              onChange={event => run(buildUpdateInteractionMessageCommand(repository, { interactionId, messageId: elementId, connectorId: event.target.value || null }), 'The connector was rejected.')}
            >
              <option value="">(none)</option>
              {connectors.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
            </select>
          </div>
        )}
        <p className="text-xs text-[#888]">Position {position + 1} of {sequence.length}</p>
        {deleteButton(buildRemoveInteractionMessageCommand(repository, { interactionId, messageId: elementId }), 'Delete Message')}
      </>
    );
  } else if (found.elementKind === 'fragment') {
    const fragment = interaction.fragments.find(candidate => candidate.id === elementId)!;
    title = 'Combined Fragment';
    body = (
      <>
        <div>
          <label className={labelClass}>Operator</label>
          <select
            aria-label="Fragment operator" className={fieldClass} value={fragment.operator}
            onChange={event => run(buildSetFragmentOperatorCommand(repository, { interactionId, fragmentId: elementId, operator: event.target.value as CombinedFragmentOperator }), 'The operator was rejected.')}
          >
            {FRAGMENT_OPERATORS.map(operator => <option key={operator} value={operator}>{operator}</option>)}
          </select>
        </div>
        {fragment.operands.map((operand, index) => (
          <React.Fragment key={index}>
            {text(`guard:${index}`, operand.guard ?? '', value => run(buildSetOperandGuardCommand(repository, { interactionId, fragmentId: elementId, operandIndex: index, guard: value }), 'The guard could not be changed.'), `Guard of operand ${index + 1}`)}
          </React.Fragment>
        ))}
        {deleteButton(buildRemoveFragmentCommand(repository, { interactionId, fragmentId: elementId }), 'Delete Fragment')}
      </>
    );
  } else if (found.elementKind === 'use') {
    const use = (interaction.uses ?? []).find(candidate => candidate.id === elementId)!;
    title = 'Ref Frame';
    const referable = listReferableInteractions(repository, interactionId);
    body = (
      <>
        <div>
          <label className={labelClass}>Refers to</label>
          <select
            aria-label="Refers to" className={fieldClass} value={use.refersToId}
            onChange={event => run(buildUpdateInteractionUseCommand(repository, { interactionId, useId: elementId, refersToId: event.target.value }), 'The ref frame was rejected.')}
          >
            {!referable.some(option => option.id === use.refersToId) && <option value={use.refersToId}>{sysmlObjectLabel(repository.definitions[use.refersToId], 'Interaction')}</option>}
            {referable.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
          </select>
        </div>
        <div>
          <label className={labelClass}>After</label>
          <select
            aria-label="Follows message" className={fieldClass} value={use.afterMessageId ?? ''}
            onChange={event => run(buildUpdateInteractionUseCommand(repository, { interactionId, useId: elementId, afterMessageId: event.target.value || null }), 'The ref frame could not be moved.')}
          >
            <option value="">(start of the interaction)</option>
            {anchorOptions}
          </select>
        </div>
        {text('arguments', use.arguments ?? '', value => run(buildUpdateInteractionUseCommand(repository, { interactionId, useId: elementId, arguments: value }), 'The arguments could not be changed.'), 'Arguments')}
        {deleteButton(buildRemoveInteractionUseCommand(repository, { interactionId, useId: elementId }), 'Delete Ref Frame')}
      </>
    );
  } else if (found.elementKind === 'constraint') {
    const constraint = (interaction.constraints ?? []).find(candidate => candidate.id === elementId)!;
    title = constraint.kind === 'duration' ? 'Duration Constraint' : 'Time Constraint';
    const span = [constraint.fromMessageId, constraint.toMessageId].filter((id): id is string => Boolean(id)).map(id => messageSentence(repository, interactionId, id)).join(' → ');
    body = (
      <>
        <p className="text-xs text-[#aaa]">{span}</p>
        {text('expression', constraint.expression, value => run(buildUpdateInteractionConstraintCommand(repository, { interactionId, constraintId: elementId, expression: value }), 'The expression could not be changed.'), 'Expression')}
        {deleteButton(buildRemoveInteractionConstraintCommand(repository, { interactionId, constraintId: elementId }), 'Delete Constraint')}
      </>
    );
  } else {
    title = 'State Invariant';
    const invariant = (interaction.stateInvariants ?? []).find(candidate => candidate.id === elementId)!;
    const lifeline = interaction.lifelines.find(candidate => candidate.id === invariant.lifelineId);
    body = (
      <>
        <p className="text-xs text-[#aaa]">On {lifeline?.name?.trim() || 'a lifeline'}. Choose its state on the sequence diagram, which lists the state machine's states.</p>
        {deleteButton(buildRemoveStateInvariantCommand(repository, { interactionId, invariantId: elementId }), 'Delete State Invariant')}
      </>
    );
  }

  return (
    <div className="space-y-3" data-testid="interaction-element-inspector">
      <div>
        <h3 className="text-sm font-semibold text-[#e0e0e0]">{title}</h3>
        <p className="text-[11px] text-[#777]">in {owner}</p>
      </div>
      {body}
      {message && <p role="alert" className="text-xs text-amber-300">{message}</p>}
    </div>
  );
}
