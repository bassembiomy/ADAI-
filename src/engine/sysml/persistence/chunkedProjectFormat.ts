import { loadCanonicalSysmlProject } from '../../../services/sysmlCommandGateway';
import type { SysmlRepository } from '../model';
import type { PresentationCoordinates } from '../presentationState';

export const CONTAINER_MAGIC = 'ADIA_CHUNK_V1\0\0\0';
export const CONTAINER_MAGIC_BYTES = new TextEncoder().encode(CONTAINER_MAGIC);
export const HEADER_SIZE = 32;

// Fast precomputed CRC32 table
const crcTable = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  crcTable[i] = c >>> 0;
}

export function computeCrc32(bytes: Uint8Array): string {
  let crc = 0 ^ (-1);
  for (let i = 0; i < bytes.length; i++) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ bytes[i]) & 0xff];
  }
  return ((crc ^ (-1)) >>> 0).toString(16).padStart(8, '0');
}

export interface ChunkTableEntry {
  chunkId: string;
  offset: number;
  byteLength: number;
  checksum: string;
  entityIds: string[];
}

export interface DiagramTableEntry {
  chunkId: string;
  offset: number;
  byteLength: number;
  checksum: string;
  diagramId: string;
  diagramKind: string;
  elementCount: number;
}

export interface SearchIndexTableEntry {
  chunkId: string;
  offset: number;
  byteLength: number;
  checksum: string;
  tokens: string[];
}

export interface ChunkedContainerManifest {
  format: 'adia-chunked-container';
  version: 1;
  schemaVersion: string;
  projectName: string;
  metadata?: Record<string, any>;
  legacyMetadata?: Record<string, any>;
  totalEntities: number;
  entityChunkTable: ChunkTableEntry[];
  entityToChunk: Record<string, string>;
  diagramMembershipTable: Record<string, DiagramTableEntry>;
  searchIndexChunks: SearchIndexTableEntry[];
  parentChildIndex: Record<string, string[]>;
  stateMachine?: any;
  diagramWorkspace?: any;
}

export interface EntityChunk {
  chunkId: string;
  entities: Record<string, any>;
}

export interface DiagramChunk {
  chunkId: string;
  diagramId: string;
  diagramKind: string;
  coordinates: Record<string, PresentationCoordinates>;
  presentations: Record<string, any>;
  elementIds: string[];
}

export interface SearchIndexChunk {
  chunkId: string;
  tokenMap: Record<string, string[]>;
}

export interface EncodeChunkedOptions {
  projectName?: string;
  schemaVersion?: string;
  repository: SysmlRepository;
  coordinates?: Record<string, PresentationCoordinates>;
  diagramPresentations?: Record<string, any>;
  stateMachine?: any;
  diagramWorkspace?: any;
  chunkSize?: number;
  metadata?: Record<string, any>;
}

export function isChunkedProjectContainer(buffer: ArrayBuffer): boolean {
  if (!buffer || buffer.byteLength < HEADER_SIZE) return false;
  const headerBytes = new Uint8Array(buffer, 0, CONTAINER_MAGIC_BYTES.length);
  for (let i = 0; i < CONTAINER_MAGIC_BYTES.length; i++) {
    if (headerBytes[i] !== CONTAINER_MAGIC_BYTES[i]) return false;
  }
  return true;
}

export function decodeChunkedManifest(buffer: ArrayBuffer): ChunkedContainerManifest {
  if (!isChunkedProjectContainer(buffer)) {
    throw new Error('Not a valid chunked project container');
  }

  const view = new DataView(buffer);
  const version = view.getUint32(16, true);
  if (version !== 1) {
    throw new Error(`Unsupported chunked container version: ${version}`);
  }

  const manifestOffset = view.getUint32(24, true);
  const manifestLength = view.getUint32(28, true);

  if (manifestOffset + manifestLength > buffer.byteLength) {
    throw new Error('Corrupted container: manifest offset exceeds file boundary');
  }

  const manifestBytes = new Uint8Array(buffer, manifestOffset, manifestLength);
  const decoder = new TextDecoder('utf-8');
  const manifestJson = decoder.decode(manifestBytes);
  return JSON.parse(manifestJson) as ChunkedContainerManifest;
}

