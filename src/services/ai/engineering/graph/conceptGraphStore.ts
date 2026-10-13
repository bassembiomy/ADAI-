import * as fs from 'fs';
import * as path from 'path';
import {
  ConceptRelationship,
  ConceptRelationshipSchema,
  computeRelationshipHash
} from '../contracts/conceptGraph';
import {
  RelationshipRepository,
  RelationshipFilter,
  assertSafeRecordId,
  atomicWriteFileSync,
  StoreManifest,
  StoreManifestSchema,
  MAX_RECORD_BYTES
} from '../knowledge/contentAddressedStore';
import { canonicalJson, sha256Hex } from '../../../../engine/opm/canonicalHash';

export interface ConceptGraphStoreOptions {
  storageDir: string;
}

export class ConceptGraphStore implements RelationshipRepository {
  private readonly storageDir: string;
  private readonly relationshipsDir: string;
  private readonly manifestPath: string;
  private manifest: StoreManifest = {
    formatVersion: '1.0.0',
    manifestHash: '',
    updatedAt: 0,
    entries: {}
  };
  private initialized = false;

  constructor(options: ConceptGraphStoreOptions) {
    this.storageDir = path.resolve(options.storageDir);
    this.relationshipsDir = path.join(this.storageDir, 'relationships');
    this.manifestPath = path.join(this.storageDir, 'relationships_manifest.json');
  }

  public async init(): Promise<void> {
    fs.mkdirSync(this.storageDir, { recursive: true });
    fs.mkdirSync(this.relationshipsDir, { recursive: true });

    if (fs.existsSync(this.manifestPath)) {
      try {
        const raw = fs.readFileSync(this.manifestPath, 'utf8');
        const parsed = JSON.parse(raw);
        this.manifest = StoreManifestSchema.parse(parsed);

        const { manifestHash, ...withoutHash } = this.manifest;
        const expected = sha256Hex(canonicalJson(withoutHash));
        if (manifestHash !== expected) {
          throw new Error(`MANIFEST_CORRUPTED: Relationship manifest hash mismatch (${manifestHash} !== ${expected})`);
        }
      } catch (err: unknown) {
        throw new Error(
          `MANIFEST_CORRUPTED: Failed to load relationship manifest: ${err instanceof Error ? err.message : String(err)}`
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

  public async get(id: string): Promise<ConceptRelationship> {
    if (!this.initialized) await this.init();
    assertSafeRecordId(id);

    const filePath = path.join(this.relationshipsDir, `${id}.json`);
    if (!fs.existsSync(filePath)) {
      throw new Error(`RELATIONSHIP_NOT_FOUND: Relationship '${id}' does not exist.`);
    }

    const raw = fs.readFileSync(filePath, 'utf8');
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error(`RELATIONSHIP_CORRUPTED: Malformed JSON for relationship '${id}'`);
    }

    const rel = ConceptRelationshipSchema.parse(parsed);
    const computed = computeRelationshipHash(rel);
    if (computed !== rel.contentHash) {
      throw new Error(
        `CHECKSUM_MISMATCH: Relationship '${id}' checksum mismatch. Stored: ${rel.contentHash}, computed: ${computed}`
      );
    }
    return rel;
  }

  public async put(rel: ConceptRelationship): Promise<ConceptRelationship> {
    if (!this.initialized) await this.init();
    assertSafeRecordId(rel.id);

    const validated = ConceptRelationshipSchema.parse(rel);
    const computed = computeRelationshipHash(validated);
    if (validated.contentHash !== computed) {
      throw new Error(
        `HASH_MISMATCH: Relationship '${validated.id}' contentHash must match computeRelationshipHash`
      );
    }

    const filePath = path.join(this.relationshipsDir, `${validated.id}.json`);
    const fileContent = JSON.stringify(validated, null, 2) + '\n';

    if (Buffer.byteLength(fileContent) > MAX_RECORD_BYTES) {
      throw new Error(`RECORD_TOO_LARGE: Relationship exceeds max size of ${MAX_RECORD_BYTES} bytes`);
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

  public async list(filter?: RelationshipFilter): Promise<ConceptRelationship[]> {
    if (!this.initialized) await this.init();

    const ids = Object.keys(this.manifest.entries).sort();
    const result: ConceptRelationship[] = [];

    for (const id of ids) {
      try {
        const item = await this.get(id);
        if (filter?.sourceConceptId && item.sourceConceptId !== filter.sourceConceptId) continue;
        if (filter?.targetConceptId && item.targetConceptId !== filter.targetConceptId) continue;
        if (filter?.relationType && item.relationType !== filter.relationType) continue;
        if (filter?.verified !== undefined && item.verified !== filter.verified) continue;
        result.push(item);
      } catch {
        // Fail closed on corrupted records
      }
    }

    return result.sort((a, b) => a.id.localeCompare(b.id));
  }
}
