import { describe, expect, it } from 'vitest';
import { SYSML_PROFILE, getCapability } from './profile';

describe('ADIA SysML profile', () => {
  it('declares the supported normative baseline', () => {
    expect(SYSML_PROFILE.id).toBe('OMG-SysML-1.6-ADIA');
    expect(SYSML_PROFILE.sysmlVersion).toBe('1.6');
    expect(SYSML_PROFILE.isoBaseline).toBe('ISO/IEC 19514:2017');
  });

  it.each([
    'bdd.block', 'bdd.valueType', 'bdd.partProperty', 'bdd.referenceProperty',
    'bdd.flowProperty', 'bdd.port', 'bdd.composition', 'bdd.sharedAggregation',
    'bdd.association', 'bdd.generalization', 'bdd.dependency', 'bdd.allocation',
    'ibd.partUsage', 'ibd.fullPort', 'ibd.proxyPort', 'ibd.connector',
    'ibd.itemFlow', 'ibd.bindingConnector', 'ibd.delegationConnector',
    'req.requirement', 'req.deriveReqt', 'req.satisfy', 'req.verify',
    'req.refine', 'req.trace', 'req.copy', 'rtm.matrix', 'rtm.baseline',
  ])('registers capability %s with conformance evidence', id => {
    const capability = getCapability(id);
    expect(capability?.id).toBe(id);
    expect(['supported', 'partial', 'unsupported']).toContain(capability?.status);
    expect(capability?.normativeReference).toMatch(/SysML 1\.6/);
    expect(capability?.testId).toMatch(/^SYSML-/);
  });

  it('keeps SysML v2 outside the semantic-equivalence claim', () => {
    expect(getCapability('interop.sysmlV2')?.status).toBe('unsupported');
  });
});
