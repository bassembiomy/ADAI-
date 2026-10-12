import { describe, expect, it } from 'vitest';
import { APP_HELP_FEATURES, APP_HELP_TOPICS, matchAppHelpFeature } from './appFeatureTopics';
import { readFileSync } from 'node:fs';
describe('App control help', () => {
  it('resolves distinct properties to instructional guidance rather than a module fallback', () => {
    const priority = matchAppHelpFeature("{(e) => updateState(selectedState.id, { priority: parseInt(e.target.value) || 0 })}");
    const entry = matchAppHelpFeature("{(e) => updateState(selectedState.id, { entry: e.target.value })}");
    expect(priority?.id).toBe('app-state-priority');
    expect(entry?.id).toBe('app-state-entry');
    expect(APP_HELP_TOPICS[priority!.topicId].content).toContain('ascending');
  });
  it('documents source limitations for the PID demonstration and file import', () => {
    expect(APP_HELP_TOPICS['app-pid-load'].content).toContain('demonstration');
    expect(APP_HELP_TOPICS['app-asset-import'].content).toContain('validation');
    expect(matchAppHelpFeature('{unknownAction}') ).toBeUndefined();
  });
  it('provides unique stable IDs and nonempty action/property instructions', () => {
    expect(APP_HELP_FEATURES.length).toBeGreaterThan(70);
    expect(new Set(APP_HELP_FEATURES.map(f => f.id)).size).toBe(APP_HELP_FEATURES.length);
    for (const feature of APP_HELP_FEATURES) {
      const topic = APP_HELP_TOPICS[feature.topicId];
      expect(topic).toBeDefined();
      expect(topic.content.length).toBeGreaterThan(85);
      expect(topic.sections?.find(s => s.id === feature.sectionId)).toBeDefined();
    }
  });
  it('reconciles each historical App site and keeps exclusions separate from documentation', () => {
    const audit = JSON.parse(readFileSync('docs/help/audit/2026-10-06-ui-candidates.json', 'utf8'));
    const reconciliation = JSON.parse(readFileSync('docs/help/audit/app-ui-reconciliation.json', 'utf8'));
    const originalIds = audit.items.filter((row: {source: string}) => row.source === 'src/App.tsx').map((row: {candidateId: string}) => row.candidateId).sort();
    expect(reconciliation.records.map((row: {candidateId: string}) => row.candidateId).sort()).toEqual(originalIds);
    for (const row of reconciliation.records) {
      expect(row.reason.length).toBeGreaterThan(25);
      if (row.status === 'documented') {
        expect(row.currentSource.matched).toBe(true);
        expect(APP_HELP_FEATURES.some(feature => row.featureIds.includes(feature.id))).toBe(true);
        expect(APP_HELP_TOPICS[row.topicId].sections?.some(section => section.id === row.sectionId)).toBe(true);
      } else expect(row.featureIds).toBeUndefined();
    }
    expect(reconciliation.summary.unresolved).toBe(0);
  });
});
