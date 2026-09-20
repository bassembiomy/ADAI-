/**
 * Offline Engineering Knowledge Gateway (renderer-safe)
 *
 * Connects the offline engineering pattern store (resources/engineering-patterns)
 * to the runtime WITHOUT any Node fs/path usage in renderer code:
 *
 *  - In Electron, patterns travel over the allowlisted preload IPC bridge
 *    (window.electronAPI.patternStore*), whose handlers live in main.cjs.
 *  - In a plain browser (dev server / e2e Chromium), patterns are fetched as
 *    static resources from /engineering-patterns via the vite dev middleware.
 *  - In tests, any object implementing PatternStoreBridge can be injected.
 *
 * Trust policy: patterns are ADVISORY until an engine proof says otherwise.
 * Before a pattern is served it must pass deterministic verification:
 *   1. its id matches the manifest entry,
 *   2. its lifecycle is 'verified',
 *   3. when raw content is available, sha256(raw) === manifest contentHash.
 * Any failure drops the pattern silently — planning continues with fewer
 * advisory references, never with invented ones.
 */

import { EngineeringPattern } from '../planner/generalGraphPlanner';
import { sha256Hex } from '../../../engine/opm/canonicalHash';
import type {
  EngineeringPatternGateway,
  PatternRetrievalQueryInput,
} from '../../../agent/generalXbridgesWorkflow';

export interface ManifestPatternEntry {
  id: string;
  name: string;
  version?: number;
  lifecycle?: string;
  contentHash?: string;
  qualityScore?: number;
  filePath?: string;
}

export interface PatternManifest {
  formatVersion?: string;
  manifestHash?: string;
  updatedAt?: number;
  patterns?: Record<string, ManifestPatternEntry>;
}

/** Raw JSON payload for one pattern file (as shipped on disk). */
export interface RawPatternPayload {
  version?: number;
  id?: string;
  name?: string;
  description?: string;
  domain?: string;
  lifecycle?: string;
  provenance?: Record<string, unknown>;
  requirements?: { targetSystem?: string; targetBehaviors?: string[] };
  topology?: unknown;
  [key: string]: unknown;
}

/**
 * Transport abstraction. Implementations must never throw for missing data —
 * they return null/undefined so the gateway degrades to "no patterns".
 */
export interface PatternStoreBridge {
  getManifest(): Promise<PatternManifest | undefined>;
  getPattern(id: string): Promise<RawPatternPayload | undefined>;
  /** Raw file text for content-hash verification; undefined when unavailable. */
  getPatternRaw?(id: string): Promise<string | undefined>;
}

/** Bridge backed by the Electron preload API (window.electronAPI). */
export class ElectronPatternStoreBridge implements PatternStoreBridge {
  constructor(private readonly api: PatternStoreApi) {}

  static fromWindow(): ElectronPatternStoreBridge | undefined {
    const w = globalThis as { electronAPI?: PatternStoreApi };
    const api = w.electronAPI;
    if (api && typeof api.patternStoreGet === 'function' && typeof api.patternStoreList === 'function') {
      return new ElectronPatternStoreBridge(api);
    }
    return undefined;
  }

  async getManifest(): Promise<PatternManifest | undefined> {
    if (typeof this.api.patternStoreManifest !== 'function') return undefined;
    const manifest = await this.api.patternStoreManifest();
    return manifest ?? undefined;
  }

  async getPattern(id: string): Promise<RawPatternPayload | undefined> {
    const parsed = await this.api.patternStoreGet(id);
    return parsed ?? undefined;
  }

  async getPatternRaw(id: string): Promise<string | undefined> {
    if (typeof this.api.patternStoreRaw !== 'function') return undefined;
    const result = await this.api.patternStoreRaw(id);
    if (result && typeof result === 'object' && typeof (result as { raw?: unknown }).raw === 'string') {
      return (result as { raw: string }).raw;
    }
    return undefined;
  }
}

interface PatternStoreApi {
  patternStoreGet: (id: string) => Promise<RawPatternPayload | null>;
  patternStoreList: (filter?: Record<string, unknown>) => Promise<RawPatternPayload[]>;
  patternStoreManifest?: () => Promise<PatternManifest | null>;
  patternStoreRaw?: (id: string) => Promise<{ id: string; raw: string } | null>;
}

/** Bridge that reads the knowledge base as static HTTP resources (browser). */
export class HttpPatternStoreBridge implements PatternStoreBridge {
  constructor(private readonly baseUrl: string = '/engineering-patterns') {}

  async getManifest(): Promise<PatternManifest | undefined> {
    try {
      const res = await fetch(`${this.baseUrl}/manifest.json`);
      if (!res.ok) return undefined;
      return (await res.json()) as PatternManifest;
    } catch {
      return undefined;
    }
  }

  async getPattern(id: string): Promise<RawPatternPayload | undefined> {
    const raw = await this.getPatternRaw(id);
    if (raw === undefined) return undefined;
    try {
      return JSON.parse(raw) as RawPatternPayload;
    } catch {
      return undefined;
    }
  }

