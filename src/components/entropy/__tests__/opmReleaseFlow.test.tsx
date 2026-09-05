import { describe, it, expect } from 'vitest';
import {
  createInitialArtifactState,
  applyModelEdit,
  canVerify,
  canDownload,
  markGenerated,
  markVerified,
  markFailed,
} from '../OpmCodeGenerationWorkspace';
import { convertOpmNodeType, type OpmMigrationWarning } from '../OpmMigrations';
import { validateOpmPortConnection } from '../OpmPortContracts';
import { normalizeOpmSimulationConfig } from '../OpmSimulationConfig';
import { createOpmRuntime, stepOpmRuntime } from '../../../engine/opm/runtime';
import { compileExecutableOpm } from '../../../engine/opm/pipeline';
import { generateOpmCArtifacts } from '../../../engine/opm/cGenerator';
import { createDefaultOpmExecutionConfig } from '../../../engine/opm/executableTypes';
import type { AppNode, AppEdge } from '../EntropyTypes';

describe('OPM Standard Editor Release Flow', () => {
  const config = createDefaultOpmExecutionConfig();
  const sampleNodes: AppNode[] = [
    {
      id: 'obj_pump',
      type: 'opmObject',
      position: { x: 100, y: 100 },
      data: {
        name: 'Pump',
        type: 'object',
        physical: false,
        objectExecution: {
          enabled: true,
          attributes: [
            {
              id: 'speed',
              displayName: 'Speed',
              cIdentifier: 'speed',
              type: { kind: 'int32' },
              initialValue: 0,
              overflow: 'wrap',
              access: 'readWrite',
              persistent: false,
            },
          ],
        },
      },
    },
    {
      id: 'st_idle',
      type: 'opmState',
      parentId: 'obj_pump',
      position: { x: 120, y: 120 },
      data: {
        name: 'Idle',
        type: 'state',
        physical: false,
        isInitial: true,
        parentId: 'obj_pump',
        stateExecution: {
          enabled: true,
          initial: true,
          terminal: false,
          entryAssignments: [],
          exitAssignments: [],
        },
      },
    },
    {
      id: 'proc_run',
      type: 'opmProcess',
      position: { x: 300, y: 100 },
      data: {
        name: 'RunPump',
        type: 'process',
        physical: false,
        processExecution: {
          enabled: true,
          activation: 'cyclic',
          periodMs: 20,
          inputAttributeIds: [],
          outputAttributeIds: ['speed'],
          guard: '',
          assignments: [
            {
              id: 'a_spd',
              targetAttributeId: 'speed',
              operator: '+=',
              expression: '10',
              enabled: true,
            },
          ],
          priority: 1,
          debounceMs: 0,
          reentrancy: 'reject',
        },
      },
    },
  ];

  it('completes the full lifecycle: selection, migration warning, connections, tick edit, simulation, codegen, and verification gating', () => {
    // 1. Block conversion warning
    const conversion = convertOpmNodeType(sampleNodes[0], 'opmProcess');
    expect(conversion.node.id).toBe('obj_pump');
    expect(conversion.node.data.name).toBe('Pump');
    expect(conversion.warnings.some((w: OpmMigrationWarning) => w.code === 'OPM_STATE_DATA_DISABLED')).toBe(true);

    // 2. Port connection contract: valid vs invalid direction
    const validConn = validateOpmPortConnection(
      sampleNodes,
      [],
      { source: 'obj_pump', target: 'proc_run', sourceHandle: null, targetHandle: null },
      'instrument',
    );
    expect(validConn.valid).toBe(true);

    const invalidConn = validateOpmPortConnection(
      sampleNodes,
      [],
      { source: 'proc_run', target: 'obj_pump', sourceHandle: null, targetHandle: null },
      'instrument',
    );
    expect(invalidConn.valid).toBe(false);
    expect(invalidConn.code).toBe('OPM_PORT_DIRECTION_INVALID');

    // 3. Independent OPM tick configuration
    const opmConfig = normalizeOpmSimulationConfig({ tickMs: 20 });
    expect(opmConfig.tickMs).toBe(20);

    // 4. Canonical simulation execution
    const comp = compileExecutableOpm(sampleNodes, [], config);
    expect(comp.model).toBeDefined();
    const runtime = createOpmRuntime(comp.model!);
    const step1 = stepOpmRuntime(runtime, opmConfig.tickMs);
    expect(step1.timeMs).toBe(20);
    expect(step1.snapshot).toBeDefined();

    // 5. Initial codegen lifecycle starts at 'draft'
    let artifactState = createInitialArtifactState();
    expect(artifactState.lifecycle).toBe('draft');
    expect(canDownload(artifactState)).toBe(false);

    // 6. Generate artifacts and verify transition to 'generated'
    const generated = generateOpmCArtifacts(comp.model!);
    expect(generated.files.length).toBeGreaterThan(0);
    artifactState = markGenerated(
      artifactState,
      comp.model!.fingerprint,
      generated.files,
      generated.manifest,
      [],
    );
    expect(artifactState.lifecycle).toBe('generated');
    expect(canVerify(artifactState)).toBe(true);
    expect(canDownload(artifactState)).toBe(false);

    // 7. Verify qualification status unlocks download
    artifactState = markVerified(
      artifactState,
      comp.model!.fingerprint,
      { hostCompile: 'pass', hostRuntime: 'pass' },
      'w64devkit-gcc-14.2.0',
    );
    expect(artifactState.lifecycle).toBe('verified');
    expect(canDownload(artifactState)).toBe(true);

    // 8. Model invalidation: semantic edit changes fingerprint back to 'draft'
    artifactState = applyModelEdit(artifactState, 'modified-new-fingerprint');
    expect(artifactState.lifecycle).toBe('draft');
    expect(canDownload(artifactState)).toBe(false);
  });

  it('verifies production EntropyWorkspace imports all OPM standard helpers (REQ-P2-02)', async () => {
    // Read EntropyWorkspace source file to guarantee production-path integration
    const fs = await import('fs');
    const path = await import('path');
    const wsPath = path.resolve(__dirname, '../EntropyWorkspace.tsx');
    const wsSource = fs.readFileSync(wsPath, 'utf-8');

    // 1. OpmMigrations integration
    expect(wsSource).toContain("from './OpmMigrations'");
    expect(wsSource).toContain('convertOpmNodeType');
    expect(wsSource).toContain('convertOpmEdgeType');

    // 2. OpmPortContracts integration
    expect(wsSource).toContain("from './OpmPortContracts'");
    expect(wsSource).toContain('validateOpmPortConnection');
    expect(wsSource).toContain('isValidConnection={isValidConnection}');

    // 3. OpmSimulationConfig integration
    expect(wsSource).toContain("from './OpmSimulationConfig'");
    expect(wsSource).toContain('normalizeOpmSimulationConfig');

    // 4. OpmDiagnosticsBadge integration
    expect(wsSource).toContain("from './OpmDiagnosticsBadge'");
    expect(wsSource).toContain('handleNavigateToDiagnostic');
  });
});

