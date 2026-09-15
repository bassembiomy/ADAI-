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

export interface PlantUmlDiagnostic {
  code: string;
  message: string;
  elementId?: string;
  severity: 'error' | 'warning';
}

export interface CanonicalPlantUmlResult {
  plantUml: string;
  diagnostics: PlantUmlDiagnostic[];
}

export const generateUseCasePlantUmlFromRepository = (
  repository: any,
  options?: { diagramId?: string }
): CanonicalPlantUmlResult => {
  const diagnostics: PlantUmlDiagnostic[] = [];
  const lines = ['@startuml', 'left to right direction'];

  const actors = Object.values(repository.actors || {}) as any[];
  const subjects = Object.values(repository.subjects || {}) as any[];
  const useCases = Object.values(repository.useCases || {}) as any[];
  const relationships = Object.values(repository.useCaseRelationships || {}) as any[];

  const validIds = new Set<string>([
    ...actors.map((a) => a.id),
    ...subjects.map((s) => s.id),
    ...useCases.map((u) => u.id),
    ...Object.keys(repository.definitions || {}),
  ]);

  for (const actor of actors) {
    const id = alias(actor.id);
    lines.push(`actor "${quote(actor.name)}" as ${id}`);
  }

  const renderedUseCases = new Set<string>();

  for (const subject of subjects) {
    const sId = alias(subject.id);
    lines.push(`rectangle "${quote(subject.name)}" as ${sId} {`);
    const subjectUseCases = useCases.filter((uc) => uc.subjectId === subject.id);
    for (const uc of subjectUseCases) {
      renderedUseCases.add(uc.id);
      const uId = alias(uc.id);
      let label = quote(uc.name);
      if (uc.extensionPoints && uc.extensionPoints.length > 0) {
        label += `\\n--\\nextension points:\\n  ${uc.extensionPoints.map((ep: string) => quote(ep)).join('\\n  ')}`;
      }
      lines.push(`  usecase ${uId} as "${label}"`);
    }
    lines.push('}');
  }

  for (const uc of useCases) {
    if (!renderedUseCases.has(uc.id)) {
      const uId = alias(uc.id);
      let label = quote(uc.name);
      if (uc.extensionPoints && uc.extensionPoints.length > 0) {
        label += `\\n--\\nextension points:\\n  ${uc.extensionPoints.map((ep: string) => quote(ep)).join('\\n  ')}`;
      }
      lines.push(`usecase ${uId} as "${label}"`);
    }
  }

  for (const rel of relationships) {
    if (!validIds.has(rel.sourceId) || !validIds.has(rel.targetId)) {
      diagnostics.push({
        code: 'DANGLING_RELATIONSHIP_ENDPOINT',
        message: `Relationship ${rel.id} has missing endpoint (source: ${rel.sourceId}, target: ${rel.targetId})`,
        elementId: rel.id,
        severity: 'error',
      });
      continue;
    }

    const s = alias(rel.sourceId);
    const t = alias(rel.targetId);
    let arrow = '-->';
    if (rel.kind === 'include') {
      arrow = '--> : <<include>>';
    } else if (rel.kind === 'extend') {
      const epNote = rel.extensionPoint ? `\\n(${quote(rel.extensionPoint)})` : '';
      arrow = `--> : <<extend>>${epNote}`;
    } else if (rel.kind === 'generalization' || rel.kind === 'useCaseGeneralization') {
      arrow = '-|>';
    } else if (rel.kind === 'useCaseAssociation' || rel.kind === 'association') {
      arrow = '--';
    }

    lines.push(`${s} ${arrow} ${t}`);
  }

  lines.push('@enduml');
  return {
    plantUml: lines.join('\n'),
    diagnostics,
  };
};
