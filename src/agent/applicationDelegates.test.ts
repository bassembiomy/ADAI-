/**
 * src/agent/applicationDelegates.test.ts
 *
 * Unit tests for the application delegate type guards and DelegateUnavailableError.
 * These tests verify the fail-closed contract: missing mutation delegates must be
 * detected before any mutation attempt.
 */

import { describe, it, expect } from 'vitest';
import {
  isMutationReady,
  assertMutationReady,
  DelegateUnavailableError,
  type AgentApplicationDelegates,
  type ProjectApplicationDelegate,
  type XbridgesApplicationDelegate,
  type SysmlApplicationDelegate,
  type ReportApplicationDelegate,
  type XbridgesNode,
  type XbridgesEdge,
  type SysmlSnapshot,
  type SysmlAgentCommand,
  type SysmlCommandResult,
  type SysmlValidationResult,
  type ReportSnapshot,
  type ReportArtifact,
  type ProjectModelSnapshot,
} from './applicationDelegates';

// ---------------------------------------------------------------------------
// Helpers: minimal typed mock objects for structural type checking
// ---------------------------------------------------------------------------

const mockProject: ProjectApplicationDelegate = {
  getProjectId: () => 'proj-test-001',
  getActiveWorkspace: () => 'xbridges',
  getModelSnapshot: async (): Promise<ProjectModelSnapshot> => ({
    projectId: 'proj-test-001',
    workspace: 'xbridges',
    revision: 1,
    snapshotId: 'snap-abc',
    capturedAt: Date.now(),
  }),
  refreshPersistence: async () => {},
};

const mockXbridges: XbridgesApplicationDelegate = {
  getNodes: async (): Promise<readonly XbridgesNode[]> => [],
  getEdges: async (): Promise<readonly XbridgesEdge[]> => [],
  addBlock: async (type, params): Promise<XbridgesNode> => ({
    id: 'node-1',
    type,
    data: params,
  }),
  connectPorts: async (srcId, srcPort, tgtId, tgtPort): Promise<XbridgesEdge> => ({
    id: 'edge-1',
    source: srcId,
    target: tgtId,
    sourceHandle: srcPort,
    targetHandle: tgtPort,
  }),
  updateParameters: async (nodeId, params): Promise<XbridgesNode> => ({
    id: nodeId,
    type: 'updated',
    data: params,
  }),
  removeBlock: async (nodeId) => ({ removedNodeId: nodeId, removedEdgeIds: [] }),
  moveBlock: async (nodeId, pos) => ({ id: nodeId, type: 'block', data: {}, position: pos }),
  renameBlock: async (_nodeId, newId) => ({ id: newId, type: 'block', data: {} }),
  disconnectPorts: async () => ({ disconnectedEdgeId: 'edge-1' }),
  validate: async () => ({ valid: true, diagnostics: [] }),
  save: async () => {},
  saveAndReadBack: async () => ({ nodes: [], edges: [], fingerprint: 'fp_test' }),
  getRevisionFingerprint: async () => 'fp_test',
};

const mockSysml: SysmlApplicationDelegate = {
  inspect: async (): Promise<SysmlSnapshot> => ({
    revision: 5,
    blockCount: 3,
    requirementCount: 2,
  }),
  executeCommand: async (cmd: SysmlAgentCommand): Promise<SysmlCommandResult> => ({
    success: true,
    newRevision: cmd.revision + 1,
    changedElementIds: ['block-123'],
    diagnostics: [],
  }),
  validate: async (): Promise<SysmlValidationResult> => ({
    valid: true,
    diagnostics: [],
  }),
};

