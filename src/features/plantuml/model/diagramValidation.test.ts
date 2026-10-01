import { describe, expect, it } from 'vitest';
import { createVisualDiagram } from './visualDiagramModel';
import { validateVisualDiagram } from './diagramValidation';

describe('visual diagram validation', () => {
  it('accepts an empty diagram', () => {
    expect(validateVisualDiagram(createVisualDiagram('sequence')).issues).toEqual([]);
  });

  it('reports missing labels, duplicate ids, and dangling relationships', () => {
    const diagram = createVisualDiagram('sequence');
    diagram.elements = [
      { id: 'a', kind: 'actor', label: '', position: { x: 0, y: 0 }, size: { width: 120, height: 64 }, style: {} },
      { id: 'a', kind: 'participant', label: 'Login', position: { x: 0, y: 0 }, size: { width: 160, height: 72 }, style: {} },
    ];
    diagram.relationships = [{ id: 'r1', kind: 'message', sourceId: 'a', targetId: 'missing', label: '' }];
    const result = validateVisualDiagram(diagram);
    expect(result.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      'missing-label', 'duplicate-element-id', 'dangling-relationship',
    ]));
  });
});
