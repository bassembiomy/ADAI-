import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ConceptGraphStore } from './conceptGraphStore';
import {
  ConceptRelationship,
  computeRelationshipHash
} from '../contracts/conceptGraph';

describe('ConceptGraphStore', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'adia-test-graph-'));
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('stores and retrieves relationships with filtering by source/target and relationType', async () => {
    const store = new ConceptGraphStore({ storageDir: tempDir });
    await store.init();

    const rel1: ConceptRelationship = {
      schemaVersion: '1.0.0',
      id: 'rel.controller.controls.inverter',
      sourceConceptId: 'concept.control.foc',
      relationType: 'controls',
      targetConceptId: 'concept.electrical.inverter',
      conditions: [],
      priority: 1,
      confidence: 0.99,
      verified: true,
      sourceId: 'src.paper',
      documentId: 'doc.1',
      sectionLocator: 'sec 2',
      contentHash: ''
    };
    rel1.contentHash = computeRelationshipHash(rel1);

    const rel2: ConceptRelationship = {
      schemaVersion: '1.0.0',
      id: 'rel.motor.requires.inverter',
      sourceConceptId: 'concept.electromechanical.bldc',
      relationType: 'requires',
      targetConceptId: 'concept.electrical.inverter',
      conditions: [],
      priority: 2,
      confidence: 0.95,
      verified: true,
      sourceId: 'src.doc',
      documentId: 'doc.2',
      sectionLocator: 'sec 3',
      contentHash: ''
    };
    rel2.contentHash = computeRelationshipHash(rel2);

    await store.put(rel1);
    await store.put(rel2);

    expect(await store.has('rel.controller.controls.inverter')).toBe(true);
    expect(await store.has('rel.motor.requires.inverter')).toBe(true);

    const bySource = await store.list({ sourceConceptId: 'concept.control.foc' });
    expect(bySource).toHaveLength(1);
    expect(bySource[0].id).toBe('rel.controller.controls.inverter');

    const byTarget = await store.list({ targetConceptId: 'concept.electrical.inverter' });
    expect(byTarget).toHaveLength(2);

    const byType = await store.list({ relationType: 'requires' });
    expect(byType).toHaveLength(1);
    expect(byType[0].id).toBe('rel.motor.requires.inverter');
  });

  it('fails closed on path traversal attempt in relationship ID', async () => {
    const store = new ConceptGraphStore({ storageDir: tempDir });
    await store.init();

    await expect(store.get('../malicious_rel')).rejects.toThrow(/invalid id|path traversal/i);
  });
});
