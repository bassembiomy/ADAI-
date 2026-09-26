import type { SysmlRepository } from '../engine/sysml/model';

export type CanonicalPortKind = 'umlPort' | 'proxyPort' | 'fullPort' | 'flowPort';

export interface PresentationCoordinates {
  x: number;
  y: number;
  width?: number;
  height?: number;
}

export interface CreateOwnedPortIntent {
  ownerBlockId: string;
  portKind: CanonicalPortKind;
  typeId?: string;
  diagramId?: string;
  presentation?: PresentationCoordinates;
}

export interface CreateOwnedPropertyIntent {
  ownerBlockId: string;
  propertyKind: 'part' | 'reference' | 'value' | 'flow';
  typeId?: string;
  diagramId?: string;
  presentation?: PresentationCoordinates;
}

export interface CommandBuildResult {
  ok: boolean;
  diagnostics: Array<{ code: string; message: string; elementId?: string }>;
  candidates?: Array<{ id: string; name: string }>;
  action?: { kind: string; payload?: unknown };
  command?: unknown;
}

export interface CreateOwnedPortResult {
  element?: { portKind: CanonicalPortKind; id: string; name: string };
  diagnostics: Array<{ code: string; message: string }>;
}

export function createOwnedPort(_repo: SysmlRepository, _intent: CreateOwnedPortIntent): CreateOwnedPortResult {
  return {
    diagnostics: [{ code: 'NOT_YET_IMPLEMENTED', message: 'Owned feature command builder not yet implemented' }],
  };
}

export function buildCreateOwnedPortCommand(_repo: SysmlRepository, _intent: CreateOwnedPortIntent): CommandBuildResult {
  return {
    ok: false,
    diagnostics: [{ code: 'NOT_YET_IMPLEMENTED', message: 'Owned feature command builder not yet implemented' }],
  };
}

export function buildCreateOwnedPropertyCommand(_repo: SysmlRepository, _intent: CreateOwnedPropertyIntent): CommandBuildResult {
  return {
    ok: false,
    diagnostics: [{ code: 'NOT_YET_IMPLEMENTED', message: 'Owned feature command builder not yet implemented' }],
  };
}
