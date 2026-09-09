import type { VisualDiagramModel } from './visualDiagramModel';

export interface DiagramValidationIssue {
  severity: 'error' | 'warning';
  code: string;
  message: string;
  elementId?: string;
  relationshipId?: string;
}
export interface DiagramValidationResult { issues: DiagramValidationIssue[]; valid: boolean; }

export const validateVisualDiagram = (model: VisualDiagramModel): DiagramValidationResult => {
  const issues: DiagramValidationIssue[] = [];
  const ids = new Set<string>();
  for (const element of model.elements) {
    if (!element.label.trim()) issues.push({ severity: 'error', code: 'missing-label', message: 'Element label is required.', elementId: element.id });
    if (ids.has(element.id)) issues.push({ severity: 'error', code: 'duplicate-element-id', message: `Duplicate element id '${element.id}'.`, elementId: element.id });
    ids.add(element.id);
  }
  const relationshipIds = new Set<string>();
  for (const relationship of model.relationships) {
    if (relationshipIds.has(relationship.id)) issues.push({ severity: 'error', code: 'duplicate-relationship-id', message: `Duplicate relationship id '${relationship.id}'.`, relationshipId: relationship.id });
    relationshipIds.add(relationship.id);
    if (!ids.has(relationship.sourceId) || !ids.has(relationship.targetId)) {
      issues.push({ severity: 'error', code: 'dangling-relationship', message: 'Relationship endpoints must refer to existing elements.', relationshipId: relationship.id });
    }
  }
  return { issues, valid: issues.every((issue) => issue.severity !== 'error') };
};
