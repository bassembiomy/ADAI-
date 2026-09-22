import * as fs from 'fs';
import * as path from 'path';
import { z } from 'zod';
import { canonicalJson, sha256Hex } from '../../../../engine/opm/canonicalHash';
import {
  assertSafeRecordId,
  atomicWriteFileSync,
  StoreManifest,
  StoreManifestSchema,
  MAX_RECORD_BYTES
} from './contentAddressedStore';

export const SourceTypeEnum = z.enum([
  'standard',
  'textbook',
  'application_note',
  'manufacturer_document',
  'paper',
  'internal_document',
  'approved_documentation'
]);
export type SourceType = z.infer<typeof SourceTypeEnum>;

export const SourceDocumentSchema = z.object({
  schemaVersion: z.literal('1.0.0'),
  id: z.string().min(1),
  title: z.string().min(1),
  sourceType: SourceTypeEnum,
  version: z.string().optional(),
  publicationDate: z.string().optional(),
  author: z.string().optional(),
  publisher: z.string().optional(),
  license: z.string(),
  licenseApproved: z.boolean(),
  retrievalTimestamp: z.number(),
  checksum: z.string().length(64),
  sourceReliability: z.number().min(0).max(1),
  sectionLocators: z.array(z.string()),
  rawContent: z.string().optional(),
  contentHash: z.string().length(64)
}).strict();
export type SourceDocument = z.infer<typeof SourceDocumentSchema>;

export function computeSourceDocumentHash(doc: Record<string, unknown>): string {
  const { contentHash: _ignored, ...hashable } = doc;
  return sha256Hex(canonicalJson(hashable));
}

export interface SourceDocumentRepository {
  init(): Promise<void>;
  get(id: string): Promise<SourceDocument>;
  put(doc: SourceDocument): Promise<SourceDocument>;
  list(): Promise<SourceDocument[]>;
  has(id: string): Promise<boolean>;
}

export interface SourceDocumentStoreOptions {
  storageDir: string;
}

export class SourceDocumentStore implements SourceDocumentRepository {
  private readonly storageDir: string;
  private readonly documentsDir: string;
  private readonly manifestPath: string;
  private manifest: StoreManifest = {
    formatVersion: '1.0.0',
    manifestHash: '',
    updatedAt: 0,
    entries: {}
  };
  private initialized = false;

  constructor(options: SourceDocumentStoreOptions) {
    this.storageDir = path.resolve(options.storageDir);
    this.documentsDir = path.join(this.storageDir, 'documents');
    this.manifestPath = path.join(this.storageDir, 'documents_manifest.json');
  }

  public async init(): Promise<void> {
    fs.mkdirSync(this.storageDir, { recursive: true });
    fs.mkdirSync(this.documentsDir, { recursive: true });

    if (fs.existsSync(this.manifestPath)) {
      try {
        const raw = fs.readFileSync(this.manifestPath, 'utf8');
        const parsed = JSON.parse(raw);
        this.manifest = StoreManifestSchema.parse(parsed);

        const { manifestHash, ...withoutHash } = this.manifest;
        const expected = sha256Hex(canonicalJson(withoutHash));
        if (manifestHash !== expected) {
          throw new Error(`MANIFEST_CORRUPTED: Source document manifest hash mismatch (${manifestHash} !== ${expected})`);
        }
      } catch (err: unknown) {
        throw new Error(
          `MANIFEST_CORRUPTED: Failed to load source document manifest: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    } else {
      this.manifest = {
        formatVersion: '1.0.0',
        manifestHash: '',
        updatedAt: Date.now(),
        entries: {}
      };
      await this.saveManifest();
    }
    this.initialized = true;
  }

  private async saveManifest(): Promise<void> {
    this.manifest.updatedAt = Date.now();
    const { manifestHash, ...withoutHash } = this.manifest;
    this.manifest.manifestHash = sha256Hex(canonicalJson(withoutHash));
    const content = JSON.stringify(this.manifest, null, 2) + '\n';
    atomicWriteFileSync(this.manifestPath, content);
  }

  public async has(id: string): Promise<boolean> {
    if (!this.initialized) await this.init();
    assertSafeRecordId(id);
    return Boolean(this.manifest.entries[id]);
  }

  public async get(id: string): Promise<SourceDocument> {
    if (!this.initialized) await this.init();
    assertSafeRecordId(id);

    const filePath = path.join(this.documentsDir, `${id}.json`);
    if (!fs.existsSync(filePath)) {
      throw new Error(`DOCUMENT_NOT_FOUND: Document '${id}' does not exist.`);
    }

    const raw = fs.readFileSync(filePath, 'utf8');
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error(`DOCUMENT_CORRUPTED: Malformed JSON for document '${id}'`);
    }

    const doc = SourceDocumentSchema.parse(parsed);
    const computed = computeSourceDocumentHash(doc);
    if (computed !== doc.contentHash) {
      throw new Error(
        `CHECKSUM_MISMATCH: Document '${id}' checksum mismatch. Stored: ${doc.contentHash}, computed: ${computed}`
      );
    }
    return doc;
  }

  public async put(doc: SourceDocument): Promise<SourceDocument> {
    if (!this.initialized) await this.init();
    assertSafeRecordId(doc.id);

    const validated = SourceDocumentSchema.parse(doc);
    const computed = computeSourceDocumentHash(validated);
    if (validated.contentHash !== computed) {
      throw new Error(
        `HASH_MISMATCH: Document '${validated.id}' contentHash must match computeSourceDocumentHash`
      );
    }

    const filePath = path.join(this.documentsDir, `${validated.id}.json`);
    const fileContent = JSON.stringify(validated, null, 2) + '\n';

    if (Buffer.byteLength(fileContent) > MAX_RECORD_BYTES) {
      throw new Error(`RECORD_TOO_LARGE: Document exceeds max size of ${MAX_RECORD_BYTES} bytes`);
    }

    atomicWriteFileSync(filePath, fileContent);

    this.manifest.entries[validated.id] = {
      id: validated.id,
      contentHash: validated.contentHash,
      filePath: path.relative(this.storageDir, filePath)
    };
    await this.saveManifest();

    return validated;
  }

  public async list(): Promise<SourceDocument[]> {
    if (!this.initialized) await this.init();

    const ids = Object.keys(this.manifest.entries).sort();
    const result: SourceDocument[] = [];

    for (const id of ids) {
      try {
        const item = await this.get(id);
        result.push(item);
      } catch {
        // Fail closed on corrupted records
      }
    }

    return result.sort((a, b) => a.id.localeCompare(b.id));
  }
}
