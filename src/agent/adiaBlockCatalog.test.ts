import { describe, it, expect } from 'vitest';
import { AdiaBlockCatalog, CatalogBlock } from './adiaBlockCatalog';

describe('AdiaBlockCatalog (Read-only index over existing ADIA blocks)', () => {
  it('indexes real existing blocks from VLAB_LIBRARY and X-BRIDGES', () => {
    const allBlocks = AdiaBlockCatalog.list();
    expect(allBlocks.length).toBeGreaterThan(50);

    // Verify properties on a sample block
    const resistor = AdiaBlockCatalog.findById('resistor');
    expect(resistor).toBeDefined();
    expect(resistor?.name).toBe('Resistor');
    expect(resistor?.domain).toBe('Electrical');
    expect(resistor?.ports.length).toBeGreaterThanOrEqual(2);
    expect(resistor?.parameters['R']).toBeDefined();
    expect(resistor?.sourceLibrary).toBe('vlab');
  });

  it('proves an unknown block ID cannot pass catalog lookup', () => {
    expect(AdiaBlockCatalog.isExistingBlockId('magic_nonexistent_block_9999')).toBe(false);
    expect(AdiaBlockCatalog.findById('magic_nonexistent_block_9999')).toBeUndefined();
    expect(AdiaBlockCatalog.findById('')).toBeUndefined();
  });

  it('finds blocks by capability accurately', () => {
    const thermalBlocks = AdiaBlockCatalog.findByCapability('thermal');
    expect(thermalBlocks.length).toBeGreaterThan(0);
    thermalBlocks.forEach(b => {
      const match =
        b.domain.toLowerCase().includes('thermal') ||
        b.capabilities.includes('thermal') ||
        b.id.toLowerCase().includes('thermal');
      expect(match).toBe(true);
    });

    const electricalBlocks = AdiaBlockCatalog.findByCapability('electrical');
    expect(electricalBlocks.length).toBeGreaterThan(0);
  });

  it('finds blocks by name (case-insensitive substring search)', () => {
    const matches = AdiaBlockCatalog.findByName('Resistor');
    expect(matches.length).toBeGreaterThan(0);
    expect(matches.some(m => m.id === 'resistor')).toBe(true);
  });

  it('enforces read-only guarantee: listing cannot mutate underlying catalog', () => {
    const list = AdiaBlockCatalog.list() as CatalogBlock[];
    const originalLength = list.length;

    expect(() => {
      (list as any).push({ id: 'illegal_injected_block' });
    }).toThrow();

    expect(AdiaBlockCatalog.list().length).toBe(originalLength);
  });

  it('snapshot test: tracks library block count and prevents accidental block removal', () => {
    const blockCount = AdiaBlockCatalog.getBlockCount();
    const domainCount = AdiaBlockCatalog.getDomainCount();

    // Ensure we have a substantial catalog
    expect(blockCount).toBeGreaterThan(100);
    expect(domainCount).toBeGreaterThan(5);

    // Verify essential domain blocks exist
    expect(AdiaBlockCatalog.isExistingBlockId('resistor')).toBe(true);
    expect(AdiaBlockCatalog.isExistingBlockId('variable_resistor')).toBe(true);
  });

  it('exposes rich port metadata with direction, type, and domain', () => {
    const resistor = AdiaBlockCatalog.findById('resistor');
    expect(resistor).toBeDefined();
    expect(resistor?.ports[0]).toHaveProperty('id');
    expect(resistor?.ports[0]).toHaveProperty('direction');

    const inv = AdiaBlockCatalog.findById('THREE_PHASE_INVERTER');
    expect(inv).toBeDefined();
    expect(inv?.ports.length).toBeGreaterThan(0);
    const vdcPort = inv?.ports.find(p => p.id === 'vdc_p');
    expect(vdcPort).toBeDefined();
    expect(vdcPort?.direction).toBe('input');
    expect(vdcPort?.type).toBe('power');
  });

  it('exposes parameter schema with types and default values', () => {
    const inv = AdiaBlockCatalog.findById('THREE_PHASE_INVERTER');
    expect(inv).toBeDefined();
    expect(inv?.parameters['Ron']).toBeDefined();
    expect(inv?.parameters['Ron'].value).toBe(0.01);
  });

  it('provides aliases and compatibility metadata', () => {
    const pwm = AdiaBlockCatalog.findById('THREE_PHASE_PWM');
    expect(pwm).toBeDefined();
    expect(pwm?.aliases).toBeDefined();
    expect(Array.isArray(pwm?.aliases)).toBe(true);
    expect(pwm?.compatibility).toBeDefined();
  });
});

