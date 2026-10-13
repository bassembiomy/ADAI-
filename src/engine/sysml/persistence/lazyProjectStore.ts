import {
  isChunkedProjectContainer,
  decodeChunkedManifest,
  readChunkFromContainer,
  encodeChunkedProject,
  createChunkedProjectFromLegacyJson,
  computeCrc32,
  HEADER_SIZE,
  CONTAINER_MAGIC_BYTES,
  type ChunkedContainerManifest,
  type EntityChunk,
  type DiagramChunk,
  type SearchIndexChunk,
  type ChunkTableEntry,
} from './chunkedProjectFormat';

export interface LazyProjectStoreOptions {
  cacheCapacityChunks?: number;
}

export interface LazyProjectStore {
  readonly projectName: string;
  readonly totalEntities: number;
  readonly manifest: ChunkedContainerManifest;
  getEntity(id: string): Promise<any | null>;
  putEntity(entity: { id: string; [key: string]: any }): Promise<void>;
  getChildren(parentId: string): Promise<any[]>;
  getDiagram(diagramId: string): Promise<DiagramChunk | null>;
  search(query: string): Promise<any[]>;
  flush(): Promise<ArrayBuffer>;
  close(): Promise<void>;
}

class LruChunkCache {
  private capacity: number;
  private cache = new Map<string, EntityChunk>();

  constructor(capacity = 10) {
    this.capacity = capacity;
  }

  get(chunkId: string): EntityChunk | undefined {
    const chunk = this.cache.get(chunkId);
    if (chunk) {
      // Refresh recency
      this.cache.delete(chunkId);
      this.cache.set(chunkId, chunk);
    }
    return chunk;
  }

  set(chunkId: string, chunk: EntityChunk): void {
    if (this.cache.has(chunkId)) {
      this.cache.delete(chunkId);
    } else if (this.cache.size >= this.capacity) {
      // Evict oldest
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }
    this.cache.set(chunkId, chunk);
  }

  clear(): void {
    this.cache.clear();
  }
}

class LazyProjectStoreImpl implements LazyProjectStore {
  private currentBuffer: ArrayBuffer;
  private currentManifest: ChunkedContainerManifest;
  private lruCache: LruChunkCache;
  private dirtyChunkIds = new Set<string>();
  private modifiedEntities = new Map<string, any>();
  private closed = false;

  constructor(buffer: ArrayBuffer, manifest: ChunkedContainerManifest, options?: LazyProjectStoreOptions) {
    this.currentBuffer = buffer;
    this.currentManifest = manifest;
    this.lruCache = new LruChunkCache(options?.cacheCapacityChunks ?? 10);
  }

  get projectName(): string {
    return this.currentManifest.projectName;
  }

  get totalEntities(): number {
    return this.currentManifest.totalEntities;
  }

  get manifest(): ChunkedContainerManifest {
    return this.currentManifest;
  }

  private assertOpen(): void {
    if (this.closed) throw new Error('LazyProjectStore is closed');
  }

  async getEntity(id: string): Promise<any | null> {
    this.assertOpen();
    if (this.modifiedEntities.has(id)) {
      return this.modifiedEntities.get(id);
    }

    const chunkId = this.currentManifest.entityToChunk[id];
    if (!chunkId) return null;

    let chunk = this.lruCache.get(chunkId);
    if (!chunk) {
      const meta = this.currentManifest.entityChunkTable.find(c => c.chunkId === chunkId);
      if (!meta) return null;

      chunk = readChunkFromContainer<EntityChunk>(this.currentBuffer, meta);
      this.lruCache.set(chunkId, chunk);
    }

    return chunk.entities[id] ?? null;
  }

  async putEntity(entity: { id: string; [key: string]: any }): Promise<void> {
    this.assertOpen();
    this.modifiedEntities.set(entity.id, entity);

    let chunkId = this.currentManifest.entityToChunk[entity.id];
    if (!chunkId) {
      // New entity: assign to last chunk or create one
      if (this.currentManifest.entityChunkTable.length > 0) {
        chunkId = this.currentManifest.entityChunkTable[this.currentManifest.entityChunkTable.length - 1].chunkId;
      } else {
        chunkId = 'entity_chunk_0';
      }
      this.currentManifest.entityToChunk[entity.id] = chunkId;
      const ownerId = entity.ownerId || 'model';
      if (!this.currentManifest.parentChildIndex[ownerId]) {
        this.currentManifest.parentChildIndex[ownerId] = [];
      }
      this.currentManifest.parentChildIndex[ownerId].push(entity.id);
      this.currentManifest.totalEntities++;
    }

    this.dirtyChunkIds.add(chunkId);

    // If chunk in cache, update it directly
    const cached = this.lruCache.get(chunkId);
    if (cached) {
      cached.entities[entity.id] = entity;
    }
  }

  async getChildren(parentId: string): Promise<any[]> {
    this.assertOpen();
    const childIds = this.currentManifest.parentChildIndex[parentId] ?? [];
    const children: any[] = [];
    for (const id of childIds) {
      const entity = await this.getEntity(id);
      if (entity) children.push(entity);
    }
    return children;
  }

  async getDiagram(diagramId: string): Promise<DiagramChunk | null> {
    this.assertOpen();
    const meta = this.currentManifest.diagramMembershipTable[diagramId];
    if (!meta) return null;
    return readChunkFromContainer<DiagramChunk>(this.currentBuffer, meta);
  }

