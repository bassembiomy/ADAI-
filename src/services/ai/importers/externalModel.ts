import { z } from 'zod';

export const ExternalPortSchema = z.object({
  id: z.string().min(1),
  name: z.string().optional(),
  direction: z.enum(['in', 'out', 'bidirectional'])
}).strict();

export type ExternalPort = z.infer<typeof ExternalPortSchema>;

export const ExternalComponentSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  externalType: z.string().min(1),
  sourceLocation: z.string().optional(),
  parameters: z.record(z.string(), z.unknown()),
  ports: z.array(ExternalPortSchema)
}).strict();

export type ExternalComponent = z.infer<typeof ExternalComponentSchema>;

export const ExternalLinkSchema = z.object({
  id: z.string().min(1),
  name: z.string().optional(),
  sourceComponentId: z.string().min(1),
  sourcePortId: z.string().min(1),
  targetComponentId: z.string().min(1),
  targetPortId: z.string().min(1)
}).strict();

export type ExternalLink = z.infer<typeof ExternalLinkSchema>;

export const ExternalModelProvenanceSchema = z.object({
  source: z.string().min(1),
  author: z.string().min(1),
  license: z.string().min(1),
  checksum: z.string().optional()
}).strict();

export type ExternalModelProvenance = z.infer<typeof ExternalModelProvenanceSchema>;

export const ExternalModelSchema = z.object({
  name: z.string().min(1),
  sourceFormat: z.enum(['simulink', 'scilab']),
  provenance: ExternalModelProvenanceSchema,
  components: z.array(ExternalComponentSchema),
  links: z.array(ExternalLinkSchema),
  solverSettings: z.record(z.string(), z.unknown()).optional(),
  unsupportedConstructs: z.array(z.string())
}).strict();

export type ExternalModel = z.infer<typeof ExternalModelSchema>;
