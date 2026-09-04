import { describe, it, expect } from 'vitest';
import {
  exportProjectZip,
  importProjectZip,
  resolvePersistedVerification,
  takeProjectSnapshot,
  detectSnapshotDiff,
  type OpmProjectPayload,
} from '../persistence';
import { compileExecutableOpm } from '../pipeline';
import { makeApplianceFixture } from '../fixtures';
import JSZip from 'jszip';

describe('OPM project persistence and ZIP roundtrip', () => {
  const fixture = makeApplianceFixture();
  const projectWithExecution: OpmProjectPayload = {
    projectName: 'SmartBoiler',
    entropyNodes: fixture.nodes,
    entropyEdges: fixture.edges,
    entropyExecutionConfig: fixture.config,
  };

  it('preserves executionConfig in project roundtrip', async () => {
    const zipBlob = await exportProjectZip(projectWithExecution);
    const imported = await importProjectZip(zipBlob);

    expect(imported.entropyExecutionConfig).toEqual(projectWithExecution.entropyExecutionConfig);
    expect(imported.entropyNodes).toHaveLength(projectWithExecution.entropyNodes.length);
    expect(imported.entropyEdges).toHaveLength(projectWithExecution.entropyEdges.length);
  });

  it('includes generated C artifacts inside c_artifacts/ folder in export ZIP', async () => {
    const zipBlob = await exportProjectZip(projectWithExecution);
    const zip = await JSZip.loadAsync(zipBlob);

    expect(zip.file('entropy.json')).toBeDefined();
    expect(zip.file('adia_project_unified.json')).toBeDefined();
    expect(zip.file('c_artifacts/opm_runtime.h')).toBeDefined();
    expect(zip.file('c_artifacts/opm_model.c')).toBeDefined();
    expect(zip.file('c_artifacts/opm_manifest.json')).toBeDefined();
  });

  it('detects snapshots when executionConfig changes', () => {    const state1 = {
      projectName: 'Test',
      entropyNodes: fixture.nodes,
      entropyEdges: fixture.edges,
      entropyExecutionConfig: fixture.config,
    };

    const modifiedConfig = {
      ...fixture.config,
      settings: { ...fixture.config.settings, tickMs: 25 },
    };

    const state2WithModifiedConfig = {
      ...state1,
      entropyExecutionConfig: modifiedConfig,
    };

    const s1 = takeProjectSnapshot(state1);
    const s2 = takeProjectSnapshot(state2WithModifiedConfig);

    expect(detectSnapshotDiff(s1, s2).changed).toBe(true);
    expect(detectSnapshotDiff(s1, s1).changed).toBe(false);
  });

  it('persists execution config plus optional verification metadata', async () => {
    const withVerification: OpmProjectPayload = {
      ...projectWithExecution,
      opmVerification: {
        fingerprint: 'abc123',
        verifiedAt: '2026-09-03T00:00:00.000Z',
        toolchainVersion: '1.0.0',
        status: 'verified',
      },
    };
    const zipBlob = await exportProjectZip(withVerification);
    const imported = await importProjectZip(zipBlob);

    expect(imported.entropyExecutionConfig).toEqual(projectWithExecution.entropyExecutionConfig);
    expect(imported.opmVerification).toEqual(withVerification.opmVerification);
  });

  it('regenerates artifacts after load and never trusts persisted verified status', async () => {
    const compRes = compileExecutableOpm(fixture.nodes as never, fixture.edges as never, fixture.config);
    if (!compRes.model) throw new Error('fixture must compile');
    const persisted = {
      fingerprint: compRes.model.fingerprint,
      verifiedAt: new Date().toISOString(),
      toolchainVersion: '1.0.0',
      status: 'verified' as const,
    };

    const zipBlob = await exportProjectZip({ ...projectWithExecution, opmVerification: persisted });
    const imported = await importProjectZip(zipBlob);

    const resolved = resolvePersistedVerification(
      imported.entropyNodes,
      imported.entropyEdges,
      imported.entropyExecutionConfig,
      imported.opmVerification,
    );
    // Freshly regenerated from the loaded model — never the archive copy.
    expect(resolved.files.length).toBeGreaterThan(0);
    expect(resolved.manifest?.fingerprint).toBe(compRes.model.fingerprint);
    // Fingerprints match, yet trust is never granted: re-verify is required.
    expect(resolved.fingerprintsMatch).toBe(true);
    expect(resolved.trusted).toBe(false);
    expect(resolved.status).toBe('stale');
  });

  it('marks tampered models as mismatched and still untrusted', () => {
    const compRes = compileExecutableOpm(fixture.nodes as never, fixture.edges as never, fixture.config);
    if (!compRes.model) throw new Error('fixture must compile');
    const tamperedNodes = fixture.nodes.map((n) =>
      n.id === 'proc_heat'
        ? { ...n, data: { ...n.data, processExecution: { ...n.data.processExecution!, guard: 'temp < 1.0' } } }
        : n,
    );
    const resolved = resolvePersistedVerification(tamperedNodes, fixture.edges, fixture.config, {
      fingerprint: compRes.model.fingerprint,
      verifiedAt: new Date().toISOString(),
      toolchainVersion: '1.0.0',
      status: 'verified',
    });
    expect(resolved.fingerprintsMatch).toBe(false);
    expect(resolved.trusted).toBe(false);
    expect(resolved.status).toBe('stale');
  });
});

