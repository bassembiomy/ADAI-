import { describe, it, expect } from 'vitest';
import { BLOCK_LIBRARY } from '../../../engine/xbridges/BlockDefinitions';
import {
  buildXbridgesCapabilityIndex,
  resolveBlockCapability,
  type XbridgesCapabilityIndex,
  type XbridgesBlockCapability,
} from './xbridgesCapabilityIndex';

describe('xbridgesCapabilityIndex (Canonical X-Bridges Capability Index)', () => {
  it('indexes every registered block without inventing metadata', () => {
    const index = buildXbridgesCapabilityIndex();
    expect([...index.blocks.keys()].sort()).toEqual(Object.keys(BLOCK_LIBRARY).sort());
    for (const [id, factory] of Object.entries(BLOCK_LIBRARY)) {
      const block = factory(`probe_${id}`, {});
      expect(index.blocks.get(id)?.ports.map(p => p.id).sort())
        .toEqual([...block.inputs, ...block.outputs].map(p => p.id).sort());
      expect([...(index.blocks.get(id)?.parameterNames || [])].sort())
        .toEqual(Object.keys(block.params).sort());
    }
  });

  it('produces a deterministic catalogFingerprint via canonicalJson and sha256Hex', () => {
    const index1 = buildXbridgesCapabilityIndex();
    const index2 = buildXbridgesCapabilityIndex();
    expect(index1.catalogFingerprint).toBeDefined();
    expect(typeof index1.catalogFingerprint).toBe('string');
    expect(index1.catalogFingerprint).toHaveLength(64);
    expect(index1.catalogFingerprint).toEqual(index2.catalogFingerprint);
  });

  it('resolves block capabilities by exact ID and case-insensitive aliases', () => {
    const cap1 = resolveBlockCapability('PID_CONTROLLER');
    expect(cap1).toBeDefined();
    expect(cap1?.id).toBe('PID_CONTROLLER');
    expect(cap1?.parameterNames).toContain('Kp');
    expect(cap1?.ports.length).toBeGreaterThan(0);

    // Resolve via alias or case insensitive
    const cap2 = resolveBlockCapability('pid_controller');
    expect(cap2).toBeDefined();
    expect(cap2?.id).toBe('PID_CONTROLLER');

    expect(resolveBlockCapability('nonexistent_mystery_block')).toBeUndefined();
  });

  it('extracts statefulness and solver features accurately without inference', () => {
    const integrator = resolveBlockCapability('Integrator');
    expect(integrator).toBeDefined();
    expect(integrator?.isStateful).toBe(true);
    expect(integrator?.hasDerivative).toBe(true);

    const gain = resolveBlockCapability('Gain');
    expect(gain).toBeDefined();
    expect(gain?.hasDerivative).toBe(false);
  });

  it('records unknown for unspecified units instead of fabricating units', () => {
    const index = buildXbridgesCapabilityIndex();
    for (const block of index.blocks.values()) {
      for (const port of block.ports) {
        expect(port.unit).toBeDefined();
        // If not specified in the factory, must be 'unknown'
        expect(typeof port.unit).toBe('string');
      }
      for (const param of Object.values(block.parameters)) {
        expect(param.unit).toBeDefined();
        expect(typeof param.unit).toBe('string');
      }
    }
  });

  it('freezes indexed block records ensuring immutability', () => {
    const index = buildXbridgesCapabilityIndex();
    const pid = index.blocks.get('PID_CONTROLLER');
    expect(pid).toBeDefined();
    expect(Object.isFrozen(pid)).toBe(true);
    expect(Object.isFrozen(pid?.ports)).toBe(true);
    expect(Object.isFrozen(pid?.parameters)).toBe(true);
    expect(() => {
      (pid as any).id = 'MUTATED';
    }).toThrow();
  });
});
