import { sha256Hex } from '../../../../engine/opm/canonicalHash';
import { SourceCandidate, SourceCandidateSchema } from '../ingestion/ingestionSchemas';
import { KnowledgeSource } from './sourceSchemas';

export interface SourceTransportResponse {
  status: number;
  headers: Record<string, string | undefined>;
  body: string;
}

export type SourceTransport = (url: string, signal?: AbortSignal) => Promise<SourceTransportResponse>;

export interface SourceFetchOptions {
  maxBytes?: number;
  timeoutMs?: number;
}

const DEFAULT_MAX_BYTES = 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 15_000;
const SUPPORTED_TYPES = new Set(['text/html', 'text/plain', 'text/markdown', 'application/json', 'application/xml']);

function contentTypeOf(headers: Record<string, string | undefined>): string {
  const raw = headers['content-type'] || headers['Content-Type'] || 'text/plain';
  return raw.split(';', 1)[0].trim().toLowerCase();
}

function stripMarkup(body: string): string {
  return body
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractTitle(body: string, fallback: string): string {
  const match = body.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  return stripMarkup(match?.[1] || '') || fallback;
}

function defaultTransport(): SourceTransport {
  return async (url, signal) => {
    const response = await fetch(url, { signal });
    return {
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      body: await response.text(),
    };
  };
}

export async function fetchSourceMetadata(
  source: KnowledgeSource,
  transport: SourceTransport = defaultTransport(),
  options: SourceFetchOptions = {},
): Promise<SourceCandidate> {
  if (!source.licensePolicy.notes.trim()) throw new Error('LICENSE_REQUIRED: Source license policy notes are required.');

  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response: SourceTransportResponse;
  try {
    response = await Promise.race([
      transport(source.url, controller.signal),
      new Promise<SourceTransportResponse>((_, reject) =>
        setTimeout(() => reject(new Error(`FETCH_TIMEOUT: Source request exceeded ${timeoutMs}ms.`)), timeoutMs)
      ),
    ]);
  } catch (error) {
    if (controller.signal.aborted || error instanceof Error && error.message.startsWith('FETCH_TIMEOUT:')) {
      controller.abort();
      throw new Error(`FETCH_TIMEOUT: Source request exceeded ${timeoutMs}ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  if (response.status < 200 || response.status >= 300) throw new Error(`FETCH_FAILED: Source returned HTTP ${response.status}.`);
  if (Buffer.byteLength(response.body, 'utf8') > maxBytes) throw new Error(`RESPONSE_TOO_LARGE: Source exceeds ${maxBytes} bytes.`);

  const contentType = contentTypeOf(response.headers);
  if (!SUPPORTED_TYPES.has(contentType)) throw new Error(`UNSUPPORTED_CONTENT_TYPE: ${contentType}.`);

  const checksum = sha256Hex(response.body);
  const content = contentType === 'text/html' ? stripMarkup(response.body) : response.body;
  return SourceCandidateSchema.parse({
    sourceUrl: source.url,
    origin: new URL(source.url).origin,
    title: contentType === 'text/html' ? extractTitle(response.body, source.title) : source.title,
    content,
    contentType: 'text/plain',
    checksum,
    license: source.licensePolicy.notes,
    author: source.provider,
    retrievedAt: Date.now(),
    isExecutable: false,
    hasMacros: false,
    metadataOnly: true,
  });
}
