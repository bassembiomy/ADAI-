interface SearchableTopic {
  title: string;
  category: string;
  description: string;
  content: string;
  sections?: { id?: string; title: string; body: string; code?: string; list?: string[]; table?: { columns: string[]; rows: string[][] } }[];
}

export interface HelpSearchResult {
  topicId: string;
  sectionId?: string;
  title: string;
  excerpt: string;
  score: number;
}

export function helpSectionId(section: { id?: string }, index: number): string {
  return section.id ?? `section-${index + 1}`;
}

export function searchHelpTopics(topics: Record<string, SearchableTopic>, query: string): HelpSearchResult[] {
  const words = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const matches = (text: string) => words.every(word => text.toLocaleLowerCase().includes(word));
  const results: HelpSearchResult[] = [];
  for (const [topicId, topic] of Object.entries(topics)) {
    const header = `${topic.title} ${topic.category} ${topic.description} ${topic.content}`;
    if (matches(header)) results.push({ topicId, title: topic.title, excerpt: topic.description, score: matches(topic.title) ? 100 : 40 });
    topic.sections?.forEach((section, index) => {
      const text = `${section.title} ${section.body} ${section.code ?? ''} ${(section.list ?? []).join(' ')} ${section.table?.rows.flat().join(' ') ?? ''}`;
      if (matches(text)) results.push({ topicId, sectionId: helpSectionId(section, index), title: `${topic.title} › ${section.title}`, excerpt: section.body.slice(0, 180), score: matches(section.title) ? 80 : 30 });
    });
  }
  return results.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
}

const MODULE_HELP: Record<string, string> = {
  statemachine: 'state-machine-fundamentals', stateMachine: 'state-machine-fundamentals',
  bdd: 'bdd-reference', ibd: 'ibd-reference', requirements: 'requirements-reference',
  rtm: 'rtm-reference', sequence: 'sequence-diagrams', useCase: 'use-case-diagrams',
  usecase: 'use-case-diagrams', activity: 'activity-diagrams', parametric: 'parametric-diagrams',
  package: 'package-diagrams', xbridges: 'xbridges-ref', vlab: 'vlab-fundamentals',
  entropy: 'entropy-opm', hil: 'hil-fundamentals', doe: 'doe-discovery', hmi: 'hmi_dashboard',
  agent: 'ai-assistant', ai: 'ai-assistant', reports: 'reports-guide', plantuml: 'sequence-diagrams',
};

export function resolveModuleHelp(mode: string): string {
  return MODULE_HELP[mode] ?? 'getting-started';
}

export function getAdjacentHelpTopics(topics: Record<string, SearchableTopic>, topicId: string): { previous?: string; next?: string } {
  const ids = Object.keys(topics);
  const index = ids.indexOf(topicId);
  return index < 0 ? {} : { previous: ids[index - 1], next: ids[index + 1] };
}
