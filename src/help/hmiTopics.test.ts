import { describe, expect, it } from 'vitest';
import { HMI_CATALOG } from '../features/hmi/hmiCatalog';
import { HMI_HELP_TOPICS } from './hmiTopics';

describe('HMI Help coverage', () => {
  it('documents every catalog widget with bindings, configuration, example and state semantics', () => {
    expect(Object.keys(HMI_HELP_TOPICS).filter(id => id.startsWith('hmi-component-'))).toHaveLength(42);
    for (const entry of HMI_CATALOG) {
      const topic = HMI_HELP_TOPICS[`hmi-component-${entry.type}`];
      expect(topic.title).toBe(`HMI: ${entry.label}`);
      expect(topic.sections?.map(section => section.id)).toEqual(['use', 'binding', 'properties', 'example', 'semantics']);
      expect(topic.content).toContain('committed');
      expect(topic.content).not.toMatch(/(?:forces?|directly activates?) (?:a |the )?state/i);
    }
  });
  it('provides the canonical overview and tick-boundary diagram', () => {
    const overview = HMI_HELP_TOPICS.hmi_dashboard;
    expect(overview.content).toContain('paused');
    expect(overview.content).toContain('Reset');
    expect(overview.content).toContain('pulse');
    expect(overview.sections?.find(section => section.id === 'ticks')?.diagram?.nodes.map(node => node.id)).toEqual(['input', 'queue', 'external', 'apply', 'tick', 'frame']);
  });
});
