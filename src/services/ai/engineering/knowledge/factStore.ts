import * as fs from 'fs';
import * as path from 'path';
import {
  EngineeringFact,
  EngineeringFactSchema,
  computeFactHash
} from '../contracts/engineeringKnowledge';
import {
  FactRepository,
  FactFilter,
  assertSafeRecordId,
  atomicWriteFileSync,
  StoreManifest,
  StoreManifestSchema,
  MAX_RECORD_BYTES
} from './contentAddressedStore';
import { canonicalJson, sha256Hex } from '../../../../engine/opm/canonicalHash';

export interface FactStoreOptions {
  storageDir: string;
}

export class FactStore implements FactRepository {
  private readonly storageDir: string;
  private readonly factsDir: string;
  private readonly manifestPath: string;
  private manifest: StoreManifest = {
    formatVersion: '1.0.0',
    manifestHash: '',
    updatedAt: 0,
    entries: {}
  };
  private initialized = false;

  constructor(options: FactStoreOptions) {
    this.storageDir = path.resolve(options.storageDir);
    this.factsDir = path.join(this.storageDir, 'facts');
    this.manifestPath = path.join(this.storageDir, 'facts_manifest.json');
  }

  public async init(): Promise<void> {
    fs.mkdirSync(this.storageDir, { recursive: true });
    fs.mkdirSync(this.factsDir, { recursive: true });

    if (fs.existsSync(this.manifestPath)) {
      try {
        const raw = fs.readFileSync(this.manifestPath, 'utf8');
        const parsed = JSON.parse(raw);
        this.manifest = StoreManifestSchema.parse(parsed);

        const { manifestHash, ...withoutHash } = this.manifest;
        const expected = sha256Hex(canonicalJson(withoutHash));
        if (manifestHash !== expected) {
          throw new Error(`MANIFEST_CORRUPTED: Fact manifest hash mismatch (${manifestHash} !== ${expected})`);
        }
      } catch (err: unknown) {
        throw new Error(
          `MANIFEST_CORRUPTED: Failed to load fact manifest: ${err instanceof Error ? err.message : String(err)}`
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

  public async get(id: string): Promise<EngineeringFact> {
    if (!this.initialized) await this.init();
    assertSafeRecordId(id);

    const filePath = path.join(this.factsDir, `${id}.json`);
    if (!fs.existsSync(filePath)) {
      throw new Error(`FACT_NOT_FOUND: Fact '${id}' does not exist.`);
    }

    const raw = fs.readFileSync(filePath, 'utf8');
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error(`FACT_CORRUPTED: Malformed JSON for fact '${id}'`);
    }

    const fact = EngineeringFactSchema.parse(parsed);
    const computed = computeFactHash(fact);
    if (computed !== fact.contentHash) {
      throw new Error(
        `CHECKSUM_MISMATCH: Fact '${id}' checksum mismatch. Stored: ${fact.contentHash}, computed: ${computed}`
      );
    }
    return fact;
  }

  public async put(fact: EngineeringFact): Promise<EngineeringFact> {
    if (!this.initialized) await this.init();
    assertSafeRecordId(fact.id);

    const validated = EngineeringFactSchema.parse(fact);
    const computed = computeFactHash(validated);
    if (validated.contentHash !== computed) {
      throw new Error(
        `HASH_MISMATCH: Fact '${validated.id}' contentHash must match computeFactHash`
      );
    }

    const filePath = path.join(this.factsDir, `${validated.id}.json`);
    const fileContent = JSON.stringify(validated, null, 2) + '\n';

    if (Buffer.byteLength(fileContent) > MAX_RECORD_BYTES) {
      throw new Error(`RECORD_TOO_LARGE: Fact exceeds max size of ${MAX_RECORD_BYTES} bytes`);
    }

    atomicWriteFileSync(filePath, fileContent);

    this.manifest.entries[validated.id] = {
      id: validated.id,
      version: validated.version,
      contentHash: validated.contentHash,
      filePath: path.relative(this.storageDir, filePath)
    };
    await this.saveManifest();

    return validated;
  }

  public async list(filter?: FactFilter): Promise<EngineeringFact[]> {
    if (!this.initialized) await this.init();

    const ids = Object.keys(this.manifest.entries).sort();
    const result: EngineeringFact[] = [];

    for (const id of ids) {
      try {
        const item = await this.get(id);
        if (filter?.subjectConceptId && item.subjectConceptId !== filter.subjectConceptId) continue;
        if (filter?.verified !== undefined && item.verified !== filter.verified) continue;
        result.push(item);
      } catch {
        // Fail closed on corrupted records
      }
    }

    return result.sort((a, b) => a.id.localeCompare(b.id));
  }
}
