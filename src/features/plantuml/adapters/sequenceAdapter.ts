import { validateVisualDiagram, type DiagramValidationResult } from '../model/diagramValidation';
import type { VisualDiagramModel } from '../model/visualDiagramModel';

const alias = (id: string) => id.replace(/[^a-zA-Z0-9_]/g, '_');
const quote = (label: string) => label.replace(/"/g, "'").replace(/\r?\n/g, ' ');
const element = (model: VisualDiagramModel, id: string) => model.elements.find((item) => item.id === id);

export const getSequencePaletteItems = () => [
  { kind: 'participant', label: 'Participant' }, { kind: 'actor', label: 'Actor' },
  { kind: 'message', label: 'Message' }, { kind: 'return', label: 'Return' },
  { kind: 'note', label: 'Note' }, { kind: 'fragment', label: 'Fragment' },
];

export const validateSequenceDiagram = (model: VisualDiagramModel): DiagramValidationResult => {
  const result = validateVisualDiagram(model);
  for (const relationship of model.relationships) {
    if (!element(model, relationship.sourceId) || !element(model, relationship.targetId)) continue;
    if (!['message', 'return', 'note'].includes(relationship.kind)) {
      result.issues.push({ severity: 'error', code: 'unsupported-sequence-relationship', message: 'Unsupported sequence relationship.', relationshipId: relationship.id });
    }
  }
  result.valid = result.issues.every((issue) => issue.severity !== 'error');
  return result;
};

export const generateSequencePlantUml = (model: VisualDiagramModel): string => {
  const lines = ['@startuml'];
  for (const item of model.elements.filter((element) => ['participant', 'actor'].includes(element.kind))) {
    lines.push(`${item.kind} "${quote(item.label)}" as ${alias(item.id)}`);
  }
  for (const relationship of model.relationships) {
    const arrow = relationship.kind === 'return' ? '-->' : relationship.direction === 'async' ? '->>' : '->';
    lines.push(`${alias(relationship.sourceId)} ${arrow} ${alias(relationship.targetId)}${relationship.label ? `: ${quote(relationship.label)}` : ''}`);
  }
  lines.push('@enduml');
  return lines.join('\n');
};