  async getPatternRaw(id: string): Promise<string | undefined> {
    try {
      const res = await fetch(`${this.baseUrl}/patterns/${encodeURIComponent(id)}.json`);
      if (!res.ok) return undefined;
      return await res.text();
    } catch {
      return undefined;
    }
  }
}

/** Bridge that never resolves anything (offline / unsupported runtime). */
export class EmptyPatternStoreBridge implements PatternStoreBridge {
  async getManifest(): Promise<PatternManifest | undefined> {
    return undefined;
  }
  async getPattern(): Promise<RawPatternPayload | undefined> {
    return undefined;
  }
}

interface LoadedPattern {
  pattern: EngineeringPattern;
  qualityScore: number;
}

/**
 * Verified, advisory pattern gateway. All methods are total: any transport
 * or verification failure yields "no patterns" rather than an exception.
 */
export class KnowledgePatternGateway implements EngineeringPatternGateway {
  private readonly bridge: PatternStoreBridge;
  private cache: Map<string, LoadedPattern> | undefined;
  private fingerprint: string | undefined;
  private loadPromise: Promise<Map<string, LoadedPattern>> | undefined;

  constructor(bridge?: PatternStoreBridge) {
    this.bridge =
      bridge ??
      ElectronPatternStoreBridge.fromWindow() ??
      (typeof fetch === 'function' ? new HttpPatternStoreBridge() : new EmptyPatternStoreBridge());
  }

  async listVerified(query: PatternRetrievalQueryInput): Promise<EngineeringPattern[]> {
    const loaded = await this.ensureLoaded();
    const wanted = Array.isArray(query.targetBehaviors) ? query.targetBehaviors : [];
    const matches: LoadedPattern[] = [];
    for (const entry of loaded.values()) {
      if (wanted.length > 0) {
        const has = entry.pattern.targetBehaviors ?? [];
        if (!has.some(b => wanted.includes(b))) continue;
      }
      matches.push(entry);
    }
    matches.sort((a, b) => b.qualityScore - a.qualityScore || a.pattern.id.localeCompare(b.pattern.id));
    return matches.map(m => m.pattern);
  }

  async get(id: string): Promise<EngineeringPattern | undefined> {
    const loaded = await this.ensureLoaded();
    return loaded.get(id)?.pattern;
  }

  async getManifestFingerprint(): Promise<string> {
    await this.ensureLoaded();
    return this.fingerprint ?? 'empty-manifest';
  }

  private async ensureLoaded(): Promise<Map<string, LoadedPattern>> {
    if (this.cache) return this.cache;
    if (!this.loadPromise) this.loadPromise = this.load();
    return this.loadPromise;
  }

  private async load(): Promise<Map<string, LoadedPattern>> {
    const result = new Map<string, LoadedPattern>();
    try {
      const manifest = await this.bridge.getManifest();
      const entries = manifest?.patterns;
      this.fingerprint = manifest?.manifestHash;
      if (!entries) {
        this.cache = result;
        return result;
      }
      for (const [id, entry] of Object.entries(entries)) {
        if (!entry || entry.lifecycle !== 'verified') continue;
        const pattern = await this.verifyAndMap(id, entry);
        if (pattern) result.set(id, pattern);
      }
    } catch {
      // Advisory store: degrade to empty rather than fail planning.
    }
    this.cache = result;
    return result;
  }

  private async verifyAndMap(id: string, entry: ManifestPatternEntry): Promise<LoadedPattern | undefined> {
    try {
      if (entry.contentHash && this.bridge.getPatternRaw) {
        const raw = await this.bridge.getPatternRaw(id);
        if (raw === undefined) return undefined;
        if (sha256Hex(raw) !== entry.contentHash) return undefined;
        const payload = safeParse(raw);
        if (!payload) return undefined;
        return this.mapPayload(id, entry, payload);
      }
      const payload = await this.bridge.getPattern(id);
      if (!payload) return undefined;
      return this.mapPayload(id, entry, payload);
    } catch {
      return undefined;
    }
  }

  private mapPayload(
    id: string,
    entry: ManifestPatternEntry,
    payload: RawPatternPayload,
  ): LoadedPattern | undefined {
    if (payload.id !== id) return undefined;
    if (payload.lifecycle && payload.lifecycle !== 'verified') return undefined;
    const pattern: EngineeringPattern = {
      id,
      name: typeof payload.name === 'string' ? payload.name : entry.name,
      domain: payload.domain,
      description: payload.description,
      targetBehaviors: Array.isArray(payload.requirements?.targetBehaviors)
        ? payload.requirements!.targetBehaviors!.filter((b): b is string => typeof b === 'string')
        : undefined,
      topology: payload.topology,
      provenance: payload.provenance as EngineeringPattern['provenance'],
      qualityScore: typeof entry.qualityScore === 'number' ? entry.qualityScore : undefined,
    };
    return { pattern, qualityScore: typeof entry.qualityScore === 'number' ? entry.qualityScore : 0 };
  }
}

function safeParse(raw: string): RawPatternPayload | undefined {
  try {
    return JSON.parse(raw) as RawPatternPayload;
  } catch {
    return undefined;
  }
}
