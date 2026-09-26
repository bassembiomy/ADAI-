/**
 * src/agent/toolAdapters/adiaProjectAdapter.test.ts
 *
 * Tests for createReportDelegate, createProjectDelegate, and AdiaProjectAdapter.
 *
 * Requirements covered:
 * - Invokes real DOCX and PDF exporters from src/features/reporting/
 * - Supports templates ('statemachine', 'motordrive', default architecture)
 * - Verifies artifact exists, is non-empty, and computes SHA-256 content hash
 * - Returns verified ReportArtifact with path, format, hash, snapshotId, evidenceIds
 * - Fails closed when export fails, file verification fails, or format is unsupported
 * - AdiaProjectAdapter fails closed when delegate is unavailable
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import JSZip from 'jszip';
import {
  createReportDelegate,
  createProjectDelegate,
  AdiaProjectAdapter,
  computeSha256,
  ReportAdapterError,
} from './adiaProjectAdapter';
import type { ReportDocument } from '../../features/reporting/reportDocumentModel';

describe('computeSha256', () => {
  it('computes consistent 64-character hex hash for bytes', async () => {
    const data = new TextEncoder().encode('ADIA verification data');
    const hash1 = await computeSha256(data);
    const hash2 = await computeSha256(data);

    expect(hash1).toHaveLength(64);
    expect(hash1).toBe(hash2);
  });

  it('produces different hashes for different data', async () => {
    const data1 = new TextEncoder().encode('dataset-alpha');
    const data2 = new TextEncoder().encode('dataset-beta');
    const hash1 = await computeSha256(data1);
    const hash2 = await computeSha256(data2);

    expect(hash1).not.toBe(hash2);
  });
});

describe('createReportDelegate', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'adia-report-test-'));
  });

  afterEach(async () => {
    try {
      await fs.promises.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Cleanup best effort
    }
  });

  describe('Real DOCX export and verification', () => {
    it('generates, writes, and verifies a real DOCX report file', async () => {
      const delegate = createReportDelegate({
        outputDir: tempDir,
        getProjectData: () => ({
          projectId: 'proj-bldc',
          projectName: 'BLDC Fan Controller',
          modelRevision: 3,
        }),
      });

      const artifact = await delegate.generateReport({
        projectId: 'proj-bldc',
        format: 'docx',
        evidenceIds: ['EV-001', 'EV-002'],
      });

      expect(artifact.format).toBe('docx');
      expect(artifact.path).toContain(tempDir);
      expect(artifact.sizeBytes).toBeGreaterThan(1000);
      expect(artifact.contentHash).toHaveLength(64);
      expect(artifact.evidenceIds).toEqual(['EV-001', 'EV-002']);
      expect(artifact.snapshotId).toContain('proj-bldc');

      // Verify the file really exists on disk
      const fileBuffer = await fs.promises.readFile(artifact.path);
      expect(fileBuffer.byteLength).toBe(artifact.sizeBytes);

      // Verify it is a valid zip/docx archive
      const zip = await JSZip.loadAsync(fileBuffer);
      const xml = await zip.file('word/document.xml')?.async('string');
      expect(xml).toBeDefined();
      expect(xml).toContain('BLDC Fan Controller');
    });

    it('supports statemachine template and includes SM verification data', async () => {
      const delegate = createReportDelegate({
        outputDir: tempDir,
        getProjectData: () => ({
          projectId: 'sm-heater',
          projectName: 'Heater Safety SM',
          modelRevision: 1,
        }),
      });

      const artifact = await delegate.generateReport({
        projectId: 'sm-heater',
        format: 'docx',
        template: 'statemachine',
        evidenceIds: ['EV-SM-100'],
      });

      expect(artifact.format).toBe('docx');
      expect(artifact.path).toContain('statemachine');

      const fileBuffer = await fs.promises.readFile(artifact.path);
      const zip = await JSZip.loadAsync(fileBuffer);
      const xml = await zip.file('word/document.xml')?.async('string');
      expect(xml).toContain('State Machine Suite');
    });
  });

  describe('Real PDF export and verification', () => {
    it('generates, writes, and verifies a real PDF report file', async () => {
      const delegate = createReportDelegate({
        outputDir: tempDir,
        getProjectData: () => ({
          projectId: 'proj-airfryer',
          projectName: 'Smart Air Fryer',
          modelRevision: 5,
        }),
      });

      const artifact = await delegate.generateReport({
        projectId: 'proj-airfryer',
        format: 'pdf',
        evidenceIds: ['EV-THERMAL-1'],
      });

      expect(artifact.format).toBe('pdf');
      expect(artifact.path).toContain('.pdf');
      expect(artifact.sizeBytes).toBeGreaterThan(500);
      expect(artifact.contentHash).toHaveLength(64);

      // Verify the file on disk starts with PDF magic bytes (%PDF)
      const fileBuffer = await fs.promises.readFile(artifact.path);
      const magic = fileBuffer.subarray(0, 5).toString();
      expect(magic).toBe('%PDF-');
    });
  });

  describe('Error and failure gating', () => {
    it('rejects unsupported report formats with ReportAdapterError', async () => {
      const delegate = createReportDelegate({ outputDir: tempDir });

      await expect(
        delegate.generateReport({
          projectId: 'proj-test',
          format: 'html' as any,
          evidenceIds: [],
        }),
      ).rejects.toThrow(/unsupported report format/i);
    });

    it('rejects empty projectId', async () => {
      const delegate = createReportDelegate({ outputDir: tempDir });

      await expect(
        delegate.generateReport({
          projectId: '',
          format: 'docx',
          evidenceIds: [],
        }),
      ).rejects.toThrow(/valid projectId/i);
    });

    it('fails closed when the exporter throws', async () => {
      const delegate = createReportDelegate({
        outputDir: tempDir,
        docxExporter: async () => {
          throw new Error('Disk out of memory during docx generation');
        },
      });

      await expect(
        delegate.generateReport({
          projectId: 'proj-fail',
          format: 'docx',
          evidenceIds: [],
        }),
      ).rejects.toThrow(/Disk out of memory/);
    });

    it('fails closed when exporter produces empty buffer', async () => {
      const delegate = createReportDelegate({
        outputDir: tempDir,
        docxExporter: async () => new Uint8Array(0),
      });

      await expect(
        delegate.generateReport({
          projectId: 'proj-empty',
          format: 'docx',
          evidenceIds: [],
        }),
      ).rejects.toThrow(/empty buffer/i);
    });

    it('fails closed when artifact verification detects missing or zero-byte file', async () => {
      const delegate = createReportDelegate({
        outputDir: tempDir,
        writeFile: async () => {
          // Intentionally do not write anything
        },
        statFile: async () => ({ size: 0, exists: false }),
      });

      await expect(
        delegate.generateReport({
          projectId: 'proj-missing',
          format: 'docx',
          evidenceIds: [],
        }),
      ).rejects.toThrow(/verification failed/i);
    });
  });
});

describe('createProjectDelegate', () => {
  it('returns project ID, active workspace, and model snapshot', async () => {
    const refreshSpy = vi.fn().mockResolvedValue(undefined);
    const delegate = createProjectDelegate({
      getProjectId: () => 'proj-active-1',
      getActiveWorkspace: () => 'sysml',
      getRevision: () => 7,
      onRefreshPersistence: refreshSpy,
    });

    expect(delegate.getProjectId()).toBe('proj-active-1');
    expect(delegate.getActiveWorkspace()).toBe('sysml');

    const snapshot = await delegate.getModelSnapshot();
    expect(snapshot.projectId).toBe('proj-active-1');
    expect(snapshot.workspace).toBe('sysml');
    expect(snapshot.revision).toBe(7);
    expect(snapshot.snapshotId).toContain('proj-active-1');
    expect(snapshot.capturedAt).toBeGreaterThan(0);

    await delegate.refreshPersistence();
    expect(refreshSpy).toHaveBeenCalledTimes(1);
  });
});

describe('AdiaProjectAdapter', () => {
  describe('when reportDelegate is unavailable (fails closed)', () => {
    it('reports isAvailable() as false', () => {
      const adapter = new AdiaProjectAdapter();
      expect(adapter.isAvailable()).toBe(false);
    });

    it('inspect indicates reportingAvailable: false', async () => {
      const adapter = new AdiaProjectAdapter();
      const result = await adapter.inspect();
      expect(result.success).toBe(true);
      expect(result.data.reportingAvailable).toBe(false);
    });

    it('execute fails closed without generating artifacts', async () => {
      const adapter = new AdiaProjectAdapter();
      const result = await adapter.execute({
        kind: 'generate_report',
        params: { format: 'docx' },
      });

      expect(result.success).toBe(false);
      expect(result.changedArtifacts).toEqual([]);
      expect(result.error).toMatch(/unavailable/i);
    });
  });

  describe('when reportDelegate is connected', () => {
    let tempDir: string;

    beforeEach(async () => {
      tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'adia-adapter-test-'));
    });

    afterEach(async () => {
      try {
        await fs.promises.rm(tempDir, { recursive: true, force: true });
      } catch {
        // Best effort
      }
    });

    it('reports isAvailable() as true and inspects live project details', async () => {
      const reportDelegate = createReportDelegate({ outputDir: tempDir });
      const projectDelegate = createProjectDelegate({
        getProjectId: () => 'proj-demo',
        getActiveWorkspace: () => 'xbridges',
        getRevision: () => 2,
      });
      const adapter = new AdiaProjectAdapter(reportDelegate, projectDelegate);

      expect(adapter.isAvailable()).toBe(true);

      const inspectResult = await adapter.inspect();
      expect(inspectResult.success).toBe(true);
      expect(inspectResult.data.projectId).toBe('proj-demo');
      expect(inspectResult.data.activeWorkspace).toBe('xbridges');
      expect(inspectResult.data.reportingAvailable).toBe(true);
    });

    it('executes generate_report and returns verified ToolResult evidence', async () => {
      const reportDelegate = createReportDelegate({
        outputDir: tempDir,
        getProjectData: () => ({
          projectId: 'proj-approved',
          projectName: 'Validated Controller',
          modelRevision: 4,
        }),
      });
      const adapter = new AdiaProjectAdapter(reportDelegate);

      const result = await adapter.execute({
        id: 'act-report-1',
        kind: 'generate_report',
        projectId: 'proj-approved',
        params: {
          format: 'docx',
          evidenceIds: ['EV-1', 'EV-2'],
        },
      });

      expect(result.success).toBe(true);
      expect(result.changedArtifacts).toHaveLength(1);
      expect(result.evidence.contentHash).toBeDefined();
      expect(result.evidence.sizeBytes).toBeGreaterThan(1000);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);

      // Verify file on disk exists and matches hash
      const savedBytes = await fs.promises.readFile(result.changedArtifacts[0]);
      const recomputedHash = await computeSha256(savedBytes);
      expect(recomputedHash).toBe(result.evidence.contentHash);
    });

    it('fails closed when execution encounters an error in reporting pipeline', async () => {
      const reportDelegate = createReportDelegate({
        outputDir: tempDir,
        docxExporter: async () => {
          throw new Error('Pipeline exporter crashed');
        },
      });
      const adapter = new AdiaProjectAdapter(reportDelegate);

      const result = await adapter.execute({
        kind: 'generate_report',
        projectId: 'proj-crash',
        params: { format: 'docx' },
      });

      expect(result.success).toBe(false);
      expect(result.changedArtifacts).toEqual([]);
      expect(result.error).toMatch(/Pipeline exporter crashed/);
    });

    it('rejects unsupported action kind', async () => {
      const reportDelegate = createReportDelegate({ outputDir: tempDir });
      const adapter = new AdiaProjectAdapter(reportDelegate);

      const result = await adapter.execute({
        kind: 'unknown_action',
      });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/unsupported/i);
    });
  });
});
