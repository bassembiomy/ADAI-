import { z } from 'zod';

export type XbridgesIntent = 'create' | 'inspect' | 'modify' | 'diagnose' | 'repair' | 'optimize';

export interface RequirementValue {
  name: string;
  value: number | string | boolean | number[];
  unit?: string;
  description?: string;
  sourceText?: string;
}

export interface RequirementConstraint {
  name: string;
  type: 'max' | 'min' | 'range' | 'equality' | 'stability' | 'safety';
  target: string;
  value: number | [number, number] | string;
  unit?: string;
  isHard?: boolean;
}

export interface OptimizationRequest {
  objective: string;
  targetMetric: string;
  direction: 'minimize' | 'maximize';
  parametersToTune: Array<{
    blockId: string;
    parameterName: string;
    min: number;
    max: number;
    step?: number;
  }>;
  maxEvaluations?: number;
  constraints?: RequirementConstraint[];
}

export interface GeneralEngineeringRequest {
  intent: XbridgesIntent;
  objective: string;
  targetBehaviors: string[];
  inputs: RequirementValue[];
  outputs: RequirementValue[];
  constraints: RequirementConstraint[];
  optimization?: OptimizationRequest;
  rawPrompt?: string;
  operands?: Array<{ value: number; unit?: string; baseUnit?: string; raw?: string }>;
  sourceMetadata?: Record<string, unknown>;
  entities?: Record<string, unknown>;
  explicitIntent?: string;
}

export function normalizeEngineeringUnits(unit: string): string {
  if (!unit || typeof unit !== 'string') return '';
  const trimmed = unit.trim();
  const lower = trimmed.toLowerCase();

  const UNIT_MAP: Record<string, string> = {
    khz: 'kHz',
    mhz: 'MHz',
    hz: 'Hz',
    volts: 'V',
    volt: 'V',
    vdc: 'V',
    vac: 'V',
    v: 'V',
    amps: 'A',
    amp: 'A',
    amperes: 'A',
    ampere: 'A',
    a: 'A',
    watts: 'W',
    watt: 'W',
    w: 'W',
    kw: 'kW',
    rpm: 'rpm',
    'rad/s': 'rad/s',
    degc: '°C',
    celsius: '°C',
    c: '°C',
    ohms: 'Ω',
    ohm: 'Ω',
    henries: 'H',
    henry: 'H',
    h: 'H',
    farads: 'F',
    farad: 'F',
    f: 'F',
    s: 's',
    sec: 's',
    seconds: 's',
    ms: 'ms',
    us: 'µs',
    percent: '%',
    '%': '%',
  };

  return UNIT_MAP[lower] || trimmed;
}

const RequirementValueSchema = z.object({
  name: z.string().min(1),
  value: z.union([z.number(), z.string(), z.boolean(), z.array(z.number())]),
  unit: z.string().optional(),
  description: z.string().optional(),
  sourceText: z.string().optional(),
});

const RequirementConstraintSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['max', 'min', 'range', 'equality', 'stability', 'safety']),
  target: z.string().min(1),
  value: z.union([z.number(), z.tuple([z.number(), z.number()]), z.string()]),
  unit: z.string().optional(),
  isHard: z.boolean().optional(),
});

const OptimizationRequestSchema = z.object({
  objective: z.string().min(1),
  targetMetric: z.string().min(1),
  direction: z.enum(['minimize', 'maximize']),
  parametersToTune: z.array(
    z.object({
      blockId: z.string().min(1),
      parameterName: z.string().min(1),
      min: z.number(),
      max: z.number(),
      step: z.number().optional(),
    })
  ),
  maxEvaluations: z.number().optional(),
  constraints: z.array(RequirementConstraintSchema).optional(),
});

export const GeneralEngineeringRequestSchema = z.object({
  intent: z.enum(['create', 'inspect', 'modify', 'diagnose', 'repair', 'optimize']),
  objective: z.string().min(1),
  targetBehaviors: z.array(z.string()).default([]),
  inputs: z.array(RequirementValueSchema).default([]),
  outputs: z.array(RequirementValueSchema).default([]),
  constraints: z.array(RequirementConstraintSchema).default([]),
  optimization: OptimizationRequestSchema.optional(),
  rawPrompt: z.string().optional(),
  operands: z.array(z.object({
    value: z.number(),
    unit: z.string().optional(),
    baseUnit: z.string().optional(),
    raw: z.string().optional(),
  })).optional(),
  sourceMetadata: z.record(z.string(), z.unknown()).optional(),
  entities: z.record(z.string(), z.unknown()).optional(),
  explicitIntent: z.string().optional(),
});

export type ParseResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

export function parseGeneralEngineeringRequest(input: unknown): ParseResult<GeneralEngineeringRequest> {
  if (input === null || typeof input !== 'object') {
    return { success: false, error: 'Expected JSON object for engineering request' };
  }

  const result = GeneralEngineeringRequestSchema.safeParse(input);
  if (!result.success) {
    const issues = result.error?.issues || (result.error as any)?.errors || [];
    const error = issues.length > 0
      ? issues.map((e: any) => `${e.path.join('.')}: ${e.message}`).join('; ')
      : result.error?.message || 'Invalid engineering request schema';
    return {
      success: false,
      error,
    };
  }

  const req = result.data;
  const normalizedInputs = req.inputs.map(inp => ({
    ...inp,
    unit: inp.unit ? normalizeEngineeringUnits(inp.unit) : undefined,
  }));
  const normalizedOutputs = req.outputs.map(out => ({
    ...out,
    unit: out.unit ? normalizeEngineeringUnits(out.unit) : undefined,
  }));
  const normalizedConstraints = req.constraints.map(c => ({
    ...c,
    unit: c.unit ? normalizeEngineeringUnits(c.unit) : undefined,
  }));

  return {
    success: true,
    data: {
      ...req,
      inputs: normalizedInputs,
      outputs: normalizedOutputs,
      constraints: normalizedConstraints,
    },
  };
}
