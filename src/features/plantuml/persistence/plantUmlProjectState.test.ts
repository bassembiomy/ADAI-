import { describe, expect, it } from 'vitest';
import { createVisualDiagram } from '../model/visualDiagramModel';
import { readPlantUmlDiagrams, writePlantUmlDiagrams } from './plantUmlProjectState';

describe('PlantUML project persistence', () => {
  it('round-trips diagrams without changing unrelated project fields', () => {
    const sequence = createVisualDiagram('sequence', 'Login');
    const sequence2 = createVisualDiagram('sequence', 'Logout');
    const project = { name: 'Demo', existing: { keep: true } };
    const written = writePlantUmlDiagrams(project, [sequence, sequence2]);
    expect(written.existing).toEqual({ keep: true });
    expect(readPlantUmlDiagrams(written).map((diagram) => diagram.title)).toEqual(['Login', 'Logout']);
  });

  it('returns warnings instead of throwing for malformed state', () => {
    const result = readPlantUmlDiagrams({ plantUml: { diagrams: 'bad' } });
    expect(result).toEqual([]);
  });
});
