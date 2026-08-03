import { describe, it, expect } from 'vitest';
import { packageDelivery, evaluateReleaseGate } from './deliveryPackager.js';
import type { EvidenceRecord } from '../hil/hilEvidence.js';
import type { IntegrationManifest } from './integrationManifest.js';

describe('deliveryPackager', () => {
  const mockManifest: IntegrationManifest = {
    schemaVersion: '1.0.0',
    targetSelection: { targetId: 'stm32f407vgt6', packVersion: '1.0.0', driverMode: 'vendor', boardRevision: 'A' },
    channels: [],
    stubs: [],
    flashBlocked: false,
    blockReasons: [],
    contentHashes: {},
  };

  it('produces deterministic package with structured file layout and stable packageHash', () => {
    const project = {
      files: [
        { path: 'src/app/sm_core.c', layer: 'app' as const, sha256: 'sha256:1111' as const, content: '/* sm_core */' },
        { path: 'src/component/adia_component.c', layer: 'component' as const, sha256: 'sha256:2222' as const, content: '/* component */' },
        { path: 'src/mcal/adia_mcal.h', layer: 'mcal' as const, sha256: 'sha256:3333' as const, content: '/* mcal */' },
      ],
      manifest: mockManifest,
    };

    const artifacts = {
      elf: { path: 'out/firmware.elf', content: 'ELF_BYTES' },
      map: { path: 'out/firmware.map', content: 'MAP_BYTES' },
    };

    const evidence: EvidenceRecord[] = [
      { previousHash: null, recordHash: 'sha256:e1', status: 'TARGET_COMPILE_VERIFIED', buildId: 'B1', targetId: 'stm32f407vgt6', inputHashes: [], outputHashes: [], toolVersion: 'gcc', timestamp: 100 },
      { previousHash: 'sha256:e1', recordHash: 'sha256:e2', status: 'LINKED_IMAGE_VERIFIED', buildId: 'B1', targetId: 'stm32f407vgt6', inputHashes: [], outputHashes: [], toolVersion: 'gcc', timestamp: 200 },
      { previousHash: 'sha256:e2', recordHash: 'sha256:e3', status: 'FLASH_VERIFIED', buildId: 'B1', targetId: 'stm32f407vgt6', inputHashes: [], outputHashes: [], toolVersion: 'openocd', timestamp: 300 },
      { previousHash: 'sha256:e3', recordHash: 'sha256:e4', status: 'SELF_TEST_VERIFIED', buildId: 'B1', targetId: 'stm32f407vgt6', inputHashes: [], outputHashes: [], toolVersion: 'self-test', timestamp: 400 },
      { previousHash: 'sha256:e4', recordHash: 'sha256:e5', status: 'EXTERNAL_HIL_VERIFIED', buildId: 'B1', targetId: 'stm32f407vgt6', inputHashes: [], outputHashes: [], toolVersion: 'hil', timestamp: 500 },
    ];

    const pkg1 = packageDelivery(project, artifacts, evidence);
    const pkg2 = packageDelivery(project, artifacts, evidence);

    expect(pkg1.files.map(file => file.path)).toEqual(expect.arrayContaining([
      'src/app/sm_core.c', 'src/component/adia_component.c', 'src/mcal/adia_mcal.h',
      'out/firmware.elf', 'out/firmware.map', 'evidence/evidence_chain.json',
      'docs/integration.md', 'docs/wiring.md', 'docs/recovery.md',
    ]));

    expect(pkg1.packageHash).toBe(pkg2.packageHash);
  });

  it('evaluates release gate and blocks when required evidence is missing or stubbed', () => {
    const stubbedManifest: IntegrationManifest = {
      ...mockManifest,
      stubs: ['motor_pwm'],
      flashBlocked: true,
    };

    expect(evaluateReleaseGate([], mockManifest)).toEqual({
      status: 'BLOCKED',
      reason: 'MISSING_LINKED_IMAGE_VERIFIED',
    });

    expect(evaluateReleaseGate([], stubbedManifest)).toEqual({
      status: 'BLOCKED',
      reason: 'GENERATED_WITH_STUBS',
    });
  });
});
