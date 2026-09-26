import { describe, it, expect } from 'vitest';
import { searchCatalogBlocks, getCanonicalBlockDefinition } from './blockSearch';
import { AdiaBlockCatalog } from '../../../agent/adiaBlockCatalog';

describe('Block Search and Canonical Registry Retrieval', () => {
  it('returns exact ID match as the top ranked result', () => {
    const results = searchCatalogBlocks('THREE_PHASE_INVERTER');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].block.id).toBe('THREE_PHASE_INVERTER');
    expect(results[0].score).toBeGreaterThan(0.9);
  });

  it('ranks exact name match ahead of partial description matches', () => {
    const results = searchCatalogBlocks('Resistor');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].block.id).toBe('resistor');
  });

  it('exposes authentic ports and parameters from source library without synthesis', () => {
    const inv = getCanonicalBlockDefinition('THREE_PHASE_INVERTER');
    expect(inv).toBeDefined();
    expect(inv?.sourceLibrary).toBe('xbridges');
    // Ports must reflect real inputs/outputs from BLOCK_LIBRARY
    expect(inv?.ports.length).toBeGreaterThan(0);
    expect(inv?.ports.some(p => p.id === 'vdc_p' && p.direction === 'input')).toBe(true);
    expect(inv?.ports.some(p => p.id === 'ga' && p.direction === 'input')).toBe(true);
    expect(inv?.ports.some(p => p.id === 'va' && p.direction === 'output')).toBe(true);
    // Parameters must reflect real params
    expect(inv?.parameters['Ron']).toBeDefined();

    const resistor = getCanonicalBlockDefinition('resistor');
    expect(resistor).toBeDefined();
    expect(resistor?.sourceLibrary).toBe('vlab');
    expect(resistor?.ports.some(p => p.id === 'p')).toBe(true);
    expect(resistor?.parameters['R']).toBeDefined();
  });

  it('guarantees nonexistent blocks never resolve', () => {
    const ghost = getCanonicalBlockDefinition('hallucinated_quantum_teleporter_999');
    expect(ghost).toBeUndefined();

    const searchResults = searchCatalogBlocks('xyz_nonexistent_token_12345');
    expect(searchResults).toHaveLength(0);
  });

  it('filters by domain and category when specified', () => {
    const vlabOnly = searchCatalogBlocks('inverter', { domainFilter: 'vlab' });
    vlabOnly.forEach(r => {
      expect(r.block.sourceLibrary).toBe('vlab');
    });

    const xbridgesOnly = searchCatalogBlocks('inverter', { domainFilter: 'xbridges' });
    xbridgesOnly.forEach(r => {
      expect(r.block.sourceLibrary).toBe('xbridges');
    });
  });
});
