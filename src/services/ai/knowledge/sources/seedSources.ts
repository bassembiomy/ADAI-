import { KnowledgeSource, deriveSourceId } from './sourceSchemas';

const metadataOnly = {
  retrievalPolicy: { mode: 'metadata_only' as const },
  licensePolicy: {
    mode: 'review_required' as const,
    notes: 'Metadata may be catalogued; license approval is required before content or patterns are promoted.'
  },
  enabled: true
};

function source(
  url: string,
  title: string,
  sourceType: KnowledgeSource['sourceType'],
  provider: string
): KnowledgeSource {
  return { id: deriveSourceId(url), url, title, provider, sourceType, ...metadataOnly };
}

export const SEED_SOURCES: KnowledgeSource[] = [
  source('https://www.mathworks.com/help/simulink/', 'Official MathWorks Simulink documentation', 'documentation', 'MathWorks'),
  source('https://www.mathworks.com/help/simulink/model-finder.html', 'MathWorks Simulink Model Finder', 'model_finder', 'MathWorks'),
  source('https://www.mathworks.com/help/simulink/model-reference.html', 'MathWorks Simulink Model Reference', 'model_reference', 'MathWorks'),
  source('https://www.mathworks.com/matlabcentral/fileexchange/', 'MATLAB Central File Exchange', 'file_exchange', 'MathWorks'),
  source('https://www.mathworks.com/matlabcentral/fileexchange/?term=simulink', 'Simulink-tagged MATLAB Central File Exchange', 'file_exchange', 'MathWorks'),
  source('https://github.com/search?q=simulink&type=repositories', 'GitHub Simulink repository search', 'repository_search', 'GitHub')
];
