import { z } from 'zod';
import { sha256Hex } from '../../../../engine/opm/canonicalHash';

export const KnowledgeSourceTypeSchema = z.enum([
  'documentation',
  'approved_documentation',
  'standard',
  'textbook',
  'application_note',
  'manufacturer_document',
  'paper',
  'internal_document',
  'model_finder',
  'model_reference',
  'file_exchange',
  'repository_search'
]);

export const SourceLicensePolicySchema = z.object({
  mode: z.enum(['review_required', 'permissive_metadata_only']),
  notes: z.string().min(1)
}).strict();

export const SourceRetrievalPolicySchema = z.object({
  mode: z.literal('metadata_only')
}).strict();

export const KnowledgeSourceSchema = z.object({
  id: z.string().regex(/^src_[a-f0-9]{16}$/),
  url: z.string().url(),
  title: z.string().min(1),
  provider: z.string().min(1),
  sourceType: KnowledgeSourceTypeSchema,
  licensePolicy: SourceLicensePolicySchema,
  retrievalPolicy: SourceRetrievalPolicySchema,
  enabled: z.boolean()
}).strict();

export type KnowledgeSource = z.infer<typeof KnowledgeSourceSchema>;
export type KnowledgeSourceType = z.infer<typeof KnowledgeSourceTypeSchema>;

/** Normalizes only URL identity components; it does not fetch or inspect the source. */
export function canonicalSourceUrl(input: string): string {
  const parsed = new URL(input);
  parsed.protocol = parsed.protocol.toLowerCase();
  parsed.hostname = parsed.hostname.toLowerCase();
  parsed.hash = '';
  parsed.searchParams.sort();
  if (parsed.pathname.length > 1) parsed.pathname = parsed.pathname.replace(/\/+$/, '');
  return parsed.toString().replace(/\?$/, '');
}

export function deriveSourceId(url: string): string {
  return `src_${sha256Hex(canonicalSourceUrl(url)).slice(0, 16)}`;
}
