import type { HelpFeature } from './helpFeatures';

export interface CoverageTopic {
  title: string;
  content: string;
  sections?: { id?: string; title: string; body: string }[];
}
export function validateHelpCoverage(features: readonly HelpFeature[], topics: Record<string, CoverageTopic>) {
  const duplicateFeatureIds: string[] = [];
  const missingTopics: string[] = [];
  const missingSections: string[] = [];
  const insufficientContent: string[] = [];
  const seen = new Set<string>();
  let documented = 0;
  for (const feature of features) {
    if (seen.has(feature.id)) duplicateFeatureIds.push(feature.id);
    seen.add(feature.id);
    const topic = topics[feature.topicId];
    if (!topic) { missingTopics.push(feature.id); continue; }
    const section = feature.sectionId ? topic.sections?.find(s => s.id === feature.sectionId) : undefined;
    if (feature.sectionId && !section) { missingSections.push(feature.id); continue; }
    if (feature.topicId === 'getting-started' || feature.documentationGaps?.length || !(section ? section.body : topic.content)?.trim()) {
      insufficientContent.push(feature.id); continue;
    }
    documented++;
  }
  const total = features.length;
  return { total, documented, missing: total - documented, coverage: total ? documented / total * 100 : 0,
    duplicateFeatureIds: [...new Set(duplicateFeatureIds)], missingTopics, missingSections, insufficientContent,
    valid: !duplicateFeatureIds.length && documented === total };
}
