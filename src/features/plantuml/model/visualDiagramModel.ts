export type VisualDiagramType = 'sequence' | 'use-case';

export interface DiagramPoint { x: number; y: number; }
export interface DiagramSize { width: number; height: number; }
export interface VisualDiagramElement {
  id: string;
  kind: string;
  label: string;
  position: DiagramPoint;
  size: DiagramSize;
  style: Record<string, string | number | boolean>;
  [key: string]: unknown;
}
export interface VisualDiagramRelationship {
  id: string;
  kind: string;
  sourceId: string;
  targetId: string;
  label?: string;
  [key: string]: unknown;
}
export interface VisualDiagramModel {
  version: 1;
  id: string;
  type: VisualDiagramType;
  title: string;
  elements: VisualDiagramElement[];
  relationships: VisualDiagramRelationship[];
  canvas: { zoom: number; pan: DiagramPoint };
  [key: string]: unknown;
}

const isType = (value: unknown): value is VisualDiagramType => value === 'sequence' || value === 'use-case';
const id = () => `diagram-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export const createVisualDiagram = (type: VisualDiagramType, title = ''): VisualDiagramModel => {
  if (!isType(type)) throw new Error(`Unsupported diagram type '${String(type)}'`);
  return { version: 1, id: id(), type, title, elements: [], relationships: [], canvas: { zoom: 1, pan: { x: 0, y: 0 } } };
};

export const migrateVisualDiagram = (raw: unknown): VisualDiagramModel => {
  if (!raw || typeof raw !== 'object') throw new Error('Invalid visual diagram payload');
  const value = raw as Partial<VisualDiagramModel>;
  if (!isType(value.type)) throw new Error(`Unsupported diagram type '${String(value.type)}'`);
  return {
    ...value,
    version: 1,
    id: typeof value.id === 'string' ? value.id : id(),
    title: typeof value.title === 'string' ? value.title : '',
    elements: Array.isArray(value.elements) ? value.elements : [],
    relationships: Array.isArray(value.relationships) ? value.relationships : [],
    canvas: {
      zoom: typeof value.canvas?.zoom === 'number' ? value.canvas.zoom : 1,
      pan: {
        x: typeof value.canvas?.pan?.x === 'number' ? value.canvas.pan.x : 0,
        y: typeof value.canvas?.pan?.y === 'number' ? value.canvas.pan.y : 0,
      },
    },
  };
};
