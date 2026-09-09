import { describe, expect, it } from 'vitest';
import { createVisualDiagram } from '../model/visualDiagramModel';
import { generateUseCasePlantUml, getUseCasePaletteItems } from './useCaseAdapter';

describe('use-case PlantUML adapter', () => {
  it('generates deterministic actors, use cases, boundaries, and associations', () => {
    const model = createVisualDiagram('use-case');
    model.elements = [
      { id: 'actor-1', kind: 'actor', label: 'Customer', position: { x: 0, y: 0 }, size: { width: 100, height: 60 }, style: {} },
      { id: 'case-1', kind: 'use-case', label: 'Sign in', position: { x: 0, y: 0 }, size: { width: 100, height: 60 }, style: {} },
    ];
    model.relationships = [{ id: 'rel-1', kind: 'association', sourceId: 'actor-1', targetId: 'case-1' }];
    const source = generateUseCasePlantUml(model);
    expect(source).toContain('actor "Customer" as actor_1');
    expect(source).toContain('( "Sign in" ) as case_1');
    expect(source).toContain('actor_1 --> case_1');
    expect(getUseCasePaletteItems().map((item) => item.kind)).toEqual(expect.arrayContaining(['actor', 'use-case', 'boundary']));
  });
});