const mockReport: ReportApplicationDelegate = {
  generateReport: async (snapshot: ReportSnapshot): Promise<ReportArtifact> => ({
    path: `/tmp/${snapshot.projectId}.${snapshot.format}`,
    format: snapshot.format,
    contentHash: 'sha256-abc123',
    snapshotId: 'snap-abc',
    evidenceIds: snapshot.evidenceIds,
    sizeBytes: 1024,
  }),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('isMutationReady', () => {
  it('returns true when xbridges delegate is present', () => {
    const delegates: AgentApplicationDelegates = {
      project: mockProject,
      xbridges: mockXbridges,
    };
    expect(isMutationReady(delegates, 'xbridges')).toBe(true);
  });

  it('returns false when xbridges delegate is absent', () => {
    const delegates: AgentApplicationDelegates = {
      project: mockProject,
      // xbridges intentionally omitted
    };
    expect(isMutationReady(delegates, 'xbridges')).toBe(false);
  });

  it('returns true when sysml delegate is present', () => {
    const delegates: AgentApplicationDelegates = {
      project: mockProject,
      sysml: mockSysml,
    };
    expect(isMutationReady(delegates, 'sysml')).toBe(true);
  });

  it('returns false when sysml delegate is absent', () => {
    const delegates: AgentApplicationDelegates = {
      project: mockProject,
    };
    expect(isMutationReady(delegates, 'sysml')).toBe(false);
  });

  it('returns true when report delegate is present', () => {
    const delegates: AgentApplicationDelegates = {
      project: mockProject,
      report: mockReport,
    };
    expect(isMutationReady(delegates, 'report')).toBe(true);
  });

  it('returns false when report delegate is absent', () => {
    const delegates: AgentApplicationDelegates = {
      project: mockProject,
    };
    expect(isMutationReady(delegates, 'report')).toBe(false);
  });
});

describe('assertMutationReady', () => {
  it('throws DelegateUnavailableError with correct workspace when xbridges absent', () => {
    const delegates: AgentApplicationDelegates = { project: mockProject };
    expect(() => assertMutationReady(delegates, 'xbridges')).toThrowError(DelegateUnavailableError);
    try {
      assertMutationReady(delegates, 'xbridges');
    } catch (err) {
      expect(err).toBeInstanceOf(DelegateUnavailableError);
      expect((err as DelegateUnavailableError).workspace).toBe('xbridges');
    }
  });

  it('throws DelegateUnavailableError with correct workspace when sysml absent', () => {
    const delegates: AgentApplicationDelegates = { project: mockProject };
    try {
      assertMutationReady(delegates, 'sysml');
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(DelegateUnavailableError);
      expect((err as DelegateUnavailableError).workspace).toBe('sysml');
    }
  });

  it('throws DelegateUnavailableError with correct workspace when report absent', () => {
    const delegates: AgentApplicationDelegates = { project: mockProject };
    try {
      assertMutationReady(delegates, 'report');
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(DelegateUnavailableError);
      expect((err as DelegateUnavailableError).workspace).toBe('report');
    }
  });

  it('does NOT throw when xbridges delegate is present', () => {
    const delegates: AgentApplicationDelegates = {
      project: mockProject,
      xbridges: mockXbridges,
    };
    expect(() => assertMutationReady(delegates, 'xbridges')).not.toThrow();
  });

  it('does NOT throw when sysml delegate is present', () => {
    const delegates: AgentApplicationDelegates = {
      project: mockProject,
      sysml: mockSysml,
    };
    expect(() => assertMutationReady(delegates, 'sysml')).not.toThrow();
  });

  it('does NOT throw when report delegate is present', () => {
    const delegates: AgentApplicationDelegates = {
      project: mockProject,
      report: mockReport,
    };
    expect(() => assertMutationReady(delegates, 'report')).not.toThrow();
  });
});

describe('AgentApplicationDelegates bundle validity', () => {
  it('is valid with only project delegate (no mutation delegates)', () => {
    // A bundle with only project is structurally valid — the type allows this.
    const delegates: AgentApplicationDelegates = { project: mockProject };
    expect(delegates.project.getProjectId()).toBe('proj-test-001');
    expect(delegates.project.getActiveWorkspace()).toBe('xbridges');
    expect(delegates.xbridges).toBeUndefined();
    expect(delegates.sysml).toBeUndefined();
    expect(delegates.report).toBeUndefined();
  });

  it('accepts a full bundle with all delegates', () => {
    const delegates: AgentApplicationDelegates = {
      project: mockProject,
      xbridges: mockXbridges,
      sysml: mockSysml,
      report: mockReport,
    };
    expect(isMutationReady(delegates, 'xbridges')).toBe(true);
    expect(isMutationReady(delegates, 'sysml')).toBe(true);
    expect(isMutationReady(delegates, 'report')).toBe(true);
  });
});

describe('DelegateUnavailableError', () => {
  it('is an instance of Error', () => {
    const err = new DelegateUnavailableError('xbridges');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(DelegateUnavailableError);
  });

  it('has the correct name and workspace', () => {
    const err = new DelegateUnavailableError('sysml');
    expect(err.name).toBe('DelegateUnavailableError');
    expect(err.workspace).toBe('sysml');
    expect(err.message).toContain('sysml');
  });
});

describe('Type-structural mock validation', () => {
  // These tests verify that the mock objects satisfy the interfaces at runtime,
  // confirming the structural typing is consistent with expected usage.

  it('mockXbridges satisfies XbridgesApplicationDelegate interface', async () => {
    const nodes = await mockXbridges.getNodes();
    const edges = await mockXbridges.getEdges();
    const node = await mockXbridges.addBlock('pid_controller', { gain: 1 });
    const edge = await mockXbridges.connectPorts('n1', 'out', 'n2', 'in');
    const updated = await mockXbridges.updateParameters('n1', { gain: 2 });
    await mockXbridges.save();

    expect(Array.isArray(nodes)).toBe(true);
    expect(Array.isArray(edges)).toBe(true);
    expect(typeof node.id).toBe('string');
    expect(typeof edge.id).toBe('string');
    expect(updated.data).toEqual({ gain: 2 });
  });

  it('mockSysml satisfies SysmlApplicationDelegate interface', async () => {
    const snapshot = await mockSysml.inspect();
    const result = await mockSysml.executeCommand({ kind: 'ADD_BLOCK', payload: {}, revision: 5 });
    const validation = await mockSysml.validate();

    expect(typeof snapshot.revision).toBe('number');
    expect(result.success).toBe(true);
    expect(result.newRevision).toBe(6);
    expect(validation.valid).toBe(true);
  });

  it('mockReport satisfies ReportApplicationDelegate interface', async () => {
    const artifact = await mockReport.generateReport({
      projectId: 'proj-1',
      format: 'pdf',
      evidenceIds: ['ev-1'],
    });

    expect(typeof artifact.path).toBe('string');
    expect(artifact.format).toBe('pdf');
    expect(typeof artifact.contentHash).toBe('string');
    expect(artifact.sizeBytes).toBeGreaterThan(0);
  });

  it('mockProject satisfies ProjectApplicationDelegate interface', async () => {
    const id = mockProject.getProjectId();
    const workspace = mockProject.getActiveWorkspace();
    const snap = await mockProject.getModelSnapshot();

    expect(typeof id).toBe('string');
    expect(typeof workspace).toBe('string');
    expect(typeof snap.revision).toBe('number');
    expect(typeof snap.capturedAt).toBe('number');
  });
});