export function readChunkFromContainer<T>(
  buffer: ArrayBuffer,
  meta: { offset: number; byteLength: number; checksum: string },
): T {
  if (meta.offset + meta.byteLength > buffer.byteLength) {
    throw new Error('Chunk boundaries out of range');
  }

  const chunkBytes = new Uint8Array(buffer, meta.offset, meta.byteLength);
  const actualChecksum = computeCrc32(chunkBytes);
  if (actualChecksum !== meta.checksum) {
    throw new Error(`Chunk checksum verification failed. Expected ${meta.checksum}, got ${actualChecksum}`);
  }

  const decoder = new TextDecoder('utf-8');
  const jsonStr = decoder.decode(chunkBytes);
  return JSON.parse(jsonStr) as T;
}

export function encodeChunkedProject(options: EncodeChunkedOptions): ArrayBuffer {
  const chunkSize = options.chunkSize ?? 500;
  const repo = options.repository;
  const coordinates = options.coordinates ?? {};
  const presentations = options.diagramPresentations ?? {};
  const definitions = repo.definitions ?? {};
  const allIds = Object.keys(definitions);

  const parentChildIndex: Record<string, string[]> = {};
  for (const id of allIds) {
    const def = definitions[id];
    const ownerId = def.ownerId || 'model';
    if (!parentChildIndex[ownerId]) parentChildIndex[ownerId] = [];
    parentChildIndex[ownerId].push(id);
  }

  const entityChunkTable: ChunkTableEntry[] = [];
  const entityToChunk: Record<string, string> = {};
  const chunkPayloads: Uint8Array[] = [];

  const encoder = new TextEncoder();
  let currentOffset = HEADER_SIZE;

  // 1. Partition entities into fixed-size chunks
  let chunkIdx = 0;
  for (let i = 0; i < allIds.length; i += chunkSize) {
    const chunkIds = allIds.slice(i, i + chunkSize);
    const chunkId = `entity_chunk_${chunkIdx++}`;
    const chunkEntities: Record<string, any> = {};

    for (const id of chunkIds) {
      chunkEntities[id] = definitions[id];
      entityToChunk[id] = chunkId;
    }

    const chunkObj: EntityChunk = { chunkId, entities: chunkEntities };
    const chunkBytes = encoder.encode(JSON.stringify(chunkObj));
    const checksum = computeCrc32(chunkBytes);

    entityChunkTable.push({
      chunkId,
      offset: currentOffset,
      byteLength: chunkBytes.byteLength,
      checksum,
      entityIds: chunkIds,
    });

    chunkPayloads.push(chunkBytes);
    currentOffset += chunkBytes.byteLength;
  }

  // 2. Diagram chunks
  const diagramMembershipTable: Record<string, DiagramTableEntry> = {};
  const diagrams = repo.diagrams ?? {};
  const diagramIds = Object.keys(diagrams);
  if (diagramIds.length === 0) {
    // Ensure default diagrams are tracked
    diagramIds.push('diagram-ordinary', 'diagram-stress');
  }

  let diagIdx = 0;
  for (const diagId of diagramIds) {
    const diagChunkId = `diagram_chunk_${diagIdx++}`;
    const diagObj = diagrams[diagId];
    const diagKind = diagObj?.diagramKind ?? 'blockDefinition';
    const diagCoord: Record<string, any> = {};
    const diagPres: Record<string, any> = {};
    const elemIds: string[] = [];

    // Filter relevant presentation items
    for (const id in presentations) {
      if (presentations[id]?.diagramId === diagId || !presentations[id]?.diagramId) {
        diagPres[id] = presentations[id];
      }
    }
    for (const id in coordinates) {
      diagCoord[id] = coordinates[id];
      elemIds.push(id);
    }

    const diagChunk: DiagramChunk = {
      chunkId: diagChunkId,
      diagramId: diagId,
      diagramKind: diagKind,
      coordinates: diagCoord,
      presentations: diagPres,
      elementIds: elemIds,
    };

    const diagBytes = encoder.encode(JSON.stringify(diagChunk));
    const checksum = computeCrc32(diagBytes);

    diagramMembershipTable[diagId] = {
      chunkId: diagChunkId,
      offset: currentOffset,
      byteLength: diagBytes.byteLength,
      checksum,
      diagramId: diagId,
      diagramKind: diagKind,
      elementCount: elemIds.length,
    };

    chunkPayloads.push(diagBytes);
    currentOffset += diagBytes.byteLength;
  }

  // 3. Search index chunks
  const searchIndexChunks: SearchIndexTableEntry[] = [];
  const tokenMap: Record<string, string[]> = {};
  for (const id of allIds) {
    const name = (definitions[id]?.name ?? '').toLowerCase();
    if (name) {
      const parts = name.split(/[^a-z0-9_]+/);
      for (const token of parts) {
        if (token.length >= 2) {
          if (!tokenMap[token]) tokenMap[token] = [];
          if (tokenMap[token].length < 100) {
            tokenMap[token].push(id);
          }
        }
      }
    }
  }

  const searchChunkId = 'search_chunk_0';
  const searchChunk: SearchIndexChunk = { chunkId: searchChunkId, tokenMap };
  const searchBytes = encoder.encode(JSON.stringify(searchChunk));
  const searchChecksum = computeCrc32(searchBytes);

  searchIndexChunks.push({
    chunkId: searchChunkId,
    offset: currentOffset,
    byteLength: searchBytes.byteLength,
    checksum: searchChecksum,
    tokens: Object.keys(tokenMap).slice(0, 500),
  });

  chunkPayloads.push(searchBytes);
  currentOffset += searchBytes.byteLength;

  // 4. Manifest
  const manifestOffset = currentOffset;
  const manifest: ChunkedContainerManifest = {
    format: 'adia-chunked-container',
    version: 1,
    schemaVersion: options.schemaVersion ?? '1.0',
    projectName: options.projectName ?? 'Untitled Project',
    metadata: options.metadata,
    totalEntities: allIds.length,
    entityChunkTable,
    entityToChunk,
    diagramMembershipTable,
    searchIndexChunks,
    parentChildIndex,
    stateMachine: options.stateMachine,
    diagramWorkspace: options.diagramWorkspace,
  };

  const manifestBytes = encoder.encode(JSON.stringify(manifest));
  const manifestLength = manifestBytes.byteLength;
  const totalBufferSize = manifestOffset + manifestLength;

  // 5. Assemble container buffer
  const finalBuffer = new ArrayBuffer(totalBufferSize);
  const finalBytes = new Uint8Array(finalBuffer);
  const view = new DataView(finalBuffer);

  // Write header: Magic (16 bytes)
  finalBytes.set(CONTAINER_MAGIC_BYTES, 0);
  // Version: 1 (uint32 at 16)
  view.setUint32(16, 1, true);
  // Flags: 0 (uint32 at 20)
  view.setUint32(20, 0, true);
  // Manifest offset (uint32 at 24)
  view.setUint32(24, manifestOffset, true);
  // Manifest length (uint32 at 28)
  view.setUint32(28, manifestLength, true);

  // Write chunks
  let writeOffset = HEADER_SIZE;
  for (const chunk of chunkPayloads) {
    finalBytes.set(chunk, writeOffset);
    writeOffset += chunk.byteLength;
  }

  // Write manifest
  finalBytes.set(manifestBytes, manifestOffset);

  return finalBuffer;
}

export function createChunkedProjectFromLegacyJson(
  buffer: ArrayBuffer,
  options?: Partial<EncodeChunkedOptions>,
): ArrayBuffer {
  const decoder = new TextDecoder('utf-8');
  const jsonStr = decoder.decode(buffer);
  const parsed = JSON.parse(jsonStr);

  const loaded = loadCanonicalSysmlProject(parsed);
  return encodeChunkedProject({
    projectName: parsed.projectName ?? 'Migrated Project',
    schemaVersion: parsed.version ?? '1.0',
    repository: loaded.repository,
    coordinates: loaded.coordinates,
    diagramPresentations: loaded.diagramPresentations,
    stateMachine: parsed.stateMachine,
    diagramWorkspace: parsed.diagramWorkspace,
    chunkSize: options?.chunkSize ?? 500,
    metadata: parsed.metadata,
  });
}
