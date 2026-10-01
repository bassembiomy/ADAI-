import { describe, expect, it } from 'vitest';
import {
  migrateContextualEditingPayload,
  CURRENT_CONTEXTUAL_SCHEMA_VERSION,
  type PersistedSysmlPayload,
} from './migrateContextualEditing';
import { loadCanonicalSysmlProject } from '../../../services/sysmlCommandGateway';

describe('migrateContextualEditingPayload', () => {
  it('upgrades legacy v2/v3 payload to version 4 with seeded default diagrams and root model', () => {
    const legacyPayload: PersistedSysmlPayload = {
      format: 'ADIA-SysML',
      schemaVersion: 2,
      projectName: 'Legacy Test Project',
      version: '1.0.0',
      sysmlRepository: {
        schemaVersion: 2,
        profileId: 'OMG-SysML-1.6-ADIA',
        definitions: {
          b1: {
            id: 'b1',
            kind: 'block',
            name: 'Battery',
            namespace: ['Model'],
            properties: [],
            operations: [],
            ports: [],
          },
        },
      },
    };

    const result = migrateContextualEditingPayload(legacyPayload);
    expect(result.migrated).toBe(true);
    expect(result.payload.schemaVersion).toBe(CURRENT_CONTEXTUAL_SCHEMA_VERSION);

    // Verify it loads with loadCanonicalSysmlProject
    const loaded = loadCanonicalSysmlProject(result.payload as Record<string, unknown>);
    expect(loaded.valid).toBe(true);
    expect(loaded.repository.packages.model).toBeDefined();
    expect(loaded.repository.definitions.b1).toBeDefined();
    // Default diagrams seeded
    expect(loaded.repository.diagrams['adia-default-bdd']).toBeDefined();
    expect(loaded.repository.diagrams['adia-default-requirements']).toBeDefined();
  });

  it('anchors dangling element ownerIds to model without inventing phantom elements', () => {
    const payloadWithDanglingOwner: PersistedSysmlPayload = {
      schemaVersion: 3,
      sysmlRepository: {
        schemaVersion: 3,
        profileId: 'OMG-SysML-1.6-ADIA',
        packages: {
          model: { id: 'model', kind: 'package', name: 'Model', namespace: [], ownerId: '' },
        },
        definitions: {
          b_orphan: {
            id: 'b_orphan',
            kind: 'block',
            name: 'OrphanBlock',
            ownerId: 'non-existent-pkg-999',
            namespace: [],
            properties: [],
            operations: [],
            ports: [],
          },
        },
      },
    };

    const result = migrateContextualEditingPayload(payloadWithDanglingOwner);
    expect(result.diagnostics.some(d => d.code === 'DANGLING_OWNER_REPAIRED' && d.elementId === 'b_orphan')).toBe(true);

    const loaded = loadCanonicalSysmlProject(result.payload as Record<string, unknown>);
    expect(loaded.repository.definitions.b_orphan.ownerId).toBe('model');
  });

  it('leaves already up-to-date v4 payloads unchanged', () => {
    const v4Payload: PersistedSysmlPayload = {
      schemaVersion: 4,
      sysmlRepository: JSON.stringify({
        schemaVersion: 3,
        profileId: 'OMG-SysML-1.6-ADIA',
        packages: {
          model: { id: 'model', kind: 'package', name: 'Model', namespace: [], ownerId: '' },
        },
        diagrams: {
          'adia-default-bdd': { id: 'adia-default-bdd', name: 'Main SysML BDD', diagramKind: 'bdd', ownerId: 'model', kind: 'diagram', namespace: ['model'] },
        },
        definitions: {},
      }),
    };

    const result = migrateContextualEditingPayload(v4Payload);
    expect(result.migrated).toBe(false);
  });

  it('automatically migrates legacy v2/v3 payload inside loadCanonicalSysmlProject without manual migration call', () => {
    const legacyPayload = {
      format: 'ADIA-SysML',
      schemaVersion: 2,
      projectName: 'Direct Load Project',
      sysmlRepository: {
        schemaVersion: 2,
        profileId: 'OMG-SysML-1.6-ADIA',
        definitions: {
          b1: {
            id: 'b1',
            kind: 'block',
            name: 'Battery',
            namespace: ['Model'],
            ownerId: 'non-existent-owner',
            properties: [],
            operations: [],
            ports: [],
          },
        },
      },
    };

    const loaded = loadCanonicalSysmlProject(legacyPayload as Record<string, unknown>);
    expect(loaded.valid).toBe(true);
    expect(loaded.repository.packages.model).toBeDefined();
    expect(loaded.repository.definitions.b1.ownerId).toBe('model');
    expect(loaded.diagnostics.some(d => d.message.includes('DANGLING_OWNER_REPAIRED') || d.elementId === 'b1')).toBe(true);
  });
});

