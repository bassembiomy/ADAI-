import { validateVisualDiagram, type DiagramValidationResult } from '../model/diagramValidation';
import type { VisualDiagramElement, VisualDiagramModel } from '../model/visualDiagramModel';

const alias = (id: string) => id.replace(/[^a-zA-Z0-9_]/g, '_');
const quote = (label: string) => label.replace(/"/g, "'").replace(/\r?\n/g, ' ');
const find = (model: VisualDiagramModel, id: string) => model.elements.find((element) => element.id === id);

export const getUseCasePaletteItems = () => [
  { kind: 'actor', label: 'Actor' }, { kind: 'use-case', label: 'Use case' },
  { kind: 'boundary', label: 'System boundary' },
  { kind: 'association', label: 'Association' }, { kind: 'include', label: 'Include' },
  { kind: 'extend', label: 'Extend' }, { kind: 'generalization', label: 'Generalization' },
];

export const validateUseCaseDiagram = (model: VisualDiagramModel): DiagramValidationResult => {
  const result = validateVisualDiagram(model);
  for (const relationship of model.relationships) {
    const source = find(model, relationship.sourceId);
    const target = find(model, relationship.targetId);
    if (!source || !target) continue;
    const valid = relationship.kind === 'association'
      || relationship.kind === 'include' && source.kind === 'use-case' && target.kind === 'use-case'
      || relationship.kind === 'extend' && source.kind === 'use-case' && target.kind === 'use-case'
      || relationship.kind === 'generalization';
    if (!valid) result.issues.push({ severity: 'error', code: 'unsupported-use-case-relationship', message: 'Relationship endpoints are not valid for this use-case relationship.', relationshipId: relationship.id });
  }
  result.valid = result.issues.every((issue) => issue.severity !== 'error');
  return result;
};

export const generateUseCasePlantUml = (model: VisualDiagramModel): string => {
  const lines = ['@startuml', 'left to right direction'];
  for (const element of model.elements) {
    const id = alias(element.id);
    if (element.kind === 'actor') lines.push(`actor "${quote(element.label)}" as ${id}`);
    else if (element.kind === 'use-case') lines.push(`( "${quote(element.label)}" ) as ${id}`);
    else if (element.kind === 'boundary') lines.push(`rectangle "${quote(element.label)}" as ${id} {`);
  }
  for (const element of model.elements.filter((item) => item.kind === 'boundary')) lines.push('}');
  for (const relationship of model.relationships) {
    const source = alias(relationship.sourceId); const target = alias(relationship.targetId);
    const arrow = relationship.kind === 'include' ? '--> : <<include>>' : relationship.kind === 'extend' ? '--> : <<extend>>' : relationship.kind === 'generalization' ? '-|>' : '-->';
    lines.push(`${source} ${arrow}${relationship.label ? ` "${quote(relationship.label)}"` : ''} ${target}`);
  }
  lines.push('@enduml');
  return lines.join('\n');
};
