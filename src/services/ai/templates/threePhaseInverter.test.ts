import { describe, it, expect } from 'vitest';
import {
  THREE_PHASE_INVERTER_TEMPLATE,
  findTemplateForIntent
} from './threePhaseInverter';
import { AdiaBlockCatalog } from '../../../agent/adiaBlockCatalog';

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

  it('maps every recommended role to an actual registered block in AdiaBlockCatalog with exact port semantics', () => {
    for (const role of THREE_PHASE_INVERTER_TEMPLATE.recommendedRoles) {
      const catalogEntry = AdiaBlockCatalog.findById(role.preferredBlockId);
      expect(catalogEntry, `Block ${role.preferredBlockId} for role ${role.role} must exist in canonical catalog`).toBeDefined();
      expect(catalogEntry?.sourceLibrary).toBe('xbridges');
    }

    // Verify THREE_PHASE_INVERTER exact ports
    const inverter = AdiaBlockCatalog.findById('THREE_PHASE_INVERTER');
    expect(inverter).toBeDefined();
    const invInputIds = inverter!.ports.filter(p => p.direction === 'input').map(p => p.id);
    expect(invInputIds).toContain('vdc_p');
    expect(invInputIds).toContain('vdc_n');
    expect(invInputIds).toContain('ga');
    expect(invInputIds).toContain('gb');
    expect(invInputIds).toContain('gc');
    const invOutputIds = inverter!.ports.filter(p => p.direction === 'output').map(p => p.id);
    expect(invOutputIds).toContain('va');
    expect(invOutputIds).toContain('vb');
    expect(invOutputIds).toContain('vc');

    // Verify DC_VOLTAGE_SOURCE exact ports
    const dcSource = AdiaBlockCatalog.findById('DC_VOLTAGE_SOURCE');
    expect(dcSource).toBeDefined();
    const dcOutputIds = dcSource!.ports.filter(p => p.direction === 'output').map(p => p.id);
    expect(dcOutputIds).toContain('v_pos');
    expect(dcOutputIds).toContain('v_neg');

    // Verify THREE_PHASE_PWM exact ports
    const pwm = AdiaBlockCatalog.findById('THREE_PHASE_PWM');
    expect(pwm).toBeDefined();
    const pwmInputIds = pwm!.ports.filter(p => p.direction === 'input').map(p => p.id);
    expect(pwmInputIds).toContain('va_ref');
    expect(pwmInputIds).toContain('vb_ref');
    expect(pwmInputIds).toContain('vc_ref');
    const pwmOutputIds = pwm!.ports.filter(p => p.direction === 'output').map(p => p.id);
    expect(pwmOutputIds).toContain('ga');
    expect(pwmOutputIds).toContain('gb');
    expect(pwmOutputIds).toContain('gc');

    // Verify VOLTAGE_REFERENCE_GENERATOR exact ports
    const vRef = AdiaBlockCatalog.findById('VOLTAGE_REFERENCE_GENERATOR');
    expect(vRef).toBeDefined();
    const vRefOutputIds = vRef!.ports.filter(p => p.direction === 'output').map(p => p.id);
    expect(vRefOutputIds).toContain('va');
    expect(vRefOutputIds).toContain('vb');
    expect(vRefOutputIds).toContain('vc');

    // Verify THREE_PHASE_LOAD exact ports
    const load = AdiaBlockCatalog.findById('THREE_PHASE_LOAD');
    expect(load).toBeDefined();
    const loadInputIds = load!.ports.filter(p => p.direction === 'input').map(p => p.id);
    expect(loadInputIds).toContain('va');
    expect(loadInputIds).toContain('vb');
    expect(loadInputIds).toContain('vc');
  });
});
