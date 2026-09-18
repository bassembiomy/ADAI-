import { describe, it, expect } from 'vitest';
import {
  EngineeringModelPlanSchema,
  LogicalBlockSchema,
  LogicalConnectionSchema,
  ParameterIntentSchema,
  ValidationCriterionSchema,
  EngineeringModelPlan,
  validateEngineeringModelPlan
} from './engineeringModel';

describe('EngineeringModel contracts and schemas', () => {
  const validPlan: EngineeringModelPlan = {
    schemaVersion: '1.0.0',
    planId: 'plan_inverter_001',
    projectId: 'proj_power_01',
    baseRevision: 1,
    targetDomain: 'xbridges',
    designRationale: 'Three-phase DC to AC inverter design using PWM control and LC filter',
    assumptions: ['400V DC bus voltage', '50Hz AC target frequency'],
    blocks: [
      {
        id: 'dc_source',
        blockDefinitionId: 'DC_VOLTAGE_SOURCE',
        domain: 'xbridges',
        name: 'DC Source',
        parameters: [
          {
            blockId: 'dc_source',
            parameterName: 'voltage',
            value: 400,
            unit: 'V'
          }
        ]
      },
      {
        id: 'inverter_bridge',
        blockDefinitionId: 'THREE_PHASE_INVERTER_BRIDGE',
        domain: 'xbridges',
        name: 'Inverter Bridge',
        parameters: [
          {
            blockId: 'inverter_bridge',
            parameterName: 'switchingFrequency',
            value: 10000,
            unit: 'Hz'
          }
        ]
      }
    ],
    connections: [
      {
        id: 'conn_dc_to_inv',
        fromBlockId: 'dc_source',
        fromPortId: 'positive_out',
        toBlockId: 'inverter_bridge',
        toPortId: 'dc_positive_in',
        domain: 'xbridges'
      }
    ],
    validationCriteria: [
      {
        id: 'crit_thd',
        description: 'Total Harmonic Distortion under 5%',
        metric: 'THD',
        operator: '<=',
        targetValue: 0.05,
        unit: 'ratio'
      }
    ]
  };

  it('should parse a valid EngineeringModelPlan', () => {
    const parsed = EngineeringModelPlanSchema.parse(validPlan);
    expect(parsed.planId).toBe('plan_inverter_001');
    expect(parsed.targetDomain).toBe('xbridges');
    expect(parsed.blocks).toHaveLength(2);
    expect(parsed.connections).toHaveLength(1);
    expect(parsed.validationCriteria).toHaveLength(1);
  });

  it('should reject unknown fields (strict schema)', () => {
    const invalidPlan = {
      ...validPlan,
      unknownField: 'malformed'
    };
    expect(() => EngineeringModelPlanSchema.parse(invalidPlan)).toThrow();
  });

  it('should reject negative base revision', () => {
    const invalidPlan = {
      ...validPlan,
      baseRevision: -1
    };
    expect(() => EngineeringModelPlanSchema.parse(invalidPlan)).toThrow();
  });

  it('should reject duplicate block IDs', () => {
    const planWithDuplicateBlocks = {
      ...validPlan,
      blocks: [
        validPlan.blocks[0],
        { ...validPlan.blocks[0], name: 'Second Block with same ID' }
      ]
    };
    const result = validateEngineeringModelPlan(planWithDuplicateBlocks);
    expect(result.isValid).toBe(false);
    expect(result.diagnostics.some(d => d.code === 'DUPLICATE_BLOCK_ID')).toBe(true);
  });

  it('should reject duplicate connection IDs', () => {
    const planWithDuplicateConns = {
      ...validPlan,
      connections: [
        validPlan.connections[0],
        { ...validPlan.connections[0] }
      ]
    };
    const result = validateEngineeringModelPlan(planWithDuplicateConns);
    expect(result.isValid).toBe(false);
    expect(result.diagnostics.some(d => d.code === 'DUPLICATE_CONNECTION_ID')).toBe(true);
  });

  it('should reject connections to nonexistent blocks', () => {
    const planWithGhostBlock = {
      ...validPlan,
      connections: [
        {
          id: 'conn_ghost',
          fromBlockId: 'dc_source',
          fromPortId: 'positive_out',
          toBlockId: 'nonexistent_block',
          toPortId: 'in',
          domain: 'xbridges' as const
        }
      ]
    };
    const result = validateEngineeringModelPlan(planWithGhostBlock);
    expect(result.isValid).toBe(false);
    expect(result.diagnostics.some(d => d.code === 'UNKNOWN_CONNECTION_ENDPOINT')).toBe(true);
  });

  it('should reject self-connections on the same block and port', () => {
    const planWithSelfConn = {
      ...validPlan,
      connections: [
        {
          id: 'conn_self',
          fromBlockId: 'dc_source',
          fromPortId: 'positive_out',
          toBlockId: 'dc_source',
          toPortId: 'positive_out',
          domain: 'xbridges' as const
        }
      ]
    };
    const result = validateEngineeringModelPlan(planWithSelfConn);
    expect(result.isValid).toBe(false);
    expect(result.diagnostics.some(d => d.code === 'SELF_CONNECTION')).toBe(true);
  });

  it('should reject cross-domain connections without a bridge', () => {
    const crossDomainPlan = {
      ...validPlan,
      blocks: [
        validPlan.blocks[0], // xbridges
        {
          id: 'sysml_block',
          blockDefinitionId: 'SYSML_BLOCK',
          domain: 'sysml' as const,
          name: 'SysML Requirement',
          parameters: []
        }
      ],
      connections: [
        {
          id: 'cross_conn',
          fromBlockId: 'dc_source',
          fromPortId: 'positive_out',
          toBlockId: 'sysml_block',
          toPortId: 'in',
          domain: 'xbridges' as const
        }
      ]
    };
    const result = validateEngineeringModelPlan(crossDomainPlan);
    expect(result.isValid).toBe(false);
    expect(result.diagnostics.some(d => d.code === 'UNBRIDGED_CROSS_DOMAIN_CONNECTION')).toBe(true);
  });
});

describe('ToolResult discriminated union contracts', () => {
  it('should support discriminated tool result status and shapes', async () => {
    const { createSuccessToolResult, createFailureToolResult, createRequiresApprovalToolResult } = await import('./toolResults');
    
    const successRes = createSuccessToolResult('search_blocks', { matches: [] }, 5, 'Found 0 blocks');
    expect(successRes.status).toBe('SUCCESS');
    expect(successRes.toolName).toBe('search_blocks');
    expect(successRes.data).toBeDefined();

    const failureRes = createFailureToolResult('add_block', 'Block definition not found', [
      {
        category: 'TOPOLOGY',
        code: 'UNKNOWN_BLOCK_DEFINITION',
        severity: 'ERROR',
        message: 'Block definition not found'
      }
    ], 5);
    expect(failureRes.status).toBe('FAILURE');
    expect(failureRes.error).toBe('Block definition not found');
    expect(failureRes.diagnostics).toHaveLength(1);

    const approvalRes = createRequiresApprovalToolResult('create_model', 'token_123', 'Requires user approval', 5);
    expect(approvalRes.status).toBe('REQUIRES_APPROVAL');
    expect(approvalRes.approvalToken).toBe('token_123');
  });
});

