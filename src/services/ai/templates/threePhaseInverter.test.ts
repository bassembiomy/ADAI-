import { describe, it, expect } from 'vitest';
import {
  THREE_PHASE_INVERTER_TEMPLATE,
  findTemplateForIntent
} from './threePhaseInverter';

describe('Three-Phase Inverter Engineering Template', () => {
  it('defines structured requirements, critical questions, assumptions, and validation criteria', () => {
    expect(THREE_PHASE_INVERTER_TEMPLATE.id).toBe('three_phase_inverter');
    expect(THREE_PHASE_INVERTER_TEMPLATE.targetDomain).toBe('xbridges');
    expect(THREE_PHASE_INVERTER_TEMPLATE.requiredQuestions.length).toBeGreaterThan(0);
    
    // Critical questions check
    const criticalQuestions = THREE_PHASE_INVERTER_TEMPLATE.requiredQuestions.filter(q => q.isCritical);
    expect(criticalQuestions.length).toBeGreaterThanOrEqual(2);
    expect(criticalQuestions.some(q => q.key === 'dcBusVoltage')).toBe(true);
    expect(criticalQuestions.some(q => q.key === 'switchingFrequency')).toBe(true);

    // Recommended roles check
    expect(THREE_PHASE_INVERTER_TEMPLATE.recommendedRoles.length).toBeGreaterThanOrEqual(3);
    expect(THREE_PHASE_INVERTER_TEMPLATE.recommendedRoles.some(r => r.preferredBlockId === 'THREE_PHASE_INVERTER')).toBe(true);

    // Validation criteria check
    expect(THREE_PHASE_INVERTER_TEMPLATE.validationCriteria.length).toBeGreaterThan(0);
    expect(THREE_PHASE_INVERTER_TEMPLATE.validationCriteria.some(c => c.metric === 'THD')).toBe(true);
  });

  it('routes three-phase inverter requests to the inverter template', () => {
    const matched = findTemplateForIntent('I need a three-phase inverter model with 400V DC bus');
    expect(matched).toBeDefined();
    expect(matched?.id).toBe('three_phase_inverter');

    const matchedAlt = findTemplateForIntent('create a 3-phase inverter');
    expect(matchedAlt?.id).toBe('three_phase_inverter');
  });

  it('retains non-critical parameters as reviewable assumptions', () => {
    expect(THREE_PHASE_INVERTER_TEMPLATE.defaultAssumptions.length).toBeGreaterThan(0);
    expect(THREE_PHASE_INVERTER_TEMPLATE.defaultAssumptions.some(a => a.key === 'modulationIndex')).toBe(true);
  });
});
