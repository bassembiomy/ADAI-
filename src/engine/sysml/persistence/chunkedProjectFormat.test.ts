import { describe, it, expect } from 'vitest';
import {
  encodeChunkedProject,
  decodeChunkedManifest,
  readChunkFromContainer,
  isChunkedProjectContainer,
  createChunkedProjectFromLegacyJson,
  type ChunkedContainerManifest,
  type EntityChunk,
} from './chunkedProjectFormat';
import { generateScalabilityFixture } from '../largeModelGenerator';
import { buildCanonicalSysmlProjectPayload, createSysmlGatewayState } from '../../../services/sysmlCommandGateway';

describe('Chunked Project Format', () => {
  it('detects chunked format vs legacy JSON format', () => {
    const legacyJson = JSON.stringify({ version: '1.0', projectName: 'Legacy' });
    const legacyBuffer = new TextEncoder().encode(legacyJson).buffer;
    expect(isChunkedProjectContainer(legacyBuffer)).toBe(false);

    const fixture = generateScalabilityFixture({ semanticCount: 100, seed: 1 });
    const chunkedBuffer = encodeChunkedProject({
      projectName: 'Test Chunked',
      schemaVersion: '1.0',
      repository: fixture.repository,
      coordinates: fixture.coordinates,
      diagramPresentations: fixture.diagramPresentations,
      chunkSize: 50,
    });
    expect(isChunkedProjectContainer(chunkedBuffer)).toBe(true);
  });

  it('imports old JSON .adia payload transparently into chunked structure', () => {
    const fixture = generateScalabilityFixture({ semanticCount: 200, seed: 2 });
    const legacyPayload = buildCanonicalSysmlProjectPayload(
      createSysmlGatewayState(fixture.repository, fixture.coordinates, fixture.diagramPresentations),
      { version: '1.0', projectName: 'Legacy Import Test' },
    );
    const legacyBuffer = new TextEncoder().encode(JSON.stringify(legacyPayload)).buffer;

    const chunked = createChunkedProjectFromLegacyJson(legacyBuffer, { chunkSize: 50 });
    expect(chunked).toBeDefined();
    expect(isChunkedProjectContainer(chunked)).toBe(true);

    const manifest = decodeChunkedManifest(chunked);
    expect(manifest.format).toBe('adia-chunked-container');
    expect(manifest.projectName).toBe('Legacy Import Test');
    expect(manifest.entityChunkTable.length).toBeGreaterThan(0);
    expect(manifest.totalEntities).toBe(Object.keys(fixture.repository.definitions).length);
  });

  it('fails fast on chunk checksum tampering / corruption', () => {
    const fixture = generateScalabilityFixture({ semanticCount: 100, seed: 3 });
    const buffer = encodeChunkedProject({
      projectName: 'Corruptible Project',
      schemaVersion: '1.0',
      repository: fixture.repository,
      coordinates: fixture.coordinates,
      diagramPresentations: fixture.diagramPresentations,
      chunkSize: 50,
    });

    const manifest = decodeChunkedManifest(buffer);
    const firstChunk = manifest.entityChunkTable[0];
    expect(firstChunk).toBeDefined();

    // Tamper with the raw bytes of the first chunk in the buffer
    const uint8 = new Uint8Array(buffer);
    uint8[firstChunk.offset + 5] ^= 0xff; // flip bits

    expect(() => {
      readChunkFromContainer<EntityChunk>(buffer, firstChunk);
    }).toThrow(/checksum/i);
  });

  it('enables random access to entities without reading unrelated chunks', () => {
    const fixture = generateScalabilityFixture({ semanticCount: 500, seed: 4 });
    const buffer = encodeChunkedProject({
      projectName: 'Random Access Project',
      schemaVersion: '1.0',
      repository: fixture.repository,
      coordinates: fixture.coordinates,
      diagramPresentations: fixture.diagramPresentations,
      chunkSize: 20,
    });

    const manifest = decodeChunkedManifest(buffer);
    expect(manifest.entityChunkTable.length).toBeGreaterThanOrEqual(5);

    // Pick an entity in the 4th chunk
    const targetChunkMeta = manifest.entityChunkTable[3];
    const targetEntityId = targetChunkMeta.entityIds[0];

    // Read only that chunk
    const chunk = readChunkFromContainer<EntityChunk>(buffer, targetChunkMeta);
    expect(chunk.entities[targetEntityId]).toBeDefined();
    expect(chunk.entities[targetEntityId].id).toBe(targetEntityId);

    // Ensure entities from other chunks are not in this chunk
    const otherChunkMeta = manifest.entityChunkTable[0];
    const otherEntityId = otherChunkMeta.entityIds[0];
    expect(chunk.entities[otherEntityId]).toBeUndefined();
  });
});
