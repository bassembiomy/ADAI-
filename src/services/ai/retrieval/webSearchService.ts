import { StructuredEvidence } from './evidenceSchemas';

export class WebSearchService {
  public static async searchWeb(query: string, maxResults: number = 5): Promise<StructuredEvidence[]> {
    if (typeof window !== 'undefined' && window.adia?.searchWeb) {
      const results = await window.adia.searchWeb({ query, maxResults });
      return results.map(r => this.createEvidence({ url: r.url, title: r.title, rawSnippet: r.snippet }));
    }
    return [];
  }

  public static createEvidence(params: { url: string; title: string; rawSnippet: string }): StructuredEvidence {
    const clean = params.rawSnippet.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    const encoder = new TextEncoder();
    const bytes = encoder.encode(clean);

    let boundedText = clean;
    if (bytes.length > 32768) {
      let end = 32768;
      const decoder = new TextDecoder('utf-8', { fatal: true });
      while (end > 0) {
        try {
          boundedText = decoder.decode(bytes.subarray(0, end));
          break;
        } catch {
          end--;
        }
      }
    }

    return {
      sourceUrl: params.url,
      title: params.title.slice(0, 200),
      retrievalDate: new Date().toISOString().split('T')[0],
      cleanText: boundedText,
      byteSize: encoder.encode(boundedText).length
    };
  }
}
