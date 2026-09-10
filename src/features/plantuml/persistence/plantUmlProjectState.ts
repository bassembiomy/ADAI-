import { migrateVisualDiagram, type VisualDiagramModel } from '../model/visualDiagramModel';

export interface PlantUmlProjectState { version: 1; diagrams: VisualDiagramModel[]; }
export type ProjectWithPlantUml = Record<string, unknown>;

export const readPlantUmlDiagrams = (project: ProjectWithPlantUml): VisualDiagramModel[] => {
  const raw = project.plantUml;
  if (!raw || typeof raw !== 'object') return [];
  const diagrams = (raw as { diagrams?: unknown }).diagrams;
  if (!Array.isArray(diagrams)) return [];
  return diagrams.flatMap((diagram) => {
    try { return [migrateVisualDiagram(diagram)]; } catch { return []; }
  });
};

export const writePlantUmlDiagrams = <T extends ProjectWithPlantUml>(project: T, diagrams: VisualDiagramModel[]): T => ({
  ...project,
  plantUml: { version: 1, diagrams: diagrams.map((diagram) => migrateVisualDiagram(diagram)) } satisfies PlantUmlProjectState,
});
