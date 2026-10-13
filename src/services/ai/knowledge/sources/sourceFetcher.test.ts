import { describe, expect, it } from 'vitest';
import { fetchSourceMetadata, SourceTransport } from './sourceFetcher';
import { KnowledgeSource } from './sourceSchemas';
import { sha256Hex } from '../../../../engine/opm/canonicalHash';

const source: KnowledgeSource = {
  id: 'src_1234567890abcdef',
  url: 'https://docs.example.com/reference',
  title: 'Reference source',
  provider: 'Example',
  sourceType: 'documentation',
  licensePolicy: { mode: 'review_required', notes: 'CC-BY-4.0' },
  retrievalPolicy: { mode: 'metadata_only' },
  enabled: true
};

function transport(body: string, headers: Record<string, string> = { 'content-type': 'text/html; charset=utf-8' }): SourceTransport {
  return async () => ({ status: 200, headers, body });
}

describe('fetchSourceMetadata', () => {
  it('extracts safe HTML metadata and hashes the original response without executing markup', async () => {
    const body = '<html><head><title>Inverter guide</title><meta name="description" content="A guide"></head><body><h1>Guide</h1><script>throw new Error("must not run")</script></body></html>';
    const candidate = await fetchSourceMetadata(source, transport(body));

    expect(candidate.title).toBe('Inverter guide');
    expect(candidate.content).toContain('Inverter guide');
    expect(candidate.content).toContain('Guide');
    expect(candidate.content).not.toContain('throw new Error');
    expect(candidate.checksum).toBe(sha256Hex(body));
    expect(candidate.contentType).toBe('text/plain');
    expect(candidate.metadataOnly).toBe(true);
    expect(candidate.isExecutable).toBe(false);
    expect(candidate.sourceUrl).toBe(source.url);
    expect(candidate.license).toBe('CC-BY-4.0');
  });

  it('rejects oversized responses before metadata parsing', async () => {
    await expect(fetchSourceMetadata(source, transport('x'.repeat(1024 * 1024 + 1)), { maxBytes: 1024 * 1024 }))
      .rejects.toThrow(/RESPONSE_TOO_LARGE/);
  });

  it('rejects unsupported content types and missing license policy', async () => {
    await expect(fetchSourceMetadata(source, transport('{}', { 'content-type': 'application/zip' })))
      .rejects.toThrow(/UNSUPPORTED_CONTENT_TYPE/);
    await expect(fetchSourceMetadata({ ...source, licensePolicy: { mode: 'review_required', notes: '' } } as KnowledgeSource, transport('x')))
      .rejects.toThrow(/LICENSE_REQUIRED/);
  });

  it('enforces timeout through the injected transport boundary', async () => {
    const slow: SourceTransport = () => new Promise(resolve => setTimeout(() => resolve({ status: 200, headers: { 'content-type': 'text/plain' }, body: 'x' }), 25));
    await expect(fetchSourceMetadata(source, slow, { timeoutMs: 1 })).rejects.toThrow(/FETCH_TIMEOUT/);
  });
});
