import { describe, it, expect } from 'vitest';
import { WebSearchService } from './webSearchService';

describe('WebSearchService Evidence Formatting', () => {
  it('should safely truncate long multi-byte Unicode text without character corruption', () => {
    const longArabicSnippet = 'محول قدرة كهربائي '.repeat(3000);
    const evidence = WebSearchService.createEvidence({
      url: 'https://engineering.org/inverter-ar',
      title: 'Inverter Arabic Specs',
      rawSnippet: longArabicSnippet
    });

    expect(evidence.byteSize).toBeLessThanOrEqual(32768);
    expect(evidence.cleanText).not.toContain('\uFFFD');
  });
});
