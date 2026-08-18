import { z } from 'zod';

export enum RiskClass {
  READ_ONLY = 'READ_ONLY',
  REVERSIBLE_MUTATION = 'REVERSIBLE_MUTATION',
  DESTRUCTIVE_MUTATION = 'DESTRUCTIVE_MUTATION',
  EXTERNAL_FILE_EXPORT = 'EXTERNAL_FILE_EXPORT',
  CODE_COMPILATION = 'CODE_COMPILATION',
  HARDWARE_COMMUNICATION = 'HARDWARE_COMMUNICATION',
  HARDWARE_ACTUATION = 'HARDWARE_ACTUATION'
}

export enum RollbackLevel {
  NONE = 'NONE',
  INVERSE_ACTION = 'INVERSE_ACTION',
  SNAPSHOT_RESTORE = 'SNAPSHOT_RESTORE',
  COMPENSATING_RESET = 'COMPENSATING_RESET'
}

export enum SideEffectClass {
  READ_ONLY = 'READ_ONLY',
  DOMAIN_STATE = 'DOMAIN_STATE',
  LOCAL_FILESYSTEM = 'LOCAL_FILESYSTEM',
  COMMUNICATION_PORT = 'COMMUNICATION_PORT',
  PHYSICAL_HARDWARE = 'PHYSICAL_HARDWARE'
}

export interface ResourceAccessDeclaration {
  readonly readSets: string[];
  readonly writeSets: string[];
}

export interface EntityLifecycleDeclaration {
  readonly creates?: (payload: any) => string[];
  readonly reads?: (payload: any) => string[];
  readonly updates?: (payload: any) => string[];
  readonly deletes?: (payload: any) => string[];
}

export interface ActionCapability<TPayload = unknown> {
  readonly actionType: string;
  readonly schemaVersion: string;
  readonly module: string;
  readonly riskClass: RiskClass;
  readonly rollbackLevel: RollbackLevel;
  readonly sideEffectClass: SideEffectClass;
  readonly payloadSchema: z.ZodType<TPayload>;
  readonly requiredPermissions: string[];
  readonly supportsDryRun: boolean;
  readonly requiresCommitBarrier: boolean;
  readonly resourceAccess: ResourceAccessDeclaration;
  readonly entityLifecycle?: EntityLifecycleDeclaration;
}
