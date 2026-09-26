import * as fs from 'fs';
import * as path from 'path';
import {
  EngineeringConcept,
  EngineeringConceptSchema,
  computeConceptHash
} from '../contracts/engineeringKnowledge';
import {
  ConceptRepository,
  ConceptFilter,
  assertSafeRecordId,
  atomicWriteFileSync,
  StoreManifest,
  StoreManifestSchema,
  MAX_RECORD_BYTES
} from './contentAddressedStore';
import { canonicalJson, sha256Hex } from '../../../../engine/opm/canonicalHash';

export interface ConceptStoreOptions {
  storageDir: string;
}

export class ConceptStore implements ConceptRepository {
  private readonly storageDir: string;
  private readonly conceptsDir: string;
  private readonly manifestPath: string;
  private manifest: StoreManifest = {
    formatVersion: '1.0.0',
    manifestHash: '',
    updatedAt: 0,
    entries: {}
  };
  private initialized = false;

  constructor(options: ConceptStoreOptions) {
    this.storageDir = path.resolve(options.storageDir);
    this.conceptsDir = path.join(this.storageDir, 'concepts');
    this.manifestPath = path.join(this.storageDir, 'concepts_manifest.json');
  }

  public async init(): Promise<void> {
    fs.mkdirSync(this.storageDir, { recursive: true });
    fs.mkdirSync(this.conceptsDir, { recursive: true });

    if (fs.existsSync(this.manifestPath)) {
      try {
        const raw = fs.readFileSync(this.manifestPath, 'utf8');
        const parsed = JSON.parse(raw);
        this.manifest = StoreManifestSchema.parse(parsed);

        const { manifestHash, ...withoutHash } = this.manifest;
        const expected = sha256Hex(canonicalJson(withoutHash));
        if (manifestHash !== expected) {
          throw new Error(`MANIFEST_CORRUPTED: Manifest hash mismatch (${manifestHash} !== ${expected})`);
        }
      } catch (err: unknown) {
        throw new Error(
          `MANIFEST_CORRUPTED: Failed to load concept manifest: ${err instanceof Error ? err.message : String(err)}`
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

  public async get(id: string): Promise<EngineeringConcept> {
    if (!this.initialized) await this.init();
    assertSafeRecordId(id);

    const filePath = path.join(this.conceptsDir, `${id}.json`);
    if (!fs.existsSync(filePath)) {
      throw new Error(`CONCEPT_NOT_FOUND: Concept '${id}' does not exist.`);
    }

    const raw = fs.readFileSync(filePath, 'utf8');
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error(`CONCEPT_CORRUPTED: Malformed JSON for concept '${id}'`);
    }

    const concept = EngineeringConceptSchema.parse(parsed);
    const computed = computeConceptHash(concept);
    if (computed !== concept.contentHash) {
      throw new Error(
        `CHECKSUM_MISMATCH: Concept '${id}' checksum mismatch. Stored: ${concept.contentHash}, computed: ${computed}`
      );
    }
    return concept;
  }

  public async put(concept: EngineeringConcept): Promise<EngineeringConcept> {
    if (!this.initialized) await this.init();
    assertSafeRecordId(concept.id);

    const validated = EngineeringConceptSchema.parse(concept);
    const computed = computeConceptHash(validated);
    if (validated.contentHash !== computed) {
      throw new Error(
        `HASH_MISMATCH: Concept '${validated.id}' contentHash must match computeConceptHash`
      );
    }

    const filePath = path.join(this.conceptsDir, `${validated.id}.json`);
    const fileContent = JSON.stringify(validated, null, 2) + '\n';

    if (Buffer.byteLength(fileContent) > MAX_RECORD_BYTES) {
      throw new Error(`RECORD_TOO_LARGE: Concept exceeds max size of ${MAX_RECORD_BYTES} bytes`);
    }

    atomicWriteFileSync(filePath, fileContent);

    this.manifest.entries[validated.id] = {
      id: validated.id,
      lifecycle: validated.lifecycle,
      contentHash: validated.contentHash,
      filePath: path.relative(this.storageDir, filePath)
    };
    await this.saveManifest();

    return validated;
  }

  public async list(filter?: ConceptFilter): Promise<EngineeringConcept[]> {
    if (!this.initialized) await this.init();

    const ids = Object.keys(this.manifest.entries).sort();
    const result: EngineeringConcept[] = [];

    for (const id of ids) {
      try {
        const item = await this.get(id);
        if (filter?.lifecycle && item.lifecycle !== filter.lifecycle) continue;
        if (filter?.domain && item.domain !== filter.domain) continue;
        result.push(item);
      } catch {
        // Fail closed for corrupted individual records
      }
    }

    return result.sort((a, b) => a.id.localeCompare(b.id));
  }
}
