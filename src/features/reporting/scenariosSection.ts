import type { SysmlRepository } from '../../engine/sysml/model';
import { interactionNestedIds, listInteractions, messageLabel, orderedMessages } from '../../engine/sysml/interaction';
import { messageSentence } from '../sysml/sequenceDiagramView';
import { resolveSysmlReferenceLabel, sysmlObjectLabel } from '../sysml/sysmlDisplayLabel';

export interface ScenarioMessageRow {
  position: number;
  /** `enable (driver → car)`: names only, never ids. */
  sentence: string;
}

export interface ScenarioTraceLink {
  /** `satisfy`, `verify`, `allocation`, … */
  kind: string;
  /** What the link starts from: the interaction itself or `message 2: go`. */
  from: string;
  /** What it ends at, as a readable name. */
  to: string;
}

export interface ScenarioEntry {
  interactionId: string;
  title: string;
  /** The use case or Block that owns the scenario, when there is one. */
  context?: string;
  messages: ScenarioMessageRow[];
  links: ScenarioTraceLink[];
}

/** One entry per Interaction, ordered by title: its messages and the relationships that start or end on it. */
export function buildScenarioEntries(repo: SysmlRepository): ScenarioEntry[] {
  return listInteractions(repo)
    .map(interaction => {
      const nested = new Set([interaction.id, ...interactionNestedIds(interaction)]);
      const sequence = orderedMessages(interaction);
      const part = (id: string): string => {
        if (id === interaction.id) return sysmlObjectLabel(interaction, 'Interaction');
        const index = sequence.findIndex(message => message.id === id);
        if (index >= 0) {
          const args = sequence[index].arguments?.trim();
          return `message ${index + 1}: ${messageLabel(sequence[index])}${args ? `(${args})` : ''}`;
        }
        const lifeline = interaction.lifelines.find(candidate => candidate.id === id);
        if (lifeline) return `lifeline ${lifeline.name?.trim() || 'Lifeline'}`;
        return resolveSysmlReferenceLabel(repo, id, 'Element');
      };
      const owner = interaction.ownerId ? repo.useCases?.[interaction.ownerId] ?? repo.definitions[interaction.ownerId] : undefined;
      const context = owner ? sysmlObjectLabel(owner, owner.kind === 'useCase' ? 'Use Case' : 'Block') : undefined;
      const links = Object.values(repo.relationships)
        .filter(relationship => nested.has(relationship.sourceId) || nested.has(relationship.targetId))
        .map(relationship => ({ kind: relationship.kind as string, from: part(relationship.sourceId), to: part(relationship.targetId) }))
        .sort((a, b) => a.kind.localeCompare(b.kind) || a.from.localeCompare(b.from) || a.to.localeCompare(b.to));
      return {
        interactionId: interaction.id,
        title: sysmlObjectLabel(interaction, 'Interaction'),
        ...(context ? { context } : {}),
        messages: sequence.map((message, index) => ({ position: index + 1, sentence: messageSentence(repo, interaction.id, message.id) })),
        links,
      };
    })
    .sort((a, b) => a.title.localeCompare(b.title));
}

/** The "Scenarios" section of the architecture report; empty when the model has no Interaction. */
export function renderScenariosSection(repo: SysmlRepository, escape: (text: string) => string): string {
  const entries = buildScenarioEntries(repo);
  if (entries.length === 0) return '';
  let html = '<h2>Scenarios</h2>';
  for (const entry of entries) {
    html += `<h3>${escape(entry.title)}</h3>`;
    if (entry.context) html += `<div class="meta">Scenario of ${escape(entry.context)}</div>`;
    html += entry.messages.length === 0
      ? '<p>No messages.</p>'
      : `<table><tr><th>#</th><th>Message</th></tr>${entry.messages.map(row => `<tr><td>${row.position}</td><td>${escape(row.sentence)}</td></tr>`).join('')}</table>`;
    if (entry.links.length > 0) {
      html += `<table><tr><th>Relationship</th><th>From</th><th>To</th></tr>${entry.links.map(link => `<tr><td>${escape(link.kind)}</td><td>${escape(link.from)}</td><td>${escape(link.to)}</td></tr>`).join('')}</table>`;
    }
  }
  return html;
}
