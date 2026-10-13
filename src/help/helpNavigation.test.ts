import { describe, expect, it } from 'vitest';
import { searchHelpTopics, resolveModuleHelp, getAdjacentHelpTopics } from './helpNavigation';

const topics = {
  first: { title: 'First', category: 'Basics', description: 'Intro', content: 'Start here', sections: [{ id: 'start', title: 'Start', body: 'Save a project' }] },
  sequence: { title: 'Sequence', category: 'SysML', description: 'Messages', content: 'Interactions', sections: [{ id: 'fragments', title: 'Combined fragments', body: 'An operand guard selects the alternative.' }] },
};

describe('Help search and contextual navigation', () => {
  it('searches reference-table meanings and routes structural modes to dedicated chapters', () => {
    const reference = { ref: { ...topics.first, sections: [{ id: 'properties', title: 'Properties', body: 'Current fields', table: { columns: ['Field', 'Meaning'], rows: [['isConjugated', 'Reverse interface interpretation']] } }] } };
    expect(searchHelpTopics(reference, 'conjugated interpretation')).toMatchObject([{ topicId: 'ref', sectionId: 'properties' }]);
    expect(resolveModuleHelp('bdd')).toBe('bdd-reference');
    expect(resolveModuleHelp('ibd')).toBe('ibd-reference');
    expect(resolveModuleHelp('requirements')).toBe('requirements-reference');
    expect(resolveModuleHelp('rtm')).toBe('rtm-reference');
  });
  it('finds text inside sections and returns the section anchor', () => {
    expect(searchHelpTopics(topics, 'operand guard')).toMatchObject([{ topicId: 'sequence', sectionId: 'fragments' }]);
  });
  it('supports multiple words, lists and code without case sensitivity', () => {
    const more = { ...topics, code: { ...topics.first, title: 'Generated C', sections: [{ id: 'api', title: 'API', body: 'Scheduler', code: 'SM_ReadInputs(); SM_Step();', list: ['Reset clears active states'] }] } };
    expect(searchHelpTopics(more, 'sm_step')).toMatchObject([{ topicId: 'code', sectionId: 'api' }]);
    expect(searchHelpTopics(more, 'RESET states')).toMatchObject([{ topicId: 'code', sectionId: 'api' }]);
    expect(searchHelpTopics(topics, 'nonexistent')).toEqual([]);
  });
  it('resolves each diagram mode rather than routing every module to Getting Started', () => {
    expect(resolveModuleHelp('sequence')).toBe('sequence-diagrams');
    expect(resolveModuleHelp('useCase')).toBe('use-case-diagrams');
    expect(resolveModuleHelp('statemachine')).toBe('state-machine-fundamentals');
    expect(resolveModuleHelp('vlab')).toBe('vlab-fundamentals');
    expect(resolveModuleHelp('unknown')).toBe('getting-started');
  });
  it('provides bounded previous and next topic navigation', () => {
    expect(getAdjacentHelpTopics(topics, 'first')).toEqual({ previous: undefined, next: 'sequence' });
    expect(getAdjacentHelpTopics(topics, 'sequence')).toEqual({ previous: 'first', next: undefined });
  });
});
