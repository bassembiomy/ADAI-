import { describe, expect, it } from 'vitest';
import { OPM_HELP_FEATURES, OPM_HELP_TOPICS, OPM_UI_RECONCILIATION } from './opmFeatureTopics';

describe('OPM contextual documentation', () => {
  it('reconciles every audited OPM UI site with documentation or a concrete exclusion', () => {
    expect(OPM_UI_RECONCILIATION.length).toBeGreaterThan(190);
    expect(OPM_UI_RECONCILIATION.every(row => row.status === 'mapped' || row.reason.length > 25)).toBe(true);
    for (const feature of OPM_HELP_FEATURES) {
      expect(OPM_HELP_TOPICS[feature.topicId].sections?.some(section => section.id === feature.sectionId)).toBe(true);
      expect(feature.id).not.toMatch(/\.tsx:\d+$/);
    }
  });
  it('explains executable fields, verified artifact lifecycle and target capacities', () => {
    const text = JSON.stringify(OPM_HELP_TOPICS);
    for (const term of ['targetAttributeId', 'timeoutMs', 'periodMs', 'rejectNewest', 'dropOldest', 'maxStagedWrites', 'fingerprint', 'readOnly', 'float32', 'delayMs']) expect(text).toContain(term);
    expect(text).toContain('not a certification');
  });
});
