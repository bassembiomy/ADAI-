import * as fs from 'fs';
import * as path from 'path';
import {
  EngineeringPattern,
  EngineeringPatternSchema,
  PatternManifest,
  PatternManifestSchema,
  computePatternContentHash,
  derivePatternId
} from './patternSchemas';
import { canonicalJson, sha256Hex } from '../../../engine/opm/canonicalHash';

const MAX_RECORD_BYTES = 5 * 1024 * 1024; // 5 MB

export interface PatternStoreOptions {
  storageDir: string;
  readOnlySeedDir?: string;
}

function atomicWriteFileSync(targetPath: string, content: string): void {
  const tempPath = `${targetPath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  fs.writeFileSync(tempPath, content, 'utf8');
  try {
    fs.renameSync(tempPath, targetPath);
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code === 'EPERM' || code === 'EEXIST') {
      try {
        if (fs.existsSync(targetPath)) {
          fs.unlinkSync(targetPath);
        }
        fs.renameSync(tempPath, targetPath);
      } catch {
        fs.copyFileSync(tempPath, targetPath);
        try {
          fs.unlinkSync(tempPath);
        } catch {
          // ignore cleanup error
        }
      }
    } else {
      throw err;
    }
  }
}

export class PatternStore {
  private readonly storageDir: string;
  private readonly patternsDir: string;
  private readonly manifestPath: string;
  private readonly readOnlySeedDir?: string;
  private manifest: PatternManifest = {
    formatVersion: '1.0.0',
    manifestHash: '',
    updatedAt: 0,
    patterns: {}
  };
  private initialized = false;

  constructor(options: PatternStoreOptions) {
    this.storageDir = path.resolve(options.storageDir);
    this.patternsDir = path.join(this.storageDir, 'patterns');
    this.manifestPath = path.join(this.storageDir, 'manifest.json');
    this.readOnlySeedDir = options.readOnlySeedDir ? path.resolve(options.readOnlySeedDir) : undefined;
  }

  public async init(): Promise<void> {
    fs.mkdirSync(this.storageDir, { recursive: true });
    fs.mkdirSync(this.patternsDir, { recursive: true });

    if (fs.existsSync(this.manifestPath)) {
      try {
        const raw = fs.readFileSync(this.manifestPath, 'utf8');
        const parsed = JSON.parse(raw);
        this.manifest = PatternManifestSchema.parse(parsed);

        // Verify manifest self-hash
        const { manifestHash, ...withoutHash } = this.manifest;
        const expectedHash = sha256Hex(canonicalJson(withoutHash));
        if (manifestHash !== expectedHash) {
          throw new Error(`MANIFEST_CORRUPTED: Hash mismatch (${manifestHash} !== ${expectedHash})`);
        }
      } catch (err: unknown) {
        throw new Error(
          `MANIFEST_CORRUPTED: Failed to load manifest: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    } else {
      this.manifest = {
        formatVersion: '1.0.0',
        manifestHash: '',
        updatedAt: Date.now(),
        patterns: {}
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

  public async put(
    payload: Omit<EngineeringPattern, 'contentHash' | 'id'>
  ): Promise<EngineeringPattern> {
    if (!this.initialized) await this.init();

    const contentHash = computePatternContentHash(payload);
    const id = derivePatternId(payload.name, contentHash);

    const fullPattern: EngineeringPattern = {
      ...payload,
      id,
      contentHash
    };

    // Strict validation
    const validated = EngineeringPatternSchema.parse(fullPattern);

    const filePath = path.join(this.patternsDir, `${id}.json`);
    const fileContent = JSON.stringify(validated, null, 2) + '\n';

    if (Buffer.byteLength(fileContent) > MAX_RECORD_BYTES) {
      throw new Error(`PATTERN_TOO_LARGE: Record exceeds max size of ${MAX_RECORD_BYTES} bytes`);
    }

    // Atomic write
    atomicWriteFileSync(filePath, fileContent);

    // Update manifest
    this.manifest.patterns[id] = {
      id,
      name: validated.name,
      version: validated.version,
      lifecycle: validated.lifecycle,
      contentHash: validated.contentHash,
      qualityScore: validated.evidence.qualityScore,
      filePath: path.relative(this.storageDir, filePath)
    };

    await this.saveManifest();
    return validated;
  }

  public async get(id: string): Promise<EngineeringPattern> {
    if (!this.initialized) await this.init();

    const entry = this.manifest.patterns[id];
    let targetPath = entry ? path.resolve(this.storageDir, entry.filePath) : path.join(this.patternsDir, `${id}.json`);

    if (!fs.existsSync(targetPath)) {
      // Check seed dir if available
      if (this.readOnlySeedDir) {
        const seedPath = path.join(this.readOnlySeedDir, `${id}.json`);
        if (fs.existsSync(seedPath)) {
          targetPath = seedPath;
        } else {
          throw new Error(`PATTERN_NOT_FOUND: Pattern '${id}' does not exist.`);
        }
      } else {
        throw new Error(`PATTERN_NOT_FOUND: Pattern '${id}' does not exist.`);
      }
    }

    const raw = fs.readFileSync(targetPath, 'utf8');
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error(`PATTERN_CORRUPTED: Malformed JSON for pattern '${id}'`);
    }

    const pattern = EngineeringPatternSchema.parse(parsed);

    // Checksum verification against content
    const { id: _, contentHash: storedHash, ...payload } = pattern;
    const computedHash = computePatternContentHash(payload);

    if (computedHash !== storedHash) {
      throw new Error(
        `CHECKSUM_MISMATCH: Pattern '${id}' content hash mismatch. Stored: ${storedHash}, computed: ${computedHash}`
      );
    }

    return pattern;
  }

  public async list(filter?: {
    lifecycle?: EngineeringPattern['lifecycle'];
    domain?: string;
  }): Promise<EngineeringPattern[]> {
    if (!this.initialized) await this.init();

    const result: EngineeringPattern[] = [];
    for (const id of Object.keys(this.manifest.patterns)) {
      try {
        const p = await this.get(id);
        if (filter?.lifecycle && p.lifecycle !== filter.lifecycle) continue;
        if (filter?.domain && p.domain !== filter.domain) continue;
        result.push(p);
      } catch {
        // Skip unreadable or corrupted patterns in list
      }
    }

    // Deterministic sorting by ID
    return result.sort((a, b) => a.id.localeCompare(b.id));
  }
}
