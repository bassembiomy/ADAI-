import { z } from 'zod';

export const EngineeringDomainEnum = z.enum(['vlab', 'xbridges', 'sysml']);

// --- Read Tools Schemas ---

export const SearchBlocksInputSchema = z.object({
  query: z.string().min(1),
  domainFilter: z.string().optional(),
  categoryFilter: z.string().optional(),
  limit: z.number().int().positive().optional()
}).strict();

export const GetBlockDefinitionInputSchema = z.object({
  blockDefinitionId: z.string().min(1)
}).strict();

export const InspectModelInputSchema = z.object({
  projectId: z.string().min(1),
  domain: EngineeringDomainEnum.optional()
}).strict();

export const GetModelSummaryInputSchema = z.object({
  projectId: z.string().min(1)
}).strict();

export const ReadDiagnosticsInputSchema = z.object({
  projectId: z.string().min(1)
}).strict();

// --- Mutation Intents Schemas ---

export const BaseMutationInputSchema = z.object({
  projectId: z.string().min(1),
  projectRevision: z.number().int().nonnegative(),
  approvalToken: z.string().min(1)
});

export const CreateModelInputSchema = BaseMutationInputSchema.extend({
  domain: EngineeringDomainEnum,
  modelName: z.string().min(1),
  description: z.string().optional()
}).strict();

export const AddBlockInputSchema = BaseMutationInputSchema.extend({
  blockId: z.string().min(1),
  blockDefinitionId: z.string().min(1),
  name: z.string().min(1),
  domain: EngineeringDomainEnum,
  parameters: z.record(z.string(), z.unknown()).optional(),
  position: z.object({ x: z.number(), y: z.number() }).optional()
}).strict();

export const RemoveBlockInputSchema = BaseMutationInputSchema.extend({
  blockId: z.string().min(1),
  domain: EngineeringDomainEnum.optional()
}).strict();

export const MoveBlockInputSchema = BaseMutationInputSchema.extend({
  blockId: z.string().min(1),
  position: z.object({ x: z.number(), y: z.number() })
}).strict();

export const RenameBlockInputSchema = BaseMutationInputSchema.extend({
  blockId: z.string().min(1),
  newName: z.string().min(1)
}).strict();

export const SetParameterInputSchema = BaseMutationInputSchema.extend({
  blockId: z.string().min(1),
  parameterName: z.string().min(1),
  value: z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.array(z.unknown()),
    z.record(z.string(), z.unknown())
  ]),
  unit: z.string().optional()
}).strict();

export const ConnectPortsInputSchema = BaseMutationInputSchema.extend({
  connectionId: z.string().min(1),
  fromBlockId: z.string().min(1),
  fromPortId: z.string().min(1),
  toBlockId: z.string().min(1),
  toPortId: z.string().min(1),
  domain: EngineeringDomainEnum
}).strict();

export const DisconnectPortsInputSchema = BaseMutationInputSchema.extend({
  connectionId: z.string().min(1)
}).strict();

export const ValidateModelInputSchema = z.object({
  projectId: z.string().min(1),
  projectRevision: z.number().int().nonnegative().optional(),
  domain: EngineeringDomainEnum
}).strict();

export const SimulateModelInputSchema = BaseMutationInputSchema.extend({
  domain: EngineeringDomainEnum,
  stopTime: z.number().positive().optional(),
  solver: z.string().optional()
}).strict();

export const UndoTransactionInputSchema = BaseMutationInputSchema.extend({
  transactionId: z.string().min(1)
}).strict();

export type SearchBlocksInput = z.infer<typeof SearchBlocksInputSchema>;
export type GetBlockDefinitionInput = z.infer<typeof GetBlockDefinitionInputSchema>;
export type InspectModelInput = z.infer<typeof InspectModelInputSchema>;
export type GetModelSummaryInput = z.infer<typeof GetModelSummaryInputSchema>;
export type ReadDiagnosticsInput = z.infer<typeof ReadDiagnosticsInputSchema>;

export type CreateModelInput = z.infer<typeof CreateModelInputSchema>;
export type AddBlockInput = z.infer<typeof AddBlockInputSchema>;
export type RemoveBlockInput = z.infer<typeof RemoveBlockInputSchema>;
export type MoveBlockInput = z.infer<typeof MoveBlockInputSchema>;
export type RenameBlockInput = z.infer<typeof RenameBlockInputSchema>;
export type SetParameterInput = z.infer<typeof SetParameterInputSchema>;
export type ConnectPortsInput = z.infer<typeof ConnectPortsInputSchema>;
export type DisconnectPortsInput = z.infer<typeof DisconnectPortsInputSchema>;
export type ValidateModelInput = z.infer<typeof ValidateModelInputSchema>;
export type SimulateModelInput = z.infer<typeof SimulateModelInputSchema>;
export type UndoTransactionInput = z.infer<typeof UndoTransactionInputSchema>;
