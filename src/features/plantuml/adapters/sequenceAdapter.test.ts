import { describe, expect, it } from 'vitest';
import { createVisualDiagram } from '../model/visualDiagramModel';
import { generateSequencePlantUml, getSequencePaletteItems } from './sequenceAdapter';

describe('sequence PlantUML adapter', () => {
  it('generates ordered participants, messages, and notes', () => {
    const model = createVisualDiagram('sequence');
    model.elements = [
      { id: 'client', kind: 'participant', label: 'Client', position: { x: 0, y: 0 }, size: { width: 100, height: 60 }, style: {} },
      { id: 'api', kind: 'participant', label: 'API', position: { x: 0, y: 0 }, size: { width: 100, height: 60 }, style: {} },
    ];
    model.relationships = [{ id: 'm1', kind: 'message', sourceId: 'client', targetId: 'api', label: 'Login', direction: 'sync' }];
    const source = generateSequencePlantUml(model);
    expect(source).toContain('participant "Client" as client');
    expect(source).toContain('client -> api: Login');
    expect(getSequencePaletteItems().map((item) => item.kind)).toEqual(expect.arrayContaining(['participant', 'message', 'note', 'fragment']));
  });
});