  async search(query: string): Promise<any[]> {
    this.assertOpen();
    const lower = query.toLowerCase();
    const matchedIds = new Set<string>();

    for (const searchMeta of this.currentManifest.searchIndexChunks) {
      const chunk = readChunkFromContainer<SearchIndexChunk>(this.currentBuffer, searchMeta);
      for (const token in chunk.tokenMap) {
        if (token.includes(lower) || lower.includes(token)) {
          for (const id of chunk.tokenMap[token]) {
            matchedIds.add(id);
            if (matchedIds.size >= 100) break;
          }
        }
      }
      if (matchedIds.size >= 100) break;
    }

    const results: any[] = [];
    for (const id of matchedIds) {
      const entity = await this.getEntity(id);
      if (entity) results.push(entity);
    }
    return results;
  }

  async flush(): Promise<ArrayBuffer> {
    this.assertOpen();
    if (this.dirtyChunkIds.size === 0 && this.modifiedEntities.size === 0) {
      return this.currentBuffer;
    }

    const encoder = new TextEncoder();
    const updatedEntityChunkTable: ChunkTableEntry[] = [];
    const newChunkPayloads: Uint8Array[] = [];
    let currentOffset = HEADER_SIZE;

    // Process entity chunks
    for (const chunkMeta of this.currentManifest.entityChunkTable) {
      let chunkBytes: Uint8Array;

      if (this.dirtyChunkIds.has(chunkMeta.chunkId)) {
        // Load chunk and apply all modified entities for this chunk
        let chunk = this.lruCache.get(chunkMeta.chunkId);
        if (!chunk) {
          chunk = readChunkFromContainer<EntityChunk>(this.currentBuffer, chunkMeta);
        }
        for (const [id, entity] of this.modifiedEntities) {
          if (this.currentManifest.entityToChunk[id] === chunkMeta.chunkId) {
            chunk.entities[id] = entity;
          }
        }
        chunkBytes = encoder.encode(JSON.stringify(chunk));
      } else {
        // Unmodified chunk: copy raw slice directly without re-serialization
        chunkBytes = new Uint8Array(this.currentBuffer, chunkMeta.offset, chunkMeta.byteLength);
      }

      const checksum = computeCrc32(chunkBytes);
      updatedEntityChunkTable.push({
        ...chunkMeta,
        offset: currentOffset,
        byteLength: chunkBytes.byteLength,
        checksum,
      });

      newChunkPayloads.push(chunkBytes);
      currentOffset += chunkBytes.byteLength;
    }

    // Copy diagram chunks
    const updatedDiagramTable = { ...this.currentManifest.diagramMembershipTable };
    for (const diagId in updatedDiagramTable) {
      const diagMeta = updatedDiagramTable[diagId];
      const diagBytes = new Uint8Array(this.currentBuffer, diagMeta.offset, diagMeta.byteLength);
      updatedDiagramTable[diagId] = {
        ...diagMeta,
        offset: currentOffset,
      };
      newChunkPayloads.push(diagBytes);
      currentOffset += diagBytes.byteLength;
    }

    // Copy search index chunks
    const updatedSearchChunks: typeof this.currentManifest.searchIndexChunks = [];
    for (const sMeta of this.currentManifest.searchIndexChunks) {
      const sBytes = new Uint8Array(this.currentBuffer, sMeta.offset, sMeta.byteLength);
      updatedSearchChunks.push({
        ...sMeta,
        offset: currentOffset,
      });
      newChunkPayloads.push(sBytes);
      currentOffset += sBytes.byteLength;
    }

    // Build new manifest
    const manifestOffset = currentOffset;
    const newManifest: ChunkedContainerManifest = {
      ...this.currentManifest,
      entityChunkTable: updatedEntityChunkTable,
      diagramMembershipTable: updatedDiagramTable,
      searchIndexChunks: updatedSearchChunks,
    };

    const manifestBytes = encoder.encode(JSON.stringify(newManifest));
    const manifestLength = manifestBytes.byteLength;
    const totalBufferSize = manifestOffset + manifestLength;

    // Assemble new container
    const newBuffer = new ArrayBuffer(totalBufferSize);
    const newBytes = new Uint8Array(newBuffer);
    const view = new DataView(newBuffer);

    // Header: Magic (16 bytes)
    newBytes.set(CONTAINER_MAGIC_BYTES, 0);
    view.setUint32(16, 1, true); // version
    view.setUint32(20, 0, true); // flags
    view.setUint32(24, manifestOffset, true);
    view.setUint32(28, manifestLength, true);

    // Write all chunks
    let writeOffset = HEADER_SIZE;
    for (const chunk of newChunkPayloads) {
      newBytes.set(chunk, writeOffset);
      writeOffset += chunk.byteLength;
    }

    // Write manifest
    newBytes.set(manifestBytes, manifestOffset);

    // Commit state
    this.currentBuffer = newBuffer;
    this.currentManifest = newManifest;
    this.dirtyChunkIds.clear();
    this.modifiedEntities.clear();

    return newBuffer;
  }

  async close(): Promise<void> {
    this.closed = true;
    this.lruCache.clear();
    this.modifiedEntities.clear();
    this.dirtyChunkIds.clear();
  }
}

export async function openLazyProject(
  source: ArrayBuffer,
  options?: LazyProjectStoreOptions,
): Promise<LazyProjectStore> {
  let buffer = source;
  if (!isChunkedProjectContainer(buffer)) {
    buffer = createChunkedProjectFromLegacyJson(buffer);
  }

  const manifest = decodeChunkedManifest(buffer);
  return new LazyProjectStoreImpl(buffer, manifest, options);
}
