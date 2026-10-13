import { describe, expect, it } from 'vitest';
import { HELP_DATA } from '../HelpData';
import { getHelpFeatures } from './helpFeatures';
import { ACTIVITY_NODE_SHAPES } from '../features/sysml/activityDiagramView';
import { USE_CASE_EDGE_NOTATION } from '../features/sysml/useCaseDiagramView';
import { BEHAVIOR_ELEMENT_REFERENCES, DIAGRAM_REFERENCES } from './referenceTopics';
import { diagramNotation, elementNotation, relationshipNotation, behaviorNotation } from './notationReference';
import { searchHelpTopics } from './helpNavigation';

const notationOf = (id: string) => HELP_DATA[id]?.sections?.find(section => section.id === 'notation');

describe('navigable notation and construction reference', () => {
  it('covers every diagram chapter and every named item, with a build recipe', () => {
    for (const [id, reference] of Object.entries(DIAGRAM_REFERENCES)) {
      const chapter = HELP_DATA[id];
      expect(chapter, id).toBeDefined();
      const section = notationOf(id);
      expect(section?.notation?.length, id).toBeGreaterThanOrEqual(reference.symbols.length);
      for (const [name] of reference.symbols) {
        expect(section?.notation?.some(item => item.label === name), `${id}: ${name}`).toBe(true);
        expect(diagramNotation[id]?.[name]?.appearance, `${id}: ${name}`).toBeTruthy();
      }
      expect(chapter.sections?.find(part => part.id === 'build')?.list?.length, id).toBeGreaterThanOrEqual(4);
    }
    expect(searchHelpTopics(HELP_DATA, 'filled diamond whole end').some(result => result.topicId === 'bdd-reference' && result.sectionId === 'notation')).toBe(true);
  });
  it('offers a truthful shape and connection context on every SysML and behavior item page', () => {
    for (const feature of getHelpFeatures().filter(f => f.kind === 'element' && (f.module === 'sysml' || ['activity', 'sequence', 'usecase', 'state'].includes(f.module ?? '')))) {
      const entry = notationOf(feature.topicId)?.notation?.[0];
      expect(entry?.appearance, feature.id).toBeTruthy();
      expect(entry?.connect, feature.id).toBeTruthy();
      if (feature.module === 'sysml') expect(elementNotation[feature.id.split(':').at(-1)!], feature.id).toBeDefined();
      else expect(behaviorNotation[feature.id.slice('behavior:element:'.length)], feature.id).toBeDefined();
    }
    for (const feature of getHelpFeatures().filter(f => f.kind === 'relationship')) {
      expect(relationshipNotation[feature.id.split(':').at(-1)!], feature.id).toBeDefined();
      expect(notationOf(feature.topicId)?.notation?.[0]?.connect, feature.id).toBeTruthy();
    }
    expect(Object.keys(behaviorNotation).sort()).toEqual(Object.keys(BEHAVIOR_ELEMENT_REFERENCES).sort());
  });
  it('uses visible activity and Use Case notation rather than invented graph styling', () => {
    const activity = notationOf('activity-diagrams')!.notation!;
    expect(activity.find(entry => entry.label === 'Initial / Activity Final / Flow Final')?.glyph).toBe(ACTIVITY_NODE_SHAPES.initial);
    expect(behaviorNotation['activity:decision'].glyph).toBe(ACTIVITY_NODE_SHAPES.decision);
    expect(relationshipNotation.Include.line).toBe(USE_CASE_EDGE_NOTATION.include.lineStyle);
    expect(relationshipNotation.Extend.end).toBe('open');
    expect(relationshipNotation.Generalization.end).toBe('triangle');
  });
});
