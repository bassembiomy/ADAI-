import { describe, expect, it } from 'vitest';
import { createEmptyRepository, type InteractionDefinition, type SysmlRelationship, type SysmlRepository } from '../../engine/sysml/model';
import { buildScenarioEntries, renderScenariosSection } from './scenariosSection';

function model(): SysmlRepository {
  const repo = createEmptyRepository();
  repo.useCases = { uc1: { id: 'uc1', kind: 'useCase', name: 'Drive', namespace: [], ownerId: 'model', subjectId: undefined } } as any;
  repo.requirements.req1 = { id: 'req1', name: 'Starts', kind: 'requirement', namespace: [], requirementId: 'REQ-1', text: 't', status: 'approved', version: '1', priority: 'high', risk: 'low' } as any;
  repo.definitions.main = {
    id: 'main', kind: 'interaction', name: 'Start <Engine>', namespace: [], ownerId: 'uc1',
    lifelines: [{ id: 'a', name: 'driver' }, { id: 'b', name: 'car' }],
    messages: [
      { id: 'm1', name: 'go', order: 1, sort: 'asynchCall', sourceLifelineId: 'a', targetLifelineId: 'b' },
      { id: 'm2', name: 'stop', order: 2, sort: 'asynchCall', sourceLifelineId: 'a', targetLifelineId: 'b' },
    ],
    fragments: [],
  } as InteractionDefinition;
  repo.relationships.s1 = { id: 's1', kind: 'satisfy', sourceId: 'm2', targetId: 'req1' } as SysmlRelationship;
  repo.relationships.v1 = { id: 'v1', kind: 'verify', sourceId: 'main', targetId: 'req1' } as SysmlRelationship;
  return repo;
}

describe('scenarios report section', () => {
  it('lists messages by name and the relationships of the interaction and its nested elements', () => {
    const [entry] = buildScenarioEntries(model());
    expect(entry).toMatchObject({ title: 'Start <Engine>', context: 'Drive' });
    expect(entry.messages).toEqual([{ position: 1, sentence: 'go (driver → car)' }, { position: 2, sentence: 'stop (driver → car)' }]);
    expect(entry.links).toEqual([
      { kind: 'satisfy', from: 'message 2: stop', to: 'Starts' },
      { kind: 'verify', from: 'Start <Engine>', to: 'Starts' },
    ]);
  });

  it('keeps parentheses in a message name when describing a relationship end', () => {
    const repo = model();
    (repo.definitions.main as InteractionDefinition).messages[1].name = 'stop (hard)';
    const [entry] = buildScenarioEntries(repo);
    expect(entry.links[0].from).toBe('message 2: stop (hard)');
  });

  it('renders escaped HTML without internal ids, and nothing for a model without interactions', () => {
    const html = renderScenariosSection(model(), text => text.replace(/</g, '&lt;').replace(/>/g, '&gt;'));
    expect(html).toContain('<h2>Scenarios</h2>');
    expect(html).toContain('Start &lt;Engine&gt;');
    expect(html).toContain('Scenario of Drive');
    for (const id of ['m1', 'm2', 's1', 'req1', 'uc1']) expect(html).not.toContain(`>${id}<`);
    expect(renderScenariosSection(createEmptyRepository(), text => text)).toBe('');
  });
});
