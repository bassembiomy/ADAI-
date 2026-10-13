import { describe, expect, it } from 'vitest';
import { HELP_DATA } from '../HelpData';
import { getSupportedElementKinds } from '../engine/sysml/capabilities/catalog';
import { getHelpInspectorSchemas } from './helpFeatures';
import { ACTIVITY_NODE_KINDS } from '../engine/sysml/activity';
import { DIAGRAM_REFERENCES } from './referenceTopics';

describe('engineering reference completeness', () => {
  it('covers every activity palette node with individual instructions', () => {
    for (const kind of ACTIVITY_NODE_KINDS) expect(HELP_DATA[`behavior-element-activity:${kind}`]?.sections?.some(s => s.id === 'example'), kind).toBe(true);
  });
  it('documents every supported element with a worked example, live property table and diagram', () => {
    for (const { metaclass } of getSupportedElementKinds()) {
      const topic = HELP_DATA[`sysml-element-${metaclass}`];
      expect(topic, metaclass).toBeTruthy();
      expect(topic.sections?.find(s => s.id === 'example')?.body.length, metaclass).toBeGreaterThan(90);
      expect(topic.sections?.some(s => s.diagram), metaclass).toBe(true);
      const schema = getHelpInspectorSchemas().find(s => s.metaclass === metaclass);
      const table = topic.sections?.find(s => s.id === 'properties')?.table;
      expect(table?.rows.map(row => row[0]), metaclass).toEqual(schema?.fields.map(f => f.label) ?? []);
    }
  });
  it('has a visual chapter and symbol reference for each supported diagram family', () => {
    for (const id of ['bdd-reference', 'ibd-reference', 'requirements-reference', 'rtm-reference',
      'package-diagrams', 'activity-diagrams', 'sequence-diagrams', 'use-case-diagrams',
      'parametric-diagrams', 'state-machine-fundamentals', 'entropy-opm', 'xbridges-ref', 'vlab-fundamentals']) {
      const topic = HELP_DATA[id];
      expect(topic, id).toBeTruthy();
      expect(topic.sections?.some(s => s.diagram), id).toBe(true);
      expect(topic.sections?.find(s => s.id === 'symbols')?.table?.rows.length, id).toBeGreaterThan(0);
    }
    expect(HELP_DATA['diagram-reference'].related?.filter(id => id in DIAGRAM_REFERENCES)).toHaveLength(13);
    expect(HELP_DATA['diagram-reference'].related).toContain('modeling-philosophy');
    expect(HELP_DATA['diagram-reference'].related).toContain('execution-boundaries');
  });
  it('documents relationship examples and preserves contextual endpoint instructions', () => {
    for (const [id, topic] of Object.entries(HELP_DATA).filter(([id]) => id.startsWith('sysml-relationship-'))) {
      expect(topic.sections?.find(s => s.id === 'connect'), id).toBeTruthy();
      expect(topic.sections?.find(s => s.id === 'example')?.body.length, id).toBeGreaterThan(60);
      expect(topic.sections?.some(s => s.diagram), id).toBe(true);
    }
  });
});
