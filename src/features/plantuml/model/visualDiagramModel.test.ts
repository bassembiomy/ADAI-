import { describe, expect, it } from 'vitest';
import { createVisualDiagram, migrateVisualDiagram } from './visualDiagramModel';

describe('visual diagram model', () => {
  it('creates a versioned empty diagram with stable ids and canvas metadata', () => {
    const diagram = createVisualDiagram('sequence', 'Login flow');
    expect(diagram.version).toBe(1);
    expect(diagram.type).toBe('sequence');
    expect(diagram.title).toBe('Login flow');
    expect(diagram.elements).toEqual([]);
    expect(diagram.relationships).toEqual([]);
    expect(diagram.canvas).toEqual({ zoom: 1, pan: { x: 0, y: 0 } });
    expect(diagram.id).toMatch(/^diagram-/);
  });

  it('migrates legacy payloads with missing canvas fields', () => {
    const migrated = migrateVisualDiagram({
      id: 'legacy', type: 'sequence', title: 'System', version: 0,
      elements: [], relationships: [],
    });
    expect(migrated).toMatchObject({
      id: 'legacy', version: 1, type: 'sequence',
      canvas: { zoom: 1, pan: { x: 0, y: 0 } },
    });
  });

  it('rejects unknown diagram types', () => {
    expect(() => createVisualDiagram('activity' as never)).toThrow(/diagram type/i);
  });
});
