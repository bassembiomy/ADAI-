import type { SemanticElement } from './base';

export type DiagramKind = 'bdd' | 'ibd' | 'requirements' | 'rtm' | 'parametric' | 'stateMachine';

export interface Diagram extends SemanticElement {
  metaclass: 'Diagram';
  diagramKind: DiagramKind;
  contextElementId?: string;
  presentationIds: string[];
}

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DiagramPresentation {
  id: string;
  diagramId: string;
  semanticElementId: string;
  bounds: Bounds;
  zIndex?: number;
  style?: Record<string, string | number>;
  /** Explicit list of compartment identifiers enabled for display, never raw string content */
  visibleCompartments?: string[];
  pinned?: boolean;
}
