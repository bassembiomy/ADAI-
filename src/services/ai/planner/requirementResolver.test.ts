import { describe, it, expect } from 'vitest';
import {
  resolveRequirements,
  type GeneralEngineeringRequest,
  type RequirementResolution,
} from './requirementResolver';
import { buildXbridgesCapabilityIndex } from '../catalog/xbridgesCapabilityIndex';

describe('requirementResolver (Deterministic Capability-Derived Requirements)', () => {
  const catalog = buildXbridgesCapabilityIndex();

  it('asks filter-specific questions instead of DC bus and load requirements', () => {
    const resolution = resolveRequirements({
      intent: 'create',
      objective: 'Create a low pass filter for sensor noise',
      targetBehaviors: [],
      inputs: [],
      outputs: [],
      constraints: [],
    }, catalog);

    expect(resolution.nextQuestion?.key).toBe('input_signal');
    expect(resolution.nextQuestion?.question).toMatch(/input signal/i);
    expect(resolution.unresolvedKeys).toEqual([
      'input_signal',
      'cutoff_frequency',
      'filter_order',
      'output_signal'
    ]);
    expect(resolution.unresolvedKeys).not.toContain('source_voltage');
    expect(resolution.unresolvedKeys).not.toContain('load_specification');
  });

  it('asks for both arithmetic values before completing a two-number model request', () => {
    const resolution = resolveRequirements({
      intent: 'create',
      objective: 'Create a model adding two numbers',
      targetBehaviors: [],
      inputs: [],
      outputs: [{ name: 'output_signal', value: 'Display output on Scope' }],
      constraints: [],
    }, catalog);

    expect(resolution.complete).toBe(false);
    expect(resolution.nextQuestion?.key).toBe('arithmetic_operands');
    expect(resolution.nextQuestion?.question).toMatch(/two.*number|operand/i);
    expect(resolution.unresolvedKeys).toContain('arithmetic_operands');
  });

  it('consumes an arithmetic_operands answer from task state instead of repeating the question', () => {
    const resolution = resolveRequirements({
      id: 'task-1',
      status: 'clarifying',
      createdAt: '2026-09-21T00:00:00.000Z',
      updatedAt: '2026-09-21T00:00:00.000Z',
      requirementState: {
        id: 'req-1',
        objective: 'Create a model adding two numbers',
        targetSystem: '',
        inputs: { arithmetic_operands: '10 and 20' },
        constraints: [],
        assumptions: [],
        requiredOutputs: ['Display output on Scope'],
        successCriteria: [],
        openQuestions: [],
        answers: { arithmetic_operands: '10 and 20' },
        completenessScore: 0,
        conflicts: [],
      },
      events: [],
      approvals: [],
      pendingActions: [],
      auditHistory: [],
    }, catalog);

    expect(resolution.unresolvedKeys).not.toContain('arithmetic_operands');
    expect(resolution.nextQuestion?.key).not.toBe('arithmetic_operands');
  });

  it('identifies missing operating points, source, and load for creation intent', () => {
    const rawReq: GeneralEngineeringRequest = {
      intent: 'create',
      objective: 'Three-phase motor drive inverter',
      targetBehaviors: ['convert DC to 3-phase AC'],
      inputs: [], // missing source / DC bus voltage!
      outputs: [], // missing load / AC output!
      constraints: [],
    };

    const resolution = resolveRequirements(rawReq, catalog);
    expect(resolution.complete).toBe(false);
    expect(resolution.unresolvedKeys.length).toBeGreaterThan(0);
    expect(resolution.unresolvedKeys).toContain('source_voltage');
    expect(resolution.unresolvedKeys).toContain('load_specification');
    expect(resolution.nextQuestion).toBeDefined();
    expect(resolution.canonicalRequest).toBeUndefined(); // Plan cannot proceed with unresolved keys
  });

  it('orders clarification questions deterministically by safety priority, dependency, and stable key', () => {
    const rawReq: GeneralEngineeringRequest = {
      intent: 'create',
      objective: 'High power converter',
      targetBehaviors: ['power conversion'],
      inputs: [],
      outputs: [],
      constraints: [],
    };

    const res1 = resolveRequirements(rawReq, catalog);
    expect(res1.nextQuestion).toBeDefined();
    // Safety and source dependency must be asked before secondary load details
    expect(res1.nextQuestion?.key).toBe('source_voltage');

    // Run again with identical input to verify determinism
    const res2 = resolveRequirements(rawReq, catalog);
    expect(res2.nextQuestion?.key).toBe(res1.nextQuestion?.key);
    expect(res2.unresolvedKeys).toEqual(res1.unresolvedKeys);
  });

  it('detects conflicting requirements and conflicting units, rejecting with REQUIREMENT_CONFLICT', () => {
    const conflictedReq: GeneralEngineeringRequest = {
      intent: 'create',
      objective: 'Power supply',
      targetBehaviors: ['voltage regulation'],
      inputs: [
        { name: 'V_in', value: 48, unit: 'V' },
        { name: 'V_in_alt', value: 12, unit: 'V' }, // conflict on input voltage!
      ],
      outputs: [{ name: 'V_out', value: 24, unit: 'V' }],
      constraints: [
        { name: 'v_limit_max', type: 'max', target: 'V_out', value: 20, unit: 'V' }, // target 24 exceeds max limit 20!
      ],
    };

    const resolution = resolveRequirements(conflictedReq, catalog);
    expect(resolution.complete).toBe(false);
    expect(resolution.conflicts).toBeDefined();
    expect(resolution.conflicts!.length).toBeGreaterThan(0);
    expect(resolution.conflicts![0].code).toBe('REQUIREMENT_CONFLICT');
  });

  it('enforces optimization bounds when intent is optimize', () => {
    const optReqWithoutBounds: GeneralEngineeringRequest = {
      intent: 'optimize',
      objective: 'Tune PID controller to minimize overshoot',
      targetBehaviors: ['minimize overshoot'],
      inputs: [],
      outputs: [],
      constraints: [],
      optimization: {
        objective: 'minimize_overshoot',
        targetMetric: 'overshoot_pct',
        direction: 'minimize',
        parametersToTune: [
          { blockId: 'pid_1', parameterName: 'Kp', min: 0, max: 0 }, // invalid: min === max, missing bounds!
        ],
      },
    };

    const resolution = resolveRequirements(optReqWithoutBounds, catalog);
    expect(resolution.complete).toBe(false);
    expect(resolution.unresolvedKeys).toContain('optimization_bounds_pid_1_Kp');
    expect(resolution.nextQuestion?.key).toContain('optimization_bounds');
  });

  it('marks complete and produces canonicalRequest only when all required parameters are resolved', () => {
    const completeReq: GeneralEngineeringRequest = {
      intent: 'create',
      objective: 'Three-phase motor drive inverter',
      targetBehaviors: ['convert DC to 3-phase AC'],
      inputs: [{ name: 'source_voltage', value: 400, unit: 'V' }],
      outputs: [
        { name: 'load_specification', value: 'RL_LOAD', unit: 'load' },
        { name: 'target_frequency', value: 50, unit: 'Hz' },
      ],
      constraints: [
        { name: 'max_switching_freq', type: 'max', target: 'f_sw', value: 20000, unit: 'Hz' },
      ],
    };

    const resolution = resolveRequirements(completeReq, catalog);
    expect(resolution.complete).toBe(true);
    expect(resolution.unresolvedKeys).toHaveLength(0);
    expect(resolution.nextQuestion).toBeUndefined();
    expect(resolution.canonicalRequest).toBeDefined();
    expect(resolution.canonicalRequest?.intent).toBe('create');
  });

  it('does NOT ask for DC bus voltage or motor load for 2nd-order dynamic/RLC requests', () => {
    const rlcReq: GeneralEngineeringRequest = {
      intent: 'create',
      objective: 'Create RLC circuit transfer function',
      targetBehaviors: ['second_order_dynamic'],
      inputs: [],
      outputs: [],
      constraints: [],
    };

    const resolution = resolveRequirements(rlcReq, catalog);
    expect(resolution.complete).toBe(false);
    expect(resolution.unresolvedKeys).not.toContain('source_voltage');
    expect(resolution.unresolvedKeys).not.toContain('load_specification');
    expect(resolution.unresolvedKeys).toContain('component_values');
    expect(resolution.nextQuestion?.key).toBe('component_values');
    expect(resolution.nextQuestion?.question).toMatch(/resistance|inductance|capacitance/i);
  });

  it('automatically resolves 2nd-order dynamic parameters when provided inline in prompt', () => {
    const rlcWithParams: GeneralEngineeringRequest = {
      intent: 'create',
      objective: 'Create RLC circuit with R=100, L=10mH, C=100uF',
      targetBehaviors: ['second_order_dynamic'],
      inputs: [
        { name: 'resistance', value: 100 },
        { name: 'inductance', value: 0.01 },
        { name: 'capacitance', value: 0.0001 },
      ],
      outputs: [{ name: 'output_signal', value: 'Scope' }],
      constraints: [],
    };

    const resolution = resolveRequirements(rlcWithParams, catalog);
    expect(resolution.complete).toBe(true);
    expect(resolution.unresolvedKeys).toHaveLength(0);
    expect(resolution.nextQuestion).toBeUndefined();
  });
});
