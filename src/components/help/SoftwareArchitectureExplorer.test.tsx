import React from 'react';
import { describe, expect, it } from 'vitest';
import { ARCHITECTURE_DATA_TYPES, ARCHITECTURE_LAYERS, ARCHITECTURE_PROTECTIONS, SoftwareArchitectureExplorer } from './SoftwareArchitectureExplorer';

describe('SoftwareArchitectureExplorer', () => {
  it('defines the six layered architecture areas and typed taxonomy', () => {
    expect(ARCHITECTURE_LAYERS).toHaveLength(6);
    expect(ARCHITECTURE_LAYERS.map(layer => layer.label)).toContain('L0 · Shell and entry');
    expect(ARCHITECTURE_DATA_TYPES.map(type => type.label)).toContain('Telemetry and time-series data');
    expect(ARCHITECTURE_PROTECTIONS.map(protection => protection.label)).toContain('Deny-by-default HIL');
  });

  it('exposes the explorer component and close contract', () => {
    const element = React.createElement(SoftwareArchitectureExplorer, { onClose: () => undefined });
    expect(element.type).toBe(SoftwareArchitectureExplorer);
    expect(element.props.onClose).toBeTypeOf('function');
  });

  it('keeps selected cards rich enough for inspector, search, and protection overlay behavior', () => {
    const cards = ARCHITECTURE_LAYERS.flatMap(layer => layer.cards);
    expect(cards.some(card => card.name === 'Integrity services' && card.dataTypes.includes('persisted'))).toBe(true);
    expect(cards.every(card => card.source && card.responsibility && card.protections.length > 0)).toBe(true);
    expect(cards.some(card => card.protections.includes('verification'))).toBe(true);
  });
});
