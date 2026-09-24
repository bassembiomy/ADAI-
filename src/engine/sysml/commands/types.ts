import type {
  SemanticElement,
  SemanticRelationship,
  SysmlRepositoryV4,
  DiagramPresentation,
} from '../domain';

export type CommandCallerSource = 'ui' | 'ai' | 'import' | 'migration' | 'script';

export interface CommandContext {
  source: CommandCallerSource;
  actor?: string;
  timestamp?: number;
}

export interface AuditRecord {
  command: string;
  source: CommandCallerSource;
  actor?: string;
  timestamp: number;
  details?: Record<string, unknown>;
}

export interface CreateElementCommand {
  type: 'CreateElement';
  element: SemanticElement;
}

export interface UpdateElementCommand {
  type: 'UpdateElement';
  elementId: string;
  patch: Partial<SemanticElement>;
}

export interface RenameElementCommand {
  type: 'RenameElement';
  elementId: string;
  newName: string;
}

export interface MoveElementCommand {
  type: 'MoveElement';
  elementId: string;
  newOwnerId: string | null;
}

export interface DeleteElementCommand {
  type: 'DeleteElement';
  elementId: string;
}

export interface CreateRelationshipCommand {
  type: 'CreateRelationship';
  relationship: SemanticRelationship;
}

export interface UpdateRelationshipCommand {
  type: 'UpdateRelationship';
  relationshipId: string;
  patch: Partial<SemanticRelationship>;
}

export interface DeleteRelationshipCommand {
  type: 'DeleteRelationship';
  relationshipId: string;
}

export interface DisplayExistingElementCommand {
  type: 'DisplayExistingElement';
  presentation: DiagramPresentation;
}

export interface RemovePresentationCommand {
  type: 'RemovePresentation';
  presentationId: string;
}

export interface MovePresentationCommand {
  type: 'MovePresentation';
  presentationId: string;
  x: number;
  y: number;
}

export interface ResizePresentationCommand {
  type: 'ResizePresentation';
  presentationId: string;
  width: number;
  height: number;
}

export type SysmlCommand =
  | CreateElementCommand
  | UpdateElementCommand
  | RenameElementCommand
  | MoveElementCommand
  | DeleteElementCommand
  | CreateRelationshipCommand
  | UpdateRelationshipCommand
  | DeleteRelationshipCommand
  | DisplayExistingElementCommand
  | RemovePresentationCommand
  | MovePresentationCommand
  | ResizePresentationCommand;

export interface CommandResult {
  success: boolean;
  code?: string;
  message?: string;
  revision: number;
  state: SysmlRepositoryV4;
  auditRecord?: AuditRecord;
  diagnostics?: string[];
  affectedIds?: string[];
}
